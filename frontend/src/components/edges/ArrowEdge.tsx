import React, { useState, useRef } from 'react'
import { getBezierPath, getSmoothStepPath, getStraightPath, BaseEdge, Position, EdgeLabelRenderer, useStore } from 'reactflow'
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

// ── Waypoint 타입 ──────────────────────────────────────────────────────────────
interface WP { x: number; y: number }

// polyline SVG path: source → wp[0] → wp[1] → ... → target
function buildPolylinePath(sx: number, sy: number, tx: number, ty: number, wps: WP[]): string {
  const pts: WP[] = [{ x: sx, y: sy }, ...wps, { x: tx, y: ty }]
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

// polyline 레이블 중점: 가장 긴 세그먼트의 중간
function polylineLabelCenter(sx: number, sy: number, tx: number, ty: number, wps: WP[]): WP {
  const pts: WP[] = [{ x: sx, y: sy }, ...wps, { x: tx, y: ty }]
  let maxLen = 0, bestMid: WP = { x: (sx + tx) / 2, y: (sy + ty) / 2 }
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i+1].x - pts[i].x, dy = pts[i+1].y - pts[i].y
    const len = Math.sqrt(dx*dx + dy*dy)
    if (len > maxLen) {
      maxLen = len
      bestMid = { x: (pts[i].x + pts[i+1].x) / 2, y: (pts[i].y + pts[i+1].y) / 2 }
    }
  }
  return bestMid
}

// polyline 끝 화살표 각도: 마지막 세그먼트 방향
function polylineEndAngle(tx: number, ty: number, wps: WP[]): number {
  const prev = wps.length > 0 ? wps[wps.length - 1] : null
  if (!prev) return 0
  return Math.atan2(ty - prev.y, tx - prev.x)
}

// polyline 시작 화살표 각도: 첫 세그먼트 반대 방향
function polylineStartAngle(sx: number, sy: number, wps: WP[]): number {
  const next = wps.length > 0 ? wps[0] : null
  if (!next) return Math.PI
  return Math.atan2(sy - next.y, sx - next.x)
}

