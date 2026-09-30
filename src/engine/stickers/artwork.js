// Artwork -> vinyl sticker textures.
//   color  : artwork over a white die-cut vinyl border (smooth offset contour,
//            concave corners rounded like a real cutting plotter)
//   normal : bevel along the cut edge, so the rim of the vinyl catches light
//   orm    : G = roughness, B = metalness (foil / holographic stickers)
//   holo   : iridescence thickness pattern (diffraction-like bands + sparkle)
import * as THREE from 'three'

const INF = 1e20

// Felzenszwalb-Huttenlocher squared Euclidean distance transform, 1D
function edt1d(f, n, d, v, z) {
  let k = 0
  v[0] = 0; z[0] = -INF; z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]) }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const t = q - v[k]; d[q] = t * t + f[v[k]] }
}

// distance (px) from every pixel to the nearest pixel where inside[i] is true
export function distanceTo(inside, w, h) {
  const g = new Float64Array(w * h)
  for (let i = 0; i < w * h; i++) g[i] = inside[i] ? 0 : INF
  const n = Math.max(w, h)
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x]
    edt1d(f, h, d, v, z)
    for (let y = 0; y < h; y++) g[y * w + x] = d[y]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x]
    edt1d(f, w, d, v, z)
    for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x])
  }
  return g
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }

function tex(c, srgb) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.anisotropy = 8
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

// Fit any image source into an artwork canvas (longest side `max`)
export function rasterize(img, max = 1024) {
  const iw = img.naturalWidth || img.videoWidth || img.width, ih = img.naturalHeight || img.videoHeight || img.height
  const k = Math.min(1, max / Math.max(iw, ih)) || 1
  const c = canvas(Math.max(8, Math.round(iw * k)), Math.max(8, Math.round(ih * k)))
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return c
}

// Does this artwork carry real transparency? (photos/JPEGs don't)
export function hasAlpha(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let transparent = 0
  for (let i = 3; i < d.length; i += 16) if (d[i] < 200) transparent++
  return transparent > (d.length / 16) * 0.02
}

// Opaque photos become rounded-corner "photo stickers"
export function roundCorners(c, radiusFrac = 0.08) {
  const out = canvas(c.width, c.height)
  const x = out.getContext('2d')
  const r = Math.min(c.width, c.height) * radiusFrac
  x.beginPath()
  x.roundRect(0, 0, c.width, c.height, r)
  x.clip()
  x.drawImage(c, 0, 0)
  return out
}

/**
 * @param art      canvas with the artwork (transparent background)
 * @param opts.border   white die-cut border
 * @param opts.borderFrac border width as a fraction of the longest side
 * @param opts.foil     optional canvas: white = metallic foil
 * @param opts.vinyl    colour of the vinyl carrier
 */
