// Sprung leather saddle ("sella molleggiata") on a tall chrome seatpost.
// The leather is a real shell with thickness: a crowned top with an embossed
// border line rolls over into a skirt that flares at the back; the skirt's
// bottom edge is rounded and turns into the suede underside. Inside the rear
// skirt sits a steel cantle plate (the copper rivets go through it), the two
// coil springs push against it, and a wire frame runs to a nose bolt.
import * as THREE from 'three'
import { tube, latheZ, merge, rod, spline, xf, basisZ, v3, TAU, orientOutward } from '../geo.js'
import { part } from './part.js'
import { hexNut } from './frame.js'

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// plan outline: x in [-L1 (tail), L0 (nose)], returns half width
function halfWidth(x, L0, L1) {
  const u = (x + L1) / (L0 + L1) // 0 tail .. 1 nose
  const Wr = 0.119, Wn = 0.027
  const t = Math.min(1, Math.max(0, (u - 0.13) / 0.66))
  const s = Math.pow(t * t * (3 - 2 * t), 0.82)
  const body = Wn + (Wr - Wn) * (1 - s)
  const tail = u < 0.15 ? Math.sqrt(Math.max(0, 1 - Math.pow((0.15 - u) / 0.15, 2))) : 1
  const nose = u > 0.93 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.93) / 0.07, 2))) : 1
  return Math.max(1e-4, body * tail * nose)
}

