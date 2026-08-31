// Spherical geometry shared by the tower line and the drawing tools.

export const EARTH_R = 6371000

export function haversineM(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const dφ = (lat2 - lat1) * Math.PI / 180
  const dλ = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Path length through a list of [lat, lon] pairs.
export function pathLength(coords) {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += haversineM(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1])
  }
  return total
}

// Area of a closed ring by spherical excess (L'Huilier via the standard
// shoelace-on-a-sphere form). Sign depends on winding, so take the magnitude.
export function ringArea(coords) {
  if (coords.length < 3) return 0
  const toRad = Math.PI / 180
  let sum = 0
  for (let i = 0; i < coords.length; i++) {
    const [lat1, lon1] = coords[i]
    const [lat2, lon2] = coords[(i + 1) % coords.length]
    sum += (lon2 - lon1) * toRad * (2 + Math.sin(lat1 * toRad) + Math.sin(lat2 * toRad))
  }
  return Math.abs((sum * EARTH_R * EARTH_R) / 2)
}

export const SQM_PER_ACRE = 4046.8564224

// Land here is measured in acres, so that is the unit — square metres only for
// areas too small for an acre to read sensibly.
export function formatArea(m2) {
  if (m2 < 400) return `${Math.round(m2)} m²`
  const acres = m2 / SQM_PER_ACRE
  const shown = acres >= 100 ? Math.round(acres).toLocaleString('en-IN') : acres.toFixed(2)
  return `${shown} acres`
}

// Walk `distance` metres from a point on the given bearing — used to turn a
// circle's centre and radius into polygon vertices.
export function destination(lat, lon, bearingDeg, distanceM) {
  const δ = distanceM / EARTH_R
  const θ = bearingDeg * Math.PI / 180
  const φ1 = lat * Math.PI / 180
  const λ1 = lon * Math.PI / 180

  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  )
  return [φ2 * 180 / Math.PI, ((λ2 * 180 / Math.PI) + 540) % 360 - 180]
}
