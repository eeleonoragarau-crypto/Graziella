import puppeteer from 'puppeteer-core'
const mode = process.argv[2] || 'raster'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
await page.addStyleTag({ content: '.panel,.toolbar,.status,.hint,.wordmark{display:none!important}' })
await page.evaluate((mode) => {
  const s = window.__gs, S = s.stickers, V = s.THREE.Vector3
  s.settings.pathTracing = mode === 'pt'
  S.restore([])
  const finishes = ['lucido', 'opaco', 'olografico', 'foil', 'decal', 'carta']
  const arts = ['lib:stella-holo', 'lib:super', 'lib:sole', 'lib:numero-7', 'lib:margherita', 'lib:rimini']
  const avail = arts.filter((a) => S.has(a))
  finishes.forEach((f, i) => {
    const art = avail[i % avail.length]
    const h = s.surfaceHit(i < 3 ? 'tuboPrincipaleFronte' : 'tuboPrincipaleRetro', i < 3 ? 0.2 + i * 0.3 : 0.15 + (i - 3) * 0.33, new V(0, 0.4, 1))
    S.place(art, h, { animate: false, finish: f, width: 0.05 })
  })
  s.controls.setLookAt(0.35, 0.62, 0.72, 0.17, 0.44, 0.0, false)
}, mode)
if (mode === 'pt') await page.waitForFunction(() => window.__gs.mode === 'pt' && window.__gs.pt.samples >= 128, { timeout: 200000, polling: 300 })
else await new Promise((r) => setTimeout(r, 2500))
await page.screenshot({ path: `shots/finishes_${mode}.png` })
await browser.close()