export function buildSaddle(D, M) {
  const out = []
  const clamp = D.bb.clone().addScaledVector(D.seatDir, 0.556)
  const post = tube(new THREE.LineCurve3(D.stTop.clone().addScaledVector(D.seatDir, -0.08), clamp.clone().addScaledVector(D.seatDir, 0.004)), { radius: D.postR, tubular: 1, radial: 32, caps: 'flat' })
  out.push(part(post, M.chrome, 'reggisella', { label: 'Reggisella' }))

  const L0 = 0.143, L1 = 0.121
  const cx = clamp.x - 0.006
  const topY = clamp.y + 0.074
  const th = 0.0048          // leather thickness
  const edgeR = 0.0068       // roll of the top edge
  const crown = (x, z, w) => {
    const u = (x + L1) / (L0 + L1)
    const zz = z / Math.max(0.02, w)
    const lateral = -0.0105 * zz * zz * (0.55 + 0.45 * (1 - u))
    const long = 0.0045 * (1 - smooth(0.02, 0.45, u)) - 0.0032 * Math.exp(-Math.pow((u - 0.6) / 0.22, 2)) + 0.0022 * smooth(0.72, 1, u)
    return lateral + long
  }
  const skirtDepth = (a) => { const back = 0.5 - 0.5 * Math.cos(a); return 0.012 + 0.012 * Math.pow(back, 1.6) } // 12 mm nose, 24 mm tail
  const flare = (a) => { const back = 0.5 - 0.5 * Math.cos(a); return 0.0012 + 0.0032 * back }
  const outline = (a) => {
    const c = Math.cos(a), s = Math.sin(a)
    const x = c >= 0 ? c * L0 : c * L1
    const w = halfWidth(x, L0, L1)
    const z = Math.sign(s) * Math.pow(Math.abs(s), 0.72) * w
    const len = Math.hypot(x, z) || 1
    return { x, z, w, len, nx: x / len, nz: z / len }
  }
  // top rows: fractions inside, then distances from the edge (embossed line at 5 mm)
  const FRAC = [0, 0.18, 0.36, 0.52, 0.65, 0.75, 0.83]
  const EDGE = [0.02, 0.013, 0.0092, 0.0068, 0.0058, 0.0052, 0.0047, 0.0041, 0.0033, 0.0022, 0.001, 0]
  const groove = (d) => -0.0006 * Math.exp(-Math.pow((d - 0.005) / 0.0007, 2))
  const NA = 176, NROLL = 8, NSK = 6, NRIM = 7

  // --- outer shell: top, roll, skirt, rounded bottom edge ------------------
  const colsO = []
  for (let i = 0; i <= NA; i++) {
    const a = (i / NA) * TAU
    const o = outline(a)
    const col = []
    const ex = o.x - o.nx * edgeR, ez = o.z - o.nz * edgeR       // top edge (plan), before the roll
    const eLen = Math.hypot(ex, ez)
    const hEdge = topY + crown(ex, ez, halfWidth(ex, L0, L1))
    // top
    const ts = []
    for (const f of FRAC) ts.push(f)
    for (const d of EDGE) ts.push(Math.max(ts[ts.length - 1] + 1e-4, 1 - d / Math.max(eLen, 1e-4)))
    for (const t0 of ts) {
      const t = Math.min(1, t0)
      const px = ex * t, pz = ez * t
      const d = (1 - t) * eLen
      const y = topY + crown(px, pz, halfWidth(px, L0, L1)) + groove(d) * smooth(0.02, 0.05, eLen)
      col.push({ p: [cx + px, y, pz], uv: [px, pz] })
    }
    // roll
    for (let k = 1; k <= NROLL; k++) {
      const q = (k / NROLL) * (Math.PI / 2)
      const off = Math.sin(q) * edgeR
      const y = hEdge - edgeR + Math.cos(q) * edgeR
      const dist = q * edgeR
      col.push({ p: [cx + ex + o.nx * off, y, ez + o.nz * off], uv: [ex + o.nx * dist, ez + o.nz * dist] })
    }
    // skirt (leans out a little as it drops)
    const sd = skirtDepth(a), fl = flare(a)
    const ySkTop = hEdge - edgeR
    for (let k = 1; k <= NSK; k++) {
      const t = k / NSK
      const off = edgeR + fl * t
      const dist = (Math.PI / 2) * edgeR + sd * t
      col.push({ p: [cx + ex + o.nx * off, ySkTop - sd * t, ez + o.nz * off], uv: [ex + o.nx * dist, ez + o.nz * dist] })
    }
    // rounded bottom edge: half turn from the outer to the inner face
    const yb = ySkTop - sd
    const offB = edgeR + fl - th / 2
    for (let k = 1; k <= NRIM; k++) {
      const psi = (k / NRIM) * Math.PI
      const off = offB + Math.cos(psi) * th / 2
      const dist = (Math.PI / 2) * edgeR + sd + psi * th / 2
      col.push({ p: [cx + ex + o.nx * off, yb - Math.sin(psi) * th / 2, ez + o.nz * off], uv: [ex + o.nx * dist, ez + o.nz * dist] })
    }
    colsO.push(col)
  }
  const outer = gridFromColumns(colsO)
  orientOutward(outer, new THREE.Vector3(cx, topY - 0.012, 0))
  outer.computeVertexNormals()
  seamNormals(outer, NA, colsO[0].length)
  outer.computeTangents()
  const shell = part(outer, M.leather, 'sella', { label: 'Sella' })
  out.push(shell)

  // --- inner surface: inner skirt, inner roll, suede underside ----------------
  const colsI = []
  for (let i = 0; i <= NA; i++) {
    const a = (i / NA) * TAU
    const o = outline(a)
    const ex = o.x - o.nx * edgeR, ez = o.z - o.nz * edgeR
    const hEdge = topY + crown(ex, ez, halfWidth(ex, L0, L1))
    const sd = skirtDepth(a), fl = flare(a)
    const ySkTop = hEdge - edgeR
    const col = []
    // inner skirt, bottom -> top
    for (let k = NSK; k >= 0; k--) {
      const t = k / NSK
      const off = edgeR + fl * t - th
      col.push({ p: [cx + ex + o.nx * off, ySkTop - sd * t, ez + o.nz * off], uv: [30 + a, -t * sd] })
    }
    // inner roll (radius edgeR - th), vertical -> horizontal
    const ri = edgeR - th
    for (let k = NROLL - 1; k >= 0; k--) {
      const q = (k / NROLL) * (Math.PI / 2)
      const off = Math.sin(q) * ri
      col.push({ p: [cx + ex + o.nx * off, hEdge - edgeR + Math.cos(q) * ri, ez + o.nz * off], uv: [30 + a, 0.004 + (1 - k / NROLL) * 0.004] })
    }
    // underside, edge -> centre
    for (let k = FRAC.length - 1; k >= 0; k--) {
      const t = FRAC[k]
      const px = ex * t, pz = ez * t
      col.push({ p: [cx + px, topY + crown(px, pz, halfWidth(px, L0, L1)) - th, pz], uv: [30 + a, 0.01 + (1 - t) * 0.1] })
    }
    colsI.push(col)
  }
  const inner = gridFromColumns(colsI)
  orientOutward(inner, new THREE.Vector3(cx, topY - 0.012, 0))
  { const idx = inner.index.array; for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t } } // faces look into the hollow
  inner.computeVertexNormals()
  seamNormals(inner, NA, colsI[0].length)
  out.push(part(inner, M.suede, 'sellaSotto', { sticker: false }))

  // --- cantle plate inside the rear skirt, copper rivets through it -----------
  const plateCols = []
  const A0 = Math.PI - 0.95, A1 = Math.PI + 0.95
  for (let i = 0; i <= 48; i++) {
    const a = A0 + (A1 - A0) * (i / 48)
    const o = outline(a)
    const ex = o.x - o.nx * edgeR, ez = o.z - o.nz * edgeR
    const hEdge = topY + crown(ex, ez, halfWidth(ex, L0, L1))
    const sd = skirtDepth(a), fl = flare(a)
    const ySk = hEdge - edgeR
    const off = edgeR + fl * 0.5 - th - 0.0009
    plateCols.push({ c: [cx + ex + o.nx * off, ySk - sd * 0.5, ez + o.nz * off], n: [-o.nx, 0, -o.nz], a })
  }
  out.push(part(bandGeo(plateCols, 0.0142, 0.0013), M.darkSteel, 'piastraSella', { sticker: false }))
  const rivets = []
  const rivetAt = (a, depthT) => {
    const o = outline(a)
    const ex = o.x - o.nx * edgeR, ez = o.z - o.nz * edgeR
    const hEdge = topY + crown(ex, ez, halfWidth(ex, L0, L1))
    const sd = skirtDepth(a), fl = flare(a)
    const off = edgeR + fl * depthT + 0.0004
    const p = v3(cx + ex + o.nx * off, hEdge - edgeR - sd * depthT, ez + o.nz * off)
    const n = v3(o.nx, 0.06, o.nz).normalize()
    const rv = latheZ([[0.0001, 0.0021], [0.0021, 0.0017], [0.0031, 0.0006], { r: 0.0033, z: 0, crease: true }, [0.0001, -0.0012]], { segments: 18, flip: true })
    rivets.push(xf(rv, basisZ(p, n)))
  }
  // nine rivets at equal spacing along the rear edge (by arc length, not angle)
  {
    const N = 400, a0 = Math.PI - 1.02, a1 = Math.PI + 1.02
    const acc = [0]
    let prev = outline(a0)
    for (let i = 1; i <= N; i++) { const o = outline(a0 + (a1 - a0) * (i / N)); acc.push(acc[i - 1] + Math.hypot(o.x - prev.x, o.z - prev.z)); prev = o }
    const total = acc[N]
    for (let k = 0; k < 9; k++) {
      const target = total * (0.06 + 0.88 * (k / 8))
      let i = acc.findIndex((v) => v >= target)
      if (i < 0) i = N
      rivetAt(a0 + (a1 - a0) * (i / N), 0.5)
    }
  }
  for (const s of [-1, 1]) rivetAt(s * 0.36, 0.5) // nose rivets
  out.push(part(merge(rivets), M.copper, 'rivetti', { sticker: false }))

  // --- nose bolt + frame + springs ---------------------------------------------
  const noseX = cx + L0 - 0.022
  const noseY = topY + crown(L0 - 0.022, 0, halfWidth(L0 - 0.022, L0, L1)) - th - 0.0045
  const nose = []
  nose.push(rod(v3(noseX, noseY, -0.019), v3(noseX, noseY, 0.019), 0.0034, { radial: 14 }))
  nose.push(hexNut(v3(noseX, noseY, 0.021), v3(0, 0, 1), 0.0052, 0.0045), hexNut(v3(noseX, noseY, -0.021), v3(0, 0, -1), 0.0052, 0.0045))
  nose.push(xf(latheZ([[0.004, -0.009], { r: 0.0072, z: -0.009, crease: true }, { r: 0.0072, z: 0.009, crease: true }, [0.004, 0.009]], { segments: 24 }), basisZ(v3(noseX, noseY, 0), v3(0, 0, 1))))
  out.push(part(merge(nose), M.chromeSoft, 'nasoSella', { sticker: false }))

  const railY = clamp.y + 0.002
  const springX = cx - L1 + 0.036, springZ = 0.057
  const springTop = topY + crown(-L1 + 0.036, springZ, halfWidth(-L1 + 0.036, L0, L1)) - th - skirtDepth(Math.PI) * 0.55
  const frame = []
  for (const sz of [-1, 1]) {
    frame.push(tube(spline([
      [noseX, noseY, sz * 0.009],
      [noseX - 0.05, railY + 0.016, sz * 0.018],
      [clamp.x, railY, sz * 0.027],
      [springX + 0.026, railY - 0.003, sz * (springZ - 0.006)],
      [springX, railY - 0.004, sz * springZ],
    ]), { radius: 0.0037, tubular: 64, radial: 12, caps: 'round' }))
  }
  frame.push(rod(v3(springX, railY - 0.004, -springZ), v3(springX, railY - 0.004, springZ), 0.0037, { radial: 12, caps: 'round' }))
  for (const sz of [-1, 1]) {
    const pts = []
    const turns = 6.5, y0 = railY - 0.001, y1 = springTop
    for (let i = 0; i <= 300; i++) {
      const t = i / 300, a = t * turns * TAU
      const rr = 0.0152 * (1 - 0.14 * Math.sin(t * Math.PI)) * (1 - 0.1 * t) // barrel, slightly conical
      pts.push(v3(springX + Math.cos(a) * rr, y0 + (y1 - y0) * t, sz * springZ + Math.sin(a) * rr))
    }
    frame.push(tube(new THREE.CatmullRomCurve3(pts), { radius: 0.0026, tubular: 460, radial: 8, caps: 'round' }))
    // spring cap riveted to the cantle plate
    frame.push(xf(latheZ([[0.0001, -0.0015], { r: 0.0135, z: -0.0015, crease: true }, { r: 0.0135, z: 0.0015, crease: true }, [0.0001, 0.0015]], { segments: 32 }), basisZ(v3(springX, y1 + 0.0012, sz * springZ), v3(0, 1, 0))))
  }
  out.push(part(merge(frame), M.chrome, 'molleSella', { sticker: false }))
  // clamp block holding the rails on the post
  const clampG = merge([
    xf(latheZ([[0.0001, -0.013], { r: 0.0138, z: -0.013, crease: true }, { r: 0.0138, z: 0.013, crease: true }, [0.0001, 0.013]], { segments: 28 }), basisZ(clamp.clone().add(v3(0, 0.001, 0)), v3(0, 0, 1))),
    rod(clamp.clone().add(v3(0, 0.001, -0.036)), clamp.clone().add(v3(0, 0.001, 0.036)), 0.0033, { radial: 10 }),
    hexNut(clamp.clone().add(v3(0, 0.001, 0.038)), v3(0, 0, 1), 0.0055, 0.005),
    hexNut(clamp.clone().add(v3(0, 0.001, -0.038)), v3(0, 0, -1), 0.0055, 0.005),
  ])
  out.push(part(clampG, M.chromeSoft, 'morsettoSella', { sticker: false }))
  return out
}

