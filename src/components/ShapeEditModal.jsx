import { useEffect, useRef, useState } from 'react'
import { PALETTE, ICONS, TYPE_LABEL, measurementOf } from '../services/shapes.js'

export default function ShapeEditModal({ shape, onSave, onDelete, onClose }) {
  const [name, setName] = useState(shape.name ?? '')
  const [description, setDescription] = useState(shape.description ?? '')
  const [color, setColor] = useState(shape.color)
  const [width, setWidth] = useState(shape.width ?? 3)
  const [opacity, setOpacity] = useState(shape.opacity ?? 0.25)
  const [icon, setIcon] = useState(shape.icon ?? 'pin')
  const [iconScale, setIconScale] = useState(shape.iconScale ?? 1)
  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const isPoint = shape.type === 'point'
  const isArea = shape.type !== 'point' && shape.type !== 'line'

  function submit(e) {
    e.preventDefault()
    onSave(shape.id, {
      name: name.trim(),
      description: description.trim(),
      color,
      width: Number(width) || 3,
      opacity: Number(opacity),
      icon,
      iconScale: Number(iconScale) || 1,
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${shape.type}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">{name.trim() || TYPE_LABEL[shape.type]}</div>
            <div className="modal-subtitle">{TYPE_LABEL[shape.type]} · {measurementOf(shape)}</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="modal-body" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Name</span>
            <input
              ref={nameRef}
              className="field-input"
              value={name}
              placeholder={TYPE_LABEL[shape.type]}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">Description <span className="field-optional">optional</span></span>
            <textarea
              className="field-input field-textarea"
              rows={3}
              value={description}
              placeholder="Notes that show when this feature is clicked in Google Earth"
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="field">
            <span className="field-label">Colour</span>
            <div className="swatch-row">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`swatch${c === color ? ' swatch--on' : ''}`}
                  style={{ background: c }}
                  aria-label={c}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {isPoint ? (
            <div className="field-grid">
              <label className="field">
                <span className="field-label">Icon <span className="field-optional">in Google Earth</span></span>
                <select className="field-input" value={icon} onChange={(e) => setIcon(e.target.value)}>
                  {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Icon size</span>
                <input
                  className="field-input"
                  type="range" min="0.5" max="2" step="0.1"
                  value={iconScale}
                  onChange={(e) => setIconScale(e.target.value)}
                />
              </label>
            </div>
          ) : (
            <div className="field-grid">
              <label className="field">
                <span className="field-label">Line width</span>
                <input
                  className="field-input"
                  type="range" min="1" max="10" step="1"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </label>
              {isArea && (
                <label className="field">
                  <span className="field-label">Fill opacity</span>
                  <input
                    className="field-input"
                    type="range" min="0" max="1" step="0.05"
                    value={opacity}
                    onChange={(e) => setOpacity(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn--danger" onClick={() => onDelete(shape.id)}>
              Delete
            </button>
            <div className="modal-actions-right">
              <button type="button" className="modal-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="modal-btn modal-btn--primary">Save</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
