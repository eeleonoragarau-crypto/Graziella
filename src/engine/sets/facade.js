// Palazzi for la città: one building front from a small spec. Geometry is
// built in the facade frame (u along the front, left to right seen from the
// street; v up; w out of the wall) and collected per material in a Kit, so a
// whole street is a handful of draw calls.
//
// What makes a front read as real is mostly depth and dirt: window reveals as
// deep as the wall, louvred shutters that cast their own shadows, sills and
// string courses that catch the raking sun, damp rising from the pavement and
// rain streaks under every sill (vertex colours, RGBA for the path tracer).
import * as THREE from 'three'
import { quad, box, merge, cylinder, extrudeProfile, v3, rng } from './build.js'

export class Kit {
  constructor() { this.parts = new Map() }
  add(key, geo, m) {
    if (!geo) return
    if (m) geo.applyMatrix4(m)
    if (!this.parts.has(key)) this.parts.set(key, [])
    this.parts.get(key).push(geo)
  }
  // merge everything into meshes: mats[key] or mats[key.split(':')[0]]
  meshes(mats) {
    const out = []
    for (const [key, list] of this.parts) {
      const mat = mats[key] || mats[key.split(':')[0]]
      if (!mat) { console.warn('no material for', key); continue }
      const g = merge(list)
      const m = new THREE.Mesh(g, mat)
      m.name = key
      m.castShadow = m.receiveShadow = true
      out.push(m)
    }
    return out
  }
}

// local (u, v, w) -> world
// (u, v = w x u, w) must be right-handed with v up, i.e. u runs left to right
// for someone looking at the front from the street
export function frame(origin, uDir, wDir) {
  const u = uDir.clone().normalize(), w = wDir.clone().normalize(), v = new THREE.Vector3().crossVectors(w, u)
  if (v.y < 0.99) console.warn('facade frame is not upright', u, w)
  return new THREE.Matrix4().makeBasis(u, v, w).setPosition(origin)
}

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }

function hash2(x, y, s) {
  let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + s * 982451653) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s)
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 3) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 7) * 0.15

// Wall of width W, height H with rectangular holes, on a uniform grid (no
// T-junctions), vertex colour from dirt(u, v) -> [r, g, b].
function wallGeo(W, H, holes, dirt, { cell = 0.25, uv0 = 0 } = {}) {
  const xs = new Set([0, W]), ys = new Set([0, H])
  for (let x = cell; x < W - 1e-6; x += cell) xs.add(+x.toFixed(4))
  for (let y = cell; y < H - 1e-6; y += cell) ys.add(+y.toFixed(4))
  for (const h of holes) { xs.add(h.u0); xs.add(h.u1); ys.add(h.v0); ys.add(h.v1) }
  const X = [...xs].filter((x) => x >= 0 && x <= W).sort((a, b) => a - b)
  const Y = [...ys].filter((y) => y >= 0 && y <= H).sort((a, b) => a - b)
  const inHole = (u, v) => holes.some((h) => u > h.u0 && u < h.u1 && v > h.v0 && v < h.v1)
  const P = [], N = [], UV = [], C = [], I = []
  const idx = new Map()
  const vert = (i, j) => {
    const k = i * 100000 + j
    if (idx.has(k)) return idx.get(k)
    const u = X[i], v = Y[j]
    P.push(u, v, 0); N.push(0, 0, 1); UV.push(u + uv0, v)
    const c = dirt(u, v); C.push(c[0], c[1], c[2], 1)
    const n = P.length / 3 - 1
    idx.set(k, n)
    return n
  }
  for (let i = 0; i < X.length - 1; i++) {
    for (let j = 0; j < Y.length - 1; j++) {
      const uc = (X[i] + X[i + 1]) / 2, vc = (Y[j] + Y[j + 1]) / 2
      if (inHole(uc, vc)) continue
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1)
      I.push(a, b, d, a, d, c)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4))
  g.setIndex(I)
  return g
}

