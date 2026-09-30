import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 900, height: 600 })
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
await page.addStyleTag({ content: '.panel,.toolbar,.status,.hint,.wordmark{display:none!important}' })
await page.evaluate(() => {
  const s = window.__gs, S = s.stickers, V = s.THREE.Vector3
  s.settings.pathTracing = false
  S.restore([])
  s.controls.setLookAt(0.1, 0.62, 0.42, 0.19, 0.45, 0.0, false)
})
await new Promise((r) => setTimeout(r, 1500))
// place with a slow peel so we can sample frames
await page.evaluate(() => {
  const s = window.__gs, S = s.stickers, V = s.THREE.Vector3
  const h = s.surfaceHit('tuboPrincipaleFronte', 0.45, new V(0, 0.3, 1))
  const st = S.place('lib:cuore-amore', h, { animate: false, width: 0.085 })
  S.select(null)
  S.peelOn(st, 2400)
})
const frames = []
for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 330)); frames.push(`shots/peel_${i}.png`); await page.screenshot({ path: frames[i] }) }
await browser.close()
