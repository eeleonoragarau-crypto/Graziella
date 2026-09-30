// Fenders, rack with spring clip, bullet headlamp, rear reflector, kickstand.
import * as THREE from 'three'
import { tube, latheZ, merge, rod, spline, xf, basisZ, v3, TAU, DEG } from '../geo.js'
import { part } from './part.js'

class Arc3 extends THREE.Curve {
  constructor(center, R, a0, a1, z = 0) { super(); Object.assign(this, { center, R, a0, a1, z }) }
  getPoint(t, target = new THREE.Vector3()) {
    const a = this.a0 + (this.a1 - this.a0) * t
    return target.set(this.center.x + Math.cos(a) * this.R, this.center.y + Math.sin(a) * this.R, this.center.z + this.z)
  }
}

// C-section fender swept along a circular arc around `center` (axle), rolled edges.
export function buildFender(center, { R, a0, a1, halfW = 0.03, crown = 0.013, segA = 180, segW = 26 }, mat, beadMat, name, underMat = null) {
  const rho = (halfW * halfW + crown * crown) / (2 * crown)
  const omega = Math.asin(halfW / rho)
  const P = [], N = [], U = [], I = []
  for (let i = 0; i <= segA; i++) {
    const t = a0 + (a1 - a0) * (i / segA)
    const c = Math.cos(t), s = Math.sin(t)
    for (let j = 0; j <= segW; j++) {
      const ang = omega * (-1 + (2 * j) / segW)
      const z = rho * Math.sin(ang)
      const h = rho * Math.cos(ang) - rho * Math.cos(omega)
      const rr = R + h
      P.push(center.x + c * rr, center.y + s * rr, center.z + z)
      N.push(c * Math.cos(ang), s * Math.cos(ang), Math.sin(ang))
      U.push(t * R, rho * ang)
    }
  }
  const cols = segW + 1
  for (let i = 0; i < segA; i++) for (let j = 0; j < segW; j++) {
    const a = i * cols + j, b = (i + 1) * cols + j
    I.push(a, a + 1, b, b, a + 1, b + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
  g.setIndex(I)
  // make sure the winding faces outward
  {
    const a = new THREE.Vector3().fromArray(P, I[0] * 3), b = new THREE.Vector3().fromArray(P, I[1] * 3), cc = new THREE.Vector3().fromArray(P, I[2] * 3)
    const fn = b.sub(a).cross(cc.sub(a))
    const vn = new THREE.Vector3().fromArray(N, I[0] * 3)
    if (fn.dot(vn) < 0) { for (let k = 0; k < I.length; k += 3) { const tt = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = tt } g.setIndex(I) }
  }
  const fender = part(g, mat, name, { label: 'Parafango' })
  // the underside of the sheet: same grid 0.8 mm in, facing the tyre
  const gi = g.clone()
  {
    const p = gi.attributes.position, nn = gi.attributes.normal
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) - nn.getX(i) * 0.0008, p.getY(i) - nn.getY(i) * 0.0008, p.getZ(i) - nn.getZ(i) * 0.0008)
      nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i))
    }
    const idx = gi.index.array.slice()
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t }
    gi.setIndex(Array.from(idx))
  }
  const fenderInner = part(gi, underMat || mat, name + 'Interno', { sticker: false })
  // rolled beads: two edges + both ends
  const beadR = 0.00165
  const beads = []
  for (const sz of [-1, 1]) beads.push(tube(new Arc3(center, R - 0.0002, a0, a1, sz * (halfW + 0.0004)), { radius: beadR, tubular: 180, radial: 10 }))
  for (const t of [a0, a1]) {
    const c = Math.cos(t), s = Math.sin(t)
    const pts = []
    for (let j = 0; j <= 16; j++) {
      const ang = omega * (-1 + (2 * j) / 16)
      const rr = R + rho * Math.cos(ang) - rho * Math.cos(omega)
      pts.push(v3(center.x + c * rr, center.y + s * rr, center.z + rho * Math.sin(ang)))
    }
    beads.push(tube(new THREE.CatmullRomCurve3(pts), { radius: beadR * 0.9, tubular: 24, radial: 8, caps: 'round' }))
  }
  const beadM = part(merge(beads), beadMat, name + 'Bordo', { sticker: false })
  return { fender, inner: fenderInner, beads: beadM, surfaceAt: (t, zz = 0) => {
    const ang = Math.asin(THREE.MathUtils.clamp(zz / rho, -1, 1))
    const rr = R + rho * Math.cos(ang) - rho * Math.cos(omega)
    return v3(center.x + Math.cos(t) * rr, center.y + Math.sin(t) * rr, center.z + zz)
  } }
}

