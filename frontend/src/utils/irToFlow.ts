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
const LABEL_STYLES = {
  dark: {
    labelStyle: { fill: '#e2e8f0', fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: 'rgba(15,16,25,0.85)', stroke: 'rgba(255,255,255,0.08)' },
  },
  light: {
    labelStyle: { fill: '#1e293b', fontSize: 11, fontWeight: 500 },
    labelBgStyle: { fill: 'rgba(255,255,255,0.92)', stroke: 'rgba(0,0,0,0.1)' },
  },
}

export function irToFlow(ir: ArchIR, theme: DiagramTheme = 'dark'): { nodes: Node[], edges: Edge[] } {
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
      ? Math.min((group.bg_opacity || 0.06) * 1.5, 0.12)
      : (group.bg_opacity || 0.06)

    nodes.push({
      id: group.id,
      type: 'groupNode',
      position: group.position || { x: 0, y: 0 },
      style: {
        width: w,
        height: h,
        background: `${group.color || '#888888'}${Math.round(bgOpacity * 255).toString(16).padStart(2, '0')}`,
        border: `1.5px solid ${group.color || '#888888'}${theme === 'light' ? '44' : '66'}`,
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

  // 반대 방향 핸들 쌍 (베지어로 자연스럽게)
  const OPPOSITE: Record<string, string> = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' }

  function getBestHandles(fromId: string, toId: string) {
    const src = absPos.get(fromId) || { x: 0, y: 0 }
    const tgt = absPos.get(toId) || { x: 0, y: 0 }
    const dx = tgt.x - src.x
    const dy = tgt.y - src.y
    if (Math.abs(dy) >= Math.abs(dx)) {
      return dy >= 0
        ? { sourceHandle: 'bottom-s', targetHandle: 'top-t' }
        : { sourceHandle: 'top-s', targetHandle: 'bottom-t' }
    } else {
      return dx >= 0
        ? { sourceHandle: 'right-s', targetHandle: 'left-t' }
        : { sourceHandle: 'left-s', targetHandle: 'right-t' }
    }
  }

  // 핸들 방향이 정반대면 bezier, 아니면 smoothstep(ㄷ자 라운드)
  function getRouting(sh: string, th: string): 'bezier' | 'smoothstep' {
    const srcDir = sh.replace(/-[st]$/, '')
    const tgtDir = th.replace(/-[st]$/, '')
    return OPPOSITE[srcDir] === tgtDir ? 'bezier' : 'smoothstep'
  }

  // 엣지 — 커스텀 ArrowEdge 타입으로 통일 (마커는 컴포넌트에서 data.arrow 기반으로 렌더)
  for (const edge of ir.edges) {
    const ls = lineStyles[edge.line_type || 'general'] || lineStyles.general
    const handles = edge.sourceHandle && edge.targetHandle
      ? { sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle }
      : getBestHandles(edge.from, edge.to)
    const routing = getRouting(handles.sourceHandle, handles.targetHandle)
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
        labelOffsetX: edge.label_offset_x ?? 0,
        labelOffsetY: edge.label_offset_y ?? 0,
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
      return { ...irGroup, position: flowNode.position }
    }
    return irGroup
  })

  // 노드: React Flow 상대좌표 → IR 절대좌표로 역변환
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
      return { ...irNode, position: pos }
    }
    return irNode
  })

  // 엣지: 재연결로 바뀐 source/target/handle 반영
  const updatedEdges = ir.edges.map(irEdge => {
    const fe = flowEdges.find(e => e.id === irEdge.id)
    if (fe) {
      return {
        ...irEdge,
        from: fe.source,
        to: fe.target,
        label: (fe.label as string) ?? irEdge.label,
        sourceHandle: fe.sourceHandle ?? undefined,
        targetHandle: fe.targetHandle ?? undefined,
        arrow: fe.data?.arrow ?? irEdge.arrow,
        line_type: fe.data?.line_type ?? irEdge.line_type,
        label_offset_x: fe.data?.labelOffsetX ?? irEdge.label_offset_x,
        label_offset_y: fe.data?.labelOffsetY ?? irEdge.label_offset_y,
      }
    }
    return irEdge
  })

  return { ...ir, nodes: updatedNodes, groups: updatedGroups, edges: updatedEdges }
}
