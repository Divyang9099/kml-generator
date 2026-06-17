const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

// Read raw body from request stream (Vercel doesn't auto-parse)
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
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
    const body = JSON.parse(raw)
    query = body.query
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  if (!query) return res.status(400).json({ error: 'Missing query' })

  let lastError = 'All servers failed'

  for (const url of MIRRORS) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 25000) // 25s timeout per mirror

      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (upstream.status === 429 || upstream.status === 504) {
        lastError = `Mirror busy (${upstream.status})`
        continue
      }
      if (!upstream.ok) {
        lastError = `Mirror error (${upstream.status})`
        continue
      }

      const data = await upstream.json()
      return res.status(200).json(data)
    } catch (e) {
      lastError = e.name === 'AbortError' ? 'Mirror timed out' : e.message
      continue
    }
  }

  return res.status(502).json({ error: `${lastError}. Please retry in a few seconds.` })
}
