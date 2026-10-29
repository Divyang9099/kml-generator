// Reading coordinates out of whatever CSV people have to hand — a survey sheet,
// a GPS export, a GIS table with WKT, or this app's own tower export. Nothing
// about the layout is assumed: the delimiter, the header and which columns
// hold the coordinates are all worked out from the file itself.

import { parseCoordinates } from './coords.js'
import { createShape, PALETTE } from './shapes.js'
import { nextUid } from './towers.js'

const MAX_FEATURES = 20000

/* ── Table ───────────────────────────────────────────────────────────── */

// Comma is the default, but Excel in many locales saves with semicolons, and
// anything pasted out of a spreadsheet is tab-separated.
function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10)
  let best = ','
  let bestScore = 0
  for (const d of [',', ';', '\t', '|']) {
    const counts = sample.map((l) => l.split(d).length - 1)
    const min = Math.min(...counts)
    // Every sampled line must have it, and the same number of times.
    const consistent = counts.every((c) => c === counts[0])
    const score = min * (consistent ? 2 : 1)
    if (score > bestScore) { best = d; bestScore = score }
  }
  return best
}

// RFC 4180: quoted fields may hold the delimiter, doubled quotes and newlines.
function splitRows(text, delim) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (ch === delim) {
      row.push(cell.trim()); cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim()); cell = ''
      if (row.some((c) => c !== '')) rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  row.push(cell.trim())
  if (row.some((c) => c !== '')) rows.push(row)
  return rows
}

// "Centre Latitude" → "centrelatitude", so headers match however they are spelled.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

/* ── Values ──────────────────────────────────────────────────────────── */

// A decimal comma ("22,5") only reaches here when the delimiter was not a comma.
const decimal = (s) => String(s ?? '').trim().replace(/^(-?\d+),(\d+)$/, '$1.$2')

function toNumber(s) {
  const v = decimal(s)
  return v === '' ? NaN : Number(v)
}

// Latitude and longitude cells may be decimal or DMS ("22°30'15\"N"). The
// shared parser reads a pair, so hand it the pair.
function readLatLon(latCell, lonCell) {
  const lat = toNumber(latCell)
  const lon = toNumber(lonCell)
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    return [lat, lon]
  }
  if (!String(latCell).trim() || !String(lonCell).trim()) return null
  try {
    const p = parseCoordinates(`${decimal(latCell)} ${decimal(lonCell)}`)
    return [p.lat, p.lon]
  } catch {
    return null
  }
}

function readCombined(cell) {
  try {
    const p = parseCoordinates(decimal(cell))
    return [p.lat, p.lon]
  } catch {
    return null
  }
}

/* ── WKT ─────────────────────────────────────────────────────────────── */

const WKT_RE = /^\s*(MULTI)?(POINT|LINESTRING|POLYGON)\s*(?:ZM|Z|M)?\s*(\(.*\))\s*$/is

// Nested parentheses into nested arrays; the leaves are [lat, lon].
function nestWkt(body) {
  let i = 0
  const leaf = (buf) => {
    const [x, y] = buf.trim().split(/\s+/).map(Number)
    return Number.isFinite(x) && Number.isFinite(y) ? [y, x] : null
  }
  function group() {
    i++ // past '('
    const items = []
    let buf = ''
    const flush = () => {
      if (buf.trim()) { const p = leaf(buf); if (p) items.push(p) }
      buf = ''
    }
    while (i < body.length) {
      const ch = body[i]
      if (ch === '(') { items.push(group()); continue }
      if (ch === ',') { flush(); i++; continue }
      if (ch === ')') { flush(); i++; return items }
      buf += ch
      i++
    }
    return items
  }
  return group()
}

const isPoint = (x) => Array.isArray(x) && typeof x[0] === 'number'

// A ring repeats its first point to close; the editor stores it open.
function openRing(ring) {
  if (ring.length > 1) {
    const a = ring[0]
    const b = ring[ring.length - 1]
    if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1)
  }
  return ring
}

// Returns a list of { type, coords, holes? }, or null when the cell is not WKT.
function parseWkt(cell) {
  const m = WKT_RE.exec(String(cell || ''))
  if (!m) return null
  const multi = Boolean(m[1])
  const kind = m[2].toUpperCase()
  const tree = nestWkt(m[3])
  const out = []

  const polygon = (rings) => {
    const [outer, ...holes] = rings.map(openRing)
    if (outer?.length >= 3) out.push({ type: 'polygon', coords: outer, holes: holes.filter((h) => h.length >= 3) })
  }

  if (kind === 'POINT') {
    // MULTIPOINT is written both as (1 2, 3 4) and ((1 2), (3 4)).
    for (const p of multi ? tree.map((x) => (isPoint(x) ? x : x[0])) : [tree[0]]) {
      if (isPoint(p)) out.push({ type: 'point', coords: [p] })
    }
  } else if (kind === 'LINESTRING') {
    for (const line of multi ? tree : [tree]) {
      if (line.length >= 2) out.push({ type: 'line', coords: line })
    }
  } else {
    for (const rings of multi ? tree : [tree]) polygon(rings)
  }
  return out
}

