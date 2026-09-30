import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
const a = await page.evaluate(async () => {
  const s = window.__gs, S = s.stickers, T = s.THREE
  s.settings.pathTracing = false
  // raycast onto the rack's left rail from above
  const rack = S.bikeMeshes.find((m) => m.name === 'portapacchi1')
  const target = new T.Vector3(-0.42, 0.556, 0.068)
  const origin = target.clone().add(new T.Vector3(0.02, 0.5, 0.35))
  S.raycaster.set(origin, target.clone().sub(origin).normalize())
  const h = S.raycaster.intersectObject(rack, false)[0]
  const hit = { mesh: rack, uv: h.uv, face: h.faceIndex, point: h.point }
  const st = S.place('lib:fulmine', hit, { animate: false, width: 0.05 })
  // how far do the decal's vertices spread? (should be ~ one sticker, not several rails)
  const pos = st.mesh.geometry.attributes.position
  const box = new T.Box3().setFromBufferAttribute(pos)
  const size = box.getSize(new T.Vector3())
  s.stickers.emit('update')
  return { tris: pos.count / 3, size: size.toArray().map((v) => +v.toFixed(3)), n: S.list.length }
})
await new Promise((r) => setTimeout(r, 800)) // persist debounce
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
const b = await page.evaluate(() => { const S = window.__gs.stickers; return { n: S.list.length, parts: S.list.map((x) => x.part).join(','), ok: S.list.every((x) => !!x.mesh) } })
console.log(JSON.stringify({ a, b }))
await page.evaluate(() => localStorage.clear())
await browser.close()
