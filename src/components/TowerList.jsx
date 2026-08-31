import { useRef, useEffect, useLayoutEffect, useState } from 'react'
import { displayNumber, resolveRange, hasCustomNumber } from '../services/towers.js'

// Long lines are rendered through a scrolling window. Below this many towers
// the whole list is cheap enough to render outright, and doing so keeps the
// simpler code path for the common case.
const VIRTUALIZE_ABOVE = 300
const OVERSCAN = 10

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
  const scrollRef = useRef(null)
  const rowRef = useRef(null)

  const [scrollTop, setScrollTop] = useState(0)
  const [rowH, setRowH] = useState(34)
  const [viewH, setViewH] = useState(320)

  const virtual = towers.length > VIRTUALIZE_ABOVE

  // Row height is measured rather than assumed: edit mode makes rows taller,
  // and a wrong guess would make the scrollbar drift.
  useLayoutEffect(() => {
    if (scrollRef.current) setViewH(scrollRef.current.clientHeight || 320)
    const h = rowRef.current?.getBoundingClientRect().height
    if (h > 0 && Math.abs(h - rowH) > 0.5) setRowH(h)
  }, [editMode, towers.length, rowH])

  const scrollToIdx = (idx, ref) => {
    if (idx === null) return
    if (virtual && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, idx * rowH - viewH / 2)
    } else {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  useEffect(() => { scrollToIdx(fromIdx, fromRef) }, [fromIdx])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scrollToIdx(toIdx, toRef) }, [toIdx])         // eslint-disable-line react-hooks/exhaustive-deps

  if (!towers.length) return null

  const firstIdx = virtual ? Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN) : 0
  const shown = virtual
    ? Math.min(towers.length - firstIdx, Math.ceil(viewH / rowH) + OVERSCAN * 2)
    : towers.length
  const padTop = firstIdx * rowH
  const padBottom = Math.max(0, (towers.length - firstIdx - shown) * rowH)

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

      <div
        className="tower-list-scroll"
        ref={scrollRef}
        onScroll={virtual ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
      >
        {padTop > 0 && <div style={{ height: padTop }} aria-hidden="true" />}

        {towers.slice(firstIdx, firstIdx + shown).map((tower, i) => {
          const idx = firstIdx + i
          const status = towerStatus(idx, fromIdx, toIdx)
          const num = displayNumber(tower, idx, range, startNumber)
          const renamed = num !== String(tower.towerNumber)

          return (
            <div
              key={tower.uid}
              ref={(el) => {
                if (i === 0) rowRef.current = el
                if (status === 'from') fromRef.current = el
                if (status === 'to') toRef.current = el
              }}
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

        {padBottom > 0 && <div style={{ height: padBottom }} aria-hidden="true" />}
      </div>
    </div>
  )
}