// the four inner faces of an opening, `d` deep (reveal), facing into the hole
function reveal(h, d, { bottom = true } = {}) {
  const gs = [
    quad(v3(h.u0, h.v0, 0), v3(0, 0, -1), v3(0, 1, 0), d, h.v1 - h.v0, { uv0: [0, h.v0] }), // left jamb, faces +u
    quad(v3(h.u1, h.v0, -d), v3(0, 0, 1), v3(0, 1, 0), d, h.v1 - h.v0, { uv0: [0, h.v0] }), // right jamb, faces -u
    quad(v3(h.u0, h.v1, -d), v3(1, 0, 0), v3(0, 0, 1), h.u1 - h.u0, d, { uv0: [h.u0, 0] }), // head, faces -v
  ]
  if (bottom) gs.push(quad(v3(h.u0, h.v0, 0), v3(1, 0, 0), v3(0, 0, -1), h.u1 - h.u0, d, { uv0: [h.u0, 0] })) // bottom, faces +v
  return merge(gs)
}

// A louvred shutter leaf, hinge at the origin, extending to +x (sign = 1) or
// -x (sign = -1), height H, thickness t (z centred on 0).
function shutterLeaf(Wl, H, sign, { slat = 0.042, t = 0.034 } = {}) {
  const gs = []
  const x0 = sign > 0 ? 0 : -Wl, x1 = sign > 0 ? Wl : 0
  const st = 0.052, rail = 0.07
  gs.push(box([x0, 0, -t / 2], [x0 + st, H, t / 2]), box([x1 - st, 0, -t / 2], [x1, H, t / 2]))
  gs.push(box([x0 + st, 0, -t / 2], [x1 - st, rail * 1.4, t / 2]), box([x0 + st, H - rail, -t / 2], [x1 - st, H, t / 2]))
  const mid = H * 0.48
  gs.push(box([x0 + st, mid - rail * 0.5, -t / 2], [x1 - st, mid + rail * 0.5, t / 2]))
  // louvres: thin boards tilted ~50 degrees, front edge down
  const lx0 = x0 + st - 0.004, lx1 = x1 - st + 0.004
  const L = lx1 - lx0
  const tilt = THREE.MathUtils.degToRad(50)
  const slab = box([0, -0.0035, -0.023], [L, 0.0035, 0.023])
  const rot = new THREE.Matrix4().makeRotationX(tilt)
  const place = (y0, y1) => {
    const n = Math.floor((y1 - y0) / slat)
    for (let i = 0; i < n; i++) {
      const y = y0 + (i + 0.5) * ((y1 - y0) / n)
      const g = slab.clone().applyMatrix4(rot).applyMatrix4(new THREE.Matrix4().makeTranslation(lx0, y, 0))
      gs.push(g)
    }
  }
  place(rail * 1.4, mid - rail * 0.5)
  place(mid + rail * 0.5, H - rail)
  return merge(gs)
}

// A window: reveal, frame with two sashes, glass, stone sill, shutters.
// h = { u0, u1, v0, v1 } in the facade frame. state: 'open' | 'closed' | 'ajar'
function windowUnit(kit, h, o, R) {
  const depth = o.depth ?? 0.26
  const Wd = h.u1 - h.u0, Hh = h.v1 - h.v0
  kit.add(o.revealKey, reveal(h, depth, { bottom: !o.balconyDoor && !o.noSillReveal }))
  // frame (painted wood), set 12 cm in
  const fz = -0.13, ft = 0.055, fw = 0.06
  const fr = [
    box([h.u0, h.v0, fz - ft], [h.u0 + fw, h.v1, fz]), box([h.u1 - fw, h.v0, fz - ft], [h.u1, h.v1, fz]),
    box([h.u0 + fw, h.v1 - fw, fz - ft], [h.u1 - fw, h.v1, fz]), box([h.u0 + fw, h.v0, fz - ft], [h.u1 - fw, h.v0 + fw * 1.2, fz]),
    box([(h.u0 + h.u1) / 2 - 0.035, h.v0 + fw, fz - ft], [(h.u0 + h.u1) / 2 + 0.035, h.v1 - fw, fz]),
  ]
  // a transom in tall windows
  if (Hh > 1.6) fr.push(box([h.u0 + fw, h.v1 - 0.42, fz - ft], [h.u1 - fw, h.v1 - 0.36, fz]))
  kit.add(o.frameKey, merge(fr))
  kit.add(o.glassKey, quad(v3(h.u0 + fw, h.v0 + fw, fz - ft * 0.5), v3(1, 0, 0), v3(0, 1, 0), Wd - 2 * fw, Hh - 2 * fw))
  // dark room behind the glass (read through the panes' reflections)
  kit.add('interior', quad(v3(h.u0 - 0.2, h.v0 - 0.1, -1.4), v3(1, 0, 0), v3(0, 1, 0), Wd + 0.4, Hh + 0.2))
  // stone sill
  if (!o.balconyDoor) {
    kit.add('stone', box([h.u0 - 0.07, h.v0 - 0.055, -0.02], [h.u1 + 0.07, h.v0, 0.045]))
  }
  // shutters
  if (o.shutters !== false) {
    const state = o.state
    const Wl = Wd / 2
    const ang = state === 'closed' ? 0 : state === 'open' ? 178 : 105 + R() * 45
    for (const sign of [1, -1]) {
      const leaf = shutterLeaf(Wl + 0.004, Hh - 0.01, sign, { slat: o.slat ?? 0.042 })
      // closed leaves sit in the opening just behind the face; open ones fold back flat onto the wall
      const a = THREE.MathUtils.degToRad(sign > 0 ? -ang : ang)
      const hx = sign > 0 ? h.u0 : h.u1
      const hz = state === 'closed' ? -0.045 : 0.0
      const m = new THREE.Matrix4().makeTranslation(hx, h.v0 + 0.005, hz).multiply(new THREE.Matrix4().makeRotationY(a))
      // (leaf space z flips to the street side once the leaf is swung round)
      if (state !== 'closed') m.multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.019))
      kit.add(o.shutterKey, leaf.applyMatrix4(m))
    }
    // hinges and the little shutter stops on the wall
    if (state !== 'closed') {
      for (const u of [h.u0 - Wl - 0.03, h.u1 + Wl + 0.03]) kit.add('iron', box([u - 0.012, h.v0 + Hh * 0.3, 0], [u + 0.012, h.v0 + Hh * 0.3 + 0.07, 0.03]))
    }
  }
}

