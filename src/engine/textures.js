// Procedural, tileable textures (no assets needed): paint orange-peel, leather
// grain, rubber, knurling... All returned as DataTextures with mipmaps.
import * as THREE from 'three'

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967295
}

// periodic value noise, period p cells
function vnoise(x, y, p, seed) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const m = (a) => ((a % p) + p) % p
  const a = hash(m(xi), m(yi), seed), b = hash(m(xi + 1), m(yi), seed)
  const c = hash(m(xi), m(yi + 1), seed), d = hash(m(xi + 1), m(yi + 1), seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x, y, p, oct, seed, gain = 0.5) {
  let s = 0, amp = 1, norm = 0, f = 1
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(x * f, y * f, p * f, seed + o * 17)
    norm += amp; amp *= gain; f *= 2
  }
  return s / norm
}

// periodic worley (F1, F2) distances
function worley(x, y, p, seed) {
  const xi = Math.floor(x), yi = Math.floor(y)
  let f1 = 9, f2 = 9
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j
    const mx = ((cx % p) + p) % p, my = ((cy % p) + p) % p
    const px = cx + hash(mx, my, seed), py = cy + hash(mx, my, seed + 7)
    const d = Math.hypot(px - x, py - y)
    if (d < f1) { f2 = f1; f1 = d } else if (d < f2) f2 = d
  }
  return [f1, f2]
}

function heightToNormal(h, size, strength) {
  const data = new Uint8Array(size * size * 4)
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength
    const l = Math.hypot(dx, dy, 1)
    const i = (y * size + x) * 4
    data[i] = ((-dx / l) * 0.5 + 0.5) * 255
    data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255
    data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255
    data[i + 3] = 255
  }
  return data
}

function dataTex(data, size, { srgb = false, repeat = 1 } = {}) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.anisotropy = 8
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.repeat.set(repeat, repeat)
  t.needsUpdate = true
  return t
}

const cache = new Map()
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k) }

// Orange peel: the gentle waviness of sprayed clear coat. Tiles every ~4 cm.
export const orangePeel = () => memo('peel', () => {
  const S = 256, h = new Float32Array(S * S)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    h[y * S + x] = fbm((x / S) * 10, (y / S) * 10, 10, 3, 3, 0.45)
  }
  return dataTex(heightToNormal(h, S, 2.2), S)
})

// Pebbled leather grain + fine creases.
export const leatherGrain = () => memo('leather', () => {
  const S = 256, h = new Float32Array(S * S)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [f1, f2] = worley((x / S) * 17, (y / S) * 17, 17, 11)
    const cell = Math.min(1, (f2 - f1) * 2.2)
    const fine = fbm((x / S) * 32, (y / S) * 32, 32, 2, 5)
    const crease = Math.abs(fbm((x / S) * 3, (y / S) * 3, 3, 3, 9) - 0.5)
    h[y * S + x] = cell * 0.8 + fine * 0.25 - Math.max(0, 0.06 - crease) * 6
  }
  return dataTex(heightToNormal(h, S, 3.0), S)
})

// Leather roughness variation (slightly polished where it's been sat on)
export const leatherRough = () => memo('leatherR', () => {
  const S = 256, d = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm((x / S) * 5, (y / S) * 5, 5, 4, 21)
    const v = 135 + (n - 0.5) * 90
    const i = (y * S + x) * 4
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255
  }
  return dataTex(d, S)
})

// Rubber: micro noise for tyres / grips / pedal blocks
export const rubberNormal = () => memo('rubber', () => {
  const S = 256, h = new Float32Array(S * S)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = fbm((x / S) * 48, (y / S) * 48, 48, 2, 31)
  return dataTex(heightToNormal(h, S, 0.8), S)
})

// Chrome: faint polishing swirls in the roughness channel (G) for glTF-style maps
export const chromeRough = () => memo('chromeR', () => {
  const S = 256, d = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm((x / S) * 8, (y / S) * 40, 8, 4, 41)
    const s = fbm((x / S) * 3, (y / S) * 3, 3, 3, 43)
    const v = 255 * (0.35 + n * 0.45 + s * 0.2)
    const i = (y * S + x) * 4
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255
  }
  return dataTex(d, S)
})

// Floor: seamless paper with very low-frequency tonal drift
export const paperNoise = () => memo('paper', () => {
  const S = 256, d = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm((x / S) * 6, (y / S) * 6, 6, 5, 51)
    const v = 235 + (n - 0.5) * 30
    const i = (y * S + x) * 4
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255
  }
  return dataTex(d, S)
})

// Radial fade used as alphaMap for the path-traced floor (the raster floor
// fades in its shader). Center = 1, edge = 0, same curve as the shader.
export function floorFade(inner, outer, extent) {
  const S = 256, d = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = ((x + 0.5) / S - 0.5) * extent * 2, py = ((y + 0.5) / S - 0.5) * extent * 2
    const r = Math.hypot(px, py)
    let t = THREE.MathUtils.clamp((r - inner) / (outer - inner), 0, 1)
    t = t * t * (3 - 2 * t)
    const v = 255 * (1 - t)
    const i = (y * S + x) * 4
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255
  }
  const t = dataTex(d, S)
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  return t
}
