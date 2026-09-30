import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
await page.evaluate(() => {
  const s = window.__gs, S = s.stickers, V = s.THREE.Vector3
  s.settings.pathTracing = false
  const h = s.surfaceHit('parafangoPost', 0.3, new V(0.3, 0.95, 0.28))
  const st = S.place('lib:capri', h, { animate: false, width: 0.08, finish: 'carta' })
  S.select(st.id)
  s.controls.setLookAt(-0.1, 1.05, 1.1, -0.3, 0.5, 0, false)
})
await new Promise((r) => setTimeout(r, 1800))
await page.screenshot({ path: 'shots/editor.png' })
await browser.close()
