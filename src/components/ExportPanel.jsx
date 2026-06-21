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
}) {
  const canExport = fromTower && toTower
  const start = Number(startNumber) || 1
  const endNumber = canExport ? start + towerCount - 1 : start

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
          onChange={(e) => onStartNumberChange(e.target.value)}
        />
        {canExport && (
          <span className="renumber-preview">
            → exports as <strong>T{start}</strong> to <strong>T{endNumber}</strong>
          </span>
        )}
      </div>

      <div className="export-actions">
        {canExport && (
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
          Export KML
        </button>
      </div>
    </div>
  )
}
