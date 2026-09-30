import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 800 })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.evaluateOnNewDocument(() => { window.__t0 = performance.now() })
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gs', { timeout: 60000 })
const r = await page.evaluate(() => {
  const s = window.__gs
  s.settings.pathTracing = false
  const list = []
  let total = 0
  s.bike.traverse((o) => { if (o.isMesh) { const g = o.geometry; const t = (g.index ? g.index.count : g.attributes.position.count) / 3; total += t; list.push([o.name, Math.round(t)]) } })
  list.sort((a, b) => b[1] - a[1])
  return { total: Math.round(total), top: list.slice(0, 18), created: performance.now() - window.__t0 }
})
console.log(JSON.stringify(r, null, 0))
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
console.log('ready at', await page.evaluate(() => performance.now() - window.__t0))
await browser.close()
