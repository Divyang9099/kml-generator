import { useEffect, useRef, useState } from 'react'
import { TYPE_LABEL } from '../services/shapes.js'

// Asks for a distance in metres, then hands it to whatever draws the buffer.
// A point or circle grows into a circle; a line or polygon gets a new
// polygon traced around it at that distance — the same dialog either way.
export default function BufferModal({ shape, onConfirm, onClose }) {
  const [meters, setMeters] = useState('50')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !working) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, working])

  async function submit(e) {
    e.preventDefault()
    const value = Number(meters)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a distance greater than 0.')
      return
    }
    setError(null)
    setWorking(true)
    try {
      await onConfirm(value)
    } catch (err) {
      setError(err.message || 'Could not buffer that feature.')
      setWorking(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => !working && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Buffer ${shape.type}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">Buffer {shape.name?.trim() || TYPE_LABEL[shape.type]}</div>
            <div className="modal-subtitle">Draws the area within a set distance of this {shape.type}</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close" disabled={working}>✕</button>
        </div>

        <form className="modal-body" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Distance</span>
            <div className="field-row">
              <input
                ref={inputRef}
                className={`field-input${error ? ' field-input--bad' : ''}`}
                type="number"
                min="0"
                step="any"
                value={meters}
                onChange={(e) => setMeters(e.target.value)}
                disabled={working}
              />
              <span className="field-optional">metres</span>
            </div>
          </label>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <span />
            <div className="modal-actions-right">
              <button type="button" className="modal-btn" onClick={onClose} disabled={working}>Cancel</button>
              <button type="submit" className="modal-btn modal-btn--primary" disabled={working}>
                {working ? <span className="spinner" /> : 'Buffer'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
