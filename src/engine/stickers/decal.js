// Wrap-around decals in the part's metric UV space.
// Every sticker-able part has UVs in metres (tubes: u = length, v = arc; lathes:
// u = arc, v = profile), so a sticker is a rectangle laid out in that space,
// rotated and scaled by the local surface metric. Triangles are clipped exactly
// to the rectangle, so a sticker wraps around a tube like real vinyl and stops
// cleanly at its edge, in raster and in the path tracer alike.
import * as THREE from 'three'

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3()
const _ta = new THREE.Vector2(), _tb = new THREE.Vector2(), _tc = new THREE.Vector2()
const _tri = new THREE.Triangle(), _cp = new THREE.Vector3()

// Local frame at a UV location on `geo`: finds the triangle containing uv.
// Merged parts can have several triangles with the same uv: `ref` (a local
// 3D point) picks the one physically closest.
export function frameAt(geo, uv, hintFace = -1, ref = null) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, tuv = geo.attributes.uv
  const idx = geo.index
  const triCount = idx ? idx.count / 3 : pos.count / 3
  const vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k)
  const test = (t) => {
    const i0 = vi(t, 0), i1 = vi(t, 1), i2 = vi(t, 2)
    _ta.fromBufferAttribute(tuv, i0); _tb.fromBufferAttribute(tuv, i1); _tc.fromBufferAttribute(tuv, i2)
    const d = (_tb.x - _ta.x) * (_tc.y - _ta.y) - (_tc.x - _ta.x) * (_tb.y - _ta.y)
    if (Math.abs(d) < 1e-14) return null
    const l1 = ((uv.x - _ta.x) * (_tc.y - _ta.y) - (_tc.x - _ta.x) * (uv.y - _ta.y)) / d
    const l2 = ((_tb.x - _ta.x) * (uv.y - _ta.y) - (uv.x - _ta.x) * (_tb.y - _ta.y)) / d
    const l0 = 1 - l1 - l2
    const eps = -1e-4
    if (l0 < eps || l1 < eps || l2 < eps) return null
    return [i0, i1, i2, l0, l1, l2, d]
  }
  let hit = hintFace >= 0 && hintFace < triCount ? test(hintFace) : null
  if (!hit && !ref) for (let t = 0; t < triCount && !hit; t++) hit = test(t)
  if (!hit && ref) {
    let best = Infinity
    for (let t = 0; t < triCount; t++) {
      const h = test(t)
      if (!h) continue
      _a.fromBufferAttribute(pos, h[0]).multiplyScalar(h[3])
      _b.fromBufferAttribute(pos, h[1]); _a.addScaledVector(_b, h[4])
      _c.fromBufferAttribute(pos, h[2]); _a.addScaledVector(_c, h[5])
      const d = _a.distanceToSquared(ref)
      if (d < best) { best = d; hit = h }
    }
  }
  if (!hit) return null
  const [i0, i1, i2, l0, l1, l2] = hit
  _a.fromBufferAttribute(pos, i0); _b.fromBufferAttribute(pos, i1); _c.fromBufferAttribute(pos, i2)
  _ta.fromBufferAttribute(tuv, i0); _tb.fromBufferAttribute(tuv, i1); _tc.fromBufferAttribute(tuv, i2)
  const e1 = _b.clone().sub(_a), e2 = _c.clone().sub(_a)
  const du1 = _tb.x - _ta.x, dv1 = _tb.y - _ta.y, du2 = _tc.x - _ta.x, dv2 = _tc.y - _ta.y
  const r = 1 / (du1 * dv2 - du2 * dv1)
  const dPdu = e1.clone().multiplyScalar(dv2).addScaledVector(e2, -dv1).multiplyScalar(r)
  const dPdv = e2.clone().multiplyScalar(du1).addScaledVector(e1, -du2).multiplyScalar(r)
  const N = new THREE.Vector3().fromBufferAttribute(nor, i0).multiplyScalar(l0)
    .addScaledVector(new THREE.Vector3().fromBufferAttribute(nor, i1), l1)
    .addScaledVector(new THREE.Vector3().fromBufferAttribute(nor, i2), l2).normalize()
  const point = _a.clone().multiplyScalar(l0).addScaledVector(_b, l1).addScaledVector(_c, l2)
  const su = dPdu.length(), sv = dPdv.length()
  const T = dPdu.clone().addScaledVector(N, -dPdu.dot(N)).normalize()
  const B = new THREE.Vector3().crossVectors(N, T)
  const sigma = dPdv.dot(B) >= 0 ? 1 : -1
  return { point, N, T, B, su, sv, sigma }
}

