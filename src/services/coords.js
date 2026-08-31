// Parsing coordinates as people actually paste them — from Google Maps, from
// Google Earth, off a survey sheet.

// One coordinate: an optional leading hemisphere, degrees, optional minutes and
// seconds, optional trailing hemisphere — both "N 22.5" and "22.5N" occur.
// Minutes and seconds must carry their marks, so "22.5 79.0" stays two separate
// decimal degrees rather than being read as 22° 5'.
const PART = /([NSEW])?\s*([+-]?\d+(?:\.\d+)?)\s*(?:°|º|d)?\s*(?:(\d+(?:\.\d+)?)\s*(?:'|′|’|m)\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|″|”|s)\s*)?\s*([NSEW])?/gi

function toDecimal(deg, min, sec, hemi) {
  const sign = deg < 0 ? -1 : 1
  let value = Math.abs(deg) + (min || 0) / 60 + (sec || 0) / 3600
  value *= sign
  const h = (hemi || '').toUpperCase()
  if (h === 'S' || h === 'W') value = -Math.abs(value)
  if (h === 'N' || h === 'E') value = Math.abs(value)
  return value
}

/**
 * "22.5, 79.0" · "22.5N 79.0E" · "22°30'15\"N 79°15'20\"E" · "-22.5 -79.0"
 * Returns { lat, lon } or throws with a message worth showing the user.
 */
export function parseCoordinates(input) {
  const text = String(input || '').trim()
  if (!text) throw new Error('Enter coordinates, e.g. 22.5, 79.0')

  const found = []
  let m
  PART.lastIndex = 0 // the regex is global and module-level, so reset per call
  while ((m = PART.exec(text)) !== null) {
    if (!m[0].trim() || m[2] === undefined) { PART.lastIndex += 1; continue }
    const hemi = (m[1] || m[5] || '').toUpperCase()
    found.push({
      value: toDecimal(Number(m[2]), Number(m[3] || 0), Number(m[4] || 0), hemi),
      hemi,
    })
    if (found.length === 2) break
  }

  if (found.length < 2) {
    throw new Error('Could not read two coordinates from that.')
  }

  // Hemispheres say which is which; without them, latitude comes first.
  let [a, b] = found
  let lat = a.value
  let lon = b.value
  if (a.hemi === 'E' || a.hemi === 'W' || b.hemi === 'N' || b.hemi === 'S') {
    lat = b.value
    lon = a.value
  }

  // A pasted "lon, lat" is a common slip and unambiguous whenever the first
  // number cannot be a latitude but the second can.
  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
    const swap = lat
    lat = lon
    lon = swap
  }

  if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
    throw new Error('Latitude must be between −90 and 90.')
  }
  if (!Number.isFinite(lon) || Math.abs(lon) > 180) {
    throw new Error('Longitude must be between −180 and 180.')
  }
  return { lat, lon }
}

export const formatCoordinates = (lat, lon) => `${lat.toFixed(6)}, ${lon.toFixed(6)}`
