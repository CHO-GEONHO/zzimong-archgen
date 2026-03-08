import { useState } from 'react'
import toast from 'react-hot-toast'
import type { ArchIR } from "../App"

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8081'

type InputTab = 'text' | 'cli' | 'git'

const CLI_HINTS: Record<string, string[]> = {
  azure: [
    'az resource list --output json',
    'az aks list --output json',
    'kubectl get all --all-namespaces -o json',
  ],
  gcp: [
    'gcloud container clusters list --format=json',
    'gcloud compute instances list --format=json',
    'kubectl get all --all-namespaces -o json',
  ],
  k8s: [
    'kubectl get all --all-namespaces -o json',
    'kubectl get nodes -o json',
    'kubectl get ingress --all-namespaces -o json',
  ],
  aws: [
    'aws ec2 describe-instances --output json',
    'aws eks list-clusters --output json',
  ],
}

interface Props {
  onParsed: (ir: ArchIR, id?: string) => void
  isLoading: boolean
  setIsLoading: (v: boolean) => void
}

export default function InputPanel({ onParsed, isLoading, setIsLoading }: Props) {
  const [tab, setTab] = useState<InputTab>('text')
  const [textInput, setTextInput] = useState('')
  const [cliOutput, setCliOutput] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [gitToken, setGitToken] = useState('')
  const [cloudHint, setCloudHint] = useState<keyof typeof CLI_HINTS>('k8s')

  const handleParseText = async () => {
    if (!textInput.trim()) return
    setIsLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/parse/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textInput }),
      })
      const data = await resp.json()
      if (data.ir) {
        onParsed(data.ir)
        toast.success('다이어그램 생성 완료!')
      }
    } catch (e) {
      toast.error('파싱 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const handleParseCli = async () => {
    if (!cliOutput.trim()) return
    setIsLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/parse/cli`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output: cliOutput, cloud_hint: cloudHint }),
      })
      const data = await resp.json()
      if (data.ir) {
        onParsed(data.ir)
        toast.success('CLI 출력 분석 완료!')
      }
    } catch (e) {
      toast.error('분석 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const handleParseGit = async () => {
    if (!gitUrl.trim()) return
    setIsLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/parse/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: gitUrl, github_token: gitToken || undefined }),
      })
      const data = await resp.json()
      if (data.ir) {
        onParsed(data.ir)
        toast.success('Git 레포 분석 완료!')
      }
    } catch (e) {
      toast.error('Git 분석 실패')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="input-panel">
      {/* 탭 */}
      <div className="tab-bar">
        {(['text', 'cli', 'git'] as InputTab[]).map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'text' ? '텍스트' : t === 'cli' ? 'CLI 출력' : 'Git URL'}
          </button>
        ))}
      </div>

      {/* 텍스트 탭 */}
      {tab === 'text' && (
        <div className="tab-content">
          <p className="hint">인프라 구조를 자유롭게 설명하세요</p>
          <textarea
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            placeholder="예: Azure AKS 클러스터 위에 3개의 Pod가 있고, Azure SQL과 Redis Cache로 연결됩니다..."
            rows={10}
            className="input-textarea"
          />
          <button
            onClick={handleParseText}
            disabled={isLoading || !textInput.trim()}
            className="btn-generate"
          >
            {isLoading ? '생성 중...' : '다이어그램 생성'}
          </button>
        </div>
      )}

      {/* CLI 탭 */}
      {tab === 'cli' && (
        <div className="tab-content">
          <div className="cloud-selector">
            {Object.keys(CLI_HINTS).map(c => (
              <button
                key={c}
                className={`cloud-btn ${cloudHint === c ? 'active' : ''}`}
                onClick={() => setCloudHint(c as any)}
              >
                {c.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="cli-hints">
            <p className="hint">터미널에서 아래 명령어를 실행 후 결과를 붙여넣으세요:</p>
            {CLI_HINTS[cloudHint].map(cmd => (
              <code key={cmd} className="cli-cmd">{cmd}</code>
            ))}
          </div>
          <textarea
            value={cliOutput}
            onChange={e => setCliOutput(e.target.value)}
            placeholder="CLI 출력 결과를 여기에 붙여넣기..."
            rows={10}
            className="input-textarea"
          />
          <button
            onClick={handleParseCli}
            disabled={isLoading || !cliOutput.trim()}
            className="btn-generate"
          >
            {isLoading ? '분석 중...' : '분석하기'}
          </button>
        </div>
      )}

      {/* Git 탭 */}
      {tab === 'git' && (
        <div className="tab-content">
          <p className="hint">Git 레포 URL을 입력하면 K8s YAML, Dockerfile 등을 자동 분석합니다</p>
          <input
            type="url"
            value={gitUrl}
            onChange={e => setGitUrl(e.target.value)}
            placeholder="https://github.com/username/repo"
            className="input-text"
          />
          <input
            type="password"
            value={gitToken}
            onChange={e => setGitToken(e.target.value)}
            placeholder="Private 레포: GitHub PAT (선택사항)"
            className="input-text"
          />
          <button
            onClick={handleParseGit}
            disabled={isLoading || !gitUrl.trim()}
            className="btn-generate"
          >
            {isLoading ? '분석 중...' : 'Git 레포 분석'}
          </button>
        </div>
      )}
    </div>
  )
}
