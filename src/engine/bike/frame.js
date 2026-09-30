// Frame: main tube split by the vertical folding hinge, head tube, seat tube,
// BB shell, stays, dropouts, fork. Painted steel unless noted.
import * as THREE from 'three'
import { tube, latheZ, extrude, merge, rod, basisZ, spline, xf, mirrorZ, v3, TAU } from '../geo.js'
import { part } from './part.js'

// straight tube whose ends can be sliced by a vertical plane x = const
function cutTube(a, b, r, { radial = 48, cutStartX = null, cutEndX = null } = {}) {
  const g = tube(new THREE.LineCurve3(a, b), { radius: r, tubular: 1, radial })
  const T = b.clone().sub(a).normalize()
  const pos = g.attributes.position, uv = g.attributes.uv
  const ring = radial + 1
  const fix = (start, planeX) => {
    for (let j = 0; j < ring; j++) {
      const i = start + j
      const t = (planeX - pos.getX(i)) / T.x
      pos.setXYZ(i, pos.getX(i) + T.x * t, pos.getY(i) + T.y * t, pos.getZ(i) + T.z * t)
      uv.setX(i, uv.getX(i) + t)
    }
  }
  if (cutStartX != null) fix(0, cutStartX)
  if (cutEndX != null) fix(ring, cutEndX)
  pos.needsUpdate = true
  uv.needsUpdate = true
  g.computeBoundingSphere()
  return g
}

const pointAtX = (origin, dir, x) => origin.clone().addScaledVector(dir, (x - origin.x) / dir.x)

// ring collar around an arbitrary axis (lathe around Z then oriented)
function collar(center, axis, rIn, rOut, h, { bevel = 0.0012, segments = 48 } = {}) {
  const b = Math.min(bevel, (rOut - rIn) / 3, h / 3)
  const g = latheZ([
    [rIn, -h / 2], { r: rOut - b, z: -h / 2 }, [rOut, -h / 2 + b], [rOut, h / 2 - b], { r: rOut - b, z: h / 2 }, [rIn, h / 2],
  ], { segments })
  return xf(g, basisZ(center, axis))
}

