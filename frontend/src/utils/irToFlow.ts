/**
 * JSON IR ↔ React Flow 변환 유틸리티 (v2 — Iconify CDN 지원)
 */
import { MarkerType } from "reactflow"
import type { Node, Edge } from "reactflow"
import type { ArchIR } from "../App"

const API_BASE = ''

/**
 * 아이콘 경로 → URL 변환
 * - "logos:aws-ec2" 형식 → Iconify CDN URL
 * - "aws/ec2.svg" 형식 → 로컬 서버 URL
 */
// 이미 자체 컬러를 가진 아이콘 팩 (white 강제 금지)
const COLORED_PREFIXES = new Set([
  'logos', 'devicon', 'devicon-plain', 'vscode-icons',
  'flat-color-icons', 'skill-icons', 'noto', 'noto-v1',
  'emojione', 'twemoji',
])

export function resolveIconUrl(icon: string | null | undefined): string | null {
  if (!icon) return null

  // Iconify 형식: "prefix:icon-name" (슬래시 없고 콜론 있음)
  if (icon.includes(':') && !icon.includes('/')) {
    const [prefix, name] = icon.split(':')
    // 컬러 팩은 color 파라미터 없이, 모노크롬은 흰색으로
    const colorParam = COLORED_PREFIXES.has(prefix) ? '' : '&color=%23e2e8f0'
    return `https://api.iconify.design/${prefix}/${name}.svg?height=32${colorParam}`
  }

  // 로컬 파일 형식: "aws/ec2.svg"
  return `${API_BASE}/icons/${icon}`
}

// 라인 타입별 색상
const LINE_STYLES: Record<string, any> = {
  data:    { stroke: '#a78bfa', strokeWidth: 2 },
  general: { stroke: '#4a5568', strokeWidth: 1.5 },
  alert:   { stroke: '#f87171', strokeWidth: 2 },
  vpc:     { stroke: '#374151', strokeWidth: 1, strokeDasharray: '8,4' },
  lb:      { stroke: '#6b7280', strokeWidth: 1.5, strokeDasharray: '5,5' },
  blue:    { stroke: '#60a5fa', strokeWidth: 2 },
}

