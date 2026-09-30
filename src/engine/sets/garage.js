// Il garage: a 1960s Italian box garage. Plastered walls over a washable
// green band, formwork concrete ceiling, a trowelled floor with its stains, a
// roller shutter mounted inside the opening, two fluorescent battens (real
// area lights in both renderers) and a workbench under a pegboard of tools.
// "Serranda su": the shutter is half up and the late sun slides in under it,
// laying a bright slab across the floor to the front wheel.
// "Neon": shutter down, evening, only the tubes and the bench lamp.
//
// The bike stands at the origin, facing +x, drive side +z. Floor at y = 0.
import * as THREE from 'three'
import { pbr, prop } from './assets.js'
import { quad, box, merge, mesh, cylinder, v3, rng } from './build.js'

const X0 = -3.3, X1 = 3.3, Z0 = -2.05, Z1 = 4.3, HC = 2.85, T = 0.3
const DOOR = { z0: 0.3, z1: 2.95, top: 2.25 }
const BAND = 1.12 // top of the painted band
const E = 0.012 // overlap so corners are watertight for the path tracer

const SKY = '/sets/sky/'

// --- procedural pegboard (masonite with 1" holes) --------------------------------------
function pegboardTextures() {
  const S = 256, P = 0.0254 * 8 // 8 holes per tile
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  g.fillStyle = '#7a5a3c'
  g.fillRect(0, 0, S, S)
  const r = rng(7)
  for (let i = 0; i < 2600; i++) { // fibre speckle
    g.fillStyle = `rgba(${r() < 0.5 ? '40,26,14' : '150,118,84'},${0.05 + r() * 0.08})`
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1)
  }
  const n = document.createElement('canvas')
  n.width = n.height = S
  const gn = n.getContext('2d')
  gn.fillStyle = 'rgb(128,128,255)'
  gn.fillRect(0, 0, S, S)
  const step = S / 8, hr = step * 0.13
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const cx = (x + 0.5) * step, cy = (y + 0.5) * step
    g.fillStyle = '#120c07'
    g.beginPath(); g.arc(cx, cy, hr, 0, Math.PI * 2); g.fill()
    // bevelled rim in the normal map
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2
      const nx = Math.cos(t), ny = Math.sin(t)
      gn.fillStyle = `rgb(${128 - nx * 90},${128 + ny * 90},200)`
      gn.beginPath(); gn.arc(cx + nx * hr * 1.25, cy + ny * hr * 1.25, hr * 0.42, 0, Math.PI * 2); gn.fill()
    }
  }
  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1 / P, 1 / P)
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.anisotropy = 8
    return t
  }
  return { map: tex(c, true), normalMap: tex(n, false) }
}

// --- a fluorescent batten: enamel channel, T8 tube, the area light under it ---------------
function batten(cx, cz, mats, len = 1.2) {
  const g = new THREE.Group()
  const y = HC - 0.004
  const body = box([cx - len / 2 - 0.035, y - 0.052, cz - 0.037], [cx + len / 2 + 0.035, y, cz + 0.037])
  const caps = merge([
    box([cx - len / 2 - 0.03, y - 0.08, cz - 0.016], [cx - len / 2 - 0.012, y - 0.05, cz + 0.016]),
    box([cx + len / 2 + 0.012, y - 0.08, cz - 0.016], [cx + len / 2 + 0.03, y - 0.05, cz + 0.016]),
  ])
  g.add(mesh(body, mats.enamel, 'plafoniera'), mesh(caps, mats.enamel, 'plafonieraTappi'))
  const tube = mesh(cylinder(v3(cx - len / 2 - 0.012, y - 0.066, cz), v3(cx + len / 2 + 0.012, y - 0.066, cz), 0.013, { radial: 20 }), mats.tube, 'neon', { cast: false })
  g.add(tube)
  const light = new THREE.RectAreaLight(0xf1f4ff, 0, len, 0.026)
  light.position.set(cx, y - 0.066 - 0.0135, cz)
  light.rotation.x = -Math.PI / 2 // emits straight down, width along x
  light.name = 'luceNeon'
  g.add(light)
  return { group: g, tube, light, center: v3(cx, y - 0.07, cz), axis: v3(1, 0, 0), len }
}