export function buildFrame(D, M) {
  const rear = []   // stays with the rear half
  const front = []  // swings with the front half when folding

  // --- main tube, split at the hinge -------------------------------------
  const hx = D.hinge.x, gap = D.hingeGap
  const leafT = 0.0062
  const mainRearEnd = pointAtX(D.mainRear, D.mainDir, hx - gap / 2)
  const mainFrontStart = pointAtX(D.mainRear, D.mainDir, hx + gap / 2)
  rear.push(part(cutTube(D.mainRear, mainRearEnd, D.mainR, { cutEndX: hx - gap / 2 }), M.paint, 'tuboPrincipaleRetro', { label: 'Tubo principale' }))
  front.push(part(cutTube(mainFrontStart, D.mainFront, D.mainR, { cutStartX: hx + gap / 2 }), M.paint, 'tuboPrincipaleFronte', { label: 'Tubo principale' }))

  // --- hinge: two leaves in the cut plane, knuckle on the left, latch right
  const cosA = Math.abs(D.mainDir.x)
  const ez = D.mainR + 0.0048, ey = D.mainR / cosA + 0.0058
  const knuckleZ = -(D.mainR + 0.0092)
  const leafShape = new THREE.Shape()
  const N = 96
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU
    const bumpK = 0.0125 * Math.exp(-((a) ** 2) / 0.22) + 0.0125 * Math.exp(-((a - TAU) ** 2) / 0.22)
    const bumpL = 0.0085 * Math.exp(-((a - Math.PI) ** 2) / 0.16)
    const k = 1 + (bumpK + bumpL) / Math.hypot(ez * Math.cos(a), ey * Math.sin(a))
    const x = ez * Math.cos(a) * k, y = ey * Math.sin(a) * k
    if (i === 0) leafShape.moveTo(x, y); else leafShape.lineTo(x, y)
  }
  const leafBasis = new THREE.Matrix4().makeBasis(v3(0, 0, -1), v3(0, 1, 0), v3(1, 0, 0))
  const leaf = (side) => {
    const g = extrude(leafShape, leafT, { bevel: 0.0011, bevelSegments: 3, curveSegments: 96 })
    g.applyMatrix4(leafBasis)
    g.translate(hx + side * (gap / 2 + leafT / 2), D.hinge.y, 0)
    return g
  }
  rear.push(part(leaf(-1), M.paint, 'cernieraRetro', { label: 'Cerniera', sticker: false }))
  front.push(part(leaf(1), M.paint, 'cernieraFronte', { label: 'Cerniera', sticker: false }))
  // knuckle barrels (rear: top+bottom, front: middle) + chrome pin caps
  const bh = 0.0158, kz = knuckleZ
  const barrel = (y0, y1) => rod(v3(hx, y0, kz), v3(hx, y1, kz), 0.0068, { radial: 28 })
  const hy = D.hinge.y
  rear.push(part(merge([barrel(hy + bh * 0.5 + 0.0006, hy + bh * 1.5), barrel(hy - bh * 1.5, hy - bh * 0.5 - 0.0006)]), M.paint, 'cardineRetro', { sticker: false }))
  front.push(part(barrel(hy - bh * 0.5, hy + bh * 0.5), M.paint, 'cardineFronte', { sticker: false }))
  const pinCap = (y, s) => xf(latheZ([[0.0001, 0.0026 * s], [0.0022, 0.0022 * s], [0.0042, 0.0006 * s], { r: 0.0046, z: 0 }, [0.0001, 0]], { segments: 24, flip: s > 0 }), basisZ(v3(hx, y, kz), v3(0, 1, 0)))
  rear.push(part(merge([pinCap(hy + bh * 1.5, 1), pinCap(hy - bh * 1.5, -1)]), M.chrome, 'pernoCerniera', { sticker: false }))
  // latch lever (front half): a curved flag that hugs the rear tube and
  // clamps over a hook on the rear leaf; it flips open before folding
  const pivotW = v3(hx + 0.0045, hy, D.mainR + 0.0082)
  const leverPivot = new THREE.Group()
  leverPivot.name = 'leverPivot'
  leverPivot.position.copy(pivotW)
  const leverInner = new THREE.Group()
  leverInner.position.copy(pivotW).multiplyScalar(-1)
  leverPivot.add(leverInner)
  leverInner.add(part(leverBlade(D, hx), M.chrome, 'levaCerniera', { sticker: false }))
  leverInner.add(part(merge([
    rod(pivotW.clone().add(v3(0, -0.0085, 0)), pivotW.clone().add(v3(0, 0.0085, 0)), 0.0046, { radial: 20, caps: 'round' }),
  ]), M.chromeSoft, 'fulcroLeva', { sticker: false }))
  front.push(leverPivot)
  // hook on the rear leaf the lever closes onto
  rear.push(part(rod(v3(hx - 0.006, hy - 0.004, D.mainR + 0.0062), v3(hx - 0.006, hy + 0.004, D.mainR + 0.0062), 0.0028, { radial: 12, caps: 'round' }), M.chromeSoft, 'ganciolevaCerniera', { sticker: false }))

  // --- head tube + headset cups -----------------------------------------
  front.push(part(tube(new THREE.LineCurve3(D.htBottom, D.htTop), { radius: D.htR, tubular: 1, radial: 48, caps: 'flat' }), M.paint, 'tuboSterzo', { label: 'Tubo sterzo' }))
  front.push(part(merge([
    collar(D.htBottom.clone().addScaledVector(D.steer, -0.004), D.steer, 0.012, 0.0236, 0.009),
    collar(D.htTop.clone().addScaledVector(D.steer, 0.0045), D.steer, 0.012, 0.0232, 0.009),
    collar(D.htTop.clone().addScaledVector(D.steer, 0.0125), D.steer, 0.0112, 0.0205, 0.004),
    knurledNut(D.htTop.clone().addScaledVector(D.steer, 0.019), D.steer, 0.0118, 0.0222, 0.0085),
  ]), M.chrome, 'serieSterzo', { sticker: false }))

  // --- seat tube + seat lug ------------------------------------------------
  rear.push(part(tube(new THREE.LineCurve3(D.bb, D.stTop), { radius: D.stR, tubular: 1, radial: 40 }), M.paint, 'tuboSella', { label: 'Tubo sella' }))
  const lugC = D.stTop.clone().addScaledVector(D.seatDir, -0.012)
  const lug = collar(lugC, D.seatDir, D.postR + 0.0004, D.stR + 0.0022, 0.03, { bevel: 0.002 })
  // binder ears + bolt behind the tube
  const earBack = v3(-Math.sin(D.seatAngle), -Math.cos(D.seatAngle), 0).multiplyScalar(-1) // points backward
  const earC = lugC.clone().addScaledVector(v3(-0.94, -0.342, 0), D.stR + 0.006)
  const ear = xf(extrude(roundedRect(0.014, 0.016, 0.004), 0.012, { bevel: 0.001 }), basisZ(earC, v3(0, 0, 1)))
  rear.push(part(merge([lug, ear]), M.paint, 'collarinoSella', { sticker: false }))
  rear.push(part(merge([
    rod(earC.clone().add(v3(0, 0, -0.012)), earC.clone().add(v3(0, 0, 0.012)), 0.0028, { radial: 12 }),
    hexNut(earC.clone().add(v3(0, 0, 0.0135)), v3(0, 0, 1), 0.0055, 0.004),
    hexNut(earC.clone().add(v3(0, 0, -0.0135)), v3(0, 0, -1), 0.0055, 0.004),
  ]), M.chrome, 'bulloneSella', { sticker: false }))
  void earBack

  // --- BB shell + cups ------------------------------------------------------
  const bb = latheZ([
    [0.0125, -D.bbHalf], { r: D.bbR - 0.0012, z: -D.bbHalf, crease: true }, [D.bbR, -D.bbHalf + 0.0014], [D.bbR, D.bbHalf - 0.0014],
    { r: D.bbR - 0.0012, z: D.bbHalf, crease: true }, [0.0125, D.bbHalf],
  ], { segments: 56 })
  bb.translate(D.bb.x, D.bb.y, 0)
  rear.push(part(bb, M.paint, 'scatolaMovimento', { sticker: false }))
  const cup = latheZ([[0.0098, D.bbHalf - 0.0005], { r: 0.0212, z: D.bbHalf - 0.0005, crease: true }, [0.0218, D.bbHalf + 0.004], { r: 0.0205, z: D.bbHalf + 0.0052, crease: true }, [0.0098, D.bbHalf + 0.0056]], { segments: 48 })
  const lock = latheZ([[0.0112, D.bbHalf + 0.0056], { r: 0.0198, z: D.bbHalf + 0.0056, crease: true }, [0.0198, D.bbHalf + 0.0085], [0.0112, D.bbHalf + 0.0092]], { segments: 12 })
  const cups = merge([cup, mirrorZ(cup), mirrorZ(lock)])
  cups.translate(D.bb.x, D.bb.y, 0)
  rear.push(part(cups, M.chrome, 'calottine', { sticker: false }))

  // --- chainstays + seatstays ----------------------------------------------
  const dz = D.rearHalfOLD - 0.0035
  const stayCurves = []
  for (const s of [-1, 1]) {
    const cs = spline([
      [D.bb.x - 0.004, D.bb.y - 0.003, s * 0.021],
      [-0.07, 0.283, s * 0.03],
      [-0.2, 0.271, s * 0.046],
      [D.rear.x + 0.012, D.rear.y + 0.002, s * dz],
    ])
    rear.push(part(tube(cs, { radius: (t) => 0.0098 - t * 0.0022, tubular: 40, radial: 20, caps: 'flat' }), M.paint, s > 0 ? 'forcellinoBassoDx' : 'forcellinoBassoSx', { label: 'Carro basso' }))
    stayCurves.push({ curve: cs, r: 0.0098, kind: 'chain' })
    const ss = spline([
      [D.ssTop.x + 0.004, D.ssTop.y + 0.004, s * 0.0095],
      [D.ssTop.x - 0.04, D.ssTop.y - 0.026, s * 0.03],
      [-0.25, 0.4, s * 0.046],
      [D.rear.x + 0.013, D.rear.y + 0.012, s * dz],
    ])
    rear.push(part(tube(ss, { radius: (t) => 0.0088 - t * 0.0016, tubular: 40, radial: 18, caps: 'flat' }), M.paint, s > 0 ? 'forcellinoAltoDx' : 'forcellinoAltoSx', { label: 'Carro alto' }))
    stayCurves.push({ curve: ss, r: 0.0088, kind: 'seat' })
  }

  // --- weld beads: a painted fillet along every tube-to-tube intersection ---
  const Z = v3(0, 0, 1)
  const bbOut = (p) => Math.hypot(p.x - D.bb.x, p.y - D.bb.y) > D.bbR - 0.0006 || Math.abs(p.z) > D.bbHalf // not buried in the BB shell
  const beadsRear = [], beadsFront = []
  // main tube (front half) into the head tube
  beadsFront.push(...weldBeads(D.mainFront.clone().addScaledVector(D.mainDir, -0.06), D.mainDir, D.mainR, D.htBottom, D.steer, D.htR, 0.0027))
  // main tube (rear half) and seat tube into the BB shell
  beadsRear.push(...weldBeads(D.bb.clone().addScaledVector(D.mainDir, 0.07), D.mainDir.clone().negate(), D.mainR, D.bb, Z, D.bbR, 0.0026))
  beadsRear.push(...weldBeads(D.bb.clone().addScaledVector(D.seatDir, 0.07), D.seatDir.clone().negate(), D.stR, D.bb, Z, D.bbR, 0.0025))
  // main tube meets seat tube just above the shell (only the visible part)
  beadsRear.push(...weldBeads(D.bb.clone().addScaledVector(D.mainDir, 0.07), D.mainDir.clone().negate(), D.mainR, D.bb, D.seatDir, D.stR, 0.0024, bbOut))
  // stays: chainstays into the shell, seatstays into the seat tube
  for (const st of stayCurves) {
    const p0 = st.curve.getPointAt(0.16)
    const dir = st.curve.getPointAt(0).sub(p0).normalize()
    if (st.kind === 'chain') beadsRear.push(...weldBeads(p0, dir, st.r * 0.97, D.bb, Z, D.bbR, 0.0019))
    else beadsRear.push(...weldBeads(p0, dir, st.r * 0.975, D.bb, D.seatDir, D.stR, 0.0018))
  }
  rear.push(part(merge(beadsRear), M.paint, 'saldatureRetro', { sticker: false }))
  front.push(part(merge(beadsFront), M.paint, 'saldatureFronte', { sticker: false }))
  // seatstay bridge (carries the rear brake)
  const bridgeP = new THREE.Vector3()
  {
    const tmp = spline([[D.ssTop.x + 0.004, D.ssTop.y + 0.004, 0.0095], [D.ssTop.x - 0.04, D.ssTop.y - 0.026, 0.03], [-0.25, 0.4, 0.046], [D.rear.x + 0.013, D.rear.y + 0.012, dz]])
    const p = tmp.getPointAt(0.3)
    bridgeP.set(p.x, p.y, 0)
    rear.push(part(rod(v3(p.x, p.y, -p.z - 0.003), v3(p.x, p.y, p.z + 0.003), 0.0062, { radial: 16 }), M.paint, 'ponticello', { sticker: false }))
  }

  // --- rear dropouts + axle nuts ------------------------------------------
  const dropShape = new THREE.Shape()
  dropShape.absarc(0, 0, 0.0125, 0, TAU, false)
  const drop2 = new THREE.Shape()
  drop2.moveTo(0.0, -0.012); drop2.lineTo(0.03, -0.004); drop2.lineTo(0.026, 0.02); drop2.lineTo(0.004, 0.013)
  drop2.absarc(0, 0, 0.0125, Math.PI / 2, -Math.PI / 2 + TAU, false)
  for (const s of [-1, 1]) {
    const g = extrude(drop2, 0.004, { bevel: 0.0008 })
    g.translate(D.rear.x, D.rear.y, s * (D.rearHalfOLD - 0.002))
    rear.push(part(g, M.paint, 'forcellinoPost' + (s > 0 ? 'Dx' : 'Sx'), { sticker: false }))
  }
  rear.push(part(merge([
    hexNut(v3(D.rear.x, D.rear.y, D.rearHalfOLD + 0.0055), v3(0, 0, 1), 0.0088, 0.0075),
    hexNut(v3(D.rear.x, D.rear.y, -D.rearHalfOLD - 0.0055), v3(0, 0, -1), 0.0088, 0.0075),
    rod(v3(D.rear.x, D.rear.y, -D.rearHalfOLD - 0.011), v3(D.rear.x, D.rear.y, D.rearHalfOLD + 0.011), 0.0046, { radial: 12 }),
  ]), M.chrome, 'dadiRuotaPost', { sticker: false }))

  return { rear, front, bridgeP, leverPivot }
}

