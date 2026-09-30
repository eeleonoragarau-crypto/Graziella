import * as THREE from 'three'
import { holoThickness } from './artwork.js'

// Vinyl finishes. No clearcoat on purpose: gloss comes from the specular lobe
// so stickers read the same in raster and in the path tracer.
export const STICKER_FINISHES = {
  lucido: { label: 'Lucido', hint: 'Vinile brillante' },
  opaco: { label: 'Opaco', hint: 'Vinile satinato' },
  olografico: { label: 'Olografico', hint: 'Film iridescente' },
  foil: { label: 'Foil', hint: 'Lamina metallica' },
  decal: { label: 'Decal', hint: 'Decalcomania ad acqua' },
  carta: { label: 'Carta', hint: 'Etichetta stampata' },
}

export function applyFinish(m, art, finish) {
  m.map = art.color
  m.normalMap = art.normal
  m.roughnessMap = null
  m.metalnessMap = null
  m.iridescence = 0
  m.iridescenceThicknessMap = null
  m.sheen = 0
  m.metalness = 0
  m.specularIntensity = 1
  m.color.set('#ffffff')
  let ns = 1
  switch (finish) {
    case 'opaco':
      m.roughness = 0.6; ns = 0.8; m.sheen = 0.12; m.sheenRoughness = 0.7; m.sheenColor.set('#ffffff')
      break
    case 'olografico':
      m.roughness = 0.22
      if (art.orm) { m.metalnessMap = art.orm; m.roughnessMap = art.orm; m.roughness = 1; m.metalness = 1 } else m.metalness = 0.85
      m.iridescence = 1; m.iridescenceIOR = 1.9; m.iridescenceThicknessRange = [240, 780]
      m.iridescenceThicknessMap = holoThickness()
      break
    case 'foil':
      m.roughness = 0.16
      if (art.orm) { m.metalnessMap = art.orm; m.roughnessMap = art.orm; m.roughness = 1; m.metalness = 1 } else m.metalness = 0.9
      break
    case 'decal':
      m.roughness = 0.2; ns = 0.35
      break
    case 'carta':
      m.roughness = 0.84; ns = 1.2; m.sheen = 0.35; m.sheenRoughness = 0.85; m.sheenColor.set('#ffffff'); m.specularIntensity = 0.6
      break
    default:
      m.roughness = 0.13
  }
  m.normalScale.set(ns, ns)
  m.needsUpdate = true
}

export function makeStickerMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    alphaTest: 0.5, side: THREE.DoubleSide, transparent: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3,
  })
  m.name = 'sticker'
  return m
}
