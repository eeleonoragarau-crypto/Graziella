import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
await new Promise((r) => setTimeout(r, 1200))
const setup = await page.evaluate(() => {
  const s = window.__gs, S = s.stickers, V = s.THREE.Vector3
  s.settings.pathTracing = false
  S.restore([])
  const h = s.surfaceHit('carter', 0.46, new V(0, 0, 1))
  const st = S.place('lib:ciao', h, { animate: false, width: 0.06 })
  s.controls.setLookAt(-0.05, 0.36, 0.5, -0.06, 0.33, 0.06, false)
  return { id: st.id, w: st.width, rot: st.rot }
})
await new Promise((r) => setTimeout(r, 900))
const corner = (u, v) => page.evaluate((u, v) => {
  const s = window.__gs, S = s.stickers, V = s.THREE.Vector3
  const st = S.byId(S.selected)
  const g = st.mesh.geometry, uv = g.attributes.uv, pos = g.attributes.position
  let best = 9, bi = 0
  for (let i = 0; i < uv.count; i++) { const d = Math.hypot(uv.getX(i) - u, uv.getY(i) - v); if (d < best) { best = d; bi = i } }
  const p = new V().fromBufferAttribute(pos, bi); st.mesh.localToWorld(p); p.project(s.camera)
  const r = s.canvas.getBoundingClientRect()
  return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height }
}, u, v)
await page.screenshot({ path: 'shots/corner_0.png' })
const c = await corner(0.93, 0.93)
const ctr = await corner(0.5, 0.5)
// drag the corner away from the centre and around it
await page.mouse.move(c.x, c.y)
await page.mouse.down()
const dx = c.x - ctr.x, dy = c.y - ctr.y
const ang = 0.6, k = 1.5
const tx = ctr.x + (dx * Math.cos(ang) - dy * Math.sin(ang)) * k
const ty = ctr.y + (dx * Math.sin(ang) + dy * Math.cos(ang)) * k
await page.mouse.move(tx, ty, { steps: 16 })
await page.mouse.up()
await new Promise((r) => setTimeout(r, 400))
const after = await page.evaluate(() => { const st = window.__gs.stickers.byId(window.__gs.stickers.selected); return { w: +st.width.toFixed(4), rot: +st.rot.toFixed(3) } })
await page.screenshot({ path: 'shots/corner_1.png' })
console.log(JSON.stringify({ setup, after }))
await browser.close()