export function buildFenders(D, M) {
  const rearCfg = { R: D.fenderR, a0: 16 * DEG, a1: 204 * DEG, halfW: 0.0305, crown: 0.0135 }
  const frontCfg = { R: D.fenderR, a0: 32 * DEG, a1: 196 * DEG, halfW: 0.0305, crown: 0.0135 }
  const rear = buildFender(D.rear, rearCfg, M.chrome, M.chrome, 'parafangoPost', M.chromeSoft)
  const front = buildFender(D.front, frontCfg, M.chrome, M.chrome, 'parafangoAnt', M.chromeSoft)
  // stays
  const stay = (axle, cfg, angDeg, halfOLD) => {
    const a = angDeg * DEG
    const parts = []
    for (const sz of [-1, 1]) {
      const p = v3(axle.x + Math.cos(a) * (cfg.R + 0.001), axle.y + Math.sin(a) * (cfg.R + 0.001), sz * (cfg.halfW + 0.0025))
      const q = v3(axle.x + Math.cos(a) * 0.012, axle.y + Math.sin(a) * 0.012, sz * (halfOLD + 0.0115))
      parts.push(rod(p, q, 0.0021, { radial: 10, caps: 'round' }))
      // clip on the fender edge
      parts.push(rod(p.clone().add(v3(0, 0, -sz * 0.004)), p.clone().add(v3(0, 0, sz * 0.0015)), 0.0034, { radial: 10, caps: 'round' }))
    }
    return merge(parts)
  }
  const rearStays = part(stay(D.rear, rearCfg, 158, D.rearHalfOLD), M.chrome, 'astineParafangoPost', { sticker: false })
  const frontStays = part(stay(D.front, frontCfg, 38, D.frontHalfOLD), M.chrome, 'astineParafangoAnt', { sticker: false })
  // front fender bracket up to the crown
  const topA = Math.atan2(D.crown.y - D.front.y, D.crown.x - D.front.x)
  const fTop = front.surfaceAt(topA, 0)
  const bracket = part(merge([
    rod(fTop, D.crown.clone().addScaledVector(D.steer, -0.012), 0.0042, { radial: 14 }),
    xf(latheZ([[0.0001, 0], { r: 0.0058, z: 0, crease: true }, [0.005, 0.0022], [0.0001, 0.003]], { segments: 20 }), basisZ(D.crown.clone().addScaledVector(D.steer, 0.009), D.steer)),
  ]), M.chrome, 'staffaParafango', { sticker: false })

  // rear reflector on the fender tail
  const ra = 186 * DEG
  const rp = rear.surfaceAt(ra, 0)
  const rn = v3(Math.cos(ra), Math.sin(ra), 0)
  const reflFrame = basisZ(rp.clone().addScaledVector(rn, 0.0035), rn)
  const bezel = xf(latheZ([[0.0185, -0.004], { r: 0.0232, z: -0.004, crease: true }, [0.0238, 0.0], [0.0226, 0.0042], { r: 0.0196, z: 0.0046, crease: true }, [0.0182, 0.0022]], { segments: 48 }), reflFrame)
  const lens = xf(latheZ([[0.0001, 0.0038], [0.012, 0.0036], [0.0192, 0.003], { r: 0.0194, z: 0.0024, crease: true }, { r: 0.0194, z: -0.002, crease: true }, [0.0001, -0.002]], { segments: 48, flip: true }), reflFrame)
  const reflector = [
    part(bezel, M.chrome, 'catadiottroCornice', { sticker: false }),
    part(lens, M.redLens, 'catadiottro', { sticker: false }),
  ]
  return { rear, front, rearStays, frontStays, bracket, reflector }
}

