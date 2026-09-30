// Physically based material set. Everything is a MeshPhysicalMaterial /
// MeshStandardMaterial so the same objects render in raster AND path tracing.
import * as THREE from 'three'
import { orangePeel, leatherGrain, leatherRough, rubberNormal, chromeRough } from './textures.js'

const rep = (tex, perMetre) => { const t = tex.clone(); t.repeat.set(perMetre, perMetre); t.needsUpdate = true; return t }

// period colours of the 1960s-70s folders (names, not brands)
export const PAINTS = [
  { id: 'rosso', name: 'Rosso corsa', hex: '#a5121c' },
  { id: 'bordeaux', name: 'Bordeaux', hex: '#5e1622' },
  { id: 'arancio', name: 'Arancio Riviera', hex: '#d2561f' },
  { id: 'giallo', name: 'Giallo sole', hex: '#e7b322' },
  { id: 'crema', name: 'Crema', hex: '#e9dfc6' },
  { id: 'bianco', name: 'Bianco', hex: '#efede7' },
  { id: 'rosa', name: 'Rosa confetto', hex: '#e6a2a6' },
  { id: 'lilla', name: 'Lilla', hex: '#a894c2' },
  { id: 'azzurro', name: 'Azzurro', hex: '#7fb3d1' },
  { id: 'celeste', name: 'Celeste', hex: '#8fcfc6' },
  { id: 'menta', name: 'Verde menta', hex: '#94cdb0' },
  { id: 'oliva', name: 'Verde oliva', hex: '#6b6a3a' },
  { id: 'bosco', name: 'Verde bosco', hex: '#1f4a37' },
  { id: 'blu', name: 'Blu notte', hex: '#1d2c52' },
  { id: 'argento', name: 'Argento', hex: '#b9bdc0' },
  { id: 'nero', name: 'Nero', hex: '#141414' },
]

export const paintHex = (b) => (b.paint === 'custom' ? b.custom || '#2f6f8f' : (PAINTS.find((p) => p.id === b.paint) || PAINTS[0]).hex)
export const paintName = (b) => (b.paint === 'custom' ? 'Personalizzato ' + (b.custom || '').toUpperCase() : (PAINTS.find((p) => p.id === b.paint) || PAINTS[0]).name)

export const FINISHES = {
  lucida: { name: 'Lucida', roughness: 0.34, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.035, flake: 0 },
  metal: { name: 'Metallizzata', roughness: 0.32, metalness: 0.62, clearcoat: 1.0, clearcoatRoughness: 0.03, flake: 1 },
  // mica pearl: a thin-film sheen that shifts hue with the angle, under a deep clear coat
  perlata: { name: 'Perlata', roughness: 0.3, metalness: 0.18, clearcoat: 1.0, clearcoatRoughness: 0.03, flake: 0.55, iridescence: 0.62, iridescenceIOR: 1.34, iridescenceRange: [300, 560] },
  satinata: { name: 'Satinata', roughness: 0.42, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.28, flake: 0 },
  opaca: { name: 'Opaca', roughness: 0.62, metalness: 0.0, clearcoat: 0.0, clearcoatRoughness: 0.5, flake: 0 },
}

export const TYRES = {
  fascia: { name: 'Bianche', wall: '#e8e1cf' },
  para: { name: 'Para', wall: '#a8773f' },
  nere: { name: 'Nere', wall: '#1b1a19' },
}

export const LEATHERS = {
  cuoio: { name: 'Cuoio', hex: '#6a3d20', sheen: '#9a6a44' },
  miele: { name: 'Miele', hex: '#a8672a', sheen: '#d49a5c' },
  bianco: { name: 'Bianco', hex: '#e6e1d6', sheen: '#ffffff' },
  nero: { name: 'Nero', hex: '#1a1817', sheen: '#6a6a6a' },
}

