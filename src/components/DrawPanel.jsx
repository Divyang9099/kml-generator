import { useEffect, useRef } from 'react'
import { TYPE_LABEL, measurementOf } from '../services/shapes.js'

// The feature list. The drawing controls live in DrawToolbar, over the map, so
// this gets the whole height of the sidebar.
export default function DrawPanel({
  shapes,
  selectedId,
  onSelect,
  onEditShape,
  onDeleteShape,
  onBufferShape,
}) {
  const cardRef = useRef(null)
  const rowRef = useRef(null)
  const selected = shapes.find((s) => s.id === selectedId) || null

  // A shape picked on the map should show up here: bring its card, and its row
  // in the list below, into view.
  useEffect(() => {
    if (!selectedId) return
    cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  return (
    <>
      {selected && (
        <div className="shape-card" ref={cardRef}>
          <div className="shape-card-top">
            <span className="shape-swatch" style={{ background: selected.color }} />
            <span className="shape-card-name">{selected.name?.trim() || TYPE_LABEL[selected.type]}</span>
            <span className="shape-type">{TYPE_LABEL[selected.type]}</span>
            <button className="alert-dismiss" title="Deselect" onClick={() => onSelect(null)}>✕</button>
          </div>
          <div className="shape-card-measure">{measurementOf(selected)}</div>
          {selected.description?.trim() && <div className="shape-card-note">{selected.description}</div>}
          <div className="shape-card-actions">
            <button className="edit-toggle" onClick={() => onEditShape(selected.id)}>✎ Edit</button>
            <button className="edit-toggle" onClick={() => onBufferShape(selected.id)}>⭘ Buffer</button>
            <button className="edit-toggle shape-card-del" onClick={() => onDeleteShape(selected.id)}>✕ Delete</button>
          </div>
        </div>
      )}

      <div className="tower-list tower-list--fill">
        <div className="tower-list-header">
          <span className="tower-list-title">Features</span>
          <span className="tower-list-count">{shapes.length} total</span>
        </div>

        {shapes.length === 0 ? (
          <div className="shape-empty">Nothing drawn yet.</div>
        ) : (
          <div className="tower-list-scroll">
            {shapes.map((shape) => (
              <div
                key={shape.id}
                ref={shape.id === selectedId ? rowRef : null}
                className={`tower-item${shape.id === selectedId ? ' tower-item--range' : ''}`}
              >
                <button className="tower-item-main" onClick={() => onSelect(shape.id)}>
                  <span className="shape-swatch" style={{ background: shape.color }} />
                  {/* Stacked, because an area in acres is long enough to squeeze
                      the name off the row entirely when they share a line. */}
                  <span className="shape-text">
                    <span className="shape-name">
                      {shape.name?.trim() || TYPE_LABEL[shape.type]}
                      <span className="shape-type">{TYPE_LABEL[shape.type]}</span>
                    </span>
                    <span className="shape-measure">{measurementOf(shape)}</span>
                  </span>
                </button>
                <button className="tower-edit-btn" title="Edit this feature" onClick={() => onEditShape(shape.id)}>
                  ✎
                </button>
                <button
                  className="tower-edit-btn"
                  title="Buffer this feature — draw the area within a distance of it"
                  onClick={() => onBufferShape(shape.id)}
                >
                  ⭘
                </button>
                <button
                  className="tower-row-btn tower-row-btn--del"
                  title="Delete this feature"
                  onClick={() => onDeleteShape(shape.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
