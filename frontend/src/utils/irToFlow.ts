/**
 * JSON IR ↔ React Flow 변환 유틸리티 (v2 — Iconify CDN 지원)
 */
import type {} from "reactflow"
import type { Node, Edge } from "reactflow"
import type { ArchIR } from "../App"

export type DiagramTheme = 'dark' | 'light'

const API_BASE = ''

// 이미 자체 컬러를 가진 아이콘 팩 (color 파라미터 금지)
const COLORED_PREFIXES = new Set([
  'logos', 'devicon', 'devicon-plain', 'vscode-icons',
  'flat-color-icons', 'skill-icons', 'noto', 'noto-v1',
  'emojione', 'twemoji',
])

export function resolveIconUrl(icon: string | null | undefined, theme: DiagramTheme = 'dark'): string | null {
  if (!icon) return null

  if (icon.includes(':') && !icon.includes('/')) {
    const [prefix, name] = icon.split(':')
    const monoColor = theme === 'dark' ? '%23e2e8f0' : '%231e293b'
    const colorParam = COLORED_PREFIXES.has(prefix) ? '' : `&color=${monoColor}`
    return `https://api.iconify.design/${prefix}/${name}.svg?height=32${colorParam}`
  }

  return `${API_BASE}/icons/${icon}`
}

// 테마별 라인 스타일
export const LINE_STYLES_DARK: Record<string, any> = {
  data:    { stroke: '#a78bfa', strokeWidth: 2 },
  general: { stroke: '#94a3b8', strokeWidth: 1.5 },
  alert:   { stroke: '#f87171', strokeWidth: 2 },
  vpc:     { stroke: '#374151', strokeWidth: 1, strokeDasharray: '8,4' },
  lb:      { stroke: '#6b7280', strokeWidth: 1.5, strokeDasharray: '5,5' },
  blue:    { stroke: '#60a5fa', strokeWidth: 2 },
}

export const LINE_STYLES_LIGHT: Record<string, any> = {
  data:    { stroke: '#7c3aed', strokeWidth: 2 },
  general: { stroke: '#64748b', strokeWidth: 1.5 },
  alert:   { stroke: '#ef4444', strokeWidth: 2 },
  vpc:     { stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '8,4' },
  lb:      { stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '5,5' },
  blue:    { stroke: '#3b82f6', strokeWidth: 2 },
}

// 테마별 엣지 라벨 스타일
export const LABEL_STYLES = {
  dark: {
    labelStyle: { fill: '#e2e8f0', fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: 'rgba(15,16,25,0.85)', stroke: 'rgba(255,255,255,0.08)' },
  },
  light: {
    labelStyle: { fill: '#1e293b', fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: 'rgba(255,255,255,0.92)', stroke: 'rgba(0,0,0,0.1)' },
  },
}

export function irToFlowSequence(ir: ArchIR): { nodes: Node[], edges: Edge[] } {
  const ACTOR_SPACING = 220
  const MESSAGE_SPACING = 88
  const MESSAGES_START_Y = 120

  const actorIndex = new Map<string, number>()
  ir.nodes.forEach((actor, i) => actorIndex.set(actor.id, i))

  const sorted = [...ir.edges].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  const totalActors = ir.nodes.length
  const totalW = Math.max(totalActors * ACTOR_SPACING, 300)

  const nodes: Node[] = []

  ir.nodes.forEach((actor, i) => {
    nodes.push({
      id: actor.id,
      type: 'sequenceActor',
      position: { x: i * ACTOR_SPACING, y: 0 },
      data: {
        label: actor.label,
        iconUrl: resolveIconUrl(actor.icon, 'dark'),
        totalMessages: sorted.length,
        messageSpacing: MESSAGE_SPACING,
      },
    })
  })

  sorted.forEach((msg, i) => {
    const srcIdx = actorIndex.get(msg.from) ?? 0
    const tgtIdx = actorIndex.get(msg.to) ?? 0
    const y = MESSAGES_START_Y + i * MESSAGE_SPACING
    nodes.push({
      id: `seq-msg-${msg.id}`,
      type: 'sequenceMessage',
      position: { x: 0, y },
      data: {
        label: msg.label || '',
        sourceIdx: srcIdx,
        targetIdx: tgtIdx,
        totalActors,
        actorSpacing: ACTOR_SPACING,
        stepNum: i + 1,
      },
      style: { width: totalW, height: MESSAGE_SPACING - 8, pointerEvents: 'none' as any },
    })
  })

  return { nodes, edges: [] }
}

