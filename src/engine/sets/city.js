// La città: a street in an Italian old town. Porphyry setts laid in fans,
// granite pavements and kerbs, ochre and terracotta palazzi with green
// louvred shutters, a side alley, lanterns on brackets, a bar with its
// tables out. The Graziella is parked on the pavement in front of an ochre
// wall, under a balcony, a few steps from a bicycle shop.
//
// Axes: the street runs along x (the bike faces +x), +z is the roadway side.
// The late sun comes almost down the street (azimuth ~14 degrees), grazing
// the bike's side of the street: the far side is kept low enough for it to
// reach the pavement.
import * as THREE from 'three'
import { pbr, prop, textureSet, displacement, sampleDisp } from './assets.js'
import { quad, box, merge, mesh, cylinder, extrudeProfile, v3, rng } from './build.js'
import { Kit, frame, buildFront } from './facade.js'
import { signTextures, plaqueTexture, posterTextures } from './signs.js'

const SKY = '/sets/sky/'
const ZA = -1.75, ZB = 8.9 // facade planes
const KA = 0.62, KB = 7.38 // kerb inner edges (pavement side)
const RA = 0.9, RB = 7.1 // roadway edges
const ROAD = -0.14 // roadway level at the kerb
const XE = 46 // street ends
const ALLEY = [14.2, 20.2] // side alley

// roadway height: crowned, lowest at the kerbs
const crown = (z) => { const t = (z - (RA + RB) / 2) / ((RB - RA) / 2); return ROAD + 0.034 * (1 - t * t) }

