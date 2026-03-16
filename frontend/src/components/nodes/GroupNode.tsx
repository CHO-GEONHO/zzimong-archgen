import { useState, useRef, useEffect } from 'react'
import { NodeResizer } from 'reactflow'

interface GroupNodeData {
  label: string
  cloud?: string
  region?: string
  color?: string
  onLabelChange?: (id: string, patch: { label?: string }) => void
  onGroupResize?: (groupId: string, dx: number, dy: number) => void
  onResizeEnd?: () => void
}

function InlineInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <input
      ref={ref}
      className="node-inline-input group-label-input"
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

export default function GroupNode({ id, data, selected }: { id: string; data: GroupNodeData; selected?: boolean }) {
  const [editing, setEditing] = useState(false)
  // 리사이즈 시작 시 부모 position 기록 → delta 계산으로 자식 보정
  const prevPos = useRef<{ x: number; y: number } | null>(null)

  const commit = (val: string) => {
    setEditing(false)
    if (val !== data.label) data.onLabelChange?.(id, { label: val })
  }

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={80}
        lineStyle={{ borderColor: data.color || '#888888', borderWidth: 2 }}
        handleStyle={{ width: 10, height: 10, borderRadius: 3, background: data.color || '#888888' }}
        onResizeStart={(_, params) => {
          prevPos.current = { x: params.x, y: params.y }
        }}
        onResize={(_, params) => {
          if (!prevPos.current) return
          const dx = params.x - prevPos.current.x
          const dy = params.y - prevPos.current.y
          if (dx !== 0 || dy !== 0) {
            data.onGroupResize?.(id, dx, dy)
            prevPos.current = { x: params.x, y: params.y }
          }
        }}
        onResizeEnd={() => {
          prevPos.current = null
          data.onResizeEnd?.()
        }}
      />
      <div className="group-node-header">
        <div className="group-cloud-indicator" style={{ background: data.color || '#888' }} />
        {editing ? (
          <InlineInput value={data.label} onCommit={commit} />
        ) : (
          <span
            className="group-label"
            onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
            title="더블클릭하여 편집"
          >{data.label}</span>
        )}
        {data.region && <span className="group-region">{data.region}</span>}
      </div>
    </>
  )
}
