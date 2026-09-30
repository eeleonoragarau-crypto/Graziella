// The engine: renderer, camera, bike, floor, environments, post stack and the
// raster <-> path-traced switch. UI talks to it through plain methods.
import * as THREE from 'three'
import CameraControls from 'camera-controls'
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
import { PhysicalCamera } from 'three-gpu-pathtracer'
import { createMaterials, applyPaint, applyLeather, TYRES, paintHex } from './materials.js'
import { buildGraziella } from './bike/index.js'
import { recolorTyre } from './bike/wheel.js'
import { buildEnvironment, ENVS } from './environment.js'
import { StudioFloor, LAYER_CASTER } from './floor.js'
import { PostStack } from './post.js'
import { PathTracer } from './pathtracer.js'
import { swapToProxies, syncProxies } from './ptProxy.js'
import { StickerManager } from './stickers/StickerManager.js'
import { installAnimations } from './animations.js'
import { SetStage } from './sets/stage.js'
import { SETS } from './sets/index.js'

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast
CameraControls.install({ THREE })

export const VIEWS = {
  tre4: { pos: [1.5, 0.98, 3.02], target: [0.07, 0.52, 0] },
  lato: { pos: [0.07, 0.64, 3.4], target: [0.07, 0.52, 0] },
  fronte: { pos: [2.85, 0.95, 1.2], target: [0.12, 0.52, 0] },
  retro: { pos: [-2.3, 1.05, 1.75], target: [-0.05, 0.5, 0] },
  alto: { pos: [0.4, 2.6, 1.3], target: [0.07, 0.45, 0] },
  telaio: { pos: [0.55, 0.7, 1.05], target: [0.14, 0.45, 0] },
}

