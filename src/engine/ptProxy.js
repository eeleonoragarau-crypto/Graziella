// The WebGL path-tracing backend mis-shades the clearcoat lobe (NaN -> black).
// For path tracing only, clearcoated materials are swapped for an equivalent
// single-lobe material: the glossy clear layer becomes the specular lobe and
// the clear coat's orange peel moves to the normal map.
const proxies = new Map()

function sync(src, p) {
  p.copy(src)
  p.name = src.name + '·pt'
  // path-tracer-only overrides (e.g. real transmission for glass)
  const o = src.userData.pt
  if (o) {
    for (const [k, v] of Object.entries(o)) {
      if (p[k] && p[k].isColor) p[k].set(v)
      else p[k] = v
    }
  }
  const cc = src.clearcoat
  if (cc > 0) {
    const ccRough = Math.max(0.045, src.clearcoatRoughness * 1.3)
    if (src.metalness < 0.5) {
      p.roughness = src.roughness + (ccRough - src.roughness) * cc
    } else {
      p.roughness = src.roughness + (Math.max(0.12, ccRough) - src.roughness) * cc * 0.6
    }
    if (src.clearcoatNormalMap && !src.normalMap) {
      p.normalMap = src.clearcoatNormalMap
      p.normalScale.copy(src.clearcoatNormalScale)
    }
    p.clearcoat = 0
    p.clearcoatNormalMap = null
    p.clearcoatMap = null
    p.clearcoatRoughnessMap = null
  }
  p.needsUpdate = true
  return p
}

export function needsProxy(m) { return !!m && m.isMeshStandardMaterial && ((m.isMeshPhysicalMaterial && m.clearcoat > 0) || !!m.userData.pt) }

export function proxyFor(m) {
  let p = proxies.get(m)
  if (!p) { p = m.clone(); proxies.set(m, p) }
  return sync(m, p)
}

export function syncProxies() { for (const [src, p] of proxies) sync(src, p) }

// swap materials on every mesh under root; returns an undo function
export function swapToProxies(root) {
  const undo = []
  root.traverse((o) => {
    if (o.isMesh && needsProxy(o.material)) { undo.push([o, o.material]); o.material = proxyFor(o.material) }
  })
  return () => { for (const [o, m] of undo) o.material = m }
}
