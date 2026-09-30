// Geometry kit for the procedural Graziella.
// Convention used by every sticker-able part: UVs are in METRES, so a sticker
// can be laid out on the surface without stretching. `geometry.userData.wrap`
// holds the period of a UV axis that wraps around (tubes wrap in v, lathes in u).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const TAU = Math.PI * 2
export const DEG = Math.PI / 180

const _v = new THREE.Vector3()
const _n = new THREE.Vector3()

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

// Make every triangle's winding agree with its (analytic, outward) vertex
// normals. Done per triangle, not by majority: a tube's end cap or a lathe's
// lid built in the "other" direction must not end up back-facing, or it gets
// culled and the part looks hollow.
export function orientToNormals(geo) {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const idx = geo.index
  if (!idx || !nor) return geo
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3()
  const arr = idx.array
  let flipped = 0
  for (let i = 0; i < arr.length; i += 3) {
    const i0 = arr[i], i1 = arr[i + 1], i2 = arr[i + 2]
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2)
    e1.subVectors(b, a); e2.subVectors(c, a); fn.crossVectors(e1, e2)
    if (fn.lengthSq() < 1e-20) continue
    vn.fromBufferAttribute(nor, i0).add(_v.fromBufferAttribute(nor, i1)).add(_n.fromBufferAttribute(nor, i2))
    if (fn.dot(vn) < 0) { arr[i + 1] = i2; arr[i + 2] = i1; flipped++ }
  }
  if (flipped) idx.needsUpdate = true
  return geo
}

// For geometries whose normals come from computeVertexNormals: make the whole
// shell face away from `inside` (a point known to be inside it).
export function orientOutward(geo, inside) {
  const pos = geo.attributes.position, idx = geo.index
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), m = new THREE.Vector3()
  let score = 0
  const arr = idx.array
  for (let i = 0; i < arr.length; i += 3) {
    a.fromBufferAttribute(pos, arr[i]); b.fromBufferAttribute(pos, arr[i + 1]); c.fromBufferAttribute(pos, arr[i + 2])
    fn.crossVectors(b.clone().sub(a), c.clone().sub(a))
    const area = fn.length()
    if (area < 1e-20) continue
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(inside)
    score += Math.sign(fn.dot(m)) * area
  }
  if (score < 0) {
    for (let i = 0; i < arr.length; i += 3) { const t = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = t }
    idx.needsUpdate = true
  }
  return geo
}

function build(positions, normals, uvs, indices) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  return orientToNormals(g)
}

// ---------------------------------------------------------------------------
// Tube swept along a Curve3 with parallel-transport frames and variable radius.
// u = arc length (m), v = angle * rRef (m). caps: 'none' | 'flat' | 'round'
export function tube(curve, opts = {}) {
  const {
    radius = 0.01, tubular = 64, radial = 24, closed = false,
    caps = 'none', twist = 0, capSegments = 6,
  } = opts
  const rOf = typeof radius === 'function' ? radius : () => radius
  const rRef = opts.rRef ?? rOf(0.5)
  const L = curve.getLength()
  const frames = curve.computeFrenetFrames(tubular, closed)
  const P = [], N = [], U = [], I = []
  const ringStart = []
  const pushRing = (point, T, Nn, B, r, drds, u) => {
    ringStart.push(P.length / 3)
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU + twist
      const c = Math.cos(a), s = Math.sin(a)
      const rx = c * Nn.x + s * B.x, ry = c * Nn.y + s * B.y, rz = c * Nn.z + s * B.z
      P.push(point.x + r * rx, point.y + r * ry, point.z + r * rz)
      _n.set(rx - drds * T.x, ry - drds * T.y, rz - drds * T.z).normalize()
      N.push(_n.x, _n.y, _n.z)
      U.push(u, (j / radial) * TAU * rRef)
    }
  }
  const pts = []
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular
    const p = curve.getPointAt(closed && i === tubular ? 0 : t)
    pts.push(p)
    const h = 1 / tubular
    const r = rOf(t)
    const drds = (rOf(Math.min(1, t + h * 0.5)) - rOf(Math.max(0, t - h * 0.5))) / (h * L)
    const k = closed && i === tubular ? 0 : i
    pushRing(p, frames.tangents[k], frames.normals[k], frames.binormals[k], r, drds, t * L)
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = ringStart[i] + j, b = ringStart[i + 1] + j
      I.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  if (!closed && caps !== 'none') {
    for (const end of [0, 1]) {
      const i = end ? tubular : 0
      const T = frames.tangents[i].clone().multiplyScalar(end ? 1 : -1)
      const Nn = frames.normals[i], B = frames.binormals[i]
      const r = rOf(end ? 1 : 0)
      const p = pts[i]
      if (caps === 'flat') {
        const center = P.length / 3
        P.push(p.x, p.y, p.z); N.push(T.x, T.y, T.z); U.push(-50 - end, 0)
        const first = P.length / 3
        for (let j = 0; j <= radial; j++) {
          const a = (j / radial) * TAU + twist
          const c = Math.cos(a), s = Math.sin(a)
          P.push(p.x + r * (c * Nn.x + s * B.x), p.y + r * (c * Nn.y + s * B.y), p.z + r * (c * Nn.z + s * B.z))
          N.push(T.x, T.y, T.z); U.push(-50 - end + c * r, s * r)
        }
        for (let j = 0; j < radial; j++) I.push(center, first + j, first + j + 1)
      } else {
        // hemispherical cap continuing the tube
        const rings = []
        for (let k = 1; k <= capSegments; k++) {
          const th = (k / capSegments) * (Math.PI / 2)
          const rr = r * Math.cos(th), off = r * Math.sin(th)
          const start = P.length / 3
          rings.push(start)
          for (let j = 0; j <= radial; j++) {
            const a = (j / radial) * TAU + twist
            const c = Math.cos(a), s = Math.sin(a)
            const rx = c * Nn.x + s * B.x, ry = c * Nn.y + s * B.y, rz = c * Nn.z + s * B.z
            P.push(p.x + rr * rx + off * T.x, p.y + rr * ry + off * T.y, p.z + rr * rz + off * T.z)
            _n.set(rx * Math.cos(th) + T.x * Math.sin(th), ry * Math.cos(th) + T.y * Math.sin(th), rz * Math.cos(th) + T.z * Math.sin(th)).normalize()
            N.push(_n.x, _n.y, _n.z)
            U.push(end ? L + th * r : -th * r, (j / radial) * TAU * rRef)
          }
        }
        let prev = ringStart[end ? tubular : 0]
        for (const cur of rings) {
          for (let j = 0; j < radial; j++) I.push(prev + j, cur + j, prev + j + 1, cur + j, cur + j + 1, prev + j + 1)
          prev = cur
        }
      }
    }
  }
  const g = build(P, N, U, I)
  g.userData.wrap = [0, TAU * rRef]
  g.userData.length = L
  return g
}