export class Studio {
  constructor(canvas, { onStatus } = {}) {
    this.canvas = canvas
    this.onStatus = onStatus || (() => {})
    this.THREE = THREE
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }))
    // the live preview renders at up to 1.5x; stills come from the path tracer
    r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.NoToneMapping
    // shadow maps only matter inside a set (the SunLight); the studio has none
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFShadowMap

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#e6e3dd')
    this.camera = new PhysicalCamera(26, 1, 0.05, 220)
    this.camera.fStop = 8
    this.camera.apertureBlades = 7
    this.camera.focusDistance = 3
    this.camera.layers.enable(LAYER_CASTER)

    this.M = createMaterials()
    this.bike = buildGraziella(this.M)
    this.scene.add(this.bike)
    this.parts = []
    this.bike.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true
        o.layers.enable(LAYER_CASTER)
        if (o.userData.stickerable || o.userData.bell) o.geometry.computeBoundsTree()
        if (o.userData.stickerable) this.parts.push(o)
      }
    })

    this.floor = new StudioFloor(r)
    this.scene.add(this.floor.mesh, this.floor.ptMesh)

    this.post = new PostStack(r, this.scene, this.camera)
    this.pt = new PathTracer(r)
    // what the path tracer sees: inside a set, the HDRI sky with its sun
    // (importance sampled) instead of the raster light probe
    this.pt.sceneState = () => {
      const s = this.scene, P = this.stage.ptEnv
      const env = s.environment, bg = s.background, ei = s.environmentIntensity
      if (P) { s.environment = P.environment; s.background = P.background; s.environmentIntensity = 1 }
      const hidden = [], lights = []
      s.traverse((o) => {
        if (o.userData.rasterOnly && o.visible) { o.visible = false; hidden.push(o) }
        // lights can carry their own path-traced strength (raster lights have
        // no shadows and the probe adds their bounce, so they run lower there)
        if (o.isLight && o.userData.ptIntensity !== undefined) { lights.push([o, o.intensity]); o.intensity = o.userData.ptIntensity }
        // a switched-off light still takes its share of the light samples: the
        // path tracer picks one light per sample, so 12 dark lanterns would
        // leave the sun sampled once in 13
        if (o.isLight && o.visible && o.intensity === 0) { o.visible = false; hidden.push(o) }
      })
      const unswap = this.stage.ptSwap()
      return () => {
        s.environment = env; s.background = bg; s.environmentIntensity = ei
        for (const o of hidden) o.visible = true
        for (const [o, i] of lights) o.intensity = i
        unswap?.()
      }
    }
    this.stage = new SetStage(this)
    this.scene.add(this.stage.sun)

    this.controls = new CameraControls(this.camera, canvas)
    const c = this.controls
    c.smoothTime = 0.22
    c.draggingSmoothTime = 0.08
    c.minDistance = 0.45
    c.maxDistance = 7
    c.maxPolarAngle = THREE.MathUtils.degToRad(88)
    c.dollyToCursor = true
    c.infinityDolly = false
    const v = VIEWS.tre4
    c.setLookAt(...v.pos, ...v.target, false)

    this.settings = {
      pathTracing: true, quality: 0.75, exposure: 1, idleMs: 550, aoOn: true, grain: 0.045, bloom: 0.32, fStop: 8,
    }
    this.mode = 'raster'
    this.lastActivity = performance.now()
    this.ptVisibleSince = 0
    this.clock = new THREE.Clock()
    this.frameMs = 16
    this.hooks = [] // per-frame callbacks (stickers, animations)
    this.activityHolds = new Set()
    this.stickers = new StickerManager(this)
    installAnimations(this)

    window.addEventListener('resize', () => this.resize())
    this.resize()
  }

  async init(sc = { set: 'studio', env: 'studio' }) {
    if (typeof sc === 'string') sc = { set: 'studio', env: sc }
    await this.setAmbient(sc)
    this.running = true
    this.renderer.setAnimationLoop(() => this.frame())
  }

  // ---------------------------------------------------------------------------
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.post.setSize(w, h)
    this.poke()
  }

  poke() { this.lastActivity = performance.now() }
  hold(key, on) { if (on) this.activityHolds.add(key); else this.activityHolds.delete(key); this.poke() }

  async setEnvironment(key) {
    this.onStatus({ loading: 'Cambio la luce' })
    const env = await buildEnvironment(key)
    const prev = this.env
    this.env = env
    if (prev && prev.texture !== env.texture) prev.texture.dispose()
    if (!this.stage.isActive) this.useStudioLook()
    this.onStatus({ loading: null, env: key })
    this.poke()
  }

  // the seamless paper studio: the same float equirect feeds raster IBL (three
  // builds the PMREM internally) and the path tracer's importance sampling
  useStudioLook() {
    const env = this.env
    this.scene.environment = env.texture
    this.scene.environmentIntensity = 1
    this.scene.background = env.bg.clone()
    this.floor.setLook(env)
    this.floorOn = true
    this.floor.mesh.visible = true
    this.floor.uniforms.shadowStrength.value = 1
    this.controls.maxDistance = 7
    this.controls.colliderMeshes = []
    this.pt.dirtyEnv = true
  }

  // Ambientazione: 'studio' (the paper studio, lit by `env`) or a 3D set with
  // its own light variant. Calls are serialised; the latest request wins.
  setAmbient(sc) {
    this._ambientWant = { ...sc }
    if (!this._ambientRun) this._ambientRun = this._runAmbient().finally(() => { this._ambientRun = null })
    return this._ambientRun
  }

  async _runAmbient() {
    while (this._ambientWant) {
      const sc = this._ambientWant
      this._ambientWant = null
      const set = sc.set && sc.set !== 'studio' && SETS[sc.set] ? sc.set : 'studio'
      const cur = this.ambient
      const same = cur && cur.set === set && (set === 'studio' ? cur.env === (sc.env || 'studio') : cur.variant === (sc[set] || SETS[set].variants[0].id))
      if (same) continue
      try {
        if (set === 'studio') {
          if (this.stage.isActive) this.stage.unload()
          if (!this.env || this.env.key !== sc.env) await this.setEnvironment(sc.env || 'studio')
          else this.useStudioLook()
          this.ambient = { set: 'studio', env: this.env.key }
          this.updateExposure()
          if (this.anim?.parked && this.parkAuto) { this.parkAuto = false; this.setParked?.(false) }
          Object.assign(this.post.n8ao.configuration, { aoRadius: 0.22, distanceFalloff: 0.55 })
        } else {
          const def = SETS[set]
          const variant = sc[set] || def.variants[0].id
          this.onStatus({ loading: this.stage.key === set ? 'Cambio la luce' : def.loading })
          await this.stage.load(set, variant)
          this.floorOn = false
          this.floor.mesh.visible = false
          this.controls.maxDistance = this.stage.active.maxDistance ?? 7
          this.controls.colliderMeshes = this.stage.active.colliders || []
          this.ambient = { set, variant: this.stage.variant }
          this.updateExposure()
          // in a real place the bike stands on its kickstand
          if (!this.anim?.parked) { this.parkAuto = true; this.setParked?.(true) }
          // room-scale occlusion for the ambient light inside a set
          Object.assign(this.post.n8ao.configuration, { aoRadius: this.stage.active.aoRadius ?? 0.6, distanceFalloff: 1.1 })
          this.onStatus({ loading: null })
        }
      } catch (e) {
        console.error('ambient switch failed', e)
        this.onStatus({ loading: null })
      }
      this.onUi?.({ ambientReady: { ...this.ambient } })
      this.poke()
    }
  }

  // --- configurator -------------------------------------------------------------
  setPaint(hex, finish) { applyPaint(this.M, hex, finish); this.materialsChanged() }
  setLeather(key) { applyLeather(this.M, key); this.materialsChanged() }
  setTyres(key) {
    const t = TYRES[key]
    for (const w of [this.bike.userData.rearWheel, this.bike.userData.frontWheel]) recolorTyre(w.userData.tyre.geometry, t.wall)
    this.pt.dirtyScene = true
    this.poke()
  }
  materialsChanged() { this.pt.dirtyMaterials = true; this.poke() }

  // --- configurator entry points (called by the UI store) ----------------------------
  applyBike(b) {
    applyPaint(this.M, paintHex(b), b.finish)
    applyLeather(this.M, b.leather)
    if (b.tyres !== this._tyres) { this._tyres = b.tyres; this.setTyres(b.tyres) }
    // guard materials carry the pressed-steel normal map; the painted one follows the frame
    const gp = this.M.guardPaint, nm = gp.normalMap
    gp.copy(this.M.paint); gp.normalMap = nm; gp.normalScale.set(1, 1); gp.name = 'guardPaint'
    const guardMat = b.guard === 'colore' ? gp : b.guard === 'bianco' ? this.M.guardWhite : this.M.guardChrome
    const lipMat = b.guard === 'colore' ? this.M.paintDS : b.guard === 'bianco' ? this.M.guardWhiteDS : this.M.chromeDS
    // fenders: chrome, in the frame colour, or cream white (the classic two-tone)
    const fOuter = b.fenders === 'colore' ? this.M.paint : b.fenders === 'bianco' ? this.M.guardWhite : this.M.chrome
    const fInner = b.fenders === 'colore' ? this.M.paint : b.fenders === 'bianco' ? this.M.guardWhite : this.M.chromeSoft
    const fBead = b.fenders === 'colore' ? this.M.paint : b.fenders === 'bianco' ? this.M.guardWhite : this.M.chrome
    const swap = (o, m) => { if (o.material !== m) { o.material = m; this.pt.dirtyScene = true } }
    this.bike.traverse((o) => {
      if (o.name === 'carter') swap(o, guardMat)
      if (o.name === 'carterBordo') swap(o, lipMat)
      if (o.name === 'parafangoPost' || o.name === 'parafangoAnt') swap(o, fOuter)
      if (o.name === 'parafangoPostInterno' || o.name === 'parafangoAntInterno') swap(o, fInner)
      if (o.name === 'parafangoPostBordo' || o.name === 'parafangoAntBordo') swap(o, fBead)
    })
    this.M.paintDS.copy(this.M.paint); this.M.paintDS.side = THREE.DoubleSide
    this.M.bulb.emissiveIntensity = b.lamp ? 60 : 0
    this.materialsChanged()
  }

  applyScene(sc, patch = sc) {
    if ('set' in patch || 'env' in patch || (sc.set && sc.set in patch)) this.setAmbient(sc)
    this.userExposure = sc.exposure
    this.updateExposure()
    this.post.setToneMapping(sc.tonemap)
    this.poke()
  }

  // the user's exposure times the set variant's own bias (a garage at night
  // is darker than a sunny street, but should open up at the same slider)
  updateExposure() {
    const bias = this.stage.isActive ? (this.stage.exposureBias || 1) : 1
    this.post.exposure.uniforms.get('exposure').value = (this.userExposure ?? 1) * bias
  }

  applyRender(r) {
    const was = this.settings.quality
    this.settings.pathTracing = r.pathTracing
    this.settings.quality = r.quality
    if (r.fStop && r.fStop !== this.settings.fStop) { this.settings.fStop = r.fStop; if (this.mode === 'pt') this.exitPT() }
    this.post.grain.blendMode.opacity.value = r.grain
    this.post.bloom.intensity = r.bloom
    this.post.vignette.darkness = r.vignette
    this.post.ca.offset.set(r.ca * 0.001, r.ca * 0.001)
    if (was !== r.quality && this.mode === 'pt') this.exitPT()
    this.poke()
  }
  geometryChanged(full = false) { this.pt.dirtyScene = true; if (full) this.pt.forceFull = true; this.poke() }

  view(name, smooth = true) {
    const v = VIEWS[name]
    if (!v) return
    this.controls.setLookAt(...v.pos, ...v.target, smooth)
    this.poke()
  }

  // A surface point on a tube-like part: `t` along its length (0..1), facing
  // `dirWorld`. Used to lay the factory decals.
  surfaceHit(partName, t = 0.5, dirWorld = new THREE.Vector3(0, 0, 1)) {
    const mesh = this.parts.find((p) => p.name === partName)
    if (!mesh) return null
    mesh.updateWorldMatrix(true, false)
    const g = mesh.geometry, uv = g.attributes.uv, nor = g.attributes.normal
    const inv = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld).invert()
    const dir = dirWorld.clone().applyMatrix3(inv).normalize()
    let uMin = Infinity, uMax = -Infinity
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); if (u > -5 && u < 5) { uMin = Math.min(uMin, u); uMax = Math.max(uMax, u) } }
    const uT = uMin + (uMax - uMin) * t
    const tol = (uMax - uMin) * 0.6 + 1e-4
    let best = -2, bestV = 0, bestU = uT
    const n = new THREE.Vector3()
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i)
      if (Math.abs(u - uT) > tol) continue
      n.fromBufferAttribute(nor, i)
      const score = n.dot(dir) - Math.abs(u - uT) * 2
      if (score > best) { best = score; bestV = uv.getY(i); bestU = u }
    }
    if (mesh.userData.plate) {
      // flat plate: centre of the face looking at dir
      let su = 0, sv = 0, k = 0
      for (let i = 0; i < uv.count; i++) {
        n.fromBufferAttribute(nor, i)
        if (n.dot(dir) > 0.9 && uv.getX(i) > -5 && uv.getX(i) < 5) { su += uv.getX(i); sv += uv.getY(i); k++ }
      }
      if (k) return { mesh, uv: new THREE.Vector2(su / k + (uMax - uMin) * (t - 0.5), sv / k), face: -1 }
    }
    void bestU
    return { mesh, uv: new THREE.Vector2(uT, bestV), face: -1 }
  }

  // --- path tracing ---------------------------------------------------------------
  wantPT(now) {
    return this.settings.pathTracing && this.activityHolds.size === 0 && now - this.lastActivity > this.settings.idleMs
  }

  // Snapshot the scene for the path tracer: helpers hidden, clearcoat proxies,
  // floor swapped for its alpha-faded twin, raw equirect as environment. The
  // BVH then builds in a worker; raster keeps running meanwhile.
  buildPT() {
    const pt = this.pt, s = this.scene
    const hidden = []
    let unswap = null
    return pt.build(s, this.camera, () => {
      s.traverse((o) => { if (o.userData.rasterOnly && o.visible) { o.visible = false; hidden.push(o) } })
      unswap = swapToProxies(s)
      this.floor.mesh.visible = false
      this.floor.ptMesh.visible = this.floorOn !== false
    }, () => {
      unswap?.()
      for (const o of hidden) o.visible = true
      this.floor.mesh.visible = this.floorOn !== false
      this.floor.ptMesh.visible = false
    }, () => {
      this.onStatus({ bvhMs: Math.round(pt.buildMs), syncMs: Math.round(pt.syncMs) })
    }).catch((e) => { console.error('path tracer build failed', e, e && e.stack); pt.building = false })
  }

  enterPT() {
    const pt = this.pt
    // autofocus on the orbit point
    const tgt = new THREE.Vector3()
    this.controls.getTarget(tgt)
    this.camera.focusDistance = Math.max(0.2, this.camera.position.distanceTo(tgt))
    this.camera.fStop = this.settings.fStop || 8
    pt.pt.renderScale = this.settings.quality
    if (pt.dirtyMaterials) syncProxies()
    pt.restart(this.camera)
    // noise-free guides for the denoiser: normals and depth of this view
    const u = this.post.ptPass.fullscreenMaterial.uniforms
    u.tG.value = this.post.gbuffer.render(this.renderer, this.scene, this.camera)
    u.useG.value = 1
    this.mode = 'pt'
    this.ptVisibleSince = 0
  }

  exitPT() {
    this.mode = 'raster'
    this.post.setMode('raster')
    this.onStatus({ samples: 0, mode: 'raster' })
  }

  frame() {
    if (this.suspend) { this.clock.getDelta(); return }
    const dt = Math.min(0.1, this.clock.getDelta())
    const now = performance.now()
    const moved = this.controls.update(dt)
    if (moved) this.poke()
    for (const h of this.hooks) h(dt, now)

    const pt0 = this.pt
    const idle = this.wantPT(now)
    // (re)build the path-tracing scene in the background as soon as we're idle
    if (idle && (pt0.dirtyScene || !pt0.ready) && !pt0.building) this.buildPT()
    const preparing = idle && (pt0.building || pt0.dirtyScene || !pt0.ready)
    if (preparing !== this._preparing) { this._preparing = preparing; this.onStatus({ preparing }) }
    if (idle && pt0.ready && !pt0.building && !pt0.dirtyScene) {
      if (this.mode !== 'pt') {
        // render one last raster frame and capture it for the crossfade
        this.post.setMode('raster')
        this.post.capture.capture = true
        this.post.render(dt)
        this.enterPT()
        return
      }
      const pt = this.pt
      // converged: stop sampling and stop drawing (the canvas keeps the image)
      if (pt.samples >= (this.settings.maxSpp || 900) && !this.captureJob && this.post.ptPass.fullscreenMaterial.uniforms.mixT.value >= 0.999) {
        this.onStatus({ samples: Math.floor(pt.samples), mode: 'pt' })
        return
      }
      const tiles = this.frameMs > 30 ? 1 : this.frameMs > 20 ? 2 : 4
      pt.step(tiles)
      if (pt.samples >= 1 && !this.ptVisibleSince) this.ptVisibleSince = now
      const fade = this.ptVisibleSince ? Math.min(1, (now - this.ptVisibleSince) / 650) : 0
      const u = this.post.ptPass.fullscreenMaterial.uniforms
      u.tPT.value = pt.texture
      u.tRaster.value = this.post.capture.target.texture
      u.mixT.value = fade * fade * (3 - 2 * fade)
      // denoise strongly at first, fade it out as samples accumulate
      const spp = Math.max(1, pt.samples)
      u.dn.value = this.settings.denoise === false ? 0 : Math.max(0, 1 - spp / 700) * 0.95
      u.threshold.value = 0.05 + 0.45 / Math.sqrt(spp)
      this.post.setMode('pt')
      this.post.render(dt)
      this.onStatus({ samples: Math.floor(pt.samples), mode: 'pt' })
    } else {
      if (this.mode === 'pt') this.exitPT()
      this.floor.dynamic = this.activityHolds.has('fold') || this.activityHolds.has('spin') || this.activityHolds.has('park')
      if (!this.floor.converged || this.floor.dynamic) this.floor.step(this.scene)
      this.post.setMode('raster')
      this.post.render(dt)
    }
    this.frameMs = this.frameMs * 0.9 + dt * 1000 * 0.1
    const job = this.captureJob
    if (job) {
      const spp = this.mode === 'pt' ? Math.floor(this.pt.samples) : 0
      job.onProgress?.(spp, job.target)
      const done = job.saveNow || (this.mode === 'pt' && spp >= job.target && this.post.ptPass.fullscreenMaterial.uniforms.mixT.value >= 0.999)
      if (done) {
        this.captureJob = null
        this.controls.enabled = true
        // the drawing buffer still holds this frame: grab it now
        this.canvas.toBlob((b) => job.resolve(b), 'image/png')
      }
    }
  }

  // --- export ---------------------------------------------------------------------
  snapshot(type = 'image/png') {
    return new Promise((res) => this.canvas.toBlob(res, type))
  }
}

export { ENVS }
