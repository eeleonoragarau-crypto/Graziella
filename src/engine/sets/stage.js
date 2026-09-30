// SetStage: puts the Graziella inside a real 3D place (la città, il garage)
// instead of the seamless studio paper.
//
// Raster preview
//   sun      SunLight (cascaded shadows), irradiance = the disc painted out of the sky
//   ambient  a light probe: the set is captured into a cube map from where the
//            bike stands (bike hidden), twice, so the second capture already
//            carries one bounce; its PMREM is the scene environment
//   contact  the studio floor's accumulated visibility (bike -> ground, sampled
//            from the sky / lamps) darkens the ground's ambient and area lights
// Path tracing
//   the real geometry + area lights, and the HDRI sky WITH its sun as the
//   importance-sampled environment (see Studio's path-tracer scene state).
import * as THREE from 'three'
import { SunLight } from 'three/examples/jsm/lights/SunLight.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { loadSky } from './sky.js'
import { SETS } from './index.js'

let rectLib = false

// Ground materials: the bike's accumulated contact shadow multiplies the
// ambient (IBL) light and the area lights; the sun has its own shadow map.
export function patchGroundAO(mat, U) {
  const prev = mat.onBeforeCompile
  const prevKey = mat.customProgramCacheKey?.bind(mat)
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r)
    sh.uniforms.tShadow = U.tShadow
    sh.uniforms.shadowCenter = U.shadowCenter
    sh.uniforms.shadowExtent = U.shadowExtent
    sh.uniforms.groundAO = U.groundAO
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
      'rectAreaLight = rectAreaLights[ i ];',
      'rectAreaLight = rectAreaLights[ i ];\n\t\trectAreaLight.color *= gVis;',
    )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGroundW;
        uniform sampler2D tShadow; uniform vec2 shadowCenter; uniform float shadowExtent; uniform float groundAO;
        float groundVis() {
          vec2 suv = (vGroundW.xz - shadowCenter) / (2.0 * shadowExtent) + 0.5;
          if (suv.x <= 0.001 || suv.x >= 0.999 || suv.y <= 0.001 || suv.y >= 0.999) return 1.0;
          // fade out towards the edge of the accumulated map
          vec2 e = min(suv, 1.0 - suv);
          float edge = smoothstep(0.0, 0.08, min(e.x, e.y));
          return mix(1.0, texture2D(tShadow, suv).r, groundAO * edge);
        }`)
      .replace('#include <lights_fragment_begin>', 'float gVis = groundVis();\n' + lights)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= gVis;\nreflectedLight.indirectSpecular *= gVis;')
  }
  mat.customProgramCacheKey = () => 'groundAO|' + (prevKey ? prevKey() : '')
  mat.needsUpdate = true
  return mat
}

export class SetStage {
  constructor(studio) {
    this.studio = studio
    this.built = new Map()
    this.active = null
    this.key = null
    this.variant = null
    this.sky = null
    this.ptEnv = null
    this.skyCache = new Map()

    const sun = (this.sun = new SunLight(0xffffff, 0))
    sun.name = 'sole'
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096) // per cascade
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far = 70 // shadows are fitted to the view up to this depth
    sun.shadow.bias = -0.00015
    sun.shadow.normalBias = 0.012
    sun.shadow.radius = 2.2
    sun.visible = false
    sun.userData.rasterOnly = true

    this.cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false })
    this.cubeCam = new THREE.CubeCamera(0.02, 400, this.cubeRT)
    // a scene with nothing but a background, to turn the sky (or darkness)
    // into a probe-sized cube: every capture pass then uses the same shader
    // variant and nothing compiles twice
    this.bgScene = new THREE.Scene()
    this.pmrem = new THREE.PMREMGenerator(studio.renderer)
    this.envRT = null
    this.groundAO = { value: 1 }
  }

  get isActive() { return !!this.active }

  async load(key, variantKey) {
    const S = this.studio
    // no frames while the set is assembled and its shaders compile in parallel
    S.suspend = true
    try { await this._load(key, variantKey) } finally { S.suspend = false }
  }

  async _load(key, variantKey) {
    const S = this.studio
    const T = (this.timings = { t0: performance.now() })
    const mark = (k) => { T[k] = Math.round(performance.now() - T.t0) }
    this.mark = mark
    let set = this.built.get(key)
    if (!set) {
      const def = SETS[key]
      if (!def) throw new Error('unknown set ' + key)
      const mod = await def.load()
      mark('module')
      set = await mod.build({ THREE, studio: S, stage: this })
      mark('build')
      this.prepare(set)
      this.built.set(key, set)
    }
    if (this.active !== set) {
      if (this.active) S.scene.remove(this.active.group)
      S.scene.add(set.group)
      this.active = set
      this.key = key
    }
    await this.applyVariant(variantKey)
  }

  prepare(set) {
    const U = { ...this.studio.floor.uniforms, groundAO: this.groundAO }
    const grounds = new Set(set.grounds || [])
    let hasRect = false
    set.materials = new Set()
    set.group.traverse((o) => {
      if (o.isRectAreaLight) hasRect = true
      if (!o.isMesh) return
      o.userData.set = true
      if (o.material?.isMeshStandardMaterial) set.materials.add(o.material)
      if (o.userData.noShadow) { o.castShadow = false; o.receiveShadow = true } else if (o.castShadow === false && o.receiveShadow === false) { o.castShadow = o.receiveShadow = true }
      if (grounds.has(o) && !o.material.userData.groundAO) {
        patchGroundAO(o.material, U)
        o.material.userData.groundAO = true
      }
    })
    if (hasRect && !rectLib) { RectAreaLightUniformsLib.init(); rectLib = true }
    set.group.updateMatrixWorld(true)
  }

  async skyFor(cfg) {
    const k = JSON.stringify(cfg)
    if (!this.skyCache.has(k)) this.skyCache.set(k, loadSky(cfg))
    return this.skyCache.get(k)
  }

  async applyVariant(variantKey) {
    const S = this.studio, set = this.active
    const v = set.variants[variantKey] ? variantKey : set.defaultVariant
    const cfg = set.variants[v]
    const sky = await this.skyFor(cfg.sky)
    this.mark?.('sky')
    if (this.active !== set) return // switched away while loading
    this.variant = v
    this.sky = sky
    const sun = this.sun
    if (sky.sun && cfg.sun !== false) {
      sun.visible = true
      sun.color.copy(sky.sun.color)
      sun.intensity = sky.sun.E
      sun.position.copy(sky.sun.dir).multiplyScalar(60)
      sun.updateMatrixWorld()
    } else sun.visible = false
    await set.applyVariant?.(v, cfg, sky)
    S.scene.background = sky.raster
    S.scene.backgroundIntensity = 1
    S.scene.backgroundBlurriness = 0
    this.ptEnv = { environment: sky.pt, background: sky.pt }
    await this.capture(cfg)
    this.mark?.('capture')
    // contact shadow: directions from the sky (or the set's own lamps)
    S.floor.sampler = set.aoSampler ? set.aoSampler(v, sky) : sky.sampler
    this.groundAO.value = cfg.groundAO ?? 1
    this.exposureBias = cfg.exposure ?? 1
    S.pt.indirectClamp.value = cfg.clamp ?? set.clamp ?? 6
    S.floor.reset()
    S.pt.dirtyScene = true
    S.pt.forceFull = true
    S.pt.dirtyEnv = true
    S.poke()
  }

  // Light probe at the bike: two captures so the ambient carries a bounce.
  async capture(cfg = {}) {
    const S = this.studio, scene = S.scene, r = S.renderer, set = this.active
    if (!set) return
    const bikeVisible = S.bike.visible
    S.bike.visible = false
    // emitters that are also area lights would count twice in the probe
    const hide = (set.captureHide || []).filter((o) => o.visible)
    for (const o of hide) o.visible = false
    const probe = set.probe || new THREE.Vector3(0.07, 0.55, 0)
    this.cubeCam.position.copy(probe)
    this.cubeCam.updateMatrixWorld(true)
    const prevTarget = r.getRenderTarget()
    const scale = cfg.envScale ?? set.envScale ?? 0.7
    // pass 0: the open sky outdoors, darkness indoors, as a probe-sized cube
    const indoor = cfg.indoor || set.indoor
    this.bgScene.background = indoor ? new THREE.Color(0, 0, 0) : this.sky.raster
    this.cubeCam.update(r, this.bgScene)
    const zero = this.pmrem.fromCubemap(this.cubeRT.texture)
    // pass 1: direct light (plus that sky)
    for (const m of set.materials) m.envMap = null
    scene.environment = zero.texture
    scene.environmentIntensity = 1
    // compile every material of the set (and the bike under this lighting) in parallel
    try { await r.compileAsync(scene, S.camera, scene) } catch (e) { void e }
    this.mark?.('compile')
    this.cubeCam.update(r, scene)
    const first = this.pmrem.fromCubemap(this.cubeRT.texture)
    zero.dispose()
    // pass 2: the set lit by pass 1 = one bounce.
    // One probe at the bike over-lights the far walls (it sees the bright
    // floor right under it), so the set's own surfaces take it at `scale`.
    scene.environment = first.texture
    for (const m of set.materials) { m.envMap = first.texture; m.envMapIntensity = scale }
    this.cubeCam.update(r, scene)
    const second = this.pmrem.fromCubemap(this.cubeRT.texture)
    this.envRT?.dispose()
    this.envRT = second
    scene.environment = second.texture
    // the bike sits in the probe but the probe still over-counts the bounce
    scene.environmentIntensity = cfg.bikeEnv ?? set.bikeEnv ?? 1
    for (const m of set.materials) m.envMap = second.texture
    first.dispose()
    r.setRenderTarget(prevTarget)
    for (const o of hide) o.visible = true
    S.bike.visible = bikeVisible
  }

  // the path tracer must not collect the probe as a material texture
  ptSwap() {
    const set = this.active
    if (!set) return null
    const saved = []
    for (const m of set.materials) { saved.push([m, m.envMap]); m.envMap = null }
    return () => { for (const [m, e] of saved) m.envMap = e }
  }

  unload() {
    const S = this.studio
    if (this.active) S.scene.remove(this.active.group)
    this.active = null
    this.key = null
    this.sun.visible = false
    this.ptEnv = null
    this.envRT?.dispose()
    this.envRT = null
    this.exposureBias = 1
    S.pt.indirectClamp.value = 0
    S.pt.dirtyScene = true
    S.pt.forceFull = true
    S.pt.dirtyEnv = true
  }
}