// ---------------------------------------------------------------------------
// Surface of revolution around the Z axis (wheels, hubs, lamps, bell...).
// profile: [[r, z], ...] or {r, z, crease}. u = phi * rRef, v = profile arc length.
export function latheZ(profile, opts = {}) {
  const { segments = 96, phiStart = 0, phiLength = TAU, flip = false } = opts
  const pts = profile.map((p) => (Array.isArray(p) ? { r: p[0], z: p[1] } : { ...p }))
  const rRef = opts.rRef ?? Math.max(...pts.map((p) => p.r))
  // expand creases into doubled points with one-sided normals
  const prof = []
  const segNormal = (a, b) => {
    const dr = b.r - a.r, dz = b.z - a.z
    const l = Math.hypot(dr, dz) || 1
    let nr = dz / l, nz = -dr / l
    if (flip) { nr = -nr; nz = -nz }
    return [nr, nz]
  }
  let acc = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (i > 0) acc += Math.hypot(p.r - pts[i - 1].r, p.z - pts[i - 1].z)
    const prev = pts[i - 1], next = pts[i + 1]
    if (p.crease && prev && next) {
      prof.push({ r: p.r, z: p.z, n: segNormal(prev, p), v: acc })
      prof.push({ r: p.r, z: p.z, n: segNormal(p, next), v: acc })
    } else {
      const a = prev || p, b = next || p
      prof.push({ r: p.r, z: p.z, n: segNormal(a, b), v: acc })
    }
  }
  const P = [], N = [], U = [], I = []
  const cols = segments + 1
  for (let i = 0; i < prof.length; i++) {
    const q = prof[i]
    for (let j = 0; j <= segments; j++) {
      const phi = phiStart + (j / segments) * phiLength
      const c = Math.cos(phi), s = Math.sin(phi)
      P.push(q.r * c, q.r * s, q.z)
      N.push(q.n[0] * c, q.n[0] * s, q.n[1])
      U.push(phi * rRef, q.v)
    }
  }
  for (let i = 0; i < prof.length - 1; i++) {
    if (prof[i].r === prof[i + 1].r && prof[i].z === prof[i + 1].z) continue // crease seam
    for (let j = 0; j < segments; j++) {
      const a = i * cols + j, b = (i + 1) * cols + j
      I.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = build(P, N, U, I)
  g.userData.wrap = [phiLength >= TAU - 1e-6 ? TAU * rRef : 0, 0]
  return g
}

// ---------------------------------------------------------------------------
// Rectangular grid surface from a function f(i/ni, j/nj) -> position.
// Normals computed from the grid; UVs supplied by uvf or metric chord lengths.
export function gridSurface(ni, nj, f, uvf) {
  const P = [], U = [], I = []
  for (let i = 0; i <= ni; i++) {
    for (let j = 0; j <= nj; j++) {
      const p = f(i / ni, j / nj)
      P.push(p.x, p.y, p.z)
      const uv = uvf ? uvf(i / ni, j / nj) : [i / ni, j / nj]
      U.push(uv[0], uv[1])
    }
  }
  const cols = nj + 1
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
    const a = i * cols + j, b = (i + 1) * cols + j
    I.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
  g.setIndex(I)
  g.computeVertexNormals()
  return g
}

// ---------------------------------------------------------------------------
// Extruded 2D shape. The shape lives in XY (metres), extrusion along +Z.
export function extrude(shape, depth, { bevel = 0, bevelSegments = 3, curveSegments = 24, center = true } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-5, depth - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel, bevelSize: bevel * 0.9, bevelOffset: 0,
    bevelSegments, curveSegments, steps: 1,
  })
  if (center) g.translate(0, 0, -depth / 2 + bevel)
  g.deleteAttribute('uv')
  // metric planar UVs (front face region), back face pushed away so a sticker
  // placed on the front never bleeds onto the back of the plate
  const pos = g.attributes.position, nor = g.attributes.normal
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const nz = nor.getZ(i)
    const off = nz > 0.5 ? 0 : nz < -0.5 ? 20 : 40
    uv[i * 2] = pos.getX(i) + off
    uv[i * 2 + 1] = pos.getY(i)
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