// curved flag lever lying on the +z side of the rear main tube
function leverBlade(D, hx) {
  const T = D.mainDir.clone().multiplyScalar(-1)       // along the rear tube
  const Z = v3(0, 0, 1)
  const Nn = new THREE.Vector3().crossVectors(Z, T).normalize()
  const axis0 = pointAtXAxis(D, hx + 0.0045)
  const L = 0.064, th = 0.0026, gap = 0.0011
  const NI = 26, NJ = 40
  const pts = []
  for (let i = 0; i <= NI; i++) {
    const s = i / NI
    const w = 0.5 * (1 - 0.3 * s)                       // angular half width
    const lift = 0.0032 * Math.pow(Math.max(0, (s - 0.72) / 0.28), 2)
    const ri = D.mainR + gap + lift, ro = ri + th
    const c = axis0.clone().addScaledVector(T, s * L)
    const ring = []
    // closed profile: outer arc, end cap, inner arc, end cap
    for (let j = 0; j < NJ; j++) {
      const u = j / NJ
      let phi, r
      if (u < 0.4) { phi = -w + (u / 0.4) * 2 * w; r = ro }
      else if (u < 0.5) { const a = ((u - 0.4) / 0.1) * Math.PI; phi = w + Math.sin(a) * (th / 2) / ri; r = (ri + ro) / 2 + Math.cos(a) * th / 2 }
      else if (u < 0.9) { phi = w - ((u - 0.5) / 0.4) * 2 * w; r = ri }
      else { const a = ((u - 0.9) / 0.1) * Math.PI; phi = -w - Math.sin(a) * (th / 2) / ri; r = (ri + ro) / 2 - Math.cos(a) * th / 2 }
      const d = Z.clone().multiplyScalar(Math.cos(phi)).addScaledVector(Nn, Math.sin(phi))
      ring.push(c.clone().addScaledVector(d, r))
    }
    pts.push(ring)
  }
  const P = [], U = [], I = []
  for (let i = 0; i <= NI; i++) for (let j = 0; j <= NJ; j++) { const q = pts[i][j % NJ]; P.push(q.x, q.y, q.z); U.push(i / NI, j / NJ) }
  const cols = NJ + 1
  for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) { const a = i * cols + j, b = (i + 1) * cols + j; I.push(a, b, a + 1, b, b + 1, a + 1) }
  // end caps (fan)
  for (const i of [0, NI]) {
    const cIdx = P.length / 3
    const cc = pts[i].reduce((acc, q) => acc.add(q), new THREE.Vector3()).multiplyScalar(1 / NJ)
    P.push(cc.x, cc.y, cc.z); U.push(0, 0)
    for (let j = 0; j < NJ; j++) I.push(...(i === 0 ? [cIdx, i * cols + j + 1, i * cols + j] : [cIdx, i * cols + j, i * cols + j + 1]))
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
  g.setIndex(I)
  g.computeVertexNormals()
  return g
}

