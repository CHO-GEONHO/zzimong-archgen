import React, { useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeResizer } from 'reactflow'

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
  iconOnly?: boolean
  width?: number
  height?: number
  onSearchIcon?: (nodeId: string, nodeType: string, label: string) => void
  onLabelChange?: (id: string, patch: { label?: string; sublabel?: string }) => void
  onNodeResize?: (id: string, w: number, h: number) => void
  onNodeResizeEnd?: () => void
  onDelete?: (id: string) => void
}

const SIDES = [
  { pos: Position.Top,    id: 'top'    },
  { pos: Position.Right,  id: 'right'  },
  { pos: Position.Bottom, id: 'bottom' },
  { pos: Position.Left,   id: 'left'   },
]

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

function InlineInput({
  value,
  onCommit,
  className,
}: {
  value: string
  onCommit: (v: string) => void
  className?: string
}) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  return (
    <input
      ref={ref}
      className={`node-inline-input${className ? ' ' + className : ''}`}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); onCommit(text) }
        if (e.key === 'Escape') { onCommit(value) }
      }}
      onDoubleClick={e => e.stopPropagation()}
    />
  )
}

export default function InfraNode({ id, data, selected }: { id: string; data: InfraNodeData; selected?: boolean }) {
  const [editingField, setEditingField] = useState<'label' | 'sublabel' | null>(null)
  const hasIcon = !!data.iconUrl

  const commit = (field: 'label' | 'sublabel', val: string) => {
    setEditingField(null)
    if (val !== (field === 'label' ? data.label : data.sublabel)) {
      data.onLabelChange?.(id, { [field]: val })
    }
  }

  if (data.iconOnly) {
    // 아이콘온리 모드: 리사이즈 가능 정사각형 카드
    const nodeSize = Math.min(data.width ?? 80, data.height ?? 80)
    const iconSize = Math.round(Math.min(Math.max(nodeSize * 0.55, 24), 72))
    return (
      <div className="infra-node infra-node-icon-only" style={{ width: data.width ?? 80, height: data.height ?? 80 }}>
        {selected && data.onDelete && (
          <button className="node-delete-btn" title="노드 삭제" onClick={e => { e.stopPropagation(); data.onDelete!(id) }}>✕</button>
        )}
        <NodeResizer
          isVisible={selected}
          minWidth={60}
          minHeight={60}
          lineStyle={{ borderColor: '#6366f1', borderWidth: 1.5 }}
          handleStyle={{ width: 8, height: 8, borderRadius: 2, background: '#6366f1' }}
          onResize={(_, params) => data.onNodeResize?.(id, params.width, params.height)}
          onResizeEnd={() => data.onNodeResizeEnd?.()}
        />
        {SIDES.map(({ pos, id: sid }) => (
          <React.Fragment key={sid}>
            <Handle type="target" position={pos} id={`${sid}-t`} className="node-handle" />
            <Handle type="source" position={pos} id={`${sid}-s`} className="node-handle" />
          </React.Fragment>
        ))}
        <div
          className="node-icon-wrap node-icon-clickable"
          style={{ width: iconSize, height: iconSize }}
          title="클릭하여 아이콘 변경"
          onClick={e => { e.stopPropagation(); data.onSearchIcon?.(data.nodeId || '', data.nodeType || '', data.label) }}
        >
          {hasIcon ? (
            <img src={data.iconUrl!} className="node-icon-large" width={iconSize} height={iconSize}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="node-icon-placeholder" style={{ width: iconSize, height: iconSize, fontSize: Math.round(iconSize * 0.42) }}>
              {data.nodeType?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div className="node-icon-edit-overlay">✎</div>
        </div>
        {editingField === 'label' ? (
          <InlineInput value={data.label} onCommit={v => commit('label', v)} className="icon-only-label-input" />
        ) : (
          <span
            className="icon-only-label"
            onDoubleClick={e => { e.stopPropagation(); setEditingField('label') }}
          >{truncate(data.label, Math.max(8, Math.floor((data.width ?? 80) / 6)))}</span>
        )}
      </div>
    )
  }

  // 일반 모드: 리사이즈 가능 카드
  const nodeW = data.width ?? 160
  const iconSize = Math.round(Math.min(Math.max(nodeW * 0.22, 24), 56))

  return (
    <div className="infra-node" style={{ width: data.width, minWidth: data.width ? undefined : undefined }}>
      {selected && data.onDelete && (
        <button className="node-delete-btn" title="노드 삭제" onClick={e => { e.stopPropagation(); data.onDelete!(id) }}>✕</button>
      )}
      <NodeResizer
        isVisible={selected}
        minWidth={100}
        minHeight={60}
        lineStyle={{ borderColor: '#6366f1', borderWidth: 1.5 }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: '#6366f1' }}
        onResize={(_, params) => data.onNodeResize?.(id, params.width, params.height)}
        onResizeEnd={() => data.onNodeResizeEnd?.()}
      />
      {SIDES.map(({ pos, id: sid }) => (
        <React.Fragment key={sid}>
          <Handle type="target" position={pos} id={`${sid}-t`} className="node-handle" />
          <Handle type="source" position={pos} id={`${sid}-s`} className="node-handle" />
        </React.Fragment>
      ))}

      <div className="infra-node-content">
        {/* 아이콘 영역 */}
        {hasIcon ? (
          <div
            className="node-icon-wrap node-icon-clickable"
            title="클릭하여 아이콘 변경"
            onClick={e => { e.stopPropagation(); data.onSearchIcon?.(data.nodeId || '', data.nodeType || '', data.label) }}
          >
            <img
              src={data.iconUrl!}
              className="node-icon"
              width={iconSize}
              height={iconSize}
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
            <div className="node-icon-edit-overlay">✎</div>
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
          {editingField === 'label' ? (
            <InlineInput value={data.label} onCommit={v => commit('label', v)} />
          ) : (
            <div
              className="node-label"
              onDoubleClick={e => { e.stopPropagation(); setEditingField('label') }}
              title="더블클릭하여 편집"
            >{data.label}</div>
          )}
          {editingField === 'sublabel' ? (
            <InlineInput value={data.sublabel || ''} onCommit={v => commit('sublabel', v)} />
          ) : (
            data.sublabel !== undefined && (
              <div
                className="node-sublabel"
                onDoubleClick={e => { e.stopPropagation(); setEditingField('sublabel') }}
                title="더블클릭하여 편집"
              >{data.sublabel}</div>
            )
          )}
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
