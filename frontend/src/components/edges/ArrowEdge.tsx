import React, { useState, useRef } from 'react'
import { getBezierPath, getSmoothStepPath, getStraightPath, BaseEdge, Position, EdgeLabelRenderer, useStore } from 'reactflow'
import type { EdgeProps } from 'reactflow'

// Context: DiagramEditor가 provide, ArrowEdge가 consume
export const EdgeDataUpdateCtx = React.createContext<
  (id: string, patch: Record<string, unknown>) => void
>(() => {})

// Context: 엔드포인트 재연결
export const EdgeRerouteCtx = React.createContext<
  (id: string, which: 'source' | 'target', nodeId: string, handleId: string) => void
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

interface WP { x: number; y: number }

function buildPolylinePath(sx: number, sy: number, tx: number, ty: number, wps: WP[]): string {
  const pts: WP[] = [{ x: sx, y: sy }, ...wps, { x: tx, y: ty }]
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

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

function polylineEndAngle(tx: number, ty: number, wps: WP[]): number {
  const prev = wps.length > 0 ? wps[wps.length - 1] : null
  if (!prev) return 0
  return Math.atan2(ty - prev.y, tx - prev.x)
}

function polylineStartAngle(sx: number, sy: number, wps: WP[]): number {
  const next = wps.length > 0 ? wps[0] : null
  if (!next) return Math.PI
  return Math.atan2(sy - next.y, sx - next.x)
}

const EP_SNAP_R   = 30  // 엔드포인트 → 노드 핸들 스냅 반경
const WP_SNAP_R   = 20  // 웨이포인트 → 웨이포인트 스냅 반경
const AXIS_SNAP_R = 8   // 수직/수평 축 정렬 스냅 반경

// 인접 점들과 비교해 수직/수평 축에 스냅
function axisSnap(pos: WP, adjacent: WP[]): WP {
  let { x, y } = pos
  for (const a of adjacent) {
    if (Math.abs(y - a.y) < AXIS_SNAP_R) y = a.y  // 수평 정렬
    if (Math.abs(x - a.x) < AXIS_SNAP_R) x = a.x  // 수직 정렬
  }
  return { x, y }
}

export default function ArrowEdge(props: EdgeProps) {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    style, data, label, labelStyle, labelBgStyle,
    selected,
  } = props

  const updateEdgeData = React.useContext(EdgeDataUpdateCtx)
  const rerouteEdge    = React.useContext(EdgeRerouteCtx)

  const transform = useStore(s => s.transform)
  const transformRef = useRef(transform)
  transformRef.current = transform

  // ReactFlow 컨테이너 DOM 노드 (좌표 변환용)
  const domNode = useStore(s => s.domNode)
  const domNodeRef = useRef(domNode)
  domNodeRef.current = domNode

  // 스냅용: 모든 노드 internals (절대 좌표 포함)
  const nodeInternals = useStore(s => s.nodeInternals)
  const nodeInternalsRef = useRef(nodeInternals)
  nodeInternalsRef.current = nodeInternals

  // 스냅용: 다른 엣지의 waypoints
  const allEdges = useStore(s => s.edges)
  const allEdgesRef = useRef(allEdges)
  allEdgesRef.current = allEdges

  const arrow: string = data?.arrow ?? 'forward'
  const color: string = (style as any)?.stroke ?? '#94a3b8'
  const routing: string = data?.routing ?? 'straight'
  const storedOffsetX: number = data?.labelOffsetX ?? 0
  const storedOffsetY: number = data?.labelOffsetY ?? 0
  const storedWaypoints: WP[] = data?.waypoints ?? []

  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const [wpDrag, setWpDrag]         = useState<{ idx: number; wps: WP[] } | null>(null)
  const [virtualDrag, setVirtualDrag] = useState<{ idx: number; wps: WP[] } | null>(null)
  // 엔드포인트 드래그: 출발/도착점 재연결
  const [epDrag, setEpDrag] = useState<{
    which: 'source' | 'target'
    x: number; y: number
    snap: { nodeId: string; handleId: string; x: number; y: number } | null
  } | null>(null)

  function computeDefaultPolylineWps(): WP[] {
    const dx = targetX - sourceX
    const dy = targetY - sourceY
    return Math.abs(dx) >= Math.abs(dy)
      ? [{ x: (sourceX + targetX) / 2, y: sourceY },
         { x: (sourceX + targetX) / 2, y: targetY }]
      : [{ x: sourceX, y: (sourceY + targetY) / 2 },
         { x: targetX, y: (sourceY + targetY) / 2 }]
  }

  const virtualWps: WP[] = routing !== 'polyline' ? computeDefaultPolylineWps() : []

  const currentWps: WP[] = wpDrag
    ? wpDrag.wps
    : storedWaypoints.length > 0
      ? storedWaypoints
      : routing === 'polyline' ? computeDefaultPolylineWps() : []

  // ── 스크린 → 캔버스 좌표 변환 ─────────────────────────────────────────────────
  // clientX/Y는 뷰포트 기준, ReactFlow transform은 컨테이너 기준이므로 컨테이너 offset 빼야 함
  function toCanvas(cx: number, cy: number): WP {
    const [tx, ty, tz] = transformRef.current
    const rect = domNodeRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
    return { x: (cx - rect.left - tx) / tz, y: (cy - rect.top - ty) / tz }
  }

  // ── 노드 핸들 위치 목록 (드래그 시작 시점에 캡처) ─────────────────────────────
  function getNodeHandlePositions() {
    const result: { nodeId: string; handleId: string; x: number; y: number }[] = []
    const SKIP = new Set(['groupNode', 'sequenceActor', 'sequenceMessage'])
    nodeInternalsRef.current.forEach(node => {
      if (SKIP.has(node.type ?? '')) return
      const pos = (node as any).positionAbsolute
      const w = (node as any).width ?? 0
      const h = (node as any).height ?? 0
      if (!pos || !w || !h) return
      ;[
        { id: 'right-s',  x: pos.x + w,     y: pos.y + h / 2 },
        { id: 'left-s',   x: pos.x,          y: pos.y + h / 2 },
        { id: 'top-s',    x: pos.x + w / 2,  y: pos.y         },
        { id: 'bottom-s', x: pos.x + w / 2,  y: pos.y + h     },
        { id: 'right-t',  x: pos.x + w,      y: pos.y + h / 2 },
        { id: 'left-t',   x: pos.x,           y: pos.y + h / 2 },
        { id: 'top-t',    x: pos.x + w / 2,   y: pos.y         },
        { id: 'bottom-t', x: pos.x + w / 2,   y: pos.y + h     },
      ].forEach(({ id: handleId, x, y }) => result.push({ nodeId: node.id, handleId, x, y }))
    })
    return result
  }

  function findNodeSnap(cx: number, cy: number, handles: ReturnType<typeof getNodeHandlePositions>) {
    let best = null, minD = EP_SNAP_R
    for (const h of handles) {
      const d = Math.hypot(cx - h.x, cy - h.y)
      if (d < minD) { minD = d; best = h }
    }
    return best
  }

  function findWpSnap(cx: number, cy: number): WP | null {
    let best: WP | null = null, minD = WP_SNAP_R
    for (const e of allEdgesRef.current) {
      if (e.id === id) continue
      for (const wp of (e.data?.waypoints ?? [])) {
        const d = Math.hypot(cx - wp.x, cy - wp.y)
        if (d < minD) { minD = d; best = wp }
      }
    }
    return best
  }

  // ── 경로 계산 ────────────────────────────────────────────────────────────────
  let edgePath: string
  let labelX: number
  let labelY: number
  let endAngle: number
  let startAngle: number

  if (virtualDrag) {
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
    const [path, lx, ly] = getStraightPath({ sourceX, sourceY, targetX, targetY })
    edgePath = path; labelX = lx; labelY = ly
    endAngle   = Math.atan2(targetY - sourceY, targetX - sourceX)
    startAngle = Math.atan2(sourceY - targetY, sourceX - targetX)
  } else {
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
      const [, , tz] = transformRef.current
      const dx = (ev.clientX - startMx) / tz
      const dy = (ev.clientY - startMy) / tz
      setDragOffset({ x: startOx + dx, y: startOy + dy })
    }
    const onMouseUp = (ev: MouseEvent) => {
      const [, , tz] = transformRef.current
      const dx = (ev.clientX - startMx) / tz
      const dy = (ev.clientY - startMy) / tz
      setDragOffset(null)
      updateEdgeData(id, { labelOffsetX: startOx + dx, labelOffsetY: startOy + dy })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // ── 웨이포인트 드래그 (축 스냅 + 꺾임점↔꺾임점 스냅) ────────────────────────
  const onWaypointMouseDown = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation(); e.preventDefault()
    const startMx = e.clientX, startMy = e.clientY
    const baseWps = currentWps
    const origWp  = baseWps[idx]
    // 인접점: 이전(또는 source), 다음(또는 target)
    const adjPts: WP[] = [
      idx === 0 ? { x: sourceX, y: sourceY } : baseWps[idx - 1],
      idx === baseWps.length - 1 ? { x: targetX, y: targetY } : baseWps[idx + 1],
    ]
    const snap = (raw: WP): WP => {
      const axis = axisSnap(raw, adjPts)
      if (axis.x !== raw.x || axis.y !== raw.y) return axis  // 축 스냅 우선
      return findWpSnap(raw.x, raw.y) ?? raw
    }
    const onMouseMove = (ev: MouseEvent) => {
      const [, , tz] = transformRef.current
      const dx = (ev.clientX - startMx) / tz, dy = (ev.clientY - startMy) / tz
      setWpDrag({ idx, wps: baseWps.map((wp, i) => i === idx ? snap({ x: origWp.x + dx, y: origWp.y + dy }) : wp) })
    }
    const onMouseUp = (ev: MouseEvent) => {
      const [, , tz] = transformRef.current
      const dx = (ev.clientX - startMx) / tz, dy = (ev.clientY - startMy) / tz
      const newWps = baseWps.map((wp, i) => i === idx ? snap({ x: origWp.x + dx, y: origWp.y + dy }) : wp)
      setWpDrag(null)
      updateEdgeData(id, { waypoints: newWps })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const onWaypointDblClick = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation(); e.preventDefault()
    updateEdgeData(id, { waypoints: currentWps.filter((_, i) => i !== idx) })
  }

  // ── 가상 핸들 드래그 (straight/smoothstep → polyline, 축 스냅 + 꺾임점 스냅) ──
  const onVirtualWpMouseDown = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation(); e.preventDefault()
    const startMx = e.clientX, startMy = e.clientY
    const baseWps = virtualWps
    const origWp  = baseWps[idx]
    const adjPts: WP[] = [
      idx === 0 ? { x: sourceX, y: sourceY } : baseWps[idx - 1],
      idx === baseWps.length - 1 ? { x: targetX, y: targetY } : baseWps[idx + 1],
    ]
    const snap = (raw: WP): WP => {
      const axis = axisSnap(raw, adjPts)
      if (axis.x !== raw.x || axis.y !== raw.y) return axis
      return findWpSnap(raw.x, raw.y) ?? raw
    }
    const onMouseMove = (ev: MouseEvent) => {
      const [, , tz] = transformRef.current
      const dx = (ev.clientX - startMx) / tz, dy = (ev.clientY - startMy) / tz
      setVirtualDrag({ idx, wps: baseWps.map((wp, i) => i === idx ? snap({ x: origWp.x + dx, y: origWp.y + dy }) : wp) })
    }
    const onMouseUp = (ev: MouseEvent) => {
      const [, , tz] = transformRef.current
      const dx = (ev.clientX - startMx) / tz, dy = (ev.clientY - startMy) / tz
      const finalWps = baseWps.map((wp, i) => i === idx ? snap({ x: origWp.x + dx, y: origWp.y + dy }) : wp)
      setVirtualDrag(null)
      updateEdgeData(id, { routing: 'polyline', routing_mode: 'polyline', waypoints: finalWps })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // ── 엔드포인트 드래그 (출발/도착점 재연결) ────────────────────────────────────
  const onEndpointMouseDown = (e: React.MouseEvent, which: 'source' | 'target') => {
    e.stopPropagation(); e.preventDefault()
    const handles = getNodeHandlePositions() // 드래그 시작 시점에 캡처
    const onMouseMove = (ev: MouseEvent) => {
      const pos  = toCanvas(ev.clientX, ev.clientY)
      const snap = findNodeSnap(pos.x, pos.y, handles)
      setEpDrag({ which, x: pos.x, y: pos.y, snap })
    }
    const onMouseUp = (ev: MouseEvent) => {
      const pos  = toCanvas(ev.clientX, ev.clientY)
      const snap = findNodeSnap(pos.x, pos.y, handles)
      setEpDrag(null)
      if (snap) rerouteEdge(id, which, snap.nodeId, snap.handleId)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // ── 세그먼트 중간점 → 새 웨이포인트 삽입 ────────────────────────────────────
  const allPts: WP[] = [{ x: sourceX, y: sourceY }, ...currentWps, { x: targetX, y: targetY }]
  const segmentMidpoints: { x: number; y: number; insertIdx: number }[] = []
  if (routing === 'polyline') {
    for (let i = 0; i < allPts.length - 1; i++) {
      segmentMidpoints.push({
        x: (allPts[i].x + allPts[i+1].x) / 2,
        y: (allPts[i].y + allPts[i+1].y) / 2,
        insertIdx: i,
      })
    }
  }

  const onSegmentMidMouseDown = (e: React.MouseEvent, insertIdx: number, mx: number, my: number) => {
    e.stopPropagation(); e.preventDefault()
    const baseWps = currentWps
    const newWps  = [...baseWps.slice(0, insertIdx), { x: mx, y: my }, ...baseWps.slice(insertIdx)]
    updateEdgeData(id, { waypoints: newWps })
    const startMx = e.clientX, startMy = e.clientY
    const origWp  = { x: mx, y: my }
    // 삽입된 점의 인접점: 세그먼트 양 끝
    const adjPts: WP[] = [allPts[insertIdx], allPts[insertIdx + 1]]
    const snap = (raw: WP): WP => {
      const axis = axisSnap(raw, adjPts)
      if (axis.x !== raw.x || axis.y !== raw.y) return axis
      return findWpSnap(raw.x, raw.y) ?? raw
    }
    const onMouseMove = (ev: MouseEvent) => {
      const [, , tz] = transformRef.current
      const dx = (ev.clientX - startMx) / tz, dy = (ev.clientY - startMy) / tz
      setWpDrag({ idx: insertIdx, wps: newWps.map((wp, i) => i === insertIdx ? snap({ x: origWp.x + dx, y: origWp.y + dy }) : wp) })
    }
    const onMouseUp = (ev: MouseEvent) => {
      const [, , tz] = transformRef.current
      const dx = (ev.clientX - startMx) / tz, dy = (ev.clientY - startMy) / tz
      setWpDrag(null)
      updateEdgeData(id, { waypoints: newWps.map((wp, i) => i === insertIdx ? snap({ x: origWp.x + dx, y: origWp.y + dy }) : wp) })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const labelText  = typeof label === 'string' ? label : ''
  const textColor  = (labelStyle as any)?.fill
  const bgColor    = (labelBgStyle as any)?.fill

  // epDrag 중 고정 끝점
  const epFixed = epDrag
    ? (epDrag.which === 'target' ? { x: sourceX, y: sourceY } : { x: targetX, y: targetY })
    : null
  const epMoving = epDrag
    ? (epDrag.snap ? { x: epDrag.snap.x, y: epDrag.snap.y } : { x: epDrag.x, y: epDrag.y })
    : null

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} />
      {showEnd && <polygon points={arrowPoints(targetX, targetY, endAngle)} fill={color} />}
      {showStart && <polygon points={arrowPoints(sourceX, sourceY, startAngle)} fill={color} />}

      {/* 엔드포인트 드래그 중: 고스트 라인 + 스냅 강조 */}
      {epDrag && epFixed && epMoving && (
        <line
          x1={epFixed.x} y1={epFixed.y}
          x2={epMoving.x} y2={epMoving.y}
          stroke={color} strokeWidth={2} strokeDasharray="6,4" opacity={0.7}
        />
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
              padding: '2px 8px', borderRadius: 4,
              fontSize: (labelStyle as any)?.fontSize ?? 11,
              fontWeight: (labelStyle as any)?.fontWeight ?? 500,
              color: textColor, background: bgColor,
              userSelect: 'none', whiteSpace: 'nowrap',
            }}
            onMouseDown={onLabelMouseDown}
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* 선택된 엣지: 출발/도착 엔드포인트 핸들 */}
      {selected && !epDrag && (
        <EdgeLabelRenderer>
          {([
            { which: 'source' as const, x: sourceX, y: sourceY },
            { which: 'target' as const, x: targetX, y: targetY },
          ]).map(({ which, x, y }) => (
            <div
              key={which}
              className="nodrag nopan edge-endpoint-handle"
              style={{
                position: 'absolute', left: x, top: y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'all', borderColor: color,
              }}
              onMouseDown={e => onEndpointMouseDown(e, which)}
              title="드래그: 연결 변경"
            />
          ))}
        </EdgeLabelRenderer>
      )}

      {/* 엔드포인트 드래그 중: 스냅 강조 원 + 이동 포인터 */}
      {epDrag && (
        <EdgeLabelRenderer>
          {epDrag.snap && (
            <div
              className="edge-snap-highlight"
              style={{
                position: 'absolute',
                left: epDrag.snap.x, top: epDrag.snap.y,
                transform: 'translate(-50%, -50%)',
              }}
            />
          )}
          <div
            className="edge-endpoint-handle edge-endpoint-dragging"
            style={{
              position: 'absolute',
              left: epDrag.snap ? epDrag.snap.x : epDrag.x,
              top:  epDrag.snap ? epDrag.snap.y : epDrag.y,
              transform: 'translate(-50%, -50%)',
              borderColor: color,
            }}
          />
        </EdgeLabelRenderer>
      )}

      {/* straight/smoothstep 선택 시: 가상 꺾임 핸들 */}
      {selected && routing !== 'polyline' && !virtualDrag && !epDrag && (
        <EdgeLabelRenderer>
          {virtualWps.map((wp, i) => (
            <div
              key={`vwp-${i}`}
              className="nodrag nopan waypoint-handle waypoint-handle-virtual"
              style={{
                position: 'absolute', left: wp.x, top: wp.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'all', borderColor: color,
              }}
              onMouseDown={e => onVirtualWpMouseDown(e, i)}
              title="드래그: 꺾임선으로 변환"
            />
          ))}
        </EdgeLabelRenderer>
      )}

      {/* Polyline: 웨이포인트 핸들 + 세그먼트 중간점 핸들 (선택 시만) */}
      {routing === 'polyline' && selected && !epDrag && (
        <EdgeLabelRenderer>
          {segmentMidpoints.map((seg, i) => (
            <div
              key={`seg-mid-${i}`}
              className="nodrag nopan waypoint-mid-handle"
              style={{
                position: 'absolute', left: seg.x, top: seg.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'all',
              }}
              onMouseDown={e => onSegmentMidMouseDown(e, seg.insertIdx, seg.x, seg.y)}
            />
          ))}
          {currentWps.map((wp, i) => (
            <div
              key={`wp-${i}`}
              className="nodrag nopan waypoint-handle"
              style={{
                position: 'absolute', left: wp.x, top: wp.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'all', borderColor: color,
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
