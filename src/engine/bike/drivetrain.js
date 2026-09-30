// Chainring (44T, 5-arm star), rear cog (18T), a chain closed link by link on
// the real tangent path, cottered cranks, block pedals with reflectors,
// chain guard plate.
import * as THREE from 'three'
import { extrude, merge, rod, tube, latheZ, spline, xf, basisZ, v3, TAU } from '../geo.js'
import { part, group } from './part.js'
import { roundedRect } from './frame.js'
import { distanceTo } from '../stickers/artwork.js'

function gearShape(teeth, pitchR, { holes = 0, holeR0 = 0, holeR1 = 0, boreR = 0.01 } = {}) {
  const s = new THREE.Shape()
  const N = teeth * 9
  const tipR = pitchR + 0.0042, rootR = pitchR - 0.0046
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU
    const ph = ((a / TAU) * teeth) % 1 // 0..1 within a tooth
    // rounded tooth: flat-ish tip, circular root seat for the roller
    const d = Math.abs(ph - 0.5) * 2 // 1 at root, 0 at tip centre
    const k = d < 0.42 ? 1 : d > 0.78 ? 0 : 1 - (d - 0.42) / 0.36
    const kk = k * k * (3 - 2 * k)
    const r = rootR + (tipR - rootR) * kk
    const x = Math.cos(a) * r, y = Math.sin(a) * r
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y)
  }
  // star cut-outs (petals between the arms)
  for (let h = 0; h < holes; h++) {
    const c = (h / holes) * TAU + TAU / holes / 2
    const p = new THREE.Path()
    const M = 40
    for (let i = 0; i <= M; i++) {
      const t = i / M
      const half = (TAU / holes) * 0.29
      let px, py
      if (t < 0.5) { // outer arc
        const a = c - half + (t / 0.5) * half * 2
        px = Math.cos(a) * holeR1; py = Math.sin(a) * holeR1
      } else { // inner narrower arc
        const a = c + half * 0.55 - ((t - 0.5) / 0.5) * half * 1.1
        px = Math.cos(a) * holeR0; py = Math.sin(a) * holeR0
      }
      if (i === 0) p.moveTo(px, py); else p.lineTo(px, py)
    }
    s.holes.push(p)
  }
  const bore = new THREE.Path()
  bore.absarc(0, 0, boreR, 0, TAU, true)
  s.holes.push(bore)
  return s
}

// Closed chain path around two sprockets (external tangents).
function chainPath(c1, r1, c2, r2) {
  // c1 = ring (front, bigger), c2 = cog (rear)
  const d = c2.clone().sub(c1)
  const L = d.length()
  const u = d.clone().normalize()
  const nrm = v3(u.y, -u.x, 0) // points up for a chain running backward
  const beta = Math.asin((r1 - r2) / L)
  // tangent points: top run and bottom run
  const dirTop = nrm.clone().multiplyScalar(Math.cos(beta)).addScaledVector(u, Math.sin(beta))
  const dirBot = nrm.clone().multiplyScalar(-Math.cos(beta)).addScaledVector(u, Math.sin(beta))
  const t1 = c1.clone().addScaledVector(dirTop, r1), t2 = c2.clone().addScaledVector(dirTop, r2)
  const b1 = c1.clone().addScaledVector(dirBot, r1), b2 = c2.clone().addScaledVector(dirBot, r2)
  const pts = []
  const addArc = (c, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push(v3(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 0)) } }
  const ang = (p, c) => Math.atan2(p.y - c.y, p.x - c.x)
  // go: top run from ring to cog, around cog (rear), bottom run back, around ring
  const addLine = (a, b, n) => { for (let i = 1; i < n; i++) pts.push(a.clone().lerp(b, i / n)) }
  addLine(t1, t2, 60)
  let a0 = ang(t2, c2), a1 = ang(b2, c2)
  while (a1 < a0) a1 += TAU
  addArc(c2, r2, a0, a1, 60)
  addLine(b2, b1, 60)
  a0 = ang(b1, c1); a1 = ang(t1, c1)
  while (a1 < a0) a1 += TAU
  addArc(c1, r1, a0, a1, 140)
  return pts
}

