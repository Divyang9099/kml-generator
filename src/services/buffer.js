import { outlineOf } from './shapes.js'

const toLonLat = (coords) => coords.map(([lat, lon]) => [lon, lat])
const toLatLon = (coords) => coords.map(([lon, lat]) => [lat, lon])
const closed = (ring) => [...ring, ring[0]]
const open = (ring) => ring.slice(0, -1) // GeoJSON rings repeat their first point

/**
 * The area within `meters` of a shape, as the geometry of new shapes.
 *
 * A point grows into a circle and a circle into a bigger one — both stay
 * circles, so they remain editable by their radius. Anything else goes
 * through Turf, which buffers in a local equidistant projection and so stays
 * true to the metre at any latitude. Turf is loaded on first use; most
 * sessions never buffer anything.
 *
 * Returns [{ type, coords, holes?, radius? }]: a line that loops back on
 * itself buffers to a polygon with a hole, and a buffer can split into
 * several separate polygons.
 */
export async function bufferShape(shape, meters) {
  if (!(meters > 0)) throw new Error('Enter a distance greater than 0.')

  if (shape.type === 'point') return [{ type: 'circle', coords: shape.coords, radius: meters }]
  if (shape.type === 'circle') return [{ type: 'circle', coords: shape.coords, radius: shape.radius + meters }]

  const geometry = shape.type === 'line'
    ? { type: 'LineString', coordinates: toLonLat(shape.coords) }
    : {
        type: 'Polygon',
        coordinates: [outlineOf(shape), ...(shape.holes ?? [])].map((r) => closed(toLonLat(r))),
      }

  const { default: buffer } = await import('@turf/buffer')
  const result = buffer({ type: 'Feature', properties: {}, geometry }, meters, { units: 'meters', steps: 16 })
  if (!result?.geometry) throw new Error('That shape could not be buffered.')

  const polygons = result.geometry.type === 'MultiPolygon'
    ? result.geometry.coordinates
    : [result.geometry.coordinates]

  return polygons.map(([outer, ...holes]) => ({
    type: 'polygon',
    coords: toLatLon(open(outer)),
    holes: holes.map((h) => toLatLon(open(h))),
  }))
}
