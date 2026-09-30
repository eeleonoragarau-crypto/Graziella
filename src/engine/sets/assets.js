// Set assets: CC0 Poly Haven texture sets and glTF props under /sets/
// (fetched by tools/fetch-assets.mjs). Everything is cached, and every image
// is ONE Texture object shared by all the materials that use it: geometry UVs
// are in metres and each texture's repeat is 1 / its real-world size, so the
// path tracer packs each image once.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { assetUrl, assetsAreLocal, manifest, queued } from '../assetUrl.js'

// real-world size of one tile, metres (Poly Haven metadata)
export const TEX_SIZE = {
  patterned_cobblestone: 2.5, granite_tile_03: 1.802, yellow_plaster: 2, red_plaster_weathered: 2,
  painted_plaster_wall: 2, beige_wall_002: 3, peeling_painted_wall: 1.8, marble_01: 1.5,
  wood_peeling_paint_weathered: 0.762, clay_roof_tiles: 4, garage_floor: 1.886, painted_concrete: 2,
  white_plaster_rough_01: 1, concrete_wall_008: 2.71, painted_metal_shutter: 2, wood_table_worn: 0.55, plywood: 0.5,
}
export const TEX_RES = { patterned_cobblestone: '2k', granite_tile_03: '2k', yellow_plaster: '2k', garage_floor: '2k' }

const loader = new THREE.TextureLoader()
const texCache = new Map()
let anisotropy = 8
export function setAnisotropy(n) { anisotropy = n }

// Streaming from the CDN, 2k maps come as 1k: four times lighter, and the
// path tracer packs every texture at 1024 px anyway.
async function resolveTex(url) {
  const u = await assetUrl(url)
  if (await assetsAreLocal()) return u
  return u.replace('/jpg/2k/', '/jpg/1k/').replace(/_2k\.jpg$/, '_1k.jpg')
}

function loadTex(url, { srgb = false, repeat = 1 } = {}) {
  if (!texCache.has(url)) {
    texCache.set(url, resolveTex(url).then((u) => queued(() => loader.loadAsync(u))).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = anisotropy
      t.repeat.set(repeat, repeat)
      return t
    }))
  }
  return texCache.get(url)
}

// { map, normalMap, arm, size } for a Poly Haven texture set
const setCache = new Map()
export function textureSet(id) {
  if (!setCache.has(id)) {
    const res = TEX_RES[id] || '1k'
    const size = TEX_SIZE[id] || 1
    const base = `/sets/tex/${id}/${id}_`
    const r = 1 / size
    setCache.set(id, Promise.all([
      loadTex(`${base}diff_${res}.jpg`, { srgb: true, repeat: r }),
      loadTex(`${base}nor_gl_${res}.jpg`, { repeat: r }),
      loadTex(`${base}arm_${res}.jpg`, { repeat: r }),
    ]).then(([map, normalMap, arm]) => ({ id, map, normalMap, arm, size })))
  }
  return setCache.get(id)
}

// Grey-scale height (0..1) of a texture set's displacement map, for real
// relief near the camera. Returns { data: Float32Array, w, h, size }.
const dispCache = new Map()
export function displacement(id) {
  if (!dispCache.has(id)) {
    const res = TEX_RES[id] || '1k'
    dispCache.set(id, new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.width; c.height = img.height
        const g = c.getContext('2d', { willReadFrequently: true })
        g.drawImage(img, 0, 0)
        const px = g.getImageData(0, 0, c.width, c.height).data
        const data = new Float32Array(c.width * c.height)
        for (let i = 0; i < data.length; i++) data[i] = px[i * 4] / 255
        resolve({ data, w: c.width, h: c.height, size: TEX_SIZE[id] || 1 })
      }
      img.onerror = reject
      img.crossOrigin = 'anonymous' // read back from the CDN into a canvas
      resolveTex(`/sets/tex/${id}/${id}_disp_${res}.jpg`).then((u) => { img.src = u })
    }))
  }
  return dispCache.get(id)
}

// bilinear, tiling sample of a displacement field at world (u, v) metres
export function sampleDisp(d, u, v) {
  const x = ((u / d.size) % 1 + 1) % 1 * d.w - 0.5
  const y = (1 - ((v / d.size) % 1 + 1) % 1) * d.h - 0.5
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  const W = d.w, H = d.h
  const at = (i, j) => d.data[(((j % H) + H) % H) * W + (((i % W) + W) % W)]
  const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), e = at(x0 + 1, y0 + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy
}

// A graded copy of an albedo map (saturation / gamma), made once on a canvas.
const gradeCache = new Map()
function graded(tex, { sat = 1, gamma = 1 } = {}) {
  const k = tex.uuid + '|' + sat + '|' + gamma
  if (!gradeCache.has(k)) {
    const img = tex.image
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data
    for (let i = 0; i < px.length; i += 4) {
      let r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255
      const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b
      r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat
      px[i] = 255 * Math.pow(Math.min(1, Math.max(0, r)), gamma)
      px[i + 1] = 255 * Math.pow(Math.min(1, Math.max(0, gg)), gamma)
      px[i + 2] = 255 * Math.pow(Math.min(1, Math.max(0, b)), gamma)
    }
    g.putImageData(d, 0, 0)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.copy(tex.repeat)
    t.anisotropy = anisotropy
    gradeCache.set(k, t)
  }
  return gradeCache.get(k)
}