/* ── Columns ─────────────────────────────────────────────────────────── */

// First header in `names` order that appears, so "name" beats "id" when both do.
function findColumn(header, names, test) {
  for (const n of names) {
    const i = header.indexOf(n)
    if (i !== -1) return i
  }
  return test ? header.findIndex(test) : -1
}

const COLS = {
  lat: ['lat', 'latitude', 'y', 'latdd', 'latdeg', 'latitudedd', 'centrelatitude', 'centerlatitude', 'gpslatitude'],
  lon: ['lon', 'lng', 'long', 'longitude', 'x', 'londd', 'londeg', 'longitudedd', 'centrelongitude', 'centerlongitude', 'gpslongitude'],
  combined: ['coordinates', 'coordinate', 'coords', 'latlon', 'latlong', 'latlng', 'location', 'position', 'gps', 'point'],
  wkt: ['wkt', 'geometry', 'geom', 'thegeom', 'shape', 'wktgeometry'],
  name: ['name', 'label', 'title', 'pointname', 'placemark', 'towername', 'tower', 'towernumber', 'towerno', 'number', 'no', 'id'],
  label: ['label'],
  number: ['towernumber', 'towerno', 'tower', 'number', 'no'],
  osmId: ['osmnodeid', 'osmid', 'nodeid'],
  lineName: ['linename', 'line'],
  description: ['description', 'desc', 'notes', 'note', 'remarks', 'remark', 'comment', 'comments'],
  group: ['lineid', 'shapeid', 'featureid', 'polygonid', 'pathid', 'routeid', 'trackid', 'groupid', 'group', 'feature', 'part'],
  type: ['type', 'shapetype', 'geometrytype', 'geomtype', 'featuretype', 'kind'],
  order: ['order', 'seq', 'sequence', 'vertex', 'vertexindex', 'pointorder', 'sortorder', 'sno', 'srno', 'slno'],
  color: ['colour', 'color'],
}

// A header row is one with at least one cell that is not a number and not a
// coordinate. A file whose first row is data has none.
function looksLikeHeader(row) {
  return row.some((c) => c !== '' && !Number.isFinite(toNumber(c)) && !readCombined(c) && !WKT_RE.test(c))
}

// With no usable header, find two adjacent numeric columns in range. Where
// both could be a latitude, the larger values are the longitude — true
// everywhere east of 45°E, including all of India, where a headerless
// "78.9, 22.5" is as common as "22.5, 78.9".
function guessLatLon(rows) {
  const width = Math.max(...rows.map((r) => r.length))
  const stats = []
  for (let c = 0; c < width; c++) {
    const nums = rows.map((r) => toNumber(r[c])).filter(Number.isFinite)
    const ok = nums.length >= Math.max(1, rows.length * 0.8)
    stats.push({
      ok,
      maxAbs: ok ? Math.max(...nums.map(Math.abs)) : Infinity,
      meanAbs: ok ? nums.reduce((s, v) => s + Math.abs(v), 0) / nums.length : 0,
    })
  }
  for (let c = 0; c + 1 < width; c++) {
    const a = stats[c]
    const b = stats[c + 1]
    if (!a.ok || !b.ok || a.maxAbs > 180 || b.maxAbs > 180) continue
    if (a.maxAbs <= 90 && b.maxAbs > 90) return { lat: c, lon: c + 1 }
    if (b.maxAbs <= 90 && a.maxAbs > 90) return { lat: c + 1, lon: c }
    if (a.maxAbs <= 90 && b.maxAbs <= 90) {
      return a.meanAbs > b.meanAbs ? { lat: c + 1, lon: c } : { lat: c, lon: c + 1 }
    }
  }
  return null
}

