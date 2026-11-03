import { useRef } from 'react'
import { isComplete } from '../services/shapes.js'

// "Select" is also the only mode a shape can be dragged, reshaped or have a
// vertex deleted in — every other tool is busy waiting for clicks that build
// a new shape, so it locks the existing ones rather than let a stray click
// select one by accident.
const TOOLS = [
  { id: 'select',    label: 'Select',    icon: '⬚', title: 'Select — also how you drag, reshape or delete a point on any shape' },
  { id: 'point',     label: 'Point',     icon: '📍' },
  { id: 'line',      label: 'Line',      icon: '╱' },
  { id: 'polygon',   label: 'Polygon',   icon: '⬠' },
  { id: 'rectangle', label: 'Rectangle', icon: '▭' },
  { id: 'circle',    label: 'Circle',    icon: '◯' },
]

// The drawing controls, floating over the bottom of the map so the sidebar can
// give all of its height to the list of features.
export default function DrawToolbar({
  shapes,
  tool,
  draft,
  onTool,
  onFinish,
  onCancel,
  onOpenFiles,
  onExport,
  onExportCSV,
  onClear,
  onPointsToLine,
  opening,
}) {
  const fileRef = useRef(null)

  function handleFile(e) {
    // Copied out before the reset, which empties the input's file list.
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) onOpenFiles(files)
  }

  const drawing = tool && tool !== 'select' && draft.length > 0
  const canFinish = drawing && isComplete(tool, draft)
  const pointCount = shapes.filter((s) => s.type === 'point').length

  return (
    <div className="draw-toolbar">
      <div className="draw-toolbar-row">
        <div className="draw-toolbar-group">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`tool-btn tool-btn--bar${tool === t.id ? ' tool-btn--on' : ''}`}
              onClick={() => onTool(t.id)}
              title={t.title || t.label}
            >
              <span className="tool-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <span className="draw-toolbar-sep" />

        <button
          className="edit-toggle"
          onClick={onPointsToLine}
          disabled={pointCount < 2}
          title={pointCount < 2 ? 'Needs at least 2 points on the canvas' : `Join all ${pointCount} points into one line`}
        >
          🔗 Points → Line{pointCount > 0 ? ` (${pointCount})` : ''}
        </button>

        <span className="draw-toolbar-sep" />

        <div className="draw-toolbar-group">
          <input ref={fileRef} type="file" accept=".kml,.kmz,.csv,.txt" multiple className="import-input" onChange={handleFile} />
          <button
            className="edit-toggle"
            onClick={() => fileRef.current?.click()}
            disabled={opening}
            title="Open one or several KML / KMZ / CSV files — or drop them on the map"
          >
            {opening ? <span className="spinner" /> : '📂'} {opening ? 'Opening…' : 'Open'}
          </button>
          <button className="edit-toggle btn-clear" onClick={onClear} disabled={!shapes.length} title="Delete every drawn feature">
            🗑 Clear
          </button>
        </div>

        <span className="draw-toolbar-sep" />

        <div className="draw-toolbar-group">
          <button className="edit-toggle draw-toolbar-csv" onClick={onExportCSV} disabled={!shapes.length}>
            Export CSV
          </button>
          <button className="edit-toggle edit-toggle--on" onClick={onExport} disabled={!shapes.length}>
            ⬇ Export KML{shapes.length > 0 ? ` · ${shapes.length}` : ''}
          </button>
        </div>
      </div>

      {/* Only while a shape is being drawn: how many points, and the way out. */}
      {drawing && (
        <div className="draw-toolbar-hint">
          <span className="draft-count">{draft.length} point{draft.length === 1 ? '' : 's'}</span>
          <button className="edit-toggle" onClick={onCancel}>Cancel</button>
          <button className="edit-toggle edit-toggle--on" onClick={onFinish} disabled={!canFinish}>Finish</button>
        </div>
      )}
    </div>
  )
}
