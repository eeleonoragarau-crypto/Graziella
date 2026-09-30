// Lighting environments. Every environment ends up as ONE float equirect
// (rows bottom-up, flipY=false) that feeds both renderers:
//   raster  -> PMREM (reflections + diffuse IBL)
//   path    -> importance-sampled env map
// The lower hemisphere is replaced by the seamless floor/backdrop radiance, and
// the whole map is scaled so that a floor of albedo `floor.albedo` comes out
// exactly the backdrop colour: the studio "exposure" is set by the paper.
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { assetUrl } from './assetUrl.js'

const DEG = Math.PI / 180
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// direction from azimuth (0 = +x front of bike, 90 = +z drive side) and elevation
const dirAE = (az, el) => new THREE.Vector3(Math.cos(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.sin(az * DEG) * Math.cos(el * DEG))

function softbox({ az, el, w, h, I, roll = 0, soft = 0.06, hot = 0.25, color = [1, 1, 1] }) {
  const f = dirAE(az, el)
  const up0 = Math.abs(f.y) > 0.98 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  let r = new THREE.Vector3().crossVectors(f, up0).normalize()
  let u = new THREE.Vector3().crossVectors(r, f).normalize()
  if (roll) { const q = new THREE.Quaternion().setFromAxisAngle(f, roll * DEG); r.applyQuaternion(q); u.applyQuaternion(q) }
  const tw = Math.tan((w * DEG) / 2), th = Math.tan((h * DEG) / 2)
  return (d, out) => {
    const df = d.x * f.x + d.y * f.y + d.z * f.z
    if (df <= 0) return
    const x = (d.x * r.x + d.y * r.y + d.z * r.z) / df / tw
    const y = (d.x * u.x + d.y * u.y + d.z * u.z) / df / th
    const ax = Math.abs(x), ay = Math.abs(y)
    if (ax > 1 + soft * 2 || ay > 1 + soft * 2) return
    const m = (1 - smooth(1 - soft, 1 + soft, ax)) * (1 - smooth(1 - soft, 1 + soft, ay))
    const k = I * m * (1 - hot * (x * x + y * y) * 0.5)
    out[0] += k * color[0]; out[1] += k * color[1]; out[2] += k * color[2]
  }
}

// black flag: darkens the walls behind it (applied after ambient, before lights)
function flag({ az, el, w, h, k = 0.12, soft = 0.08 }) {
  const f = dirAE(az, el)
  const up0 = new THREE.Vector3(0, 1, 0)
  const r = new THREE.Vector3().crossVectors(f, up0).normalize()
  const u = new THREE.Vector3().crossVectors(r, f).normalize()
  const tw = Math.tan((w * DEG) / 2), th = Math.tan((h * DEG) / 2)
  const fn = (d, out) => {
    const df = d.x * f.x + d.y * f.y + d.z * f.z
    if (df <= 0) return
    const x = Math.abs((d.x * r.x + d.y * r.y + d.z * r.z) / df / tw)
    const y = Math.abs((d.x * u.x + d.y * u.y + d.z * u.z) / df / th)
    const m = (1 - smooth(1 - soft, 1 + soft, x)) * (1 - smooth(1 - soft, 1 + soft, y))
    const s = 1 - m * (1 - k)
    out[0] *= s; out[1] *= s; out[2] *= s
  }
  fn.isFlag = true
  return fn
}

function disc({ az, el, radius, I, glow = 0, glowWidth = 10, color = [1, 1, 1] }) {
  const f = dirAE(az, el)
  const cr = Math.cos(radius * DEG)
  return (d, out) => {
    const c = d.x * f.x + d.y * f.y + d.z * f.z
    let k = 0
    if (c > cr) k += I
    if (glow) { const ang = Math.acos(Math.min(1, c)) / DEG; k += glow * Math.exp(-ang / glowWidth) }
    out[0] += k * color[0]; out[1] += k * color[1]; out[2] += k * color[2]
  }
}

export const ENVS = {
  studio: {
    name: 'Studio', bg: '#e6e3dd', floor: { albedo: 0.74, roughness: 0.9, specular: 0.25 },
    // light grey cyclorama walls, darker ceiling
    ambient: (d, o) => { const e = Math.max(0, d.y); const v = 0.07 + 0.62 * (1 - smooth(0, 0.5, e)); o[0] += v; o[1] += v * 0.985; o[2] += v * 0.965 },
    // black flags give chrome its defining dark bands
    flags: [
      flag({ az: -20, el: 14, w: 26, h: 40 }),
      flag({ az: 200, el: 12, w: 34, h: 36 }),
      flag({ az: 95, el: 30, w: 50, h: 14, k: 0.3 }),
    ],
    lights: [
      softbox({ az: 32, el: 52, w: 40, h: 26, I: 24, hot: 0.3 }),
      softbox({ az: 0, el: 84, w: 10, h: 72, I: 6, roll: 90 }),
      softbox({ az: -155, el: 16, w: 9, h: 44, I: 10, soft: 0.04 }),
      softbox({ az: 160, el: 20, w: 9, h: 40, I: 8, soft: 0.04 }),
      softbox({ az: 70, el: 6, w: 42, h: 26, I: 1.9, soft: 0.12, hot: 0 }),
      softbox({ az: -72, el: 8, w: 30, h: 28, I: 1.4, soft: 0.12, hot: 0 }),
    ],
  },
  nero: {
    name: 'Nero', bg: '#0e0e0f', floor: { albedo: 0.05, roughness: 0.22, specular: 0.5 }, norm: { E: 3.4 },
    ambient: (d, o) => { const v = 0.006; o[0] += v; o[1] += v; o[2] += v },
    lights: [
      softbox({ az: 30, el: 70, w: 44, h: 26, I: 14, hot: 0.5 }),
      softbox({ az: -160, el: 12, w: 8, h: 56, I: 11, soft: 0.03 }),
      softbox({ az: 165, el: 14, w: 7, h: 50, I: 9, soft: 0.03 }),
      softbox({ az: 90, el: 30, w: 30, h: 8, I: 2.2, soft: 0.1 }),
    ],
  },
  tramonto: {
    name: 'Tramonto', bg: '#e9cdb0', floor: { albedo: 0.66, roughness: 0.88, specular: 0.2 },
    ambient: (d, o) => {
      const e = d.y
      const t = smooth(-0.05, 0.9, e)
      o[0] += 1.25 * (1 - t) + 0.22 * t
      o[1] += 0.78 * (1 - t) + 0.36 * t
      o[2] += 0.5 * (1 - t) + 0.62 * t
    },
    lights: [
      disc({ az: -128, el: 9, radius: 0.9, I: 2600, glow: 5.5, glowWidth: 7, color: [1, 0.66, 0.36] }),
      softbox({ az: 60, el: 40, w: 90, h: 50, I: 0.4, soft: 0.3, hot: 0, color: [0.7, 0.8, 1] }),
    ],
  },
  loft: {
    name: 'Loft', bg: '#dcd7cf', floor: { albedo: 0.7, roughness: 0.9, specular: 0.25 }, url: '/hdri/photo_studio_loft_hall.hdr', rotate: 110,
  },
  set: {
    name: 'Set fotografico', bg: '#d7d5d2', floor: { albedo: 0.72, roughness: 0.9, specular: 0.25 }, url: '/hdri/studio_small_09.hdr', rotate: -30,
  },
  bottega: {
    name: 'Bottega', bg: '#cfc6ba', floor: { albedo: 0.62, roughness: 0.86, specular: 0.25 }, url: '/hdri/brown_photostudio_02.hdr', rotate: 60,
  },
}

const W = 2048, H = 1024

function luminance(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b }

function proceduralData(cfg) {
  const data = new Float32Array(W * H * 4)
  const d = new THREE.Vector3(), out = [0, 0, 0]
  for (let y = H / 2; y < H; y++) {
    const el = ((y + 0.5) / H - 0.5) * Math.PI
    const ce = Math.cos(el), se = Math.sin(el)
    for (let x = 0; x < W; x++) {
      const phi = ((x + 0.5) / W - 0.5) * 2 * Math.PI
      d.set(Math.cos(phi) * ce, se, Math.sin(phi) * ce)
      out[0] = out[1] = out[2] = 0
      cfg.ambient(d, out)
      if (cfg.flags) for (const F of cfg.flags) F(d, out)
      for (const L of cfg.lights) L(d, out)
      const i = (y * W + x) * 4
      data[i] = out[0]; data[i + 1] = out[1]; data[i + 2] = out[2]; data[i + 3] = 1
    }
  }
  return data
}

async function hdriData(cfg) {
  const loader = new HDRLoader().setDataType(THREE.FloatType)
  const tex = await loader.loadAsync(await assetUrl(cfg.url))
  const { width, height, data: src } = tex.image
  const data = new Float32Array(W * H * 4)
  // resample to W x H, rows bottom-up, rotated by cfg.rotate degrees in azimuth
  const rot = ((cfg.rotate || 0) / 360)
  for (let y = H / 2; y < H; y++) {
    const v = (y + 0.5) / H
    const sy = Math.min(height - 1, Math.floor((1 - v) * height)) // hdr rows are top-down
    for (let x = 0; x < W; x++) {
      let u = (x + 0.5) / W + rot
      u -= Math.floor(u)
      const sx = Math.min(width - 1, Math.floor(u * width))
      const si = (sy * width + sx) * 4, i = (y * W + x) * 4
      data[i] = src[si]; data[i + 1] = src[si + 1]; data[i + 2] = src[si + 2]; data[i + 3] = 1
    }
  }
  tex.dispose()
  return data
}

// irradiance (per channel) on an up-facing surface from the upper hemisphere
function irradianceUp(data) {
  const E = [0, 0, 0]
  const dphi = (2 * Math.PI) / W, dth = Math.PI / H
  for (let y = H / 2; y < H; y++) {
    const el = ((y + 0.5) / H - 0.5) * Math.PI
    const w = Math.sin(el) * Math.cos(el) * dphi * dth
    let r = 0, g = 0, b = 0
    for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2] }
    E[0] += r * w; E[1] += g * w; E[2] += b * w
  }
  return E
}

