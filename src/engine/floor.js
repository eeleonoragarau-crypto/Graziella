// Seamless studio floor. Raster: lit by IBL, darkened by a visibility map that
// is accumulated from hundreds of shadow renders whose light directions are
// importance-sampled from the environment itself (so the soft shadows have the
// exact shape of the softboxes / sun the path tracer sees). Fades into the
// backdrop colour. Path tracing uses a twin plane with a matching alpha fade.
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { floorFade, paperNoise } from './textures.js'

export const LAYER_CASTER = 2

export class StudioFloor {
  constructor(renderer, { center = new THREE.Vector2(0.07, 0), extent = 3.2, size = 2048 } = {}) {
    this.renderer = renderer
    this.center = center
    this.extent = extent
    this.fadeInner = 2.1
    this.fadeOuter = 5.8
    const rtOpts = { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter }
    this.acc = [new THREE.WebGLRenderTarget(size, size, rtOpts), new THREE.WebGLRenderTarget(size, size, rtOpts)]
    this.cur = 0
    const ds = 2048
    this.depthRT = new THREE.WebGLRenderTarget(ds, ds, { depthBuffer: true })
    this.depthRT.depthTexture = new THREE.DepthTexture(ds, ds, THREE.UnsignedIntType)
    this.depthTexel = 1 / ds
    this.shadowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 12)
    this.shadowCam.layers.set(LAYER_CASTER)
    this.depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })
    this.samples = 0
    this.target = 420
    this.perFrame = 6
    this.bounds = new THREE.Sphere(new THREE.Vector3(0.07, 0.52, 0), 0.98)
    this.sampler = null
    this.rand = mulberry(1234)

    this.accQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tPrev: { value: null }, tDepth: { value: this.depthRT.depthTexture }, lightVP: { value: new THREE.Matrix4() },
        center: { value: this.center }, extent: { value: extent }, weight: { value: 1 }, texel: { value: this.depthTexel }, bias: { value: 0.0009 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tPrev; uniform sampler2D tDepth; uniform mat4 lightVP;
        uniform vec2 center; uniform float extent; uniform float weight; uniform float texel; uniform float bias;
        varying vec2 vUv;
        void main(){
          vec3 wp = vec3(center.x + (vUv.x * 2.0 - 1.0) * extent, 0.0, center.y + (vUv.y * 2.0 - 1.0) * extent);
          vec4 lp = lightVP * vec4(wp, 1.0);
          vec3 sc = lp.xyz / lp.w * 0.5 + 0.5;
          float vis = 1.0;
          if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) {
            float s = 0.0;
            for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
              float d = texture2D(tDepth, sc.xy + vec2(float(i), float(j)) * texel).r;
              s += (sc.z - bias > d) ? 0.0 : 1.0;
            }
            vis = s / 9.0;
          }
          float prev = texture2D(tPrev, vUv).r;
          gl_FragColor = vec4(mix(prev, vis, weight), 0.0, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }))
    this.clearQuad = new FullScreenQuad(new THREE.MeshBasicMaterial({ color: 0xffffff }))

    // --- raster floor mesh ---------------------------------------------------
    const geo = new THREE.PlaneGeometry(80, 80, 1, 1)
    geo.rotateX(-Math.PI / 2)
    this.uniforms = {
      tShadow: { value: this.acc[0].texture },
      shadowCenter: { value: this.center },
      shadowExtent: { value: extent },
      bgColor: { value: new THREE.Color() },
      fadeInner: { value: this.fadeInner },
      fadeOuter: { value: this.fadeOuter },
      shadowStrength: { value: 1 },
      sunVis: { value: 0 },
    }
    const mat = new THREE.MeshPhysicalMaterial({ color: '#bbb', roughness: 0.9, metalness: 0, roughnessMap: null })
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWorldP;
          uniform sampler2D tShadow; uniform vec2 shadowCenter; uniform float shadowExtent;
          uniform vec3 bgColor; uniform float fadeInner; uniform float fadeOuter; uniform float shadowStrength;`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
          vec2 suv = (vWorldP.xz - shadowCenter) / (2.0 * shadowExtent) + 0.5;
          float vis = 1.0;
          if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) vis = texture2D(tShadow, suv).r;
          gl_FragColor.rgb *= mix(1.0, vis, shadowStrength);
          float rr = length(vWorldP.xz - shadowCenter);
          float fade = smoothstep(fadeInner, fadeOuter, rr);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, bgColor, fade);`)
    }
    mat.customProgramCacheKey = () => 'studioFloor'
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.name = 'floor'
    this.mesh.receiveShadow = false
    this.mesh.renderOrder = -1

    // --- path-traced twin: same albedo/roughness, alpha fade --------------------
    const g2 = new THREE.PlaneGeometry(this.fadeOuter * 2.05, this.fadeOuter * 2.05, 1, 1)
    g2.rotateX(-Math.PI / 2)
    g2.translate(this.center.x, 0, this.center.y)
    const fadeTex = floorFade(this.fadeInner, this.fadeOuter, this.fadeOuter * 1.025)
    this.ptMat = new THREE.MeshPhysicalMaterial({ color: '#bbb', roughness: 0.9, metalness: 0, alphaMap: fadeTex, transparent: true })
    this.ptMesh = new THREE.Mesh(g2, this.ptMat)
    this.ptMesh.name = 'floorPT'
    this.ptMesh.visible = false
    void paperNoise
  }

  setLook(env) {
    const f = env.cfg.floor
    const c = env.floorColor || new THREE.Color().setScalar(f.albedo)
    for (const m of [this.mesh.material, this.ptMat]) {
      m.color.copy(c)
      m.roughness = f.roughness
      m.specularIntensity = f.specular ?? 0.3
      m.needsUpdate = true
    }
    this.uniforms.bgColor.value.copy(env.bg)
    this.sampler = env.sampler
    this.reset()
  }

  reset() {
    this.samples = 0
    this.done = false
  }

  get converged() { return this.samples >= this.target }

  // accumulate a few more shadow samples; `scene` must have casters on LAYER_CASTER
  step(scene) {
    if (!this.sampler || (this.samples >= this.target && !this.dynamic)) return false
    const r = this.renderer
    const prevTarget = r.getRenderTarget()
    const prevOverride = scene.overrideMaterial
    const prevBg = scene.background
    const prevAuto = r.autoClear
    const prevShadow = r.shadowMap.autoUpdate
    r.shadowMap.autoUpdate = false
    scene.background = null
    const dir = new THREE.Vector3()
    const budget = this.dynamic ? this.perFrame + 4 : this.perFrame
    for (let k = 0; k < budget && (this.samples < this.target || this.dynamic); k++) {
      this.sampler(this.rand(), this.rand(), this.rand(), dir)
      if (dir.y < 0.02) dir.y = 0.02
      dir.normalize()
      const c = this.bounds.center, rad = this.bounds.radius
      const cam = this.shadowCam
      cam.position.copy(c).addScaledVector(dir, 5)
      cam.up.set(0, 1, 0)
      if (Math.abs(dir.y) > 0.97) cam.up.set(1, 0, 0)
      cam.lookAt(c)
      cam.left = -rad; cam.right = rad; cam.top = rad; cam.bottom = -rad
      cam.near = 5 - rad * 1.2; cam.far = 5 + rad * 4
      cam.updateProjectionMatrix(); cam.updateMatrixWorld()
      // depth pass
      scene.overrideMaterial = this.depthOnly
      r.setRenderTarget(this.depthRT)
      r.autoClear = true
      r.clear(true, true, true)
      r.render(scene, cam)
      scene.overrideMaterial = prevOverride
      // accumulate visibility
      const src = this.acc[this.cur], dst = this.acc[1 - this.cur]
      const u = this.accQuad.material.uniforms
      u.tPrev.value = src.texture
      u.lightVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
      // while the bike moves, an exponential moving average lets the shadow follow
      u.weight.value = this.dynamic ? Math.max(1 / (this.samples + 1), 0.12) : 1 / (this.samples + 1)
      // bias in metres -> ortho depth units; grazing directions need a bit more
      u.bias.value = (0.0006 + 0.0012 * (1 - dir.y)) / (cam.far - cam.near)
      r.setRenderTarget(dst)
      this.accQuad.render(r)
      this.cur = 1 - this.cur
      this.samples++
    }
    this.uniforms.tShadow.value = this.acc[this.cur].texture
    scene.background = prevBg
    r.autoClear = prevAuto
    r.shadowMap.autoUpdate = prevShadow
    r.setRenderTarget(prevTarget)
    return true
  }
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
