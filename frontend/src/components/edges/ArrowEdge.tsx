import { getBezierPath, getSmoothStepPath, BaseEdge } from 'reactflow'
import type { EdgeProps } from 'reactflow'

export default function ArrowEdge(props: EdgeProps) {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    style, data,
    label, labelStyle, labelBgStyle, labelBgPadding, labelBgBorderRadius,
  } = props

  const arrow: string = data?.arrow ?? 'forward'
  const color: string = (style as any)?.stroke ?? '#94a3b8'
  const routing: string = data?.routing ?? 'bezier'

  const [edgePath, labelX, labelY] = routing === 'smoothstep'
    ? getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
    : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const endId   = `ae-end-${id}`
  const startId = `ae-start-${id}`
  const showEnd   = arrow === 'forward'  || arrow === 'both'
  const showStart = arrow === 'backward' || arrow === 'both'

  return (
    <>
      <defs>
        <marker id={endId} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill={color} />
        </marker>
        <marker id={startId} markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse">
          <polygon points="0 0, 10 3.5, 0 7" fill={color} />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={showEnd   ? `url(#${endId})`   : undefined}
        markerStart={showStart ? `url(#${startId})` : undefined}
        labelX={labelX}
        labelY={labelY}
        label={label}
        labelStyle={labelStyle}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding as [number, number] | undefined}
        labelBgBorderRadius={labelBgBorderRadius}
      />
    </>
  )
}