export function irToFlowFlowchart(ir: ArchIR, theme: DiagramTheme = 'dark'): { nodes: Node[], edges: Edge[] } {
  const lineStyles = theme === 'dark' ? LINE_STYLES_DARK : LINE_STYLES_LIGHT
  const labelStyle = LABEL_STYLES[theme]

  const inDegree = new Map<string, number>()
  const adjList = new Map<string, string[]>()
  ir.nodes.forEach(n => { inDegree.set(n.id, 0); adjList.set(n.id, []) })
  ir.edges.forEach(e => {
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1)
    adjList.get(e.from)?.push(e.to)
  })

  const depth = new Map<string, number>()
  const queue: string[] = []
  ir.nodes.forEach(n => {
    if ((inDegree.get(n.id) || 0) === 0) {
      depth.set(n.id, 0)
      queue.push(n.id)
    }
  })
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const nextId of adjList.get(id) || []) {
      if (!depth.has(nextId)) {
        depth.set(nextId, (depth.get(id) || 0) + 1)
        queue.push(nextId)
      }
    }
  }

  const byDepth = new Map<number, any[]>()
  ir.nodes.forEach(n => {
    const d = depth.get(n.id) || 0
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(n)
  })

  // 뱀 배치: MAX_PER_COL개마다 오른쪽 열로 이동
  const MAX_PER_COL = 4
  const COL_W = 220
  const ROW_H = 140

  // BFS 순서로 노드 정렬
  const orderedNodes: any[] = []
  const maxDepth = depth.size > 0 ? Math.max(...Array.from(depth.values())) : 0
  for (let d = 0; d <= maxDepth; d++) {
    const atDepth = byDepth.get(d) || []
    orderedNodes.push(...atDepth)
  }

  const nodes: Node[] = orderedNodes.map((n, i) => {
    const col = Math.floor(i / MAX_PER_COL)
    const row = i % MAX_PER_COL
    return {
      id: n.id,
      type: 'flowNode',
      position: { x: col * COL_W, y: row * ROW_H },
      data: {
        label: n.label,
        nodeType: n.type || 'process',
        iconKey: n.icon || null,
        iconUrl: resolveIconUrl(n.icon, theme),
      },
    }
  })

  const edges: Edge[] = ir.edges.map(e => {
    const ls = lineStyles[e.line_type || 'general'] || lineStyles.general
    return {
      id: e.id,
      type: 'arrowEdge',
      source: e.from,
      target: e.to,
      label: e.label || '',
      style: ls,
      ...labelStyle,
      labelBgPadding: [4, 8] as [number, number],
      labelBgBorderRadius: 4,
      data: { arrow: e.arrow || 'forward', routing: 'smoothstep', line_type: e.line_type || 'general' },
    }
  })

  return { nodes, edges }
}