function pointAtXAxis(D, x) { return D.mainRear.clone().addScaledVector(D.mainDir, (x - D.mainRear.x) / D.mainDir.x) }

// Intersection of a joining cylinder (a point P on its axis outside the joint,
// direction T toward the receiving tube, radius r) with a receiving cylinder
// (axis through Q along U, radius R). Returns bead tubes (one per visible run).
function weldBeads(P, T, r, Q, U, R, beadR, keep = null, n = 96) {
  const Tn = T.clone().normalize(), Un = U.clone().normalize()
  const N0 = Math.abs(Tn.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0)
  const N = new THREE.Vector3().crossVectors(Tn, N0).normalize()
  const B = new THREE.Vector3().crossVectors(Tn, N)
  const toAxis = (X) => { const d = X.clone().sub(Q); return d.addScaledVector(Un, -d.dot(Un)) }
  const runs = [[]]
  for (let k = 0; k < n; k++) {
    const phi = (k / n) * TAU
    const radial = N.clone().multiplyScalar(Math.cos(phi)).addScaledVector(B, Math.sin(phi))
    const start = P.clone().addScaledVector(radial, r)
    const f = (t) => toAxis(start.clone().addScaledVector(Tn, t)).length() - R
    let t = 0, hit = false
    if (f(0) <= 0) { runs.push([]); continue }
    for (; t < 0.4; t += 0.0015) if (f(t) <= 0) { hit = true; break }
    if (!hit) { runs.push([]); continue }
    let lo = t - 0.0015, hi = t
    for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m }
    const p = start.clone().addScaledVector(Tn, (lo + hi) / 2)
    if (keep && !keep(p)) { runs.push([]); continue }
    const n2 = toAxis(p).normalize()
    const bis = radial.clone().add(n2).normalize()
    runs[runs.length - 1].push(p.addScaledVector(bis, beadR * 0.28))
  }
  // a full ring comes back to the start: merge the last run into the first
  if (runs.length > 1 && runs[0].length && runs[runs.length - 1].length) { runs[0] = [...runs.pop(), ...runs[0]] }
  const out = []
  const full = runs.length === 1 && runs[0].length === n
  for (const run of runs) {
    if (run.length < 4) continue
    const c = new THREE.CatmullRomCurve3(run, full, 'centripetal')
    out.push(tube(c, { radius: beadR, tubular: run.length * 2, radial: 10, closed: full, caps: full ? 'none' : 'round' }))
  }
  return out
}

