// 20" wheel: balloon tyre (real circumferential grooves in the profile, chevron
// tread + sipes in a normal map), whitewall band, chrome rim, small-flange hub,
// 36 spokes laced 3-cross with nipples, valve.
import * as THREE from 'three'
import { latheZ, merge, rod, v3, TAU, DEG } from '../geo.js'
import { part, group } from './part.js'

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
export const SQUASH = 0.003

// Tyre cross-section (superellipse) from left bead over the crown to right bead.
// Two circumferential grooves are notched straight into the profile.
function tyreProfile(D, n = 72) {
  const rc = 0.2288, ar = D.tyreR - rc, az = D.tyreHalfW
  const gamma = Math.asin(0.0104 / az)
  const e = 2 / 2.35
  const pts = []
  const a0 = -(Math.PI - gamma), a1 = Math.PI - gamma
  for (let i = 0; i <= n; i++) {
    const u = i / n, w = u - 0.5
    const a = a0 + (a1 - a0) * (0.5 + Math.sign(w) * Math.pow(Math.abs(w) * 2, 1.25) / 2)
    const s = Math.sin(a), c = Math.cos(a)
    let z = az * Math.sign(s) * Math.pow(Math.abs(s), e)
    let r = rc + ar * Math.sign(c) * Math.pow(Math.abs(c), e)
    // groove notch at |z| = 3.6 mm, 1.2 mm deep
    const gz = Math.abs(Math.abs(z) - 0.0036)
    r -= 0.0012 * (1 - smooth(0.0005, 0.0009, gz)) * (Math.abs(a) < 0.6 ? 1 : 0)
    pts.push({ r, z, a })
  }
  return pts
}

// Tread normal map: one tread pitch (u) x the whole profile length (v).
let _tread = null
export function treadNormal(profileLen) {
  if (_tread) return _tread
  const W = 96, H = 768
  const h = new Float32Array(W * H)
  const pitch = 1 // normalized along u
  for (let y = 0; y < H; y++) {
    // v in metres along the profile, centred on the crown
    const vz = (y / H - 0.5) * profileLen
    const az = Math.abs(vz)
    for (let x = 0; x < W; x++) {
      const u = x / W
      let g = 0
      if (az > 0.0045 && az < 0.0128) {
        const k = u + Math.sign(vz) * (az - 0.0045) / 0.0105 * 0.9
        const f = Math.abs(k - Math.round(k)) * 0.0105
        g = Math.max(g, (1 - smooth(0.00045, 0.0009, f)) * (1 - smooth(0.0122, 0.0129, az)))
      }
      if (az > 0.0125 && az < 0.0185) {
        const k = u + 0.5
        const f = Math.abs(k - Math.round(k)) * 0.0105
        g = Math.max(g, (1 - smooth(0.0003, 0.0007, f)) * smooth(0.0125, 0.0133, az) * (1 - smooth(0.017, 0.0185, az)))
      }
      h[y * W + x] = -g
    }
  }
  void pitch
  const data = new Uint8Array(W * H * 4)
  const at = (x, y) => h[Math.min(H - 1, Math.max(0, y)) * W + ((x + W) % W)]
  const sx = 0.0013 / (0.0105 / W), sy = 0.0013 / (profileLen / H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * sx
    const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * sy
    const l = Math.hypot(dx, dy, 1)
    const i = (y * W + x) * 4
    data[i] = (-dx / l * 0.5 + 0.5) * 255
    data[i + 1] = (-dy / l * 0.5 + 0.5) * 255
    data[i + 2] = (1 / l * 0.5 + 0.5) * 255
    data[i + 3] = 255
  }
  const t = new THREE.DataTexture(data, W, H)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.ClampToEdgeWrapping
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.anisotropy = 8
  t.needsUpdate = true
  _tread = t
  return t
}

// load: the bottom of the tyre flattens into a contact patch and the
// sidewalls bulge a little around it (the bike sits `SQUASH` lower)
function deformLoad(pos, D) {
  const R = D.tyreR, sq = SQUASH
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const below = -y
    const zone = smooth(R - 0.03, R - sq * 0.5, below * (Math.cos(Math.atan2(x, -y)) > 0 ? 1 : 0))
    let ny = y
    if (below > R - sq) ny = -(R - sq) - (below - (R - sq)) * 0.08
    const bulge = zone * 0.0026 * Math.sign(z) * Math.min(1, Math.abs(z) / 0.012)
    pos.setXYZ(i, x, ny, z + bulge)
  }
}