// ---------------------------------------------------------------------------
export function merge(geos) {
  const list = geos.filter(Boolean).map((g) => {
    let q = g.index ? g.toNonIndexed() : g
    for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k)
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2))
    if (!q.attributes.normal) q.computeVertexNormals()
    q.morphAttributes = {}
    return q
  })
  if (!list.length) return new THREE.BufferGeometry()
  return mergeGeometries(list, false)
}

// Cylinder (radius r) between two points, optional radial segments.
export function rod(a, b, r, { radial = 12, caps = 'flat' } = {}) {
  const curve = new THREE.LineCurve3(a.clone(), b.clone())
  return tube(curve, { radius: r, tubular: 1, radial, caps })
}

// Transform helper: returns a Matrix4 that maps +Y onto dir, positioned at p.
export function basisY(p, dir) {
  const d = dir.clone().normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)
  return new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1))
}

export function basisZ(p, dir, up = new THREE.Vector3(0, 1, 0)) {
  const z = dir.clone().normalize()
  let x = new THREE.Vector3().crossVectors(up, z)
  if (x.lengthSq() < 1e-8) x = new THREE.Vector3(1, 0, 0)
  x.normalize()
  const y = new THREE.Vector3().crossVectors(z, x)
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(p)
}

// Catmull-Rom helper with sensible defaults
export function spline(points, { tension = 0.5, type = 'centripetal' } = {}) {
  return new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p))), false, type, tension)
}

// Polyline with rounded corners (bent wire / tubing): straight runs joined by
// circular arcs of radius `bend`. Returns a CurvePath usable by tube().
export function bentPath(points, bend = 0.02) {
  const pts = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)))
  const path = new THREE.CurvePath()
  let cur = pts[0].clone()
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1]
    const d1 = b.clone().sub(a).normalize(), d2 = c.clone().sub(b).normalize()
    const ang = Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1))
    const cut = Math.min(bend * Math.tan(ang / 2), a.distanceTo(b) * 0.49, b.distanceTo(c) * 0.49)
    const p1 = b.clone().addScaledVector(d1, -cut)
    const p2 = b.clone().addScaledVector(d2, cut)
    if (cur.distanceTo(p1) > 1e-6) path.add(new THREE.LineCurve3(cur.clone(), p1))
    path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2))
    cur = p2
  }
  path.add(new THREE.LineCurve3(cur, pts[pts.length - 1].clone()))
  return path
}

// Apply a matrix to a geometry and return it (chainable). A mirroring matrix
// (negative determinant) would turn every triangle inside out: re-wind them.
export function xf(geo, m) {
  geo.applyMatrix4(m)
  if (m.determinant() < 0) flipWinding(geo)
  return geo
}

export function flipWinding(geo) {
  if (geo.index) {
    const a = geo.index.array
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t }
    geo.index.needsUpdate = true
  } else {
    for (const k of Object.keys(geo.attributes)) {
      const attr = geo.attributes[k], sz = attr.itemSize, arr = attr.array
      for (let i = 0; i < attr.count; i += 3) for (let c = 0; c < sz; c++) {
        const t = arr[(i + 1) * sz + c]; arr[(i + 1) * sz + c] = arr[(i + 2) * sz + c]; arr[(i + 2) * sz + c] = t
      }
      attr.needsUpdate = true
    }
  }
  return geo
}

// Mirror a geometry across the XY plane (z -> -z) keeping winding correct.
export function mirrorZ(geo) {
  const g = geo.clone()
  g.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1))
  if (g.index) {
    const arr = g.index.array
    for (let i = 0; i < arr.length; i += 3) { const t = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = t }
  } else {
    const flipAttr = (attr) => {
      const s = attr.itemSize, a = attr.array
      for (let i = 0; i < attr.count; i += 3) for (let k = 0; k < s; k++) {
        const t = a[(i + 1) * s + k]; a[(i + 1) * s + k] = a[(i + 2) * s + k]; a[(i + 2) * s + k] = t
      }
    }
    for (const k of Object.keys(g.attributes)) flipAttr(g.attributes[k])
  }
  return g
}
