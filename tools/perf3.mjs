import puppeteer from 'puppeteer-core'
const dpr = +(process.argv[2] || 2)
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] })
const page = await browser.newPage()
await page.setViewport({ width: 1512, height: 945, deviceScaleFactor: dpr })
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
const variants = ['full', 'noAO', 'noSMAA', 'noBloom', 'noLens', 'noFloorShader']
const res = {}
for (const v of variants) {
  res[v] = await page.evaluate(async (v) => {
    const s = window.__gs, P = s.post
    s.settings.pathTracing = false
    P.n8ao.enabled = v !== 'noAO'; P.aoOn = v !== 'noAO'
    P.passSMAA.enabled = v !== 'noSMAA'
    P.bloom.intensity = v === 'noBloom' ? 0 : 0.32
    P.passLens.enabled = v !== 'noLens'
    await new Promise((r) => setTimeout(r, 1500))
    let frames = 0
    const t0 = performance.now()
    await new Promise((res) => { const tick = () => { frames++; s.controls.rotate(0.004, 0, false); if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else res() }; requestAnimationFrame(tick) })
    return (2500 / frames).toFixed(1) + ' ms'
  }, v)
}
console.log('dpr', dpr, JSON.stringify(res))
await browser.close()
