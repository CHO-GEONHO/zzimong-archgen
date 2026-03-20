import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Connection, Edge, Node } from 'reactflow'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  updateEdge,
  ConnectionMode,
  ConnectionLineType,
} from 'reactflow'
import toast from 'react-hot-toast'
import type { ArchIR } from '../App'
import { irToFlow, flowToIR, LINE_STYLES_DARK, LINE_STYLES_LIGHT, LABEL_STYLES, resolveIconUrl } from '../utils/irToFlow'
import type { DiagramTheme } from '../utils/irToFlow'
import InfraNode from './nodes/InfraNode'
import GroupNode from './nodes/GroupNode'
import SequenceActorNode from './nodes/SequenceActorNode'
import SequenceMessageNode from './nodes/SequenceMessageNode'
import FlowNode from './nodes/FlowNode'
import ArrowEdge, { EdgeDataUpdateCtx, EdgeRerouteCtx } from './edges/ArrowEdge'

interface Props {
  ir: ArchIR | null
  onIrChange: (ir: ArchIR) => void
  diagramId: string | null
  onSearchIcon?: (nodeId: string, nodeType: string, label: string) => void
  theme: DiagramTheme
  onToggleTheme: () => void
}

const API_BASE = ''

const ARROW_OPTIONS = [
  { value: 'forward',  label: '→',  title: '정방향' },
  { value: 'backward', label: '←',  title: '역방향' },
  { value: 'both',     label: '↔',  title: '양방향' },
  { value: 'none',     label: '─',  title: '화살표 없음' },
]

const LINE_TYPE_OPTIONS = [
  { value: 'general', label: '일반',   color: '#94a3b8' },
  { value: 'data',    label: '데이터', color: '#a78bfa' },
  { value: 'alert',   label: '경고',   color: '#f87171' },
  { value: 'blue',    label: '파랑',   color: '#60a5fa' },
  { value: 'lb',      label: 'LB',     color: '#94a3b8' },
  { value: 'vpc',     label: 'VPC',    color: '#cbd5e1' },
]

const ROUTING_OPTIONS = [
  { value: 'auto',     label: '자동',  title: '방향에 따라 자동 선택' },
  { value: 'bezier',   label: '곡선',  title: '베지어 곡선' },
  { value: 'straight', label: '직선',  title: '직선' },
  { value: 'polyline', label: '꺾임',  title: '중간점 직접 편집' },
]

