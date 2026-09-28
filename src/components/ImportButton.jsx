import { useRef } from 'react'

export default function ImportButton({ onImport, importing }) {
  const inputRef = useRef(null)

  function handleChange(e) {
    const file = e.target.files?.[0]
    // Reset first, so picking the same file twice in a row still fires onChange.
    e.target.value = ''
    if (file) onImport(file)
  }

  return (
    <div className="import-row">
      <input
        ref={inputRef}
        type="file"
        accept=".kml,.kmz,.csv,.txt"
        className="import-input"
        onChange={handleChange}
      />
      <button
        className="import-btn"
        onClick={() => inputRef.current?.click()}
        disabled={importing}
      >
        {importing ? (
          <span className="spinner" />
        ) : (
          <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
            <path d="M10 13V3M5 8l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 16h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {importing ? 'Reading file…' : 'Import KML / CSV'}
      </button>
      <span className="import-hint">or drop a .kml / .kmz / .csv on the map</span>
    </div>
  )
}
