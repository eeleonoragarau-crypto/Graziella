import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1000, height: 700 })
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
await page.addStyleTag({ content: '.panel,.toolbar,.status,.hint,.wordmark,.help,.photo{display:none!important}' })
const r = await page.evaluate(() => {
  const s = window.__gs, S = s.stickers, T = s.THREE
  s.settings.pathTracing = false
  const saddle = S.bikeMeshes.find((m) => m.name === 'sella')
  const hitFrom = (origin, target) => { S.raycaster.set(new T.Vector3(...origin), new T.Vector3(...target).sub(new T.Vector3(...origin)).normalize()); const h = S.raycaster.intersectObject(saddle, false)[0]; return h && { mesh: saddle, uv: h.uv, face: h.faceIndex, point: h.point } }
  const a = S.place('lib:margherita', hitFrom([-0.18, 1.3, 0.05], [-0.18, 0.9, 0.0]), { animate: false, width: 0.06 })   // on top
  const b = S.place('lib:numero-7', hitFrom([-0.55, 0.88, 0.0], [-0.3, 0.88, 0.0]), { animate: false, width: 0.035 })   // on the rear skirt
  S.select(null)
  s.controls.setLookAt(-0.6, 1.12, 0.4, -0.2, 0.88, 0.0, false)
  return { top: !!a, skirt: !!b, trisTop: a && a.mesh.geometry.attributes.position.count / 3, trisSkirt: b && b.mesh.geometry.attributes.position.count / 3 }
})
await new Promise((res) => setTimeout(res, 1500))
await page.screenshot({ path: 'shots/saddle_sticker.png' })
console.log(JSON.stringify(r))
await page.evaluate(() => localStorage.clear())
await browser.close()
