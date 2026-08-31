// Tower domain helpers, shared by the OSM loader, the KML parser, and every
// place that renders or exports a tower.

let uidCounter = 0

// Stable identity for React keys and edit operations. OSM node ids cannot fill
// this role: imported KML towers have none, and towers added by hand have no
// id at all until they are exported.
export function nextUid() {
  uidCounter += 1
  return `t${uidCounter}`
}

// A restored session brings back towers that already hold t1…tN, while the
// counter above starts from zero again — so the next tower drawn would reuse a
// live id. Push the counter past whatever came back.
export function primeUidCounter(towers = []) {
  for (const t of towers) {
    const n = Number(String(t?.uid || '').replace(/^t/, ''))
    if (Number.isFinite(n) && n > uidCounter) uidCounter = n
  }
}

export function hasCustomNumber(tower) {
  return tower.customNumber != null && String(tower.customNumber).trim() !== ''
}

// Which towers an export covers. With no START/END picked that is the whole
// line. `explicit` records whether the user actually chose a range, because
// sequential renumbering must apply only when they did — otherwise loading a
// KML numbered 45..152 would silently redisplay it as 1..108.
export function resolveRange(towers, fromIdx, toIdx) {
  const explicit = fromIdx != null && toIdx != null
  if (!explicit) {
    return { lo: 0, hi: Math.max(0, towers.length - 1), anchor: 0, explicit: false }
  }
  return {
    lo: Math.min(fromIdx, toIdx),
    hi: Math.max(fromIdx, toIdx),
    anchor: fromIdx, // numbering counts up from START, even when END sits before it
    explicit: true,
  }
}

// A tower's number as shown and exported, in priority order: a hand-edited
// number wins, then the sequential renumbering across the range, then the
// tower's own number. Always a string, so free-form labels like "45A" survive
// alongside plain integers.
export function displayNumber(tower, idx, range, startNumber = 1) {
  if (hasCustomNumber(tower)) return String(tower.customNumber).trim()
  if (range.explicit && idx >= range.lo && idx <= range.hi) {
    return String((Number(startNumber) || 1) + Math.abs(idx - range.anchor))
  }
  return String(tower.towerNumber)
}

// Squared distance from p to segment a→b, plus where the projection lands on
// that segment (t: 0 = at a, 1 = at b). Degrees are treated as a flat plane
// with longitude scaled by cos(lat) — over a span of a few km that is well
// inside the accuracy needed to pick which segment a click belongs to.
function projectOnSegment(p, a, b) {
  const k = Math.cos((p.lat * Math.PI) / 180)
  const ax = a.lon * k, ay = a.lat
  const bx = b.lon * k, by = b.lat
  const px = p.lon * k, py = p.lat

  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy

  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return { distSq: (px - cx) ** 2 + (py - cy) ** 2, t }
}

// Where a tower clicked at (lat, lon) should be inserted so the line does not
// zigzag: into the segment it is closest to, or onto either end when the click
// projects past the first or last tower.
export function insertionIndex(towers, lat, lon) {
  if (towers.length < 2) return towers.length

  const p = { lat, lon }
  let best = { distSq: Infinity, i: 0, t: 0 }

  for (let i = 0; i < towers.length - 1; i++) {
    const { distSq, t } = projectOnSegment(p, towers[i], towers[i + 1])
    if (distSq < best.distSq) best = { distSq, i, t }
  }

  if (best.i === 0 && best.t <= 0) return 0
  if (best.i === towers.length - 2 && best.t >= 1) return towers.length
  return best.i + 1
}
