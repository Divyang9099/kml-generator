import { useRef, useEffect } from 'react'

function towerStatus(idx, fromIdx, toIdx) {
  if (idx === fromIdx) return 'from'
  if (idx === toIdx)   return 'to'
  if (fromIdx !== null && toIdx !== null && idx > fromIdx && idx < toIdx) return 'range'
  return 'default'
}

export default function TowerList({ towers, fromIdx, toIdx, onTowerClick, selectionMode, startNumber = 1 }) {
  const inRange = (idx) =>
    fromIdx !== null && toIdx !== null && idx >= fromIdx && idx <= toIdx
  const displayNum = (idx) =>
    inRange(idx) ? (Number(startNumber) || 1) + (idx - fromIdx) : towers[idx].towerNumber

  const fromRef = useRef(null)
  const toRef   = useRef(null)

  useEffect(() => {
    if (fromIdx !== null && fromRef.current) {
      fromRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [fromIdx])

  useEffect(() => {
    if (toIdx !== null && toRef.current) {
      toRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [toIdx])

  if (!towers.length) return null

  return (
    <div className="tower-list">
      <div className="tower-list-header">
        <span className="tower-list-title">Towers</span>
        <span className="tower-list-count">{towers.length} total</span>
      </div>

      {selectionMode && (
        <div className="tower-list-hint">
          Click a tower to set {selectionMode === 'from' ? 'START' : 'END'}
        </div>
      )}

      <div className="tower-list-scroll">
        {towers.map((tower, idx) => {
          const status = towerStatus(idx, fromIdx, toIdx)
          const isActive = status === 'from' || status === 'to'

          return (
            <button
              key={tower.osmId}
              ref={status === 'from' ? fromRef : status === 'to' ? toRef : null}
              className={`tower-item tower-item--${status}`}
              onClick={() => onTowerClick(idx)}
            >
              <span className={`tower-dot tower-dot--${status}`} />

              <span className="tower-num">
                T{displayNum(idx)}
                {inRange(idx) && tower.towerNumber !== displayNum(idx) && (
                  <span className="tower-orig">({tower.towerNumber})</span>
                )}
              </span>

              <span className="tower-coords">
                {tower.lat.toFixed(5)}, {tower.lon.toFixed(5)}
              </span>

              <span className="tower-osm">#{tower.osmId}</span>

              {status === 'from' && <span className="tower-badge tower-badge--from">START</span>}
              {status === 'to'   && <span className="tower-badge tower-badge--to">END</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