function readTable(text) {
  if (!text || !text.trim()) throw new Error('That file is empty.')
  const clean = text.replace(/^﻿/, '') // Excel's UTF-8 byte-order mark
  const rows = splitRows(clean, detectDelimiter(clean))
  if (!rows.length) throw new Error('That file is empty.')

  const hasHeader = looksLikeHeader(rows[0])
  const header = hasHeader ? rows[0].map(norm) : []
  const data = hasHeader ? rows.slice(1) : rows
  if (!data.length) throw new Error('The CSV has a header but no rows.')

  const col = {}
  for (const [key, names] of Object.entries(COLS)) col[key] = findColumn(header, names)

  // Headers are free text: "Latitude (deg)" and "Lat_N" must still count.
  if (col.lat === -1) col.lat = header.findIndex((h) => h.startsWith('lat') || h.includes('latitude'))
  if (col.lon === -1) {
    col.lon = header.findIndex((h) =>
      h.startsWith('lon') || h.startsWith('lng') || h.includes('longitude') || h === 'long')
  }
  // Any column whose values are WKT is geometry, whatever it is called.
  if (col.wkt !== -1 && !data.some((r) => WKT_RE.test(r[col.wkt] || ''))) col.wkt = -1
  if (col.wkt === -1) {
    const width = Math.max(...data.map((r) => r.length))
    for (let c = 0; c < width; c++) {
      if (data.some((r) => WKT_RE.test(r[c] || ''))) { col.wkt = c; break }
    }
  }
  if (col.combined !== -1 && !data.some((r) => readCombined(r[col.combined] || ''))) col.combined = -1

  if (col.wkt === -1 && col.combined === -1 && (col.lat === -1 || col.lon === -1)) {
    const guess = guessLatLon(data)
    if (guess) Object.assign(col, guess)
  }

  if (col.wkt === -1 && col.combined === -1 && (col.lat === -1 || col.lon === -1)) {
    // Big numbers in the coordinate columns are almost always UTM metres.
    const bigNumbers = data.slice(0, 20).some((r) => r.some((c) => Math.abs(toNumber(c)) > 1000))
    throw new Error(
      bigNumbers
        ? 'The coordinates look like projected values (e.g. UTM easting/northing). Export them as latitude/longitude in degrees.'
        : 'Could not find latitude and longitude columns. Name them "Latitude" and "Longitude", or add a WKT column.'
    )
  }

  const cell = (row, key) => (col[key] === -1 ? '' : (row[col[key]] ?? '').trim())
  return { data, col, cell, hasHeader, header }
}

// Everything one row says about where it is: a list of geometries.
function geometriesOf(row, t) {
  if (t.col.wkt !== -1) {
    const g = parseWkt(t.cell(row, 'wkt'))
    if (g?.length) return g
  }
  if (t.col.combined !== -1) {
    const p = readCombined(t.cell(row, 'combined'))
    if (p) return [{ type: 'point', coords: [p] }]
  }
  if (t.col.lat !== -1 && t.col.lon !== -1) {
    const p = readLatLon(t.cell(row, 'lat'), t.cell(row, 'lon'))
    if (p) return [{ type: 'point', coords: [p] }]
  }
  return []
}

function kindOf(value) {
  const v = norm(value)
  if (/^(point|pt|marker|pin|placemark|tower|multipoint)$/.test(v)) return 'point'
  if (/^(polygon|area|poly|boundary|parcel|zone|rectangle|circle|multipolygon)$/.test(v)) return 'polygon'
  if (/^(line|linestring|polyline|path|route|track|multilinestring)$/.test(v)) return 'line'
  return null
}