export function irToFlow(ir: ArchIR): { nodes: Node[], edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // 그룹 노드
  for (const group of ir.groups) {
    nodes.push({
      id: group.id,
      type: 'groupNode',
      position: group.position || { x: 0, y: 0 },
      style: {
        width: group.size?.width || 800,
        height: group.size?.height || 600,
        background: `${group.color || '#888888'}${Math.round((group.bg_opacity || 0.06) * 255).toString(16).padStart(2, '0')}`,
        border: `1.5px solid ${group.color || '#888888'}66`,
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

  // 일반 노드
  for (const node of ir.nodes) {
    nodes.push({
      id: node.id,
      type: 'infraNode',
      position: node.position || { x: 100, y: 100 },
      parentNode: node.parent || undefined,
      extent: node.parent ? 'parent' : undefined,
      data: {
        label: node.label,
        sublabel: node.sublabel,
        iconUrl: resolveIconUrl(node.icon),
        iconKey: node.icon,   // 원본 아이콘 키 (IconSearch용)
        ip: node.ip,
        port: node.port,
        tags: node.tags || [],
        nodeType: node.type,
        nodeId: node.id,
      },
    })
  }

  // === 그룹 크기·위치 자동 보정 + 겹침 해소 ===
  const NODE_W = 200, NODE_H = 90
  const PAD_X = 80, PAD_Y = 60, HEADER_H = 40, OVERLAP_MARGIN = 30

  // Phase 1: 그룹을 자식 노드에 꼭 맞게 조정 (크기 + 위치)
  const fitGroups = () => {
    for (const group of ir.groups) {
      const cNodes = nodes.filter(n => n.parentNode === group.id && n.type === 'infraNode')
      if (cNodes.length === 0) continue
      const xs = cNodes.map(n => n.position.x)
      const ys = cNodes.map(n => n.position.y)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      const w = Math.max(maxX - minX + NODE_W + PAD_X * 2, 300)
      const h = Math.max(maxY - minY + NODE_H + PAD_Y * 2 + HEADER_H, 200)

      const gn = nodes.find(n => n.id === group.id)
      if (!gn?.style) continue

      // 자식 위치 기반으로 그룹 원점 보정
      const dx = minX - PAD_X
      const dy = minY - PAD_Y - HEADER_H
      gn.position = { x: gn.position.x + dx, y: gn.position.y + dy }
      gn.style.width = w
      gn.style.height = h

      // 자식 상대좌표 보정 (그룹 원점 이동분 상쇄)
      for (const cn of cNodes) {
        cn.position = { x: cn.position.x - dx, y: cn.position.y - dy }
      }
    }
  }

  fitGroups()

  // Phase 2: 겹침 해소 — 그룹 자식이 아닌 노드가 그룹 경계와 겹치면 밀어냄
  const getGroupBounds = () => {
    const m = new Map<string, { x: number; y: number; w: number; h: number }>()
    for (const n of nodes) {
      if (n.type === 'groupNode') {
        m.set(n.id, {
          x: n.position.x, y: n.position.y,
          w: (n.style?.width as number) || 0,
          h: (n.style?.height as number) || 0,
        })
      }
    }
    return m
  }

  let gb = getGroupBounds()
  let pushed = false

  for (const node of nodes) {
    if (node.type !== 'infraNode') continue

    for (const [gId, rect] of gb) {
      if (gId === node.parentNode) continue

      // 절대 좌표 계산
      let ax: number, ay: number
      if (node.parentNode) {
        const pb = gb.get(node.parentNode)
        if (!pb) continue
        ax = pb.x + node.position.x
        ay = pb.y + node.position.y
      } else {
        ax = node.position.x
        ay = node.position.y
      }

      const nr = ax + NODE_W, nb = ay + NODE_H
      const gr = rect.x + rect.w, gbot = rect.y + rect.h

      if (nr > rect.x - OVERLAP_MARGIN && ax < gr + OVERLAP_MARGIN &&
          nb > rect.y - OVERLAP_MARGIN && ay < gbot + OVERLAP_MARGIN) {
        const dL = nr - (rect.x - OVERLAP_MARGIN)
        const dR = (gr + OVERLAP_MARGIN) - ax
        const dU = nb - (rect.y - OVERLAP_MARGIN)
        const dD = (gbot + OVERLAP_MARGIN) - ay
        const min = Math.min(dL, dR, dU, dD)

        if (min === dL) node.position = { x: node.position.x - dL, y: node.position.y }
        else if (min === dR) node.position = { x: node.position.x + dR, y: node.position.y }
        else if (min === dU) node.position = { x: node.position.x, y: node.position.y - dU }
        else node.position = { x: node.position.x, y: node.position.y + dD }
        pushed = true
      }
    }
  }

  // Phase 3: 겹침 해소 후 그룹 재조정
  if (pushed) fitGroups()

  // 엣지
  for (const edge of ir.edges) {
    const lineStyle = LINE_STYLES[edge.line_type || 'general'] || LINE_STYLES.general
    edges.push({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.label || '',
      style: lineStyle,
      animated: edge.line_type === 'data',
      markerEnd: edge.arrow !== 'backward' ? {
        type: MarkerType.ArrowClosed,
        color: lineStyle.stroke,
        width: 16,
        height: 16,
      } : undefined,
      markerStart: edge.arrow === 'both' ? {
        type: MarkerType.ArrowClosed,
        color: lineStyle.stroke,
        width: 16,
        height: 16,
      } : undefined,
      data: { line_type: edge.line_type },
    })
  }

  return { nodes, edges }
}

export function flowToIR(
  ir: ArchIR,
  flowNodes: Node[],
  _flowEdges: Edge[],
): ArchIR {
  const updatedNodes = ir.nodes.map(irNode => {
    const flowNode = flowNodes.find(n => n.id === irNode.id)
    if (flowNode) {
      return { ...irNode, position: flowNode.position }
    }
    return irNode
  })

  const updatedGroups = ir.groups.map(irGroup => {
    const flowNode = flowNodes.find(n => n.id === irGroup.id)
    if (flowNode) {
      return { ...irGroup, position: flowNode.position }
    }
    return irGroup
  })

  return { ...ir, nodes: updatedNodes, groups: updatedGroups }
}
