import puppeteer from 'puppeteer-core'
const envs = (process.argv[2] || 'studio,nero,tramonto,loft,set,bottega').split(',')
const pt = process.argv[3] === 'pt'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 750 })
page.on('pageerror', (e) => console.log('PAGEERROR', e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
await page.addStyleTag({ content: '.panel,.toolbar,.status,.hint,.wordmark{display:none!important}' })
for (const e of envs) {
  await page.evaluate(async (e, pt) => { const s = window.__gs; s.settings.pathTracing = pt; await s.setEnvironment(e); s.poke() }, e, pt)
  if (pt) await page.waitForFunction(() => window.__gs.mode === 'pt' && window.__gs.pt.samples >= 64, { timeout: 120000, polling: 300 })
  else await new Promise((r) => setTimeout(r, 2200))
  await page.screenshot({ path: `shots/env_${e}${pt ? '_pt' : ''}.png` })
}
await browser.close()
