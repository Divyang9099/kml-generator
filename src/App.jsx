import { useState, useCallback, useMemo, useEffect } from 'react'
import SearchBar from './components/SearchBar.jsx'
import MapView from './components/MapView.jsx'
import TowerList from './components/TowerList.jsx'
import ExportPanel from './components/ExportPanel.jsx'
import ImportButton from './components/ImportButton.jsx'
import TowerEditModal from './components/TowerEditModal.jsx'
import DrawPanel from './components/DrawPanel.jsx'
import ShapeEditModal from './components/ShapeEditModal.jsx'
import BufferModal from './components/BufferModal.jsx'
import SaveAsModal from './components/SaveAsModal.jsx'
import useDocumentHistory from './hooks/useDocumentHistory.js'
import { searchPowerLines, fetchLineGeometry } from './services/overpassApi.js'
import { readTowerFile, readKmlText, baseName, isCsvFile } from './services/kmlParser.js'
import { generateShapeKML, generateShapeCSV, parseShapeKML } from './services/shapeKml.js'
import { parseCSVShapes } from './services/csvImport.js'
import { bufferShape } from './services/buffer.js'
import { createShape, isComplete, radiusBetween, primeShapeCounter, cleanCoords } from './services/shapes.js'
import { loadSession, saveSession, flushSession, clearSession, isEmptySession } from './services/storage.js'
import { downloadAs, downloadBlob, toKmz, FILE_TYPES } from './services/saveFile.js'
import { nextUid, insertionIndex, displayNumber, resolveRange, primeUidCounter } from './services/towers.js'
import {
  generateKML,
  generateCSV,
  calcLength,
  formatLength,
  selectTowers,
} from './services/kmlGenerator.js'

