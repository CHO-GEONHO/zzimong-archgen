import { useState, useEffect } from 'react'

const API_BASE = ''

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

export default function IconSearchModal({ nodeId, nodeType, nodeLabel, onApply, onClose }: Props) {
  const [results, setResults] = useState<IconResult[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  // 최초 로드: 노드 타입으로 자동 검색
  useEffect(() => {
    fetchIcons(nodeType)
  }, [nodeType])

  const fetchIcons = async (searchQuery: string) => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/icons/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_type: searchQuery, context: nodeLabel }),
      })
      const data = await resp.json()
      setResults(data.results || [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
      setSearching(false)
    }
  }

  const handleSearch = () => {
    if (!query.trim()) return
    setSearching(true)
    fetchIcons(query.trim())
  }

  const handleApply = (result: IconResult) => {
    // Iconify CDN 형식으로 변환: "prefix:name"
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
            placeholder="예: kubernetes, redis, nginx..."
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
            <div className="icon-modal-empty">결과 없음. 다른 키워드로 검색해보세요.</div>
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
