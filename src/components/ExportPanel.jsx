export default function ExportPanel({
  fromTower,
  toTower,
  selectionMode,
  onSetMode,
  onExport,
  onExportCSV,
  onReset,
  startNumber,
  onStartNumberChange,
  towerCount,
  rangeLength,
  formatLength,
  totalTowers = 0,
  editMode = false,
  onToggleEdit,
  addMode = false,
  onToggleAdd,
  canUndo = false,
  onUndo,
  canRedo = false,
  onRedo,
  onClear,
  onSelectAll,
}) {
  const hasRange = Boolean(fromTower && toTower)
  // A range narrows the export; without one the whole line goes out.
  const canExport = totalTowers > 0
  const exportCount = hasRange ? towerCount : totalTowers
  const start = Number(startNumber) || 1
  const endNumber = start + Math.max(exportCount - 1, 0)

  return (
    <div className="export-panel">
      <div className="export-panel-title">Select Tower Range</div>

      <div className="range-grid">
        {/* FROM */}
        <div className={`range-card range-card--from${selectionMode === 'from' ? ' range-card--active' : ''}`}>
          <div className="range-card-label">START TOWER</div>
          <div className="range-card-value">
            {fromTower ? `Tower ${fromTower.towerNumber}` : '—'}
          </div>
          {fromTower && (
            <div className="range-card-coords">
              {fromTower.lat.toFixed(5)}, {fromTower.lon.toFixed(5)}
            </div>
          )}
          <button
            className={`range-btn range-btn--from${selectionMode === 'from' ? ' range-btn--active' : ''}`}
            onClick={() => onSetMode(selectionMode === 'from' ? null : 'from')}
          >
            {selectionMode === 'from' ? 'Cancel' : fromTower ? '✎ Change' : '+ Select'}
          </button>
        </div>

        {/* Arrow / count */}
        <div className="range-arrow">
          {towerCount > 0
            ? <>
                <strong>{towerCount}</strong>
                <span>towers</span>
                <span className="range-distance">{formatLength(rangeLength)}</span>
              </>
            : <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M5 12h14M13 6l6 6-6 6" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          }
        </div>

        {/* TO */}
        <div className={`range-card range-card--to${selectionMode === 'to' ? ' range-card--active' : ''}`}>
          <div className="range-card-label">END TOWER</div>
          <div className="range-card-value">
            {toTower ? `Tower ${toTower.towerNumber}` : '—'}
          </div>
          {toTower && (
            <div className="range-card-coords">
              {toTower.lat.toFixed(5)}, {toTower.lon.toFixed(5)}
            </div>
          )}
          <button
            className={`range-btn range-btn--to${selectionMode === 'to' ? ' range-btn--active' : ''}`}
            onClick={() => onSetMode(selectionMode === 'to' ? null : 'to')}
            disabled={!fromTower && selectionMode !== 'to'}
          >
            {selectionMode === 'to' ? 'Cancel' : toTower ? '✎ Change' : '+ Select'}
          </button>
        </div>
      </div>

      {/* Custom renumbering */}
      <div className="renumber-row">
        <label className="renumber-label" htmlFor="startNum">
          Number towers from
        </label>
        <input
          id="startNum"
          className="renumber-input"
          type="number"
          min="0"
          value={startNumber}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onStartNumberChange(e.target.value)}
        />
        {hasRange ? (
          <span className="renumber-preview">
            → exports as <strong>T{start}</strong> to <strong>T{endNumber}</strong>
          </span>
        ) : (
          // Renumbering only ever touches a chosen range, so that loading a
          // file does not silently rewrite the numbering it came with.
          <button className="renumber-all-btn" onClick={onSelectAll} disabled={!totalTowers}>
            apply to all {totalTowers}
          </button>
        )}
      </div>

      {/* Editing */}
      <div className="edit-row">
        <button
          className={`edit-toggle${editMode ? ' edit-toggle--on' : ''}`}
          onClick={onToggleEdit}
          disabled={!totalTowers}
        >
          ✎ {editMode ? 'Done editing' : 'Edit towers'}
        </button>

        {editMode && (
          <>
            <button
              className={`edit-toggle${addMode ? ' edit-toggle--on' : ''}`}
              onClick={onToggleAdd}
            >
              ➕ {addMode ? 'Click map…' : 'Add tower'}
            </button>
          </>
        )}

        {/* Undo/redo are app-wide (Ctrl+Z / Ctrl+Y), so they stay visible
            whether or not edit mode is on. */}
        <button className="edit-toggle" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶ Undo
        </button>
        <button className="edit-toggle" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
          ↷ Redo
        </button>
        <button className="edit-toggle edit-toggle--danger" onClick={onClear} title="Remove this line and start over">
          🗑 Clear
        </button>
      </div>

      <div className="export-actions">
        {hasRange && (
          <button className="reset-btn" onClick={onReset}>
            Reset
          </button>
        )}
        <button
          className="export-btn export-btn--csv"
          disabled={!canExport}
          onClick={onExportCSV}
        >
          <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
            <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M3 8h14M8 8v9" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          Export CSV
        </button>
        <button
          className="export-btn"
          disabled={!canExport}
          onClick={onExport}
        >
          <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
            <path d="M10 3v10M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 16h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Export KML{canExport && <span className="export-btn-count">{hasRange ? `${exportCount}` : `all ${exportCount}`}</span>}
        </button>
      </div>
    </div>
  )
}