// Moulded sidewall lettering: a band of the sidewall (between the whitewall
// and the tread shoulder), lifted 0.12 mm, textured with raised rubber
// letters (alpha-tested) that repeat twice round the tyre.
let _letterTex = null
function letteringTexture() {
  if (_letterTex) return _letterTex
  const W = 2048, H = 96
  const text = 'RONDINE  \u00b7  SUPER BALLON  \u00b7  20 \u00d7 1.75  \u00b7  47-406  \u00b7  MADE IN ITALY  \u00b7  GONFIARE A 2,5 BAR  \u00b7  '
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d')
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H)
  x.fillStyle = '#fff'
  x.textBaseline = 'middle'
  let size = 58
  x.font = `800 ${size}px "Geist Variable", "Helvetica Neue", Arial, sans-serif`
  // letter-space the line so it fills exactly one half of the circumference
  const chars = [...text]
  const widths = chars.map((ch) => x.measureText(ch).width)
  const sum = widths.reduce((a, b) => a + b, 0)
  const gap = (W - sum) / chars.length
  let px = gap / 2
  for (let i = 0; i < chars.length; i++) { x.fillText(chars[i], px, H / 2 + 2); px += widths[i] + gap }
  // soften for a moulded profile, then height -> normal, mask -> alpha
  const blur = document.createElement('canvas'); blur.width = W; blur.height = H
  const b = blur.getContext('2d')
  b.filter = 'blur(1.6px)'
  b.drawImage(c, 0, 0)
  const hd = b.getImageData(0, 0, W, H).data
  const md = x.getImageData(0, 0, W, H).data
  const nrm = x.createImageData(W, H), col = x.createImageData(W, H)
  const h = (i, j) => hd[(((j + H) % H) * W + ((i + W) % W)) * 4] / 255
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 4
    const dx = (h(i + 1, j) - h(i - 1, j)) * 1.3, dy = (h(i, j - 1) - h(i, j + 1)) * 1.3
    const l = Math.hypot(dx, dy, 1)
    nrm.data[k] = (-dx / l * 0.5 + 0.5) * 255; nrm.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; nrm.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; nrm.data[k + 3] = 255
    const a = Math.max(md[k], hd[k] * 1.6) // include the soft shoulders of each letter
    col.data[k] = 28; col.data[k + 1] = 27; col.data[k + 2] = 26; col.data[k + 3] = Math.min(255, a)
  }
  const mk = (img, srgb) => {
    const cc = document.createElement('canvas'); cc.width = W; cc.height = H
    cc.getContext('2d').putImageData(img, 0, 0)
    const t = new THREE.CanvasTexture(cc)
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping
    t.anisotropy = 8
    return t
  }
  _letterTex = { map: mk(col, true), normal: mk(nrm, false) }
  return _letterTex
}

function buildLettering(D, M, side) {
  const dense = tyreProfile(D, 900).filter((p) => p.r > 0.2352 && p.r < 0.2446 && p.z * side > 0)
  if (side < 0) dense.reverse()
  // resample the (1 cm) band to 10 rows: plenty for its gentle curvature
  const pts = []
  for (let k = 0; k < 10; k++) { const q = dense[Math.round((k / 9) * (dense.length - 1))]; pts.push({ r: q.r, z: q.z }) }
  const g = latheZ(pts, { segments: 480, rRef: D.tyreR, flip: side < 0 })
  // lift a hair off the sidewall and re-map UVs: u twice round, v across the band
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv
  let vMin = Infinity, vMax = -Infinity
  for (let i = 0; i < uv.count; i++) { vMin = Math.min(vMin, uv.getY(i)); vMax = Math.max(vMax, uv.getY(i)) }
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * 0.00012, pos.getY(i) + nor.getY(i) * 0.00012, pos.getZ(i) + nor.getZ(i) * 0.00012)
    const phi = Math.atan2(pos.getY(i), pos.getX(i))
    const u0 = uv.getX(i) / D.tyreR // phi in [0, 2pi]
    void phi
    // read left to right with the letters' tops toward the tread, on both sides
    uv.setXY(i, -side * u0 / Math.PI, 1 - (uv.getY(i) - vMin) / (vMax - vMin))
  }
  deformLoad(pos, D)
  g.computeVertexNormals()
  g.computeTangents()
  const t = letteringTexture()
  const map = t.map.clone(), normal = t.normal.clone()
  map.needsUpdate = true; normal.needsUpdate = true
  const mat = new THREE.MeshPhysicalMaterial({
    name: 'tyreLetters', color: '#ffffff', map, normalMap: normal, normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.6, alphaTest: 0.35, sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color('#3a3a3a'),
  })
  const m = part(g, mat, 'scritteGomma', { sticker: false })
  m.userData.scroll = side // texture offset sign when the wheel turns
  return m
}

