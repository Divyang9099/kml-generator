// Opening several files at once, for both workspaces. Each file is read on its
// own, so a bad one costs only itself: the rest still load, and the bad one is
// named in the error instead of sinking the whole batch.

import { readTowerFile, readKmlText, baseName, isCsvFile } from './kmlParser.js'
import { makeLine, lineKey } from './lines.js'
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

// Features from several files share one canvas and so one name: the file's own
// when they all agree, otherwise the first plus a count.
function combinedName(names) {
  const unique = [...new Set(names.filter(Boolean))]
  return unique.length > 1 ? `${unique[0]} + ${unique.length - 1} more` : unique[0]
}

// A file's own notes ("Skipped 2 rows…") need its name once there are several.
const tagNotes = (notes = [], file, many) => notes.map((n) => (many ? `${file.name}: ${n}` : n))

/**
 * Tower files, one line per file, in name order. Returns
 * { lines, notes, failed }: each line is { key, type, id, tags, towers } —
 * `type` is 'kml' or 'csv', `id` the file name, `tags.name` the name inside the
 * file — and `failed` is [{ name, message }].
 */
export async function readTowerFiles(fileList) {
  const files = sortByName(fileList)
  const many = files.length > 1
  const lines = []
  const counts = []
  const notes = []
  const failed = []
  const seen = new Set()

  for (const file of files) {
    try {
      const result = await readTowerFile(file)
      const type = isCsvFile(file) ? 'csv' : 'kml'
      // Two files in different folders can share a name; keys must not.
      let id = file.name
      for (let n = 2; seen.has(lineKey(type, id)); n++) id = `${file.name} (${n})`
      const line = makeLine(type, id, { name: result.name }, result.towers)
      seen.add(line.key)
      lines.push(line)
      counts.push(`${file.name} (${result.towers.length})`)
      notes.push(...tagNotes(result.notes, file, many))
    } catch (e) {
      failed.push({ name: file.name, message: e.message })
    }
  }

  if (lines.length > 1) notes.unshift(`Loaded ${lines.length} files as separate lines: ${counts.join(', ')}.`)
  return { lines, notes, failed }
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
