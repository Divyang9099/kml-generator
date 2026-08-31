// Loaded lines are cached so re-opening one costs nothing. Overpass is the
// least reliable part of this app — it rate-limits, and in the field the
// connection is worse than the server.

import { nextUid } from './towers.js'

const KEY = 'sarjanam.lines.v1'
const MAX_BYTES = 1_500_000
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function readAll() {
  try {
    const raw = localStorage.getItem(KEY)
    const data = raw ? JSON.parse(raw) : null
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function writeAll(entries) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // Quota or blocked storage — the cache is an optimisation, never a
    // requirement, so a failure here changes nothing for the caller.
  }
}

const keyFor = (type, id) => `${type}:${id}`

export function getCachedLine(type, id) {
  const entry = readAll()[keyFor(type, id)]
  if (!entry || !Array.isArray(entry.towers)) return null
  if (Date.now() - (entry.at ?? 0) > MAX_AGE_MS) return null

  // Fresh ids: the cached ones came from another session and could collide
  // with towers or shapes already on screen.
  return entry.towers.map((t) => ({ ...t, uid: nextUid() }))
}

export function cacheLine(type, id, towers) {
  if (!towers?.length) return
  const entries = readAll()
  entries[keyFor(type, id)] = { at: Date.now(), towers }

  // Evict oldest until the whole cache fits.
  let keys = Object.keys(entries)
  while (keys.length > 1 && JSON.stringify(entries).length > MAX_BYTES) {
    const oldest = keys.reduce((a, b) => (entries[a].at <= entries[b].at ? a : b))
    delete entries[oldest]
    keys = Object.keys(entries)
  }
  writeAll(entries)
}

export function clearLineCache() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
