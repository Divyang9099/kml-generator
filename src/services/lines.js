// The Power Line workspace holds any number of lines — one per imported file,
// or the one loaded from OpenStreetMap. Exactly one is active: it is the one
// the tower list, the range pickers, editing and export all work on.
//
// A document is { lines, activeId, shapes }. A line is
// { key, type, id, tags, towers } — type/id/tags are what the old single
// `selectedLine` carried, so the panels that read them need no change.

// Muted, distinct hues for the lines that are not the active one. Orange is
// left out: it is the active line's colour on the map.
export const LINE_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#0891b2', '#db2777', '#ca8a04', '#475569', '#dc2626']

export const lineKey = (type, id) => `${type}:${id}`

export function makeLine(type, id, tags = {}, towers = []) {
  return { key: lineKey(type, id), type, id, tags, towers }
}

export const colorOf = (lines, key) => {
  const i = lines.findIndex((l) => l.key === key)
  return LINE_COLORS[(i < 0 ? 0 : i) % LINE_COLORS.length]
}

// Sessions and undo snapshots saved before multi-file import hold
// { towers, shapes, selectedLine }. Bring them into the current shape.
export function upgradeDoc(d) {
  const shapes = Array.isArray(d?.shapes) ? d.shapes : []
  if (Array.isArray(d?.lines)) {
    return { lines: d.lines, activeId: d.activeId ?? d.lines[0]?.key ?? null, shapes }
  }
  const towers = Array.isArray(d?.towers) ? d.towers : []
  const sel = d?.selectedLine
  if (!towers.length && !sel) return { lines: [], activeId: null, shapes }
  const line = makeLine(sel?.type ?? 'kml', sel?.id ?? 'line', sel?.tags ?? {}, towers)
  return { lines: [line], activeId: line.key, shapes }
}
