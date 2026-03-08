import { useCallback, useEffect } from 'react'
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

const nodeTypes = {
  infraNode: InfraNode,
  groupNode: GroupNode,
}

interface Props {
  ir: ArchIR | null
  onIrChange: (ir: ArchIR) => void
  diagramId: string | null
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8081'

export default function DiagramEditor({ ir, onIrChange, diagramId }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

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
      const dataUrl = await toPng(el, { quality: 0.95 })
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
          <h2>ArchGen</h2>
          <p>왼쪽 패널에서 인프라를 설명하거나<br />CLI 출력을 붙여넣어 다이어그램을 생성하세요.</p>
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
        deleteKeyCode="Delete"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
      <div className="canvas-toolbar">
        <button onClick={handleSave} className="btn-primary">저장</button>
        <button onClick={handleExportPng} className="btn-secondary">PNG</button>
      </div>
    </div>
  )
}