export function buildRack(D, M) {
  const y = D.rackY, hw = D.rackHalfW + 0.002
  const rails = []
  for (const sz of [-1, 1]) {
    const c = spline([
      [D.rackFrontX, y, sz * hw], [-0.3, y, sz * hw], [-0.575, y, sz * hw], [-0.626, y - 0.012, sz * hw],
      [-0.644, y - 0.05, sz * hw], [-0.628, y - 0.125, sz * hw], [-0.56, y - 0.215, sz * (hw + 0.001)],
      [D.rear.x - 0.018, D.rear.y + 0.012, sz * (hw + 0.002)],
    ])
    rails.push(tube(c, { radius: 0.0046, tubular: 140, radial: 14, caps: 'round' }))
    // flattened eyelet at the axle
    rails.push(xf(latheZ([[0.0048, -0.0018], { r: 0.0095, z: -0.0018, crease: true }, { r: 0.0095, z: 0.0018, crease: true }, [0.0048, 0.0018]], { segments: 24 }), basisZ(v3(D.rear.x, D.rear.y, sz * (hw + 0.002)), v3(0, 0, 1))))
  }
  const cross = []
  for (const x of [D.rackFrontX - 0.001, -0.34, -0.598]) cross.push(rod(v3(x, y, -hw), v3(x, y, hw), 0.0041, { radial: 12 }))
  for (const z of [-0.022, 0.022]) cross.push(rod(v3(D.rackFrontX, y + 0.0005, z), v3(-0.598, y + 0.0005, z), 0.0034, { radial: 10, caps: 'round' }))
  // every tube is its own mesh: sticker UV spaces must not overlap
  const tubes = [rails[0], rails[2], ...cross]
  const eyelets = merge([rails[1], rails[3]])
  // spring clip ("molla"): U-bar hinged at the front, two coil springs
  const clipY = y + 0.0088, cz = 0.049
  const clipPath = spline([
    [D.rackFrontX - 0.012, clipY - 0.004, -cz], [-0.2, clipY, -cz], [-0.5, clipY, -cz], [-0.575, clipY, -cz * 0.86],
    [-0.598, clipY, 0], [-0.575, clipY, cz * 0.86], [-0.5, clipY, cz], [-0.2, clipY, cz], [D.rackFrontX - 0.012, clipY - 0.004, cz],
  ], { type: 'centripetal' })
  const clip = tube(clipPath, { radius: 0.0033, tubular: 160, radial: 12, caps: 'round' })
  const springs = []
  for (const sz of [-1, 1]) {
    const pts = []
    const turns = 5, rr = 0.0062, len = 0.018
    for (let i = 0; i <= 120; i++) {
      const t = i / 120, a = t * turns * TAU
      pts.push(v3(D.rackFrontX - 0.001 + Math.cos(a) * rr, y + Math.sin(a) * rr, sz * cz - sz * len / 2 + sz * t * len))
    }
    springs.push(tube(new THREE.CatmullRomCurve3(pts), { radius: 0.0011, tubular: 240, radial: 6 }))
  }
  // clamp to the seat tube
  const tAt = (y - D.bb.y) / D.seatDir.y
  const stAt = D.bb.clone().addScaledVector(D.seatDir, tAt)
  const clampRing = latheZ([[D.stR + 0.0002, -0.008], { r: D.stR + 0.0026, z: -0.008, crease: true }, [D.stR + 0.0032, 0], { r: D.stR + 0.0026, z: 0.008, crease: true }, [D.stR + 0.0002, 0.008]], { segments: 40 })
  xf(clampRing, basisZ(stAt, D.seatDir))
  const tab = rod(stAt.clone().add(v3(-D.stR - 0.001, 0, 0)), v3(D.rackFrontX - 0.001, y, 0), 0.0036, { radial: 10 })
  const frame = new THREE.Group()
  frame.name = 'portapacchi'
  tubes.forEach((g, i) => frame.add(part(g, M.chrome, 'portapacchi' + i, { label: 'Portapacchi' })))
  frame.add(part(eyelets, M.chrome, 'portapacchiOcchielli', { sticker: false }))
  return {
    frame,
    clip: part(merge([clip, ...springs]), M.chrome, 'mollaPortapacchi', { sticker: false }),
    clamp: part(merge([clampRing, tab]), M.chromeSoft, 'attaccoPortapacchi', { sticker: false }),
  }
}