export default function DiagramEditor({ ir, onIrChange, diagramId, onSearchIcon, theme, onToggleTheme }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [iconOnly, setIconOnly] = useState(false)
  const [showFlowIcons, setShowFlowIcons] = useState(true)
  const { getNodes, getEdges, fitView, addNodes, getViewport } = useReactFlow()
  // flow→IR 동기화 후 useEffect가 다시 irToFlow를 호출하지 않도록 참조 비교
  // (boolean 플래그와 달리 StrictMode에서 effect가 2번 실행되어도 안전)
  const lastSyncedIrRef = useRef<ArchIR | null>(null)
  // ir을 ref로도 추적 — 콜백 내부에서 클로저 의존성 없이 최신값 접근
  const irRef = useRef(ir)
  irRef.current = ir
  // React Flow의 edge.selected를 직접 사용 (onEdgeClick 대신)
  const selectedEdge = edges.find(e => e.selected) ?? null

  // 노드 라벨/서브라벨 인라인 편집 콜백
  // flowToIR은 position만 업데이트 → label 변경은 IR을 직접 패치
  // edges 의존성 없음 → nodeTypes 안정, 노드 remount 방지
  const handleNodeLabelChange = useCallback((id: string, patch: { label?: string; sublabel?: string }) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    if (irRef.current) {
      const cur = irRef.current
      const newIr = {
        ...cur,
        nodes:  cur.nodes.map(n  => n.id  === id ? { ...n,  ...patch } : n),
        groups: cur.groups.map(g => g.id  === id ? { ...g,  label: patch.label ?? g.label } : g),
      }
      lastSyncedIrRef.current = newIr
      onIrChange(newIr)
    }
  }, [onIrChange, setNodes])

  // 자식 InfraNode가 부모 GroupNode 헤더/경계를 벗어나지 않도록 위치 보정
  // - y >= HEADER_H + 8 (헤더 아래)
  // - x/y + nodeW/H <= groupW/H - EDGE_PAD (오른쪽/아래 경계 이내)
  const clampChildNodes = useCallback((allNodes: Node[]): Node[] => {
    const GROUP_HEADER = 50  // 헤더 높이(40) + 여유(10)
    const EDGE_PAD = 8
    const groupDims = new Map<string, { w: number; h: number }>()
    for (const n of allNodes) {
      if (n.type === 'groupNode') {
        groupDims.set(n.id, {
          w: (n.style?.width as number) ?? n.width ?? 800,
          h: (n.style?.height as number) ?? n.height ?? 600,
        })
      }
    }
    return allNodes.map(n => {
      if (n.type !== 'infraNode' || !n.parentNode) return n
      const dim = groupDims.get(n.parentNode)
      if (!dim) return n
      const nW = n.width ?? 160
      const nH = n.height ?? 80
      const x = Math.min(Math.max(n.position.x, EDGE_PAD), dim.w - nW - EDGE_PAD)
      const y = Math.min(Math.max(n.position.y, GROUP_HEADER), dim.h - nH - EDGE_PAD)
      if (x === n.position.x && y === n.position.y) return n
      return { ...n, position: { x, y } }
    })
  }, [])

  // 그룹 리사이즈 시 자식 노드 위치 역방향 보정 (부모 position 변화 상쇄)
  const handleGroupResize = useCallback((groupId: string, dx: number, dy: number) => {
    setNodes(nds => nds.map(n =>
      n.parentNode === groupId
        ? { ...n, position: { x: n.position.x - dx, y: n.position.y - dy } }
        : n
    ))
  }, [setNodes])

  // InfraNode 리사이즈: data.width/height 업데이트 → 아이콘 동적 스케일 반영
  const handleNodeResize = useCallback((nodeId: string, w: number, h: number) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, width: w, height: h } } : n
    ))
  }, [setNodes])

  // InfraNode 리사이즈 완료 시 클램프 + IR 동기화
  const handleNodeResizeEnd = useCallback(() => {
    if (!irRef.current) return
    const clamped = clampChildNodes(getNodes())
    setNodes(clamped)
    const newIr = flowToIR(irRef.current, clamped, getEdges())
    lastSyncedIrRef.current = newIr
    onIrChange(newIr)
  }, [clampChildNodes, getNodes, getEdges, setNodes, onIrChange])

  const nodeTypes = useMemo(() => ({
    infraNode: (props: any) => (
      <InfraNode {...props} data={{ ...props.data, onSearchIcon, iconOnly, onLabelChange: handleNodeLabelChange, onNodeResize: handleNodeResize, onNodeResizeEnd: handleNodeResizeEnd }} />
    ),
    groupNode: (props: any) => (
      <GroupNode {...props} data={{ ...props.data, onLabelChange: handleNodeLabelChange, onGroupResize: handleGroupResize, onResizeEnd: handleGroupResizeEnd }} />
    ),
    sequenceActor: SequenceActorNode,
    sequenceMessage: SequenceMessageNode,
    flowNode: (props: any) => (
      <FlowNode {...props} data={{ ...props.data, showIcon: showFlowIcons }} />
    ),
  }), [onSearchIcon, iconOnly, showFlowIcons, handleNodeLabelChange, handleGroupResize, handleNodeResize, handleNodeResizeEnd])

  const edgeTypes = useMemo(() => ({ arrowEdge: ArrowEdge }), [])

  // IR 변경 시 전체 재생성 (theme 제외 — 수동 엣지 보존 위해)
  useEffect(() => {
    if (!ir) return
    if (lastSyncedIrRef.current === ir) {
      return
    }
    const { nodes: newNodes, edges: newEdges } = irToFlow(ir, theme)
    setNodes(newNodes)
    setEdges(newEdges)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ir])

  // 테마 변경 시 스타일만 업데이트 (수동 엣지 유지)
  useEffect(() => {
    if (!ir) return
    const lineStyles = theme === 'dark' ? LINE_STYLES_DARK : LINE_STYLES_LIGHT
    const lStyle = LABEL_STYLES[theme]

    setNodes(nds => nds.map(n => {
      if (n.type === 'infraNode') {
        return { ...n, data: { ...n.data, iconUrl: resolveIconUrl(n.data.iconKey, theme), theme } }
      }
      if (n.type === 'flowNode') {
        return { ...n, data: { ...n.data, iconUrl: resolveIconUrl(n.data.iconKey, theme) } }
      }
      if (n.type === 'groupNode') {
        const irGroup = ir.groups.find((g: any) => g.id === n.id)
        if (irGroup) {
          const bgOpacity = theme === 'light'
            ? Math.min((irGroup.bg_opacity || 0.06) * 4, 0.22)
            : (irGroup.bg_opacity || 0.06)
          return {
            ...n,
            style: {
              ...n.style,
              background: `${irGroup.color || '#888888'}${Math.round(bgOpacity * 255).toString(16).padStart(2, '0')}`,
              border: `2px solid ${irGroup.color || '#888888'}${theme === 'light' ? 'bb' : '66'}`,
            },
          }
        }
      }
      return n
    }))

    setEdges(eds => eds.map(e => {
      const lineType = e.data?.line_type || 'general'
      const ls = lineStyles[lineType] || lineStyles.general
      return { ...e, style: ls, ...lStyle }
    }))
  }, [theme])

  const getLineStyles = useCallback(() =>
    theme === 'dark' ? LINE_STYLES_DARK : LINE_STYLES_LIGHT,
  [theme])

  const onConnect = useCallback(
    (connection: Connection) => {
      const ls = getLineStyles().general
      setEdges(eds => addEdge({
        ...connection,
        type: 'arrowEdge',
        style: ls,
        data: { line_type: 'general', arrow: 'forward', routing: 'straight', routing_mode: 'auto', waypoints: [] },
      }, eds))
    },
    [setEdges, getLineStyles],
  )

  // ArrowEdge에서 label 드래그 시 data 업데이트 (context 경유)
  const handleEdgeDataUpdate = useCallback((id: string, patch: Record<string, unknown>) => {
    setEdges(eds => eds.map(e =>
      e.id === id ? { ...e, data: { ...e.data, ...patch } } : e
    ))
  }, [setEdges])

  // 엔드포인트 재연결: source 또는 target 노드/핸들 변경
  const handleEdgeReroute = useCallback((
    edgeId: string,
    which: 'source' | 'target',
    nodeId: string,
    handleId: string,
  ) => {
    const curEdges = getEdges()
    const newEdges = curEdges.map(e => {
      if (e.id !== edgeId) return e
      const patch = which === 'source'
        ? { source: nodeId, sourceHandle: handleId }
        : { target: nodeId, targetHandle: handleId }
      // 경로가 바뀌므로 waypoints 초기화, smoothstep으로 리셋
      return { ...e, ...patch, data: { ...e.data, waypoints: [], routing_mode: 'auto', routing: 'smoothstep' } }
    })
    setEdges(newEdges)
    if (irRef.current) {
      const newIr = flowToIR(irRef.current, getNodes(), newEdges)
      lastSyncedIrRef.current = newIr
      onIrChange(newIr)
    }
  }, [getEdges, getNodes, setEdges, onIrChange])

  // 툴바 라벨 입력
  const handleLabelChange = useCallback((label: string) => {
    setEdges(eds => {
      const sel = eds.find(e => e.selected)
      if (!sel) return eds
      return eds.map(e => e.id === sel.id ? { ...e, label } : e)
    })
  }, [setEdges])

  // data.arrow만 업데이트 — ArrowEdge 컴포넌트가 직접 읽어서 렌더
  const handleArrowChange = useCallback((arrow: string) => {
    setEdges(eds => {
      const sel = eds.find(e => e.selected)
      if (!sel) return eds
      return eds.map(e =>
        e.id === sel.id ? { ...e, data: { ...e.data, arrow }, style: { ...(e.style as object) } } : e
      )
    })
  }, [setEdges])

  const handleLineTypeChange = useCallback((lineType: string) => {
    setEdges(eds => {
      const sel = eds.find(e => e.selected)
      if (!sel) return eds
      const ls = getLineStyles()[lineType] || getLineStyles().general
      return eds.map(e =>
        e.id === sel.id
          ? { ...e, style: ls, animated: lineType === 'data', data: { ...e.data, line_type: lineType } }
          : e
      )
    })
  }, [setEdges, getLineStyles])

  const handleRoutingChange = useCallback((routingMode: string) => {
    setEdges(eds => {
      const sel = eds.find(e => e.selected)
      if (!sel) return eds
      return eds.map(e => {
        if (e.id !== sel.id) return e
        const routing = routingMode === 'auto' ? 'smoothstep' : routingMode
        // polyline 전환 시 기존 waypoints 초기화 → ArrowEdge에서 sourceX/Y 기반으로 자동 추가
        const waypoints = routingMode === 'polyline' ? [] : (e.data?.waypoints ?? [])
        return { ...e, data: { ...e.data, routing, routing_mode: routingMode, waypoints } }
      })
    })
  }, [setEdges])

  const onEdgeUpdate = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdges(eds => updateEdge(oldEdge, newConnection, eds))
    },
    [setEdges],
  )

  const onNodeDragStop = useCallback(() => {
    if (!irRef.current) return
    // 드래그 후 자식 노드가 그룹 헤더/경계와 겹치지 않도록 보정
    const clamped = clampChildNodes(getNodes())
    setNodes(clamped)
    const newIr = flowToIR(irRef.current, clamped, getEdges())
    lastSyncedIrRef.current = newIr
    onIrChange(newIr)
  }, [clampChildNodes, getNodes, getEdges, setNodes, onIrChange])

  // 그룹 리사이즈 완료 시 자식 노드 클램프 + IR 동기화
  const handleGroupResizeEnd = useCallback(() => {
    if (!irRef.current) return
    const clamped = clampChildNodes(getNodes())
    setNodes(clamped)
    const newIr = flowToIR(irRef.current, clamped, getEdges())
    lastSyncedIrRef.current = newIr
    onIrChange(newIr)
  }, [clampChildNodes, getNodes, getEdges, setNodes, onIrChange])

  // 빈 노드 추가: 현재 뷰포트 중앙에 배치
  const handleAddNode = useCallback(() => {
    const { x: vx, y: vy, zoom } = getViewport()
    // 뷰포트 중앙 좌표 (canvas 좌표계)
    const centerX = (-vx + window.innerWidth * 0.5) / zoom
    const centerY = (-vy + window.innerHeight * 0.5) / zoom
    const offset = getNodes().length * 20
    const newId = `custom-${Date.now()}`
    addNodes({
      id: newId,
      type: 'infraNode',
      position: { x: centerX - 80 + offset, y: centerY - 40 + offset },
      data: {
        label: '새 노드',
        sublabel: '',
        iconUrl: null,
        iconKey: null,
        tags: [],
        nodeType: 'custom',
        nodeId: newId,
        theme,
      },
      selected: true,
    })
  }, [addNodes, getViewport, getNodes, theme])

  const handleSave = async () => {
    if (!ir) return
    const updatedIr = flowToIR(ir, nodes, edges)
    try {
      const url = diagramId
        ? `${API_BASE}/api/diagrams/${diagramId}`
        : `${API_BASE}/api/diagrams`
      const method = diagramId ? 'PUT' : 'POST'
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: ir.meta.title,
          ir_json: updatedIr,
          source_type: ir.meta.source_type,
        }),
      })
      if (resp.ok) toast.success('저장 완료!')
    } catch {
      toast.error('저장 실패')
    }
  }

  const handleExportPng = async () => {
    // canvas-container는 light 모드일 때 이미 canvas-light 클래스를 가짐
    // → CSS 규칙(.canvas-light .infra-node 등)이 올바르게 적용된 상태로 캡처 가능
    const captureEl = document.querySelector('.canvas-container') as HTMLElement
    if (!captureEl || getNodes().length === 0) return

    try {
      const { toPng } = await import('html-to-image')

      fitView({ padding: 0.06, duration: 0 })
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

      const bgColor = theme === 'dark' ? '#0a0a0f' : '#f8fafc'

      const dataUrl = await toPng(captureEl, {
        backgroundColor: bgColor,
        pixelRatio: 2,
        filter: (node) => {
          // SVG 포함 모든 Element에서 먼저 배경 도트 제거
          if (node instanceof Element && node.classList.contains('react-flow__background')) return false
          if (!(node instanceof HTMLElement)) return true
          if (node.classList.contains('react-flow__minimap')) return false
          if (node.classList.contains('react-flow__controls')) return false
          if (node.classList.contains('canvas-toolbar')) return false
          if (node.classList.contains('edge-toolbar')) return false
          if (node.tagName === 'IMG') {
            const img = node as HTMLImageElement
            if (!img.complete || img.naturalWidth === 0) return false
          }
          return true
        },
      })

      const filename = `${ir?.meta?.title || 'diagram'}.png`
      const a = document.createElement('a')
      a.download = filename
      a.href = dataUrl
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast.success('PNG 저장됨')
    } catch {
      toast.error('PNG 내보내기 실패')
    }
  }

  if (!ir) {
    return (
      <div className="canvas-empty">
        <div className="empty-message">
          <div className="empty-arch-icon">&#x1f3d7;&#xfe0f;</div>
          <h2>ArchGen</h2>
          <p>
            왼쪽 패널에서 인프라 구조를 설명하면<br />
            AI가 아이콘과 연결선이 있는<br />
            아키텍처 다이어그램을 생성합니다
          </p>
          <div className="empty-tips">
            <span className="empty-tip">&#x2726; AWS / Azure / GCP 아이콘 자동 매핑</span>
            <span className="empty-tip">&#x2726; 데이터 흐름 순서 자동 분석</span>
            <span className="empty-tip">&#x2726; 누락 아이콘 클릭으로 웹 검색</span>
          </div>
        </div>
      </div>
    )
  }

  const isDark = theme === 'dark'

  return (
    <EdgeDataUpdateCtx.Provider value={handleEdgeDataUpdate}>
    <EdgeRerouteCtx.Provider value={handleEdgeReroute}>
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeUpdate={onEdgeUpdate}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        connectionLineType={ConnectionLineType.Straight}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={['Delete', 'Backspace']}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color={isDark ? '#1a1a2e' : '#94a3b8'} gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor={isDark ? '#4a5568' : '#94a3b8'}
          maskColor={isDark ? 'rgba(10,10,15,0.7)' : 'rgba(248,250,252,0.7)'}
        />
      </ReactFlow>
      {selectedEdge && (() => {
        const curArrow = selectedEdge?.data?.arrow || 'forward'
        const curLine = selectedEdge?.data?.line_type || 'general'
        const curRouting = selectedEdge?.data?.routing_mode || 'auto'
        return (
          <div className="edge-toolbar" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <div className="edge-toolbar-group">
              {ARROW_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  title={opt.title}
                  className={`edge-toolbar-btn${curArrow === opt.value ? ' active' : ''}`}
                  onClick={() => handleArrowChange(opt.value)}
                >{opt.label}</button>
              ))}
            </div>
            <div className="edge-toolbar-divider" />
            <input
              className="edge-toolbar-label-input"
              type="text"
              placeholder="라벨 텍스트"
              value={selectedEdge?.label as string ?? ''}
              onChange={e => handleLabelChange(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
            />
            <div className="edge-toolbar-divider" />
            <div className="edge-toolbar-group">
              {LINE_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  title={opt.label}
                  className={`edge-toolbar-btn edge-toolbar-color${curLine === opt.value ? ' active' : ''}`}
                  onClick={() => handleLineTypeChange(opt.value)}
                >
                  <span className="edge-color-dot" style={{ background: opt.color }} />
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="edge-toolbar-divider" />
            <div className="edge-toolbar-group">
              {ROUTING_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  title={opt.title}
                  className={`edge-toolbar-btn${(curRouting === opt.value || (opt.value === 'auto' && curRouting !== 'polyline' && curRouting !== 'straight' && curRouting !== 'bezier')) ? ' active' : ''}`}
                  onClick={() => handleRoutingChange(opt.value)}
                >{opt.label}</button>
              ))}
            </div>
            <button
              className="edge-toolbar-delete"
              title="화살표 삭제"
              onClick={() => setEdges(eds => eds.filter(e => e.id !== selectedEdge!.id))}
            >🗑</button>
            <button className="edge-toolbar-close" onClick={() => setEdges(eds => eds.map(e => ({ ...e, selected: false })))}>✕</button>
          </div>
        )
      })()}

      <div className="canvas-toolbar">
        <button onClick={handleSave} className="btn-primary">저장</button>
        <button onClick={handleExportPng} className="btn-secondary">PNG</button>
        {(!ir?.meta?.diagram_type || ir.meta.diagram_type === 'architecture') && (
          <button onClick={handleAddNode} className="btn-secondary" title="빈 노드 추가">+ 노드</button>
        )}
        {ir?.meta?.diagram_type === 'flowchart' ? (
          <button
            onClick={() => setShowFlowIcons(v => !v)}
            className={`btn-secondary${showFlowIcons ? ' btn-active' : ''}`}
            title="아이콘 표시/숨김"
          >아이콘</button>
        ) : (
          <button
            onClick={() => setIconOnly(v => !v)}
            className={`btn-secondary${iconOnly ? ' btn-active' : ''}`}
            title="아이콘 전용 모드"
          >아이콘</button>
        )}
        <button onClick={onToggleTheme} className="btn-secondary btn-theme">
          {isDark ? 'Light' : 'Dark'}
        </button>
      </div>
    </div>
    </EdgeRerouteCtx.Provider>
    </EdgeDataUpdateCtx.Provider>
  )
}