// metallic flake normal map (very fine, isotropic)
let _flake = null
function flakeNormal() {
  if (_flake) return _flake
  const S = 256, d = new Uint8Array(S * S * 4)
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let i = 0; i < S * S; i++) {
    const a = rnd() * Math.PI * 2, t = Math.sqrt(rnd()) * 0.55
    const nx = Math.cos(a) * t, ny = Math.sin(a) * t, nz = Math.sqrt(1 - t * t)
    d[i * 4] = (nx * 0.5 + 0.5) * 255; d[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; d[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; d[i * 4 + 3] = 255
  }
  const t = new THREE.DataTexture(d, S, S)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.repeat.set(160, 160) // ~0.025 mm flakes... reads as sparkle, averages to smooth when far
  t.needsUpdate = true
  _flake = t
  return t
}

export function createMaterials() {
  const M = {}

  M.paint = new THREE.MeshPhysicalMaterial({
    name: 'paint', color: PAINTS[0].hex, roughness: 0.34, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.035,
    clearcoatNormalMap: rep(orangePeel(), 22), clearcoatNormalScale: new THREE.Vector2(0.11, 0.11),
  })

  M.chrome = new THREE.MeshPhysicalMaterial({
    name: 'chrome', color: '#cfd2d4', metalness: 1, roughness: 0.055,
    roughnessMap: rep(chromeRough(), 12),
  })
  M.chromeDS = M.chrome.clone()
  M.chromeDS.name = 'chromeDS'
  M.chromeDS.side = THREE.DoubleSide
  M.chromeSoft = new THREE.MeshPhysicalMaterial({ name: 'chromeSoft', color: '#c4c6c7', metalness: 1, roughness: 0.16 })
  M.steel = new THREE.MeshPhysicalMaterial({ name: 'steel', color: '#8d8b87', metalness: 1, roughness: 0.34 })
  M.darkSteel = new THREE.MeshPhysicalMaterial({ name: 'darkSteel', color: '#4a4845', metalness: 1, roughness: 0.42 })
  M.brass = new THREE.MeshPhysicalMaterial({ name: 'brass', color: '#c9a56a', metalness: 1, roughness: 0.28 })
  M.copper = new THREE.MeshPhysicalMaterial({ name: 'copper', color: '#c98b5f', metalness: 1, roughness: 0.3 })

  M.tyre = new THREE.MeshPhysicalMaterial({
    name: 'tyre', color: '#ffffff', vertexColors: true, roughness: 0.74, metalness: 0,
    normalMap: rep(rubberNormal(), 30), normalScale: new THREE.Vector2(0.35, 0.35),
    sheen: 0.25, sheenRoughness: 0.55, sheenColor: new THREE.Color('#3a3a3a'),
  })
  M.rubber = new THREE.MeshPhysicalMaterial({
    name: 'rubber', color: '#1c1b1a', roughness: 0.68,
    normalMap: rep(rubberNormal(), 40), normalScale: new THREE.Vector2(0.3, 0.3),
    sheen: 0.2, sheenRoughness: 0.5, sheenColor: new THREE.Color('#444'),
  })
  M.grip = new THREE.MeshPhysicalMaterial({
    name: 'grip', color: LEATHERS.cuoio.hex, roughness: 0.62,
    normalMap: rep(rubberNormal(), 60), normalScale: new THREE.Vector2(0.25, 0.25),
    sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color(LEATHERS.cuoio.sheen),
  })

  M.leather = new THREE.MeshPhysicalMaterial({
    name: 'leather', color: LEATHERS.cuoio.hex, roughness: 1, metalness: 0,
    roughnessMap: rep(leatherRough(), 5),
    // vegetable-tanned saddle leather: fine, shallow grain and a waxed sheen
    normalMap: rep(leatherGrain(), 46), normalScale: new THREE.Vector2(0.16, 0.16),
    sheen: 0.4, sheenRoughness: 0.45, sheenColor: new THREE.Color(LEATHERS.cuoio.sheen),
    clearcoat: 0.3, clearcoatRoughness: 0.32,
  })
  M.leatherDark = new THREE.MeshPhysicalMaterial({ name: 'leatherDark', color: '#2a1a10', roughness: 0.7 })
  // flesh side of the leather (underside of the saddle): matt, velvety
  M.suede = new THREE.MeshPhysicalMaterial({
    name: 'suede', color: '#8a6446', roughness: 0.96, metalness: 0,
    normalMap: rep(rubberNormal(), 70), normalScale: new THREE.Vector2(0.5, 0.5),
    sheen: 0.8, sheenRoughness: 0.85, sheenColor: new THREE.Color('#c9a888'),
  })

  M.plasticBlack = new THREE.MeshPhysicalMaterial({ name: 'plasticBlack', color: '#121212', roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.2 })
  M.cable = new THREE.MeshPhysicalMaterial({ name: 'cable', color: '#e9e4d8', roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.12 })

  // Glass and lenses: the raster versions are cheap transparent dielectrics
  // (real transmission would force three.js to render the scene twice every
  // frame); `userData.pt` holds the physically transmissive version that the
  // path tracer gets through ptProxy.js.
  M.glass = new THREE.MeshPhysicalMaterial({
    name: 'glass', color: '#ffffff', metalness: 0, roughness: 0.0, transparent: true, opacity: 0.22, depthWrite: false, specularIntensity: 1,
  })
  M.glass.userData.pt = { transmission: 1, opacity: 1, transparent: false, ior: 1.5, thickness: 0.003 }
  M.redLens = new THREE.MeshPhysicalMaterial({ name: 'redLens', color: '#b3121a', metalness: 0, roughness: 0.1, emissive: new THREE.Color('#3a0204'), clearcoat: 0 })
  M.redLens.userData.pt = { transmission: 0.85, ior: 1.49, thickness: 0.006, color: '#d21a1a', emissive: '#000000', attenuationColor: '#b0060a', attenuationDistance: 0.004 }
  M.amberLens = new THREE.MeshPhysicalMaterial({ name: 'amberLens', color: '#e0861a', metalness: 0, roughness: 0.12, emissive: new THREE.Color('#2a1200') })
  M.amberLens.userData.pt = { transmission: 0.7, ior: 1.49, thickness: 0.004, color: '#f09a1a', emissive: '#000000', attenuationColor: '#d06a00', attenuationDistance: 0.004 }
  M.bulb = new THREE.MeshStandardMaterial({ name: 'bulb', color: '#fff6e0', emissive: new THREE.Color('#ffe7b0'), emissiveIntensity: 0.0, roughness: 0.2 })

  // chain guard / rack alternates (swapped by the configurator)
  M.guardWhite = new THREE.MeshPhysicalMaterial({ name: 'guardWhite', color: '#efece4', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12 })
  M.guardWhiteDS = M.guardWhite.clone(); M.guardWhiteDS.side = THREE.DoubleSide
  M.guardChrome = M.chrome.clone(); M.guardChrome.name = 'guardChrome'
  M.guardPaint = M.paint.clone(); M.guardPaint.name = 'guardPaint'
  M.paintDS = M.paint.clone(); M.paintDS.name = 'paintDS'; M.paintDS.side = THREE.DoubleSide

  return M
}

export function applyPaint(M, hex, finishKey) {
  const f = FINISHES[finishKey] || FINISHES.lucida
  M.paint.color.set(hex)
  M.paint.roughness = f.roughness
  M.paint.metalness = f.metalness
  M.paint.clearcoat = f.clearcoat
  M.paint.clearcoatRoughness = f.clearcoatRoughness
  if (f.flake) {
    M.paint.normalMap = flakeNormal()
    M.paint.normalScale = new THREE.Vector2(0.9 * f.flake, 0.9 * f.flake)
  } else {
    M.paint.normalMap = null
  }
  M.paint.iridescence = f.iridescence || 0
  M.paint.iridescenceIOR = f.iridescenceIOR || 1.3
  M.paint.iridescenceThicknessRange = f.iridescenceRange ? [...f.iridescenceRange] : [100, 400]
  M.paint.needsUpdate = true
}

export function applyLeather(M, key) {
  const l = LEATHERS[key] || LEATHERS.cuoio
  M.leather.color.set(l.hex)
  M.leather.sheenColor.set(l.sheen)
  // the flesh side is paler and duller than the grain side
  M.suede.color.set(l.hex).lerp(new THREE.Color('#b9a58f'), 0.42)
  M.suede.sheenColor.set(l.sheen).lerp(new THREE.Color('#ffffff'), 0.3)
  M.grip.color.set(l.hex)
  M.grip.sheenColor.set(l.sheen)
}
