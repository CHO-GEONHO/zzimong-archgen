import { useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { Toaster } from 'react-hot-toast'
import DiagramEditor from './components/DiagramEditor'
import InputPanel from './components/InputPanel'
import AIPanel from './components/AIPanel'
import Header from './components/Header'
import 'reactflow/dist/style.css'
import './App.css'

export interface ArchIR {
  meta: {
    title: string
    version: string
    created_at: string
    source_type: string
    theme: string
  }
  groups: any[]
  nodes: any[]
  edges: any[]
  legend: any[]
}

export default function App() {
  const [ir, setIr] = useState<ArchIR | null>(null)
  const [diagramId, setDiagramId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  return (
    <div className="app-container">
      <Toaster position="top-right" />
      <Header ir={ir} diagramId={diagramId} />
      <div className="main-layout">
        {/* 좌측: 입력 패널 */}
        <InputPanel
          onParsed={(newIr: ArchIR, id?: string) => {
            setIr(newIr)
            setDiagramId(id || null)
          }}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />

        {/* 중앙: React Flow 캔버스 */}
        <div className="canvas-container">
          <ReactFlowProvider>
            <DiagramEditor
              ir={ir}
              onIrChange={setIr}
              diagramId={diagramId}
            />
          </ReactFlowProvider>
        </div>

        {/* 우측: AI 패널 */}
        <AIPanel
          ir={ir}
          diagramId={diagramId}
          onIrChange={setIr}
        />
      </div>
    </div>
  )
}
