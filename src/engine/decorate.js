// "Sorprendimi": a tasteful random sticker set, laid down in a cascade.
const SPOTS = [
  { part: 'tuboPrincipaleFronte', t: 0.26, dir: [0, 0.3, 1] },
  { part: 'tuboPrincipaleFronte', t: 0.8, dir: [0, 0.3, 1] },
  { part: 'tuboPrincipaleRetro', t: 0.5, dir: [0, 0.35, 1] },
  { part: 'tuboSella', t: 0.34, dir: [0, 0, 1] },
  { part: 'tuboSella', t: 0.6, dir: [-1, 0, 0.35] },
  // fenders: aim at the crown (radial direction at that point of the arc)
  { part: 'parafangoPost', t: 0.3, dir: [0.3, 0.95, 0.28] },
  { part: 'parafangoPost', t: 0.72, dir: [-0.87, 0.48, 0.28] },
  { part: 'parafangoAnt', t: 0.62, dir: [-0.69, 0.72, 0.28] },
  { part: 'carter', t: 0.62, dir: [0, 0, 1] },
  { part: 'forcellaDx', t: 0.42, dir: [0, 0, 1] },
  { part: 'forcellinoAltoDx', t: 0.42, dir: [0, 0.3, 1] },
  { part: 'tuboPrincipaleFronte', t: 0.5, dir: [0, 1, 0] },
]

function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

export function surprise(studio, arts) {
  const S = studio.stickers
  const V = studio.THREE.Vector3
  const rnd = Math.random
  // keep the factory decals, replace the rest
  const keep = S.serialize().filter((s) => (arts.find((a) => a.id === s.artId)?.category) === 'classici')
  S.record()
  S.restore(keep)
  const pool = shuffle(arts.filter((a) => a.source === 'library' && a.category !== 'classici').map((a) => a.id), rnd)
  const spots = shuffle(SPOTS.slice(), rnd).slice(0, 6 + Math.floor(rnd() * 3))
  let delay = 120
  spots.forEach((sp, i) => {
    const artId = pool[i % pool.length]
    const h = studio.surfaceHit(sp.part, sp.t, new V(...sp.dir))
    if (!h || !artId) return
    const art = S.getArt(artId)
    const st = S.place(artId, h, { animate: false, record: false, width: art.size * (1.05 + rnd() * 0.3) })
    if (!st) return
    S.update(st.id, { rot: st.rot + (rnd() - 0.5) * 0.7 }, { record: false })
    S.peelOn(st, 620, delay)
    delay += 150 + rnd() * 90
  })
  S.select(null)
  S.emit('restore')
}
