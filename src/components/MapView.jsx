import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  LayersControl,
  Polyline,
  CircleMarker,
  Marker,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { displayNumber, resolveRange } from '../services/towers.js'
import DrawLayer from './DrawLayer.jsx'
import CoordinateSearch from './CoordinateSearch.jsx'

const { BaseLayer } = LayersControl

// Re-frame the map when a different line is loaded — but not on every edit, or
// deleting a tower would yank the view away from what you were working on.
function FitBounds({ towers, fitKey }) {
  const map = useMap()
  const towersRef = useRef(towers)
  towersRef.current = towers

  useEffect(() => {
    const current = towersRef.current
    if (current.length > 0) {
      map.fitBounds(L.latLngBounds(current.map(t => [t.lat, t.lon])), { padding: [50, 50] })
    }
  }, [fitKey, map])

  return null
}

// Jump to a coordinate the user typed. Keyed on the point itself so entering
// the same coordinates twice still re-centres the map.
function FlyToPoint({ point }) {
  const map = useMap()
  useEffect(() => {
    if (!point) return
    map.flyTo([point.lat, point.lon], Math.max(map.getZoom(), 16), { duration: 0.8 })
  }, [point, map])
  return null
}

// Click anywhere to drop a new tower into the line.
function AddTowerOnClick({ onAddTower }) {
  useMapEvents({
    click(e) {
      onAddTower(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// Leaflet can only drag a Marker, never a CircleMarker, so edit mode swaps in a
// div-icon styled to match the circles. Icons are cached: a fresh icon object
// on every render would tear down and rebuild every marker on the map.
const iconCache = {}
function pinIcon(status) {
  if (!iconCache[status]) {
    iconCache[status] = L.divIcon({
      className: `tower-pin tower-pin--${status}`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    })
  }
  return iconCache[status]
}

// One tower. Memoised on purpose: toggling edit mode or hovering must not
// re-render three thousand of these — that cost over 20 seconds on a long line.
const TowerCircle = memo(function TowerCircle({
  tower, idx, status, num, renamed, isFrom, isTo, onClick, onHover,
}) {
  let fillColor = '#ffffff'
  let strokeColor = '#c2410c'
  let radius = 5
  if (status === 'range') { fillColor = '#dbeafe'; strokeColor = '#2563eb'; radius = 6 }
  if (isFrom) { fillColor = '#22c55e'; strokeColor = '#15803d'; radius = 9 }
  if (isTo)   { fillColor = '#ef4444'; strokeColor = '#b91c1c'; radius = 9 }

  return (
    <CircleMarker
      center={[tower.lat, tower.lon]}
      radius={radius}
      pathOptions={{
        color: strokeColor,
        fillColor,
        fillOpacity: 1,
        weight: isFrom || isTo ? 3 : 2,
      }}
      eventHandlers={{
        click: (e) => onClick(idx, e),
        mouseover: (e) => { e.target.setRadius(radius + 3); onHover(tower.uid) },
        mouseout: (e) => e.target.setRadius(radius),
      }}
    >
      <Tooltip direction="top" offset={[0, -8]} opacity={1}>
        <div style={{ textAlign: 'center', lineHeight: 1.5 }}>
          <strong>Tower {num}</strong>
          {renamed && (
            <span style={{ color: '#94a3b8', fontSize: '11px' }}> (orig {tower.towerNumber})</span>
          )}
          <br />
          {tower.osmId && (
            <>
              <span style={{ color: '#64748b', fontSize: '11px' }}>OSM {tower.osmId}</span><br />
            </>
          )}
          <span style={{ fontSize: '11px' }}>
            {tower.lat.toFixed(6)}, {tower.lon.toFixed(6)}
          </span>
          {(isFrom || isTo) && (
            <div style={{ marginTop: 3, fontWeight: 700, color: isFrom ? '#15803d' : '#b91c1c' }}>
              {isFrom ? '▶ START' : '⬛ END'}
            </div>
          )}
          {/* Deliberately unconditional: making this depend on the current mode
              would re-render every tower each time a mode is toggled, which is
              what made edit mode take 20 seconds on a long line. */}
          <div style={{ marginTop: 3, color: '#2563eb', fontSize: '10.5px', fontWeight: 700 }}>
            ✎ click to edit
          </div>
        </div>
      </Tooltip>
    </CircleMarker>
  )
})

function TowerMarkers({
  towers,
  fromIdx,
  toIdx,
  onTowerClick,
  startNumber,
  editMode,
  onTowerMove,
  addMode,
  onAddTower,
  selectionMode,
  onEditTower,
}) {
  const range = resolveRange(towers, fromIdx, toIdx)

  // Only the tower under the cursor gets a draggable Marker. Giving every tower
  // one meant entering edit mode rebuilt every layer on the map.
  const [dragUid, setDragUid] = useState(null)
  useEffect(() => { if (!editMode) setDragUid(null) }, [editMode])

  // The click and hover handlers read the current mode from a ref so their
  // identity never changes — a new function each render would re-render every
  // memoised tower and undo the whole point.
  const modes = useRef({})
  modes.current = { editMode, addMode, selectionMode, onTowerClick, onAddTower, onEditTower, towers }

  const handleClick = useCallback((idx, e) => {
    const m = modes.current
    // Three behaviours compete for a click on a tower. Range selection has to
    // win first, or arming "+ Select" would pop dialogs instead of letting you pick.
    if (m.selectionMode) return m.onTowerClick(idx)
    // Towers sit right on the line, so in add mode a click meant for the line
    // usually lands on a marker. Add there rather than swallowing the click.
    if (m.addMode) return m.onAddTower(e.latlng.lat, e.latlng.lng)
    return m.onEditTower(m.towers[idx].uid)
  }, [])

  const handleHover = useCallback((uid) => {
    if (modes.current.editMode) setDragUid(uid)
  }, [])

  const circles = towers.map((tower, idx) => {
    const isFrom = idx === fromIdx
    const isTo = idx === toIdx
    const lo = fromIdx !== null && toIdx !== null ? Math.min(fromIdx, toIdx) : null
    const hi = fromIdx !== null && toIdx !== null ? Math.max(fromIdx, toIdx) : null
    const num = displayNumber(tower, idx, range, startNumber)

    let status = 'default'
    if (lo !== null && idx > lo && idx < hi) status = 'range'
    if (isFrom) status = 'from'
    if (isTo) status = 'to'

    return (
      <TowerCircle
        key={tower.uid}
        tower={tower}
        idx={idx}
        status={status}
        num={num}
        renamed={num !== String(tower.towerNumber)}
        isFrom={isFrom}
        isTo={isTo}
        onClick={handleClick}
        onHover={handleHover}
      />
    )
  })

  const dragIdx = editMode && dragUid ? towers.findIndex(t => t.uid === dragUid) : -1
  if (dragIdx === -1) return circles

  const tower = towers[dragIdx]
  const status = dragIdx === fromIdx ? 'from' : dragIdx === toIdx ? 'to' : 'default'
  return [
    ...circles,
    <Marker
      key={`drag-${tower.uid}`}
      position={[tower.lat, tower.lon]}
      icon={pinIcon(status)}
      draggable={!addMode}
      eventHandlers={{
        click: (e) => handleClick(dragIdx, e),
        dragend: (e) => {
          const { lat, lng } = e.target.getLatLng()
          onTowerMove(tower.uid, lat, lng)
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -10]} opacity={1}>
        <strong>Tower {displayNumber(tower, dragIdx, range, startNumber)}</strong>
        <br />
        <span style={{ fontSize: '11px', color: '#64748b' }}>drag to move · click to edit</span>
      </Tooltip>
    </Marker>,
  ]
}


export default function MapView({
  towers,
  fromIdx,
  toIdx,
  selectionMode,
  onTowerClick,
  startNumber,
  fitKey,
  editMode = false,
  addMode = false,
  onTowerMove,
  onAddTower,
  onImportFile,
  onEditTower,
  drawMode = false,
  shapes = [],
  tool = 'select',
  draft = [],
  selectedShapeId = null,
  onVertex,
  onFinishDraft,
  onSelectShape,
  onShapePatch,
}) {
  const positions = towers.map(t => [t.lat, t.lon])
  const lo = fromIdx !== null && toIdx !== null ? Math.min(fromIdx, toIdx) : null
  const hi = fromIdx !== null && toIdx !== null ? Math.max(fromIdx, toIdx) : null
  const rangePositions = lo !== null ? positions.slice(lo, hi + 1) : []

  const [dragOver, setDragOver] = useState(false)
  const [coordPoint, setCoordPoint] = useState(null)

  // A click on the line never reaches the map underneath — Leaflet paths
  // swallow it — and clicking the line is the obvious way to add a tower to it.
  const lineHandlers = addMode
    ? { click: (e) => { L.DomEvent.stop(e); onAddTower(e.latlng.lat, e.latlng.lng) } }
    : {}

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onImportFile(file)
  }

  const wrapClass = [
    'map-wrap',
    selectionMode ? 'map-wrap--selecting' : '',
    addMode || (drawMode && tool !== 'select') ? 'map-wrap--adding' : '',
    dragOver ? 'map-wrap--dropping' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={wrapClass}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      // Right-click finishes a shape, so the browser menu must not appear over
      // the map while a multi-point tool is armed.
      onContextMenu={(e) => {
        if (drawMode && (tool === 'line' || tool === 'polygon')) e.preventDefault()
      }}
    >
      {selectionMode && (
        <div className={`map-hint map-hint--${selectionMode}`}>
          {selectionMode === 'from'
            ? '🟢  Click any tower to set START'
            : '🔴  Click any tower to set END'}
        </div>
      )}

      {addMode && !selectionMode && (
        <div className="map-hint map-hint--add">
          ➕  Click the map to add a tower — it drops into the nearest span
        </div>
      )}

      {drawMode && (tool === 'line' || tool === 'polygon') && draft.length > 0 && (
        <div className="map-hint map-hint--add">
          ✏️  {draft.length} point{draft.length === 1 ? '' : 's'} — right-click, double-click or Enter to finish · Ctrl+Z undoes the last point
        </div>
      )}

      <CoordinateSearch point={coordPoint} onGo={setCoordPoint} onClear={() => setCoordPoint(null)} />

      {dragOver && <div className="map-drop-overlay">Drop the .kml or .kmz to load it</div>}

      <MapContainer
        center={[22.5, 79.0]}
        zoom={5}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <LayersControl position="topright">
          {/* ── Base maps — all key-free.
              maxNativeZoom is each provider's deepest real tile level (Esri imagery
              runs out at 18 over rural India, Esri street at 17); past it
              Leaflet upscales instead of requesting levels that come back as
              grey "Map data not yet available" placeholders. ── */}
          <BaseLayer name="Satellite (see real towers)">
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com">Esri</a> World Imagery'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={20}
              maxNativeZoom={18}
              keepBuffer={4}
              updateWhenZooming={false}
            />
          </BaseLayer>

          <BaseLayer checked name="Street (clean)">
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com">Esri</a> World Street Map'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
              maxZoom={20}
              maxNativeZoom={17}
              keepBuffer={4}
              updateWhenZooming={false}
            />
          </BaseLayer>

          <BaseLayer name="OSM Standard (shows power lines + towers)">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={20}
              maxNativeZoom={19}
              keepBuffer={4}
              updateWhenZooming={false}
            />
          </BaseLayer>
        </LayersControl>

        <FlyToPoint point={coordPoint} />
        {coordPoint && (
          <CircleMarker
            center={[coordPoint.lat, coordPoint.lon]}
            radius={6}
            pathOptions={{ color: '#ffffff', weight: 2.5, fillColor: '#7c3aed', fillOpacity: 1 }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1} permanent>
              <strong>{coordPoint.lat.toFixed(6)}, {coordPoint.lon.toFixed(6)}</strong>
            </Tooltip>
          </CircleMarker>
        )}

        {addMode && !drawMode && <AddTowerOnClick onAddTower={onAddTower} />}

        {drawMode && (
          <DrawLayer
            shapes={shapes}
            tool={tool}
            draft={draft}
            selectedId={selectedShapeId}
            onVertex={onVertex}
            onFinish={onFinishDraft}
            onSelect={onSelectShape}
            onShapePatch={onShapePatch}
          />
        )}

        {/* The tower line stays visible in draw mode as a backdrop, but stops
            responding to clicks so it cannot steal them from the draw tools. */}
        {towers.length > 0 && (
          <>
            <FitBounds towers={towers} fitKey={fitKey} />

            {/* Full line — glowing halo underneath for visibility */}
            <Polyline
              positions={positions}
              pathOptions={{ color: '#fb923c', weight: 10, opacity: 0.30, interactive: !drawMode }}
              eventHandlers={lineHandlers}
            />
            {/* Full line — crisp bright orange on top */}
            <Polyline
              positions={positions}
              pathOptions={{ color: '#ea580c', weight: 3.5, opacity: 1, interactive: !drawMode }}
              eventHandlers={lineHandlers}
            />

            {/* Selected range — bold blue with halo */}
            {rangePositions.length > 1 && (
              <>
                <Polyline
                  positions={rangePositions}
                  pathOptions={{ color: '#60a5fa', weight: 12, opacity: 0.35 }}
                />
                <Polyline
                  positions={rangePositions}
                  pathOptions={{ color: '#2563eb', weight: 5, opacity: 1 }}
                />
              </>
            )}

            {!drawMode && (
              <TowerMarkers
                towers={towers}
                fromIdx={fromIdx}
                toIdx={toIdx}
                onTowerClick={onTowerClick}
                startNumber={startNumber}
                editMode={editMode}
                onTowerMove={onTowerMove}
                addMode={addMode}
                onAddTower={onAddTower}
                selectionMode={selectionMode}
                onEditTower={onEditTower}
              />
            )}
          </>
        )}
      </MapContainer>
    </div>
  )
}