// Rotation that makes the sticker read upright for a given "up" direction
// (local space), e.g. the camera's screen-up at placement time.
export function uprightAngle(frame, upLocal) {
  const U = upLocal.clone().addScaledVector(frame.N, -upLocal.dot(frame.N))
  if (U.lengthSq() < 1e-8) return 0
  return Math.atan2(-U.dot(frame.T), U.dot(frame.B))
}

// Sutherland-Hodgman against one axis-aligned edge in sticker space
function clip(poly, axis, val, keepGreater) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length]
    const a = A.s[axis] - val, b = B.s[axis] - val
    const inA = keepGreater ? a >= 0 : a <= 0
    const inB = keepGreater ? b >= 0 : b <= 0
    if (inA) out.push(A)
    if (inA !== inB) {
      const t = a / (a - b)
      out.push(lerpV(A, B, t))
    }
  }
  return out
}

function lerpV(A, B, t) {
  return {
    s: [A.s[0] + (B.s[0] - A.s[0]) * t, A.s[1] + (B.s[1] - A.s[1]) * t],
    p: [A.p[0] + (B.p[0] - A.p[0]) * t, A.p[1] + (B.p[1] - A.p[1]) * t, A.p[2] + (B.p[2] - A.p[2]) * t],
    n: [A.n[0] + (B.n[0] - A.n[0]) * t, A.n[1] + (B.n[1] - A.n[1]) * t, A.n[2] + (B.n[2] - A.n[2]) * t],
  }
}

/**
 * Build the decal geometry (in the part's local space).
 * @param geo  part geometry (metric UVs, userData.wrap = [periodU, periodV])
 * @param p    { uv:[u,v], rot, width, height, flip, frame? }
 * @param opts { offset, maxEdge }
 */
