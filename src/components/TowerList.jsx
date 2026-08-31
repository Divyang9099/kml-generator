import { useRef, useEffect } from 'react'
import { displayNumber, resolveRange, hasCustomNumber } from '../services/towers.js'

function towerStatus(idx, fromIdx, toIdx) {
  if (idx === fromIdx) return 'from'
  if (idx === toIdx)   return 'to'
  if (fromIdx !== null && toIdx !== null) {
    const lo = Math.min(fromIdx, toIdx)
    const hi = Math.max(fromIdx, toIdx)
    if (idx > lo && idx < hi) return 'range'
  }
  return 'default'
}

export default function TowerList({
  towers,
  fromIdx,
  toIdx,
  onTowerClick,
  selectionMode,
  startNumber = 1,
  editMode = false,
  onNumberChange,
  onDeleteTower,
  onEditTower,
}) {
  const range = resolveRange(towers, fromIdx, toIdx)

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

      {editMode && !selectionMode && (
        <div className="tower-list-hint tower-list-hint--edit">
          Type a number to rename a tower · ✕ deletes it
        </div>
      )}

      <div className="tower-list-scroll">
        {towers.map((tower, idx) => {
          const status = towerStatus(idx, fromIdx, toIdx)
          const num = displayNumber(tower, idx, range, startNumber)
          const renamed = num !== String(tower.towerNumber)

          return (
            <div
              key={tower.uid}
              ref={status === 'from' ? fromRef : status === 'to' ? toRef : null}
              className={`tower-item tower-item--${status}`}
            >
              <button className="tower-item-main" onClick={() => onTowerClick(idx)}>
                <span className={`tower-dot tower-dot--${status}`} />

                <span className="tower-num">
                  T{num}
                  {renamed && <span className="tower-orig">({tower.towerNumber})</span>}
                </span>

                <span className="tower-coords">
                  {tower.lat.toFixed(5)}, {tower.lon.toFixed(5)}
                </span>

                {tower.osmId && <span className="tower-osm">#{tower.osmId}</span>}

                {status === 'from' && <span className="tower-badge tower-badge--from">START</span>}
                {status === 'to'   && <span className="tower-badge tower-badge--to">END</span>}
              </button>

              {/* Always available, revealed on row hover — the discoverable way in. */}
              <button
                className="tower-edit-btn"
                title="Edit this tower"
                onClick={() => onEditTower(tower.uid)}
              >
                ✎
              </button>

              {editMode && (
                <div className="tower-edit">
                  <input
                    className="tower-num-input"
                    value={tower.customNumber ?? ''}
                    placeholder={num}
                    title="Set this tower's number"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => onNumberChange(tower.uid, e.target.value)}
                  />
                  {hasCustomNumber(tower) && (
                    <button
                      className="tower-row-btn"
                      title="Clear custom number"
                      onClick={() => onNumberChange(tower.uid, '')}
                    >
                      ↺
                    </button>
                  )}
                  <button
                    className="tower-row-btn tower-row-btn--del"
                    title="Delete this tower"
                    onClick={() => onDeleteTower(tower.uid)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