export async function build({ stage }) {
  void stage
  const group = new THREE.Group()
  group.name = 'garage'

  // --- materials -----------------------------------------------------------------------------
  const [floor, apron, band, plaster, ceiling, concrete, shutter, benchTop, cobbles, yard] = await Promise.all([
    pbr('garage_floor', { name: 'pavimentoGarage', rough: 1 }),
    pbr('garage_floor', { name: 'soglia', tint: '#d6d2ca' }),
    pbr('painted_concrete', { name: 'zoccolo', tint: '#c3cbbf', rough: 0.7, grade: { sat: 0.42, gamma: 1.12 } }),
    pbr('painted_plaster_wall', { name: 'intonaco', tint: '#faf5ec' }),
    pbr('concrete_wall_008', { name: 'soffitto', tint: '#d9d6cf' }),
    pbr('concrete_wall_008', { name: 'cemento', tint: '#c9c5bd' }),
    pbr('painted_metal_shutter', { name: 'serranda', tint: '#c9ccc4', rough: 0.9, side: THREE.DoubleSide }),
    pbr('wood_table_worn', { name: 'pianoBanco', rough: 0.9 }),
    pbr('patterned_cobblestone', { name: 'cortile' }),
    pbr('yellow_plaster', { name: 'muroCortile', tint: '#f2e6cf' }),
  ])
  const peg = pegboardTextures()
  const mats = {
    enamel: new THREE.MeshStandardMaterial({ name: 'smalto', color: '#ebe8e1', roughness: 0.32 }),
    tube: new THREE.MeshStandardMaterial({ name: 'tuboNeon', color: '#ffffff', emissive: new THREE.Color('#f1f4ff'), emissiveIntensity: 0, roughness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ name: 'ferroVerniciato', color: '#56605a', roughness: 0.55, metalness: 0.1 }),
    rail: new THREE.MeshStandardMaterial({ name: 'guide', color: '#8e9189', roughness: 0.42, metalness: 0.75 }),
    stripe: new THREE.MeshStandardMaterial({ name: 'filetto', color: '#28372d', roughness: 0.4 }),
    pegboard: new THREE.MeshStandardMaterial({ name: 'pannelloForato', map: peg.map, normalMap: peg.normalMap, roughness: 0.78 }),
    wire: new THREE.MeshStandardMaterial({ name: 'ganci', color: '#b9bab5', roughness: 0.3, metalness: 1 }),
    pvc: new THREE.MeshStandardMaterial({ name: 'canalina', color: '#9a9c98', roughness: 0.5 }),
    shell: new THREE.MeshStandardMaterial({ name: 'guscio', color: '#77736c', roughness: 0.95, side: THREE.DoubleSide }),
    rubber: new THREE.MeshStandardMaterial({ name: 'gommaSerranda', color: '#1c1b1a', roughness: 0.8 }),
  }

  // --- the room ------------------------------------------------------------------------------
  const W = X1 - X0, D = Z1 - Z0
  const floorGeo = merge([
    quad(v3(X0 - E, 0, Z1 + E), v3(1, 0, 0), v3(0, 0, -1), W + 2 * E, D + 2 * E, { uv0: [X0, -Z1] }),
    // threshold inside the opening
    quad(v3(X1 - E, 0, DOOR.z1), v3(1, 0, 0), v3(0, 0, -1), T + 2 * E, DOOR.z1 - DOOR.z0, { uv0: [X1, -DOOR.z1] }),
  ])
  const floorMesh = mesh(floorGeo, floor, 'pavimento')
  group.add(floorMesh)

  // wall strips: [origin, u, width] for each wall, band + stripe + plaster
  const walls = [
    { o: v3(X0 - E, 0, Z0), u: v3(1, 0, 0), w: W + 2 * E, name: 'fondo' },
    { o: v3(X1 + E, 0, Z1), u: v3(-1, 0, 0), w: W + 2 * E, name: 'fronte' },
    { o: v3(X0, 0, Z1 + E), u: v3(0, 0, -1), w: D + 2 * E, name: 'sinistra' },
    // right wall, around the door
    { o: v3(X1, 0, Z0 - E), u: v3(0, 0, 1), w: DOOR.z0 - Z0 + E, name: 'destraA' },
    { o: v3(X1, 0, DOOR.z1), u: v3(0, 0, 1), w: Z1 - DOOR.z1 + E, name: 'destraB' },
  ]
  const bandG = [], stripeG = [], plasterG = []
  const up = v3(0, 1, 0)
  for (const wl of walls) {
    const uvx = wl.u.x !== 0 ? wl.o.x * wl.u.x : wl.o.z * wl.u.z
    bandG.push(quad(wl.o.clone(), wl.u, up, wl.w, BAND, { uv0: [uvx, 0] }))
    stripeG.push(quad(wl.o.clone().setY(BAND), wl.u, up, wl.w, 0.022, { uv0: [uvx, BAND] }))
    plasterG.push(quad(wl.o.clone().setY(BAND + 0.022), wl.u, up, wl.w, HC - BAND - 0.022 + E, { uv0: [uvx, BAND] }))
  }
  // above the door (plaster only) + reveal of the opening
  plasterG.push(quad(v3(X1, DOOR.top, DOOR.z0), v3(0, 0, 1), up, DOOR.z1 - DOOR.z0, HC - DOOR.top + E, { uv0: [DOOR.z0, DOOR.top] }))
  const reveal = merge([
    quad(v3(X1 - E, 0, DOOR.z0), v3(1, 0, 0), up, T + 2 * E, DOOR.top, { uv0: [0, 0] }), // jamb facing +z
    quad(v3(X1 + T + E, 0, DOOR.z1), v3(-1, 0, 0), up, T + 2 * E, DOOR.top, { uv0: [0, 0] }), // jamb facing -z
    quad(v3(X1 - E, DOOR.top, DOOR.z0), v3(1, 0, 0), v3(0, 0, 1), T + 2 * E, DOOR.z1 - DOOR.z0, { uv0: [0, DOOR.z0] }), // lintel underside
  ])
  group.add(mesh(merge(bandG), band, 'zoccolo'), mesh(merge(stripeG), mats.stripe, 'filetto'), mesh(merge(plasterG), plaster, 'pareti'))
  group.add(mesh(reveal, concrete, 'mazzette'))
  group.add(mesh(quad(v3(X0 - E, HC, Z0 - E), v3(1, 0, 0), v3(0, 0, 1), W + 2 * E, D + 2 * E, { uv0: [X0, Z0] }), ceiling, 'soffitto'))

  // outer shell: closes every seam for the path tracer (and is what you see from the yard)
  const sx0 = X0 - T, sx1 = X1 + T, sz0 = Z0 - T, sz1 = Z1 + T, sy1 = HC + 0.25
  // (faces that would lie on the interior surfaces are left out)
  const shell = merge([
    box([sx0, -0.3, sz0], [X0, sy1, sz1], { skip: ['px'] }),
    box([X0, -0.3, sz0], [X1, sy1, Z0], { skip: ['pz'] }),
    box([X0, -0.3, Z1], [X1, sy1, sz1], { skip: ['nz'] }),
    box([X0, HC, Z0], [X1, sy1, Z1], { skip: ['ny'] }),
    box([X0, -0.3, Z0], [X1, 0, Z1], { skip: ['py'] }),
    box([X1, -0.3, DOOR.z0], [sx1, 0, DOOR.z1], { skip: ['py'] }),
    box([X1, -0.3, sz0], [sx1, sy1, DOOR.z0], { skip: ['nx', 'pz'] }),
    box([X1, -0.3, DOOR.z1], [sx1, sy1, sz1], { skip: ['nx', 'nz'] }),
    box([X1, DOOR.top, DOOR.z0], [sx1, sy1, DOOR.z1], { skip: ['ny', 'nx'] }),
  ])
  group.add(mesh(shell, mats.shell, 'guscio'))

  // --- the yard outside the opening ---------------------------------------------------------------
  // low enough that its shadow stops well short of the door with the sun at ~23 degrees
  const yardX = 12
  group.add(mesh(quad(v3(sx1 - E, 0, 7), v3(1, 0, 0), v3(0, 0, -1), 1.8, 12, { uv0: [sx1, -7] }), apron, 'marciapiedeCortile'))
  const yardGround = mesh(quad(v3(sx1 + 1.8 - E, -0.012, 9), v3(1, 0, 0), v3(0, 0, -1), yardX - sx1 - 1.8 + E, 16, { uv0: [0, -9] }), cobbles, 'cortile')
  group.add(yardGround)
  group.add(mesh(box([yardX, -0.1, -7], [yardX + 0.4, 2.05, 9]), yard, 'muroCortile'))
  // a gate in the yard wall, to read as a place
  group.add(mesh(box([yardX - 0.03, 0, 0.6], [yardX, 1.95, 2.1]), mats.steel, 'cancello'))

  // --- roller shutter (inside face of the opening) ------------------------------------------------
  const sh = new THREE.Group()
  sh.name = 'serranda'
  group.add(sh)
  const railG = merge([
    box([X1 - 0.075, 0, DOOR.z0 - 0.07], [X1 - 0.005, DOOR.top + 0.05, DOOR.z0 - 0.02]),
    box([X1 - 0.075, 0, DOOR.z1 + 0.02], [X1 - 0.005, DOOR.top + 0.05, DOOR.z1 + 0.07]),
  ])
  group.add(mesh(railG, mats.rail, 'guideSerranda'))
  const rollBox = box([X1 - 0.44, DOOR.top, DOOR.z0 - 0.1], [X1 - 0.005, DOOR.top + 0.4, DOOR.z1 + 0.1])
  group.add(mesh(rollBox, mats.steel, 'cassonetto'))
  const setShutter = (yS) => {
    for (const c of [...sh.children]) { c.geometry.dispose(); sh.remove(c) }
    const x = X1 - 0.042, h = DOOR.top + 0.04 - yS
    if (h > 0.01) {
      const curtain = quad(v3(x, yS, DOOR.z1 + 0.045), v3(0, 0, -1), up, DOOR.z1 - DOOR.z0 + 0.09, h, { uv0: [0, yS] })
      sh.add(mesh(curtain, shutter, 'telo'))
    }
    // bottom bar with its rubber lip and handle
    sh.add(mesh(box([x - 0.022, yS + 0.004, DOOR.z0 - 0.04], [x + 0.012, yS + 0.058, DOOR.z1 + 0.04]), mats.rail, 'barra'))
    sh.add(mesh(box([x - 0.014, yS - 0.002 + 1e-4, DOOR.z0 - 0.02], [x + 0.006, yS + 0.006, DOOR.z1 + 0.02]), mats.rubber, 'guarnizione'))
    const hz = (DOOR.z0 + DOOR.z1) / 2
    sh.add(mesh(merge([
      box([x - 0.075, yS + 0.02, hz - 0.08], [x - 0.062, yS + 0.034, hz + 0.08]),
      box([x - 0.068, yS + 0.02, hz - 0.08], [x - 0.02, yS + 0.034, hz - 0.066]),
      box([x - 0.068, yS + 0.02, hz + 0.066], [x - 0.02, yS + 0.034, hz + 0.08]),
    ]), mats.rail, 'maniglia'))
    sh.traverse((o) => { if (o.isMesh) { o.userData.set = true; o.castShadow = o.receiveShadow = true } })
  }

  // --- lights ---------------------------------------------------------------------------------------
  // one batten over the bench, one over the bike
  const tubes = [batten(-1.85, -1.2, mats), batten(0.45, 0.75, mats)]
  for (const t of tubes) group.add(t.group)
  // conduit from the battens to the switch by the house door
  const cy = HC - 0.012
  const conduit = merge([
    cylinder(v3(-1.85, cy, -1.13), v3(-1.85, cy, 0.75), 0.011, { radial: 10 }),
    cylinder(v3(-1.85, cy, 0.75), v3(-0.2, cy, 0.75), 0.011, { radial: 10 }),
    cylinder(v3(0.45, cy, 0.82), v3(0.45, cy, Z1 - 0.012), 0.011, { radial: 10 }),
    cylinder(v3(0.45, cy, Z1 - 0.012), v3(-2.4, cy, Z1 - 0.012), 0.011, { radial: 10 }),
    cylinder(v3(-2.4, cy, Z1 - 0.012), v3(-2.4, 1.25, Z1 - 0.012), 0.011, { radial: 10 }),
  ])
  group.add(mesh(conduit, mats.pvc, 'canaline'))
  group.add(mesh(box([-2.46, 1.14, Z1 - 0.035], [-2.34, 1.26, Z1]), mats.enamel, 'interruttore'))

  // --- workbench under a pegboard --------------------------------------------------------------------
  const bx0 = -2.95, bx1 = -0.75, bz0 = Z0 + 0.005, bz1 = Z0 + 0.66, bTop = 0.89
  group.add(mesh(box([bx0, bTop - 0.05, bz0], [bx1, bTop, bz1]), benchTop, 'banco'))
  const frame = []
  for (const x of [bx0 + 0.05, bx1 - 0.05]) for (const z of [bz0 + 0.05, bz1 - 0.05]) frame.push(box([x - 0.02, 0, z - 0.02], [x + 0.02, bTop - 0.05, z + 0.02]))
  frame.push(box([bx0 + 0.03, bTop - 0.12, bz1 - 0.07], [bx1 - 0.03, bTop - 0.05, bz1 - 0.03]))
  frame.push(box([bx0 + 0.03, 0.16, bz0 + 0.03], [bx1 - 0.03, 0.2, bz1 - 0.03]))
  group.add(mesh(merge(frame), mats.steel, 'telaioBanco'))
  const pb = { x0: -2.9, x1: -0.8, y0: 1.02, y1: 2.02, z: Z0 + 0.024 }
  group.add(mesh(box([pb.x0, pb.y0, Z0 + 0.018], [pb.x1, pb.y1, pb.z]), mats.pegboard, 'pannelloForato'))
  const pegs = []
  const hook = (x, y, len = 0.06) => {
    pegs.push(cylinder(v3(x, y, pb.z), v3(x, y + 0.01, pb.z + len), 0.0022, { radial: 6 }))
    pegs.push(cylinder(v3(x, y + 0.01, pb.z + len), v3(x, y + 0.028, pb.z + len + 0.004), 0.0022, { radial: 6 }))
  }

  // --- the lamp over the bench --------------------------------------------------------------------------
  // just under the shade's glass, so the light is never sampled through it
  const lampLight = new THREE.RectAreaLight(0xffd9a8, 0, 0.2, 0.2)
  lampLight.position.set(-1.85, HC - 1.36, Z0 + 0.5)
  lampLight.rotation.x = -Math.PI / 2
  lampLight.name = 'lampadaBanco'
  group.add(lampLight)

  // --- props ----------------------------------------------------------------------------------------------
  const P = []
  const add = (id, o) => P.push(prop(id, o).then((m) => { group.add(m); return m }).catch((e) => { console.warn('prop not loaded:', id, e?.message || e); return null }))
  // bench
  add('bench_vice_01', { at: [-0.98, bTop, Z0 + 0.49] })
  add('metal_toolbox', { at: [-2.5, bTop, Z0 + 0.3], rotY: -6 })
  add('small_oil_can_01', { at: [-1.62, bTop, Z0 + 0.42], rotY: 30 })
  add('lubricant_spray', { at: [-1.4, bTop, Z0 + 0.2] })
  add('spray_paint_bottles', { at: [-2.05, bTop, Z0 + 0.16], rotY: -12 })
  add('wooden_crate_01', { at: [-2.4, 0.2, Z0 + 0.3] })
  add('cardboard_box_01', { at: [-1.4, 0.2, Z0 + 0.33], rotY: 90 })
  add('oil_tin', { at: [-0.98, 0.2, Z0 + 0.3], rotY: 14 })
  add('hanging_industrial_lamp', { at: [-1.85, HC - 1.355, Z0 + 0.5] })
  // tools on the pegboard (flat side against the board)
  const onBoard = (id, x, y, o = {}) => { add(id, { at: [x, y, pb.z + 0.004], anchor: 'back', ...o }); hook(x, y + (o.hookUp ?? 0.1)) }
  onBoard('adjustable_wrench', -2.62, 1.3, { hookUp: 0.2 })
  onBoard('combination_wrench', -2.42, 1.26, { rot: [-90, 0, 0], hookUp: 0.3 })
  onBoard('pliers', -2.22, 1.36, { hookUp: 0.15 })
  onBoard('screwdriver', -2.06, 1.4, { hookUp: 0.18 })
  onBoard('cross_pein_hammer', -1.86, 1.3, { hookUp: 0.26 })
  onBoard('handsaw_wood', -1.3, 1.52, { rot: [0, 90, 0], hookUp: 0.14 })
  group.add(mesh(merge(pegs), mats.wire, 'ganci'))
  // behind the bike
  add('old_tyre', { at: [0.05, 0, Z0 + 0.012], rot: [-11, 4, 0], anchor: 'back' })
  add('tire_pump', { at: [0.62, 0, Z0 + 0.08], rotY: 20 })
  add('garden_hose_wall_mounted_01', { at: [0.35, 1.34, Z0], anchor: 'back' })
  add('metal_tool_chest', { at: [1.75, 0, Z0 + 0.21] })
  add('metal_jerrycan', { at: [2.55, 0, Z0 + 0.1], rotY: 4 })
  add('metal_jerrycan_green', { at: [2.95, 0, Z0 + 0.1], rotY: -8 })
  add('wooden_broom', { at: [X1 - 0.1, 0, -0.35], rot: [0, 90, -7], order: 'ZYX' })
  add('dustpan', { at: [X1 - 0.3, 0, -0.95], rotY: -80 })
  // left wall
  add('worn_metal_rack', { at: [X0 + 0.31, 0, -0.35], rotY: 90 })
  add('old_drill_press', { at: [X0 + 0.42, 0, 1.25], rotY: 90 })
  add('tool_cart', { at: [X0 + 0.42, 0, 2.95], rotY: 90 })
  add('wooden_ladder', { at: [2.6, 0, 3.8], rotY: 180 })
  add('wooden_stool_01', { at: [-1.3, 0, -1.02], rotY: 25 })
  add('watering_can_metal_01', { at: [X0 + 0.45, 0, 0.55], rotY: 60 })
  // front wall and the door jamb
  add('wall_clock', { at: [0.4, 2.0, Z1], rotY: 180, anchor: 'front' })
  add('industrial_wall_lamp', { at: [X1, 1.78, -0.62], rotY: -90, anchor: 'right' })
  const props = await Promise.all(P)

  // camera colliders: the room, a little inside the walls, and the big pieces
  // of furniture so the camera stops in front of them instead of inside
  const colliderMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide })
  const collider = new THREE.Mesh(box([X0 + 0.12, 0.05, Z0 + 0.12], [X1 - 0.12, HC - 0.1, Z1 - 0.12]), colliderMat)
  collider.visible = false
  collider.name = 'colliderGarage'
  const colliders = [collider]
  const solid = new THREE.MeshBasicMaterial()
  const blocker = (min, max) => { const m = new THREE.Mesh(box(min, max), solid); m.visible = false; m.name = 'colliderMobile'; colliders.push(m) }
  for (const p of props) {
    if (!p || !['worn_metal_rack', 'tool_cart', 'old_drill_press', 'metal_tool_chest', 'wooden_ladder'].includes(p.name)) continue
    p.updateMatrixWorld(true)
    const b = new THREE.Box3().setFromObject(p).expandByScalar(0.06)
    blocker(b.min.toArray(), b.max.toArray())
  }
  blocker([bx0 - 0.05, 0, bz0], [bx1 + 0.05, bTop + 0.05, bz1 + 0.06])

  let currentShutter = -1
  const variants = {
    giorno: {
      sky: { url: SKY + 'qwantani_late_afternoon_puresky_2k.hdr', sunAz: 22, E: 6, ground: 0.25 },
      shutter: 1.35, tubes: 280, lamp: 0, wallLamp: 0, exposure: 1.4, envScale: 0.3, bikeEnv: 0.5, clamp: 2,
    },
    neon: {
      sky: { url: SKY + 'qwantani_dusk_2_puresky_2k.hdr', sunAz: 40, E: 0.35 }, sun: false, indoor: true,
      shutter: 0, tubes: 300, lamp: 60, wallLamp: 6, exposure: 1.6, envScale: 0.3, bikeEnv: 0.5, clamp: 0.6,
    },
  }
  const wallLampMats = []
  group.traverse((o) => { if (o.isMesh && o.material?.name?.startsWith?.('industrial_wall_lamp') && o.material.emissive) wallLampMats.push(o.material) })

  return {
    group,
    grounds: [floorMesh],
    colliders,
    probe: v3(0.07, 0.62, 0),
    indoor: true,
    clamp: 2.5,
    maxDistance: 6.2,
    variants,
    defaultVariant: 'giorno',
    captureHide: tubes.map((t) => t.tube),
    applyVariant(id, cfg) {
      if (cfg.shutter !== currentShutter) { setShutter(cfg.shutter); currentShutter = cfg.shutter }
      for (const t of tubes) { t.light.intensity = cfg.tubes }
      // the area light does the lighting (both renderers): the tube itself
      // only has to read as blown-out white. At full strength it would bloom
      // like a flare, and in the path tracer every diffuse ray that happened
      // to hit it would be a firefly.
      mats.tube.emissiveIntensity = cfg.tubes ? 7 : 0
      lampLight.intensity = cfg.lamp
      group.traverse((o) => {
        if (o.isMesh && o.material?.name === 'hanging_industrial_lamp' && o.material.emissive) {
          o.material.emissiveIntensity = cfg.lamp ? cfg.lamp * 0.35 : 0
          o.material.userData.pt = { emissiveIntensity: cfg.lamp ? 5 : 0 }
        }
      })
      for (const m of wallLampMats) m.emissiveIntensity = cfg.wallLamp
    },
    // contact shadows on the floor come from the tubes overhead (and a little sky)
    aoSampler(id) {
      const c = v3(0.07, 0.5, 0)
      return (r1, r2, r3, out) => {
        if (r1 < 0.85) {
          const t = tubes[r1 < 0.425 ? 0 : 1]
          const p = t.center.clone().addScaledVector(t.axis, (r2 - 0.5) * t.len)
          return out.copy(p).sub(c).normalize()
        }
        // cosine hemisphere for the rest
        const phi = r2 * Math.PI * 2, st = Math.sqrt(r3), ct = Math.sqrt(1 - r3)
        void id
        return out.set(Math.cos(phi) * st, ct, Math.sin(phi) * st)
      }
    },
  }
}
