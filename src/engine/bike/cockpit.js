// Tall chrome quill stem, swept city bar, ribbed grips, bell, brake levers,
// side-pull calipers and cable housings.
import * as THREE from 'three'
import { tube, latheZ, merge, rod, spline, xf, basisZ, extrude, v3, TAU } from '../geo.js'
import { part } from './part.js'
import { hexNut } from './frame.js'

export function buildCockpit(D, M) {
  const out = { steer: [], bar: [] }
  const s = D.steer
  // quill stem: rises out of the head tube along the steering axis
  const stemBase = D.htTop.clone().addScaledVector(s, -0.06)
  const stem = tube(new THREE.LineCurve3(stemBase, D.stemTop), { radius: 0.0111, tubular: 1, radial: 32, caps: 'flat' })
  // neck forward to the bar clamp
  const neck = spline([D.stemTop.clone().addScaledVector(s, -0.012), D.stemTop.clone().add(v3(0.012, 0.004, 0)), D.barClamp.clone().add(v3(-0.008, 0, 0))])
  const neckG = tube(neck, { radius: 0.0105, tubular: 16, radial: 24, caps: 'round' })
  const clamp = xf(latheZ([[0.0118, -0.022], { r: 0.0152, z: -0.022, crease: true }, [0.0156, -0.019], [0.0156, 0.019], { r: 0.0152, z: 0.022, crease: true }, [0.0118, 0.022]], { segments: 40 }), basisZ(D.barClamp, v3(0, 0, 1)))
  const boltHead = hexNut(D.stemTop.clone().addScaledVector(s, 0.004), s, 0.0068, 0.006)
  const clampBolt = merge([
    rod(D.barClamp.clone().add(v3(-0.004, -0.019, -0.012)), D.barClamp.clone().add(v3(-0.004, -0.019, 0.012)), 0.0024, { radial: 10 }),
    hexNut(D.barClamp.clone().add(v3(-0.004, -0.019, 0.0135)), v3(0, 0, 1), 0.0045, 0.004),
  ])
  out.steer.push(part(stem, M.chrome, 'attaccoManubrio', { label: 'Attacco manubrio' }))
  out.steer.push(part(merge([neckG, clamp]), M.chrome, 'collarinoManubrio', { sticker: false }))
  out.steer.push(part(merge([boltHead, clampBolt]), M.chromeSoft, 'bulloniAttacco', { sticker: false }))

  // handlebar: one continuous swept tube, left end to right end
  const C = D.barClamp
  const half = (sz) => [
    [-0.2, 0.128, sz * 0.272], [-0.115, 0.125, sz * 0.258], [-0.052, 0.103, sz * 0.222], [-0.018, 0.058, sz * 0.165], [-0.004, 0.018, sz * 0.105], [0, 0.002, sz * 0.055],
  ]
  const L = half(-1), R = half(1).reverse()
  const barPts = [...L, [0, 0, 0], ...R].map((p) => v3(C.x + p[0], C.y + p[1], C.z + p[2]))
  const barCurve = new THREE.CatmullRomCurve3(barPts, false, 'centripetal')
  const bar = tube(barCurve, { radius: 0.0111, tubular: 260, radial: 24, caps: 'round' })
  out.bar.push(part(bar, M.chrome, 'manubrio', { label: 'Manubrio' }))

  // grips on both ends (along the end tangent)
  const gripGeo = gripLathe()
  for (const t of [0, 1]) {
    const p = barCurve.getPointAt(t)
    const tan = barCurve.getTangentAt(t).multiplyScalar(t === 0 ? -1 : 1) // pointing outward along the bar end
    const g = gripGeo.clone()
    // grip lathe is built along +Z from 0 (inner) to 0.118 (outer end); place it so the outer end sits at the bar end
    xf(g, basisZ(p.clone().addScaledVector(tan, -0.112), tan))
    out.bar.push(part(g, M.grip, t === 0 ? 'manopolaSx' : 'manopolaDx', { label: 'Manopola' }))
  }

  // bell on the left, near the stem
  const bellT = 0.3
  const bp = barCurve.getPointAt(bellT)
  const bellUp = v3(0.15, 1, 0.1).normalize()
  const bellC = bp.clone().addScaledVector(bellUp, 0.0175)
  const bellF = basisZ(bellC, bellUp)
  const dome = xf(latheZ([[0.0001, 0.0205], [0.0082, 0.0198], [0.016, 0.0168], [0.0222, 0.0112], [0.0262, 0.004], { r: 0.0276, z: -0.0008, crease: true }, [0.0268, -0.0022], [0.0245, -0.0016]], { segments: 72, flip: true }), bellF)
  const base = xf(latheZ([[0.0001, -0.0055], [0.0165, -0.0055], [0.0172, -0.0028], [0.014, -0.001], [0.0001, -0.001]], { segments: 48 }), bellF)
  const bellClamp = xf(latheZ([[0.0114, -0.006], { r: 0.0142, z: -0.006, crease: true }, { r: 0.0142, z: 0.006, crease: true }, [0.0114, 0.006]], { segments: 32 }), basisZ(bp, barCurve.getTangentAt(bellT)))
  const lever = spline([bellC.clone().add(v3(-0.008, -0.004, 0.004)), bellC.clone().add(v3(-0.022, -0.006, 0.011)), bellC.clone().add(v3(-0.035, -0.004, 0.012))])
  const leverG = tube(lever, { radius: (t) => 0.0028 + t * 0.0022, tubular: 16, radial: 12, caps: 'round' })
  const bellMesh = part(dome, M.chrome, 'campanello', { label: 'Campanello' })
  bellMesh.userData.bell = true
  out.bar.push(bellMesh)
  out.bar.push(part(merge([base, bellClamp, leverG]), M.chromeSoft, 'levaCampanello', { sticker: false }))
  out.bellMesh = bellMesh

  // brake levers (inboard of the grips): clamp band, a stamped body round the
  // pivot, and a flat blade curving under the grip; the cable leaves the body
  // at the front through a ferrule
  const levers = []
  const leverEnds = []
  // just inboard of the grips (grip = last 112 mm of each bar end)
  const barLen = barCurve.getLength()
  const tIn = (0.112 + 0.011) / barLen
  for (const t of [tIn, 1 - tIn]) {
    const p = barCurve.getPointAt(t)
    const tan = barCurve.getTangentAt(t)
    const sz = t < 0.5 ? -1 : 1
    const outward = tan.clone().multiplyScalar(t < 0.5 ? -1 : 1).normalize()      // toward the grip end
    let fd = v3(1, -0.85, 0)
    fd.addScaledVector(outward, -fd.dot(outward)).normalize()                      // forward-down, normal to the bar
    const nrm = new THREE.Vector3().crossVectors(outward, fd).normalize()
    const plane = new THREE.Matrix4().makeBasis(outward, fd, nrm)
    const at = (a, b, c = 0) => p.clone().addScaledVector(outward, a).addScaledVector(fd, b).addScaledVector(nrm, c)
    levers.push(xf(latheZ([[0.0113, -0.0085], { r: 0.0152, z: -0.0085, crease: true }, { r: 0.0152, z: 0.0085, crease: true }, [0.0113, 0.0085]], { segments: 32 }), basisZ(p, tan)))
    // body: rounded block on the forward-down side of the clamp
    const body = xf(extrude(roundedRectShape(0.03, 0.022, 0.0075), 0.0125, { bevel: 0.0022, bevelSegments: 3 }), plane)
    body.translate(...at(0.006, 0.02).toArray())
    levers.push(body)
    // blade: flat band in the lever plane, from the pivot curving under the grip
    const bladePts = [[0.0, 0.026], [0.02, 0.034], [0.052, 0.04], [0.085, 0.036], [0.104, 0.029]].map(([a, b]) => [a, b])
    const blade = xf(extrude(bandShape(bladePts, 0.0125, 0.0085), 0.0034, { bevel: 0.0009, bevelSegments: 2, curveSegments: 8 }), plane)
    blade.translate(...p.toArray())
    levers.push(blade)
    // pivot rivet through body and blade
    levers.push(rod(at(0.002, 0.026, -0.0085), at(0.002, 0.026, 0.0085), 0.0021, { radial: 12, caps: 'round' }))
    // cable ferrule at the front of the body
    const exit = at(0.0, 0.034, 0).add(v3(0.004, 0, 0))
    const exitDir = fd.clone().multiplyScalar(0.55).add(v3(0.8, 0, 0)).normalize()
    levers.push(xf(latheZ([[0.0016, -0.004], { r: 0.0033, z: -0.004, crease: true }, { r: 0.0033, z: 0.004, crease: true }, [0.0016, 0.004]], { segments: 16 }), basisZ(exit, exitDir)))
    leverEnds.push({ p: exit.clone().addScaledVector(exitDir, 0.004), dir: exitDir, side: sz })
  }
  out.bar.push(part(merge(levers), M.chrome, 'leveFreno', { sticker: false }))
  out.leverEnds = leverEnds
  out.barCurve = barCurve
  return out
}

