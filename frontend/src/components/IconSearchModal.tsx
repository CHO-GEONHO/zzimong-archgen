import { useState, useEffect } from 'react'

const API_BASE = ''

// 자체 컬러를 가진 팩 (color 파라미터 금지)
const COLORED_PREFIXES = new Set([
  'logos', 'devicon', 'devicon-plain', 'vscode-icons',
  'flat-color-icons', 'skill-icons', 'noto', 'noto-v1',
  'emojione', 'twemoji',
])

interface IconResult {
  id: string
  name: string
  source: string
  preview_url: string
  download_url: string
}

interface Props {
  nodeId: string
  nodeType: string
  nodeLabel: string
  onApply: (nodeId: string, iconKey: string) => void
  onClose: () => void
}

function makePreviewUrl(iconId: string): string {
  const parts = iconId.split(':')
  if (parts.length !== 2) return `https://api.iconify.design/${iconId}.svg`
  const [prefix, name] = parts
  const color = COLORED_PREFIXES.has(prefix) ? '' : '&color=%23e2e8f0'
  return `https://api.iconify.design/${prefix}/${name}.svg?height=48${color}`
}

/** Iconify API 직접 검색 (백엔드 실패 시 폴백) */
async function searchIconifyDirect(query: string): Promise<IconResult[]> {
  const prefixes = 'skill-icons,logos,devicon,simple-icons,mdi,carbon'
  const resp = await fetch(
    `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=24&prefixes=${prefixes}`
  )
  const data = await resp.json()
  const icons: string[] = data.icons || []
  return icons.map(id => {
    const [prefix, name] = id.split(':')
    return {
      id,
      name: name || id,
      source: prefix || '',
      preview_url: makePreviewUrl(id),
      download_url: `https://api.iconify.design/${prefix}/${name}.svg`,
    }
  })
}

export default function IconSearchModal({ nodeId, nodeType, nodeLabel, onApply, onClose }: Props) {
  const [results, setResults] = useState<IconResult[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState('')

  // 최초 로드: 노드 타입으로 자동 검색
  useEffect(() => {
    fetchIcons(nodeType)
  }, [nodeType])

  const fetchIcons = async (searchQuery: string) => {
    setLoading(true)
    setErrMsg('')
    let items: IconResult[] = []

    // 1차: 백엔드 검색 (키워드 매핑 + Iconify)
    try {
      const resp = await fetch(`${API_BASE}/api/icons/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_type: searchQuery, context: nodeLabel }),
      })
      if (resp.ok) {
        const data = await resp.json()
        items = data.results || []
      }
    } catch {
      // 백엔드 실패 - 폴백으로 진행
    }

    // 2차: 백엔드 결과 없으면 Iconify 직접 검색
    if (items.length === 0) {
      try {
        items = await searchIconifyDirect(searchQuery)
      } catch {
        setErrMsg('Iconify API 연결 실패')
      }
    }

    setResults(items)
    setLoading(false)
    setSearching(false)
  }

  const handleSearch = () => {
    if (!query.trim()) return
    setSearching(true)
    fetchIcons(query.trim())
  }

  const handleApply = (result: IconResult) => {
    onApply(nodeId, result.id)
    onClose()
  }

  return (
    <div className="icon-modal-overlay" onClick={onClose}>
      <div className="icon-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="icon-modal-header">
          <div>
            <div className="icon-modal-title">아이콘 검색</div>
            <div className="icon-modal-subtitle">{nodeLabel} · {nodeType}</div>
          </div>
          <button className="icon-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Search */}
        <div className="icon-modal-search">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="예: kubernetes, redis, nginx, lock, building..."
            className="icon-modal-input"
            autoFocus
          />
          <button
            className="icon-modal-btn"
            onClick={handleSearch}
            disabled={searching || !query.trim()}
          >
            {searching ? '...' : '검색'}
          </button>
        </div>

        {/* Results */}
        <div className="icon-modal-results">
          {loading ? (
            <div className="icon-modal-loading">
              <span className="icon-modal-spinner">⟳</span> 검색 중...
            </div>
          ) : results.length === 0 ? (
            <div className="icon-modal-empty">
              {errMsg || '결과 없음. 영문 키워드로 검색해보세요. (예: lock, cart, database)'}
            </div>
          ) : (
            <div className="icon-modal-grid">
              {results.map(r => (
                <button
                  key={r.id}
                  className={`icon-modal-item${hovered === r.id ? ' hovered' : ''}`}
                  onMouseEnter={() => setHovered(r.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => handleApply(r)}
                  title={r.id}
                >
                  <img
                    src={r.preview_url}
                    alt={r.name}
                    className="icon-modal-preview"
                    onError={e => {
                      (e.target as HTMLImageElement).src =
                        `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="18" font-size="16">?</text></svg>`
                    }}
                  />
                  <span className="icon-modal-name">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="icon-modal-footer">
          Iconify CDN · 무료 오픈소스 아이콘
        </div>
      </div>
    </div>
  )
}