// walk the polyline and drop pins at chord distance p; closes by bisecting p
function placePins(poly, count) {
  const cum = [0]
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + poly[i].distanceTo(poly[i - 1]))
  const total = cum[cum.length - 1] + poly[0].distanceTo(poly[poly.length - 1])
  const at = (s) => {
    s = ((s % total) + total) % total
    let lo = 0, hi = cum.length - 1
    if (s >= cum[hi]) { const t = (s - cum[hi]) / (total - cum[hi]); return poly[hi].clone().lerp(poly[0], t) }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m }
    const t = (s - cum[lo]) / (cum[hi] - cum[lo])
    return poly[lo].clone().lerp(poly[hi], t)
  }
  const walk = (p) => {
    const pins = [at(0)], ss = [0]
    let s = 0
    for (let k = 1; k < count; k++) {
      // advance s until chord from last pin reaches p
      let lo = s, hi = s + p * 1.6
      for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (at(m).distanceTo(pins[k - 1]) < p) lo = m; else hi = m }
      s = (lo + hi) / 2
      pins.push(at(s)); ss.push(s)
    }
    return { pins, ss, closing: pins[count - 1].distanceTo(pins[0]) }
  }
  let lo = 0.0118, hi = 0.0136, best = null
  for (let it = 0; it < 40; it++) {
    const m = (lo + hi) / 2
    const r = walk(m)
    best = { ...r, p: m }
    if (r.closing > m) lo = m; else hi = m
  }
  return { pins: best.pins, ss: best.ss, pitch: best.p, at, total }
}

function linkPlateShape(p, rEnd, waist) {
  const s = new THREE.Shape()
  const h = p / 2
  const N = 20
  // left lobe
  s.moveTo(-h, -rEnd)
  s.absarc(-h, 0, rEnd, -Math.PI / 2, Math.PI / 2, true)
  s.quadraticCurveTo(0, waist, h, rEnd)
  s.absarc(h, 0, rEnd, Math.PI / 2, -Math.PI / 2, true)
  s.quadraticCurveTo(0, -waist, -h, -rEnd)
  void N
  return s
}

