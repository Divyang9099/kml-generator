import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import overpassHandler from './api/overpass.js'

// Vercel serves api/overpass.js in production. In dev, mount the same handler
// on the dev server so both environments hit the identical code path — the
// browser must never call Overpass directly (failing mirrors answer without
// CORS headers, which the browser reports as an unrecoverable CORS error).
function overpassDevApi() {
  return {
    name: 'overpass-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/overpass', (req, res) => {
        // Minimal shim for the Vercel response helpers the handler uses.
        res.status = (code) => { res.statusCode = code; return res }
        res.json = (body) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
          return res
        }
        overpassHandler(req, res).catch((e) => {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e.message }))
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), overpassDevApi()],
})
