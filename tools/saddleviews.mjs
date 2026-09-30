import puppeteer from 'puppeteer-core'
const out = process.argv[2] || 'shots/saddle_views.png'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 800, height: 560 })
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
await page.addStyleTag({ content: '.panel,.toolbar,.status,.hint,.wordmark,.help,.photo{display:none!important}' })
await page.evaluate(() => { window.__gs.settings.pathTracing = false })
// saddle centre ~ (-0.19, 0.87, 0)
const T = [-0.19, 0.86, 0]
const views = {
  front: [0.25, 0.95, 0.0], front34: [0.2, 0.98, 0.3], side: [-0.19, 0.9, 0.55], rear34: [-0.55, 0.98, 0.3],
  below34: [0.05, 0.62, 0.42], top: [-0.15, 1.35, 0.12],
}
const files = []
for (const [k, p] of Object.entries(views)) {
  await page.evaluate((p, T) => window.__gs.controls.setLookAt(...p, ...T, false), p, T)
  await new Promise((r) => setTimeout(r, 900))
  const f = `shots/sv_${k}.png`
  await page.screenshot({ path: f })
  files.push(f)
}
console.log(files.join(' '))
await browser.close()