// fork + crown (steers with the handlebar)
export function buildFork(D, M) {
  const out = []
  const s = D.steer, n = D.steerN
  for (const side of [-1, 1]) {
    const lat = (z) => v3(0, 0, side * z)
    const c = spline([
      D.crown.clone().addScaledVector(s, -0.004).add(lat(0.036)),
      D.crown.clone().addScaledVector(s, -0.15).add(lat(0.041)),
      D.steerFoot.clone().addScaledVector(s, 0.085).addScaledVector(n, 0.006).add(lat(0.046)),
      D.front.clone().addScaledVector(s, 0.02).addScaledVector(n, -0.002).add(lat(D.frontHalfOLD - 0.003)),
    ])
    out.push(part(tube(c, { radius: (t) => 0.0122 - t * 0.0038, tubular: 48, radial: 22, caps: 'flat' }), M.paint, side > 0 ? 'forcellaDx' : 'forcellaSx', { label: 'Forcella' }))
    // dropout tab
    const tab = new THREE.Shape()
    tab.moveTo(-0.006, 0.02); tab.lineTo(0.006, 0.02); tab.lineTo(0.009, 0.0); tab.absarc(0, 0, 0.009, 0, Math.PI, true); tab.lineTo(-0.006, 0.02)
    const g = extrude(tab, 0.0035, { bevel: 0.0007 })
    const m = new THREE.Matrix4().makeBasis(n.clone(), s.clone(), v3(0, 0, 1)).setPosition(D.front.x, D.front.y, side * (D.frontHalfOLD - 0.001))
    out.push(part(g.applyMatrix4(m), M.paint, 'puntaleForcella' + side, { sticker: false }))
  }
  // crown: rounded bar across, normal to the steering axis
  const crownCurve = new THREE.LineCurve3(D.crown.clone().add(v3(0, 0, -0.047)), D.crown.clone().add(v3(0, 0, 0.047)))
  const crown = tube(crownCurve, { radius: 0.0135, tubular: 1, radial: 32, caps: 'round', capSegments: 8 })
  // flatten along steering axis to a lozenge
  const pos = crown.attributes.position
  const tmp = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i).sub(D.crown)
    const along = tmp.dot(s)
    tmp.addScaledVector(s, -along * 0.42)
    pos.setXYZ(i, tmp.x + D.crown.x, tmp.y + D.crown.y, tmp.z + D.crown.z)
  }
  crown.computeVertexNormals()
  out.push(part(crown, M.paint, 'testaForcella', { sticker: false }))
  out.push(part(merge([
    hexNut(v3(D.front.x, D.front.y, D.frontHalfOLD + 0.005), v3(0, 0, 1), 0.0082, 0.007),
    hexNut(v3(D.front.x, D.front.y, -D.frontHalfOLD - 0.005), v3(0, 0, -1), 0.0082, 0.007),
    rod(v3(D.front.x, D.front.y, -D.frontHalfOLD - 0.01), v3(D.front.x, D.front.y, D.frontHalfOLD + 0.01), 0.0044, { radial: 12 }),
  ]), M.chrome, 'dadiRuotaAnt', { sticker: false }))
  return out
}