// columns (each a list of {p, uv}) -> indexed grid
function gridFromColumns(cols) {
  const rows = cols[0].length
  const P = [], U = [], I = []
  for (const col of cols) for (const v of col) { P.push(...v.p); U.push(...v.uv) }
  for (let i = 0; i < cols.length - 1; i++) for (let j = 0; j < rows - 1; j++) {
    const a = i * rows + j, b = (i + 1) * rows + j
    I.push(a, a + 1, b, b, a + 1, b + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
  g.setIndex(I)
  return g
}

// first and last columns coincide: share their normals so there is no seam
function seamNormals(g, NA, rows) {
  const n = g.attributes.normal
  for (let j = 0; j < rows; j++) {
    const a = j, b = NA * rows + j
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b)
    const l = Math.hypot(x, y, z) || 1
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l)
  }
  n.needsUpdate = true
}

// a thin steel band following points {c, n}: height h (vertical), thickness t (along n)
function bandGeo(cols, h, t) {
  const P = [], N = [], I = []
  const sides = [
    (c, n) => [[c[0] + n[0] * t, c[1] - h / 2, c[2] + n[2] * t], [c[0] + n[0] * t, c[1] + h / 2, c[2] + n[2] * t], n],        // inner face
    (c, n) => [[c[0], c[1] + h / 2, c[2]], [c[0], c[1] - h / 2, c[2]], [-n[0], 0, -n[2]]],                                        // outer face
    (c, n) => [[c[0], c[1] + h / 2, c[2]], [c[0] + n[0] * t, c[1] + h / 2, c[2] + n[2] * t], [0, 1, 0]],                           // top
    (c, n) => [[c[0] + n[0] * t, c[1] - h / 2, c[2] + n[2] * t], [c[0], c[1] - h / 2, c[2]], [0, -1, 0]],                           // bottom
  ]
  for (const side of sides) {
    const base = P.length / 3
    for (const col of cols) {
      const [p0, p1, nn] = side(col.c, col.n)
      P.push(...p0, ...p1)
      N.push(...nn, ...nn)
    }
    for (let i = 0; i < cols.length - 1; i++) {
      const a = base + i * 2, b = base + (i + 1) * 2
      I.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((P.length / 3) * 2), 2))
  g.setIndex(I)
  // wind every triangle to match its normal
  const pos = g.attributes.position, idx = g.index.array
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), nv = new THREE.Vector3()
  for (let k = 0; k < idx.length; k += 3) {
    A.fromBufferAttribute(pos, idx[k]); B.fromBufferAttribute(pos, idx[k + 1]); C.fromBufferAttribute(pos, idx[k + 2])
    const fn = B.sub(A).cross(C.sub(A))
    nv.fromBufferAttribute(g.attributes.normal, idx[k])
    if (fn.dot(nv) < 0) { const tt = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = tt }
  }
  return g
}