export function buildTyre(D, wallHex) {
  const prof = tyreProfile(D)
  const seg = 360
  const g = latheZ(prof, { segments: seg, rRef: D.tyreR })
  const uv = g.attributes.uv, pos = g.attributes.position
  // centre v on the crown so the tread map lines up; remember profile length
  let vMin = Infinity, vMax = -Infinity
  for (let i = 0; i < uv.count; i++) { vMin = Math.min(vMin, uv.getY(i)); vMax = Math.max(vMax, uv.getY(i)) }
  const len = vMax - vMin
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) - vMin - len / 2)
  g.userData.profileLen = len
  // whitewall weights per vertex (radius based)
  const w = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i))
    const band = smooth(0.2114, 0.212, r) * (1 - smooth(0.2336, 0.2342, r))
    const stripe = smooth(0.2147, 0.215, r) * (1 - smooth(0.2157, 0.216, r))
    w[i] = band * (1 - stripe)
  }
  g.userData.bandW = w
  deformLoad(pos, D)
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 4), 4))
  recolorTyre(g, wallHex)
  g.computeVertexNormals()
  g.computeTangents()
  g.userData.wrap = [TAU * D.tyreR, 0]
  return g
}

export function recolorTyre(geo, wallHex) {
  const col = geo.attributes.color
  const wall = new THREE.Color(wallHex), black = new THREE.Color('#1b1a19')
  const w = geo.userData.bandW
  const tmp = new THREE.Color()
  for (let i = 0; i < col.count; i++) {
    tmp.copy(black).lerp(wall, w[i])
    col.setXYZW(i, tmp.r, tmp.g, tmp.b, 1)
  }
  col.needsUpdate = true
}

function rimGeo() {
  const P = [
    { r: 0.2062, z: -0.0098 }, { r: 0.2078, z: -0.0112 }, { r: 0.2066, z: -0.0122, crease: true },
    { r: 0.2010, z: -0.0124 }, { r: 0.1958, z: -0.0121 }, { r: 0.1928, z: -0.0102 },
    { r: 0.1912, z: -0.0062 }, { r: 0.1906, z: 0 }, { r: 0.1912, z: 0.0062 },
    { r: 0.1928, z: 0.0102 }, { r: 0.1958, z: 0.0121 }, { r: 0.2010, z: 0.0124 },
    { r: 0.2066, z: 0.0122, crease: true }, { r: 0.2078, z: 0.0112 }, { r: 0.2062, z: 0.0098 },
    { r: 0.2002, z: 0.0088 }, { r: 0.1985, z: 0.004 }, { r: 0.1985, z: -0.004 }, { r: 0.2002, z: -0.0088 }, { r: 0.2062, z: -0.0098 },
  ]
  return latheZ(P, { segments: 288, flip: true, rRef: 0.2 })
}

function hubGeo(rear) {
  const fl = rear ? [-0.032, 0.025] : [-0.031, 0.031]
  const P = [
    [0.0052, -0.05], { r: 0.0098, z: -0.05, crease: true }, { r: 0.0098, z: -0.044, crease: true },
    [0.0086, -0.042], [0.0092, fl[0] - 0.006], { r: 0.0105, z: fl[0] - 0.003, crease: true },
    { r: 0.0228, z: fl[0] - 0.0016 }, [0.0234, fl[0]], { r: 0.0228, z: fl[0] + 0.0016 },
    { r: 0.0118, z: fl[0] + 0.0032, crease: true }, [0.0132, fl[0] + 0.012], [0.014, (fl[0] + fl[1]) / 2], [0.0132, fl[1] - 0.012],
    { r: 0.0118, z: fl[1] - 0.0032, crease: true }, { r: 0.0228, z: fl[1] - 0.0016 }, [0.0234, fl[1]],
    { r: 0.0228, z: fl[1] + 0.0016 }, { r: 0.0105, z: fl[1] + 0.003, crease: true }, [0.0092, fl[1] + 0.006],
    [0.0086, 0.042], { r: 0.0098, z: 0.044, crease: true }, { r: 0.0098, z: 0.05, crease: true }, [0.0052, 0.05],
  ]
  return { geo: latheZ(P, { segments: 72 }), flanges: fl }
}

