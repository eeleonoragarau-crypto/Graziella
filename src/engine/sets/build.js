// Small geometry kit for the sets: quads and boxes with UVs in metres (so the
// shared Poly Haven textures tile at their real size), extruded profiles, and
// merging that tolerates missing vertex colours.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

// Quad spanned from `o` along `u` (width w) and `v` (height h); faces u x v.
// UVs: (uv0 + s * w, uv0 + t * h) in metres. Optional grid resolution.
export function quad(o, u, v, w, h, { uv0 = [0, 0], seg = [1, 1], color = null } = {}) {
  const [nu, nv] = seg
  const n = new THREE.Vector3().crossVectors(u, v).normalize()
  const P = [], N = [], UV = [], C = [], I = []
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const s = i / nu, t = j / nv
      const p = o.clone().addScaledVector(u, s * w).addScaledVector(v, t * h)
      P.push(p.x, p.y, p.z)
      N.push(n.x, n.y, n.z)
      UV.push(uv0[0] + s * w, uv0[1] + t * h)
      if (color) { const c = color(p, s, t); C.push(c[0], c[1], c[2], c[3] ?? 1) }
    }
  }
  const row = nu + 1
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * row + i, b = a + 1, c = a + row, d = c + 1
    I.push(a, b, d, a, d, c)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2))
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4))
  g.setIndex(I)
  return g
}

// Axis-aligned box with metric UVs on every face. `inward` flips it (rooms).
// `skip` lists faces to leave out: 'px','nx','py','ny','pz','nz'.
export function box(min, max, { inward = false, skip = [], color = null } = {}) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max
  const W = x1 - x0, Hh = y1 - y0, D = z1 - z0
  const faces = {
    px: () => quad(v3(x1, y0, z1), v3(0, 0, -1), v3(0, 1, 0), D, Hh, { uv0: [-z1, y0], color }),
    nx: () => quad(v3(x0, y0, z0), v3(0, 0, 1), v3(0, 1, 0), D, Hh, { uv0: [z0, y0], color }),
    py: () => quad(v3(x0, y1, z1), v3(1, 0, 0), v3(0, 0, -1), W, D, { uv0: [x0, -z1], color }),
    ny: () => quad(v3(x0, y0, z0), v3(1, 0, 0), v3(0, 0, 1), W, D, { uv0: [x0, z0], color }),
    pz: () => quad(v3(x0, y0, z1), v3(1, 0, 0), v3(0, 1, 0), W, Hh, { uv0: [x0, y0], color }),
    nz: () => quad(v3(x1, y0, z0), v3(-1, 0, 0), v3(0, 1, 0), W, Hh, { uv0: [-x1, y0], color }),
  }
  const gs = Object.entries(faces).filter(([k]) => !skip.includes(k)).map(([, f]) => f())
  const g = merge(gs)
  if (inward) flip(g)
  return g
}

export function flip(g) {
  const idx = g.index.array
  for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t }
  g.index.needsUpdate = true
  const n = g.attributes.normal
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
  n.needsUpdate = true
  return g
}

// Merge geometries; ones without vertex colours get white RGBA.
export function merge(gs) {
  const list = gs.filter(Boolean).map((g) => (g.index ? g : indexed(g)))
  const anyColor = list.some((g) => g.attributes.color)
  for (const g of list) {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (anyColor && !g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 4).fill(1), 4))
    if (anyColor && g.attributes.color.itemSize === 3) {
      const c3 = g.attributes.color, c4 = new Float32Array(c3.count * 4)
      for (let i = 0; i < c3.count; i++) { c4[i * 4] = c3.getX(i); c4[i * 4 + 1] = c3.getY(i); c4[i * 4 + 2] = c3.getZ(i); c4[i * 4 + 3] = 1 }
      g.setAttribute('color', new THREE.Float32BufferAttribute(c4, 4))
    }
    g.morphAttributes = {}
  }
  return mergeGeometries(list, false)
}

function indexed(g) {
  const n = g.attributes.position.count
  g.setIndex(Array.from({ length: n }, (_, i) => i))
  return g
}

// transform a geometry and keep its winding if the matrix mirrors
export function xf(g, m) {
  g.applyMatrix4(m)
  if (m.determinant() < 0) {
    const idx = g.index.array
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t }
    g.index.needsUpdate = true
  }
  return g
}