export async function buildEnvironment(key) {
  const cfg = ENVS[key]
  const data = cfg.url ? await hdriData(cfg) : proceduralData(cfg)
  // exposure: floor (albedo a) lit by E_up must equal the backdrop radiance.
  // The floor's tint is solved per channel, so a blue sky or a warm lamp
  // never shows as a seam where the paper meets the backdrop.
  const bg = new THREE.Color(cfg.bg) // linear
  const B = luminance(bg.r, bg.g, bg.b)
  const Ec = irradianceUp(data)
  const E = luminance(Ec[0], Ec[1], Ec[2])
  const k = cfg.norm?.E ? cfg.norm.E / E : (B * Math.PI) / (cfg.floor.albedo * E)
  const floorColor = new THREE.Color()
  if (cfg.norm?.E) floorColor.setScalar(cfg.floor.albedo)
  else {
    const a = [bg.r, bg.g, bg.b].map((c, i) => Math.min(0.95, Math.max(0.02, (c * Math.PI) / (k * Math.max(1e-6, Ec[i])))))
    floorColor.setRGB(a[0], a[1], a[2])
  }
  for (let i = (H / 2) * W * 4; i < data.length; i += 4) { data[i] *= k; data[i + 1] *= k; data[i + 2] *= k }
  // lower hemisphere: the seamless paper, blending into the walls at the horizon
  for (let y = 0; y < H / 2; y++) {
    const el = ((y + 0.5) / H - 0.5) * Math.PI / DEG // negative
    const t = smooth(-4, 0, el)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const j = ((H / 2) * W + x) * 4 // first row above the horizon
      data[i] = bg.r * (1 - t) + data[j] * t
      data[i + 1] = bg.g * (1 - t) + data[j + 1] * t
      data[i + 2] = bg.b * (1 - t) + data[j + 2] * t
      data[i + 3] = 1
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.LinearSRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.flipY = false
  tex.needsUpdate = true
  const sampler = buildSampler(data)
  return { key, cfg, texture: tex, bg, sampler, scale: k, floorColor }
}

// Importance sampling of light directions (upper hemisphere), weight L*cos
export function buildSampler(data) {
  const n = W * (H / 2)
  const cdf = new Float64Array(n)
  let acc = 0
  for (let y = H / 2, k = 0; y < H; y++) {
    const el = ((y + 0.5) / H - 0.5) * Math.PI
    const w = Math.sin(el) * Math.cos(el)
    for (let x = 0; x < W; x++, k++) {
      const i = (y * W + x) * 4
      acc += luminance(data[i], data[i + 1], data[i + 2]) * w
      cdf[k] = acc
    }
  }
  for (let k = 0; k < n; k++) cdf[k] /= acc
  return (r1, r2, r3, target = new THREE.Vector3()) => {
    let lo = 0, hi = n - 1
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r1) lo = m + 1; else hi = m }
    const y = H / 2 + Math.floor(lo / W), x = lo % W
    const el = ((y + r2) / H - 0.5) * Math.PI
    const phi = ((x + r3) / W - 0.5) * 2 * Math.PI
    return target.set(Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el))
  }
}
