// Overpass proxy. Runs as a Vercel function in production and is mounted on the
// Vite dev server (see vite.config.js) so dev and prod take the identical path.
// Browsers cannot talk to Overpass directly: a mirror that is failing returns
// 429/500/504 *without* CORS headers, which surfaces as an unfixable CORS error.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

// vercel.json gives this function 60s. Stay inside it so the caller gets our
// JSON error instead of the platform's opaque 504.
const DEADLINE_MS = 55000
const PER_MIRROR_MS = 25000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

async function fetchMirror(url, query, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SarjanamKMLCreator/1.0',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let query
  try {
    const raw = await readBody(req)
    query = JSON.parse(raw).query
  } catch {
    return res.status(400).json({ error: 'Invalid request body' })
  }
  if (!query) return res.status(400).json({ error: 'Missing query' })

  // Shuffle mirrors so load spreads across servers
  const shuffled = [...MIRRORS].sort(() => Math.random() - 0.5)

  const startedAt = Date.now()
  const timeLeft = () => DEADLINE_MS - (Date.now() - startedAt)
  let busy = false
  let lastStatus = null

  for (const url of shuffled) {
    // Don't start an attempt we cannot finish inside the function budget.
    if (timeLeft() < 5000) break

    try {
      const upstream = await fetchMirror(url, query, Math.min(PER_MIRROR_MS, timeLeft()))
      lastStatus = upstream.status

      // 429/503/504 mean the mirror is alive but loaded — worth reporting as
      // "busy" so the user knows a retry will help.
      if (upstream.status === 429 || upstream.status === 503 || upstream.status === 504) {
        busy = true
        await sleep(600)
        continue
      }
      if (!upstream.ok) {
        await sleep(200)
        continue
      }

      const data = await upstream.json()
      // Tell browser to cache identical queries for 5 min
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      return res.status(200).json(data)
    } catch {
      // Timeout, abort or network error — try the next mirror
      continue
    }
  }

  return res.status(502).json({
    error: busy
      ? 'Overpass servers are rate-limiting us right now. Wait ~15 seconds and retry.'
      : `Could not reach any Overpass server${lastStatus ? ` (last status ${lastStatus})` : ''}. Please retry.`,
  })
}
