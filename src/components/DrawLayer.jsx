import { useEffect, useState } from 'react'
import {
  Polyline,
  Polygon,
  Rectangle,
  Circle,
  CircleMarker,
  Marker,
  Tooltip,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { outlineOf, ringsOf, measurementOf, radiusBetween, MIN_VERTICES } from '../services/shapes.js'
import { destination } from '../services/geo.js'

const handleIcon = L.divIcon({ className: 'vertex-handle', iconSize: [12, 12], iconAnchor: [6, 6] })
const midIcon = L.divIcon({ className: 'vertex-handle vertex-handle--mid', iconSize: [10, 10], iconAnchor: [5, 5] })

// Every tool is click-driven — including rectangle and circle, which take two
// clicks rather than a press-drag. Dragging would mean disabling and restoring
// map panning mid-gesture, and breaks entirely on touch.
function DrawEvents({ tool, draft, onVertex, onFinish, onCursor }) {
  const multiPoint = tool === 'line' || tool === 'polygon'

  const map = useMapEvents({
    click(e) {
      if (!tool || tool === 'select') return
      const clicked = [e.latlng.lat, e.latlng.lng]
      if (tool === 'polygon' && draft.length >= 3) {
        if (radiusBetween(clicked, draft[0]) < 25) {
          onFinish()
          return
        }
      }
      onVertex(clicked)
    },
    mousemove(e) {
      if (!tool || tool === 'select' || !draft.length) return
      onCursor([e.latlng.lat, e.latlng.lng])
    },
    dblclick() {
      if (multiPoint) onFinish()
    },
    // Right-click ends a line or polygon where it is — the gesture every map
    // editor uses, and the one that does not need the mouse to stay still.
    contextmenu(e) {
      if (!multiPoint) return
      L.DomEvent.preventDefault(e.originalEvent)
      onFinish()
    },
  })

  // Leaflet zooms on double-click, which would fire alongside the double-click
  // that finishes a shape. Suspend it only while a multi-point tool is armed.
  useEffect(() => {
    if (!multiPoint) return undefined
    map.doubleClickZoom.disable()
    return () => map.doubleClickZoom.enable()
  }, [map, multiPoint])

  return null
}

function ShapeGeometry({ shape, selected, onSelect, interactive }) {
  const options = {
    color: shape.color,
    weight: selected ? (shape.width ?? 3) + 2 : shape.width ?? 3,
    opacity: 1,
    fillColor: shape.color,
    fillOpacity: shape.opacity ?? 0.25,
    dashArray: selected ? '6 4' : undefined,
  }
  const handlers = interactive ? { click: () => onSelect(shape.id) } : {}
  const label = (
    <Tooltip direction="top" opacity={1}>
      <div style={{ textAlign: 'center' }}>
        <strong>{shape.name?.trim() || shape.type}</strong>
        <br />
        <span style={{ fontSize: '11px', color: '#64748b' }}>{measurementOf(shape)}</span>
      </div>
    </Tooltip>
  )

  if (shape.type === 'point') {
    return (
      <CircleMarker
        center={shape.coords[0]}
        radius={selected ? 9 : 7}
        pathOptions={{ ...options, fillOpacity: 1, color: '#ffffff', weight: 2, fillColor: shape.color }}
        eventHandlers={handlers}
      >
        {label}
      </CircleMarker>
    )
  }

  if (shape.type === 'line') {
    return (
      <Polyline positions={shape.coords} pathOptions={options} eventHandlers={handlers}>
        {label}
      </Polyline>
    )
  }

  return (
    <Polygon positions={ringsOf(shape)} pathOptions={options} eventHandlers={handlers}>
      {label}
    </Polygon>
  )
}

// Draggable vertices for the selected shape, plus midpoint dots that insert a
// new vertex where you click them. A line or polygon above its minimum vertex
// count can also lose one, by double-clicking its handle.
function VertexHandles({ shape, onShapePatch }) {
  const min = MIN_VERTICES[shape.type] ?? shape.coords.length
  const removable = shape.coords.length > min

  const move = (i) => (e) => {
    const { lat, lng } = e.target.getLatLng()
    const next = shape.coords.map((c, idx) => (idx === i ? [lat, lng] : c))
    onShapePatch(shape.id, { coords: next })
  }

  const remove = (i) => (e) => {
    if (!removable) return
    L.DomEvent.stop(e) // otherwise this dbl-click reaches the map underneath as a zoom
    onShapePatch(shape.id, { coords: shape.coords.filter((_, idx) => idx !== i) })
  }

  const handles = shape.coords.map((c, i) => (
    <Marker
      key={`v${i}`}
      position={c}
      icon={handleIcon}
      draggable
      eventHandlers={{ dragend: move(i), dblclick: remove(i) }}
    >
      {removable && (
        <Tooltip direction="top" offset={[0, -8]} opacity={1}>Double-click to remove</Tooltip>
      )}
    </Marker>
  ))

  // A circle is a centre and a radius, so it needs a second handle on its edge
  // — without one there is no way to resize it after drawing.
  if (shape.type === 'circle') {
    const edge = destination(shape.coords[0][0], shape.coords[0][1], 90, shape.radius)
    handles.push(
      <Marker
        key="radius"
        position={edge}
        icon={midIcon}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const { lat, lng } = e.target.getLatLng()
            onShapePatch(shape.id, { radius: radiusBetween(shape.coords[0], [lat, lng]) })
          },
        }}
      />
    )
    return handles
  }

  if (shape.type !== 'line' && shape.type !== 'polygon') return handles

  const mids = []
  const last = shape.type === 'polygon' ? shape.coords.length : shape.coords.length - 1
  for (let i = 0; i < last; i++) {
    const a = shape.coords[i]
    const b = shape.coords[(i + 1) % shape.coords.length]
    mids.push(
      <Marker
        key={`m${i}`}
        position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]}
        icon={midIcon}
        eventHandlers={{
          click: () => {
            const next = [...shape.coords]
            next.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
            onShapePatch(shape.id, { coords: next })
          },
        }}
      />
    )
  }
  return [...handles, ...mids]
}

