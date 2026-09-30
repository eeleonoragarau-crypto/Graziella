// The CC0 assets (Poly Haven: textures, models, skies, studio HDRIs).
// Writes src/engine/sets/manifest.js (where every file lives on Poly Haven's
// CDN: without a local copy the app streams them from there), downloads a
// local copy into public/sets and public/hdri (faster, works offline) and
// marks it with public/sets/local.json. Idempotent.
//   node tools/fetch-assets.mjs            manifest + local copy
//   node tools/fetch-assets.mjs --manifest manifest only
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sets')

// texture sets: [id, resolution, maps]
const TEXTURES = [
  // la città
  ['patterned_cobblestone', '2k', ['Diffuse', 'nor_gl', 'arm', 'Displacement']],
  ['granite_tile_03', '2k', ['Diffuse', 'nor_gl', 'arm']],
  ['yellow_plaster', '2k', ['Diffuse', 'nor_gl', 'arm']],
  ['red_plaster_weathered', '1k', ['Diffuse', 'nor_gl', 'arm']],
  ['painted_plaster_wall', '1k', ['Diffuse', 'nor_gl', 'arm']],
  ['beige_wall_002', '1k', ['Diffuse', 'nor_gl', 'arm']],
  ['peeling_painted_wall', '1k', ['Diffuse', 'nor_gl', 'arm']],
  ['marble_01', '1k', ['Diffuse', 'nor_gl', 'arm']],
  ['wood_peeling_paint_weathered', '1k', ['Diffuse', 'nor_gl', 'arm']],
  ['clay_roof_tiles', '1k', ['Diffuse', 'nor_gl', 'arm']],
  // il garage
  ['garage_floor', '2k', ['Diffuse', 'nor_gl', 'arm']],
  ['painted_concrete', '1k', ['Diffuse', 'nor_gl', 'arm']],
  ['white_plaster_rough_01', '1k', ['Diffuse', 'nor_gl', 'arm']],
  ['concrete_wall_008', '1k', ['Diffuse', 'nor_gl', 'arm']],
  ['painted_metal_shutter', '1k', ['Diffuse', 'nor_gl', 'arm']],
  ['wood_table_worn', '1k', ['Diffuse', 'nor_gl', 'arm']],
  ['plywood', '1k', ['Diffuse', 'nor_gl', 'arm']],
]

const MODELS = [
  // la città
  'street_lamp_02', 'rollershutter_door', 'potted_plant_01', 'potted_plant_02', 'planter_pot_clay',
  'outdoor_table_chair_set_01',
  // il garage
  'metal_tool_chest', 'metal_toolbox', 'bench_vice_01', 'old_tyre', 'tire_pump', 'metal_jerrycan',
  'metal_jerrycan_green', 'oil_tin', 'small_oil_can_01', 'cardboard_box_01', 'adjustable_wrench',
  'combination_wrench', 'pliers', 'screwdriver', 'cross_pein_hammer', 'handsaw_wood', 'wooden_ladder',
  'wall_clock', 'garden_hose_wall_mounted_01', 'wooden_broom', 'dustpan', 'watering_can_metal_01',
  'old_drill_press', 'wooden_stool_01', 'hanging_industrial_lamp', 'worn_metal_rack', 'tool_cart',
  'lubricant_spray', 'spray_paint_bottles', 'wooden_crate_01', 'industrial_wall_lamp',
]

// the paper studio's photographic lights, saved as public/hdri/<id>.hdr
const STUDIO_HDRIS = ['studio_small_09', 'photo_studio_loft_hall', 'brown_photostudio_02']

const SKIES = [
  'qwantani_late_afternoon_puresky', 'kloofendal_48d_partly_cloudy_puresky', 'evening_road_01_puresky',
  'qwantani_dusk_2_puresky', 'kloofendal_overcast_puresky',
]

const api = async (id) => {
  const r = await fetch(`https://api.polyhaven.com/files/${id}`, { headers: { 'User-Agent': 'graziella-sticker-studio' } })
  if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`)
  return r.json()
}

let bytes = 0, files = 0
async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      fs.writeFileSync(dest, buf)
      bytes += buf.length; files++
      return
    } catch (e) {
      if (attempt === 2) throw new Error(`${url}: ${e.message}`)
    }
  }
}

async function pool(items, n, fn) {
  const queue = items.slice()
  await Promise.all(Array.from({ length: n }, async () => { while (queue.length) await fn(queue.shift()) }))
}

const jobs = []
for (const [id, res, maps] of TEXTURES) {
  const f = await api(id)
  for (const m of maps) {
    const e = f[m]?.[res]?.jpg
    if (!e) { console.warn(`missing ${id} ${m} ${res}`); continue }
    jobs.push([e.url, path.join(ROOT, 'tex', id, path.basename(e.url))])
  }
}
for (const id of MODELS) {
  const f = await api(id)
  const g = f.gltf?.['1k']?.gltf
  if (!g) { console.warn(`missing model ${id}`); continue }
  jobs.push([g.url, path.join(ROOT, 'models', id, path.basename(g.url))])
  for (const [rel, e] of Object.entries(g.include || {})) jobs.push([e.url, path.join(ROOT, 'models', id, rel)])
}
for (const id of SKIES) {
  const f = await api(id)
  const e = f.hdri?.['2k']?.hdr
  if (!e) { console.warn(`missing sky ${id}`); continue }
  jobs.push([e.url, path.join(ROOT, 'sky', path.basename(e.url))])
}
const HDRI = path.resolve(ROOT, '..', 'hdri')
for (const id of STUDIO_HDRIS) {
  const f = await api(id)
  const e = f.hdri?.['2k']?.hdr
  if (!e) { console.warn(`missing hdri ${id}`); continue }
  jobs.push([e.url, path.join(HDRI, `${id}.hdr`)])
}

// manifest: public path -> CDN url
const PUBLIC = path.resolve(ROOT, '..')
const map = {}
for (const [url, dest] of jobs) map['/' + path.relative(PUBLIC, dest).split(path.sep).join('/')] = url
const manifestPath = path.resolve(PUBLIC, '..', 'src', 'engine', 'sets', 'manifest.js')
fs.writeFileSync(manifestPath, '// Generated by tools/fetch-assets.mjs: where each CC0 asset lives on Poly Haven\'s CDN.\n' +
  '// Used when there is no local copy in public/ (a fresh clone of the repository).\n' +
  'export default ' + JSON.stringify(map, null, 1) + '\n')
console.log(`manifest: ${Object.keys(map).length} files -> ${path.relative(process.cwd(), manifestPath)}`)

if (!process.argv.includes('--manifest')) {
  await pool(jobs, 8, async ([url, dest]) => download(url, dest))
  fs.writeFileSync(path.join(ROOT, 'local.json'), JSON.stringify({ local: true, files: jobs.length }) + '\n')
  console.log(`${jobs.length} files checked, ${files} downloaded (${(bytes / 1e6).toFixed(1)} MB)`)
}