// Balcony: slab on corbels + wrought-iron railing, in front of a French window.
function balcony(kit, u0, u1, v, depth = 0.78) {
  kit.add('stone', box([u0, v - 0.1, 0], [u1, v, depth]))
  kit.add('stone', box([u0 - 0.03, v - 0.13, depth - 0.03], [u1 + 0.03, v - 0.08, depth + 0.02]))
  for (const u of [u0 + 0.15, u1 - 0.15]) {
    kit.add('stone', extrudeProfile([[0, 0], [0.12, 0], [0.12, -0.08], [0.04, -0.34], [0, -0.34]], v3(u - 0.07, v - 0.1, 0), v3(0, 0, 1), v3(0, 1, 0), v3(1, 0, 0), 0.14))
  }
  const top = v + 1.0
  const rails = []
  const d = depth - 0.05
  // top and bottom rails round the three sides
  const path = [[u0 + 0.05, 0.03], [u0 + 0.05, d], [u1 - 0.05, d], [u1 - 0.05, 0.03]]
  for (let k = 0; k < 3; k++) {
    const [a0, b0] = path[k], [a1, b1] = path[k + 1]
    for (const [y, r] of [[top, 0.018], [v + 0.1, 0.012]]) rails.push(cylinder(v3(a0, y, b0), v3(a1, y, b1), r, { radial: 8 }))
    const len = Math.hypot(a1 - a0, b1 - b0), n = Math.max(1, Math.round(len / 0.115))
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a0 + (a1 - a0) * t, b = b0 + (b1 - b0) * t
      rails.push(cylinder(v3(a, v, b), v3(a, top, b), 0.0075, { radial: 6, caps: false }))
    }
  }
  // a band of scrolls: a second bottom rail and simple arcs
  kit.add('iron', merge(rails))
}