// --- buildings ----------------------------------------------------------------------------------
// side A (the bike's side, facing +z), x ranges in world metres
const SIDE_A = [
  { x: [-XE, -33], floors: [4.2, 3.4, 3.4, 3.2], plaster: 'beige', shutter: 'marrone', bays: [2, 5.2, 8.4, 11.2], ground: [{ type: 'shop', u0: 1.0, u1: 4.0, sign: 'latteria' }, { type: 'grata', u0: 6.4, u1: 7.5, v0: 1.05, v1: 2.45 }, { type: 'portone', u0: 9.5, u1: 11.1, v1: 3.0 }], pipes: [0.12] },
  { x: [-33, -24], floors: [4.0, 3.3, 3.3], plaster: 'red', shutter: 'verde', bays: [1.6, 4.5, 7.4], ground: [{ type: 'portone', u0: 3.7, u1: 5.3, v1: 2.95 }], pipes: [8.88] },
  { x: [-24, -13.5], floors: [4.1, 3.4, 3.4, 3.4], plaster: 'white', shutter: 'grigio', bays: [1.8, 5.25, 8.7], ground: [{ type: 'shop', u0: 0.8, u1: 3.7, sign: 'ferramenta', raised: 2.2 }, { type: 'grata', u0: 4.7, u1: 5.8, v0: 1.05, v1: 2.45 }, { type: 'grata', u0: 7.6, u1: 8.7, v0: 1.05, v1: 2.45 }], pipes: [0.12] },
  { x: [-13.5, -4.6], floors: [4.0, 3.3, 3.3, 3.2], plaster: 'peeling', shutter: 'verde', bays: [1.5, 4.45, 7.4], ground: [{ type: 'grata', u0: 3.9, u1: 5.0, v0: 1.05, v1: 2.45 }, { type: 'portone', u0: 6.8, u1: 8.4, v1: 3.0, color: 'marrone' }], balconies: [{ floor: 2, bay: 1 }] },
  // behind the bike
  { x: [-4.6, 5.8], floors: [4.2, 3.4, 3.4, 3.3], plaster: 'yellow', shutter: 'verde', bays: [1.5, 5.2, 8.9], ground: [{ type: 'portone', u0: 0.55, u1: 2.15, v1: 3.0 }, { type: 'shop', u0: 7.0, u1: 9.9, sign: 'cicli' }], pipes: [0.14, 10.26], balconies: [{ floor: 1, bay: 1 }], shutters: { 1: { 0: 'open', 2: 'ajar' }, 2: { 0: 'closed', 1: 'open', 2: 'open' } }, cell: 0.2, detail: 1 },
  { x: [5.8, 14.2], floors: [4.0, 3.3, 3.3], plaster: 'rosa', shutter: 'marrone', bays: [1.6, 4.2, 6.8], ground: [{ type: 'shop', u0: 0.6, u1: 3.4, sign: 'tabacchi', raised: 2.35 }, { type: 'portone', u0: 5.2, u1: 6.8, v1: 2.9 }] },
  { x: [ALLEY[1], 31], floors: [4.2, 3.4, 3.4, 3.4], plaster: 'beige', shutter: 'verde', bays: [1.8, 5.4, 9], ground: [{ type: 'grata', u0: 1.2, u1: 2.3, v0: 1.05, v1: 2.45 }, { type: 'portone', u0: 4.6, u1: 6.2, v1: 3.0 }, { type: 'grata', u0: 8.5, u1: 9.6, v0: 1.05, v1: 2.45 }] },
  { x: [31, XE], floors: [4.0, 3.3, 3.3], plaster: 'yellow2', shutter: 'marrone', bays: [2, 5.5, 9, 12.5], ground: [{ type: 'shop', u0: 1, u1: 4, sign: 'alimentari', raised: 2.3 }, { type: 'shop', u0: 10.5, u1: 13.5 }], pipes: [0.12] },
]
// side B (facing -z): three floors at most so the sun still reaches the pavement opposite
const SIDE_B = [
  { x: [-XE, -30], floors: [4.0, 3.3, 3.2], plaster: 'white', shutter: 'verde', bays: [2, 5.5, 9, 12.5], ground: [{ type: 'portone', u0: 7, u1: 8.6 }, { type: 'grata', u0: 11.6, u1: 12.7, v0: 1.05, v1: 2.45 }] },
  { x: [-30, -19], floors: [4.0, 3.3, 3.3], plaster: 'yellow2', shutter: 'marrone', bays: [1.8, 5.5, 9.2], ground: [{ type: 'shop', u0: 1.2, u1: 4.2 }, { type: 'portone', u0: 7.4, u1: 9.0 }], pipes: [10.9] },
  { x: [-19, -8.5], floors: [3.9, 3.2, 3.2], plaster: 'rosa', shutter: 'verde', bays: [1.7, 5.25, 8.8], ground: [{ type: 'grata', u0: 1.2, u1: 2.3, v0: 1.05, v1: 2.45 }, { type: 'portone', u0: 4.5, u1: 6.1 }, { type: 'grata', u0: 8.2, u1: 9.3, v0: 1.05, v1: 2.45 }] },
  // across from the bike: the bar
  { x: [-8.5, 3.5], floors: [4.0, 3.3, 3.2], plaster: 'white', shutter: 'verde', bays: [1.8, 5.2, 8.6, 10.6], winW: 1.1, ground: [{ type: 'shop', u0: 1.0, u1: 3.9, raised: 2.5 }, { type: 'shop', u0: 4.6, u1: 7.5, sign: 'bar', raised: 2.5, lit: true }, { type: 'portone', u0: 9.2, u1: 10.8, color: 'marrone' }], pipes: [0.12, 11.88], balconies: [{ floor: 1, bay: 1 }, { floor: 1, bay: 2 }] },
  { x: [3.5, ALLEY[0]], floors: [4.0, 3.3, 3.3], plaster: 'beige', shutter: 'grigio', bays: [1.6, 4.9, 8.2], ground: [{ type: 'grata', u0: 1.0, u1: 2.1, v0: 1.05, v1: 2.45 }, { type: 'portone', u0: 4.1, u1: 5.7 }, { type: 'shop', u0: 7.0, u1: 9.8 }] },
  { x: [ALLEY[1], 33], floors: [4.0, 3.3, 3.2], plaster: 'peeling', shutter: 'marrone', bays: [1.8, 5.2, 8.6, 11.4], ground: [{ type: 'shop', u0: 1, u1: 4 }, { type: 'portone', u0: 7.8, u1: 9.4 }] },
  { x: [33, XE], floors: [3.9, 3.3, 3.3], plaster: 'yellow', shutter: 'verde', bays: [2, 5.5, 9, 11.5], ground: [{ type: 'portone', u0: 3.2, u1: 4.8 }, { type: 'shop', u0: 8, u1: 11 }] },
]

const PLASTERS = {
  yellow: ['yellow_plaster', '#f2e3c4'], yellow2: ['yellow_plaster', '#e9d6b4'], red: ['red_plaster_weathered', '#f0d8c8'],
  rosa: ['red_plaster_weathered', '#f7e6de'], white: ['painted_plaster_wall', '#f3eee4'], beige: ['beige_wall_002', '#f1e6d2'],
  peeling: ['peeling_painted_wall', '#f5e8da'],
}