function gripLathe() {
  const P = [[0.0112, 0]]
  const len = 0.112, n = 9
  P.push({ r: 0.0158, z: 0.0006, crease: true })
  for (let i = 0; i <= n * 4; i++) {
    const z = 0.004 + (i / (n * 4)) * (len - 0.012)
    const k = Math.sin((i / 4) * Math.PI)
    P.push([0.0154 + Math.abs(k) * 0.0012, z])
  }
  P.push([0.0172, len - 0.004], [0.0188, len - 0.0015], [0.018, len + 0.0012], [0.0105, len + 0.0022], [0.0001, len + 0.0022])
  return latheZ(P, { segments: 40 })
}

// Side-pull caliper (1960s style): two flat stamped arms stacked on a
// central bolt straddle the fender and tyre down to the rim; chrome shoes with
// rubber pads, a wire return spring, an acorn nut in front, a barrel adjuster
// where the housing stops and an anchor bolt clamping the inner wire.
// `wheelC` = axle, `mount` = pivot above the tyre, `face` = the bolt axis,
// pointing to the side the caliper hangs on.
export function buildCaliper(M, wheelC, mount, name, face) {
  const rad = mount.clone().sub(wheelC); rad.z = 0
  const Rm = rad.length(); rad.normalize()                  // local "up" (away from the axle)
  const F = (face ? face.clone() : v3(-rad.y, rad.x, 0)).normalize()
  const Z = v3(0, 0, 1)
  // local 2D (x = lateral, y = radial) -> world, at depth d along F
  const W = (x, y, d = 0) => mount.clone().addScaledVector(Z, x).addScaledVector(rad, y).addScaledVector(F, d)
  const basis = new THREE.Matrix4().makeBasis(Z, rad, F)
  const yPad = 0.1995 - Rm                                   // pad centre height (rim braking face)
  const chrome = [], dark = [], pads = []
  const thick = 0.0036
  // right arm centreline (x > 0); the left arm mirrors it one layer behind
  const armPts = [[-0.009, 0.013], [0.0, 0.0], [0.014, -0.005], [0.031, -0.022], [0.041, -0.052], [0.04, -0.09], [0.031, yPad + 0.018], [0.0205, yPad + 0.004]]
  const armShape = (sx) => bandShape(armPts.map(([x, y]) => [x * sx, y]), 0.0098, 0.0072)
  for (const [sx, layer] of [[1, 0.0022], [-1, -0.0022]]) {
    const g = xf(extrude(armShape(sx), thick, { bevel: 0.0008, bevelSegments: 2, curveSegments: 10 }), basis)
    g.translate(...W(0, 0, layer).toArray())
    chrome.push(g)
    // shoe (chrome channel) + pad, along F, facing the rim
    const shoeC = W(sx * 0.0178, yPad, 0)
    const shoe = xf(extrude(roundedRectShape(0.046, 0.0105, 0.0025), 0.006, { bevel: 0.0008, bevelSegments: 2 }), new THREE.Matrix4().makeBasis(F, rad, Z))
    shoe.translate(...shoeC.clone().addScaledVector(Z, sx * 0.0012).toArray())
    chrome.push(shoe)
    const pad = xf(extrude(roundedRectShape(0.04, 0.0082, 0.002), 0.0042, { bevel: 0.0007, bevelSegments: 2 }), new THREE.Matrix4().makeBasis(F, rad, Z))
    pad.translate(...shoeC.clone().addScaledVector(Z, -sx * 0.0036).toArray())
    pads.push(pad)
    // shoe stud and nut through the arm slot
    chrome.push(rod(shoeC, shoeC.clone().addScaledVector(Z, sx * 0.012), 0.0024, { radial: 10 }))
    chrome.push(hexNut(shoeC.clone().addScaledVector(Z, sx * 0.0115), Z.clone().multiplyScalar(sx), 0.0042, 0.0035))
  }
  // central bolt, acorn nut in front, washer + nut behind the crown
  chrome.push(rod(W(0, 0, -0.03), W(0, 0, 0.012), 0.0031, { radial: 14 }))
  chrome.push(xf(latheZ([[0.0001, -0.0035], { r: 0.0056, z: -0.0035, crease: true }, [0.0056, 0.0], [0.0048, 0.0028], [0.0026, 0.0048], [0.0001, 0.0054]], { segments: 24 }), basisZ(W(0, 0, 0.0095), F)))
  chrome.push(hexNut(W(0, 0, -0.026), F.clone().negate(), 0.0058, 0.005))
  // return spring: two coils round the bolt, legs bearing on both arms
  {
    const pts = []
    for (let i = 0; i <= 90; i++) {
      const t = i / 90, a = Math.PI * 0.5 + t * TAU * 2
      pts.push(W(Math.cos(a) * 0.0068, Math.sin(a) * 0.0068, -0.0052 - t * 0.0026))
    }
    const legR = [W(0.0068 * Math.cos(Math.PI * 0.5), 0.0068, -0.0078), W(0.016, 0.004, -0.0076), W(0.024, -0.012, -0.0028)]
    const legL = [W(0, 0.0068, -0.0052), W(-0.016, 0.004, -0.0054), W(-0.024, -0.012, -0.0068)]
    chrome.push(tube(new THREE.CatmullRomCurve3(pts), { radius: 0.0009, tubular: 180, radial: 6 }))
    chrome.push(tube(new THREE.CatmullRomCurve3(legR), { radius: 0.0009, tubular: 20, radial: 6, caps: 'round' }))
    chrome.push(tube(new THREE.CatmullRomCurve3(legL), { radius: 0.0009, tubular: 20, radial: 6, caps: 'round' }))
  }
  // barrel adjuster on the left arm's tail, anchor bolt on the right arm's tail
  const barrelP = W(-0.0095, 0.0162, -0.0022)
  const barrelDir = v3(0, 0, 0).addScaledVector(rad, 1).addScaledVector(Z, -0.25).normalize()
  chrome.push(xf(latheZ([[0.0012, -0.004], { r: 0.0036, z: -0.004, crease: true }, { r: 0.0036, z: 0.0035, crease: true }, [0.0012, 0.0035]], { segments: 16 }), basisZ(barrelP.clone().addScaledVector(barrelDir, 0.004), barrelDir)))
  chrome.push(xf(knurl(0.0048, 0.0024), basisZ(barrelP.clone().addScaledVector(barrelDir, 0.0005), barrelDir)))
  const anchorP = W(0.022, -0.009, 0.0048)
  chrome.push(rod(anchorP.clone().addScaledVector(F, -0.004), anchorP.clone().addScaledVector(F, 0.004), 0.0023, { radial: 10 }))
  chrome.push(hexNut(anchorP.clone().addScaledVector(F, 0.0045), F, 0.0042, 0.0032))
  // inner wire from the barrel down to the anchor
  const barrelTop = barrelP.clone().addScaledVector(barrelDir, 0.0078)
  const wire = tube(new THREE.CatmullRomCurve3([barrelP.clone().addScaledVector(barrelDir, 0.001), W(0.004, 0.006, 0.004), anchorP.clone().addScaledVector(F, 0.001), anchorP.clone().add(v3(0, 0, 0.006)).addScaledVector(rad, -0.01)]), { radius: 0.0007, tubular: 40, radial: 5, caps: 'round' })
  dark.push(wire)
  return {
    meshes: [
      part(merge(chrome), M.chrome, name, { sticker: false }),
      part(merge(pads), M.rubber, name + 'Pattini', { sticker: false }),
      part(merge(dark), M.steel, name + 'Filo', { sticker: false }),
    ],
    anchor: barrelTop,
    anchorDir: barrelDir,
  }
}

