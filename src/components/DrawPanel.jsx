import { useRef } from 'react'
import { TYPE_LABEL, measurementOf, isComplete } from '../services/shapes.js'

// "Select" is also the only mode a shape can be dragged, reshaped or have a
// vertex deleted in — every other tool is busy waiting for clicks that build
// a new shape, so it locks the existing ones rather than let a stray click
// select one by accident. Labelling it "Select / Edit" is what tells people
// that, instead of leaving them hunting for a separate edit switch.
const TOOLS = [
  { id: 'select',    label: 'Select',    icon: '⬚', title: 'Select — also how you drag, reshape or delete a point on any shape' },
  { id: 'point',     label: 'Point',     icon: '📍' },
  { id: 'line',      label: 'Line',      icon: '╱' },
  { id: 'polygon',   label: 'Polygon',   icon: '⬠' },
  { id: 'rectangle', label: 'Rectangle', icon: '▭' },
  { id: 'circle',    label: 'Circle',    icon: '◯' },
]

const HINTS = {
  point:     'Click the map to drop a point.',
  line:      'Click each turn. Right-click, double-click or Enter to finish.',
  polygon:   'Click each corner. Right-click, double-click or Enter to close it.',
  rectangle: 'Click one corner, then the opposite corner.',
  circle:    'Click the centre, then click to set the radius.',
  select:    'Click a shape to select it, then drag a handle dot to move that point, or double-click one to remove it.',
}

export default function DrawPanel({
  shapes,
  tool,
  draft,
  onTool,
  onFinish,
  onCancel,
  selectedId,
  onSelect,
  onEditShape,
  onDeleteShape,
  onBufferShape,
  onOpenFile,
  onExport,
  onExportCSV,
  onClear,
  onPointsToLine,
  opening,
}) {
  const fileRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onOpenFile(file)
  }

  const drawing = tool && tool !== 'select' && draft.length > 0
  const canFinish = drawing && isComplete(tool, draft)
  const pointCount = shapes.filter((s) => s.type === 'point').length

  return (
    <>
      <section className="section">
        <div className="section-label">Draw</div>
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`tool-btn${tool === t.id ? ' tool-btn--on' : ''}`}
              onClick={() => onTool(t.id)}
              title={t.title}
            >
              <span className="tool-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
        <p className="search-hint">{HINTS[tool] || HINTS.select}</p>

        <button
          className="edit-toggle join-line-btn"
          onClick={onPointsToLine}
          disabled={pointCount < 2}
          title={pointCount < 2 ? 'Needs at least 2 points on the canvas' : `Join all ${pointCount} points into one line`}
        >
          🔗 Points → Line{pointCount > 0 ? ` (${pointCount})` : ''}
        </button>

        {drawing && (
          <div className="draft-bar">
            <span className="draft-count">{draft.length} point{draft.length === 1 ? '' : 's'}</span>
            <div className="draft-actions">
              <button className="edit-toggle" onClick={onCancel}>Cancel</button>
              <button className="edit-toggle edit-toggle--on" onClick={onFinish} disabled={!canFinish}>
                Finish
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="import-row">
          <input ref={fileRef} type="file" accept=".kml,.kmz,.csv,.txt" className="import-input" onChange={handleFile} />
          <button className="import-btn" onClick={() => fileRef.current?.click()} disabled={opening}>
            {opening ? <span className="spinner" /> : '📂'} {opening ? 'Opening…' : 'Open KML / CSV'}
          </button>
          <button className="import-btn btn-clear" onClick={onClear} disabled={!shapes.length}>🗑 Clear</button>
        </div>
        <p className="search-hint">or drop a .kml / .kmz / .csv on the map</p>
        <div className="export-actions">
          <button className="export-btn export-btn--csv" onClick={onExportCSV} disabled={!shapes.length}>
            <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
              <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3 8h14M8 8v9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Export CSV
          </button>
          <button className="export-btn" onClick={onExport} disabled={!shapes.length}>
          <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
            <path d="M10 3v10M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 16h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Export KML
          {shapes.length > 0 && <span className="export-btn-count">{shapes.length}</span>}
          </button>
        </div>
      </section>

      <div className="tower-list">
        <div className="tower-list-header">
          <span className="tower-list-title">Features</span>
          <span className="tower-list-count">{shapes.length} total</span>
        </div>

        {shapes.length === 0 ? (
          <div className="shape-empty">Nothing drawn yet. Pick a tool above and click the map.</div>
        ) : (
          <div className="tower-list-scroll">
            {shapes.map((shape) => (
              <div
                key={shape.id}
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
