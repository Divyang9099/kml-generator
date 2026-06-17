// Vercel serverless proxy — forwards Overpass queries server-side to bypass CORS.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { query } = req.body
  if (!query) return res.status(400).json({ error: 'Missing query' })

  let lastError = null

  for (const url of MIRRORS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const upstream = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
        })

        if (upstream.status === 429 || upstream.status === 504) {
          lastError = new Error(`Server busy (${upstream.status})`)
          await sleep(1200 * (attempt + 1))
          continue
        }

        if (!upstream.ok) {
          lastError = new Error(`Upstream error: ${upstream.status}`)
          break
        }

        const data = await upstream.json()
        return res.status(200).json(data)
      } catch (e) {
        lastError = e
        break
      }
    }
  }

  return res.status(502).json({
    error: lastError?.message || 'All Overpass servers are busy. Please retry.',
  })
}
