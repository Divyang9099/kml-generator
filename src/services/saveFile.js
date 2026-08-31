// Exports ask for a filename before saving, rather than silently dropping a
// generated name into the downloads folder.

export function downloadAs(content, filename, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Strips only what Windows and most other filesystems reject. Spaces, hyphens
// and underscores are all legal and are left alone.
export function sanitizeFilename(name, ext) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '') // a trailing dot makes a file unopenable on Windows

  const base = cleaned || 'export'
  return base.toLowerCase().endsWith(ext) ? base : base + ext
}

export const FILE_TYPES = {
  kml: { mime: 'application/vnd.google-earth.kml+xml', ext: '.kml', alt: '.kmz' },
  csv: { mime: 'text/csv', ext: '.csv' },
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// A .kmz is a zip holding doc.kml. Google Earth prefers it, and on a long line
// it is a fraction of the size. JSZip is already lazy-loaded for reading them.
export async function toKmz(kmlText) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('doc.kml', kmlText)
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.google-earth.kmz',
  })
}
