import { useState, useRef, useEffect, useCallback } from 'react'

export default function SearchBar({ onSearch, results, searching, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)

  const triggerSearch = useCallback(
    (val) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (val.trim().length < 2) { setOpen(false); return }
      debounceRef.current = setTimeout(() => {
        onSearch(val.trim())
        setOpen(true)
      }, 550)
    },
    [onSearch]
  )

  useEffect(() => { triggerSearch(query) }, [query, triggerSearch])
  useEffect(() => { if (results.length > 0) setOpen(true) }, [results])

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(r) {
    setQuery(r.tags?.name || `${r.type}:${r.id}`)
    setOpen(false)
    onSelect(r)
  }

  function voltageLabel(tags) {
    if (!tags?.voltage) return null
    return `${Math.round(Number(tags.voltage) / 1000)} kV`
  }

  return (
    <div className="search-wrapper" ref={wrapperRef}>
      <div className="search-box">
        <svg className="search-icon" viewBox="0 0 20 20" fill="none">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="#94a3b8" strokeWidth="1.6"/>
          <path d="M13 13l3.5 3.5" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
        <input
          className="search-input"
          type="text"
          placeholder="Search power line name or relation:ID…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {searching && <span className="search-spinner" />}
        {query && !searching && (
          <button className="clear-btn" onClick={() => { setQuery(''); setOpen(false) }} aria-label="Clear">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
              <path d="M4 4l8 8M12 4l-8 8" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="search-dropdown">
          {results.length === 0 && !searching && (
            <div className="dropdown-empty">No power lines found for "{query}"</div>
          )}
          {results.map(r => (
            <button
              key={`${r.type}-${r.id}`}
              className="dropdown-item"
              onClick={() => select(r)}
            >
              <div className="dropdown-row">
                <span className={`type-pill type-pill--${r.type}`}>{r.type}</span>
                <span className="dropdown-name">{r.tags?.name || `ID: ${r.id}`}</span>
              </div>
              <div className="dropdown-meta">
                {voltageLabel(r.tags) && <span className="meta-chip">{voltageLabel(r.tags)}</span>}
                {r.tags?.operator && <span className="meta-chip">{r.tags.operator}</span>}
                {r.tags?.circuits && <span className="meta-chip">{r.tags.circuits} circuits</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