export function makeSticker(art, { border = true, borderFrac = 0.035, foil = null, vinyl = '#f7f6f1', paper = false } = {}) {
  const L = Math.max(art.width, art.height)
  const B = border ? Math.max(3, Math.round(L * borderFrac)) : 0
  const pad = B + Math.round(L * 0.012) + 6
  const W = art.width + pad * 2, H = art.height + pad * 2
  const n = W * H

  // artwork alpha on the padded grid
  const artC = canvas(W, H)
  const ax = artC.getContext('2d')
  ax.drawImage(art, pad, pad)
  const artData = ax.getImageData(0, 0, W, H)
  const inside = new Uint8Array(n)
  for (let i = 0; i < n; i++) inside[i] = artData.data[i * 4 + 3] > 127 ? 1 : 0

  // final sticker alpha
  const alpha = new Float32Array(n)
  if (border) {
    // closing: dilate by B + r, then erode by r -> smooth offset contour
    const r = Math.round(B * 0.9)
    const dOut = distanceTo(inside, W, H)
    const big = new Uint8Array(n)
    for (let i = 0; i < n; i++) big[i] = dOut[i] <= B + r ? 1 : 0
    const outside = new Uint8Array(n)
    for (let i = 0; i < n; i++) outside[i] = big[i] ? 0 : 1
    const dIn = distanceTo(outside, W, H)
    for (let i = 0; i < n; i++) alpha[i] = Math.min(1, Math.max(0, dIn[i] - r + 0.5))
  } else {
    for (let i = 0; i < n; i++) alpha[i] = artData.data[i * 4 + 3] / 255
  }

  // colour: vinyl carrier + artwork
  const color = canvas(W, H)
  const cx = color.getContext('2d')
  if (border) {
    const carrier = cx.createImageData(W, H)
    const vc = new THREE.Color(vinyl)
    const vr = Math.round(vc.r * 255), vg = Math.round(vc.g * 255), vb = Math.round(vc.b * 255)
    // (THREE.Color is linear; convert back to sRGB bytes)
    const sr = new THREE.Color(vinyl).convertLinearToSRGB()
    void vr; void vg; void vb
    for (let i = 0; i < n; i++) {
      carrier.data[i * 4] = sr.r * 255; carrier.data[i * 4 + 1] = sr.g * 255; carrier.data[i * 4 + 2] = sr.b * 255
      carrier.data[i * 4 + 3] = alpha[i] * 255
    }
    cx.putImageData(carrier, 0, 0)
  }
  cx.drawImage(artC, 0, 0)
  if (border) {
    // clip anything the artwork drew outside the die line
    const d = cx.getImageData(0, 0, W, H)
    for (let i = 0; i < n; i++) d.data[i * 4 + 3] = Math.min(d.data[i * 4 + 3], alpha[i] * 255)
    cx.putImageData(d, 0, 0)
  }

  // bevel normal from distance to the die line (inside)
  const solid = new Uint8Array(n)
  for (let i = 0; i < n; i++) solid[i] = alpha[i] > 0.5 ? 0 : 1
  const dEdge = distanceTo(solid, W, H)
  const bevel = Math.max(2.5, L * (paper ? 0.006 : 0.0075))
  const hgt = new Float32Array(n)
  for (let i = 0; i < n; i++) { const t = Math.min(1, dEdge[i] / bevel); hgt[i] = Math.sin(t * Math.PI / 2) }
  const normal = canvas(W, H)
  const nx = normal.getContext('2d')
  const nd = nx.createImageData(W, H)
  const strength = bevel * 0.55
  const seed = paper ? 1 : 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x
    const hl = hgt[y * W + Math.max(0, x - 1)], hr = hgt[y * W + Math.min(W - 1, x + 1)]
    const hu = hgt[Math.max(0, y - 1) * W + x], hd = hgt[Math.min(H - 1, y + 1) * W + x]
    let dx = (hr - hl) * 0.5 * strength, dy = (hu - hd) * 0.5 * strength // canvas y is down; texture v is up
    if (seed) { // paper fibre
      const f = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
      const r = f - Math.floor(f) - 0.5
      dx += r * 0.08; dy += (Math.sin(x * 3.1 + y * 0.7) * 0.5) * 0.04
    }
    const l = Math.hypot(dx, dy, 1)
    nd.data[i * 4] = (-dx / l * 0.5 + 0.5) * 255
    nd.data[i * 4 + 1] = (-dy / l * 0.5 + 0.5) * 255
    nd.data[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255
    nd.data[i * 4 + 3] = 255
  }
  nx.putImageData(nd, 0, 0)

  // ORM for foil
  let orm = null
  if (foil) {
    const fc = canvas(W, H)
    const fx = fc.getContext('2d')
    fx.drawImage(foil, pad, pad, art.width, art.height)
    const fd = fx.getImageData(0, 0, W, H)
    const oc = canvas(W, H)
    const ox = oc.getContext('2d')
    const od = ox.createImageData(W, H)
    for (let i = 0; i < n; i++) {
      const m = (fd.data[i * 4] / 255) * (fd.data[i * 4 + 3] / 255)
      od.data[i * 4] = 255
      od.data[i * 4 + 1] = (0.34 - 0.2 * m) * 255 // roughness: foil is polished, ink satin
      od.data[i * 4 + 2] = m * 255                // metalness
      od.data[i * 4 + 3] = 255
    }
    ox.putImageData(od, 0, 0)
    orm = oc
  }

  return {
    color: tex(color, true), normal: tex(normal, false), orm: orm ? tex(orm, false) : null,
    aspect: W / H, width: W, height: H, pad, colorCanvas: color,
  }
}

// Shared holographic thickness map (G channel drives thin-film thickness)
let _holo = null
export function holoThickness() {
  if (_holo) return _holo
  const S = 512
  const c = canvas(S, S)
  const x = c.getContext('2d')
  const d = x.createImageData(S, S)
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S
    const band = 0.5 + 0.5 * Math.sin((u * 0.86 + v * 0.5) * Math.PI * 2 * 5.5 + Math.sin(v * 9) * 0.6)
    const ring = 0.5 + 0.5 * Math.sin(Math.hypot(u - 0.3, v - 0.7) * Math.PI * 2 * 9)
    const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453
    const spark = (h - Math.floor(h)) > 0.985 ? 1 : 0
    const t = Math.min(1, band * 0.62 + ring * 0.3 + spark * 0.5)
    const k = (j * S + i) * 4
    d.data[k] = 255; d.data[k + 1] = t * 255; d.data[k + 2] = 255; d.data[k + 3] = 255
  }
  x.putImageData(d, 0, 0)
  _holo = tex(c, false)
  _holo.wrapS = _holo.wrapT = THREE.RepeatWrapping
  return _holo
}
