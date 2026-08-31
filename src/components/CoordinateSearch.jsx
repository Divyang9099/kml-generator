import { useState } from 'react'
import { parseCoordinates, formatCoordinates } from '../services/coords.js'

export default function CoordinateSearch({ point, onGo, onClear }) {
  const [text, setText] = useState('')
  const [error, setError] = useState(null)

  function submit(e) {
    e.preventDefault()
    try {
      onGo(parseCoordinates(text))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="coord-search">
      <form className="coord-box" onSubmit={submit}>
        <svg viewBox="0 0 20 20" fill="none" width="15" height="15" className="coord-icon">
          <path d="M10 2.5c-2.9 0-5.2 2.3-5.2 5.2 0 3.9 5.2 9.8 5.2 9.8s5.2-5.9 5.2-9.8c0-2.9-2.3-5.2-5.2-5.2z"
            stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="10" cy="7.7" r="1.9" stroke="#94a3b8" strokeWidth="1.5" />
        </svg>
        <input
          className="coord-input"
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null) }}
          placeholder="Go to coordinates — 22.5, 79.0"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="coord-go" type="submit" disabled={!text.trim()}>Go</button>
      </form>

      {error && <div className="coord-msg coord-msg--error">{error}</div>}

      {point && !error && (
        <div className="coord-msg">
          <span>📍 {formatCoordinates(point.lat, point.lon)}</span>
          <button className="coord-clear" onClick={onClear} title="Remove this marker">✕</button>
        </div>
      )}
    </div>
  )
}
