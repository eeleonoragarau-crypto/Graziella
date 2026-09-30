// Post stack shared by both renderers:
//   [RenderPass + N8AO]  or  [PathTracer input, crossfaded from the last raster frame]
//   -> exposure -> bloom + tone mapping -> SMAA (raster only) -> lens (CA, vignette, grain)
import * as THREE from 'three'
import {
  EffectComposer, RenderPass, EffectPass, Pass, Effect, BloomEffect, ToneMappingEffect, ToneMappingMode,
  SMAAEffect, SMAAPreset, VignetteEffect, NoiseEffect, ChromaticAberrationEffect, BlendFunction,
} from 'postprocessing'
import { N8AOPostPass } from 'n8ao'

const FS_VERT = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }'

// Normals + linear depth of the current view, rendered once when the path
// tracer takes over (the view is still), to guide its denoiser.
export class GBuffer {
  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true })
    this.material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec3 vN; varying float vZ;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vN; varying float vZ;
        void main() { vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; gl_FragColor = vec4(n, vZ); }`,
    })
  }
  setSize(w, h) { this.target.setSize(w, h) }
  render(renderer, scene, camera) {
    const prev = { o: scene.overrideMaterial, bg: scene.background, t: renderer.getRenderTarget(), clr: renderer.getClearColor(new THREE.Color()), a: renderer.getClearAlpha(), sm: renderer.shadowMap.autoUpdate }
    // see-through things are not surfaces for the guide
    const hidden = []
    scene.traverse((o) => { if (o.isMesh && o.visible && (o.material?.transparent || o.userData.rasterOnly)) { o.visible = false; hidden.push(o) } })
    scene.overrideMaterial = this.material
    scene.background = null
    renderer.shadowMap.autoUpdate = false
    renderer.setRenderTarget(this.target)
    renderer.setClearColor(0x000000, 0)
    renderer.clear(true, true, true)
    renderer.render(scene, camera)
    scene.overrideMaterial = prev.o
    scene.background = prev.bg
    renderer.shadowMap.autoUpdate = prev.sm
    renderer.setClearColor(prev.clr, prev.a)
    renderer.setRenderTarget(prev.t)
    for (const o of hidden) o.visible = true
    return this.target.texture
  }
}

// Writes the path-traced image, crossfading from a captured raster frame.
class PTInputPass extends Pass {
  constructor() {
    super('PTInputPass')
    this.fullscreenMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tPT: { value: null }, tRaster: { value: null }, tG: { value: null }, useG: { value: 0 },
        mixT: { value: 0 }, dn: { value: 0 }, threshold: { value: 0.1 },
      },
      vertexShader: FS_VERT,
      // Guided denoise, faded out as the path tracer converges. Taps are
      // weighted by space, by the path-traced colour (after Morrone's
      // glslSmartDeNoise) and by three noise-free guides: the last raster
      // frame (it already holds every texture and shadow edge), the normals
      // and the depth of the view. Flat regions can then be smoothed hard
      // without blurring edges or texture.
      fragmentShader: `
        uniform sampler2D tPT; uniform sampler2D tRaster; uniform sampler2D tG; uniform float useG;
        uniform float mixT; uniform float dn; uniform float threshold;
        varying vec2 vUv;
        vec3 guidedDenoise(vec2 uv) {
          const float radius = 4.0;
          const float stride = 2.0;
          const float sigma = 4.2;
          vec2 size = vec2(textureSize(tPT, 0));
          vec3 c = texture2D(tPT, uv).rgb;
          vec3 rc = texture2D(tRaster, uv).rgb;
          vec4 gc = texture2D(tG, uv);
          bool geo = useG > 0.5 && dot(gc.xyz, gc.xyz) > 0.25;
          float invS = 0.5 / (sigma * sigma);
          float invT = 0.5 / (threshold * threshold * 4.0);
          const float invR = 0.5 / (0.09 * 0.09);
          float z = 0.0; vec3 acc = vec3(0.0);
          for (float x = -radius; x <= radius; x++) {
            for (float y = -radius; y <= radius; y++) {
              vec2 d = vec2(x, y);
              if (dot(d, d) > radius * radius) continue;
              vec2 o = d * stride;
              vec2 tuv = uv + o / size;
              vec3 w = texture2D(tPT, tuv).rgb;
              vec3 dc = (w - c) / (1.0 + c + w);
              float f = exp(-dot(o, o) * invS) * exp(-dot(dc, dc) * invT);
              vec3 rw = texture2D(tRaster, tuv).rgb;
              vec3 dr = (rw - rc) / (0.04 + rc + rw);
              f *= exp(-dot(dr, dr) * invR);
              if (geo) {
                vec4 gi = texture2D(tG, tuv);
                f *= pow(max(0.0, dot(gc.xyz, gi.xyz)), 32.0) * exp(-abs(gi.w - gc.w) / (0.012 * gc.w + 0.002));
              }
              z += f; acc += f * w;
            }
          }
          return z > 1e-6 ? acc / z : c;
        }
        void main(){
          vec3 pt = texture2D(tPT, vUv).rgb;
          if (dn > 0.001) pt = mix(pt, guidedDenoise(vUv), dn);
          vec3 r = texture2D(tRaster, vUv).rgb;
          gl_FragColor = vec4(mix(r, pt, mixT), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    })
    this.needsSwap = true
  }
  render(renderer, inputBuffer, outputBuffer) {
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }
}