export function irToFlow(ir: ArchIR, theme: DiagramTheme = 'dark'): { nodes: Node[], edges: Edge[] } {
  const diagramType = ir.meta?.diagram_type
  if (diagramType === 'sequence') return irToFlowSequence(ir)
  if (diagramType === 'flowchart') return irToFlowFlowchart(ir, theme)
  const nodes: Node[] = []
  const edges: Edge[] = []
  const lineStyles = theme === 'dark' ? LINE_STYLES_DARK : LINE_STYLES_LIGHT
  const labelStyle = LABEL_STYLES[theme]

  const NODE_W = 200, NODE_H = 90
  const PAD_X = 80, PAD_Y = 60, HEADER_H = 40

  // ── 1) 노드 포지션: LLM 절대좌표 → React Flow 상대좌표 변환 ──
  const relativeNodes = ir.nodes.map(node => {
    let pos = { ...(node.position || { x: 100, y: 100 }) }
    if (node.parent) {
      const pg = ir.groups.find(g => g.id === node.parent)
      if (pg?.position) {
        pos.x -= pg.position.x
        pos.y -= pg.position.y
      }
      // 최소 패딩 보장 (그룹 헤더/테두리 겹침 방지)
      pos.x = Math.max(pos.x, PAD_X)
      pos.y = Math.max(pos.y, HEADER_H + 10)
    }
    return { ...node, position: pos }
  })

  // ── 2) 컨테이너 vs 리프 그룹 분류 ──
  const containerGroups = new Set<string>()
  for (const g1 of ir.groups) {
    for (const g2 of ir.groups) {
      if (g1.id === g2.id) continue
      const p1 = g1.position || { x: 0, y: 0 }
      const s1 = g1.size || { width: 800, height: 600 }
      const p2 = g2.position || { x: 0, y: 0 }
      if (p2.x >= p1.x && p2.y >= p1.y &&
          p2.x < p1.x + s1.width && p2.y < p1.y + s1.height) {
        containerGroups.add(g1.id)
      }
    }
  }

  // ── 3) 그룹 노드 생성 ──
  const groupSizes = new Map<string, { width: number, height: number }>()

  for (const group of ir.groups) {
    const w = group.size?.width || 800
    const h = group.size?.height || 600
    groupSizes.set(group.id, { width: w, height: h })

    const bgOpacity = theme === 'light'
      ? Math.min((group.bg_opacity || 0.06) * 4, 0.22)
      : (group.bg_opacity || 0.06)

    nodes.push({
      id: group.id,
      type: 'groupNode',
      position: group.position || { x: 0, y: 0 },
      style: {
        width: w,
        height: h,
        background: `${group.color || '#888888'}${Math.round(bgOpacity * 255).toString(16).padStart(2, '0')}`,
        border: `2px solid ${group.color || '#888888'}${theme === 'light' ? 'bb' : '66'}`,
        borderRadius: 16,
      },
      data: {
        label: group.label,
        cloud: group.cloud,
        region: group.region,
        color: group.color,
      },
    })
  }

  // ── 4) 리프 그룹 자동 크기 조절 (상대좌표 기반) ──
  for (const group of ir.groups) {
    if (containerGroups.has(group.id)) continue
    const children = relativeNodes.filter(n => n.parent === group.id)
    if (children.length === 0) continue

    const positions = children.map(c => c.position)
    const maxX = Math.max(...positions.map(p => p.x))
    const maxY = Math.max(...positions.map(p => p.y))
    const fitW = Math.max(maxX + NODE_W + PAD_X, 300)
    const fitH = Math.max(maxY + NODE_H + PAD_Y, 200)

    const groupNode = nodes.find(n => n.id === group.id)
    if (groupNode?.style) {
      groupNode.style.width = fitW
      groupNode.style.height = fitH
    }
    groupSizes.set(group.id, { width: fitW, height: fitH })
  }

  // ── 5) 컨테이너 그룹 자동 크기 조절 (안쪽→바깥쪽 순서) ──
  // 중첩 깊이 계산 (깊을수록 = 더 많은 그룹 안에 포함됨)
  const groupDepth = new Map<string, number>()
  for (const group of ir.groups) {
    let depth = 0
    const gp = group.position || { x: 0, y: 0 }
    for (const other of ir.groups) {
      if (other.id === group.id) continue
      const op = other.position || { x: 0, y: 0 }
      const os = other.size || { width: 800, height: 600 }
      if (gp.x >= op.x && gp.y >= op.y &&
          gp.x < op.x + os.width && gp.y < op.y + os.height) {
        depth++
      }
    }
    groupDepth.set(group.id, depth)
  }

  const sortedContainers = ir.groups
    .filter(g => containerGroups.has(g.id))
    .sort((a, b) => (groupDepth.get(b.id) || 0) - (groupDepth.get(a.id) || 0))

  for (const group of sortedContainers) {
    const gp = group.position || { x: 0, y: 0 }
    let maxRight = 0
    let maxBottom = 0

    // 서브그룹 바운딩 박스
    for (const g2 of ir.groups) {
      if (g2.id === group.id) continue
      const p2 = g2.position || { x: 0, y: 0 }
      const s2 = groupSizes.get(g2.id) || { width: 800, height: 600 }
      if (p2.x >= gp.x && p2.y >= gp.y &&
          p2.x < gp.x + (group.size?.width || 9999) &&
          p2.y < gp.y + (group.size?.height || 9999)) {
        maxRight = Math.max(maxRight, (p2.x - gp.x) + s2.width)
        maxBottom = Math.max(maxBottom, (p2.y - gp.y) + s2.height)
      }
    }

    // 직접 자식 노드 바운딩 박스
    const children = relativeNodes.filter(n => n.parent === group.id)
    for (const child of children) {
      maxRight = Math.max(maxRight, child.position.x + NODE_W)
      maxBottom = Math.max(maxBottom, child.position.y + NODE_H)
    }

    if (maxRight > 0 || maxBottom > 0) {
      const fitW = maxRight + PAD_X
      const fitH = maxBottom + PAD_Y
      const groupNode = nodes.find(n => n.id === group.id)
      if (groupNode?.style) {
        groupNode.style.width = Math.max(groupNode.style.width as number, fitW)
        groupNode.style.height = Math.max(groupNode.style.height as number, fitH)
      }
      groupSizes.set(group.id, {
        width: Math.max(groupSizes.get(group.id)?.width || 0, fitW),
        height: Math.max(groupSizes.get(group.id)?.height || 0, fitH),
      })
    }
  }

  // ── 6) 일반 노드 생성 (상대좌표 사용) ──
  for (const node of relativeNodes) {
    nodes.push({
      id: node.id,
      type: 'infraNode',
      position: node.position,
      parentNode: node.parent || undefined,
      extent: node.parent ? 'parent' : undefined,
      data: {
        label: node.label,
        sublabel: node.sublabel,
        iconUrl: resolveIconUrl(node.icon, theme),
        iconKey: node.icon,
        ip: node.ip,
        port: node.port,
        tags: node.tags || [],
        nodeType: node.type,
        nodeId: node.id,
        theme,
      },
    })
  }

  // ── 7) 엣지용 절대 좌표 맵 (스마트 핸들 선택에 사용) ──
  const absPos = new Map<string, { x: number; y: number }>()
  for (const g of ir.groups) {
    absPos.set(g.id, g.position || { x: 0, y: 0 })
  }
  for (const n of relativeNodes) {
    const parentPos = n.parent ? (absPos.get(n.parent) || { x: 0, y: 0 }) : { x: 0, y: 0 }
    absPos.set(n.id, { x: n.position.x + parentPos.x, y: n.position.y + parentPos.y })
  }

  // 핸들 방향 선택: 출발 방향은 target 쪽을 향하는 면, 도착 방향은 source 쪽을 향하는 면
  // 수평 편향 (|dx| >= |dy|*0.6): 수평 핸들 → smoothstep이 자연스러운 S자
  // 수직 편향 (|dy| > |dx|*1.5): 수직 핸들
  // 대각선 (~45°): 수평 핸들 선호 (아키텍처 다이어그램은 좌→우 흐름이 주)
  function getBestHandles(fromId: string, toId: string) {
    const src = absPos.get(fromId) || { x: 0, y: 0 }
    const tgt = absPos.get(toId) || { x: 0, y: 0 }
    const dx = tgt.x - src.x
    const dy = tgt.y - src.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    // 확실히 수직인 경우에만 top/bottom 사용 (dy가 dx의 1.5배 초과)
    if (absDy > absDx * 1.5) {
      return dy >= 0
        ? { sourceHandle: 'bottom-s', targetHandle: 'top-t' }
        : { sourceHandle: 'top-s', targetHandle: 'bottom-t' }
    }
    // 나머지(수평, 대각선)는 모두 right/left
    return dx >= 0
      ? { sourceHandle: 'right-s', targetHandle: 'left-t' }
      : { sourceHandle: 'left-s', targetHandle: 'right-t' }
  }

  // auto 기본값: 항상 smoothstep (직각 라우팅)
  // straight/bezier는 AI 또는 사용자가 명시할 때만
  function getRouting(_sh: string, _th: string): 'smoothstep' {
    return 'smoothstep'
  }

  // ── 8) 반대방향 엣지 쌍 탐지 → 라벨 오프셋 자동 분리 ──
  // 정규화 키: "작은id|큰id" 로 양방향 쌍을 하나로 묶음
  const pairKey = (a: string, b: string) => [a, b].sort().join('|')
  const edgePairs = new Map<string, string[]>() // key → [edgeId, ...]
  for (const edge of ir.edges) {
    const key = pairKey(edge.from, edge.to)
    if (!edgePairs.has(key)) edgePairs.set(key, [])
    edgePairs.get(key)!.push(edge.id)
  }

  // 쌍이 2개 이상인 엣지에 대해 수직 방향 오프셋 계산
  const LABEL_OFFSET = 32
  const labelAutoOffset = new Map<string, { x: number; y: number }>()

  for (const [, ids] of edgePairs) {
    if (ids.length < 2) continue
    // 첫 엣지 기준으로 방향 계산
    const firstEdge = ir.edges.find(e => e.id === ids[0])!
    const handles = getBestHandles(firstEdge.from, firstEdge.to)
    const srcDir = handles.sourceHandle.replace(/-[st]$/, '')

    // 수평 엣지(left/right): 라벨을 Y축으로 분리
    // 수직 엣지(top/bottom): 라벨을 X축으로 분리
    const isHorizontal = srcDir === 'left' || srcDir === 'right'
    ids.forEach((id, i) => {
      const sign = i % 2 === 0 ? -1 : 1
      labelAutoOffset.set(id, {
        x: isHorizontal ? 0 : sign * LABEL_OFFSET,
        y: isHorizontal ? sign * LABEL_OFFSET : 0,
      })
    })
  }

  // 엣지 — 커스텀 ArrowEdge 타입으로 통일 (마커는 컴포넌트에서 data.arrow 기반으로 렌더)
  for (const edge of ir.edges) {
    const ls = lineStyles[edge.line_type || 'general'] || lineStyles.general
    const handles = edge.sourceHandle && edge.targetHandle
      ? { sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle }
      : getBestHandles(edge.from, edge.to)

    // routing_mode가 'polyline'이면 그대로, 아니면 자동 결정
    const autoRouting = getRouting(handles.sourceHandle, handles.targetHandle)
    const routing = edge.routing_mode === 'polyline' ? 'polyline'
      : edge.routing_mode === 'straight' ? 'straight'
      : edge.routing_mode === 'bezier' ? 'bezier'
      : autoRouting

    const autoOff = labelAutoOffset.get(edge.id) || { x: 0, y: 0 }
    edges.push({
      id: edge.id,
      type: 'arrowEdge',
      source: edge.from,
      target: edge.to,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      label: edge.label || '',
      style: ls,
      ...labelStyle,
      labelBgPadding: [4, 8] as [number, number],
      labelBgBorderRadius: 4,
      animated: edge.line_type === 'data',
      data: {
        line_type: edge.line_type,
        arrow: edge.arrow || 'forward',
        routing,
        routing_mode: edge.routing_mode ?? 'auto',
        waypoints: edge.waypoints ?? [],
        labelOffsetX: (edge.label_offset_x ?? 0) + autoOff.x,
        labelOffsetY: (edge.label_offset_y ?? 0) + autoOff.y,
      },
    })
  }

  return { nodes, edges }
}

