// Session persistence. Best-effort by design: private windows, disabled site
// data and full quotas all throw, and none of that may be allowed to break the
// app — a lost restore is an inconvenience, a crash is not.

import { upgradeDoc } from './lines.js'

const KEY = 'sarjanam.session.v1'
const SAVE_DELAY = 400
// Above this the history is dropped rather than the document — losing undo
// steps is an inconvenience, losing the work is not.
const MAX_BYTES = 2_000_000
const KEEP_HISTORY = 10

let timer = null

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return {
      ...upgradeDoc(data),
      past: Array.isArray(data.past) ? data.past.map(upgradeDoc) : [],
      mode: data.mode === 'draw' ? 'draw' : 'line',
      savedAt: data.savedAt ?? null,
    }
  } catch {
    return null
  }
}

// Debounced: typing a name would otherwise serialise the whole document on
// every keystroke.
function write(session) {
  try {
    const payload = { ...session, past: (session.past ?? []).slice(-KEEP_HISTORY), savedAt: Date.now() }
    let text = JSON.stringify(payload)
    if (text.length > MAX_BYTES) text = JSON.stringify({ ...payload, past: [] })
    localStorage.setItem(KEY, text)
  } catch {
    // Quota exceeded or storage blocked — nothing useful to do, and the
    // document in memory is unaffected.
  }
}

export function saveSession(session) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => write(session), SAVE_DELAY)
}

// Writes now rather than in 400ms — for the moment the tab is closing, when a
// pending debounce would never fire.
export function flushSession(session) {
  if (timer) clearTimeout(timer)
  write(session)
}

export function clearSession() {
  if (timer) clearTimeout(timer)
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

export const isEmptySession = (session) =>
  !session || ((session.lines?.length ?? 0) === 0 && (session.shapes?.length ?? 0) === 0)
