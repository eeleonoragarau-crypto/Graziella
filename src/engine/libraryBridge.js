// Turns the built-in artwork library into sticker arts + UI thumbnails.
export const CATEGORIES = [
  { id: 'tutti', label: 'Tutti' },
  { id: 'classici', label: 'Classici' },
  { id: 'pop', label: 'Pop' },
  { id: 'riviera', label: 'Riviera' },
  { id: 'retro', label: 'Retrò' },
  { id: 'tuoi', label: 'Tuoi' },
]

export function thumbOf(art, size = 200) {
  const src = art.colorCanvas
  const k = size / Math.max(src.width, src.height)
  const c = document.createElement('canvas')
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k)
  const x = c.getContext('2d')
  x.imageSmoothingQuality = 'high'
  x.drawImage(src, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

export async function loadLibrary(stickers) {
  let mod
  try {
    mod = await import('./stickers/library.js')
  } catch (e) {
    console.warn('sticker library unavailable', e)
    return []
  }
  const { LIBRARY, loadStickerFonts, drawSticker, drawFoilMask } = mod
  await loadStickerFonts()
  const out = []
  for (const entry of LIBRARY) {
    try {
      const id = 'lib:' + entry.id
      const meta = { name: entry.name, finish: entry.finish, size: entry.size, border: entry.border, source: 'library', extra: { category: entry.category } }
      // small, fully processed version for the thumbnail (cheap)
      const small = drawSticker(entry, { scale: 0.22 })
      const smallFoil = drawFoilMask ? drawFoilMask(entry, { scale: 0.22 }) : null
      const thumb = thumbCanvas(small, entry.border, smallFoil)
      stickers.registerLazy(id, meta, () => ({ canvas: drawSticker(entry), foil: drawFoilMask ? drawFoilMask(entry) : null }))
      out.push({ id, name: entry.name, category: entry.category, finish: entry.finish, thumb, source: 'library' })
    } catch (e) {
      console.warn('sticker failed', entry.id, e)
    }
  }
  return out
}

// thumbnail = the same die-cut processing at a fraction of the resolution
import { makeSticker } from './stickers/artwork.js'
function thumbCanvas(canvas, border, foil) {
  const t = makeSticker(canvas, { border: border !== false, foil })
  const url = t.colorCanvas.toDataURL('image/png')
  for (const k of ['color', 'normal', 'orm']) t[k]?.dispose()
  return url
}