export default function ArrowEdge(props: EdgeProps) {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    style, data, label, labelStyle, labelBgStyle,
    selected,
  } = props

  const updateEdgeData = React.useContext(EdgeDataUpdateCtx)
  const transform = useStore(s => s.transform) // [panX, panY, zoom]
  const zoom = transform[2]
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const transformRef = useRef(transform)
  transformRef.current = transform

  const arrow: string = data?.arrow ?? 'forward'
  const color: string = (style as any)?.stroke ?? '#94a3b8'
  const routing: string = data?.routing ?? 'straight'
  const storedOffsetX: number = data?.labelOffsetX ?? 0
  const storedOffsetY: number = data?.labelOffsetY ?? 0
  const storedWaypoints: WP[] = data?.waypoints ?? []

  // 라벨 드래그 상태
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  // 웨이포인트 드래그 상태: { wpIdx, wps(미리보기) }
  const [wpDrag, setWpDrag] = useState<{ idx: number; wps: WP[] } | null>(null)
  // straight/smoothstep 선택 시 가상 꺾임 드래그 상태
  const [virtualDrag, setVirtualDrag] = useState<{ idx: number; wps: WP[] } | null>(null)

  // polyline이면서 저장된 waypoint가 없을 때 → 렌더 시 Z자 계산 (side-effect 없음)
  // 사용자가 드래그하면 그때 storedWaypoints에 저장됨
  function computeDefaultPolylineWps(): WP[] {
    const dx = targetX - sourceX
    const dy = targetY - sourceY
    return Math.abs(dx) >= Math.abs(dy)
      ? [{ x: (sourceX + targetX) / 2, y: sourceY },
         { x: (sourceX + targetX) / 2, y: targetY }]
      : [{ x: sourceX, y: (sourceY + targetY) / 2 },
         { x: targetX, y: (sourceY + targetY) / 2 }]
  }

  // straight/smoothstep 선택 시 가상 핸들 위치 (Z자)
  const virtualWps: WP[] = routing !== 'polyline' ? computeDefaultPolylineWps() : []

  // 현재 표시할 waypoints
  const currentWps: WP[] = wpDrag
    ? wpDrag.wps
    : storedWaypoints.length > 0
      ? storedWaypoints
      : routing === 'polyline' ? computeDefaultPolylineWps() : []

  // ── 경로 계산 ────────────────────────────────────────────────────────────────
  let edgePath: string
  let labelX: number
  let labelY: number
  let endAngle: number
  let startAngle: number

  if (virtualDrag) {
    // 가상 꺾임 드래그 중: polyline 경로로 미리보기
    const wps = virtualDrag.wps
    edgePath = buildPolylinePath(sourceX, sourceY, targetX, targetY, wps)
    const lc = polylineLabelCenter(sourceX, sourceY, targetX, targetY, wps)
    labelX = lc.x; labelY = lc.y
    endAngle   = polylineEndAngle(targetX, targetY, wps)
    startAngle = polylineStartAngle(sourceX, sourceY, wps)
  } else if (routing === 'polyline') {
    edgePath = buildPolylinePath(sourceX, sourceY, targetX, targetY, currentWps)
    const lc = polylineLabelCenter(sourceX, sourceY, targetX, targetY, currentWps)
    labelX = lc.x; labelY = lc.y
    endAngle   = currentWps.length > 0 ? polylineEndAngle(targetX, targetY, currentWps) : Math.atan2(targetY - sourceY, targetX - sourceX)
    startAngle = currentWps.length > 0 ? polylineStartAngle(sourceX, sourceY, currentWps) : Math.atan2(sourceY - targetY, sourceX - targetX)
  } else if (routing === 'straight') {
    // straight: 실제 선 방향으로 화살표 각도 계산
    const [path, lx, ly] = getStraightPath({ sourceX, sourceY, targetX, targetY })
    edgePath = path; labelX = lx; labelY = ly
    endAngle   = Math.atan2(targetY - sourceY, targetX - sourceX)
    startAngle = Math.atan2(sourceY - targetY, sourceX - targetX)
  } else {
    // bezier / smoothstep: 핸들 방향 기반 각도 (곡선 끝 방향과 일치)
    const [path, lx, ly] = routing === 'smoothstep'
      ? getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
      : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
    edgePath = path; labelX = lx; labelY = ly
    endAngle   = ARRIVAL[targetPosition]   ?? 0
    startAngle = (DEPARTURE[sourcePosition] ?? 0) + Math.PI
  }

  const showEnd   = arrow === 'forward'  || arrow === 'both'
  const showStart = arrow === 'backward' || arrow === 'both'

  const effectiveOffsetX = dragOffset ? dragOffset.x : storedOffsetX
  const effectiveOffsetY = dragOffset ? dragOffset.y : storedOffsetY
  const finalLabelX = labelX + effectiveOffsetX
  const finalLabelY = labelY + effectiveOffsetY

  // ── 라벨 드래그 ──────────────────────────────────────────────────────────────
  const onLabelMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault()
    const startMx = e.clientX, startMy = e.clientY
    const startOx = storedOffsetX, startOy = storedOffsetY
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

  // ── 웨이포인트 드래그 ─────────────────────────────────────────────────────────
  const onWaypointMouseDown = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation(); e.preventDefault()
    const startMx = e.clientX, startMy = e.clientY
    // 저장된 waypoint가 없으면 현재 렌더 기준(Z자 기본값)을 베이스로 사용
    const baseWps = currentWps
    const origWp = baseWps[idx]
    const onMouseMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startMx) / zoomRef.current
      const dy = (ev.clientY - startMy) / zoomRef.current
      const newWps = baseWps.map((wp, i) =>
        i === idx ? { x: origWp.x + dx, y: origWp.y + dy } : wp
      )
      setWpDrag({ idx, wps: newWps })
    }
    const onMouseUp = (ev: MouseEvent) => {
      const dx = (ev.clientX - startMx) / zoomRef.current
      const dy = (ev.clientY - startMy) / zoomRef.current
      const newWps = baseWps.map((wp, i) =>
        i === idx ? { x: origWp.x + dx, y: origWp.y + dy } : wp
      )
      setWpDrag(null)
      updateEdgeData(id, { waypoints: newWps })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // 웨이포인트 삭제 (더블클릭)
  const onWaypointDblClick = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation(); e.preventDefault()
    const baseWps = currentWps
    const newWps = baseWps.filter((_, i) => i !== idx)
    updateEdgeData(id, { waypoints: newWps })
  }

  // ── 가상 핸들 드래그 (straight/smoothstep → polyline 변환) ──────────────────
  const onVirtualWpMouseDown = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation(); e.preventDefault()
    const startMx = e.clientX, startMy = e.clientY
    const baseWps = virtualWps
    const origWp = baseWps[idx]
    const onMouseMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startMx) / zoomRef.current
      const dy = (ev.clientY - startMy) / zoomRef.current
      setVirtualDrag({ idx, wps: baseWps.map((wp, i) => i === idx ? { x: origWp.x + dx, y: origWp.y + dy } : wp) })
    }
    const onMouseUp = (ev: MouseEvent) => {
      const dx = (ev.clientX - startMx) / zoomRef.current
      const dy = (ev.clientY - startMy) / zoomRef.current
      const finalWps = baseWps.map((wp, i) => i === idx ? { x: origWp.x + dx, y: origWp.y + dy } : wp)
      setVirtualDrag(null)
      updateEdgeData(id, { routing: 'polyline', routing_mode: 'polyline', waypoints: finalWps })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // ── 세그먼트 중간점 클릭 → 새 웨이포인트 삽입 ──────────────────────────────
  // 세그먼트 목록: 전체 점 배열에서 인접 쌍
  const allPts: WP[] = [{ x: sourceX, y: sourceY }, ...currentWps, { x: targetX, y: targetY }]
  const segmentMidpoints: { x: number; y: number; insertIdx: number }[] = []
  if (routing === 'polyline') {
    for (let i = 0; i < allPts.length - 1; i++) {
      segmentMidpoints.push({
        x: (allPts[i].x + allPts[i+1].x) / 2,
        y: (allPts[i].y + allPts[i+1].y) / 2,
        insertIdx: i, // 이 인덱스 뒤에 삽입
      })
    }
  }

  const onSegmentMidMouseDown = (e: React.MouseEvent, insertIdx: number, mx: number, my: number) => {
    e.stopPropagation(); e.preventDefault()
    const baseWps = currentWps
    const newWps = [
      ...baseWps.slice(0, insertIdx),
      { x: mx, y: my },
      ...baseWps.slice(insertIdx),
    ]
    updateEdgeData(id, { waypoints: newWps })

    // 삽입 직후 드래그 시작 (insertIdx가 새 wp의 인덱스)
    const startMx = e.clientX, startMy = e.clientY
    const origWp = { x: mx, y: my }
    const onMouseMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startMx) / zoomRef.current
      const dy = (ev.clientY - startMy) / zoomRef.current
      const preview = newWps.map((wp, i) =>
        i === insertIdx ? { x: origWp.x + dx, y: origWp.y + dy } : wp
      )
      setWpDrag({ idx: insertIdx, wps: preview })
    }
    const onMouseUp = (ev: MouseEvent) => {
      const dx = (ev.clientX - startMx) / zoomRef.current
      const dy = (ev.clientY - startMy) / zoomRef.current
      const finalWps = newWps.map((wp, i) =>
        i === insertIdx ? { x: origWp.x + dx, y: origWp.y + dy } : wp
      )
      setWpDrag(null)
      updateEdgeData(id, { waypoints: finalWps })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const labelText = typeof label === 'string' ? label : ''

  // labelStyle/labelBgStyle은 SVG용 fill 속성을 사용 → HTML div에선 color/background로 변환
  const textColor = (labelStyle as any)?.fill
  const bgColor = (labelBgStyle as any)?.fill

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} />
      {showEnd && (
        <polygon points={arrowPoints(targetX, targetY, endAngle)} fill={color} />
      )}
      {showStart && (
        <polygon points={arrowPoints(sourceX, sourceY, startAngle)} fill={color} />
      )}

      {/* 라벨 */}
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
              fontSize: (labelStyle as any)?.fontSize ?? 11,
              fontWeight: (labelStyle as any)?.fontWeight ?? 500,
              color: textColor,
              background: bgColor,
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
            onMouseDown={onLabelMouseDown}
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* straight/smoothstep 선택 시: 가상 꺾임 핸들 표시 */}
      {selected && routing !== 'polyline' && !virtualDrag && (
        <EdgeLabelRenderer>
          {virtualWps.map((wp, i) => (
            <div
              key={`vwp-${i}`}
              className="nodrag nopan waypoint-handle waypoint-handle-virtual"
              style={{
                position: 'absolute',
                left: wp.x,
                top: wp.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'all',
                borderColor: color,
              }}
              onMouseDown={e => onVirtualWpMouseDown(e, i)}
              title="드래그: 꺾임선으로 변환"
            />
          ))}
        </EdgeLabelRenderer>
      )}

      {/* Polyline: 웨이포인트 핸들 + 세그먼트 중간점 핸들 (선택 시만) */}
      {routing === 'polyline' && selected && (
        <EdgeLabelRenderer>
          {/* 세그먼트 중간점 핸들 */}
          {segmentMidpoints.map((seg, i) => (
            <div
              key={`seg-mid-${i}`}
              className="nodrag nopan waypoint-mid-handle"
              style={{
                position: 'absolute',
                left: seg.x,
                top: seg.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'all',
              }}
              onMouseDown={e => onSegmentMidMouseDown(e, seg.insertIdx, seg.x, seg.y)}
            />
          ))}

          {/* 웨이포인트 핸들 */}
          {currentWps.map((wp, i) => (
            <div
              key={`wp-${i}`}
              className="nodrag nopan waypoint-handle"
              style={{
                position: 'absolute',
                left: wp.x,
                top: wp.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'all',
                borderColor: color,
              }}
              onMouseDown={e => onWaypointMouseDown(e, i)}
              onDoubleClick={e => onWaypointDblClick(e, i)}
              title="드래그: 이동 | 더블클릭: 삭제"
            />
          ))}
        </EdgeLabelRenderer>
      )}
    </>
  )
}