// Copies the current (linear, post-AO) raster frame into `target` on demand.
class CapturePass extends Pass {
  constructor() {
    super('CapturePass')
    this.needsSwap = false
    this.capture = false
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
    this.fullscreenMaterial = new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null } },
      vertexShader: FS_VERT,
      fragmentShader: 'uniform sampler2D tIn; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tIn, vUv); }',
      depthTest: false, depthWrite: false,
    })
  }
  render(renderer, inputBuffer) {
    if (!this.capture) return
    this.fullscreenMaterial.uniforms.tIn.value = inputBuffer.texture
    renderer.setRenderTarget(this.target)
    renderer.render(this.scene, this.camera)
    this.capture = false
  }
  setSize(w, h) { this.target.setSize(w, h) }
}

class ExposureEffect extends Effect {
  constructor() {
    super('ExposureEffect', `
      uniform float exposure; uniform float saturation;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb * exposure;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        outputColor = vec4(mix(vec3(l), c, saturation), inputColor.a);
      }`, { uniforms: new Map([['exposure', new THREE.Uniform(1)], ['saturation', new THREE.Uniform(1)]]) })
  }
}

export class PostStack {
  constructor(renderer, scene, camera) {
    this.renderer = renderer
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 })
    this.renderPass = new RenderPass(scene, camera)
    this.n8ao = new N8AOPostPass(scene, camera, 1, 1)
    Object.assign(this.n8ao.configuration, {
      aoRadius: 0.22, distanceFalloff: 0.55, intensity: 2.6, color: new THREE.Color(0, 0, 0),
      aoSamples: 16, denoiseSamples: 8, denoiseRadius: 6, halfRes: false, gammaCorrection: false,
      screenSpaceRadius: false,
    })
    this.capture = new CapturePass()
    this.gbuffer = new GBuffer()
    this.ptPass = new PTInputPass()
    this.ptPass.enabled = false

    this.exposure = new ExposureEffect()
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.05, luminanceSmoothing: 0.25, intensity: 0.32, radius: 0.72 })
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })
    this.smaa = new SMAAEffect({ preset: SMAAPreset.ULTRA })
    this.ca = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.00045, 0.00045), radialModulation: true, modulationOffset: 0.28 })
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.38 })
    this.grain = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.ADD })
    this.grain.blendMode.opacity.value = 0.045

    this.passExposure = new EffectPass(camera, this.exposure)
    this.passTone = new EffectPass(camera, this.bloom, this.tone)
    this.passSMAA = new EffectPass(camera, this.smaa)
    this.passLens = new EffectPass(camera, this.ca, this.vignette, this.grain)

    const c = this.composer
    c.addPass(this.renderPass)
    c.addPass(this.n8ao)
    c.addPass(this.capture)
    c.addPass(this.ptPass)
    c.addPass(this.passExposure)
    c.addPass(this.passTone)
    c.addPass(this.passSMAA)
    c.addPass(this.passLens)
  }

  setMode(mode) {
    const pt = mode === 'pt'
    this.renderPass.enabled = !pt
    this.n8ao.enabled = !pt && this.aoOn !== false
    this.capture.enabled = !pt
    this.ptPass.enabled = pt
    this.passSMAA.enabled = !pt
  }

  setToneMapping(key) {
    this.tone.mode = { neutral: ToneMappingMode.NEUTRAL, agx: ToneMappingMode.AGX, aces: ToneMappingMode.ACES_FILMIC }[key] ?? ToneMappingMode.NEUTRAL
  }

  setSize(w, h) {
    // on retina screens the AO at half resolution is indistinguishable and twice as cheap
    this.n8ao.configuration.halfRes = this.renderer.getPixelRatio() >= 1.5
    this.composer.setSize(w, h, false)
    this.capture.setSize(Math.floor(w * this.renderer.getPixelRatio()), Math.floor(h * this.renderer.getPixelRatio()))
    this.gbuffer.setSize(Math.floor(w * this.renderer.getPixelRatio()), Math.floor(h * this.renderer.getPixelRatio()))
  }

  render(dt) { this.composer.render(dt) }
}
