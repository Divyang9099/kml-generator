import { useEffect } from 'react'
import {
  MapContainer,
  TileLayer,
  LayersControl,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'

const { BaseLayer } = LayersControl

function FitBounds({ towers }) {
  const map = useMap()
  useEffect(() => {
    if (towers.length > 0) {
      const bounds = L.latLngBounds(towers.map(t => [t.lat, t.lon]))
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [towers, map])
  return null
}

function TowerMarkers({ towers, fromIdx, toIdx, selectionMode, onTowerClick, startNumber }) {
  return towers.map((tower, idx) => {
    const isFrom = idx === fromIdx
    const isTo = idx === toIdx
    const inRange =
      fromIdx !== null &&
      toIdx !== null &&
      idx > fromIdx &&
      idx < toIdx
    const inSelection =
      fromIdx !== null && toIdx !== null && idx >= fromIdx && idx <= toIdx
    const displayNum = inSelection
      ? (Number(startNumber) || 1) + (idx - fromIdx)
      : tower.towerNumber

    let fillColor = '#ffffff'
    let strokeColor = '#c2410c'
    let radius = 5

    if (inRange) { fillColor = '#dbeafe'; strokeColor = '#2563eb'; radius = 6 }
    if (isFrom)  { fillColor = '#22c55e'; strokeColor = '#15803d'; radius = 9 }
    if (isTo)    { fillColor = '#ef4444'; strokeColor = '#b91c1c'; radius = 9 }

    return (
      <CircleMarker
        key={tower.osmId}
        center={[tower.lat, tower.lon]}
        radius={radius}
        pathOptions={{
          color: strokeColor,
          fillColor,
          fillOpacity: 1,
          weight: isFrom || isTo ? 3 : 2,
        }}
        eventHandlers={{
          click: () => onTowerClick(idx),
          mouseover: e => e.target.setRadius(radius + 3),
          mouseout:  e => e.target.setRadius(radius),
        }}
      >
        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
          <div style={{ textAlign: 'center', lineHeight: 1.5 }}>
            <strong>Tower {displayNum}</strong>
            {inSelection && displayNum !== tower.towerNumber && (
              <span style={{ color: '#94a3b8', fontSize: '11px' }}> (orig {tower.towerNumber})</span>
            )}
            <br />
            <span style={{ color: '#64748b', fontSize: '11px' }}>OSM {tower.osmId}</span><br />
            <span style={{ fontSize: '11px' }}>
              {tower.lat.toFixed(6)}, {tower.lon.toFixed(6)}
            </span>
            {(isFrom || isTo) && (
              <div style={{ marginTop: 3, fontWeight: 700, color: isFrom ? '#15803d' : '#b91c1c' }}>
                {isFrom ? '▶ START' : '⬛ END'}
              </div>
            )}
          </div>
        </Tooltip>
      </CircleMarker>
    )
  })
}

export default function MapView({ towers, fromIdx, toIdx, selectionMode, onTowerClick, startNumber }) {
  const positions = towers.map(t => [t.lat, t.lon])
  const rangePositions =
    fromIdx !== null && toIdx !== null ? positions.slice(fromIdx, toIdx + 1) : []

  return (
    <div className={`map-wrap${selectionMode ? ' map-wrap--selecting' : ''}`}>
      {selectionMode && (
        <div className={`map-hint map-hint--${selectionMode}`}>
          {selectionMode === 'from'
            ? '🟢  Click any tower to set START'
            : '🔴  Click any tower to set END'}
        </div>
      )}

      <MapContainer
        center={[22.5, 79.0]}
        zoom={5}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <LayersControl position="topright">
          {/* ── Base maps ── */}
          <BaseLayer name="Satellite (see real towers)">
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com">Esri</a> World Imagery'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={20}
              keepBuffer={4}
              updateWhenZooming={false}
            />
          </BaseLayer>

          <BaseLayer checked name="Street (clean)">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={20}
              keepBuffer={4}
              updateWhenZooming={false}
            />
          </BaseLayer>

          <BaseLayer name="OSM Standard (shows power lines + towers)">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
              keepBuffer={4}
              updateWhenZooming={false}
            />
          </BaseLayer>
        </LayersControl>

        {towers.length > 0 && (
          <>
            <FitBounds towers={towers} />

            {/* Full line — glowing halo underneath for visibility */}
            <Polyline
              positions={positions}
              pathOptions={{ color: '#fb923c', weight: 10, opacity: 0.30 }}
            />
            {/* Full line — crisp bright orange on top */}
            <Polyline
              positions={positions}
              pathOptions={{ color: '#ea580c', weight: 3.5, opacity: 1 }}
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

            <TowerMarkers
              towers={towers}
              fromIdx={fromIdx}
              toIdx={toIdx}
              selectionMode={selectionMode}
              onTowerClick={onTowerClick}
              startNumber={startNumber}
            />
          </>
        )}
      </MapContainer>
    </div>
  )
}