// Bullet headlamp on the fork crown: chrome shell, glass lens, reflector, bulb.
export function buildHeadlamp(D, M) {
  const axis = v3(1, -0.06, 0).normalize()
  const c = D.crown.clone().addScaledVector(D.steerN, 0.062).addScaledVector(D.steer, 0.018)
  const F = basisZ(c, axis)
  const shell = latheZ([
    [0.0001, -0.046], [0.011, -0.0452], [0.0205, -0.0405], [0.0272, -0.0325], [0.0312, -0.021], [0.0328, -0.008],
    { r: 0.0332, z: -0.001, crease: true }, [0.0348, 0.0008], [0.0352, 0.004], { r: 0.0347, z: 0.0072, crease: true }, [0.0316, 0.0074],
  ], { segments: 72 })
  const reflector = latheZ([[0.0001, -0.024], [0.009, -0.0222], [0.018, -0.0158], [0.0262, -0.0055], [0.0306, 0.0035], [0.0314, 0.0062]], { segments: 64, flip: true })
  // profile walks outward over the front: flip so the normals face out
  const lens = latheZ([
    [0.0001, 0.0118], [0.012, 0.011], [0.024, 0.0092], { r: 0.0315, z: 0.0075, crease: true }, { r: 0.0315, z: 0.0048, crease: true }, [0.0001, 0.0048],
  ], { segments: 64, flip: true })
  const bulb = new THREE.SphereGeometry(0.0046, 20, 12)
  bulb.translate(0, 0, -0.012)
  const socket = rod(v3(0, 0, -0.024), v3(0, 0, -0.014), 0.0032, { radial: 12 })
  // mounting ear + bolt to the crown
  const earA = v3(0, -0.028, -0.024), earB = v3(0, -0.038, -0.045)
  const ear = rod(earA, earB, 0.004, { radial: 12, caps: 'round' })
  for (const g of [shell, reflector, lens, bulb, socket, ear]) g.applyMatrix4(F)
  const earW = earB.clone().applyMatrix4(F)
  const bulbM = part(bulb, M.bulb, 'lampadina', { sticker: false })
  const lamp = [
    part(shell, M.chrome, 'fanale', { label: 'Fanale' }),
    part(reflector, M.chromeDS, 'parabola', { sticker: false }),
    part(lens, M.glass, 'lenteFanale', { sticker: false }),
    bulbM,
    part(merge([socket, ear, rod(earW, D.crown.clone().addScaledVector(D.steerN, 0.012), 0.0038, { radial: 12 })]), M.chromeSoft, 'staffaFanale', { sticker: false }),
  ]
  return { lamp, bulb: bulbM, lampCenter: c, lampAxis: axis }
}

export function buildKickstand(D, M) {
  const pivot = v3(-0.062, 0.271, -0.043)
  const leg = spline([[0, 0, 0], [-0.08, -0.012, -0.004], [-0.2, -0.026, -0.01], [-0.262, -0.032, -0.012]])
  const g = tube(leg, { radius: (t) => 0.0068 - t * 0.0018, tubular: 30, radial: 14, caps: 'round' })
  const foot = rod(v3(-0.262, -0.032, -0.012), v3(-0.276, -0.036, -0.014), 0.0072, { radial: 14, caps: 'round' })
  const mount = xf(latheZ([[0.0001, -0.009], { r: 0.0115, z: -0.009, crease: true }, { r: 0.0115, z: 0.009, crease: true }, [0.0001, 0.009]], { segments: 28 }), basisZ(v3(0, 0, 0), v3(0, 0, 1)))
  const legG = merge([g, foot, mount])
  const group = new THREE.Group()
  group.name = 'cavalletto'
  group.position.copy(pivot)
  group.add(part(legG, M.chromeSoft, 'cavalletto', { sticker: false }))
  const plate = part(xf(latheZ([[0.0001, -0.004], { r: 0.016, z: -0.004, crease: true }, { r: 0.016, z: 0.004, crease: true }, [0.0001, 0.004]], { segments: 6 }), basisZ(pivot.clone().add(v3(0, 0.004, 0.007)), v3(0, 0, 1))), M.darkSteel, 'piastraCavalletto', { sticker: false })
  return { group, plate }
}
