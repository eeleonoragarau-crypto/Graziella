// Raster vs path-traced, same view: prints the linear luminance ratio
// (raster / pt) over a grid, to calibrate a set's light probe.
// usage: node tools/rpcompare.mjs --set garage --light giorno --view tre4 [--spp 96] [--grid 4]
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const set = opt('set', 'garage'), light = opt('light', null), view = opt('view', 'tre4'), spp = +opt('spp', 96), G = +opt('grid', 4)
const W = 800, H = 500
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: W, height: H })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 120000 })
await page.addStyleTag({ content: '.panel,.toolbar,.status,.hint,.wordmark{display:none!important}' })
await page.evaluate(async (set, light, view) => {
  const s = window.__gs
  s.settings.pathTracing = false
  const sc = { set, env: 'studio' }; if (light) sc[set] = light
  await s.setAmbient(sc)
  s.view(view, false)
  // no lens effects: compare light, not grain
  s.post.grain.blendMode.opacity.value = 0; s.post.vignette.darkness = 0; s.post.ca.offset.set(0, 0); s.post.bloom.intensity = 0
  s.poke()
}, set, light, view)
await new Promise((r) => setTimeout(r, 1800))
const grab = async () => page.screenshot({ encoding: 'binary' })
const raster = await grab()
await page.evaluate(() => { const s = window.__gs; s.settings.pathTracing = true; s.poke() })
await page.waitForFunction((n) => window.__gs.mode === 'pt' && window.__gs.pt.samples >= n, { timeout: 300000, polling: 300 }, spp)
await new Promise((r) => setTimeout(r, 700))
const pt = await grab()
fs.writeFileSync('/tmp/_r.png', raster); fs.writeFileSync('/tmp/_p.png', pt)
await browser.close()
// decode with python (PIL) for the stats
import { execFileSync } from 'node:child_process'
const py = `
import numpy as np
from PIL import Image
G=${G}
a=np.asarray(Image.open('/tmp/_r.png').convert('RGB')).astype(float)/255
b=np.asarray(Image.open('/tmp/_p.png').convert('RGB')).astype(float)/255
lin=lambda x: np.where(x<=0.04045, x/12.92, ((x+0.055)/1.055)**2.4)
la=(lin(a)*[0.2126,0.7152,0.0722]).sum(2); lb=(lin(b)*[0.2126,0.7152,0.0722]).sum(2)
h,w=la.shape
rows=[]
for j in range(G):
  r=[]
  for i in range(G):
    A=la[j*h//G:(j+1)*h//G, i*w//G:(i+1)*w//G].mean(); B=lb[j*h//G:(j+1)*h//G, i*w//G:(i+1)*w//G].mean()
    r.append('%5.2f' % (A/max(B,1e-5)))
  rows.append(' '.join(r))
print('raster/pt (display-linear) per cell:'); print('\\n'.join(rows))
print('overall %.2f   raster mean %.3f  pt mean %.3f' % (la.mean()/max(lb.mean(),1e-5), la.mean(), lb.mean()))
Image.fromarray(np.concatenate([(a*255).astype('uint8'),(b*255).astype('uint8')],1)).save('shots/sets/_compare.png')
`
console.log(execFileSync('python3', ['-c', py]).toString())