export default function App() {
  // Whatever the last session left behind, read once before first paint. The id
  // counters must be advanced past it, or the next tower or shape created would
  // reuse an id that is still on screen.
  const restored = useMemo(() => {
    const session = loadSession()
    primeUidCounter(session?.towers)
    primeShapeCounter(session?.shapes)
    return session
  }, [])

  // selectedLine belongs to the document, not to UI state: it is what the
  // loaded towers *are*, so undoing a Clear has to bring it back with them.
  const { doc, past, commit, setDoc, undo, redo, canUndo, canRedo, reset } = useDocumentHistory(
    {
      towers: restored?.towers ?? [],
      shapes: restored?.shapes ?? [],
      selectedLine: restored?.selectedLine ?? null,
    },
    restored?.past ?? [], // so Ctrl+Z still reaches back past a reload
  )
  const { towers, shapes, selectedLine } = doc

  const [mode, setMode]                   = useState(restored?.mode ?? 'line')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]         = useState(false)
  const [loading, setLoading]             = useState(false)
  const [fromIdx, setFromIdx]             = useState(null)
  const [toIdx, setToIdx]                 = useState(null)
  const [selectionMode, setSelectionMode] = useState(null) // 'from' | 'to' | null
  const [startNumber, setStartNumber]     = useState(1)     // custom renumber start
  const [error, setError]                 = useState(null)
  const [notice, setNotice]               = useState(null) // non-fatal info, e.g. "skipped 2 rows"
  const [importing, setImporting]         = useState(false)
  const [editMode, setEditMode]           = useState(false)
  const [addMode, setAddMode]             = useState(false)
  const [editingUid, setEditingUid]       = useState(null)  // tower open in the edit dialog
  const [restoredNote, setRestoredNote]   = useState(() => !isEmptySession(restored))

  // Draw workspace
  const [tool, setTool]                   = useState('select')
  const [draft, setDraft]                 = useState([])
  const [selectedShapeId, setSelectedShapeId] = useState(null)
  const [editingShapeId, setEditingShapeId]   = useState(null)
  const [drawName, setDrawName]           = useState('Custom KML')
  const [opening, setOpening]             = useState(false)
  const [bufferingShapeId, setBufferingShapeId] = useState(null)
  const [pendingSave, setPendingSave]     = useState(null) // export waiting for a filename

  const drawing = mode === 'draw' && tool !== 'select'

  /* ── Session persistence ───────────────────────────────────────────── */

  useEffect(() => {
    saveSession({ towers, shapes, selectedLine, mode, past })
  }, [towers, shapes, selectedLine, mode, past])

  // Closing the tab mid-edit should cost a confirmation, not the work.
  useEffect(() => {
    if (!towers.length && !shapes.length) return undefined
    const onBeforeUnload = (e) => {
      // A debounced save would never fire once the tab is gone.
      flushSession({ towers, shapes, selectedLine, mode, past })
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [towers, shapes, selectedLine, mode, past])

  const totalLength = useMemo(() => calcLength(towers), [towers])
  const rangeLength = useMemo(() => {
    if (fromIdx === null || toIdx === null) return 0
    const lo = Math.min(fromIdx, toIdx)
    const hi = Math.max(fromIdx, toIdx)
    return calcLength(towers.slice(lo, hi + 1))
  }, [towers, fromIdx, toIdx])

  /* ── Undo / redo ───────────────────────────────────────────────────── */

  const clearSelection = useCallback(() => {
    // Indices refer to positions that may no longer mean the same tower.
    setFromIdx(null)
    setToIdx(null)
    setSelectionMode(null)
  }, [])

  const handleUndo = useCallback(() => { undo(); clearSelection() }, [undo, clearSelection])
  const handleRedo = useCallback(() => { redo(); clearSelection() }, [redo, clearSelection])

  const cancelDraft = useCallback(() => setDraft([]), [])

  const addShape = useCallback((shape) => {
    commit(d => ({ ...d, shapes: [...d.shapes, shape] }))
    setSelectedShapeId(shape.id)
  }, [commit])

  const finishDraft = useCallback(() => {
    const cleaned = cleanCoords(draft, tool === 'polygon')
    if (!isComplete(tool, cleaned)) return
    addShape(createShape(tool, cleaned))
    setDraft([])
  }, [tool, draft, addShape])

  const handleDeleteShape = useCallback((id) => {
    commit(d => ({ ...d, shapes: d.shapes.filter(s => s.id !== id) }))
    setSelectedShapeId(cur => (cur === id ? null : cur))
    setEditingShapeId(cur => (cur === id ? null : cur))
  }, [commit])

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      const modifier = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      // Ctrl+R belongs to the browser (reload); redo is Ctrl+Y / Ctrl+Shift+Z.
      if (modifier && !typing) {
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault()
          // Mid-draw, the thing you want back is the vertex you just placed,
          // not the shape you finished before it.
          if (drawing && draft.length) setDraft(d => d.slice(0, -1))
          else handleUndo()
          return
        }
        if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); return }
      }
      if (typing || modifier) return

      if (drawing && draft.length) {
        if (e.key === 'Enter')      { e.preventDefault(); finishDraft() }
        else if (e.key === 'Escape') cancelDraft()
        else if (e.key === 'Backspace') { e.preventDefault(); setDraft(d => d.slice(0, -1)) }
        return
      }
      if (mode === 'draw' && e.key === 'Delete' && selectedShapeId) {
        handleDeleteShape(selectedShapeId)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo, drawing, draft.length, finishDraft, cancelDraft, mode, selectedShapeId, handleDeleteShape])

  /* ── Power line workspace ──────────────────────────────────────────── */

  const handleSearch = useCallback(async (q) => {
    setSearching(true)
    setError(null)
    try {
      setSearchResults(await searchPowerLines(q))
    } catch (e) {
      setError('Search failed: ' + e.message)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  // Everything that must be cleared when a different line replaces the current one.
  const resetForNewLine = useCallback((nextTowers = [], line = null) => {
    reset({ towers: nextTowers, shapes, selectedLine: line })
    clearSelection()
    setEditMode(false)
    setAddMode(false)
    setEditingUid(null)
    setStartNumber(1)
    setError(null)
    setRestoredNote(false)
  }, [reset, shapes, clearSelection])

  const handleSelectLine = useCallback(async (result) => {
    setSearchResults([])
    resetForNewLine([], result)
    setLoading(true)
    try {
      const data = await fetchLineGeometry(result.type, result.id)
      if (!data.length) setError('No tower geometry found for this line.')
      else reset({ towers: data, shapes, selectedLine: result })
    } catch (e) {
      setError('Failed to load towers: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [resetForNewLine, reset, shapes])

  const handleImportFile = useCallback(async (file) => {
    setSearchResults([])
    resetForNewLine()
    setImporting(true)
    setNotice(null)
    try {
      // readTowerFile reads KML/KMZ as before, and a .csv/.txt straight through
      // the CSV analyser — the file extension is all that decides which.
      const { name, towers: parsed, notes } = await readTowerFile(file)
      // A synthetic "line" so every existing panel renders an imported file
      // exactly as it renders one loaded from OpenStreetMap.
      const badge = isCsvFile(file) ? 'csv' : 'kml'
      reset({ towers: parsed, shapes, selectedLine: { type: badge, id: file.name, tags: { name } } })
      if (notes?.length) setNotice(notes.join(' '))
    } catch (e) {
      reset({ towers: [], shapes, selectedLine: null })
      setError('Could not import that file: ' + e.message)
    } finally {
      setImporting(false)
    }
  }, [resetForNewLine, reset, shapes])

  // Structural edits are undoable. Number edits are not: they fire per
  // keystroke, and would bury every real change under a pile of single letters.
  const commitTowers = useCallback((next) => {
    commit(d => ({ ...d, towers: next }))
  }, [commit])

  const handleNumberChange = useCallback((uid, value) => {
    setDoc(d => ({ ...d, towers: d.towers.map(t => (t.uid === uid ? { ...t, customNumber: value } : t)) }))
  }, [setDoc])

  const handleDeleteTower = useCallback((uid) => {
    const idx = towers.findIndex(t => t.uid === uid)
    if (idx === -1) return
    commitTowers(towers.filter(t => t.uid !== uid))

    // Keep the selected range pointing at the same towers it did before.
    if (fromIdx === idx || toIdx === idx) {
      clearSelection()
    } else {
      const shift = (i) => (i === null ? null : i > idx ? i - 1 : i)
      setFromIdx(shift(fromIdx))
      setToIdx(shift(toIdx))
    }
  }, [towers, fromIdx, toIdx, commitTowers, clearSelection])

  const handleTowerMove = useCallback((uid, lat, lon) => {
    commitTowers(towers.map(t => (t.uid === uid ? { ...t, lat, lon } : t)))
  }, [towers, commitTowers])

  const handleAddTower = useCallback((lat, lon) => {
    const at = insertionIndex(towers, lat, lon)
    const before = towers[at - 1]
    const baseNumber = Number(before?.towerNumber)
    const next = [...towers]
    next.splice(at, 0, {
      uid: nextUid(),
      towerNumber: Number.isFinite(baseNumber) ? baseNumber + 1 : at + 1,
      lat,
      lon,
    })
    commitTowers(next)

    // A tower inserted inside the range pushes the endpoints after it along.
    const shift = (i) => (i === null ? null : i >= at ? i + 1 : i)
    setFromIdx(shift(fromIdx))
    setToIdx(shift(toIdx))
    setAddMode(false)
  }, [towers, fromIdx, toIdx, commitTowers])

  // One discrete change per Save, so unlike per-keystroke inline typing this
  // belongs on the undo stack.
  const handleSaveTower = useCallback((uid, patch) => {
    commitTowers(towers.map(t => (t.uid === uid ? { ...t, ...patch } : t)))
    setEditingUid(null)
  }, [towers, commitTowers])

  const handleDeleteFromModal = useCallback((uid) => {
    setEditingUid(null)
    handleDeleteTower(uid)
  }, [handleDeleteTower])

  const handleSelectAll = useCallback(() => {
    if (!towers.length) return
    setFromIdx(0)
    setToIdx(towers.length - 1)
    setSelectionMode(null)
  }, [towers.length])

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

  const safeName = useCallback(() => {
    const name = selectedLine?.tags?.name || `Line ${selectedLine?.id}`
    return name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')
  }, [selectedLine])

  // Names the towers actually exported, which is the whole line when no range
  // is selected, and honours hand-edited numbers.
  const rangeLabel = useCallback(() => {
    const selected = selectTowers(towers, fromIdx, toIdx, startNumber)
    if (!selected.length) return 'towers'
    const clean = (n) => String(n).replace(/[^\w-]/g, '')
    return `T${clean(selected[0].towerNumber)}-T${clean(selected[selected.length - 1].towerNumber)}`
  }, [towers, fromIdx, toIdx, startNumber])

  // Exports do not save straight away: they stage the content and let the user
  // name the file first.
  const handleExport = useCallback(() => {
    if (!towers.length) return
    const name = selectedLine?.tags?.name || `Line ${selectedLine?.id}`
    setPendingSave({
      content: generateKML(towers, fromIdx, toIdx, name, startNumber),
      suggestedName: `${safeName()}_${rangeLabel()}.kml`,
      kind: 'kml',
      count: selectTowers(towers, fromIdx, toIdx, startNumber).length,
    })
  }, [towers, fromIdx, toIdx, selectedLine, startNumber, safeName, rangeLabel])

  const handleExportCSV = useCallback(() => {
    if (!towers.length) return
    const name = selectedLine?.tags?.name || `Line ${selectedLine?.id}`
    setPendingSave({
      content: generateCSV(towers, fromIdx, toIdx, name, startNumber),
      suggestedName: `${safeName()}_${rangeLabel()}.csv`,
      kind: 'csv',
      count: selectTowers(towers, fromIdx, toIdx, startNumber).length,
    })
  }, [towers, fromIdx, toIdx, selectedLine, startNumber, safeName, rangeLabel])

  /* ── Draw workspace ────────────────────────────────────────────────── */

  const handleVertex = useCallback((coord) => {
    if (tool === 'point') {
      addShape(createShape('point', [coord]))
      return
    }
    const next = [...draft, coord]

    // Rectangle and circle are two-click gestures: the second click completes
    // them, so they never sit half-drawn.
    if (tool === 'rectangle' && next.length === 2) {
      addShape(createShape('rectangle', next))
      setDraft([])
      return
    }
    if (tool === 'circle' && next.length === 2) {
      addShape(createShape('circle', [next[0]], { radius: radiusBetween(next[0], next[1]) }))
      setDraft([])
      return
    }
    setDraft(next)
  }, [tool, draft, addShape])

  const handleShapePatch = useCallback((id, patch) => {
    commit(d => ({ ...d, shapes: d.shapes.map(s => (s.id === id ? { ...s, ...patch } : s)) }))
  }, [commit])

  const handleSaveShape = useCallback((id, patch) => {
    commit(d => ({ ...d, shapes: d.shapes.map(s => (s.id === id ? { ...s, ...patch } : s)) }))
    setEditingShapeId(null)
  }, [commit])

  // Every dropped point joins one line, in the order they sit in the list —
  // the order they were placed or imported in, which is what "join them up"
  // means for hand-drawn points. Switching to Select is what makes the new
  // line's vertices draggable right away — a shape only takes drag handles
  // while Select is the active tool, and whatever tool was last armed (Point,
  // say) would otherwise leave it looking stuck.
  const handlePointsToLine = useCallback(() => {
    const points = shapes.filter(s => s.type === 'point')
    if (points.length < 2) return
    const line = createShape('line', points.map(p => p.coords[0]))
    commit(d => ({ ...d, shapes: [...d.shapes.filter(s => s.type !== 'point'), line] }))
    setTool('select')
    setSelectedShapeId(line.id)
  }, [shapes, commit])

  const bufferingShape = shapes.find(s => s.id === bufferingShapeId) || null

  const handleConfirmBuffer = useCallback(async (meters) => {
    const shape = shapes.find(s => s.id === bufferingShapeId)
    if (!shape) return
    const rings = await bufferShape(shape, meters)
    const label = shape.name?.trim() || shape.type
    const built = rings.map(r => createShape(r.type, r.coords, {
      name: `${label} +${meters}m`,
      color: shape.color,
      ...(r.holes ? { holes: r.holes } : {}),
      ...(r.radius != null ? { radius: r.radius } : {}),
    }))
    commit(d => ({ ...d, shapes: [...d.shapes, ...built] }))
    setTool('select')
    setSelectedShapeId(built[0]?.id ?? null)
    setBufferingShapeId(null)
  }, [shapes, bufferingShapeId, commit])

  const handleOpenShapeFile = useCallback(async (file) => {
    setOpening(true)
    setError(null)
    setNotice(null)
    try {
      const { name, shapes: parsed, notes } = isCsvFile(file)
        ? parseCSVShapes(await file.text(), baseName(file.name))
        : parseShapeKML(await readKmlText(file), baseName(file.name))
      // Open replaces what is on the canvas, the way opening a file anywhere
      // else does. It goes through commit, so Ctrl+Z brings back the old work.
      commit(d => ({ ...d, shapes: parsed }))
      setDrawName(name)
      // Whatever tool was last armed (Point, Line…) leaves every shape locked
      // — a shape only gets drag handles while Select is active — so a fresh
      // import always lands ready to click and drag, not looking stuck.
      setTool('select')
      setSelectedShapeId(null)
      setRestoredNote(false)
      if (notes?.length) setNotice(notes.join(' '))
    } catch (e) {
      setError('Could not open that file: ' + e.message)
    } finally {
      setOpening(false)
    }
  }, [commit])

  const handleExportShapes = useCallback(() => {
    if (!shapes.length) return
    const title = drawName || 'Custom KML'
    setPendingSave({
      content: generateShapeKML(shapes, title),
      suggestedName: `${title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}.kml`,
      kind: 'kml',
      count: shapes.length,
    })
  }, [shapes, drawName])

  const handleExportShapesCSV = useCallback(() => {
    if (!shapes.length) return
    const title = drawName || 'Custom KML'
    setPendingSave({
      content: generateShapeCSV(shapes),
      suggestedName: `${title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}.csv`,
      kind: 'csv',
      count: shapes.length,
    })
  }, [shapes, drawName])

  const confirmSave = useCallback(async (filename, ext) => {
    if (!pendingSave) return
    if (ext === '.kmz') {
      downloadBlob(await toKmz(pendingSave.content), filename)
    } else {
      downloadAs(pendingSave.content, filename, FILE_TYPES[pendingSave.kind].mime)
    }
    setPendingSave(null)
  }, [pendingSave])

  const handleClearShapes = useCallback(() => {
    if (!window.confirm(`Delete all ${shapes.length} drawn features? Ctrl+Z brings them back.`)) return
    commit(d => ({ ...d, shapes: [] }))
    setSelectedShapeId(null)
    setEditingShapeId(null)
    setDraft([])
  }, [shapes.length, commit])

  // The power-line half of Clear: drops the loaded line, leaves drawn shapes.
  const handleClearLine = useCallback(() => {
    if (!window.confirm(`Remove this line and its ${towers.length} towers? Ctrl+Z brings it back.`)) return
    commit(d => ({ ...d, towers: [], selectedLine: null }))
    setEditingUid(null)
    setEditMode(false)
    setAddMode(false)
    clearSelection()
  }, [towers.length, commit, clearSelection])

  const handleClearEverything = useCallback(() => {
    if (!window.confirm('Clear the whole session — towers and drawn features?')) return
    reset({ towers: [], shapes: [], selectedLine: null })
    clearSession()
    setDraft([])
    setSelectedShapeId(null)
    setEditingShapeId(null)
    setRestoredNote(false)
    clearSelection()
  }, [reset, clearSelection])

  const handleTool = useCallback((next) => {
    setTool(next)
    setDraft([])
    if (next !== 'select') setSelectedShapeId(null)
  }, [])

  /* ── Derived ───────────────────────────────────────────────────────── */

  // Tracked by uid, not index: adding or deleting a tower shifts every index
  // after it, and the dialog must stay on the tower it was opened for.
  const editingIdx = editingUid ? towers.findIndex(t => t.uid === editingUid) : -1
  const editingTower = editingIdx >= 0 ? towers[editingIdx] : null
  const editingShape = shapes.find(s => s.id === editingShapeId) || null

  const lineName = selectedLine?.tags?.name || (selectedLine ? `ID: ${selectedLine.id}` : '')
  const voltage  = selectedLine?.tags?.voltage
    ? `${Math.round(Number(selectedLine.tags.voltage) / 1000)} kV`
    : null

  return (
    <div className="app">
      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-top">
            <div className="logo">
              <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
                <path d="M16 2L4 17h10l-2 13L28 12H18L20 2z" fill="#f59e0b" stroke="#d97706" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
              <div>
                <h1 className="app-title">सर्जनम्</h1>
                <p className="app-subtitle">
                  {mode === 'draw' ? 'Create custom KML' : 'Power Line Tower Export'}
                </p>
              </div>
            </div>

            {(mode === 'line' ? Boolean(selectedLine || towers.length > 0) : shapes.length > 0) && (
              <button
                className="btn-clear sidebar-clear-btn"
                onClick={mode === 'line' ? handleClearLine : handleClearShapes}
                title={mode === 'line' ? 'Remove this line and start over' : 'Clear all drawn features'}
              >
                🗑 Clear
              </button>
            )}
          </div>

          <div className="mode-tabs">
            <button
              className={`mode-tab${mode === 'line' ? ' mode-tab--on' : ''}`}
              onClick={() => setMode('line')}
            >
              ⚡ Power Line
            </button>
            <button
              className={`mode-tab${mode === 'draw' ? ' mode-tab--on' : ''}`}
              onClick={() => setMode('draw')}
            >
              ✏️ Draw KML
            </button>
          </div>
        </div>

        <div className="sidebar-body">
          {restoredNote && (
            <div className="alert alert--info">
              <span>Restored your last session.</span>
              <button className="btn-clear" onClick={handleClearEverything}>🗑 Clear</button>
              <button className="alert-dismiss" onClick={() => setRestoredNote(false)}>✕</button>
            </div>
          )}

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

          {notice && (
            <div className="alert alert--info">
              <span>{notice}</span>
              <button className="alert-dismiss" onClick={() => setNotice(null)}>✕</button>
            </div>
          )}

          {mode === 'draw' ? (
            <DrawPanel
              shapes={shapes}
              tool={tool}
              draft={draft}
              onTool={handleTool}
              onFinish={finishDraft}
              onCancel={cancelDraft}
              selectedId={selectedShapeId}
              onSelect={setSelectedShapeId}
              onEditShape={setEditingShapeId}
              onDeleteShape={handleDeleteShape}
              onBufferShape={setBufferingShapeId}
              onOpenFile={handleOpenShapeFile}
              onExport={handleExportShapes}
          onExportCSV={handleExportShapesCSV}
              onClear={handleClearShapes}
              onPointsToLine={handlePointsToLine}
              opening={opening}
            />
          ) : (
            <>
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
                <ImportButton onImport={handleImportFile} importing={importing} />
              </section>

              {loading && (
                <div className="alert alert--info">
                  <span className="spinner" />
                  <span>Fetching tower data from OpenStreetMap…</span>
                </div>
              )}

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
                          {towers.length} towers loaded · {formatLength(totalLength)}
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
                          onSetMode={setSelectionMode}
                          onExport={handleExport}
                          onExportCSV={handleExportCSV}
                          onReset={clearSelection}
                          startNumber={startNumber}
                          onStartNumberChange={setStartNumber}
                          towerCount={
                            fromIdx !== null && toIdx !== null ? Math.abs(toIdx - fromIdx) + 1 : 0
                          }
                          rangeLength={rangeLength}
                          formatLength={formatLength}
                          totalTowers={towers.length}
                          editMode={editMode}
                          onToggleEdit={() => {
                            setEditMode(v => !v)
                            setAddMode(false)
                          }}
                          addMode={addMode}
                          onToggleAdd={() => {
                            setAddMode(v => !v)
                            setSelectionMode(null)
                          }}
                          canUndo={canUndo}
                          onUndo={handleUndo}
                          canRedo={canRedo}
                          onRedo={handleRedo}
                          onSelectAll={handleSelectAll}
                        />
                      </section>

                      <TowerList
                        towers={towers}
                        fromIdx={fromIdx}
                        toIdx={toIdx}
                        onTowerClick={handleTowerClick}
                        selectionMode={selectionMode}
                        startNumber={startNumber}
                        editMode={editMode}
                        onNumberChange={handleNumberChange}
                        onDeleteTower={handleDeleteTower}
                        onEditTower={setEditingUid}
                      />
                    </>
                  )}
                </>
              )}

              {!selectedLine && !loading && (
                <div className="empty-state">
                  <svg viewBox="0 0 64 64" fill="none" width="56" height="56">
                    <rect x="8" y="28" width="48" height="4" rx="2" fill="#e2e8f0"/>
                    <circle cx="16" cy="30" r="4" fill="#94a3b8"/>
                    <circle cx="32" cy="30" r="4" fill="#94a3b8"/>
                    <circle cx="48" cy="30" r="4" fill="#94a3b8"/>
                    <path d="M20 18l-4 12M44 18l4 12M20 42l-4-12M44 42l4-12" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <p>Search a power line above, or import a KML, to load towers on the map.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Make in India badge — bottom of sidebar ── */}
        <div className="sidebar-footer">
          <img src="/make in india.png" alt="Make in India" className="make-in-india-badge" />
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
          fitKey={selectedLine ? `${selectedLine.type}:${selectedLine.id}` : ''}
          editMode={editMode}
          addMode={addMode}
          onTowerMove={handleTowerMove}
          onAddTower={handleAddTower}
          onImportFile={mode === 'draw' ? handleOpenShapeFile : handleImportFile}
          onEditTower={setEditingUid}
          drawMode={mode === 'draw'}
          shapes={shapes}
          tool={tool}
          draft={draft}
          selectedShapeId={selectedShapeId}
          onVertex={handleVertex}
          onFinishDraft={finishDraft}
          onSelectShape={setSelectedShapeId}
          onShapePatch={handleShapePatch}
        />
      </main>

      {editingTower && (
        <TowerEditModal
          key={editingTower.uid}
          tower={editingTower}
          position={editingIdx + 1}
          displayNum={displayNumber(
            editingTower,
            editingIdx,
            resolveRange(towers, fromIdx, toIdx),
            startNumber
          )}
          onSave={handleSaveTower}
          onDelete={handleDeleteFromModal}
          onClose={() => setEditingUid(null)}
        />
      )}

      {editingShape && (
        <ShapeEditModal
          key={editingShape.id}
          shape={editingShape}
          onSave={handleSaveShape}
          onDelete={handleDeleteShape}
          onClose={() => setEditingShapeId(null)}
        />
      )}

      {bufferingShape && (
        <BufferModal
          key={bufferingShape.id}
          shape={bufferingShape}
          onConfirm={handleConfirmBuffer}
          onClose={() => setBufferingShapeId(null)}
        />
      )}

      {pendingSave && (
        <SaveAsModal
          suggestedName={pendingSave.suggestedName}
          ext={FILE_TYPES[pendingSave.kind].ext}
          altExt={FILE_TYPES[pendingSave.kind].alt}
          count={pendingSave.count}
          onSave={confirmSave}
          onClose={() => setPendingSave(null)}
        />
      )}
    </div>
  )
}
