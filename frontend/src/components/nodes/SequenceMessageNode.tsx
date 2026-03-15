interface SequenceMessageData {
  label: string
  sourceIdx: number
  targetIdx: number
  totalActors: number
  actorSpacing: number
  stepNum: number
}

export default function SequenceMessageNode({ data }: { data: SequenceMessageData }) {
  const { label, sourceIdx, targetIdx, actorSpacing, stepNum } = data
  const fromX = sourceIdx * actorSpacing + actorSpacing / 2
  const toX = targetIdx * actorSpacing + actorSpacing / 2
  const isForward = toX >= fromX
  const left = Math.min(fromX, toX)
  const width = Math.abs(toX - fromX)
  const midX = left + width / 2

  const ARROW = 7

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}>
      <svg
        style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
        width="100%"
        height="100%"
      >
        {/* Horizontal line */}
        <line
          x1={fromX} y1={24}
          x2={toX}   y2={24}
          stroke="rgba(148,163,184,0.8)"
          strokeWidth={1.5}
        />
        {/* Arrowhead */}
        {isForward ? (
          <polygon
            points={`${toX},24 ${toX - ARROW},${24 - 3.5} ${toX - ARROW},${24 + 3.5}`}
            fill="rgba(148,163,184,0.9)"
          />
        ) : (
          <polygon
            points={`${toX},24 ${toX + ARROW},${24 - 3.5} ${toX + ARROW},${24 + 3.5}`}
            fill="rgba(148,163,184,0.9)"
          />
        )}
      </svg>

      {/* Label above the arrow */}
      {label && (
        <div
          style={{
            position: 'absolute',
            left: midX,
            top: 4,
            transform: 'translateX(-50%)',
            fontSize: 10,
            fontWeight: 500,
            color: 'rgba(226,232,240,0.9)',
            whiteSpace: 'nowrap',
            background: 'rgba(10,10,15,0.7)',
            padding: '1px 6px',
            borderRadius: 3,
            pointerEvents: 'none',
          }}
        >
          {stepNum}. {label}
        </div>
      )}
    </div>
  )
}
