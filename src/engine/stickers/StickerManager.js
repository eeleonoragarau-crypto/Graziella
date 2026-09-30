// Stickers: registry of artworks, placed stickers (children of the bike part
// they sit on, so they fold / steer / spin with it), ghost preview, selection
// frame, surface dragging, corner handles (scale + rotate), peel-on animation,
// undo / redo and serialisation.
import * as THREE from 'three'
import { buildDecal, frameAt, uprightAngle, stickerLocal } from './decal.js'
import { makeSticker, rasterize, hasAlpha, roundCorners } from './artwork.js'
import { applyFinish, makeStickerMaterial } from './finishes.js'

let seq = 0
const uid = (p) => p + Date.now().toString(36).slice(-5) + (seq++).toString(36)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

function installPeel(m) {
  m.userData.uPeel = { value: 1 }
  m.userData.uPeelDir = { value: new THREE.Vector2(1, 0) }
  m.userData.uSize = { value: new THREE.Vector2(0.1, 0.1) }
  m.userData.uLift = { value: 0 }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPeel = m.userData.uPeel
    sh.uniforms.uPeelDir = m.userData.uPeelDir
    sh.uniforms.uSize = m.userData.uSize
    sh.uniforms.uLift = m.userData.uLift
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uPeel; uniform vec2 uPeelDir; uniform vec2 uSize; uniform float uLift;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 nS = normalize(objectNormal);
          #ifdef USE_TANGENT
            vec3 tS = normalize(objectTangent);
            vec3 bS = normalize(cross(nS, tS)) * tangent.w;
          #else
            vec3 tS = normalize(cross(abs(nS.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), nS));
            vec3 bS = cross(nS, tS);
          #endif
          vec2 sp = (uv - 0.5) * uSize;
          float d = dot(sp, uPeelDir);
          float halfL = 0.5 * (abs(uPeelDir.x) * uSize.x + abs(uPeelDir.y) * uSize.y);
          float R = max(0.0035, 0.085 * max(uSize.x, uSize.y));
          const float MAXA = 0.8;
          float front = mix(-halfL - 0.0015, halfL + R * 2.6, uPeel);
          float delta = d - front;
          if (delta > 0.0) {
            float a = min(delta / R, MAXA);
            float rest = max(0.0, delta - a * R);
            float along = R * sin(a) + rest * cos(MAXA);
            float lift = R * (1.0 - cos(a)) + rest * sin(MAXA);
            vec3 dir3 = normalize(uPeelDir.x * tS + uPeelDir.y * bS);
            transformed += dir3 * (along - delta) + nS * lift;
          }
          transformed += nS * uLift;
        }`)
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.93, 0.925, 0.91);`)
  }
  m.customProgramCacheKey = () => 'sticker-peel-v1'
}