// 36 spokes, 3-cross, alternating leading/trailing, rim holes offset L/R.
function spokeGeos(flanges) {
  const spokes = [], heads = [], nipples = []
  const nPer = 18, cross = 3
  const rHub = 0.0192, rRim = 0.1918
  for (let side = 0; side < 2; side++) {
    const zf = flanges[side]
    for (let j = 0; j < nPer; j++) {
      const ah = (j / nPer) * TAU + side * (TAU / 36)
      const dir = j % 2 === 0 ? 1 : -1
      const ar = ah + dir * cross * (TAU / nPer)
      const zr = (side ? 1 : -1) * 0.0022
      const a = v3(Math.cos(ah) * rHub, Math.sin(ah) * rHub, zf)
      const b = v3(Math.cos(ar) * rRim, Math.sin(ar) * rRim, zr)
      spokes.push(rod(a, b, 0.00092, { radial: 6, caps: 'none' }))
      heads.push(rod(a, a.clone().add(v3(0, 0, side ? 0.0026 : -0.0026)), 0.0016, { radial: 8 }))
      const d = b.clone().sub(a).normalize()
      nipples.push(rod(b.clone().addScaledVector(d, -0.0105), b.clone().addScaledVector(d, 0.0012), 0.00175, { radial: 8 }))
    }
  }
  return { spokes: merge([...spokes, ...heads]), nipples: merge(nipples) }
}

export function buildWheel(D, M, { rear = false, wallHex = '#e8e1cf', name = 'ruota' } = {}) {
  const tyreGeo = buildTyre(D, wallHex)
  if (!M.tyre.normalMap || M.tyre.normalMap !== treadNormal(tyreGeo.userData.profileLen)) {
    const t = treadNormal(tyreGeo.userData.profileLen)
    const pitches = 152
    t.repeat.set(pitches / (TAU * D.tyreR), 1 / tyreGeo.userData.profileLen)
    t.offset.set(0, 0.5)
    M.tyre.normalMap = t
    M.tyre.normalScale = new THREE.Vector2(1, 1)
    M.tyre.needsUpdate = true
  }
  const tyre = part(tyreGeo, M.tyre, name + 'Gomma', { label: 'Gomma' })
  const rim = part(rimGeo(), M.chrome, name + 'Cerchio', { label: 'Cerchio' })
  const { geo: hub, flanges } = hubGeo(rear)
  const hubM = part(hub, M.chrome, name + 'Mozzo', { sticker: false })
  const { spokes, nipples } = spokeGeos(flanges)
  const spokesM = part(spokes, M.chrome, name + 'Raggi', { sticker: false })
  const nipM = part(nipples, M.chromeSoft, name + 'Nippli', { sticker: false })
  const va = TAU * 0.25 + TAU / 72
  const vdir = v3(Math.cos(va), Math.sin(va), 0)
  const valve = part(rod(vdir.clone().multiplyScalar(0.1935), vdir.clone().multiplyScalar(0.176), 0.0031, { radial: 12 }), M.brass, name + 'Valvola', { sticker: false })
  const cap = part(rod(vdir.clone().multiplyScalar(0.1765), vdir.clone().multiplyScalar(0.165), 0.0038, { radial: 12, caps: 'round' }), M.plasticBlack, name + 'Tappo', { sticker: false })
  // the tyre stays put (its contact patch must stay on the ground); everything
  // else turns inside `spin`, and the tread texture scrolls to match
  const spin = group(name + 'Spin', rim, hubM, spokesM, nipM, valve, cap)
  const letters = [buildLettering(D, M, 1), buildLettering(D, M, -1)]
  const g = group(name, tyre, spin, ...letters)
  g.userData.letters = letters
  g.userData.tyre = tyre
  g.userData.spin = spin
  g.userData.flanges = flanges
  void DEG
  return g
}