// a band along a 2D centreline (tapering width), round at both ends
function bandShape(pts, w0, w1) {
  const P = pts.map(([x, y]) => new THREE.Vector2(x, y))
  const n = P.length
  const L = [], R = []
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)]
    const t = b.clone().sub(a).normalize()
    const nn = new THREE.Vector2(-t.y, t.x)
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2
    L.push(P[i].clone().addScaledVector(nn, w)); R.push(P[i].clone().addScaledVector(nn, -w))
  }
  const s = new THREE.Shape()
  s.moveTo(L[0].x, L[0].y)
  for (let i = 1; i < n; i++) s.lineTo(L[i].x, L[i].y)
  // round end cap
  const e = P[n - 1], te = P[n - 1].clone().sub(P[n - 2]).normalize()
  const we = w1 / 2
  s.absarc(e.x, e.y, we, Math.atan2(L[n - 1].y - e.y, L[n - 1].x - e.x), Math.atan2(L[n - 1].y - e.y, L[n - 1].x - e.x) - Math.PI, true)
  void te
  for (let i = n - 1; i >= 0; i--) s.lineTo(R[i].x, R[i].y)
  const b0 = P[0], w0h = w0 / 2
  s.absarc(b0.x, b0.y, w0h, Math.atan2(R[0].y - b0.y, R[0].x - b0.x), Math.atan2(R[0].y - b0.y, R[0].x - b0.x) - Math.PI, true)
  return s
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape()
  const x = -w / 2, y = -h / 2
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
  return s
}

// knurled ring (barrel adjuster grip)
function knurl(r, h) {
  const g = latheZ([[r * 0.55, -h / 2], { r, z: -h / 2, crease: true }, { r, z: h / 2, crease: true }, [r * 0.55, h / 2]], { segments: 48 })
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), rr = Math.hypot(x, y)
    if (rr > r * 0.95) { const a = Math.atan2(y, x); const k = (rr - 0.00035 * (0.5 + 0.5 * Math.cos(a * 24))) / rr; pos.setXY(i, x * k, y * k) }
  }
  g.computeVertexNormals()
  return g
}

// Cable housing between world points; rebuilt when the ends move (folding).
export function cableGeo(points, r = 0.0026) {
  const c = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  return tube(c, { radius: r, tubular: 120, radial: 8, caps: 'round' })
}
