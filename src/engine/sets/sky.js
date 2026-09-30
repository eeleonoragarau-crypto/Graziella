// Skies for the sets. One HDRI becomes:
//   pt      float equirect WITH the sun: the path tracer importance-samples it,
//           so the sun's shadows get their true penumbra.
//   raster  the same sky with the sun disc painted out; the sun comes back as
//           a SunLight (cascaded shadows) of exactly the irradiance removed.
//   sun     { dir, color, E } (E = irradiance on a surface facing the sun)
// Maps use the environment.js layout: W x H, rows bottom-up, flipY = false.
// The lower hemisphere is replaced by a dim ground glow (the sets cover it).
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { buildSampler } from '../environment.js'
import { assetUrl } from '../assetUrl.js'

const W = 2048, H = 1024
const DEG = Math.PI / 180
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

const cache = new Map()

function dirOf(x, y, out = new THREE.Vector3()) {
  const el = ((y + 0.5) / H - 0.5) * Math.PI
  const phi = ((x + 0.5) / W - 0.5) * 2 * Math.PI
  return out.set(Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el))
}
// solid angle of a pixel in row y
const omega = (y) => Math.cos(((y + 0.5) / H - 0.5) * Math.PI) * (2 * Math.PI / W) * (Math.PI / H)

async function loadHDR(url) {
  if (!cache.has(url)) {
    const loader = new HDRLoader().setDataType(THREE.FloatType)
    cache.set(url, assetUrl(url).then((u) => loader.loadAsync(u)).then((tex) => {
      const { width, height, data } = tex.image
      tex.dispose()
      return { width, height, data }
    }))
  }
  return cache.get(url)
}

function makeTexture(data) {
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType)
  t.mapping = THREE.EquirectangularReflectionMapping
  t.colorSpace = THREE.LinearSRGBColorSpace
  t.minFilter = t.magFilter = THREE.LinearFilter
  t.generateMipmaps = false
  t.flipY = false
  t.needsUpdate = true
  return t
}

