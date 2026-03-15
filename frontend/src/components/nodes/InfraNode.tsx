import React from 'react'
import { Handle, Position } from 'reactflow'

interface InfraNodeData {
  label: string
  sublabel?: string
  iconUrl?: string | null
  iconKey?: string | null
  ip?: string
  port?: string
  tags?: string[]
  nodeType?: string
  nodeId?: string
  theme?: string
  onSearchIcon?: (nodeId: string, nodeType: string, label: string) => void
}

const SIDES = [
  { pos: Position.Top,    id: 'top'    },
  { pos: Position.Right,  id: 'right'  },
  { pos: Position.Bottom, id: 'bottom' },
  { pos: Position.Left,   id: 'left'   },
]

export default function InfraNode({ data }: { data: InfraNodeData }) {
  const hasIcon = !!data.iconUrl

  return (
    <div className="infra-node">
      {SIDES.map(({ pos, id }) => (
        <React.Fragment key={id}>
          <Handle type="target" position={pos} id={`${id}-t`} className="node-handle" />
          <Handle type="source" position={pos} id={`${id}-s`} className="node-handle" />
        </React.Fragment>
      ))}

      <div className="infra-node-content">
        {/* 아이콘 영역 */}
        {hasIcon ? (
          <div
            className="node-icon-wrap node-icon-clickable"
            title={`${data.iconKey || ''}\n클릭하여 아이콘 변경`}
            onClick={e => { e.stopPropagation(); data.onSearchIcon?.(data.nodeId || '', data.nodeType || '', data.label) }}
          >
            <img
              src={data.iconUrl!}
              className="node-icon"
              width={36}
              height={36}
              onError={e => {
                const el = e.target as HTMLImageElement
                el.style.display = 'none'
                const ph = el.parentElement?.querySelector('.node-icon-placeholder') as HTMLElement
                if (ph) ph.style.display = 'flex'
              }}
            />
            <div className="node-icon-placeholder" style={{ display: 'none' }}>
              {data.nodeType?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="node-icon-edit-hint">✎</div>
          </div>
        ) : (
          <div
            className="node-icon-placeholder node-icon-missing"
            onClick={e => { e.stopPropagation(); data.onSearchIcon?.(data.nodeId || '', data.nodeType || '', data.label) }}
            title="클릭하여 아이콘 검색"
          >
            {data.nodeType?.[0]?.toUpperCase() || '?'}
            <span className="node-icon-search-hint">🔍</span>
          </div>
        )}

        <div className="node-labels">
          <div className="node-label">{data.label}</div>
          {data.sublabel && <div className="node-sublabel">{data.sublabel}</div>}
          <div className="node-badges">
            {data.ip && <span className="node-badge ip">{data.ip}</span>}
            {data.port && <span className="node-badge port">:{data.port}</span>}
          </div>
        </div>
      </div>

      {data.tags?.includes('spot_instance') && (
        <span className="node-tag spot">Spot</span>
      )}

    </div>
  )
}
