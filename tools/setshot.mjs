// Screenshots of a set (raster and/or path traced) from several views.
// usage: node tools/setshot.mjs --set garage --light giorno --views tre4,lato [--pt 1 --spp 96] [--out shots/garage]
//        [--cam "x,y,z,tx,ty,tz"] [--w 1600 --h 1000] [--ui 0]
import puppeteer from 'puppeteer-core'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const set = opt('set', 'garage'), light = opt('light', null)
const views = opt('views', 'tre4').split(',')
const pt = opt('pt', '0') === '1', spp = +opt('spp', 64)
const out = opt('out', `shots/${set}`)
const W = +opt('w', 1600), H = +opt('h', 1000)
const cam = opt('cam', null)
const ui = opt('ui', '0') === '1'
const evalJs = opt('eval', null)

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
})
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
const logs = []
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 400)) })
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + (e.stack || e.message).slice(0, 800)))
const t0 = Date.now()
await page.goto(process.env.URL || 'http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction('window.__gsReady === true', { timeout: 120000 }).catch(() => logs.push('TIMEOUT ready'))
if (!ui) await page.addStyleTag({ content: '.panel,.toolbar,.status,.hint,.wordmark{display:none!important}' })
const tSet = Date.now()
await page.evaluate(async (set, light) => {
  const s = window.__gs
  s.settings.pathTracing = false
  const sc = { set, env: 'studio' }
  if (light) sc[set] = light
  await s.setAmbient(sc)
}, set, light)
const loadMs = Date.now() - tSet
console.log('stage timings', JSON.stringify(await page.evaluate(() => window.__gs.stage.timings)))
if (evalJs) await page.evaluate(evalJs)
for (const v of views) {
  await page.evaluate((v, cam, pt) => {
    const s = window.__gs
    s.settings.pathTracing = false
    if (cam) { const c = cam.split(',').map(Number); s.controls.setLookAt(...c, false) } else s.view(v, false)
    s.poke()
    s.settings.pathTracing = pt
  }, v, cam, pt)
  await new Promise((r) => setTimeout(r, 1500))
  if (pt) {
    await page.waitForFunction((n) => window.__gs.mode === 'pt' && window.__gs.pt.samples >= n, { timeout: 300000, polling: 300 }, spp).catch(() => logs.push('TIMEOUT spp'))
    await new Promise((r) => setTimeout(r, 800))
  }
  const info = await page.evaluate(() => {
    const s = window.__gs, ri = s.renderer.info
    return { mode: s.mode, spp: Math.floor(s.pt.samples), calls: ri.render.calls, tris: ri.render.triangles, frameMs: +s.frameMs.toFixed(1), bvhMs: Math.round(s.pt.buildMs || 0) }
  })
  const file = `${out}_${light || 'def'}_${cam ? 'cam' : v}${pt ? '_pt' : ''}.png`
  await page.screenshot({ path: file })
  console.log(JSON.stringify({ file, loadMs, ...info }))
}
console.log('total', ((Date.now() - t0) / 1000).toFixed(1) + 's')
if (logs.length) console.log(logs.slice(0, 30).join('\n'))
await browser.close()