export function buildDrivetrain(D, M) {
  const z = D.chainZ
  // --- chainring + right crank (one piece, turns with the BB) --------------
  const ring = extrude(gearShape(D.ringTeeth, D.ringR, { holes: 5, holeR0: 0.028, holeR1: D.ringR - 0.014, boreR: 0.009 }), 0.0028, { bevel: 0.0006, bevelSegments: 1, curveSegments: 12 })
  ring.translate(0, 0, z)
  const crankArm = (sideZ) => {
    const s = new THREE.Shape()
    const L = D.crankLen
    s.moveTo(0, -0.0165)
    s.bezierCurveTo(L * 0.45, -0.0118, L * 0.8, -0.0112, L, -0.0112)
    s.absarc(L, 0, 0.0112, -Math.PI / 2, Math.PI / 2, false)
    s.bezierCurveTo(L * 0.8, 0.0112, L * 0.45, 0.0118, 0, 0.0165)
    s.absarc(0, 0, 0.0165, Math.PI / 2, Math.PI * 1.5, false)
    const g = extrude(s, 0.0105, { bevel: 0.0032, bevelSegments: 4, curveSegments: 24 })
    g.translate(0, 0, sideZ)
    return g
  }
  const crankR = crankArm(D.crankZ)
  const crankL = crankArm(-D.crankZ)
  crankL.rotateZ(Math.PI)
  const spindle = rod(v3(0, 0, -D.crankZ - 0.004), v3(0, 0, D.crankZ + 0.004), 0.0072, { radial: 20, caps: 'flat' })
  // cotter pins (through the crank eyes) + nuts
  const cotter = (sideZ, flip) => merge([
    rod(v3(-0.012, 0.0085 * flip, sideZ), v3(0.014, 0.0085 * flip, sideZ), 0.0038, { radial: 12, caps: 'round' }),
    xf(latheZ([[0.0001, -0.003], { r: 0.0056, z: -0.003, crease: true }, { r: 0.0056, z: 0.003, crease: true }, [0.0001, 0.003]], { segments: 6 }), basisZ(v3(0.017, 0.0085 * flip, sideZ), v3(1, 0, 0))),
  ])
  const cranks = new THREE.Group()
  cranks.name = 'pedivelle'
  cranks.add(part(ring, M.chrome, 'corona', { sticker: false }))
  cranks.add(part(merge([crankR, crankL]), M.chrome, 'pedivella', { sticker: false }))
  cranks.add(part(merge([spindle, cotter(D.crankZ, 1), cotter(-D.crankZ, -1)]), M.steel, 'perno', { sticker: false }))
  // chainring bolts
  const bolts = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU
    const c = v3(Math.cos(a) * 0.043, Math.sin(a) * 0.043, z + 0.002)
    bolts.push(xf(latheZ([[0.0001, 0], { r: 0.0042, z: 0, crease: true }, [0.0037, 0.0018], [0.0001, 0.0026]], { segments: 16 }), basisZ(c, v3(0, 0, 1))))
  }
  cranks.add(part(merge(bolts), M.chromeSoft, 'bulloniCorona', { sticker: false }))

  // pedals attach at the crank ends; each pedal counter-rotates to stay level
  const pedalR = buildPedal(M, 1)
  pedalR.position.set(D.crankLen, 0, D.crankZ + 0.006)
  const pedalL = buildPedal(M, -1)
  pedalL.position.set(-D.crankLen, 0, -D.crankZ - 0.006)
  cranks.add(pedalR, pedalL)
  cranks.userData.pedals = [pedalR, pedalL]
  cranks.position.copy(D.bb)

  // --- rear cog on the hub ---------------------------------------------------
  const cog = extrude(gearShape(D.cogTeeth, D.cogR, { boreR: 0.012 }), 0.0026, { bevel: 0.0005, curveSegments: 8 })
  cog.translate(0, 0, z)
  const cogM = part(cog, M.steel, 'pignone', { sticker: false })

  // --- chain -----------------------------------------------------------------
  const ringC = v3(D.bb.x, D.bb.y, 0), cogC = v3(D.rear.x, D.rear.y, 0)
  const poly = chainPath(ringC, D.ringR, cogC, D.cogR)
  const nLinks = 94
  const { pins, pitch, ss, at: pathAt, total: pathTotal } = placePins(poly, nLinks)
  const innerShape = linkPlateShape(pitch, 0.0042, 0.0031)
  const outerShape = linkPlateShape(pitch, 0.0044, 0.0033)
  const plateIn = extrude(innerShape, 0.0009, { curveSegments: 5 })
  const plateOut = extrude(outerShape, 0.0009, { curveSegments: 5 })
  const roller = latheZ([{ r: 0.0038, z: -0.0031 }, { r: 0.0038, z: 0.0031 }], { segments: 12 })
  const pinG = latheZ([[0.0001, -0.0062], { r: 0.0019, z: -0.0062, crease: true }, { r: 0.0019, z: 0.0062, crease: true }, [0.0001, 0.0062]], { segments: 8 })
  const buildChain = (pinsArr) => {
    const parts = []
    const m = new THREE.Matrix4()
    for (let k = 0; k < pinsArr.length; k++) {
      const a = pinsArr[k], b = pinsArr[(k + 1) % pinsArr.length]
      const mid = a.clone().add(b).multiplyScalar(0.5)
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const inner = k % 2 === 0
      const plate = inner ? plateIn : plateOut
      const off = inner ? 0.0036 : 0.0049
      for (const sz of [-1, 1]) {
        m.makeRotationZ(ang).setPosition(mid.x, mid.y, z + sz * off)
        parts.push(plate.clone().applyMatrix4(m))
      }
      m.makeTranslation(a.x, a.y, z)
      parts.push(roller.clone().applyMatrix4(m))
      parts.push(pinG.clone().applyMatrix4(m))
    }
    return merge(parts)
  }
  const chainGeo = buildChain(pins)
  const chain = part(chainGeo, M.steel, 'catena', { sticker: false })
  // animation: every link slides along the path; templates are re-emitted into
  // the same buffers (same vertex order as buildChain)
  const tpl = [plateIn, plateOut, roller, pinG].map((g) => { const q = g.index ? g.toNonIndexed() : g; return { p: q.attributes.position.array, n: q.attributes.normal.array } })
  const chainAnim = (offset) => {
    const P = chain.geometry.attributes.position.array, N = chain.geometry.attributes.normal.array
    const pinAt = ss.map((s0) => pathAt(s0 + offset))
    let o = 0
    const put = (t, cos, sin, tx, ty, tz) => {
      const { p, n } = t
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], zz = p[i + 2]
        P[o] = x * cos - y * sin + tx; P[o + 1] = x * sin + y * cos + ty; P[o + 2] = zz + tz
        const nx = n[i], ny = n[i + 1]
        N[o] = nx * cos - ny * sin; N[o + 1] = nx * sin + ny * cos; N[o + 2] = n[i + 2]
        o += 3
      }
    }
    for (let k = 0; k < pinAt.length; k++) {
      const a = pinAt[k], b = pinAt[(k + 1) % pinAt.length]
      const ang = Math.atan2(b.y - a.y, b.x - a.x), c = Math.cos(ang), sn = Math.sin(ang)
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      const inner = k % 2 === 0
      const t = inner ? tpl[0] : tpl[1]
      const off = inner ? 0.0036 : 0.0049
      put(t, c, sn, mx, my, z - off)
      put(t, c, sn, mx, my, z + off)
      put(tpl[2], 1, 0, a.x, a.y, z)
      put(tpl[3], 1, 0, a.x, a.y, z)
    }
    chain.geometry.attributes.position.needsUpdate = true
    chain.geometry.attributes.normal.needsUpdate = true
  }
  chain.userData.animate = chainAnim
  chain.userData.pathTotal = pathTotal

  // --- chain guard: a half-moon band over the ring teeth and the top run ------
  const guardZ = z + 0.0145
  const d = cogC.clone().sub(ringC)
  const u = d.clone().normalize()
  const nrm = v3(u.y, -u.x, 0)
  const beta = Math.asin((D.ringR - D.cogR) / d.length())
  const dirTop = nrm.clone().multiplyScalar(Math.cos(beta)).addScaledVector(u, Math.sin(beta))
  const aTop = Math.atan2(dirTop.y, dirTop.x)          // ring angle where the top run leaves
  const t1 = ringC.clone().addScaledVector(dirTop, D.ringR)
  const t2 = cogC.clone().addScaledVector(dirTop, D.cogR)
  const runDir = t2.clone().sub(t1).normalize()
  const up = dirTop.clone()                           // normal to the top run
  const Ro = D.ringR + 0.0128, Ri = D.ringR - 0.021
  const a0 = -0.32
  const endX = D.rear.x + 0.082
  const tEnd = (endX - t1.x) / runDir.x
  const topEnd = t1.clone().addScaledVector(runDir, tEnd).addScaledVector(up, 0.0128)
  const botEnd = t1.clone().addScaledVector(runDir, tEnd).addScaledVector(up, -0.0172)
  const gs = new THREE.Shape()
  gs.moveTo(ringC.x + Math.cos(a0) * Ro, ringC.y + Math.sin(a0) * Ro)
  gs.absarc(ringC.x, ringC.y, Ro, a0, aTop, false)
  gs.lineTo(topEnd.x, topEnd.y)
  const tailC = topEnd.clone().lerp(botEnd, 0.5)
  const tailR = topEnd.distanceTo(botEnd) / 2
  const aUp = Math.atan2(up.y, up.x)
  gs.absarc(tailC.x, tailC.y, tailR, aUp, aUp + Math.PI, false)
  // lower edge runs forward parallel to the chain until it meets the inner circle
  const lowStart = t1.clone().addScaledVector(up, -0.0172)
  let tMeet = 0
  for (let k = 0; k < 60; k++) {
    const p = lowStart.clone().addScaledVector(runDir, -tMeet * 0.0 + tMeet)
    if (p.distanceTo(ringC) < Ri) break
    tMeet += 0.004
  }
  const meet = lowStart.clone().addScaledVector(runDir, tMeet)
  gs.lineTo(meet.x, meet.y)
  const aMeet = Math.atan2(meet.y - ringC.y, meet.x - ringC.x)
  gs.absarc(ringC.x, ringC.y, Ri, aMeet, a0, true)
  gs.closePath()
  const guardGeo = extrude(gs, 0.0014, { bevel: 0.0006, bevelSegments: 3, curveSegments: 72 })
  guardGeo.translate(0, 0, guardZ)
  // pressed-steel look: a rolled bead along the edge and a gentle crown,
  // baked into a normal map from the guard's own outline
  const guardNormal = pillowNormal(gs)
  for (const m of [M.guardChrome, M.guardPaint, M.guardWhite]) { m.normalMap = guardNormal; m.normalScale.set(1, 1); m.needsUpdate = true }
  const guard = part(guardGeo, M.guardChrome, 'carter', { label: 'Carter' })
  guard.userData.plate = true
  // lip along the outer edge, turned in toward the frame
  const lipPts = []
  for (let i = 0; i <= 48; i++) {
    const a = a0 + (aTop - a0) * (i / 48)
    lipPts.push(v3(ringC.x + Math.cos(a) * Ro, ringC.y + Math.sin(a) * Ro, 0))
  }
  const topStart = ringC.clone().addScaledVector(dirTop, Ro)
  for (let i = 1; i <= 24; i++) lipPts.push(topStart.clone().lerp(topEnd, i / 24))
  const lipCurve = new THREE.CatmullRomCurve3(lipPts, false, 'centripetal')
  const lip = lipStrip(lipCurve, guardZ, guardZ - 0.0105, 160)
  const lipM = part(lip, M.chromeDS, 'carterBordo', { sticker: false })
  // mounting tabs to the seat tube and chainstay
  const tabs = part(merge([
    rod(v3(-0.1, D.bb.y + 0.078, guardZ - 0.0005), v3(-0.085, D.bb.y + 0.07, 0.014), 0.0022, { radial: 8 }),
    rod(tailC.clone().add(v3(0.02, -0.004, guardZ - 0.0005)), v3(tailC.x + 0.02, 0.268, 0.043), 0.0022, { radial: 8 }),
  ]), M.chromeSoft, 'carterStaffe', { sticker: false })

  return { cranks, cogM, chain, guard, lipM, tabs, chainPins: pins, chainPoly: poly, chainPitch: pitch, buildChain }
}