// Wooden entrance door (portone) in a stone surround, recessed in its opening.
function portone(kit, h, o) {
  const d = 0.3
  kit.add(o.revealKey, reveal(h, d, { bottom: false }))
  const sw = 0.2
  // stone surround proud of the wall
  kit.add('stone', merge([
    box([h.u0 - sw, 0, 0], [h.u0, h.v1 + 0.02, 0.04]),
    box([h.u1, 0, 0], [h.u1 + sw, h.v1 + 0.02, 0.04]),
    box([h.u0 - sw - 0.04, h.v1, 0], [h.u1 + sw + 0.04, h.v1 + 0.24, 0.06]),
    box([h.u0 - sw - 0.08, h.v1 + 0.24, 0], [h.u1 + sw + 0.08, h.v1 + 0.3, 0.1]),
  ]))
  // threshold step
  kit.add('stone', box([h.u0 - 0.05, 0, -d], [h.u1 + 0.05, 0.12, 0.08]))
  // two leaves with raised panels
  const z = -d + 0.06
  const mid = (h.u0 + h.u1) / 2
  const leaves = []
  for (const [a, b] of [[h.u0 + 0.01, mid - 0.004], [mid + 0.004, h.u1 - 0.01]]) {
    leaves.push(box([a, 0.12, z - 0.06], [b, h.v1 - 0.01, z]))
    const pw = (b - a) - 0.2
    for (const [p0, p1] of [[0.35, 1.25], [1.45, 2.35], [2.55, h.v1 - 0.25]]) {
      if (p1 - p0 < 0.25) continue
      leaves.push(box([a + 0.1, p0, z], [a + 0.1 + pw, p1, z + 0.022]))
      leaves.push(box([a + 0.14, p0 + 0.04, z + 0.022], [a + 0.06 + pw, p1 - 0.04, z + 0.034]))
    }
  }
  kit.add(o.doorKey || 'door', merge(leaves))
  // brass knob and knocker
  kit.add('brass', merge([
    cylinder(v3(mid - 0.07, 1.1, z), v3(mid - 0.07, 1.1, z + 0.06), 0.022, { radial: 12 }),
    cylinder(v3(mid + 0.07, 1.1, z), v3(mid + 0.07, 1.1, z + 0.06), 0.022, { radial: 12 }),
    cylinder(v3(mid - 0.07, 1.55, z + 0.02), v3(mid + 0.07, 1.55, z + 0.02), 0.012, { radial: 8 }),
  ]))
}

// Shop front: opening with a roller shutter (up to `raised`), its box, a sign.
function shopFront(kit, h, o) {
  const d = 0.22
  kit.add(o.revealKey, reveal(h, d, { bottom: false }))
  const top = h.v1
  const raised = o.raised ?? 0
  // the shutter, flush with the outer face of the reveal
  const yS = h.v0 + raised
  if (top - yS > 0.02) kit.add('shutterShop', quad(v3(h.u0, yS, -0.05), v3(1, 0, 0), v3(0, 1, 0), h.u1 - h.u0, top - yS, { uv0: [h.u0, yS] }))
  kit.add('iron', merge([
    box([h.u0 - 0.035, 0, -0.07], [h.u0, top, -0.02]), box([h.u1, 0, -0.07], [h.u1 + 0.035, top, -0.02]),
    box([h.u0, yS, -0.075], [h.u1, yS + 0.05, -0.03]),
  ]))
  // shop window behind when raised
  if (raised > 0.3) {
    kit.add('glass', quad(v3(h.u0 + 0.08, h.v0 + 0.5, -d + 0.02), v3(1, 0, 0), v3(0, 1, 0), h.u1 - h.u0 - 0.16, Math.min(raised, top - h.v0) - 0.5))
    kit.add('frame:shop', box([h.u0, h.v0, -d], [h.u1, h.v0 + 0.5, -d + 0.05]))
  }
  kit.add(o.lit ? 'barGlow' : 'interior', quad(v3(h.u0 - 0.2, h.v0, -1.6), v3(1, 0, 0), v3(0, 1, 0), h.u1 - h.u0 + 0.4, top - h.v0))
  // sign board above
  if (o.sign) {
    const sw = Math.min(h.u1 - h.u0 + 0.2, 3.4)
    const cu = (h.u0 + h.u1) / 2
    kit.add('signFrame', box([cu - sw / 2 - 0.03, top + 0.12, 0], [cu + sw / 2 + 0.03, top + 0.7, 0.05]))
    const g = quad(v3(cu - sw / 2, top + 0.15, 0.052), v3(1, 0, 0), v3(0, 1, 0), sw, 0.52)
    // sign art is a texture: UVs 0..1
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i)) / sw, uv.getY(i) / 0.52)
    kit.add('sign:' + o.sign, g)
  }
}

// Ground-floor window with an iron grate.
function gratedWindow(kit, h, o) {
  windowUnit(kit, h, { ...o, shutters: false })
  const bars = []
  const z = 0.035
  const n = Math.round((h.u1 - h.u0) / 0.12)
  for (let i = 0; i <= n; i++) {
    const u = h.u0 + 0.02 + (i / n) * (h.u1 - h.u0 - 0.04)
    bars.push(cylinder(v3(u, h.v0 - 0.08, z), v3(u, h.v1 + 0.08, z), 0.009, { radial: 6 }))
  }
  for (const v of [h.v0 + 0.18, (h.v0 + h.v1) / 2, h.v1 - 0.12]) bars.push(box([h.u0 - 0.04, v - 0.02, z - 0.012], [h.u1 + 0.04, v + 0.02, z + 0.012]))
  kit.add('iron', merge(bars))
}

