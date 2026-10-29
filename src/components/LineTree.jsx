import { useMemo } from 'react'
import { calcLength, formatLength } from '../services/kmlGenerator.js'
import { colorOf } from '../services/lines.js'

// One folder per line. The folder you open is the one being worked on, so its
// panels (`children`) sit inside it; the others stay shut until you click them.
// The eye hides a line from the map without touching it.
export default function LineTree({
  lines, activeId, collapsed, hidden,
  onToggle, onToggleVisible, onRemove, onShowAll, children,
}) {
  const lengths = useMemo(() => lines.map((l) => calcLength(l.towers)), [lines])
  const anyHidden = lines.some((l) => hidden.has(l.key))

  return (
    <div className="line-tree">
      <div className="line-tree-head">
        <span className="section-label">Lines · {lines.length}</span>
        {anyHidden && (
          <button className="line-tree-link" onClick={onShowAll}>Show all on map</button>
        )}
      </div>

      {lines.map((line, i) => {
        const active = line.key === activeId
        const open = active && !collapsed.has(line.key)
        const isHidden = hidden.has(line.key)
        const name = line.tags?.name || `Line ${line.id}`

        return (
          <div
            key={line.key}
            className={`folder${active ? ' folder--active' : ''}${isHidden ? ' folder--hidden' : ''}`}
          >
            <div className="folder-row">
              <button
                className="folder-toggle"
                onClick={() => onToggle(line.key)}
                aria-expanded={open}
                title={open ? 'Collapse' : 'Open this line'}
              >
                {open ? '▾' : '▸'}
              </button>
              <button className="folder-main" onClick={() => onToggle(line.key)} title={line.id}>
                <span
                  className="folder-swatch"
                  style={{ background: active ? '#ea580c' : colorOf(lines, line.key) }}
                />
                <span className="folder-text">
                  <span className="folder-name">{name}</span>
                  <span className="folder-sub">
                    {line.towers.length} towers · {formatLength(lengths[i])}
                  </span>
                </span>
              </button>
              <span className={`type-pill type-pill--${line.type}`}>{line.type}</span>
              <button
                className="folder-btn"
                onClick={() => onToggleVisible(line.key)}
                title={isHidden ? 'Show on map' : 'Hide from map'}
                aria-pressed={isHidden}
              >
                {isHidden ? '🙈' : '👁'}
              </button>
              <button
                className="folder-btn folder-btn--del"
                onClick={() => onRemove(line.key)}
                title="Remove this line (Ctrl+Z brings it back)"
              >
                ✕
              </button>
            </div>

            {open && <div className="folder-body">{children}</div>}
          </div>
        )
      })}
    </div>
  )
}