// A closed 2D profile (points [a, b] in the plane spanned by `ua`, `ub`)
// extruded along `axis` for `len`. UVs: (arc length, distance along axis).
// Profile must be counter-clockwise seen with `axis` pointing at the viewer.
export function extrudeProfile(pts, origin, ua, ub, axis, len, { caps = true, closed = true, smooth = false } = {}) {
  if (closed) {
    let area = 0
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1] }
    if (area < 0) pts = pts.slice().reverse()
  }
  const n = pts.length
  const P = [], N = [], UV = [], I = []
  const seg = closed ? n : n - 1
  // per-edge (flat) or per-vertex (smooth) normals in 2D
  const edgeN = []
  for (let i = 0; i < seg; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
    edgeN.push([dy / l, -dx / l])
  }
  let arc = 0
  const pos3 = (p, t) => origin.clone().addScaledVector(ua, p[0]).addScaledVector(ub, p[1]).addScaledVector(axis, t)
  for (let i = 0; i < seg; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    let na = edgeN[i], nb = edgeN[i]
    if (smooth) {
      const prev = edgeN[(i - 1 + seg) % seg], next = edgeN[(i + 1) % seg]
      if (closed || i > 0) na = norm2([edgeN[i][0] + prev[0], edgeN[i][1] + prev[1]])
      if (closed || i < seg - 1) nb = norm2([edgeN[i][0] + next[0], edgeN[i][1] + next[1]])
    }
    const base = P.length / 3
    for (const [p, nn, u] of [[a, na, arc], [b, nb, arc + l]]) {
      for (const t of [0, len]) {
        const q = pos3(p, t)
        const n3 = new THREE.Vector3().addScaledVector(ua, nn[0]).addScaledVector(ub, nn[1]).normalize()
        P.push(q.x, q.y, q.z); N.push(n3.x, n3.y, n3.z); UV.push(u, t)
      }
    }
    // a0 a1 b0 b1
    I.push(base, base + 2, base + 3, base, base + 3, base + 1)
    arc += l
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2))
  g.setIndex(I)
  const out = [g]
  if (caps && closed) {
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])))
    for (const [t, dir] of [[0, -1], [len, 1]]) {
      const sg = new THREE.ShapeGeometry(shape)
      const p = sg.attributes.position
      const nrm = axis.clone().multiplyScalar(dir)
      const Nn = [], Uv = []
      for (let i = 0; i < p.count; i++) {
        const q = pos3([p.getX(i), p.getY(i)], t)
        Uv.push(p.getX(i), p.getY(i))
        p.setXYZ(i, q.x, q.y, q.z)
        Nn.push(nrm.x, nrm.y, nrm.z)
      }
      sg.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3))
      sg.setAttribute('uv', new THREE.Float32BufferAttribute(Uv, 2))
      orient(sg)
      out.push(sg)
    }
  }
  return orient(merge(out))
}

const norm2 = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l] }

// re-wind every triangle to agree with its vertex normals
export function orient(g) {
  const p = g.attributes.position, n = g.attributes.normal, idx = g.index.array
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3()
  for (let k = 0; k < idx.length; k += 3) {
    a.fromBufferAttribute(p, idx[k]); b.fromBufferAttribute(p, idx[k + 1]); c.fromBufferAttribute(p, idx[k + 2])
    fn.subVectors(b, a).cross(c.sub(a))
    vn.fromBufferAttribute(n, idx[k]).add(c.fromBufferAttribute(n, idx[k + 1])).add(b.fromBufferAttribute(n, idx[k + 2]))
    if (fn.dot(vn) < 0) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t }
  }
  g.index.needsUpdate = true
  return g
}

// cylinder between two points (for pipes, rods, tubes); metric UVs
export function cylinder(a, b, r, { radial = 16, caps = true } = {}) {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1, !caps)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r, uv.getY(i) * len)
  const dir = b.clone().sub(a).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir)
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, v3(1, 1, 1))
  g.applyMatrix4(m)
  return g
}

export function mesh(geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat)
  m.name = name
  m.castShadow = cast
  m.receiveShadow = receive
  if (!cast) m.userData.noShadow = true
  return m
}

// small seeded random
export function rng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
