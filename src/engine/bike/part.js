import * as THREE from 'three'

// Every visible piece of the bike is a "part": a Mesh that knows its name,
// whether stickers can go on it, and the UV wrap periods of its surface.
export function part(geo, mat, name, { sticker = true, shadow = true, label } = {}) {
  const m = new THREE.Mesh(geo, mat)
  m.name = name
  m.castShadow = shadow
  m.receiveShadow = true
  m.userData.part = name
  m.userData.label = label || name
  m.userData.stickerable = sticker
  m.userData.wrap = geo.userData.wrap || [0, 0]
  return m
}

export function group(name, ...children) {
  const g = new THREE.Group()
  g.name = name
  for (const c of children.flat()) if (c) g.add(c)
  return g
}
