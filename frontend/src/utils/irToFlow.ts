/**
 * JSON IR ↔ React Flow 변환 유틸리티
 */
import { MarkerType } from "reactflow"
import type { Node, Edge } from "reactflow"
import type { ArchIR } from "../App"

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8081'

// 라인 타입별 색상
const LINE_STYLES: Record<string, any> = {
  data:    { stroke: '#F4A000', strokeWidth: 2 },
  general: { stroke: '#888888', strokeWidth: 1.5 },
  alert:   { stroke: '#FF0000', strokeWidth: 2 },
  vpc:     { stroke: '#333333', strokeWidth: 1, strokeDasharray: '8,4' },
  lb:      { stroke: '#888888', strokeWidth: 1.5, strokeDasharray: '5,5' },
  blue:    { stroke: '#0078D4', strokeWidth: 2 },
}

export function irToFlow(ir: ArchIR): { nodes: Node[], edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // 그룹 노드 (React Flow에서 parentNode 방식)
  for (const group of ir.groups) {
    nodes.push({
      id: group.id,
      type: 'groupNode',
      position: group.position || { x: 0, y: 0 },
      style: {
        width: group.size?.width || 800,
        height: group.size?.height || 600,
        background: `${group.color || '#888888'}${Math.round((group.bg_opacity || 0.08) * 255).toString(16).padStart(2, '0')}`,
        border: `2px solid ${group.color || '#888888'}`,
        borderRadius: 12,
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
        icon: node.icon ? `${API_BASE}/icons/${node.icon}` : null,
        ip: node.ip,
        port: node.port,
        tags: node.tags || [],
        nodeType: node.type,
      },
    })
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
      animated: edge.line_type === 'data',
      markerEnd: edge.arrow !== 'backward' ? { type: MarkerType.ArrowClosed } : undefined,
      markerStart: edge.arrow === 'both' ? { type: MarkerType.ArrowClosed } : undefined,
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
  // 위치 업데이트 (드래그 결과 반영)
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
