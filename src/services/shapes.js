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

export function areaOf(shape) {
  const ring = outlineOf(shape)
  return ring ? ringArea(ring) : 0
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
      return `${formatArea(areaOf(shape))} · perimeter ${formatLength(lengthOf(shape))}`
  }
}

// Enough vertices to be a real shape? A half-drawn polygon must not be kept.
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