export function flowToIR(
  ir: ArchIR,
  flowNodes: Node[],
  flowEdges: Edge[],
): ArchIR {
  // 그룹 먼저 (노드의 절대좌표 복원에 필요)
  const updatedGroups = ir.groups.map(irGroup => {
    const flowNode = flowNodes.find(n => n.id === irGroup.id)
    if (flowNode) {
      return {
        ...irGroup,
        position: flowNode.position,
        // 리사이즈된 크기도 반영 (style.width/height)
        size: {
          width: (flowNode.style?.width as number) ?? irGroup.size?.width,
          height: (flowNode.style?.height as number) ?? irGroup.size?.height,
        },
      }
    }
    return irGroup
  })

  // 노드: React Flow 상대좌표 → IR 절대좌표로 역변환 + 리사이즈 크기 저장
  const updatedNodes = ir.nodes.map(irNode => {
    const flowNode = flowNodes.find(n => n.id === irNode.id)
    if (flowNode) {
      let pos = { ...flowNode.position }
      if (irNode.parent) {
        const parentGroup = updatedGroups.find(g => g.id === irNode.parent)
        if (parentGroup?.position) {
          pos = {
            x: pos.x + parentGroup.position.x,
            y: pos.y + parentGroup.position.y,
          }
        }
      }
      const patch: Record<string, unknown> = { position: pos }
      // 사용자가 수동으로 리사이즈한 경우 크기 저장
      if (flowNode.data?.width) patch.width = flowNode.data.width
      if (flowNode.data?.height) patch.height = flowNode.data.height
      return { ...irNode, ...patch }
    }
    return irNode
  })

  // 엣지: flow 상태가 source of truth
  // - flow에 없으면 삭제된 것 → IR에서도 제거
  // - flow에 있지만 IR에 없으면 새로 추가된 것 → IR에 추가
  const flowEdgeIds = new Set(flowEdges.map(e => e.id))
  const irEdgeIds = new Set(ir.edges.map(e => e.id))

  const updatedEdges = ir.edges
    .filter(irEdge => flowEdgeIds.has(irEdge.id)) // 삭제된 엣지 제거
    .map(irEdge => {
      const fe = flowEdges.find(e => e.id === irEdge.id)!
      return {
        ...irEdge,
        from: fe.source,
        to: fe.target,
        label: (fe.label as string) ?? irEdge.label,
        sourceHandle: fe.sourceHandle ?? undefined,
        targetHandle: fe.targetHandle ?? undefined,
        arrow: fe.data?.arrow ?? irEdge.arrow,
        line_type: fe.data?.line_type ?? irEdge.line_type,
        routing_mode: fe.data?.routing_mode ?? irEdge.routing_mode,
        waypoints: fe.data?.waypoints ?? irEdge.waypoints,
        label_offset_x: fe.data?.labelOffsetX ?? irEdge.label_offset_x,
        label_offset_y: fe.data?.labelOffsetY ?? irEdge.label_offset_y,
      }
    })

  // onConnect로 추가된 새 엣지 → IR에 포함
  const newEdges = flowEdges
    .filter(fe => !irEdgeIds.has(fe.id))
    .map(fe => ({
      id: fe.id,
      from: fe.source,
      to: fe.target,
      label: (fe.label as string) ?? '',
      arrow: fe.data?.arrow ?? 'forward',
      line_type: fe.data?.line_type ?? 'general',
      routing_mode: fe.data?.routing_mode,
      waypoints: fe.data?.waypoints,
      label_offset_x: fe.data?.labelOffsetX,
      label_offset_y: fe.data?.labelOffsetY,
    }))

  return { ...ir, nodes: updatedNodes, groups: updatedGroups, edges: [...updatedEdges, ...newEdges] }
}
