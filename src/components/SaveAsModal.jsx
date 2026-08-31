import { useEffect, useRef, useState } from 'react'
import { sanitizeFilename } from '../services/saveFile.js'

export default function SaveAsModal({ suggestedName, ext, altExt, count, onSave, onClose }) {
  const [chosenExt, setChosenExt] = useState(ext)
  // Offer the generated name without its extension — that is the part worth
  // editing, and re-typing ".kml" every time is noise.
  const initial = suggestedName.toLowerCase().endsWith(ext)
    ? suggestedName.slice(0, -ext.length)
    : suggestedName
  const [name, setName] = useState(initial)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const finalName = sanitizeFilename(name, chosenExt)
  const empty = !name.trim()

  function submit(e) {
    e.preventDefault()
    if (empty) return
    onSave(finalName, chosenExt)
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal modal--narrow"
        role="dialog"
        aria-modal="true"
        aria-label="Save file as"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">Save as</div>
            <div className="modal-subtitle">
              {count != null && <>{count} {count === 1 ? 'feature' : 'features'} · </>}
              goes to your Downloads folder
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="modal-body" onSubmit={submit}>
          <label className="field">
            <span className="field-label">File name</span>
            <div className="field-row">
              <input
                ref={inputRef}
                className={`field-input${empty ? ' field-input--bad' : ''}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="file name"
              />
              {altExt ? (
                <div className="ext-toggle">
                  {[ext, altExt].map((e) => (
                    <button
                      key={e}
                      type="button"
                      className={`ext-opt${chosenExt === e ? ' ext-opt--on' : ''}`}
                      onClick={() => setChosenExt(e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="field-ext">{chosenExt}</span>
              )}
            </div>
            <span className="field-hint">
              Saves as <code>{finalName}</code>
              {chosenExt === '.kmz' && ' — zipped, much smaller for a long line'}
            </span>
          </label>

          <div className="modal-actions">
            <div className="modal-actions-right">
              <button type="button" className="modal-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="modal-btn modal-btn--primary" disabled={empty}>
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
