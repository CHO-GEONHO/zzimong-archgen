import type { ArchIR } from '../App'

declare const __BUILD_DATE__: string

const TAGLINES = [
  '텍스트 한 줄이 다이어그램이 된다',
  '설명하면 그려준다',
  '아키텍처를 말로 짓는다',
  '인프라를 그림으로 번역한다',
  '구조를 시각화하는 가장 빠른 방법',
  'CLI 출력도 다이어그램으로',
  'Git 레포에서 아키텍처를 읽는다',
  '생각을 다이어그램으로',
  '인프라 문서, 이제 그려서 공유',
  '복잡한 구조를 한눈에',
]

// 날짜 기반 — 하루에 하나씩 바뀜
const todayIndex = Math.floor(Date.now() / 86400000) % TAGLINES.length
const dailyTagline = TAGLINES[todayIndex]

interface Props {
  ir: ArchIR | null
  diagramId: string | null
}

export default function Header({ ir }: Props) {
  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="logo">ArchGen</h1>
        <span className="tagline">{dailyTagline}</span>
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