// Selection: a crisp contour hugging the die-cut edge, a faint bounding frame
// and round corner handles, all drawn on the sticker's own wrapped geometry.
const outlineMaterial = () => new THREE.ShaderMaterial({
  uniforms: { tMap: { value: null }, color: { value: new THREE.Color('#ffffff') }, accent: { value: new THREE.Color('#1b1a18') } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * 0.00035, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tMap; uniform vec3 color; uniform vec3 accent;
    varying vec2 vUv;
    float A(vec2 uv) { return texture2D(tMap, clamp(uv, 0.0, 1.0)).a; }
    void main() {
      vec2 fw = max(fwidth(vUv), vec2(1e-6));
      // contour: centre alpha vs a ring of samples ~2px away
      float c = A(vUv);
      float mn = 1.0, mx = 0.0;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 0.5235988;
        float s = A(vUv + vec2(cos(a), sin(a)) * fw * 2.2);
        mn = min(mn, s); mx = max(mx, s);
      }
      float contour = (c >= 0.5 && mn < 0.5) ? 1.0 : 0.0;
      float halo = (c < 0.5 && mx >= 0.5) ? 1.0 : 0.0;
      // faint bounding frame + round handles at the corners
      vec2 dpx = min(vUv, 1.0 - vUv) / fw;
      float frame = (1.0 - smoothstep(0.6, 1.4, min(dpx.x, dpx.y))) * 0.35;
      vec2 cp = min(vUv, 1.0 - vUv) / fw;
      float r = length(cp - vec2(6.0));
      float handle = 1.0 - smoothstep(4.0, 5.2, r);
      float handleRing = handle * (1.0 - (1.0 - smoothstep(2.2, 3.2, r)));
      float a = max(max(contour, halo * 0.55), max(frame, handle));
      if (a < 0.02) discard;
      vec3 col = mix(color, accent, max(halo, handleRing));
      gl_FragColor = vec4(col, a);
    }`,
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
})

export class StickerManager {
  constructor(studio) {
    this.studio = studio
    this.arts = new Map()
    this.lazy = new Map() // id -> { meta, make() } processed on first use
    this.list = []
    this.selected = null
    this.armed = null
    this.listeners = new Set()
    this.history = []
    this.future = []
    this.parts = studio.parts
    this.partsByName = new Map(this.parts.map((p) => [p.name, p]))
    this.bikeMeshes = []
    studio.bike.traverse((o) => { if (o.isMesh) this.bikeMeshes.push(o) })
    this.raycaster = new THREE.Raycaster()
    this.animations = []

    this.ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.72, alphaTest: 0.35, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
    this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMat)
    this.ghost.userData.rasterOnly = true
    this.ghost.visible = false
    this.ghost.renderOrder = 10
    this.outline = new THREE.Mesh(new THREE.BufferGeometry(), outlineMaterial())
    this.outline.userData.rasterOnly = true
    this.outline.visible = false
    this.outline.renderOrder = 11

    studio.hooks.push((dt, now) => this.tick(dt, now))
  }

  // --- events -----------------------------------------------------------------
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  emit(kind = 'change') {
    const snap = this.summary()
    for (const fn of this.listeners) fn(snap, kind)
  }
  summary() {
    return {
      stickers: this.list.map((s) => ({ id: s.id, artId: s.artId, part: s.part, width: s.width, rot: s.rot, flip: s.flip, finish: s.finish, name: this.arts.get(s.artId)?.name })),
      selected: this.selected ? this.selectedProps() : null,
      armed: this.armed,
      canUndo: this.history.length > 0,
      canRedo: this.future.length > 0,
    }
  }
  selectedProps() {
    const s = this.byId(this.selected)
    if (!s) return null
    const art = this.arts.get(s.artId)
    return { id: s.id, artId: s.artId, name: art?.name, width: s.width, height: s.width / (art?.aspect || 1), rot: s.rot, flip: s.flip, finish: s.finish, part: s.part, partLabel: this.partsByName.get(s.part)?.userData.label }
  }
  byId(id) { return this.list.find((s) => s.id === id) }

  // --- artworks -------------------------------------------------------------------
  // Register an artwork whose full-resolution sticker textures are only built
  // when it's first needed (armed, dragged, placed or restored).
  registerLazy(id, meta, make) { if (!this.arts.has(id)) this.lazy.set(id, { meta, make }) }
  getArt(id) {
    if (this.arts.has(id)) return this.arts.get(id)
    const l = this.lazy.get(id)
    if (!l) return null
    this.lazy.delete(id)
    const { canvas, foil } = l.make()
    const art = this.addArt(id, canvas, { ...l.meta, foil })
    Object.assign(art, l.meta.extra || {})
    return art
  }
  has(id) { return this.arts.has(id) || this.lazy.has(id) }

  // canvas + meta -> textures ready for stickers
  addArt(id, canvas, meta = {}) {
    if (this.arts.has(id)) return this.arts.get(id)
    const tex = makeSticker(canvas, { border: meta.border !== false, foil: meta.foil || null, paper: meta.finish === 'carta' })
    const art = {
      id, name: meta.name || 'Adesivo', finish: meta.finish || 'lucido', size: meta.size || 0.07,
      border: meta.border !== false, source: meta.source || 'library', ...tex,
    }
    this.arts.set(id, art)
    return art
  }

  async addUpload(file) {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    let c = rasterize(img, 1024)
    if (!hasAlpha(c)) c = roundCorners(c, 0.07)
    URL.revokeObjectURL(url)
    const dataUrl = c.toDataURL('image/png')
    const id = 'up:' + uid('')
    const name = (file.name || 'Immagine').replace(/\.[a-z0-9]+$/i, '').slice(0, 28)
    const art = this.addArt(id, c, { name, finish: 'lucido', size: 0.08, border: true, source: 'upload' })
    art.dataUrl = dataUrl
    this.emit('arts')
    return art
  }

  async addUploadFromDataUrl(id, dataUrl, meta) {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const c = rasterize(img, 1024)
    const art = this.addArt(id, c, { ...meta, source: 'upload' })
    art.dataUrl = dataUrl
    return art
  }

  // --- picking ------------------------------------------------------------------------
  setPointer(ndc) { this.raycaster.setFromCamera(ndc, this.studio.camera) }

  // first hit on the bike; returns { mesh, uv, face, point } if it's sticker-able
  pickSurface(ndc, onlyMesh = null) {
    this.setPointer(ndc)
    const targets = onlyMesh ? [onlyMesh] : this.bikeMeshes
    const hits = this.raycaster.intersectObjects(targets, false)
    const h = hits.find((x) => x.object.visible)
    if (!h || !h.object.userData.stickerable || !h.uv) return null
    return { mesh: h.object, uv: h.uv.clone(), face: h.faceIndex, point: h.point.clone(), distance: h.distance }
  }

  pickSticker(ndc) {
    this.setPointer(ndc)
    const meshes = this.list.map((s) => s.mesh).filter(Boolean)
    const sh = this.raycaster.intersectObjects(meshes, false)[0]
    if (!sh) return null
    // must not be hidden behind another part of the bike
    const bh = this.raycaster.intersectObjects(this.bikeMeshes, false).find((x) => x.object.visible)
    if (bh && bh.distance < sh.distance - 0.002) return null
    return { sticker: this.list.find((s) => s.mesh === sh.object), uv: sh.uv.clone(), point: sh.point.clone() }
  }

  // --- geometry -----------------------------------------------------------------------
  upLocal(mesh, pointLocal) {
    const cam = this.studio.camera
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion)
    const pw = mesh.localToWorld(pointLocal.clone())
    const a = mesh.worldToLocal(pw.clone())
    const b = mesh.worldToLocal(pw.clone().add(up.multiplyScalar(0.05)))
    return b.sub(a).normalize()
  }

  buildGeometry(s, fine = false) {
    const mesh = this.partsByName.get(s.part)
    const art = this.getArt(s.artId)
    if (!mesh || !art) return null
    const ref = s.anchor ? new THREE.Vector3(...s.anchor) : null
    const frame = frameAt(mesh.geometry, new THREE.Vector2(s.uv[0], s.uv[1]), s.face ?? -1, ref)
    if (!frame) return null
    s.frame = frame
    s.anchor = frame.point.toArray()
    return buildDecal(mesh.geometry, { uv: s.uv, rot: s.rot, width: s.width, height: s.width / art.aspect, flip: s.flip }, { frame, fine })
  }

  realize(s, fine = false) {
    const part = this.partsByName.get(s.part)
    const art = this.getArt(s.artId)
    if (!part || !art) return false
    const geo = this.buildGeometry(s, fine)
    if (!geo) return false
    if (!s.mesh) {
      const m = makeStickerMaterial()
      installPeel(m)
      s.mesh = new THREE.Mesh(geo, m)
      s.mesh.name = 'adesivo'
      s.mesh.castShadow = true
      s.mesh.receiveShadow = true
      s.mesh.userData.sticker = s.id
    } else {
      s.mesh.geometry.dispose()
      s.mesh.geometry = geo
    }
    if (s._finish !== s.finish) { applyFinish(s.mesh.material, art, s.finish); s._finish = s.finish }
    s.mesh.material.userData.uSize.value.set(s.width, s.width / art.aspect)
    if (s.mesh.parent !== part) part.add(s.mesh)
    return true
  }

  // --- API ------------------------------------------------------------------------------
  place(artId, hit, { animate = true, rot, width, finish, flip = false, record = true } = {}) {
    const art = this.getArt(artId)
    if (!art || !hit) return null
    const frame = frameAt(hit.mesh.geometry, hit.uv, hit.face, hit.point ? hit.mesh.worldToLocal(hit.point.clone()) : null)
    if (!frame) return null
    const pointLocal = frame.point
    const s = {
      id: uid('s'), artId, part: hit.mesh.name, uv: [hit.uv.x, hit.uv.y], face: hit.face, anchor: pointLocal.toArray(),
      rot: rot ?? uprightAngle(frame, this.upLocal(hit.mesh, pointLocal)),
      width: width ?? art.size, flip, finish: finish ?? art.finish,
    }
    if (record) this.record()
    if (!this.realize(s)) return null
    this.list.push(s)
    this.select(s.id, false)
    if (animate) this.peelOn(s)
    this.studio.geometryChanged()
    this.emit('place')
    return s
  }

  update(id, patch, { record = true, rebuild = true } = {}) {
    const s = this.byId(id)
    if (!s) return
    if (record) this.record()
    const geomKeys = ['uv', 'rot', 'width', 'flip', 'part', 'face', 'anchor']
    const needGeo = geomKeys.some((k) => k in patch)
    Object.assign(s, patch)
    if (rebuild) {
      if (needGeo) this.realize(s)
      if (s._finish !== s.finish && s.mesh) { applyFinish(s.mesh.material, this.getArt(s.artId), s.finish); s._finish = s.finish }
    }
    if (s.id === this.selected) this.refreshOutline()
    if (needGeo) this.studio.geometryChanged(); else this.studio.materialsChanged()
    this.emit('update')
  }

  remove(id, { record = true } = {}) {
    const s = this.byId(id)
    if (!s) return
    if (record) this.record()
    s.mesh?.parent?.remove(s.mesh)
    s.mesh?.geometry.dispose()
    s.mesh?.material.dispose()
    this.list = this.list.filter((x) => x !== s)
    if (this.selected === id) this.select(null, false)
    this.studio.geometryChanged()
    this.emit('remove')
  }

  duplicate(id) {
    const s = this.byId(id)
    if (!s) return
    const part = this.partsByName.get(s.part)
    const shift = (s.width * 0.6) / Math.max(1e-6, s.frame?.su || 1)
    this.record()
    const copy = { ...s, id: uid('s'), mesh: null, _finish: null, uv: [s.uv[0] + shift, s.uv[1]], face: -1 }
    if (!this.realize(copy)) { copy.uv = [...s.uv]; this.realize(copy) }
    this.list.push(copy)
    this.select(copy.id, false)
    this.peelOn(copy)
    this.studio.geometryChanged()
    this.emit('place')
    void part
  }

  select(id, emit = true) {
    this.selected = id
    this.refreshOutline()
    if (emit) this.emit('select')
  }

  refreshOutline() {
    const s = this.byId(this.selected)
    if (!s || !s.mesh) { this.outline.visible = false; this.outline.parent?.remove(this.outline); return }
    this.outline.geometry = s.mesh.geometry
    this.outline.material.uniforms.tMap.value = this.getArt(s.artId)?.color || null
    if (this.outline.parent !== s.mesh.parent) s.mesh.parent.add(this.outline)
    this.outline.visible = true
    this.studio.poke()
  }

  arm(artId) {
    if (artId) this.getArt(artId)
    this.armed = artId
    if (!artId) this.hideGhost()
    this.emit('arm')
  }

  // --- ghost preview -----------------------------------------------------------------
  showGhost(artId, hit) {
    const art = this.getArt(artId)
    if (!art || !hit) { this.hideGhost(); return }
    const frame = frameAt(hit.mesh.geometry, hit.uv, hit.face, hit.point ? hit.mesh.worldToLocal(hit.point.clone()) : null)
    if (!frame) { this.hideGhost(); return }
    const rot = uprightAngle(frame, this.upLocal(hit.mesh, frame.point))
    const geo = buildDecal(hit.mesh.geometry, { uv: [hit.uv.x, hit.uv.y], rot, width: art.size, height: art.size / art.aspect }, { frame, maxEdge: 1, offset: 0.0006 })
    if (!geo) { this.hideGhost(); return }
    this.ghost.geometry.dispose()
    this.ghost.geometry = geo
    this.ghostMat.map = art.color
    this.ghostMat.needsUpdate = true
    if (this.ghost.parent !== hit.mesh) hit.mesh.add(this.ghost)
    this.ghost.visible = true
    this.studio.poke()
  }
  hideGhost() { if (this.ghost.visible) { this.ghost.visible = false; this.studio.poke() } }

  // --- animation ----------------------------------------------------------------------
  peelOn(s, duration = 760, delay = 0) {
    const u = s.mesh.material.userData
    const a = Math.random() * Math.PI * 2
    // lay it down from a corner-ish side, along the sticker's longer axis
    const art = this.arts.get(s.artId)
    const wide = (art?.aspect || 1) >= 1
    u.uPeelDir.value.set(wide ? Math.sign(Math.cos(a)) || 1 : 0.25 * Math.cos(a), wide ? 0.25 * Math.sin(a) : Math.sign(Math.sin(a)) || 1).normalize()
    u.uPeel.value = 0
    if (delay > 0) s.mesh.visible = false
    // the curl needs vertices across the sticker: use a finely subdivided copy
    // only while it animates, then go back to the minimal wrap
    this.realize(s, true)
    this.animations.push({ s, t0: performance.now() + delay, duration })
    this.studio.hold('peel:' + s.id, true)
  }

  tick(dt, now) {
    if (this.animations.length) {
      this.animations = this.animations.filter((an) => {
        if (now < an.t0) return true
        const t = clamp((now - an.t0) / an.duration, 0, 1)
        const e = 1 - Math.pow(1 - t, 3)
        if (an.s.mesh) { an.s.mesh.visible = true; an.s.mesh.material.userData.uPeel.value = e }
        if (t >= 1) {
          this.studio.hold('peel:' + an.s.id, false)
          if (this.list.includes(an.s)) { this.realize(an.s); if (an.s.id === this.selected) this.refreshOutline() }
          return false
        }
        return true
      })
      this.studio.poke()
    }
  }

  // --- interaction helpers (called by the pointer layer) ------------------------------
  beginDrag(stickerHit, ndc) {
    const s = stickerHit.sticker
    const part = this.partsByName.get(s.part)
    const art = this.arts.get(s.artId)
    const sx = stickerHit.uv.x, sy = stickerHit.uv.y
    const cornerX = sx < 0.14 || sx > 0.86, cornerY = sy < 0.14 || sy > 0.86
    this.record()
    this.drag = { id: s.id, mode: cornerX && cornerY ? 'transform' : 'move', part, start: ndc.clone(), moved: false }
    // grab offset in sticker-local metres
    this.drag.grab = new THREE.Vector2((sx - 0.5) * s.width, (sy - 0.5) * (s.width / art.aspect))
    if (s.flip) this.drag.grab.x *= -1
    if (this.drag.mode === 'transform') {
      const surf = this.pickSurface(ndc, part)
      const loc = surf ? stickerLocal(part.geometry, s, surf.uv, s.frame) : null
      this.drag.r0 = loc ? Math.hypot(loc.rawX, loc.rawY) : 0
      this.drag.a0 = loc ? Math.atan2(loc.rawY, loc.rawX) : 0
      this.drag.w0 = s.width
      this.drag.rot0 = s.rot
    }
    this.studio.hold('drag', true)
    return this.drag.mode
  }

  dragTo(ndc) {
    const d = this.drag
    if (!d) return
    const s = this.byId(d.id)
    if (!s) return
    d.moved = true
    if (d.mode === 'transform') {
      const surf = this.pickSurface(ndc, d.part)
      if (!surf) return
      const loc = stickerLocal(d.part.geometry, { ...s, rot: 0 }, surf.uv, s.frame)
      const r = Math.hypot(loc.rawX, loc.rawY), a = Math.atan2(loc.rawY, loc.rawX)
      if (d.r0 < 1e-5) return
      const width = clamp(d.w0 * (r / d.r0), 0.012, 0.5)
      let rot = d.rot0 + (a - d.a0)
      this.update(d.id, { width, rot }, { record: false })
      return
    }
    const hit = this.pickSurface(ndc)
    if (!hit) return
    const hitLocal = hit.mesh.worldToLocal(hit.point.clone())
    const frame = frameAt(hit.mesh.geometry, hit.uv, hit.face, hitLocal)
    if (!frame) return
    let rot = s.rot
    if (hit.mesh.name !== s.part && s.frame) {
      // keep the sticker's world "up" when hopping onto another part
      const oldPart = this.partsByName.get(s.part)
      const upL = new THREE.Vector3().addScaledVector(s.frame.T, -Math.sin(s.rot)).addScaledVector(s.frame.B, Math.cos(s.rot))
      const pw = oldPart.localToWorld(s.frame.point.clone())
      const upW = oldPart.localToWorld(s.frame.point.clone().add(upL)).sub(pw)
      const pn = hit.mesh.localToWorld(frame.point.clone())
      const upN = hit.mesh.worldToLocal(pn.clone().add(upW)).sub(frame.point)
      rot = uprightAngle(frame, upN)
    }
    // subtract the grab offset (rotate it into the new frame's UV axes)
    const c = Math.cos(rot), sn = Math.sin(rot)
    const gx = d.grab.x * c - d.grab.y * sn, gy = d.grab.x * sn + d.grab.y * c
    let uv = [hit.uv.x - gx / Math.max(1e-6, frame.su), hit.uv.y - (frame.sigma * gy) / Math.max(1e-6, frame.sv)]
    let face = -1
    // if the grab offset pushes the centre off the surface, use the hit itself
    if (!frameAt(hit.mesh.geometry, new THREE.Vector2(uv[0], uv[1]), -1, hitLocal)) { uv = [hit.uv.x, hit.uv.y]; face = hit.face }
    this.update(d.id, { part: hit.mesh.name, uv, face, rot, anchor: hitLocal.toArray() }, { record: false })
  }

  endDrag() {
    const d = this.drag
    this.drag = null
    this.studio.hold('drag', false)
    if (d && !d.moved) this.history.pop() // nothing changed
    this.future = []
    this.emit('update')
    return d
  }

  nudge(kind, amount) {
    const s = this.byId(this.selected)
    if (!s) return
    if (kind === 'rot') this.update(s.id, { rot: s.rot + amount })
    if (kind === 'scale') this.update(s.id, { width: clamp(s.width * amount, 0.012, 0.5) })
    if (kind === 'flip') this.update(s.id, { flip: !s.flip })
  }

  // --- history / serialisation ----------------------------------------------------------
  serialize() {
    return this.list.map((s) => ({ id: s.id, artId: s.artId, part: s.part, uv: [...s.uv], anchor: s.anchor ? s.anchor.map((v) => +v.toFixed(5)) : null, rot: s.rot, width: s.width, flip: s.flip, finish: s.finish }))
  }
  record() {
    this.history.push(this.serialize())
    if (this.history.length > 80) this.history.shift()
    this.future = []
  }
  restore(list, { animate = false } = {}) {
    for (const s of this.list) { s.mesh?.parent?.remove(s.mesh); s.mesh?.geometry.dispose(); s.mesh?.material.dispose() }
    this.list = []
    for (const r of list) {
      const s = { ...r, face: -1 }
      if (this.realize(s)) { this.list.push(s); if (animate) this.peelOn(s) }
    }
    if (!this.byId(this.selected)) this.selected = null
    this.refreshOutline()
    this.studio.geometryChanged()
    this.emit('restore')
  }
  undo() {
    if (!this.history.length) return
    this.future.push(this.serialize())
    this.restore(this.history.pop())
  }
  redo() {
    if (!this.future.length) return
    this.history.push(this.serialize())
    this.restore(this.future.pop())
  }
  clear() { this.record(); this.restore([]) }
}
