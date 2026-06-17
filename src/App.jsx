import { useState, useCallback } from 'react'
import SearchBar from './components/SearchBar.jsx'
import MapView from './components/MapView.jsx'
import TowerList from './components/TowerList.jsx'
import ExportPanel from './components/ExportPanel.jsx'
import { searchPowerLines, fetchLineGeometry } from './services/overpassApi.js'
import {
  generateKML,
  downloadKML,
  generateCSV,
  downloadCSV,
} from './services/kmlGenerator.js'

export default function App() {
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]         = useState(false)
  const [selectedLine, setSelectedLine]   = useState(null)
  const [towers, setTowers]               = useState([])
  const [loading, setLoading]             = useState(false)
  const [fromIdx, setFromIdx]             = useState(null)
  const [toIdx, setToIdx]                 = useState(null)
  const [selectionMode, setSelectionMode] = useState(null) // 'from' | 'to' | null
  const [startNumber, setStartNumber]     = useState(1)     // custom renumber start
  const [error, setError]                 = useState(null)

  const handleSearch = useCallback(async (q) => {
    setSearching(true)
    setError(null)
    try {
      const results = await searchPowerLines(q)
      setSearchResults(results)
    } catch (e) {
      setError('Search failed: ' + e.message)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  const handleSelectLine = useCallback(async (result) => {
    setSearchResults([])
    setSelectedLine(result)
    setTowers([])
    setFromIdx(null)
    setToIdx(null)
    setSelectionMode(null)
    setError(null)
    setLoading(true)
    try {
      const data = await fetchLineGeometry(result.type, result.id)
      if (!data.length) {
        setError('No tower geometry found for this line.')
      } else {
        setTowers(data)
      }
    } catch (e) {
      setError('Failed to load towers: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleTowerClick = useCallback((idx) => {
    if (selectionMode === 'from') {
      setFromIdx(idx)
      setToIdx(null)
      setSelectionMode('to')
    } else if (selectionMode === 'to') {
      if (idx === fromIdx) return
      setToIdx(idx)
      setSelectionMode(null)
    }
  }, [selectionMode, fromIdx])

  const handleSetMode = useCallback((mode) => {
    setSelectionMode(mode)
  }, [])

  const safeName = useCallback(() => {
    const name = selectedLine?.tags?.name || `Line ${selectedLine?.id}`
    return name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')
  }, [selectedLine])

  const rangeLabel = useCallback(() => {
    const end = startNumber + Math.abs(toIdx - fromIdx)
    return `T${startNumber}-T${end}`
  }, [startNumber, fromIdx, toIdx])

  const handleExport = useCallback(() => {
    if (fromIdx === null || toIdx === null) return
    const name = selectedLine?.tags?.name || `Line ${selectedLine?.id}`
    const kml  = generateKML(towers, fromIdx, toIdx, name, startNumber)
    downloadKML(kml, `${safeName()}_${rangeLabel()}.kml`)
  }, [towers, fromIdx, toIdx, selectedLine, startNumber, safeName, rangeLabel])

  const handleExportCSV = useCallback(() => {
    if (fromIdx === null || toIdx === null) return
    const name = selectedLine?.tags?.name || `Line ${selectedLine?.id}`
    const csv  = generateCSV(towers, fromIdx, toIdx, name, startNumber)
    downloadCSV(csv, `${safeName()}_${rangeLabel()}.csv`)
  }, [towers, fromIdx, toIdx, selectedLine, startNumber, safeName, rangeLabel])

  const handleReset = useCallback(() => {
    setFromIdx(null)
    setToIdx(null)
    setSelectionMode(null)
  }, [])

  const lineName = selectedLine?.tags?.name || (selectedLine ? `ID: ${selectedLine.id}` : '')
  const voltage  = selectedLine?.tags?.voltage
    ? `${Math.round(Number(selectedLine.tags.voltage) / 1000)} kV`
    : null

  return (
    <div className="app">
      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
              <path d="M16 2L4 17h10l-2 13L28 12H18L20 2z" fill="#f59e0b" stroke="#d97706" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
            <div>
              <h1 className="app-title">सर्जनम्</h1>
              <p className="app-subtitle">Power Line Tower Export</p>
            </div>
          </div>
        </div>

        <div className="sidebar-body">
          {/* Search */}
          <section className="section">
            <div className="section-label">Search Power Line</div>
            <SearchBar
              onSearch={handleSearch}
              results={searchResults}
              searching={searching}
              onSelect={handleSelectLine}
            />
            <p className="search-hint">
              Try a line name like <code>400 kV</code> or an ID like <code>relation:14543153</code>
            </p>
          </section>

          {/* Error */}
          {error && (
            <div className="alert alert--error">
              <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
                <circle cx="10" cy="10" r="8" stroke="#ef4444" strokeWidth="1.5"/>
                <path d="M10 6v5M10 13.5v.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span>{error}</span>
              <button onClick={() => setError(null)}>✕</button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="alert alert--info">
              <span className="spinner" />
              <span>Fetching tower data from OpenStreetMap…</span>
            </div>
          )}

          {/* Line info */}
          {selectedLine && !loading && (
            <>
              <section className="section">
                <div className="line-card">
                  <div className="line-card-top">
                    <span className={`type-pill type-pill--${selectedLine.type}`}>
                      {selectedLine.type}
                    </span>
                    <span className="line-card-name">{lineName}</span>
                  </div>
                  <div className="line-card-meta">
                    {voltage && (
                      <span className="meta-chip meta-chip--voltage">⚡ {voltage}</span>
                    )}
                    {selectedLine.tags?.operator && (
                      <span className="meta-chip">{selectedLine.tags.operator}</span>
                    )}
                    {selectedLine.tags?.circuits && (
                      <span className="meta-chip">{selectedLine.tags.circuits} circuits</span>
                    )}
                  </div>
                  {towers.length > 0 && (
                    <div className="tower-count">
                      <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                        <circle cx="10" cy="10" r="7" stroke="#6366f1" strokeWidth="1.5"/>
                        <path d="M10 7v4M10 13v.5" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      {towers.length} towers loaded
                    </div>
                  )}
                </div>
              </section>

              {towers.length > 0 && (
                <>
                  <section className="section">
                    <ExportPanel
                      fromTower={fromIdx !== null ? towers[fromIdx] : null}
                      toTower={toIdx !== null ? towers[toIdx] : null}
                      selectionMode={selectionMode}
                      onSetMode={handleSetMode}
                      onExport={handleExport}
                      onExportCSV={handleExportCSV}
                      onReset={handleReset}
                      startNumber={startNumber}
                      onStartNumberChange={setStartNumber}
                      towerCount={
                        fromIdx !== null && toIdx !== null ? Math.abs(toIdx - fromIdx) + 1 : 0
                      }
                    />
                  </section>

                  <TowerList
                    towers={towers}
                    fromIdx={fromIdx}
                    toIdx={toIdx}
                    onTowerClick={handleTowerClick}
                    selectionMode={selectionMode}
                    startNumber={startNumber}
                  />
                </>
              )}
            </>
          )}

          {/* Empty state */}
          {!selectedLine && !loading && (
            <div className="empty-state">
              <svg viewBox="0 0 64 64" fill="none" width="56" height="56">
                <rect x="8" y="28" width="48" height="4" rx="2" fill="#e2e8f0"/>
                <circle cx="16" cy="30" r="4" fill="#94a3b8"/>
                <circle cx="32" cy="30" r="4" fill="#94a3b8"/>
                <circle cx="48" cy="30" r="4" fill="#94a3b8"/>
                <path d="M20 18l-4 12M44 18l4 12M20 42l-4-12M44 42l4-12" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <p>Search a power line above to load its towers on the map.</p>
            </div>
          )}
        </div>

        {/* ── Make in India badge — bottom of sidebar ── */}
        <div className="sidebar-footer">
          <img
            src="/make in india.png"
            alt="Make in India"
            className="make-in-india-badge"
          />
        </div>
      </aside>

      {/* ── MAP ── */}
      <main className="map-area">
        <MapView
          towers={towers}
          fromIdx={fromIdx}
          toIdx={toIdx}
          selectionMode={selectionMode}
          onTowerClick={handleTowerClick}
          startNumber={startNumber}
        />
      </main>
    </div>
  )
}
