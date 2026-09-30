import puppeteer from 'puppeteer-core'
const out = process.argv[2] || 'shots/hero2.png'
const spp = +(process.argv[3] || 200)
const cam = JSON.parse(process.argv[4] || '[1.25, 0.92, 2.45, 0.05, 0.55, 0]')
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
await page.addStyleTag({ content: '.panel,.toolbar,.status,.hint,.wordmark,.help,.photo{display:none!important}' })
await page.evaluate((cam) => {
  const s = window.__gs
  s.settings.pathTracing = false
  s.controls.setLookAt(...cam, false)
  s.settings.pathTracing = true
  s.poke()
}, cam)
await page.waitForFunction((n) => window.__gs.mode === 'pt' && window.__gs.pt.samples >= n, { timeout: 500000, polling: 500 }, spp)
await new Promise((r) => setTimeout(r, 700))
await page.screenshot({ path: out })
console.log('done', out)
await browser.close()