export function buildDecal(geo, p, { offset = 0.00022, maxEdge = 0.0045, frame, fine = false } = {}) {
  const uvC = new THREE.Vector2(p.uv[0], p.uv[1])
  const F = frame || frameAt(geo, uvC, p.face ?? -1)
  if (!F) return null
  const [pu, pv] = geo.userData.wrap || [0, 0]
  const cos = Math.cos(p.rot), sin = Math.sin(p.rot)
  const w = p.width, h = p.height
  const pos = geo.attributes.position, nor = geo.attributes.normal, tuv = geo.attributes.uv
  const idx = geo.index
  const triCount = idx ? idx.count / 3 : pos.count / 3
  const vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k)
  // metric reach in UV units, for a cheap reject
  const reach = Math.hypot(w, h) * 0.75
  const ru = reach / Math.max(1e-6, F.su), rv = reach / Math.max(1e-6, F.sv)
  // merged parts (rack, stem...) reuse UV ranges on different tubes: only keep
  // triangles physically near the sticker (a wrap never travels further than
  // its own diagonal)
  const cx = F.point.x, cy = F.point.y, cz = F.point.z
  const reach3 = Math.hypot(w, h) * 0.62 + 0.004
  const near3 = (i) => { const dx = pos.getX(i) - cx, dy = pos.getY(i) - cy, dz = pos.getZ(i) - cz; return dx * dx + dy * dy + dz * dz < reach3 * reach3 }
  const tris = []
  const du = [0, 0, 0], dv = [0, 0, 0]
  for (let t = 0; t < triCount; t++) {
    const i0 = vi(t, 0), i1 = vi(t, 1), i2 = vi(t, 2)
    du[0] = tuv.getX(i0) - uvC.x; dv[0] = tuv.getY(i0) - uvC.y
    du[1] = tuv.getX(i1) - uvC.x; dv[1] = tuv.getY(i1) - uvC.y
    du[2] = tuv.getX(i2) - uvC.x; dv[2] = tuv.getY(i2) - uvC.y
    // one wrap representative per triangle (tubes/lathes never straddle the seam)
    if (pu) { const k = Math.round((du[0] + du[1] + du[2]) / 3 / pu) * pu; du[0] -= k; du[1] -= k; du[2] -= k }
    if (pv) { const k = Math.round((dv[0] + dv[1] + dv[2]) / 3 / pv) * pv; dv[0] -= k; dv[1] -= k; dv[2] -= k }
    if (Math.min(du[0], du[1], du[2]) > ru || Math.max(du[0], du[1], du[2]) < -ru) continue
    if (Math.min(dv[0], dv[1], dv[2]) > rv || Math.max(dv[0], dv[1], dv[2]) < -rv) continue
    if (!near3(i0) && !near3(i1) && !near3(i2)) {
      // long triangles (straight tubes) can span the sticker with all three
      // corners far away: test the closest point on the triangle instead
      _a.fromBufferAttribute(pos, i0); _b.fromBufferAttribute(pos, i1); _c.fromBufferAttribute(pos, i2)
      _tri.set(_a, _b, _c)
      _tri.closestPointToPoint(F.point, _cp)
      if (_cp.distanceTo(F.point) > reach3) continue
    }
    const verts = []
    let minX = 9, maxX = -9, minY = 9, maxY = -9
    for (let k = 0; k < 3; k++) {
      const ii = k === 0 ? i0 : k === 1 ? i1 : i2
      const x = du[k] * F.su, y = F.sigma * dv[k] * F.sv
      let sx = (x * cos + y * sin) / w + 0.5
      const sy = (-x * sin + y * cos) / h + 0.5
      if (p.flip) sx = 1 - sx
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy)
      verts.push({ s: [sx, sy], p: [pos.getX(ii), pos.getY(ii), pos.getZ(ii)], n: [nor.getX(ii), nor.getY(ii), nor.getZ(ii)] })
    }
    if (maxX < 0 || minX > 1 || maxY < 0 || minY > 1) continue
    // skip back-facing islands (e.g. the far side of a thin plate) relative to the hit normal
    let poly = verts
    poly = clip(poly, 0, 0, true); if (poly.length < 3) continue
    poly = clip(poly, 0, 1, false); if (poly.length < 3) continue
    poly = clip(poly, 1, 0, true); if (poly.length < 3) continue
    poly = clip(poly, 1, 1, false); if (poly.length < 3) continue
    for (let k = 1; k < poly.length - 1; k++) tris.push([poly[0], poly[k], poly[k + 1]])
  }
  if (!tris.length) return null
  // subdivide for the peel animation (edge length in metres ~ |ds| * size).
  // Longest-edge bisection: long slivers from straight tubes get split only
  // along their length, instead of multiplying their short edges too.
  const out = []
  const edgeLen = (A, B) => Math.hypot((A.s[0] - B.s[0]) * w, (A.s[1] - B.s[1]) * h)
  const stack = tris.map((t) => [t, 0])
  while (stack.length) {
    const [tri, depth] = stack.pop()
    const [A, B, C] = tri
    const lab = edgeLen(A, B), lbc = edgeLen(B, C), lca = edgeLen(C, A)
    const m = Math.max(lab, lbc, lca)
    if (!fine || m <= maxEdge || depth > 14) { out.push(tri); continue }
    if (m === lab) { const M = lerpV(A, B, 0.5); stack.push([[A, M, C], depth + 1], [[M, B, C], depth + 1]) }
    else if (m === lbc) { const M = lerpV(B, C, 0.5); stack.push([[B, M, A], depth + 1], [[M, C, A], depth + 1]) }
    else { const M = lerpV(C, A, 0.5); stack.push([[C, M, B], depth + 1], [[M, A, B], depth + 1]) }
  }

  const n = out.length * 3
  const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), U = new Float32Array(n * 2)
  let o = 0
  for (const tri of out) {
    for (const V of tri) {
      let nx = V.n[0], ny = V.n[1], nz = V.n[2]
      const l = Math.hypot(nx, ny, nz) || 1
      nx /= l; ny /= l; nz /= l
      P[o * 3] = V.p[0] + nx * offset; P[o * 3 + 1] = V.p[1] + ny * offset; P[o * 3 + 2] = V.p[2] + nz * offset
      Nn[o * 3] = nx; Nn[o * 3 + 1] = ny; Nn[o * 3 + 2] = nz
      U[o * 2] = V.s[0]; U[o * 2 + 1] = V.s[1]
      o++
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2))
  const I = new (n > 65535 ? Uint32Array : Uint16Array)(n)
  for (let i = 0; i < n; i++) I[i] = i
  g.setIndex(new THREE.BufferAttribute(I, 1))
  // winding must face outward like the surface
  if (n >= 3) {
    _a.fromArray(P, 0); _b.fromArray(P, 3); _c.fromArray(P, 6)
    const fn = _b.clone().sub(_a).cross(_c.clone().sub(_a))
    if (fn.dot(new THREE.Vector3(Nn[0], Nn[1], Nn[2])) < 0) {
      for (let i = 0; i < n; i += 3) { I[i + 1] = i + 2; I[i + 2] = i + 1 }
    }
  }
  g.computeTangents()
  g.computeBoundingSphere()
  g.userData.frame = F
  return g
}

// sticker-local metric coordinates (x, y in metres, relative to the sticker
// centre, rotated into the sticker frame) of a surface point given by its uv
export function stickerLocal(geo, p, uv, frame) {
  const [pu, pv] = geo.userData.wrap || [0, 0]
  let du = uv.x - p.uv[0], dv = uv.y - p.uv[1]
  if (pu) du -= Math.round(du / pu) * pu
  if (pv) dv -= Math.round(dv / pv) * pv
  const x = du * frame.su, y = frame.sigma * dv * frame.sv
  const c = Math.cos(p.rot), s = Math.sin(p.rot)
  return { x: x * c + y * s, y: -x * s + y * c, rawX: x, rawY: y }
}
