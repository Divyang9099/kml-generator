import { pathLength, ringArea, formatArea, destination, haversineM } from './geo.js'
import { formatLength } from './kmlGenerator.js'

let counter = 0
export const nextShapeId = () => `s${++counter}`

// Same reason as primeUidCounter: shapes restored from the last session already
// carry s1…sN, and a fresh counter would hand out ids that are still in use.
export function primeShapeCounter(shapes = []) {
  for (const s of shapes) {
    const n = Number(String(s?.id || '').replace(/^s/, ''))
    if (Number.isFinite(n) && n > counter) counter = n
  }
}

export const SHAPE_TYPES = ['point', 'line', 'polygon', 'rectangle', 'circle']

export const PALETTE = [
  '#ea580c', '#2563eb', '#16a34a', '#dc2626',
  '#9333ea', '#0891b2', '#ca8a04', '#0f172a',
]

export const ICONS = ['pin', 'circle', 'square', 'star', 'triangle']

export const TYPE_LABEL = {
  point: 'Point',
  line: 'Line',
  polygon: 'Polygon',
  rectangle: 'Rectangle',
  circle: 'Circle',
}

export function createShape(type, coords, extra = {}) {
  return {
    id: nextShapeId(),
    type,
    name: '',
    description: '',
    color: PALETTE[0],
    width: 3,
    opacity: 0.25,
    icon: 'pin',
    iconScale: 1,
    coords,
    ...extra,
  }
}

// A rectangle is stored as two opposite corners and a circle as a centre plus
// radius, because that is what the map interaction produces and what stays
// editable. Both become real rings only when something needs an outline.
export function rectangleRing([[lat1, lon1], [lat2, lon2]]) {
  const n = Math.max(lat1, lat2)
  const s = Math.min(lat1, lat2)
  const e = Math.max(lon1, lon2)
  const w = Math.min(lon1, lon2)
  return [[n, w], [n, e], [s, e], [s, w]]
}

export function circleRing(shape, segments = 72) {
  const [lat, lon] = shape.coords[0]
  const ring = []
  for (let i = 0; i < segments; i++) {
    ring.push(destination(lat, lon, (360 * i) / segments, shape.radius))
  }
  return ring
}

// The closed outline of any area shape, or null for shapes that have none.
export function outlineOf(shape) {
  if (shape.type === 'polygon') return shape.coords
  if (shape.type === 'rectangle') return rectangleRing(shape.coords)
  if (shape.type === 'circle') return circleRing(shape)
  return null
}

export function lengthOf(shape) {
  if (shape.type === 'line') return pathLength(shape.coords)
  const ring = outlineOf(shape)
  return ring ? pathLength([...ring, ring[0]]) : 0
}

// Holes only exist on polygons — a buffer around a closed loop has one.
export function areaOf(shape) {
  const ring = outlineOf(shape)
  if (!ring) return 0
  const holes = shape.type === 'polygon' ? shape.holes ?? [] : []
  return Math.max(0, ringArea(ring) - holes.reduce((sum, h) => sum + ringArea(h), 0))
}

// What Leaflet draws for an area: the outline alone, or outline plus holes.
export function ringsOf(shape) {
  const ring = outlineOf(shape)
  return shape.type === 'polygon' && shape.holes?.length ? [ring, ...shape.holes] : ring
}

// Every coordinate a shape touches, for fitting the map to it.
export function extentOf(shape) {
  if (shape.type === 'point' || shape.type === 'line') return shape.coords
  return outlineOf(shape)
}

/**
 * Orders scattered points into a path by walking to the nearest unvisited
 * point each time. It starts from the point farthest from the centre, which
 * for anything line-like is one of the two ends — starting mid-way would
 * leave the path doubling back on itself.
 */
export function nearestNeighbourOrder(coords) {
  if (coords.length < 3) return coords
  const k = Math.cos((coords[0][0] * Math.PI) / 180)
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + ((a[1] - b[1]) * k) ** 2
  const centre = coords.reduce((acc, c) => [acc[0] + c[0] / coords.length, acc[1] + c[1] / coords.length], [0, 0])

  let start = 0
  coords.forEach((c, i) => { if (d2(c, centre) > d2(coords[start], centre)) start = i })

  const left = coords.map((c, i) => i).filter((i) => i !== start)
  const out = [coords[start]]
  while (left.length) {
    const cur = out[out.length - 1]
    let best = 0
    for (let j = 1; j < left.length; j++) {
      if (d2(coords[left[j]], cur) < d2(coords[left[best]], cur)) best = j
    }
    out.push(coords[left[best]])
    left.splice(best, 1)
  }
  return out
}

// One line of measurement text per shape type — what the list, the dialog and
// the exported description all show.
export function measurementOf(shape) {
  switch (shape.type) {
    case 'point':
      return `${shape.coords[0][0].toFixed(6)}, ${shape.coords[0][1].toFixed(6)}`
    case 'line':
      return `${formatLength(lengthOf(shape))} · ${shape.coords.length} points`
    case 'circle':
      return `r ${formatLength(shape.radius)} · ${formatArea(areaOf(shape))}`
    default:
      // Reporting an area for a ring that crosses itself would be a confident
      // lie — the lobes cancel out and it comes to zero.
      if (isBadRing(shape)) {
        return `⚠ edges cross — area undefined · perimeter ${formatLength(lengthOf(shape))}`
      }
      return `${formatArea(areaOf(shape))} · perimeter ${formatLength(lengthOf(shape))}`
  }
}

// Enough vertices to be a real shape? A half-drawn polygon must not be kept.
// The fewest vertices each editable type can be left with.
export const MIN_VERTICES = { line: 2, polygon: 3 }

export function isComplete(type, coords) {
  if (type === 'point') return coords.length >= 1
  if (type === 'line') return coords.length >= 2
  if (type === 'rectangle') return coords.length === 2
  if (type === 'circle') return coords.length >= 1
  return coords.length >= 3
}

export function radiusBetween(a, b) {
  return haversineM(a[0], a[1], b[0], b[1])
}

export { formatArea }

// Do segments p1→p2 and p3→p4 cross? Standard orientation test; touching at a
// shared endpoint does not count.
function orient(a, b, c) {
  const v = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1])
  return v > 1e-12 ? 1 : v < -1e-12 ? -1 : 0
}

function segmentsCross(p1, p2, p3, p4) {
  const d1 = orient(p3, p4, p1)
  const d2 = orient(p3, p4, p2)
  const d3 = orient(p1, p2, p3)
  const d4 = orient(p1, p2, p4)
  return d1 !== d2 && d3 !== d4
}

/**
 * A ring that crosses itself — a "bow-tie". Its lobes cancel out in the
 * signed-area formula, so it would otherwise report a confident 0 m² and
 * export as invalid KML geometry.
 *
 * O(n²), so it is skipped on very large rings, where a hand-drawn mistake is
 * not the realistic case anyway.
 */
export function isSelfIntersecting(coords) {
  const n = coords?.length ?? 0
  if (n < 4 || n > 300) return false

  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      // Neighbouring segments share an endpoint; the first and last do too.
      if (i === 0 && j === n - 1) continue
      if (segmentsCross(coords[i], coords[(i + 1) % n], coords[j], coords[(j + 1) % n])) {
        return true
      }
    }
  }
  return false
}

// True only for shapes whose area is actually meaningful.
export const isBadRing = (shape) =>
  (shape.type === 'polygon') && isSelfIntersecting(shape.coords)
