import { useCallback, useEffect, useMemo } from 'react'
import type { Connection } from 'reactflow'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
} from 'reactflow'
import toast from 'react-hot-toast'
import type { ArchIR } from '../App'
import { irToFlow, flowToIR } from '../utils/irToFlow'
import InfraNode from './nodes/InfraNode'
import GroupNode from './nodes/GroupNode'

interface Props {
  ir: ArchIR | null
  onIrChange: (ir: ArchIR) => void
  diagramId: string | null
  onSearchIcon?: (nodeId: string, nodeType: string, label: string) => void
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8081'

export default function DiagramEditor({ ir, onIrChange, diagramId, onSearchIcon }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // onSearchIcon을 InfraNode에 주입
  const nodeTypes = useMemo(() => ({
    infraNode: (props: any) => (
      <InfraNode {...props} data={{ ...props.data, onSearchIcon }} />
    ),
    groupNode: GroupNode,
  }), [onSearchIcon])

  useEffect(() => {
    if (!ir) return
    const { nodes: newNodes, edges: newEdges } = irToFlow(ir)
    setNodes(newNodes)
    setEdges(newEdges)
  }, [ir])

  const onConnect = useCallback(
    (connection: Connection) => setEdges(eds => addEdge(connection, eds)),
    [setEdges],
  )

  const onNodeDragStop = useCallback(() => {
    if (!ir) return
    const updatedIr = flowToIR(ir, nodes, edges)
    onIrChange(updatedIr)
  }, [ir, nodes, edges, onIrChange])

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
    const el = document.querySelector('.react-flow') as HTMLElement
    if (!el) return
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(el, { quality: 0.95, backgroundColor: '#0a0a0f' })
      const a = document.createElement('a')
      a.download = `${ir?.meta?.title || 'diagram'}.png`
      a.href = dataUrl
      a.click()
      toast.success('PNG 저장됨')
    } catch {
      toast.error('PNG 내보내기 실패')
    }
  }

  if (!ir) {
    return (
      <div className="canvas-empty">
        <div className="empty-message">
          <div className="empty-arch-icon">🏗️</div>
          <h2>ArchGen</h2>
          <p>
            왼쪽 패널에서 인프라 구조를 설명하면<br />
            AI가 아이콘과 연결선이 있는<br />
            아키텍처 다이어그램을 생성합니다
          </p>
          <div className="empty-tips">
            <span className="empty-tip">✦ AWS / Azure / GCP 아이콘 자동 매핑</span>
            <span className="empty-tip">✦ 데이터 흐름 순서 자동 분석</span>
            <span className="empty-tip">✦ 누락 아이콘 클릭으로 웹 검색</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        deleteKeyCode="Delete"
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color="#1a1a2e" gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor="#4a5568"
          maskColor="rgba(10,10,15,0.7)"
        />
      </ReactFlow>
      <div className="canvas-toolbar">
        <button onClick={handleSave} className="btn-primary">저장</button>
        <button onClick={handleExportPng} className="btn-secondary">PNG</button>
      </div>
    </div>
  )
}
