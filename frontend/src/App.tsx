import { useState, useCallback } from 'react'
import type { DiagramTheme } from './utils/irToFlow'
import { ReactFlowProvider } from 'reactflow'
import { Toaster } from 'react-hot-toast'
import DiagramEditor from './components/DiagramEditor'
import InputPanel from './components/InputPanel'
import AIPanel from './components/AIPanel'
import Header from './components/Header'
import DataFlowPanel from './components/DataFlowPanel'
import IconSearchModal from './components/IconSearchModal'
import 'reactflow/dist/style.css'
import './App.css'

export interface ArchIR {
  meta: {
    title: string
    version: string
    created_at: string
    source_type: string
    theme: string
    diagram_type?: 'architecture' | 'sequence' | 'flowchart'
  }
  data_flow: string[]
  groups: any[]
  nodes: any[]
  edges: any[]
  legend: any[]
}

type MobileTab = 'input' | 'diagram' | 'ai'

interface IconSearchState {
  nodeId: string
  nodeType: string
  nodeLabel: string
}

export default function App() {
  const [ir, setIr] = useState<ArchIR | null>(null)
  const [diagramId, setDiagramId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('input')
  const [iconSearch, setIconSearch] = useState<IconSearchState | null>(null)
  const [theme, setTheme] = useState<DiagramTheme>('dark')

  const handleParsed = (newIr: ArchIR, id?: string) => {
    setIr(newIr)
    setDiagramId(id || null)
    setMobileTab('diagram')
  }

  // 노드에서 아이콘 검색 요청
  const handleSearchIcon = useCallback((nodeId: string, nodeType: string, nodeLabel: string) => {
    setIconSearch({ nodeId, nodeType, nodeLabel })
  }, [])

  // 아이콘 선택 적용
  const handleApplyIcon = useCallback((nodeId: string, iconKey: string) => {
    if (!ir) return
    setIr(prev => {
      if (!prev) return prev
      return {
        ...prev,
        nodes: prev.nodes.map(n =>
          n.id === nodeId ? { ...n, icon: iconKey } : n
        ),
      }
    })
  }, [ir])

  return (
    <div className="app-container">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(15,16,25,0.95)',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(12px)',
            fontSize: '13px',
          },
        }}
      />
      <Header ir={ir} diagramId={diagramId} />

      <div className="main-layout">
        {/* 좌측: 입력 패널 */}
        <div className={`panel-left-wrap${mobileTab === 'input' ? ' mobile-active' : ''}`}>
          <InputPanel
            onParsed={handleParsed}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
          />
        </div>

        {/* 중앙: React Flow 캔버스 + DataFlow 패널 */}
        <div className={`canvas-container${mobileTab === 'diagram' ? ' mobile-active' : ''}${theme === 'light' ? ' canvas-light' : ''}`}>
          <ReactFlowProvider>
            <DiagramEditor
              ir={ir}
              onIrChange={setIr}
              diagramId={diagramId}
              onSearchIcon={handleSearchIcon}
              theme={theme}
              onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            />
          </ReactFlowProvider>
          {/* 데이터 플로우 패널 (캔버스 하단) */}
          {ir && <DataFlowPanel ir={ir} />}
        </div>

        {/* 우측: AI 패널 */}
        <div className={`panel-right-wrap${mobileTab === 'ai' ? ' mobile-active' : ''}`}>
          <AIPanel
            ir={ir}
            diagramId={diagramId}
            onIrChange={setIr}
          />
        </div>
      </div>

      {/* 모바일 하단 네비게이션 */}
      <nav className="mobile-nav">
        <div className="mobile-nav-inner">
          <button
            className={`mobile-nav-btn${mobileTab === 'input' ? ' active' : ''}`}
            onClick={() => setMobileTab('input')}
          >
            <span className="mobile-nav-icon">✏️</span>
            <span className="mobile-nav-label">입력</span>
          </button>
          <button
            className={`mobile-nav-btn${mobileTab === 'diagram' ? ' active' : ''}`}
            onClick={() => setMobileTab('diagram')}
          >
            <span className="mobile-nav-icon">🗺️</span>
            <span className="mobile-nav-label">다이어그램</span>
            {ir && <span className="mobile-nav-dot" />}
          </button>
          <button
            className={`mobile-nav-btn${mobileTab === 'ai' ? ' active' : ''}`}
            onClick={() => setMobileTab('ai')}
            disabled={!ir}
          >
            <span className="mobile-nav-icon">🤖</span>
            <span className="mobile-nav-label">AI 분석</span>
          </button>
        </div>
      </nav>

      {/* 아이콘 검색 모달 */}
      {iconSearch && (
        <IconSearchModal
          nodeId={iconSearch.nodeId}
          nodeType={iconSearch.nodeType}
          nodeLabel={iconSearch.nodeLabel}
          onApply={handleApplyIcon}
          onClose={() => setIconSearch(null)}
        />
      )}
    </div>
  )
}
