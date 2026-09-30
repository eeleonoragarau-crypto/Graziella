// Headless screenshot of the studio on the real GPU (ANGLE/Metal).
// usage: node tools/shot.mjs out.png [--view tre4] [--pt 0|1] [--spp 64] [--w 1600 --h 1000] [--eval "js"] [--wait ms]
import puppeteer from 'puppeteer-core'

const args = process.argv.slice(2)
const out = args.find((a) => !a.startsWith('--')) || 'shot.png'
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const URL = process.env.URL || 'http://127.0.0.1:5218/'
const W = +opt('w', 1600), H = +opt('h', 1000)
const view = opt('view', null)
const pt = opt('pt', '0') === '1'
const spp = +opt('spp', 32)
const evalJs = opt('eval', null)
const wait = +opt('wait', 1800)
const dpr = +opt('dpr', 1)

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
})
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: dpr })
const logs = []
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 300)) })
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + (e.stack || e.message).slice(0, 600)))
const t0 = Date.now()
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 }).catch(() => logs.push('TIMEOUT waiting for __gsReady'))
const tReady = Date.now() - t0
await page.evaluate((view, pt) => {
  const s = window.__gs
  if (!s) return
  s.settings.pathTracing = pt
  if (view) s.view(view, false)
}, view, pt)
if (evalJs) await page.evaluate(evalJs)
await new Promise((r) => setTimeout(r, wait))
let info = {}
if (pt) {
  const tStart = Date.now()
  await page.waitForFunction((n) => window.__gs && window.__gs.mode === 'pt' && window.__gs.pt.samples >= n, { timeout: 240000, polling: 250 }, spp).catch(() => logs.push('TIMEOUT waiting spp'))
  await new Promise((r) => setTimeout(r, 900))
  info.ptSeconds = ((Date.now() - tStart) / 1000).toFixed(1)
}
info = { ...info, ...(await page.evaluate(() => {
  const s = window.__gs
  if (!s) return {}
  const ri = s.renderer.info
  return { mode: s.mode, spp: s.pt.samples, bvhMs: s.pt.buildMs, floorSamples: s.floor.samples, calls: ri.render.calls, tris: ri.render.triangles, frameMs: s.frameMs.toFixed(1) }
})) }
await page.screenshot({ path: out })
console.log(JSON.stringify({ out, readyMs: tReady, ...info }))
if (logs.length) console.log(logs.slice(0, 25).join('\n'))
await browser.close()
