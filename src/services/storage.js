// Session persistence. Best-effort by design: private windows, disabled site
// data and full quotas all throw, and none of that may be allowed to break the
// app — a lost restore is an inconvenience, a crash is not.

const KEY = 'sarjanam.session.v1'
const SAVE_DELAY = 400

let timer = null

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return {
      towers: Array.isArray(data.towers) ? data.towers : [],
      shapes: Array.isArray(data.shapes) ? data.shapes : [],
      selectedLine: data.selectedLine ?? null,
      mode: data.mode === 'draw' ? 'draw' : 'line',
      savedAt: data.savedAt ?? null,
    }
  } catch {
    return null
  }
}

// Debounced: typing a name would otherwise serialise the whole document on
// every keystroke.
export function saveSession(session) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...session, savedAt: Date.now() }))
    } catch {
      // Quota exceeded or storage blocked — nothing useful to do, and the
      // document in memory is unaffected.
    }
  }, SAVE_DELAY)
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
  !session || ((session.towers?.length ?? 0) === 0 && (session.shapes?.length ?? 0) === 0)