// cfg: { url, sunAz (deg, where the sun should end up; 0 = +x, 90 = +z),
//        sunEl (optional: tilt the whole sky so the sun sits at this elevation),
//        E (target horizontal irradiance incl. sun), sunScale (1), tint [r,g,b], ground (albedo) }
export async function loadSky(cfg) {
  const src = await loadHDR(cfg.url)
  const { width, height } = src
  const s = src.data

  // 1. find the sun in the source (brightest pixel, upper half) to know how to rotate
  let best = -1, bx = 0, by = 0
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const L = lum(s[i], s[i + 1], s[i + 2])
      if (L > best) { best = L; bx = x; by = y }
    }
  }
  // source u of the sun -> azimuth; rotate so it lands at cfg.sunAz
  const srcU = (bx + 0.5) / width
  const srcAz = (srcU - 0.5) * 360
  const rot = (((cfg.sunAz ?? srcAz) - srcAz) / 360)

  // 2. resample to W x H, rows bottom-up, rotated in azimuth (bilinear)
  const pt = new Float32Array(W * H * 4)
  for (let y = H / 2; y < H; y++) {
    const v = (y + 0.5) / H
    const fy = (1 - v) * height - 0.5
    const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(height - 1, y0 + 1), ty = Math.min(1, Math.max(0, fy - y0))
    for (let x = 0; x < W; x++) {
      let u = (x + 0.5) / W - rot
      u -= Math.floor(u)
      const fx = u * width - 0.5
      const x0 = ((Math.floor(fx) % width) + width) % width, x1 = (x0 + 1) % width, tx = fx - Math.floor(fx)
      const i00 = (y0 * width + x0) * 4, i10 = (y0 * width + x1) * 4, i01 = (y1 * width + x0) * 4, i11 = (y1 * width + x1) * 4
      const o = (y * W + x) * 4
      for (let c = 0; c < 3; c++) {
        const a = s[i00 + c] * (1 - tx) + s[i10 + c] * tx
        const b = s[i01 + c] * (1 - tx) + s[i11 + c] * tx
        pt[o + c] = a * (1 - ty) + b * ty
      }
      pt[o + 3] = 1
    }
  }

  // 3. optional colour grade of the whole sky
  if (cfg.tint) {
    for (let i = (H / 2) * W * 4; i < pt.length; i += 4) { pt[i] *= cfg.tint[0]; pt[i + 1] *= cfg.tint[1]; pt[i + 2] *= cfg.tint[2] }
  }

  // 4. locate the sun disc in the resampled map
  let peak = 0, px = 0, py = 0
  const lumAt = (x, y) => { const i = (y * W + x) * 4; return lum(pt[i], pt[i + 1], pt[i + 2]) }
  const skyL = []
  for (let y = H / 2; y < H; y += 4) for (let x = 0; x < W; x += 4) skyL.push(lumAt(x, y))
  skyL.sort((a, b) => a - b)
  const p90 = skyL[Math.floor(skyL.length * 0.9)]
  for (let y = H / 2; y < H; y++) for (let x = 0; x < W; x++) { const L = lumAt(x, y); if (L > peak) { peak = L; px = x; py = y } }
  let sun = null
  let peakSun = false
  const raster = new Float32Array(pt)
  const threshold = Math.max(peak * 0.02, p90 * 40)
  if (peak > p90 * 80) {
    const c = dirOf(px, py)
    const cosR = Math.cos(4 * DEG)
    const cosRing0 = Math.cos(4.5 * DEG), cosRing1 = Math.cos(7 * DEG)
    const d = new THREE.Vector3()
    const dir = new THREE.Vector3()
    let E = 0, R = 0, G = 0, B = 0
    let ringR = 0, ringG = 0, ringB = 0, ringN = 0
    const masked = []
    const span = Math.ceil(8 * W / 360)
    for (let y = Math.max(H / 2, py - span); y < Math.min(H, py + span); y++) {
      const w = omega(y)
      for (let k = -span * 3; k <= span * 3; k++) {
        const x = (((px + k) % W) + W) % W
        dirOf(x, y, d)
        const cs = d.dot(c)
        const i = (y * W + x) * 4
        const L = lum(pt[i], pt[i + 1], pt[i + 2])
        if (cs > cosR && L > threshold) {
          // energy above the local sky level belongs to the sun
          E += (L - p90) * w
          R += Math.max(0, pt[i] - p90) * w; G += Math.max(0, pt[i + 1] - p90) * w; B += Math.max(0, pt[i + 2] - p90) * w
          dir.addScaledVector(d, L * w)
          masked.push(i)
        } else if (cs < cosRing0 && cs > cosRing1) {
          ringR += pt[i]; ringG += pt[i + 1]; ringB += pt[i + 2]; ringN++
        }
      }
    }
    if (E > 0 && ringN) {
      ringR /= ringN; ringG /= ringN; ringB /= ringN
      for (const i of masked) { raster[i] = ringR; raster[i + 1] = ringG; raster[i + 2] = ringB }
      const l = lum(R, G, B)
      sun = { dir: dir.normalize(), color: new THREE.Color(R / l, G / l, B / l), E: l }
      peakSun = true
    }
  }

  // 4b. skies without a disc (a sunset behind thin cloud) can be given one:
  //     cfg.addSun = { el, E (relative to the sky's own horizontal irradiance), color }
  //     placed at the sky's brightest azimuth, which rotation put at cfg.sunAz
  if (!sun && cfg.addSun) {
    const az = (cfg.sunAz ?? 0) * DEG, el = (cfg.addSun.el ?? 8) * DEG
    let Esky = 0
    for (let y = H / 2; y < H; y++) {
      const w = omega(y) * Math.sin(((y + 0.5) / H - 0.5) * Math.PI)
      for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; Esky += lum(pt[i], pt[i + 1], pt[i + 2]) * w }
    }
    const c = cfg.addSun.color || [1, 0.62, 0.34]
    const l = lum(c[0], c[1], c[2])
    sun = { dir: new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)), color: new THREE.Color(c[0] / l, c[1] / l, c[2] / l), E: (cfg.addSun.E ?? 2) * Esky }
  }

  // 5. normalise: horizontal irradiance (sky + sun) = cfg.E
  let Eup = 0
  for (let y = H / 2; y < H; y++) {
    const w = omega(y) * Math.sin(((y + 0.5) / H - 0.5) * Math.PI)
    let acc = 0
    for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; acc += lum(pt[i], pt[i + 1], pt[i + 2]) }
    Eup += acc * w
  }
  // (a synthetic sun is not in the pixels yet)
  if (sun && cfg.addSun && sun.synthetic !== false && !peakSun) Eup += sun.E * Math.max(0, sun.dir.y)
  const k = (cfg.E ?? 4) / Eup
  const sunK = cfg.sunScale ?? 1
  for (let y = H / 2; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      for (let c = 0; c < 3; c++) { pt[i + c] *= k; raster[i + c] *= k }
    }
  }
  if (sun) {
    sun.E *= k * sunK
    // The path-traced sun: the same energy spread evenly over a disc of
    // `sunRadius` degrees on top of the painted-out sky. A real sun is 0.27
    // degrees; a slightly larger one keeps the penumbrae natural and makes
    // the path tracer converge far faster in sunlit sets.
    const R = (cfg.sunRadius ?? 0.7) * DEG
    const cosR = Math.cos(R)
    const solid = 2 * Math.PI * (1 - cosR)
    const Lsun = sun.E / solid
    const c = sun.dir, d = new THREE.Vector3()
    const span = Math.ceil(((R / DEG) + 2) * W / 360)
    let acc = 0
    const cols = []
    for (let i = (H / 2) * W * 4; i < pt.length; i += 4) { pt[i] = raster[i]; pt[i + 1] = raster[i + 1]; pt[i + 2] = raster[i + 2] }
    const py = Math.round(((Math.asin(c.y) / Math.PI) + 0.5) * H - 0.5)
    const px = Math.round(((Math.atan2(c.z, c.x) / (2 * Math.PI)) + 0.5) * W - 0.5)
    for (let y = Math.max(H / 2, py - span); y < Math.min(H, py + span + 1); y++) {
      for (let k2 = -span * 4; k2 <= span * 4; k2++) {
        const x = (((px + k2) % W) + W) % W
        dirOf(x, y, d)
        if (d.dot(c) > cosR) { cols.push((y * W + x) * 4); acc += omega(y) }
      }
    }
    // normalise by the solid angle actually covered by the pixels
    const Lp = acc > 0 ? sun.E / acc : Lsun
    for (const i of cols) {
      pt[i] += Lp * sun.color.r; pt[i + 1] += Lp * sun.color.g; pt[i + 2] += Lp * sun.color.b
    }
  }

  // 6. lower hemisphere: a dim, even ground glow (bounce from the street),
  //    blended into the horizon over 3 degrees
  const ground = cfg.ground ?? 0.18
  const Eg = [0, 0, 0]
  for (let y = H / 2; y < H; y++) {
    const w = omega(y) * Math.sin(((y + 0.5) / H - 0.5) * Math.PI)
    for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; Eg[0] += raster[i] * w; Eg[1] += raster[i + 1] * w; Eg[2] += raster[i + 2] * w }
  }
  if (sun) {
    const cosEl = Math.max(0, sun.dir.y)
    Eg[0] += sun.E * sun.color.r * cosEl; Eg[1] += sun.E * sun.color.g * cosEl; Eg[2] += sun.E * sun.color.b * cosEl
  }
  const gr = Eg.map((e) => (e * ground) / Math.PI)
  for (let y = 0; y < H / 2; y++) {
    const el = (((y + 0.5) / H - 0.5) * Math.PI) / DEG
    const t = Math.min(1, Math.max(0, (el + 3) / 3))
    const tt = t * t * (3 - 2 * t)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, j = ((H / 2) * W + x) * 4
      for (let c = 0; c < 3; c++) {
        const v = gr[c] * (1 - tt) + raster[j + c] * tt
        raster[i + c] = v; pt[i + c] = v
      }
      raster[i + 3] = pt[i + 3] = 1
    }
  }

  return {
    pt: makeTexture(pt), raster: makeTexture(raster), rasterData: raster, sun,
    sampler: buildSampler(raster), scale: k,
  }
}