export function roundedRect(w, h, r) {
  const s = new THREE.Shape()
  const x = -w / 2, y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
  return s
}

export function hexNut(center, axis, r, h) {
  const g = latheZ([[0.0001, -h / 2], { r, z: -h / 2, crease: true }, { r, z: h / 2, crease: true }, [0.0001, h / 2]], { segments: 6, phiStart: Math.PI / 6 })
  // chamfer look comes from flat facets; normals per facet
  const flat = g.toNonIndexed()
  flat.computeVertexNormals()
  flat.userData.wrap = [0, 0]
  return xf(flat, basisZ(center, axis))
}

export function knurledNut(center, axis, rIn, rOut, h) {
  const prof = [[rIn, -h / 2], { r: rOut - 0.0008, z: -h / 2, crease: true }, [rOut, -h / 2 + 0.0008], [rOut, h / 2 - 0.0008], { r: rOut - 0.0008, z: h / 2, crease: true }, [rIn, h / 2]]
  const g = latheZ(prof, { segments: 72 })
  // knurl: modulate radius of the outer band
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i)
    const r = Math.hypot(x, y)
    if (r > rOut - 0.0009) {
      const a = Math.atan2(y, x)
      const k = (r - 0.00045 * (0.5 + 0.5 * Math.cos(a * 36))) / r
      pos.setXY(i, x * k, y * k)
    }
  }
  g.computeVertexNormals()
  return xf(g, basisZ(center, axis))
}
