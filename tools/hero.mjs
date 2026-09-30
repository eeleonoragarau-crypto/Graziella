import puppeteer from 'puppeteer-core'
const env = process.argv[2] || 'studio'
const out = process.argv[3] || `shots/hero_${env}.png`
const spp = +(process.argv[4] || 256)
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
await page.addStyleTag({ content: '.panel,.toolbar,.status,.hint,.wordmark,.help{display:none!important}' })
await page.evaluate(async (env) => {
  const s = window.__gs, S = s.stickers, V = s.THREE.Vector3
  s.settings.pathTracing = false
  if (env !== 'studio') await s.setEnvironment(env)
  const put = (art, part, t, dir, o = {}) => { const h = s.surfaceHit(part, t, new V(...dir)); if (h) S.place(art, h, { animate: false, ...o }) }
  put('lib:rimini', 'tuboSella', 0.42, [0, 0, 1], { width: 0.07 })
  put('lib:numero-7', 'forcellaDx', 0.42, [0, 0, 1], { width: 0.05 })
  put('lib:cuore-amore', 'parafangoPost', 0.3, [0.4, 0.4, 1], { width: 0.065 })
  put('lib:stella-holo', 'tuboPrincipaleRetro', 0.55, [0, 0.35, 1], { width: 0.05 })
  put('lib:caffe', 'parafangoAnt', 0.62, [0.2, 0.6, 1], { width: 0.055 })
  S.select(null)
  s.controls.setLookAt(1.25, 0.82, 2.3, 0.02, 0.5, 0, false)
  s.settings.pathTracing = true
  s.poke()
}, env)
await page.waitForFunction((n) => window.__gs.mode === 'pt' && window.__gs.pt.samples >= n, { timeout: 400000, polling: 500 }, spp)
await new Promise((r) => setTimeout(r, 700))
await page.screenshot({ path: out })
console.log('done', out)
await browser.close()
