// Progressive path tracing (three-gpu-pathtracer, WebGL backend). The Studio
// switches to it when the view is still; interaction drops back to raster.
import * as THREE from 'three'
import { WebGLPathTracer } from 'three-gpu-pathtracer'
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker'

export class PathTracer {
  constructor(renderer) {
    this.renderer = renderer
    // the WebGL backend logs a deprecation notice on construction; it is the
    // backend that works with the rest of this WebGL pipeline
    const warn = console.warn
    console.warn = () => {}
    this.pt = new WebGLPathTracer(renderer)
    console.warn = warn
    const pt = this.pt
    pt.renderToCanvas = false
    pt.rasterizeScene = false
    pt.minSamples = 1
    pt.renderDelay = 0
    pt.fadeDuration = 0
    pt.dynamicLowRes = false
    pt.tiles.set(2, 2)
    pt.bounces = 7
    pt.transmissiveBounces = 6
    pt.filterGlossyFactor = 0.5
    pt.multipleImportanceSampling = true
    pt.renderScale = 0.75
    pt.textureSize.set(1024, 1024)
    this.dirtyScene = true
    this.dirtyMaterials = false
    this.dirtyEnv = false
    this.ready = false
    this.building = false
    // The path tracer reads scene.environment / background / lights whenever
    // it (re)loads them, including when an async BVH build lands. `sceneState`
    // (set by the Studio) swaps in what the path tracer should see (e.g. the
    // sky WITH its sun instead of the raster light probe) for exactly that
    // long and returns the undo.
    this.sceneState = null
    let depth = 0
    for (const k of ['_updateFromResults', 'updateEnvironment', 'updateLights']) {
      const orig = pt[k].bind(pt)
      pt[k] = (...a) => {
        const undo = depth++ === 0 ? this.sceneState?.() : null
        try { return orig(...a) } finally { if (--depth === 0) undo?.() }
      }
    }
    this.indirectClamp = { value: 0 }
    installIndirectClamp(pt._pathTracer.material, this.indirectClamp)
    try {
      this.worker = new GenerateMeshBVHWorker()
      this.pt.setBVHWorker(this.worker)
    } catch (e) {
      this.worker = null
    }
  }

  get samples() { return this.pt.samples }
  get texture() { return this.pt.target.texture }
  get compiling() { return this.pt.isCompiling }

  // Build (or rebuild) the BVH + material/texture tables from the scene.
  // The scene is snapshotted synchronously inside prepare/restore; the BVH is
  // then built in a worker so the UI never freezes. `after` runs once the
  // results are uploaded (used to hand the path tracer its environment).
  async build(scene, camera, prepare, restore, after) {
    this.building = true
    this.dirtyScene = false
    const t0 = performance.now()
    if (this.forceFull) {
      // big rigid motions (folding) would only refit the BVH: rebuild it
      const gen = this.pt._generator
      gen.staticGeometryGenerator?._geometryMergeSets?.delete?.(gen.geometry)
      this.forceFull = false
    }
    prepare?.()
    let job
    try {
      job = this.worker ? this.pt.setSceneAsync(scene, camera) : this.pt.setScene(scene, camera)
    } finally {
      restore?.()
    }
    this.syncMs = performance.now() - t0
    await job
    after?.()
    this.buildMs = performance.now() - t0
    this.building = false
    this.dirtyMaterials = false
    this.dirtyEnv = false
    this.ready = true
  }

  restart(camera) {
    if (this.dirtyMaterials) { this.pt.updateMaterials(); this.dirtyMaterials = false }
    if (this.dirtyEnv) { this.pt.updateEnvironment(); this.dirtyEnv = false }
    this.pt.setCamera(camera)
    this.pt.reset()
  }

  // render `tiles` tiles this frame
  step(tiles = 4) {
    for (let i = 0; i < tiles; i++) this.pt.renderSample()
  }
}

// "Clamp indirect", after Cycles: once a path has bounced off a rough surface,
// whatever it gathers afterwards is limited in luminance. It kills the sun
// caustics (sun -> chrome -> wall) that otherwise speckle a sunny set for
// thousands of samples, and leaves direct light, emitters and mirror-like
// reflections seen by the camera untouched. 0 disables it.
function installIndirectClamp(material, uniform) {
  let fs = material.fragmentShader
  const edits = [
    ['void main() {', 'uniform float indirectClamp;\n\t\t\t\tvoid main() {'],
    ['gl_FragColor = vec4( 0, 0, 0, 1 );', 'gl_FragColor = vec4( 0, 0, 0, 1 );\n\t\t\t\t\tvec3 roughBase = vec3( 0.0 );\n\t\t\t\t\tbool roughCrossed = false;'],
    ['gl_FragColor.rgb += ( surf.emission * state.throughputColor );', 'gl_FragColor.rgb += ( surf.emission * state.throughputColor );\n\t\t\t\t\t\tif ( ! roughCrossed && state.accumulatedRoughness > 0.5 ) { roughCrossed = true; roughBase = gl_FragColor.rgb; }'],
    ['gl_FragColor.a *= opacity;', 'if ( roughCrossed && indirectClamp > 0.0 ) {\n\t\t\t\t\t\tvec3 ind = max( gl_FragColor.rgb - roughBase, vec3( 0.0 ) );\n\t\t\t\t\t\tfloat l = luminance( ind );\n\t\t\t\t\t\tif ( l > indirectClamp ) gl_FragColor.rgb = roughBase + ind * ( indirectClamp / l );\n\t\t\t\t\t}\n\t\t\t\t\tgl_FragColor.a *= opacity;'],
  ]
  for (const [a, b] of edits) {
    if (!fs.includes(a)) { console.warn('indirect clamp: shader changed, not installed'); return }
    fs = fs.replace(a, b)
  }
  material.fragmentShader = fs
  material.uniforms.indirectClamp = uniform
  material.needsUpdate = true
}

export const _v = new THREE.Vector3()
