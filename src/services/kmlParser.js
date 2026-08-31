import { nextUid } from './towers.js'

// Refuse absurd files rather than locking up the browser mid-render.
const MAX_TOWERS = 50000

// KML puts everything in a default namespace, and files in the wild also use a
// prefix (kml:Placemark). Matching on local name covers both.
const all = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag))
const first = (node, tag) => node.getElementsByTagNameNS('*', tag)[0] || null

// Direct-child lookup: a descendant search for <name> on a Document would
// happily return the first placemark's name instead of the document's.
function childText(parent, tag) {
  for (const child of parent.children) {
    if (child.localName === tag) return child.textContent.trim()
  }
  return ''
}

// KML coordinates are "lon,lat[,alt]" tuples separated by arbitrary whitespace.
function parseCoordinates(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((tuple) => {
      const [lonStr, latStr] = tuple.split(',')
      const lon = Number(lonStr)
      const lat = Number(latStr)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
      return { lat, lon }
    })
    .filter(Boolean)
}

// <ExtendedData><Data name="osmId"><value>…</value></Data></ExtendedData>.
// This is how our own export carries the OSM node id, so that exporting and
// re-importing a line does not quietly drop it.
function extendedValue(placemark, key) {
  for (const data of all(placemark, 'Data')) {
    if (data.getAttribute('name') !== key) continue
    const value = first(data, 'value')
    if (value) return value.textContent.trim()
  }
  return undefined
}

// "Tower 45" → 45. Falls back to the tower's position in the file.
function numberFromName(name, idx) {
  const match = String(name || '').match(/\d+/)
  return match ? Number(match[0]) : idx + 1
}

export function parseKML(text, fallbackName = 'Imported KML') {
  if (!text || !text.trim()) throw new Error('That file is empty.')

  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (first(doc, 'parsererror')) {
    throw new Error('This file is not valid XML — is it really a KML?')
  }

  const points = []

  // Every placemark holding a Point is one tower, in document order. Points
  // inside a MultiGeometry come along for free, and Folder nesting is
  // irrelevant because we walk placemarks rather than the tree.
  for (const placemark of all(doc, 'Placemark')) {
    const name = childText(placemark, 'name')
    const osmId = extendedValue(placemark, 'osmId')
    // Our own export stores the label verbatim; recovering it from the name
    // would mean guessing where the number ends and the label begins. For a
    // foreign file the placemark name *is* the label — unless it is already
    // just "Tower 12", which would only duplicate the number.
    const label =
      extendedValue(placemark, 'label') ??
      (/^\s*Tower\s+\S+\s*$/i.test(name) ? '' : name)
    for (const point of all(placemark, 'Point')) {
      const coords = first(point, 'coordinates')
      if (!coords) continue
      for (const c of parseCoordinates(coords.textContent)) points.push({ ...c, name, osmId, label })
    }
  }

  // A file with no Point placemarks is usually a drawn path — take its vertices.
  if (!points.length) {
    for (const line of [...all(doc, 'LineString'), ...all(doc, 'LinearRing')]) {
      const coords = first(line, 'coordinates')
      if (!coords) continue
      const parsed = parseCoordinates(coords.textContent)
      if (parsed.length) {
        points.push(...parsed.map((c) => ({ ...c, name: '' })))
        break
      }
    }
  }

  // Repeated points draw nothing and break numbering; a closed LinearRing ends
  // where it started, so this also trims that duplicate.
  const deduped = points.filter(
    (p, i) => i === 0 || p.lat !== points[i - 1].lat || p.lon !== points[i - 1].lon
  )

  if (!deduped.length) {
    throw new Error('No tower points found in this file. Expected Placemarks with a Point, or a path.')
  }
  if (deduped.length > MAX_TOWERS) {
    throw new Error(`That file holds ${deduped.length.toLocaleString()} points — too many to edit here.`)
  }

  const documentEl = first(doc, 'Document')
  const rawName =
    (documentEl && childText(documentEl, 'name')) ||
    (doc.documentElement && childText(doc.documentElement, 'name')) ||
    fallbackName

  // Our own export names the document "<line> — Tower A to Tower B". Keep only
  // the line, or every round trip through the app would grow the name again.
  const name = rawName.replace(/\s+—\s+Tower\s+\S+\s+to\s+Tower\s+\S+\s*$/, '').trim() || rawName

  return {
    name,
    towers: deduped.map((p, i) => ({
      uid: nextUid(),
      towerNumber: numberFromName(p.name, i),
      name: p.label || '',
      ...(p.osmId ? { osmId: p.osmId } : {}),
      lat: p.lat,
      lon: p.lon,
    })),
  }
}

export const baseName = (filename) => filename.replace(/\.(kml|kmz)$/i, '')

// A .kmz is a zip around a .kml — what Google Earth saves by default. JSZip is
// loaded on demand so the bundle only pays for it when someone opens one.
// Shared by the tower importer and the drawing workspace's Open button.
export async function readKmlText(file) {
  if (!/\.kmz$/i.test(file.name)) return file.text()

  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entry = Object.values(zip.files).find((f) => !f.dir && /\.kml$/i.test(f.name))
  if (!entry) throw new Error('This .kmz contains no .kml file.')

  return entry.async('string')
}

export async function readTowerFile(file) {
  return parseKML(await readKmlText(file), baseName(file.name))
}
