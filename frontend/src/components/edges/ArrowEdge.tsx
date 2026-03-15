import React, { useState, useRef } from 'react'
import { getBezierPath, getSmoothStepPath, BaseEdge, Position, EdgeLabelRenderer, useStore } from 'reactflow'
import type { EdgeProps } from 'reactflow'

// Context: DiagramEditor가 provide, ArrowEdge가 consume
export const EdgeDataUpdateCtx = React.createContext<
  (id: string, patch: Record<string, unknown>) => void
>(() => {})

const ARROW_LEN = 10
const ARROW_HALF = 3.5

function arrowPoints(x: number, y: number, angle: number): string {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const bx = x - ARROW_LEN * cos, by = y - ARROW_LEN * sin
  const px = -sin, py = cos
  return `${x},${y} ${bx + ARROW_HALF * px},${by + ARROW_HALF * py} ${bx - ARROW_HALF * px},${by - ARROW_HALF * py}`
}

const ARRIVAL: Record<string, number> = {
  [Position.Left]:   0,
  [Position.Right]:  Math.PI,
  [Position.Top]:    Math.PI / 2,
  [Position.Bottom]: -Math.PI / 2,
}

const DEPARTURE: Record<string, number> = {
  [Position.Right]:  0,
  [Position.Left]:   Math.PI,
  [Position.Bottom]: Math.PI / 2,
  [Position.Top]:    -Math.PI / 2,
}

export default function ArrowEdge(props: EdgeProps) {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    style, data, label, labelStyle, labelBgStyle,
  } = props

  const updateEdgeData = React.useContext(EdgeDataUpdateCtx)
  const zoom = useStore(s => s.transform[2])
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const arrow: string = data?.arrow ?? 'forward'
  const color: string = (style as any)?.stroke ?? '#94a3b8'
  const routing: string = data?.routing ?? 'bezier'
  const storedOffsetX: number = data?.labelOffsetX ?? 0
  const storedOffsetY: number = data?.labelOffsetY ?? 0

  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)

  const [edgePath, labelX, labelY] = routing === 'smoothstep'
    ? getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
    : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const showEnd   = arrow === 'forward'  || arrow === 'both'
  const showStart = arrow === 'backward' || arrow === 'both'

  const endAngle   = ARRIVAL[targetPosition]   ?? 0
  const startAngle = (DEPARTURE[sourcePosition] ?? 0) + Math.PI

  const effectiveOffsetX = dragOffset ? dragOffset.x : storedOffsetX
  const effectiveOffsetY = dragOffset ? dragOffset.y : storedOffsetY
  const finalLabelX = labelX + effectiveOffsetX
  const finalLabelY = labelY + effectiveOffsetY

  const onLabelMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const startMx = e.clientX
    const startMy = e.clientY
    const startOx = storedOffsetX
    const startOy = storedOffsetY

    const onMouseMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startMx) / zoomRef.current
      const dy = (ev.clientY - startMy) / zoomRef.current
      setDragOffset({ x: startOx + dx, y: startOy + dy })
    }

    const onMouseUp = (ev: MouseEvent) => {
      const dx = (ev.clientX - startMx) / zoomRef.current
      const dy = (ev.clientY - startMy) / zoomRef.current
      setDragOffset(null)
      updateEdgeData(id, { labelOffsetX: startOx + dx, labelOffsetY: startOy + dy })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const labelText = typeof label === 'string' ? label : ''

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} />
      {showEnd && (
        <polygon points={arrowPoints(targetX, targetY, endAngle)} fill={color} />
      )}
      {showStart && (
        <polygon points={arrowPoints(sourceX, sourceY, startAngle)} fill={color} />
      )}
      {labelText && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${finalLabelX}px, ${finalLabelY}px)`,
              cursor: dragOffset ? 'grabbing' : 'grab',
              pointerEvents: 'all',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
              userSelect: 'none',
              whiteSpace: 'nowrap',
              ...(labelBgStyle as object),
              ...(labelStyle as object),
            }}
            onMouseDown={onLabelMouseDown}
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