const validColor = (c) => (/^#?[0-9a-f]{6}$/i.test(c) ? `#${c.replace('#', '').toLowerCase()}` : null)

const skipNote = (n) => (n ? [`Skipped ${n} row${n === 1 ? '' : 's'} with no readable coordinates.`] : [])

/* ── Shapes (Draw KML) ───────────────────────────────────────────────── */

/**
 * Turns a CSV into drawable shapes:
 * - a WKT column gives points, lines and polygons (holes included);
 * - otherwise every row is a point, unless a group column (Line ID, Shape ID…)
 *   ties rows together — then each group becomes a line, or a polygon when its
 *   Type says so or its first and last points coincide.
 */
export function parseCSVShapes(text, fallbackName = 'Imported CSV') {
  const t = readTable(text)
  const shapes = []
  let skipped = 0
  let colorIdx = 0

  const make = (geom, row, extra = {}) => {
    const color = validColor(t.cell(row, 'color')) || PALETTE[colorIdx % PALETTE.length]
    shapes.push(createShape(geom.type, geom.coords, {
      name: t.cell(row, 'name'),
      description: t.cell(row, 'description'),
      color,
      ...(geom.holes?.length ? { holes: geom.holes } : {}),
      ...extra,
    }))
  }

  // This app's own shape CSV lists the centre of each shape, which is only
  // ever meaningful as a point. With no header row this never applies.
  const latHeader = t.hasHeader ? t.header[t.col.lat] : ''
  const centresOnly = latHeader?.includes('centre') || latHeader?.includes('center')

  if (t.col.group !== -1 && t.col.wkt === -1 && !centresOnly) {
    const groups = new Map()
    t.data.forEach((row, idx) => {
      const geoms = geometriesOf(row, t)
      if (!geoms.length) { skipped++; return }
      const key = t.cell(row, 'group') || `row ${idx}`
      if (!groups.has(key)) groups.set(key, { rows: [], coords: [] })
      const g = groups.get(key)
      g.rows.push({ row, order: toNumber(t.cell(row, 'order')), idx, coord: geoms[0].coords[0] })
    })

    for (const [key, g] of groups) {
      if (g.rows.some((r) => Number.isFinite(r.order))) {
        g.rows.sort((a, b) => (a.order - b.order) || (a.idx - b.idx))
      }
      const first = g.rows[0].row
      const declared = kindOf(t.cell(first, 'type'))
      const coords = g.rows.map((r) => r.coord)

      if (declared === 'point' || coords.length === 1) {
        g.rows.forEach((r) => make({ type: 'point', coords: [r.coord] }, r.row))
      } else {
        const closed = coords.length >= 4 &&
          coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
        const type = declared || (closed ? 'polygon' : 'line')
        const ring = type === 'polygon' ? openRing(coords) : coords
        if (type === 'polygon' && ring.length < 3) {
          make({ type: 'line', coords }, first)
        } else {
          make({ type, coords: ring }, first, { name: t.cell(first, 'name') || key })
        }
      }
      colorIdx++
    }
  } else {
    for (const row of t.data) {
      const geoms = geometriesOf(row, t)
      if (!geoms.length) { skipped++; continue }
      for (const g of geoms) make(g, row)
      if (t.col.wkt !== -1) colorIdx++
    }
  }

  if (!shapes.length) throw new Error('No row in this CSV had coordinates that could be read.')
  if (shapes.length > MAX_FEATURES) {
    throw new Error(`That CSV holds ${shapes.length.toLocaleString()} features — too many to edit here.`)
  }

  return { name: fallbackName, shapes, notes: skipNote(skipped) }
}

/* ── Towers (Power Line) ─────────────────────────────────────────────── */

/**
 * Turns a CSV into a tower line. Reads this app's own tower export back
 * exactly (Tower Number, Label, OSM Node ID, Line Name); any other CSV of
 * points works too, one tower per row in file order. WKT lines contribute
 * their vertices. Rows with no number of their own count up from firstNumber.
 */
export function parseCSVTowers(text, fallbackName = 'Imported CSV', firstNumber = 1) {
  const t = readTable(text)
  const towers = []
  let skipped = 0

  t.data.forEach((row, idx) => {
    const geoms = geometriesOf(row, t)
    if (!geoms.length) { skipped++; return }
    const coords = geoms.flatMap((g) => g.coords)
    const numberCell = t.cell(row, 'number')
    const nameCell = t.cell(row, 'name')
    const label = t.col.label !== -1 ? t.cell(row, 'label') : (nameCell !== numberCell ? nameCell : '')
    const osmId = t.cell(row, 'osmId')

    for (const [lat, lon] of coords) {
      const fromCell = String(numberCell || nameCell).match(/\d+/)
      towers.push({
        uid: nextUid(),
        towerNumber: numberCell && !/^\d+$/.test(numberCell)
          ? numberCell
          : fromCell ? Number(fromCell[0]) : firstNumber + towers.length,
        name: coords.length > 1 ? '' : label,
        ...(osmId ? { osmId } : {}),
        lat,
        lon,
        _order: toNumber(t.cell(row, 'order')),
        _idx: idx,
      })
    }
  })

  if (!towers.length) throw new Error('No row in this CSV had coordinates that could be read.')
  if (towers.length > 50000) {
    throw new Error(`That CSV holds ${towers.length.toLocaleString()} points — too many to edit here.`)
  }

  // A sequence column wins over file order — surveys are often sorted by name.
  if (towers.some((tw) => Number.isFinite(tw._order))) {
    towers.sort((a, b) => (a._order - b._order) || (a._idx - b._idx))
  }
  for (const tw of towers) { delete tw._order; delete tw._idx }

  const lineName = t.data.map((r) => t.cell(r, 'lineName')).find(Boolean)
  return { name: lineName || fallbackName, towers, notes: skipNote(skipped) }
}
