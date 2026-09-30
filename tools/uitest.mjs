import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.stack))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('ERR ' + m.text().slice(0, 300)) })
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
await page.evaluate(() => { window.__gs.settings.pathTracing = false })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// screen position of a point on a part (world), via the same helper used for decals
const screenOf = (part, t, dir) => page.evaluate((part, t, dir) => {
  const s = window.__gs, V = s.THREE.Vector3
  const h = s.surfaceHit(part, t, new V(...dir))
  const S = s.stickers
  const { frameAt } = window.__decal || {}
  const mesh = h.mesh
  // find the local point for this uv by building a tiny decal frame
  const f = S.buildGeometry ? null : null
  const g = mesh.geometry
  // approximate: nearest vertex with that uv
  const uv = g.attributes.uv, pos = g.attributes.position
  let best = 1e9, bi = 0
  for (let i = 0; i < uv.count; i++) { const d = Math.hypot(uv.getX(i) - h.uv.x, (uv.getY(i) - h.uv.y)); if (d < best) { best = d; bi = i } }
  const p = new V().fromBufferAttribute(pos, bi)
  // for straight tubes the nearest vertex is at an end: lerp along the tube instead
  const L = g.userData.length
  if (L) { const a = new V().fromBufferAttribute(pos, bi); const other = new V().fromBufferAttribute(pos, (bi + (g.attributes.position.count / 2)) % g.attributes.position.count); p.lerpVectors(a, other, 0.5) }
  mesh.localToWorld(p)
  p.project(s.camera)
  const r = s.canvas.getBoundingClientRect()
  return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height }
}, part, t, dir)
// 1) arm "Margherita"
const tiles = await page.$$('.tile')
let target = null
const names = []
for (const t of tiles) { const n = await t.$eval('.tile-name', (e) => e.textContent).catch(() => ''); names.push(n); if (n === 'Margherita' || (!target && n === 'Sole')) target = t }
if (!target) { console.log('tiles:', names.join(', ')); target = tiles[5] }
await target.click()
await wait(300)
const armed = await page.evaluate(() => window.__gs.stickers.armed)
// 2) hover the rear fender
const vtx = (name, row, col) => page.evaluate((name, row, col) => {
  const s = window.__gs, V = s.THREE.Vector3
  const m = s.stickers.bikeMeshes.find((x) => x.name === name)
  const p = new V().fromBufferAttribute(m.geometry.attributes.position, row * 27 + col).applyMatrix4(m.matrixWorld).project(s.camera)
  const r = s.canvas.getBoundingClientRect()
  return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height }
}, name, row, col)
const pt = await vtx('parafangoPost', 110, 13)
await page.mouse.move(pt.x, pt.y, { steps: 8 })
await wait(400)
const ghost = await page.evaluate(() => window.__gs.stickers.ghost.visible)
await page.screenshot({ path: 'shots/ui_ghost.png' })
// 3) click to place
await page.mouse.down(); await page.mouse.up()
await wait(250)
await page.screenshot({ path: 'shots/ui_peel.png' })
await wait(900)
const placed = await page.evaluate(() => ({ n: window.__gs.stickers.list.length, sel: window.__gs.stickers.selected, part: window.__gs.stickers.byId(window.__gs.stickers.selected)?.part }))
await page.screenshot({ path: 'shots/ui_placed.png' })
// 4) drag it forward over the top of the fender
const to = await vtx('parafangoPost', 70, 15)
await page.mouse.move(pt.x, pt.y)
await page.mouse.down()
await page.mouse.move(to.x, to.y, { steps: 14 })
await page.mouse.up()
await wait(400)
const moved = await page.evaluate(() => { const s = window.__gs.stickers.byId(window.__gs.stickers.selected); return s && { part: s.part, uv: s.uv.map((v) => +v.toFixed(3)) } })
await page.screenshot({ path: 'shots/ui_moved.png' })
// 5) undo
await page.keyboard.down('Meta'); await page.keyboard.press('z'); await page.keyboard.up('Meta')
await wait(300)
const undone = await page.evaluate(() => { const s = window.__gs.stickers.list.at(-1); return s && { part: s.part, uv: s.uv.map((v) => +v.toFixed(3)) } })
console.log(JSON.stringify({ armed, ghost, placed, moved, undone, errs }))
await browser.close()