// String course / cornice profiles (w out, v up), extruded along u.
function cornice(kit, key, u0, u1, v, profile) {
  kit.add(key, extrudeProfile(profile.map(([w, dv]) => [w, v + dv]), v3(u0, 0, 0), v3(0, 0, 1), v3(0, 1, 0), v3(1, 0, 0), u1 - u0))
}
const STRING = [[0, -0.06], [0.05, -0.06], [0.05, -0.03], [0.08, 0.0], [0.08, 0.05], [0.0, 0.05]]
const CORNICIONE = [[0, -0.62], [0.05, -0.62], [0.05, -0.55], [0.1, -0.5], [0.14, -0.42], [0.24, -0.34], [0.36, -0.26], [0.46, -0.18], [0.5, -0.12], [0.5, 0], [0, 0]]

// ---------------------------------------------------------------------------------
// A building front. spec:
//   width, floors: [h0, h1, ...] (h0 = ground floor), plaster key, shutterKey,
//   bays: [u centre ...] (window axes), ground: [{ type, u0, u1, ... }],
//   balconies: [{ floor, bay }], seed, dirt, base (stone base height), detail (0..1)
// ---------------------------------------------------------------------------------
export function buildFront(kit, spec, M) {
  const R = rng(spec.seed || 1)
  const W = spec.width
  const floors = spec.floors
  const H = floors.reduce((a, b) => a + b, 0)
  const wallKey = 'wall:' + spec.plaster
  const revealKey = 'reveal:' + spec.plaster
  const shutterKey = 'shutter:' + (spec.shutter || 'verde')
  const frameKey = 'frame:' + (spec.frame || 'bianco')
  const glassKey = 'glass'
  const holes = []
  const add = (k, g) => kit.add(k, g, M)
  const local = new Kit()
  const ladd = (k, g) => local.add(k, g)
  const L = { add: ladd }

  // ground floor openings
  for (const gr of spec.ground || []) {
    const h = { u0: gr.u0, u1: gr.u1, v0: gr.v0 ?? 0, v1: gr.v1 ?? 2.9 }
    holes.push(h)
    if (gr.type === 'portone') portone(L, h, { revealKey, doorKey: 'door:' + (gr.color || 'verde') })
    else if (gr.type === 'shop') shopFront(L, h, { revealKey, raised: gr.raised, sign: gr.sign, lit: gr.lit })
    else if (gr.type === 'grata') gratedWindow(L, h, { revealKey, frameKey, glassKey, shutterKey, depth: 0.28 })
  }
  // upper floors
  const sills = []
  let v = floors[0]
  for (let f = 1; f < floors.length; f++) {
    const fh = floors[f]
    for (let b = 0; b < spec.bays.length; b++) {
      const uc = spec.bays[b]
      const bal = (spec.balconies || []).some((x) => x.floor === f && x.bay === b)
      const ww = spec.winW ?? 1.18
      const h = bal
        ? { u0: uc - ww / 2, u1: uc + ww / 2, v0: v + 0.02, v1: v + Math.min(2.55, fh - 0.55) }
        : { u0: uc - ww / 2, u1: uc + ww / 2, v0: v + 0.92, v1: v + Math.min(0.92 + (spec.winH ?? 1.62), fh - 0.4) }
      holes.push(h)
      const r = R()
      const state = spec.shutters?.[f]?.[b] || (r < 0.34 ? 'closed' : r < 0.8 ? 'open' : 'ajar')
      windowUnit(L, h, { revealKey, frameKey, glassKey, shutterKey, state, balconyDoor: bal, slat: spec.slat }, R)
      if (bal) balcony(L, h.u0 - 0.35, h.u1 + 0.35, v + 0.02)
      else sills.push([h.u0, h.u1, h.v0])
    }
    // string course at the floor line
    if (spec.strings !== false) cornice(L, 'cornice:' + spec.plaster, -0.02, W + 0.02, v - 0.02, STRING)
    v += fh
  }
  // crowning cornice + gutter + a roof going back
  cornice(L, 'cornice:' + spec.plaster, -0.03, W + 0.03, H + 0.12, CORNICIONE)
  const gut = []
  gut.push(cylinder(v3(-0.05, H + 0.16, 0.56), v3(W + 0.05, H + 0.16, 0.56), 0.065, { radial: 12 }))
  add('metal', merge(gut).applyMatrix4(new THREE.Matrix4()))
  const roofDepth = spec.depth ?? 9
  const roof = quad(v3(-0.05, H + 0.1, 0.6), v3(1, 0, 0), new THREE.Vector3(0, 0.42, -1).normalize(), W + 0.1, roofDepth * 0.55 / 0.92)
  kit.add('roof', roof, M)

  // stone base course along the ground floor, broken by the openings
  const baseH = spec.base ?? 0.92
  if (baseH > 0) {
    const cuts = (spec.ground || []).filter((g) => (g.v0 ?? 0) < baseH).map((g) => [g.u0 - (g.type === 'portone' ? 0.2 : 0.035), g.u1 + (g.type === 'portone' ? 0.2 : 0.035)]).sort((a, b) => a[0] - b[0])
    let u = 0
    const segs = []
    for (const [a, b] of cuts) { if (a > u) segs.push([u, a]); u = Math.max(u, b) }
    if (u < W) segs.push([u, W])
    for (const [a, b] of segs) {
      if (b - a < 0.02) continue
      ladd('stone', box([a, 0, 0], [b, baseH, 0.028]))
      ladd('stone', box([a, baseH, 0], [b, baseH + 0.04, 0.045]))
    }
  }

  // dirt: rising damp, streaks under sills, soot under the cornice, blotches
  const seed = spec.seed || 1
  const damp = spec.damp ?? 1
  const dirt = (u, vv) => {
    let k = 0.96 + (fbm(u * 0.35, vv * 0.35, seed) - 0.5) * 0.24
    // patches of newer plaster: soft-edged blotches a shade lighter or darker
    const pn = fbm(u * 0.9 + 17.3, vv * 0.9 + 3.1, seed + 23)
    const patch = sstep(0.6, 0.68, pn)
    k *= 1 + patch * (hash2(Math.floor(u * 0.9 + pn * 3), Math.floor(vv * 0.9), seed) < 0.5 ? 0.07 : -0.06)
    // rising damp: a darker, cooler band above the stone base with a ragged edge
    const edge = baseH + 0.45 + (fbm(u * 1.3, 3.1, seed + 11) - 0.5) * 0.55
    const dmp = (1 - sstep(edge - 0.25, edge + 0.05, vv)) * damp
    k *= 1 - 0.2 * dmp
    // soot under the cornice
    k *= 1 - 0.14 * sstep(H - 1.4, H - 0.05, vv)
    // rain streaks from each sill's ends and middle
    let s = 0
    for (const [a, b, sv] of sills) {
      if (vv > sv || vv < sv - 2.2) continue
      const len = 0.6 + hash2(a * 7, sv * 3, seed) * 1.5
      const t = (sv - vv) / len
      if (t > 1) continue
      for (const us of [a + 0.03, (a + b) / 2 + (hash2(a, b, seed) - 0.5) * 0.2, b - 0.03]) {
        const wdt = 0.05 + 0.06 * t
        s = Math.max(s, Math.exp(-(((u - us) / wdt) ** 2)) * (1 - t) * (0.6 + 0.4 * vnoise(u * 12, vv * 1.5, seed + 5)))
      }
    }
    k *= 1 - 0.22 * s
    const warm = 1 - 0.06 * dmp
    return [k * warm, k * (1 - 0.02 * dmp), k * (1 + 0.02 * dmp)]
  }
  ladd(wallKey, wallGeo(W, H, holes, dirt, { cell: spec.cell ?? 0.25, uv0: spec.uv0 ?? 0 }))

  // downpipes at the building's edges
  for (const u of spec.pipes || []) {
    const pg = []
    pg.push(cylinder(v3(u, 0.12, 0.09), v3(u, H + 0.1, 0.09), 0.048, { radial: 12 }))
    pg.push(cylinder(v3(u, H + 0.1, 0.09), v3(u, H + 0.16, 0.5), 0.045, { radial: 12 }))
    pg.push(cylinder(v3(u, 0.12, 0.09), v3(u, 0.02, 0.2), 0.05, { radial: 12 }))
    for (let y = 1.2; y < H; y += 2.1) pg.push(box([u - 0.06, y, 0], [u + 0.06, y + 0.035, 0.1]))
    ladd('metal', merge(pg))
  }

  // put everything in the world
  for (const [k, list] of local.parts) for (const g of list) kit.add(k, g, M)
  return { height: H, holes }
}