export default function DrawLayer({
  shapes,
  tool,
  draft,
  selectedId,
  onVertex,
  onFinish,
  onSelect,
  onShapePatch,
}) {
  const [cursor, setCursor] = useState(null)
  const selected = shapes.find((s) => s.id === selectedId) || null
  const drawing = tool && tool !== 'select'

  // What the shape being drawn looks like right now, cursor included.
  const preview = () => {
    if (!drawing || !draft.length) return null
    const live = cursor ? [...draft, cursor] : draft
    const dashed = { color: '#2563eb', weight: 3, dashArray: '6 5', fillColor: '#2563eb', fillOpacity: 0.15 }

    if (tool === 'line') return <Polyline positions={live} pathOptions={dashed} />
    if (tool === 'polygon') return <Polygon positions={live} pathOptions={dashed} />
    if (tool === 'rectangle' && cursor) return <Rectangle bounds={[draft[0], cursor]} pathOptions={dashed} />
    if (tool === 'circle' && cursor) {
      return <Circle center={draft[0]} radius={radiusBetween(draft[0], cursor)} pathOptions={dashed} />
    }
    return null
  }

  return (
    <>
      <DrawEvents
        tool={tool}
        draft={draft}
        onVertex={(c) => { setCursor(null); onVertex(c) }}
        onFinish={onFinish}
        onCursor={setCursor}
      />

      {shapes.map((shape) => (
        <ShapeGeometry
          key={shape.id}
          shape={shape}
          selected={shape.id === selectedId}
          onSelect={onSelect}
          interactive={!drawing}
        />
      ))}

      {selected && !drawing && (
        <VertexHandles shape={selected} onShapePatch={onShapePatch} />
      )}

      {preview()}

      {/* Vertices already committed to the shape being drawn */}
      {drawing &&
        draft.map((c, i) => {
          const isStartPoint = i === 0 && tool === 'polygon' && draft.length >= 3
          return (
            <CircleMarker
              key={`d${i}`}
              center={c}
              radius={isStartPoint ? 6 : 4}
              pathOptions={{
                color: isStartPoint ? '#15803d' : '#ffffff',
                weight: 2,
                fillColor: isStartPoint ? '#22c55e' : '#2563eb',
                fillOpacity: 1,
              }}
              eventHandlers={{
                click: (e) => {
                  if (isStartPoint) {
                    L.DomEvent.stopPropagation(e)
                    onFinish()
                  }
                },
              }}
            >
              {isStartPoint && (
                <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                  Click to close polygon
                </Tooltip>
              )}
            </CircleMarker>
          )
        })}
    </>
  )
}
