// A tooltip that follows the cursor along a line. Leaflet's own `sticky`
// tooltip does the following; these just bind it on the way in and drop it on
// the way out, with content that is re-worked on every move.

export const esc = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function showTip(e, html) {
  const layer = e.target
  if (layer.getTooltip()) layer.setTooltipContent(html)
  else layer.bindTooltip(html, { sticky: true, direction: 'top', opacity: 1 })
  layer.openTooltip(e.latlng)
}

export function hideTip(e) {
  e.target.unbindTooltip()
}