// PBR material from a texture set. `tint` multiplies the albedo, `rough`
// scales the ARM roughness, `normal` scales the normal map, `grade`
// ({ sat, gamma }) makes a re-graded copy of the albedo.
export async function pbr(id, { tint = '#ffffff', rough = 1, normal = 1, metal = 0, side = THREE.FrontSide, vertexColors = false, name, grade = null } = {}) {
  const t = await textureSet(id)
  const m = new THREE.MeshStandardMaterial({
    name: name || id, color: tint, map: grade ? graded(t.map, grade) : t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(normal, normal),
    roughnessMap: t.arm, roughness: rough, metalness: metal, metalnessMap: metal > 0 ? t.arm : null,
    aoMap: t.arm, aoMapIntensity: 1, side, vertexColors,
  })
  return m
}

// --- glTF props -------------------------------------------------------------------
const gltf = new GLTFLoader()
const modelCache = new Map()

// Transmissive glTF materials would make three.js render the scene twice per
// frame; the raster keeps a cheap transparent version and the path tracer gets
// the real transmission through userData.pt (see ptProxy.js).
function prepMaterial(m) {
  if (m.transmission > 0) {
    m.userData.pt = { transmission: m.transmission, opacity: 1, transparent: false, ior: m.ior || 1.5, thickness: m.thickness || 0.002 }
    m.transmission = 0
    m.transparent = true
    m.opacity = 0.28
    m.depthWrite = false
  }
  if (m.map) m.map.anisotropy = anisotropy
  return m
}

// Rigged props (vices, tool chests) come as SkinnedMesh: bake the rest pose
// into plain geometry so copies can be cloned and the path tracer sees them.
function bakeSkinned(root) {
  const list = []
  root.traverse((o) => { if (o.isSkinnedMesh) list.push(o) })
  const p = new THREE.Vector3(), q = new THREE.Vector3(), n = new THREE.Vector3()
  for (const sm of list) {
    sm.skeleton.update()
    const g = sm.geometry.clone()
    const pos = g.attributes.position, nrm = g.attributes.normal
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i)
      if (nrm) { n.fromBufferAttribute(nrm, i); q.copy(p).addScaledVector(n, 1e-3) }
      sm.applyBoneTransform(i, p)
      pos.setXYZ(i, p.x, p.y, p.z)
      if (nrm) { sm.applyBoneTransform(i, q); n.subVectors(q, p).normalize(); nrm.setXYZ(i, n.x, n.y, n.z) }
    }
    g.deleteAttribute('skinIndex')
    g.deleteAttribute('skinWeight')
    g.computeBoundingBox(); g.computeBoundingSphere()
    const m = new THREE.Mesh(g, sm.material)
    m.name = sm.name
    m.position.copy(sm.position); m.quaternion.copy(sm.quaternion); m.scale.copy(sm.scale)
    sm.parent.add(m)
    sm.parent.remove(sm)
  }
  // bones are no longer needed
  const bones = []
  root.traverse((o) => { if (o.isBone) bones.push(o) })
  for (const b of bones) if (b.parent && !b.parent.isBone) b.parent.remove(b)
}

// On the CDN a model's buffers and textures do not sit next to its .gltf, so
// the JSON is fetched and its relative uris rewritten from the manifest.
async function fetchGLTF(id) {
  const local = `/sets/models/${id}/${id}_1k.gltf`
  if (await assetsAreLocal()) return gltf.loadAsync(local)
  const map = await manifest()
  const json = await (await fetch(map[local])).json()
  const abs = (uri) => map[`/sets/models/${id}/${uri}`] || uri
  for (const b of json.buffers || []) if (b.uri && !b.uri.startsWith('data:')) b.uri = abs(b.uri)
  for (const im of json.images || []) if (im.uri && !im.uri.startsWith('data:')) im.uri = abs(im.uri)
  return gltf.parseAsync(JSON.stringify(json), '')
}

export function loadModel(id) {
  if (!modelCache.has(id)) {
    modelCache.set(id, queued(() => fetchGLTF(id)).then((g) => {
      const root = g.scene
      root.name = id
      root.updateMatrixWorld(true)
      bakeSkinned(root)
      root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = o.receiveShadow = true
          o.material = prepMaterial(o.material)
        }
      })
      root.updateMatrixWorld(true)
      return root
    }))
  }
  return modelCache.get(id)
}

// A placed copy of a prop. Geometry and materials are shared between copies.
// `at` is where the anchor of its (rotated) bounding box lands: the bottom
// centre, or with anchor 'back' / 'front' / 'left' / 'right' the bottom of the
// side at min z / max z / min x / max x (for things standing against a wall).
export async function prop(id, { at = [0, 0, 0], rotY = 0, rot = null, order = 'XYZ', scale = 1, anchor = 'bottom' } = {}) {
  const src = await loadModel(id)
  const o = src.clone(true)
  o.scale.setScalar(scale)
  if (rot) o.rotation.set(...rot.map((d) => THREE.MathUtils.degToRad(d)), order)
  else o.rotation.y = THREE.MathUtils.degToRad(rotY)
  o.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(o)
  const ref = box.getCenter(new THREE.Vector3())
  ref.y = box.min.y
  if (anchor === 'back') ref.z = box.min.z
  else if (anchor === 'front') ref.z = box.max.z
  else if (anchor === 'left') ref.x = box.min.x
  else if (anchor === 'right') ref.x = box.max.x
  const wrap = new THREE.Group()
  wrap.name = id
  o.position.sub(ref)
  wrap.add(o)
  wrap.position.set(...at)
  wrap.userData.size = box.getSize(new THREE.Vector3())
  return wrap
}
