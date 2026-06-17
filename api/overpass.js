const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

async function fetchMirror(url, query, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SarjanamKMLCreator/1.0',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    })
    clearTimeout(timer)
    return res
  } catch (e) {
    clearTimeout(timer)
    throw e
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

  for (let i = 0; i < shuffled.length; i++) {
    const url = shuffled[i]
    try {
      const upstream = await fetchMirror(url, query)

      if (upstream.status === 429 || upstream.status === 503) {
        // Rate limited — wait then try next mirror
        await sleep(800)
        continue
      }
      if (!upstream.ok) {
        await sleep(400)
        continue
      }

      const data = await upstream.json()
      // Tell browser to cache identical queries for 5 min
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      return res.status(200).json(data)
    } catch (e) {
      // Timeout or network error — try next mirror immediately
      continue
    }
  }

  return res.status(502).json({
    error: 'All Overpass servers are busy right now. Please wait 10 seconds and retry.',
  })
}
