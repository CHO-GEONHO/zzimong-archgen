import { useState } from 'react'
import toast from 'react-hot-toast'
import type { ArchIR } from "../App"

const API_BASE = ''

const QUICK_QUERIES = [
  'SPOF(단일 장애점) 찾아줘',
  '외부에서 직접 접근 가능한 노드는?',
  'DB가 몇 개야?',
  '모니터링 연결 없는 서비스는?',
]

interface Props {
  ir: ArchIR | null
  diagramId: string | null
  onIrChange: (ir: ArchIR) => void
}

export default function AIPanel({ ir, diagramId, onIrChange }: Props) {
  const [modifyText, setModifyText] = useState('')
  const [queryText, setQueryText] = useState('')
  const [queryResult, setQueryResult] = useState<string>('')
  const [isModifying, setIsModifying] = useState(false)
  const [isQuerying, setIsQuerying] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [securityIssues, setSecurityIssues] = useState<any[]>([])

  const handleModify = async () => {
    if (!ir || !modifyText.trim()) return
    setIsModifying(true)
    try {
      const resp = await fetch(`${API_BASE}/api/diagrams/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagram_id: diagramId || 'temp',
          instruction: modifyText,
          ir_json: ir,
        }),
      })
      const data = await resp.json()
      if (data.ir) {
        onIrChange(data.ir)
        setModifyText('')
        toast.success('수정 완료!')
      }
    } catch (e) {
      toast.error('수정 실패')
    } finally {
      setIsModifying(false)
    }
  }

  const handleQuery = async (q?: string) => {
    const query = q || queryText
    if (!ir || !query.trim()) return
    setIsQuerying(true)
    setQueryResult('')
    try {
      const resp = await fetch(`${API_BASE}/api/diagrams/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir_json: ir, query }),
      })
      const data = await resp.json()
      const explanation = data.explanation || data.answer || JSON.stringify(data)
      setQueryResult(explanation)
    } catch (e) {
      toast.error('쿼리 실패')
    } finally {
      setIsQuerying(false)
    }
  }

  const handleSecurityAnalysis = async () => {
    if (!ir) return
    setIsAnalyzing(true)
    setSecurityIssues([])
    try {
      const resp = await fetch(`${API_BASE}/api/analyze/security`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir_json: ir }),
      })
      const data = await resp.json()
      setSecurityIssues(data.issues || [])
      if ((data.issues || []).length === 0) {
        toast.success('보안 이슈 없음!')
      }
    } catch (e) {
      toast.error('분석 실패')
    } finally {
      setIsAnalyzing(false)
    }
  }

  if (!ir) return (
    <div className="ai-panel ai-panel-empty">
      <p>다이어그램을 생성하면 AI 기능이 활성화됩니다</p>
    </div>
  )

  return (
    <div className="ai-panel">
      {/* 자연어 수정 */}
      <section className="ai-section">
        <h3>자연어 수정</h3>
        <textarea
          value={modifyText}
          onChange={e => setModifyText(e.target.value)}
          placeholder="예: AKS랑 SQL 사이 화살표 반대로&#10;Redis 노드 추가해줘&#10;Internet 노드 색상 빨간색으로"
          rows={4}
          className="input-textarea small"
        />
        <button
          onClick={handleModify}
          disabled={isModifying || !modifyText.trim()}
          className="btn-primary full-width"
        >
          {isModifying ? '수정 중...' : '수정 적용'}
        </button>
      </section>

      {/* 자연어 쿼리 */}
      <section className="ai-section">
        <h3>자연어 쿼리</h3>
        <div className="quick-queries">
          {QUICK_QUERIES.map(q => (
            <button
              key={q}
              className="quick-query-btn"
              onClick={() => handleQuery(q)}
            >
              {q}
            </button>
          ))}
        </div>
        <textarea
          value={queryText}
          onChange={e => setQueryText(e.target.value)}
          placeholder="직접 쿼리 입력..."
          rows={2}
          className="input-textarea small"
        />
        <button
          onClick={() => handleQuery()}
          disabled={isQuerying || !queryText.trim()}
          className="btn-secondary full-width"
        >
          {isQuerying ? '분석 중...' : '쿼리'}
        </button>
        {queryResult && (
          <div className="query-result">{queryResult}</div>
        )}
      </section>

      {/* 보안 분석 */}
      <section className="ai-section">
        <h3>보안 분석</h3>
        <button
          onClick={handleSecurityAnalysis}
          disabled={isAnalyzing}
          className="btn-warning full-width"
        >
          {isAnalyzing ? '분석 중...' : '보안 레이어 분석'}
        </button>
        {securityIssues.length > 0 && (
          <div className="security-issues">
            {securityIssues.map((issue, i) => (
              <div key={i} className={`issue-item ${issue.severity?.toLowerCase()}`}>
                <span className="issue-severity">{issue.severity}</span>
                <strong>{issue.title}</strong>
                <p>{issue.description}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
