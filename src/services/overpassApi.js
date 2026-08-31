import { nextUid } from './towers.js'

// Every Overpass call goes through our own proxy (a Vercel function in
// production, the same handler mounted on the dev server locally). Calling
// Overpass from the browser is not viable: a struggling mirror replies 429/500/
// 504 with no CORS headers, so the browser reports a CORS error the app cannot
// see or recover from. Server-side, the proxy falls back across mirrors freely.
async function query(q) {
  const res = await fetch('/api/overpass', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Server error: ${res.status}. Please retry.`)
  }
  return res.json()
}

// Parse "relation:12345", "way:12345", or a plain number (unknown type)
function parseDirectId(input) {
  const rel = input.match(/^relation[:\s]+(\d+)$/i)
  if (rel) return { type: 'relation', id: rel[1] }
  const way = input.match(/^way[:\s]+(\d+)$/i)
  if (way) return { type: 'way', id: way[1] }
  const num = input.match(/^\d+$/)
  if (num) return { type: 'any', id: input } // bare ID — could be way OR relation
  return null
}

export async function searchPowerLines(input) {
  const direct = parseDirectId(input.trim())

  if (direct) {
    // For a bare ID we don't know if it's a way or relation, so query both.
    const q =
      direct.type === 'any'
        ? `[out:json][timeout:15];(way(${direct.id});relation(${direct.id}););out tags;`
        : `[out:json][timeout:15];${direct.type}(${direct.id});out tags;`
    const data = await query(q)
    return data.elements
  }

  const escaped = input.replace(/"/g, '\\"')
  const q = `
[out:json][timeout:25];
(
  relation["power"="line"]["name"~"${escaped}",i];
  way["power"="line"]["name"~"${escaped}",i];
);
out tags;`
  const data = await query(q)
  return data.elements
}

export async function fetchLineGeometry(type, id) {
  let q
  if (type === 'relation') {
    q = `[out:json][timeout:40];relation(${id});out body;>;out skel qt;`
  } else {
    q = `[out:json][timeout:40];way(${id});out body;>;out skel qt;`
  }

  const data = await query(q)
  return processElements(type, parseInt(id), data.elements)
}

function processElements(type, id, elements) {
  // Build node lookup
  const nodeMap = {}
  for (const el of elements) {
    if (el.type === 'node') nodeMap[el.id] = { lat: el.lat, lon: el.lon }
  }

  // Build way lookup
  const wayMap = {}
  for (const el of elements) {
    if (el.type === 'way') wayMap[el.id] = el.nodes
  }

  let orderedNodeIds = []

  if (type === 'way') {
    const way = elements.find(e => e.type === 'way' && e.id === id)
    if (!way) return []
    orderedNodeIds = way.nodes
  } else {
    const relation = elements.find(e => e.type === 'relation' && e.id === id)
    if (!relation) return []

    const wayMembers = relation.members
      .filter(m => m.type === 'way')
      .map(m => ({ ref: m.ref, nodes: wayMap[m.ref] || [] }))
      .filter(w => w.nodes.length > 0)

    orderedNodeIds = stitchWays(wayMembers)
  }

  return orderedNodeIds
    .filter(nid => nodeMap[nid])
    .map((nid, i) => ({
      uid: nextUid(),
      towerNumber: i + 1,
      osmId: nid,
      lat: nodeMap[nid].lat,
      lon: nodeMap[nid].lon,
    }))
}

function stitchWays(ways) {
  if (!ways.length) return []

  const segments = ways.map(w => [...w.nodes])
  const result = segments.shift()

  let changed = true
  while (changed && segments.length > 0) {
    changed = false
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const first = result[0]
      const last = result[result.length - 1]
      const segFirst = seg[0]
      const segLast = seg[seg.length - 1]

      if (last === segFirst) {
        result.push(...seg.slice(1))
        segments.splice(i, 1)
        changed = true
        break
      } else if (last === segLast) {
        result.push(...seg.slice(0, -1).reverse())
        segments.splice(i, 1)
        changed = true
        break
      } else if (first === segLast) {
        result.unshift(...seg.slice(0, -1))
        segments.splice(i, 1)
        changed = true
        break
      } else if (first === segFirst) {
        result.unshift(...seg.slice(1).reverse())
        segments.splice(i, 1)
        changed = true
        break
      }
    }
  }

  // Append any disconnected segments (don't drop data)
  for (const seg of segments) {
    result.push(...seg)
  }

  // Deduplicate consecutive duplicate node IDs
  return result.filter((id, i) => i === 0 || id !== result[i - 1])
}
