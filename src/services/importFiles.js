// Opening several files at once, for both workspaces. Each file is read on its
// own, so a bad one costs only itself: the rest still load, and the bad one is
// named in the error instead of sinking the whole batch.

import { readTowerFile, readKmlText, baseName, isCsvFile, MAX_TOWERS } from './kmlParser.js'
import { parseShapeKML } from './shapeKml.js'
import { parseCSVShapes } from './csvImport.js'

// Neither the file dialog nor a drop hands files over in the order they were
// picked — Windows lists the last one clicked first — so they are taken in the
// order their names sort, numbers compared as numbers: "…_T1-T50", then
// "…_T51-T100", then "…_T101-T150", which is how this app's exports are named.
export function sortByName(files) {
  return Array.from(files).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
}

// Two files cut from one line usually share the tower they were cut at. Our
// KML keeps full precision and our CSV rounds to 7 decimals, so "the same
// place" is anything within about 10 cm — no two real towers stand that close.
const SAME_PLACE = 1e-6
const samePlace = (a, b) =>
  Math.abs(a.lat - b.lat) < SAME_PLACE && Math.abs(a.lon - b.lon) < SAME_PLACE

// Segments of one line all carry that line's name; anything else is a mix.
function combinedName(names) {
  const unique = [...new Set(names.filter(Boolean))]
  return unique.length > 1 ? `${unique[0]} + ${unique.length - 1} more` : unique[0]
}

// A file's own notes ("Skipped 2 rows…") need its name once there are several.
const tagNotes = (notes = [], file, many) => notes.map((n) => (many ? `${file.name}: ${n}` : n))

/**
 * Tower files joined end to end, in name order, into the one line the Power
 * Line workspace holds. Returns { name, towers, kind, loaded, notes, failed }:
 * `loaded` names the files that made it in, `failed` is [{ name, message }].
 */
export async function readTowerFiles(fileList) {
  const files = sortByName(fileList)
  const many = files.length > 1
  const towers = []
  const names = []
  const loaded = []
  const counts = []
  const notes = []
  const failed = []
  let anyKml = false

  // One at a time rather than in parallel: a file whose towers have no numbers
  // of their own is numbered on from where the file before it ended.
  for (const file of files) {
    try {
      const result = await readTowerFile(file, towers.length + 1)
      let parsed = result.towers
      if (towers.length && parsed.length && samePlace(towers[towers.length - 1], parsed[0])) {
        parsed = parsed.slice(1)
      }
      if (towers.length + parsed.length > MAX_TOWERS) {
        throw new Error(`it would take the line past ${MAX_TOWERS.toLocaleString()} points.`)
      }
      // A loop, not push(...parsed): spreading tens of thousands of arguments
      // can overflow the call stack.
      for (const t of parsed) towers.push(t)
      names.push(result.name)
      loaded.push(file.name)
      counts.push(`${file.name} (${parsed.length})`)
      notes.push(...tagNotes(result.notes, file, many))
      if (!isCsvFile(file)) anyKml = true
    } catch (e) {
      failed.push({ name: file.name, message: e.message })
    }
  }

  // Say which order they went in: a line that zigzags between segments is
  // explained at once by a file that sorted somewhere unexpected.
  if (loaded.length > 1) {
    notes.unshift(`Joined ${loaded.length} files end to end, in name order: ${counts.join(', ')}.`)
  }

  return {
    name: combinedName(names),
    towers,
    kind: anyKml ? 'kml' : 'csv',
    loaded,
    notes,
    failed,
  }
}

/**
 * Drawn features from any number of KML / KMZ / CSV files, all together.
 * Returns { name, shapes, notes, failed } like readTowerFiles.
 */
export async function readShapeFiles(fileList) {
  const files = sortByName(fileList)
  const many = files.length > 1
  const shapes = []
  const names = []
  const counts = []
  const notes = []
  const failed = []

  for (const file of files) {
    try {
      const result = isCsvFile(file)
        ? parseCSVShapes(await file.text(), baseName(file.name))
        : parseShapeKML(await readKmlText(file), baseName(file.name))
      for (const s of result.shapes) shapes.push(s)
      names.push(result.name)
      counts.push(`${file.name} (${result.shapes.length})`)
      notes.push(...tagNotes(result.notes, file, many))
    } catch (e) {
      failed.push({ name: file.name, message: e.message })
    }
  }

  if (counts.length > 1) notes.unshift(`Opened ${counts.length} files: ${counts.join(', ')}.`)

  return { name: combinedName(names), shapes, notes, failed }
}

// One file keeps the wording it always had; several name each one that failed.
export function failureMessage(verb, failed, total) {
  if (total === 1) return `Could not ${verb} that file: ${failed[0].message}`
  const list = failed.map((f) => `${f.name} — ${f.message}`).join(' · ')
  return failed.length === total
    ? `Could not ${verb} any of the ${total} files. ${list}`
    : `Could not ${verb} ${failed.length} of ${total} files; the rest loaded. ${list}`
}
