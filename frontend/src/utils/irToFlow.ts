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
  general: { stroke: '#94a3b8', strokeWidth: 1.5 },
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

  // 그룹 크기 자동 축소: 자식 노드 범위에 맞게 (위치는 LLM 원본 유지)
  const NODE_W = 200, NODE_H = 90
  const PAD_X = 80, PAD_Y = 60, HEADER_H = 40

  for (const group of ir.groups) {
    const children = ir.nodes.filter(n => n.parent === group.id)
    if (children.length === 0) continue

    const positions = children.map(c => c.position || { x: 0, y: 0 })
    const minX = Math.min(...positions.map(p => p.x))
    const maxX = Math.max(...positions.map(p => p.x))
    const minY = Math.min(...positions.map(p => p.y))
    const maxY = Math.max(...positions.map(p => p.y))

    const fitW = Math.max(maxX - minX + NODE_W + PAD_X * 2, 300)
    const fitH = Math.max(maxY - minY + NODE_H + PAD_Y * 2 + HEADER_H, 200)

    const groupNode = nodes.find(n => n.id === group.id)
    if (groupNode?.style) {
      groupNode.style.width = fitW
      groupNode.style.height = fitH
    }
  }

  // 엣지
  for (const edge of ir.edges) {
    const lineStyle = LINE_STYLES[edge.line_type || 'general'] || LINE_STYLES.general
    edges.push({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.label || '',
      style: lineStyle,
      labelStyle: { fill: '#e2e8f0', fontSize: 11, fontWeight: 500 },
      labelBgStyle: { fill: 'rgba(15,16,25,0.85)', stroke: 'rgba(255,255,255,0.08)' },
      labelBgPadding: [4, 8] as [number, number],
      labelBgBorderRadius: 4,
      animated: edge.line_type === 'data',
      markerEnd: (edge.arrow || 'forward') !== 'backward' ? {
        type: MarkerType.ArrowClosed,
        color: lineStyle.stroke,
        width: 16,
        height: 16,
      } : undefined,
      markerStart: (edge.arrow === 'both' || edge.arrow === 'backward') ? {
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