export async function build() {
  const group = new THREE.Group()
  group.name = 'citta'

  // --- materials --------------------------------------------------------------------------------
  const M = {}
  const P = []
  for (const [k, [id, tint]] of Object.entries(PLASTERS)) {
    P.push(pbr(id, { name: 'muro_' + k, tint, vertexColors: true }).then((m) => { M['wall:' + k] = m }))
    P.push(pbr(id, { name: 'spalla_' + k, tint: new THREE.Color(tint).multiplyScalar(0.93) }).then((m) => { M['reveal:' + k] = m }))
    P.push(pbr(id, { name: 'cornice_' + k, tint: new THREE.Color(tint).lerp(new THREE.Color('#ffffff'), 0.35) }).then((m) => { M['cornice:' + k] = m }))
  }
  const [stone, pave, kerb, road, doorG, doorB, shutterShop, roof] = await Promise.all([
    pbr('marble_01', { name: 'pietra', tint: '#ece6da' }),
    pbr('granite_tile_03', { name: 'marciapiede', tint: '#e7e3dc' }),
    pbr('granite_tile_03', { name: 'cordolo', tint: '#cfcac2' }),
    pbr('patterned_cobblestone', { name: 'porfido', tint: '#c9b6a8' }),
    pbr('wood_peeling_paint_weathered', { name: 'portoneVerde', tint: '#7d9a7a' }),
    pbr('wood_peeling_paint_weathered', { name: 'portoneMarrone', tint: '#b08766' }),
    pbr('painted_metal_shutter', { name: 'serrandaNegozio', tint: '#dedbd3', side: THREE.DoubleSide }),
    pbr('clay_roof_tiles', { name: 'coppi' }),
    ...P,
  ])
  const signs = await signTextures()
  Object.assign(M, {
    stone, roof, shutterShop,
    'door:verde': doorG, 'door:marrone': doorB,
    'shutter:verde': new THREE.MeshStandardMaterial({ name: 'persianaVerde', color: '#3f5a3d', roughness: 0.58 }),
    'shutter:marrone': new THREE.MeshStandardMaterial({ name: 'persianaMarrone', color: '#5a3b26', roughness: 0.6 }),
    'shutter:grigio': new THREE.MeshStandardMaterial({ name: 'persianaGrigia', color: '#8b8d86', roughness: 0.55 }),
    'frame:bianco': new THREE.MeshStandardMaterial({ name: 'telaioBianco', color: '#e7e3da', roughness: 0.5 }),
    'frame:shop': new THREE.MeshStandardMaterial({ name: 'telaioNegozio', color: '#2b2b29', roughness: 0.45, metalness: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({ name: 'vetro', color: '#101316', roughness: 0.035, metalness: 0, ior: 1.5, specularIntensity: 1 }),
    interior: new THREE.MeshStandardMaterial({ name: 'interno', color: '#0d0c0b', roughness: 0.95 }),
    iron: new THREE.MeshStandardMaterial({ name: 'ferro', color: '#1e201f', roughness: 0.5, metalness: 0.4 }),
    metal: new THREE.MeshStandardMaterial({ name: 'lamiera', color: '#8d8a83', roughness: 0.46, metalness: 0.75 }),
    brass: new THREE.MeshStandardMaterial({ name: 'ottone', color: '#b38c4a', roughness: 0.3, metalness: 1 }),
    signFrame: new THREE.MeshStandardMaterial({ name: 'cornicInsegna', color: '#24241f', roughness: 0.4, metalness: 0.5 }),
  })
  for (const [k, t] of Object.entries(signs)) M['sign:' + k] = new THREE.MeshStandardMaterial({ name: 'insegna_' + k, map: t, roughness: 0.32 })
  // porphyry is warmer and lighter than the scan reads in the shade: lift it a little
  road.color.setRGB(1.3, 1.18, 1.1)
  // the bar glows a little from inside (a lot at night)
  M.barGlow = new THREE.MeshStandardMaterial({ name: 'internoBar', color: '#1a1410', emissive: new THREE.Color('#ffc987'), emissiveIntensity: 0.25, roughness: 0.9 })

  // --- palazzi ------------------------------------------------------------------------------------
  const kit = new Kit()
  const fronts = []
  let seed = 11
  // louvres get coarser with distance from the bike (nobody counts them at 30 m)
  const near = (b) => Math.min(Math.abs(b.x[0]), Math.abs(b.x[1])) < 8
  const slatFor = (b) => (near(b) ? 0.042 : 0.07)
  for (const b of SIDE_A) {
    const M4 = frame(v3(b.x[0], 0, ZA), v3(1, 0, 0), v3(0, 0, 1))
    const r = buildFront(kit, { ...b, width: b.x[1] - b.x[0], seed: seed++, uv0: b.x[0], slat: slatFor(b), cell: b.cell ?? (near(b) ? 0.25 : 0.4) }, M4)
    fronts.push({ side: 'A', ...b, H: r.height })
  }
  for (const b of SIDE_B) {
    const M4 = frame(v3(b.x[1], 0, ZB), v3(-1, 0, 0), v3(0, 0, -1))
    const r = buildFront(kit, { ...b, width: b.x[1] - b.x[0], seed: seed++, uv0: -b.x[1], slat: slatFor(b), cell: b.cell ?? (near(b) ? 0.25 : 0.4) }, M4)
    fronts.push({ side: 'B', ...b, H: r.height })
  }
  // side walls where a taller building meets a lower one, and at the alley
  const sideWall = (x, z0, z1, h0, h1, facing, plaster) => {
    // facing: +1 -> faces +x
    const o = facing > 0 ? v3(x, h0, z1) : v3(x, h0, z0)
    const u = facing > 0 ? v3(0, 0, -1) : v3(0, 0, 1)
    kit.add('reveal:' + plaster, quad(o, u, v3(0, 1, 0), Math.abs(z1 - z0), h1 - h0, { uv0: [z0, h0] }))
  }
  for (const side of ['A', 'B']) {
    const row = fronts.filter((f) => f.side === side).sort((a, b) => a.x[0] - b.x[0])
    for (let i = 0; i < row.length - 1; i++) {
      const a = row[i], b = row[i + 1]
      if (a.x[1] !== b.x[0]) continue
      const zf = side === 'A' ? ZA : ZB, zb = side === 'A' ? ZA - 9 : ZB + 9
      const [z0, z1] = side === 'A' ? [zb, zf] : [zf, zb]
      if (a.H > b.H) sideWall(a.x[1], z0, z1, b.H, a.H + 0.12, 1, a.plaster)
      else if (b.H > a.H) sideWall(b.x[0], z0, z1, a.H, b.H + 0.12, -1, b.plaster)
    }
  }
  // the alley: walls of the corner buildings running back, and a front closing it
  for (const [zf, zb] of [[ZA, ZA - 22], [ZB, ZB + 22]]) {
    const [z0, z1] = zf < zb ? [zf, zb] : [zb, zf]
    const hA = fronts.find((f) => f.x[1] === ALLEY[0] && (zf === ZA ? f.side === 'A' : f.side === 'B'))
    const hB = fronts.find((f) => f.x[0] === ALLEY[1] && (zf === ZA ? f.side === 'A' : f.side === 'B'))
    // (u runs left to right as seen from inside the alley)
    const M4a = frame(v3(ALLEY[0], 0, z1), v3(0, 0, -1), v3(1, 0, 0))
    buildFront(kit, { width: z1 - z0, floors: hA.floors, plaster: hA.plaster, shutter: hA.shutter, bays: [3, 7.5, 12, 16.5, 20], ground: [], seed: seed++, base: 0.6, strings: false, uv0: -z1, slat: 0.07 }, M4a)
    const M4b = frame(v3(ALLEY[1], 0, z0), v3(0, 0, 1), v3(-1, 0, 0))
    buildFront(kit, { width: z1 - z0, floors: hB.floors, plaster: hB.plaster, shutter: hB.shutter, bays: [2.5, 7, 11.5, 16, 20.5], ground: [], seed: seed++, base: 0.6, strings: false, uv0: z0, slat: 0.07 }, M4b)
    // closing front at the end of the alley
    const zEnd = zb
    const M4c = zf === ZA ? frame(v3(ALLEY[0] - 3, 0, zEnd), v3(1, 0, 0), v3(0, 0, 1)) : frame(v3(ALLEY[1] + 3, 0, zEnd), v3(-1, 0, 0), v3(0, 0, -1))
    buildFront(kit, { width: 12, floors: [4, 3.3, 3.3, 3.3], plaster: 'white', shutter: 'verde', bays: [2, 6, 10], ground: [{ type: 'portone', u0: 5.2, u1: 6.8 }], seed: seed++, uv0: 0, slat: 0.07 }, M4c)
  }
  // the ends of the street
  // (the one towards the low sun, at +x, is only two floors so a sunset can still come down the street)
  for (const [x, dir] of [[XE, -1], [-XE, 1]]) {
    const M4 = dir < 0 ? frame(v3(x, 0, ZA - 1), v3(0, 0, 1), v3(-1, 0, 0)) : frame(v3(x, 0, ZB + 1), v3(0, 0, -1), v3(1, 0, 0))
    const floors = dir < 0 ? [4.0, 3.2] : [4.2, 3.4, 3.4, 3.4]
    buildFront(kit, { width: ZB - ZA + 2, floors, plaster: dir < 0 ? 'red' : 'yellow2', shutter: 'verde', bays: [2.2, 5.8, 9.4], ground: [{ type: 'shop', u0: 3.8, u1: 6.8 }], seed: seed++, uv0: 0, slat: 0.07 }, M4)
  }
  for (const m of kit.meshes(M)) group.add(m)

  // --- the ground -------------------------------------------------------------------------------------
  const grounds = []
  // pavements (granite slabs), the alley paved the same
  const paveG = merge([
    quad(v3(-XE, 0, KA), v3(1, 0, 0), v3(0, 0, -1), 2 * XE, KA - ZA + 0.02, { uv0: [-XE, -KA] }),
    quad(v3(-XE, 0, ZB + 0.02), v3(1, 0, 0), v3(0, 0, -1), 2 * XE, ZB - KB + 0.02, { uv0: [-XE, -ZB] }),
    quad(v3(ALLEY[0] - 0.02, 0, ZA + 0.02), v3(1, 0, 0), v3(0, 0, -1), ALLEY[1] - ALLEY[0] + 0.04, 22.02, { uv0: [ALLEY[0], -ZA] }),
    quad(v3(ALLEY[0] - 0.02, 0, ZB + 22), v3(1, 0, 0), v3(0, 0, -1), ALLEY[1] - ALLEY[0] + 0.04, 22.02, { uv0: [ALLEY[0], -ZB - 22] }),
  ])
  const paveM = mesh(paveG, pave, 'marciapiedi')
  group.add(paveM)
  grounds.push(paveM)
  // kerbs: granite blocks with a rounded arris, long joints every metre
  const kerbProfile = (a) => {
    // (z offset from the pavement edge towards the road, y)
    const pts = [[0, 0], [0.22, 0], [0.245, -0.005], [0.26, -0.02], [0.28, -0.045], [0.28, -0.3], [0, -0.3]]
    return a > 0 ? pts : pts.map(([z, y]) => [-z, y])
  }
  const kerbs = []
  for (const [z0, sgn] of [[KA, 1], [KB, -1]]) {
    const prof = kerbProfile(sgn)
    for (let x = -XE; x < XE; x += 1.0) {
      const len = Math.min(1.0, XE - x) - 0.006
      kerbs.push(extrudeProfile(prof.map(([z, y]) => [z, y]), v3(x + 0.003, 0, z0), v3(0, 0, 1), v3(0, 1, 0), v3(1, 0, 0), len))
    }
  }
  group.add(mesh(merge(kerbs), kerb, 'cordoli'))

  // roadway: porphyry fans. Real relief near the bike (displacement map on a
  // fine grid), flat and crowned further away.
  const disp = await displacement('patterned_cobblestone')
  const dAmp = 0.024
  const patch = { x0: -5.6, x1: 5.6 }
  const step = 0.038
  const roadGeo = []
  {
    const nx = Math.round((patch.x1 - patch.x0) / step), nz = Math.round((RB - RA) / step)
    const P = [], UV = [], I = []
    for (let j = 0; j <= nz; j++) {
      const z = RA + (j / nz) * (RB - RA)
      for (let i = 0; i <= nx; i++) {
        const x = patch.x0 + (i / nx) * (patch.x1 - patch.x0)
        const fadeX = Math.min(1, (Math.min(x - patch.x0, patch.x1 - x)) / 1.4)
        const fadeZ = Math.min(1, Math.min(z - RA, RB - z) / 0.08)
        const h = (sampleDisp(disp, x, -z) - 0.62) * dAmp * fadeX * fadeZ
        P.push(x, crown(z) + h, z)
        UV.push(x, -z)
      }
    }
    const row = nx + 1
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1
      I.push(a, c, d, a, d, b)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2))
    g.setIndex(I)
    g.computeVertexNormals()
    roadGeo.push(g)
  }
  // coarse crowned strips beyond the fine patch
  for (const [x0, x1] of [[-XE, patch.x0], [patch.x1, XE]]) {
    const nz = 16, nx = Math.max(1, Math.round((x1 - x0) / 2))
    const P = [], UV = [], N = [], I = []
    for (let j = 0; j <= nz; j++) {
      const z = RA + (j / nz) * (RB - RA)
      for (let i = 0; i <= nx; i++) { const x = x0 + (i / nx) * (x1 - x0); P.push(x, crown(z), z); UV.push(x, -z); N.push(0, 1, 0) }
    }
    const row = nx + 1
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * row + i, b = a + 1, c = a + row, d = c + 1; I.push(a, c, d, a, d, b) }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
    g.setIndex(I)
    g.computeVertexNormals()
    roadGeo.push(g)
  }
  const roadM = mesh(merge(roadGeo), road, 'carreggiata')
  group.add(roadM)
  grounds.push(roadM)
  // under-ground slab so nothing ever sees through the seams
  group.add(mesh(box([-XE - 2, -0.6, ZA - 24], [XE + 2, ROAD - 0.02, ZB + 24], { skip: ['ny'] }), M.interior, 'sottosuolo', { cast: false }))

  // --- details on the wall behind the bike --------------------------------------------------------------
  const plaque = await plaqueTexture('VIA DEI TINTORI')
  const plaqueM = new THREE.MeshStandardMaterial({ name: 'targa', map: plaque, roughness: 0.35 })
  const pq = quad(v3(-1.35, 3.05, ZA + 0.018), v3(1, 0, 0), v3(0, 1, 0), 0.9, 0.3)
  const uv = pq.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i)) / 0.9, uv.getY(i) / 0.3)
  group.add(mesh(merge([pq]), plaqueM, 'targaVia'))
  group.add(mesh(box([-1.37, 3.03, ZA], [-0.43, 3.37, ZA + 0.016]), M.stone, 'cornicTarga'))

  // by the portone: the house number, the brass bell panel; along the front:
  // the electricity cables every Italian facade wears; in the gutter: a grate
  const numC = document.createElement('canvas')
  numC.width = 256; numC.height = 180
  {
    const g = numC.getContext('2d')
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 256, 180)
    g.strokeStyle = '#1f3d73'; g.lineWidth = 10; g.strokeRect(10, 10, 236, 160)
    g.fillStyle = '#1f3d73'; g.font = '400 118px "DM Serif Display"'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText('17', 128, 98)
  }
  const numT = new THREE.CanvasTexture(numC)
  numT.colorSpace = THREE.SRGBColorSpace
  const numG = quad(v3(-2.36, 2.3, ZA + 0.012), v3(1, 0, 0), v3(0, 1, 0), 0.2, 0.14)
  { const a = numG.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) / 0.2, a.getY(i) / 0.14) }
  group.add(mesh(numG, new THREE.MeshPhysicalMaterial({ name: 'numeroCivico', map: numT, roughness: 0.18, clearcoat: 0.6 }), 'numeroCivico'))
  group.add(mesh(merge([
    box([-2.34, 1.18, ZA], [-2.2, 1.46, ZA + 0.012]),
    ...[0, 1, 2, 3].map((i) => cylinder(v3(-2.27, 1.23 + i * 0.058, ZA + 0.012), v3(-2.27, 1.23 + i * 0.058, ZA + 0.02), 0.009, { radial: 10 })),
  ]), M.brass, 'citofono'))
  const cable = []
  const cy1 = 3.72, cy2 = 3.78
  cable.push(cylinder(v3(-4.6, cy1, ZA + 0.02), v3(5.8, cy1, ZA + 0.02), 0.0055, { radial: 6 }))
  cable.push(cylinder(v3(-4.6, cy2, ZA + 0.02), v3(5.8, cy2, ZA + 0.02), 0.0045, { radial: 6 }))
  cable.push(cylinder(v3(2.05, cy1, ZA + 0.02), v3(2.05, 3.3, ZA + 0.02), 0.0045, { radial: 6 })) // to the lantern
  cable.push(cylinder(v3(5.2, cy1, ZA + 0.02), v3(5.2, 2.9, ZA + 0.02), 0.0055, { radial: 6 })) // down to the shop
  for (let x = -4.4; x < 5.8; x += 0.6) cable.push(box([x - 0.006, cy1 - 0.012, ZA], [x + 0.006, cy2 + 0.012, ZA + 0.028]))
  group.add(mesh(merge(cable), M.iron, 'cavi'))
  group.add(mesh(box([5.08, 2.62, ZA], [5.34, 2.9, ZA + 0.09]), M.signFrame, 'scatolaDerivazione'))
  {
    const gx = 1.15, gz0 = RA + 0.02, gz1 = RA + 0.42, gy = crown(RA) - 0.004
    const grate = [box([gx - 0.34, gy - 0.02, gz0], [gx + 0.34, gy + 0.006, gz0 + 0.035]), box([gx - 0.34, gy - 0.02, gz1 - 0.035], [gx + 0.34, gy + 0.006, gz1]),
      box([gx - 0.34, gy - 0.02, gz0], [gx - 0.3, gy + 0.006, gz1]), box([gx + 0.3, gy - 0.02, gz0], [gx + 0.34, gy + 0.006, gz1])]
    for (let i = 0; i < 9; i++) { const x = gx - 0.26 + i * 0.065; grate.push(box([x - 0.012, gy - 0.02, gz0 + 0.03], [x + 0.012, gy + 0.004, gz1 - 0.03])) }
    group.add(mesh(merge(grate), M.iron, 'caditoia'))
    group.add(mesh(box([gx - 0.3, gy - 0.25, gz0 + 0.03], [gx + 0.3, gy - 0.2, gz1 - 0.03]), M.interior, 'pozzetto'))
  }

  // bill posters in their frame on the terracotta palazzo
  const posters = await posterTextures()
  const pf = { x0: -12.9, x1: -10.6, y0: 1.05, y1: 2.65 }
  group.add(mesh(merge([
    box([pf.x0 - 0.05, pf.y0 - 0.05, ZA], [pf.x1 + 0.05, pf.y0, ZA + 0.04]), box([pf.x0 - 0.05, pf.y1, ZA], [pf.x1 + 0.05, pf.y1 + 0.05, ZA + 0.04]),
    box([pf.x0 - 0.05, pf.y0, ZA], [pf.x0, pf.y1, ZA + 0.04]), box([pf.x1, pf.y0, ZA], [pf.x1 + 0.05, pf.y1, ZA + 0.04]),
  ]), M.iron, 'bacheca'))
  const pw = (pf.x1 - pf.x0) / 3
  posters.forEach((t, i) => {
    const g = quad(v3(pf.x0 + i * pw + 0.01, pf.y0 + 0.02, ZA + 0.012 + i * 0.001), v3(1, 0, 0), v3(0, 1, 0), pw - 0.02, pf.y1 - pf.y0 - 0.04)
    const a = g.attributes.uv
    for (let k = 0; k < a.count; k++) a.setXY(k, (a.getX(k)) / (pw - 0.02), a.getY(k) / (pf.y1 - pf.y0 - 0.04))
    group.add(mesh(g, new THREE.MeshStandardMaterial({ name: 'manifesto' + i, map: t, roughness: 0.85 }), 'manifesto' + i))
  })

  // stone bollards at the alley corners
  const bol = []
  for (const [x, z] of [[ALLEY[0] + 0.35, KA - 0.25], [ALLEY[1] - 0.35, KA - 0.25], [ALLEY[0] + 0.35, KB + 0.25], [ALLEY[1] - 0.35, KB + 0.25]]) {
    bol.push(cylinder(v3(x, 0, z), v3(x, 0.62, z), 0.13, { radial: 20 }))
    bol.push(new THREE.SphereGeometry(0.13, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, 0.62, z))
  }
  group.add(mesh(merge(bol), M.stone, 'paracarri'))

  // --- props --------------------------------------------------------------------------------------------
  const L = []
  const add = (id, o) => L.push(prop(id, o).then((m) => { group.add(m); return m }).catch((e) => { console.warn('prop not loaded:', id, e?.message || e); return null }))
  // lanterns on their brackets
  // one right above the bike: at night it stands in its pool of light
  const lanterns = [[2.05, 'A'], [-8.6, 'A'], [11.2, 'A'], [-3.4, 'B']]
  const lampPts = []
  for (const [x, s] of lanterns) {
    const z = s === 'A' ? ZA : ZB
    add('street_lamp_02', { at: [x, 3.25, z], rotY: s === 'A' ? 0 : 180, anchor: s === 'A' ? 'back' : 'front' })
    // bulb: 1.07 m above the bracket's foot, 0.61 m out from the wall
    lampPts.push(v3(x, 3.25 + 1.07, s === 'A' ? z + 0.61 : z - 0.61))
  }
  // the bar's tables out on the pavement opposite
  add('outdoor_table_chair_set_01', { at: [-1.9, 0, KB + 0.75], rotY: 90 })
  add('outdoor_table_chair_set_01', { at: [0.4, 0, KB + 0.72], rotY: 84 })
  add('potted_plant_02', { at: [-4.45, 0, ZA + 0.36], rotY: 30 })
  add('planter_pot_clay', { at: [3.75, 0, ZB - 0.3], rotY: 200 })
  add('planter_pot_clay', { at: [-2.25, 0, ZA + 0.22] })
  await Promise.all(L)
  // the scanned soil in the pot is 54k triangles for a surface nobody sees
  // but its top: a disc does the same job
  group.traverse((o) => {
    if (o.isMesh && /_dirt$/.test(o.name) && (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) > 9000) {
      o.geometry.computeBoundingBox()
      const b = o.geometry.boundingBox, c = b.getCenter(new THREE.Vector3())
      const r = Math.min(b.max.x - b.min.x, b.max.z - b.min.z) * 0.5
      const disc = new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2).translate(c.x, b.max.y - (b.max.y - b.min.y) * 0.25, c.z)
      o.geometry = disc
    }
  })

  // night lights (off by day): a small round area light just under each
  // lantern throws the soft pool on the pavement; a weaker point light in the
  // bulb gives the glow on the wall around it
  const lamps = lampPts.map((p) => {
    const l = new THREE.PointLight(0xffc27a, 0, 0, 2)
    l.position.copy(p)
    l.name = 'lanterna'
    group.add(l)
    return l
  })
  const pools = lampPts.map((p) => {
    const a = new THREE.RectAreaLight(0xffc98a, 0, 0.15, 0.15)
    a.isCircular = true
    a.position.set(p.x, p.y - 0.15, p.z) // just under the glass, clear of the bracket's finial
    a.rotation.x = -Math.PI / 2
    a.name = 'lanternaPozza'
    group.add(a)
    return a
  })
  const lanternMats = new Set()
  group.traverse((o) => { if (o.isMesh && o.material?.name === 'street_lamp_02_bulb') lanternMats.add(o.material) })

  // camera colliders: the two rows of fronts and the ends
  const colMat = new THREE.MeshBasicMaterial()
  const colliders = [
    new THREE.Mesh(box([-XE, 0, ZA - 3], [XE, 30, ZA + 0.15]), colMat),
    new THREE.Mesh(box([-XE, 0, ZB - 0.15], [XE, 30, ZB + 3]), colMat),
  ]
  for (const c of colliders) { c.visible = false; c.name = 'colliderCitta' }

  const variants = {
    pomeriggio: { sky: { url: SKY + 'qwantani_late_afternoon_puresky_2k.hdr', sunAz: 14, E: 5.2, ground: 0.2 }, lamps: 0, glow: 0.25, exposure: 1.0 },
    nuvole: { sky: { url: SKY + 'kloofendal_48d_partly_cloudy_puresky_2k.hdr', sunAz: 24, E: 5, ground: 0.2 }, lamps: 0, glow: 0.2, exposure: 1.0 },
    tramonto: { sky: { url: SKY + 'evening_road_01_puresky_2k.hdr', sunAz: 10, E: 3.8, ground: 0.2, addSun: { el: 13, E: 2.2, color: [1, 0.56, 0.3] } }, lamps: 0, bulbs: 1, glow: 1.5, exposure: 1.45 },
    sera: { sky: { url: SKY + 'qwantani_dusk_2_puresky_2k.hdr', sunAz: 10, E: 1.0, ground: 0.2 }, lamps: 16, glow: 6, exposure: 2.0, clamp: 1.2 },
  }
  return {
    group,
    grounds,
    colliders,
    probe: v3(0.07, 0.62, 0),
    maxDistance: 9,
    variants,
    defaultVariant: 'pomeriggio',
    envScale: 0.8,
    applyVariant(id, cfg) {
      for (const l of lamps) { l.intensity = cfg.lamps * 0.3; l.userData.ptIntensity = cfg.lamps * 0.9 }
      for (const a of pools) { a.intensity = cfg.lamps * 45; a.userData.ptIntensity = cfg.lamps * 150 }
      // the point light sits inside the bulb: for the path tracer the bulb is
      // a glowing, transmissive shell so the light's shadow rays get out
      const bulbs = cfg.bulbs ?? (cfg.lamps ? 1 : 0)
      for (const m of lanternMats) { m.emissive?.set('#ffcf8a'); m.emissiveIntensity = bulbs ? 30 : 0; m.userData.pt = { emissiveIntensity: bulbs ? 14 : 0, transmission: 1, ior: 1.0, roughness: 0.5, thickness: 0 } }
      M.barGlow.emissiveIntensity = cfg.glow
    },
  }
}
