// Where the CC0 assets (textures, props, skies, studio HDRIs) come from:
//   local   public/sets + public/hdri, after `node tools/fetch-assets.mjs`
//           (marked by public/sets/local.json): fast, works offline
//   cdn     otherwise straight from Poly Haven's CDN (CORS open), using the
//           generated manifest, so a fresh clone runs with nothing to download
// `?cdn` in the page URL forces the CDN (to test a clone's behaviour).
let localP = null
let mapP = null

export function assetsAreLocal() {
  if (!localP) {
    const force = typeof location !== 'undefined' && new URLSearchParams(location.search).has('cdn')
    localP = force
      ? Promise.resolve(false)
      : fetch('/sets/local.json', { cache: 'no-store' })
        // a dev server answers unknown paths with index.html: insist on JSON
        .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null))
        .then((j) => !!(j && j.local))
        .catch(() => false)
  }
  return localP
}

export function manifest() {
  if (!mapP) mapP = import('./sets/manifest.js').then((m) => m.default)
  return mapP
}

// '/sets/tex/<id>/<file>' | '/sets/models/<id>/<file>' | '/sets/sky/<file>' | '/hdri/<file>'
export async function assetUrl(path) {
  if (await assetsAreLocal()) return path
  const map = await manifest()
  return map[path] || path
}

// Streaming politely from the CDN: a few requests at a time, retried.
const MAX = 6
let active = 0
const waiting = []
export async function queued(task, tries = 3) {
  if (active >= MAX) await new Promise((res) => waiting.push(res))
  active++
  try {
    for (let i = 0; ; i++) {
      try { return await task() } catch (e) {
        if (i >= tries - 1) throw e
        await new Promise((r) => setTimeout(r, 500 * 3 ** i))
      }
    }
  } finally {
    active--
    waiting.shift()?.()
  }
}