function pillowNormal(shape, pxPerM = 2400) {
  const pts = shape.getPoints(160)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) }
  const pad = 0.004
  minX -= pad; minY -= pad; maxX += pad; maxY += pad
  const W = Math.ceil((maxX - minX) * pxPerM), H = Math.ceil((maxY - minY) * pxPerM)
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d')
  x.fillStyle = '#fff'
  x.beginPath()
  pts.forEach((p, i) => { const px = (p.x - minX) * pxPerM, py = (maxY - p.y) * pxPerM; if (i) x.lineTo(px, py); else x.moveTo(px, py) })
  x.closePath(); x.fill()
  const img = x.getImageData(0, 0, W, H).data
  const outside = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) outside[i] = img[i * 4] > 127 ? 0 : 1
  const d = distanceTo(outside, W, H) // px from the edge, inside
  const hgt = new Float32Array(W * H)
  const mm = pxPerM / 1000
  for (let i = 0; i < W * H; i++) {
    const e = d[i] / mm // mm from the edge
    const bead = Math.exp(-((e - 3.2) ** 2) / 3.2) * 0.75   // rolled rim
    const crown = Math.min(1, e / 16) ** 0.8 * 0.55           // gentle doming
    hgt[i] = e <= 0 ? 0 : (bead + crown) * 0.001               // metres
  }
  const out = x.createImageData(W, H)
  const k = pxPerM * 0.5
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const i = yy * W + xx
    const hl = hgt[yy * W + Math.max(0, xx - 1)], hr = hgt[yy * W + Math.min(W - 1, xx + 1)]
    const hu = hgt[Math.max(0, yy - 1) * W + xx], hd = hgt[Math.min(H - 1, yy + 1) * W + xx]
    const dx = (hr - hl) * k, dy = (hu - hd) * k
    const l = Math.hypot(dx, dy, 1)
    out.data[i * 4] = (-dx / l * 0.5 + 0.5) * 255
    out.data[i * 4 + 1] = (-dy / l * 0.5 + 0.5) * 255
    out.data[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255
    out.data[i * 4 + 3] = 255
  }
  x.putImageData(out, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.repeat.set(1 / (maxX - minX), 1 / (maxY - minY))
  t.offset.set(-minX / (maxX - minX), -minY / (maxY - minY))
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

function lipStrip(curve, z0, z1, n) {
  const P = [], U = [], I = []
  const L = curve.getLength()
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n)
    for (let j = 0; j <= 2; j++) {
      const zz = z0 + (z1 - z0) * (j / 2)
      const bend = j === 1 ? 0.0006 : 0
      P.push(p.x, p.y + bend, zz)
      U.push((i / n) * L, j * 0.006)
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
    const a = i * 3 + j, b = (i + 1) * 3 + j
    I.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
  g.setIndex(I)
  g.computeVertexNormals()
  return g
}

// Classic rubber block pedal: spindle, chrome cage, two ribbed blocks, amber reflectors.
export function buildPedal(M, side) {
  const g = new THREE.Group()
  g.name = 'pedale'
  const w = 0.098, dep = 0.066, th = 0.024
  const zc = side * (0.012 + w / 2)
  const parts = []
  parts.push(rod(v3(0, 0, 0), v3(0, 0, side * (w + 0.016)), 0.0052, { radial: 14, caps: 'round' }))
  // cage end plates
  const plate = extrude(roundedRect(dep, th, 0.006), 0.0022, { bevel: 0.0006 })
  for (const e of [0.012, 0.012 + w]) {
    const q = plate.clone(); q.translate(0, 0, side * e); parts.push(q)
  }
  // cage rods front/back
  for (const x of [-dep / 2 + 0.004, dep / 2 - 0.004]) for (const y of [-th / 2 + 0.004, th / 2 - 0.004]) {
    parts.push(rod(v3(x, y, side * 0.012), v3(x, y, side * (0.012 + w)), 0.0016, { radial: 8 }))
  }
  const cage = part(merge(parts), M.chrome, 'gabbiaPedale', { sticker: false })
  // rubber blocks with ribs (top & bottom)
  const block = extrude(roundedRect(0.02, th - 0.004, 0.004), w - 0.006, { bevel: 0.0022, bevelSegments: 3 })
  const pos = block.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (Math.abs(y) > (th - 0.004) / 2 - 0.0002) {
      const zz = pos.getZ(i)
      pos.setY(i, y + Math.sign(y) * 0.0009 * (0.5 + 0.5 * Math.cos(zz * TAU / 0.0075)))
    }
  }
  block.computeVertexNormals()
  const blocks = merge([block.clone().translate(-0.0165, 0, zc), block.clone().translate(0.0165, 0, zc)])
  const rub = part(blocks, M.rubber, 'blocchettiPedale', { sticker: false })
  // reflectors on the front/back faces of the cage
  const refl = extrude(roundedRect(0.034, 0.011, 0.002), 0.003, { bevel: 0.0006 })
  const r1 = refl.clone(); r1.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)); r1.translate(dep / 2 + 0.0005, 0, zc)
  const r2 = refl.clone(); r2.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)); r2.translate(-dep / 2 - 0.0005, 0, zc)
  const am = part(merge([r1, r2]), M.amberLens, 'catadiottriPedale', { sticker: false })
  g.add(cage, rub, am)
  return g
}
