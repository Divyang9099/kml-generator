import { useEffect, useRef, useState } from 'react'
import { hasCustomNumber } from '../services/towers.js'

export default function TowerEditModal({ tower, displayNum, position, onSave, onDelete, onClose }) {
  const [number, setNumber] = useState(tower.customNumber ?? '')
  const [label, setLabel]   = useState(tower.name ?? '')
  const [lat, setLat]       = useState(String(tower.lat))
  const [lon, setLon]       = useState(String(tower.lon))
  const numberRef = useRef(null)

  useEffect(() => {
    numberRef.current?.focus()
    numberRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Typed rather than dragged, so a fat-fingered coordinate would silently
  // relocate the tower. Block the save instead.
  const latNum = Number(lat)
  const lonNum = Number(lon)
  const latOk = lat.trim() !== '' && Number.isFinite(latNum) && latNum >= -90 && latNum <= 90
  const lonOk = lon.trim() !== '' && Number.isFinite(lonNum) && lonNum >= -180 && lonNum <= 180
  const error = !latOk
    ? 'Latitude must be a number between −90 and 90.'
    : !lonOk
      ? 'Longitude must be a number between −180 and 180.'
      : null

  function submit(e) {
    e.preventDefault()
    if (error) return
    onSave(tower.uid, {
      customNumber: number.trim(), // empty means "no override"
      name: label.trim(),
      lat: latNum,
      lon: lonNum,
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit tower ${displayNum}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">Tower {displayNum}</div>
            <div className="modal-subtitle">
              {position != null && <>#{position} in the line</>}
              {tower.osmId && <> · OSM node {tower.osmId}</>}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="modal-body" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Tower number</span>
            <div className="field-row">
              <input
                ref={numberRef}
                className="field-input"
                value={number}
                placeholder={displayNum}
                onChange={(e) => setNumber(e.target.value)}
              />
              {hasCustomNumber({ customNumber: number }) && (
                <button type="button" className="field-btn" onClick={() => setNumber('')}>
                  Reset to original
                </button>
              )}
            </div>
            <span className="field-hint">
              Anything works — <code>45</code>, <code>45A</code>, <code>T-12/1</code>. Leave empty to use
              the number this tower already had ({tower.towerNumber}).
            </span>
          </label>

          <label className="field">
            <span className="field-label">Name / label <span className="field-optional">optional</span></span>
            <input
              className="field-input"
              value={label}
              placeholder="e.g. Angle point, river crossing"
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span className="field-label">Latitude</span>
              <input
                className={`field-input${latOk ? '' : ' field-input--bad'}`}
                value={lat}
                inputMode="decimal"
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Longitude</span>
              <input
                className={`field-input${lonOk ? '' : ' field-input--bad'}`}
                value={lon}
                inputMode="decimal"
                onChange={(e) => setLon(e.target.value)}
              />
            </label>
          </div>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn--danger" onClick={() => onDelete(tower.uid)}>
              Delete tower
            </button>
            <div className="modal-actions-right">
              <button type="button" className="modal-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="modal-btn modal-btn--primary" disabled={Boolean(error)}>
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
