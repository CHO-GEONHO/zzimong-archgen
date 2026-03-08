import type { ArchIR } from '../App'

declare const __BUILD_DATE__: string

interface Props {
  ir: ArchIR | null
  diagramId: string | null
}

export default function Header({ ir }: Props) {
  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="logo">ArchGen</h1>
        <span className="tagline">AI 인프라 아키텍처 생성기</span>
      </div>
      {ir && (
        <div className="header-center">
          <span className="diagram-title">{ir.meta.title}</span>
          <span className="diagram-meta">
            {ir.nodes.length}개 노드 · {ir.edges.length}개 연결 · {ir.meta.source_type}
          </span>
        </div>
      )}
      <div className="header-right">
        <span className="version">build {__BUILD_DATE__}</span>
      </div>
    </header>
  )
}
