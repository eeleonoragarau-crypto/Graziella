// Visual QA of a set: a ring of camera positions at the orbit limits, raster.
// usage: node tools/setqa.mjs citta pomeriggio  -> shots/sets/qa_<set>.png (contact sheet)
import puppeteer from 'puppeteer-core'
import { execFileSync } from 'node:child_process'
const set = process.argv[2] || 'citta', light = process.argv[3] || null
const W = 960, H = 600
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: W, height: H })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 120000 })
await page.addStyleTag({ content: '.panel,.toolbar,.status,.hint,.wordmark{display:none!important}' })
await page.evaluate(async (set, light) => { const s = window.__gs; s.settings.pathTracing = false; const sc = { set }; if (light) sc[set] = light; await s.setAmbient(sc) }, set, light)
// azimuth (deg, 0 = +x), polar (deg from up), distance
const views = [[35, 70, 9], [90, 84, 9], [150, 80, 9], [210, 75, 8], [270, 84, 6], [330, 80, 9], [0, 86, 9], [180, 86, 9], [60, 20, 9], [120, 45, 9], [250, 60, 8], [300, 30, 6]]
const files = []
for (const [i, [az, pol, d]] of views.entries()) {
  await page.evaluate((az, pol, d) => {
    const s = window.__gs, T = s.THREE
    const t = new T.Vector3(0.07, 0.52, 0)
    const a = T.MathUtils.degToRad(az), p = T.MathUtils.degToRad(pol)
    const pos = t.clone().add(new T.Vector3(Math.cos(a) * Math.sin(p), Math.cos(p), Math.sin(a) * Math.sin(p)).multiplyScalar(d))
    s.controls.setLookAt(pos.x, pos.y, pos.z, t.x, t.y, t.z, false)
    s.poke()
  }, az, pol, d)
  await new Promise((r) => setTimeout(r, 900))
  const f = `/tmp/_qa${i}.png`
  await page.screenshot({ path: f })
  files.push(f)
}
await browser.close()
const out = `shots/sets/qa_${set}${light ? '_' + light : ''}.png`
execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
fs=${JSON.stringify(files)}
ims=[Image.open(f).convert('RGB').resize((480,300)) for f in fs]
s=Image.new('RGB',(480*3,300*4))
d=ImageDraw.Draw(s)
for i,im in enumerate(ims):
  s.paste(im,((i%3)*480,(i//3)*300)); d.text(((i%3)*480+6,(i//3)*300+4), str(i), fill=(255,40,40))
s.save('${out}')
`])
console.log(out, errs.length ? errs : 'ok')
