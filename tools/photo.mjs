import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
// Path-traced still through the app's own photo job (what "Scatta" does).
// usage: node tools/photo.mjs citta pomeriggio 192 tre4  -> shots/sets/photo_<set>_<light>_<view>.png
const set = process.argv[2] || 'citta', light = process.argv[3] || 'pomeriggio', spp = +(process.argv[4] || 200), view = process.argv[5] || 'tre4'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 120000 })
const t0 = Date.now()
const b64 = await page.evaluate(async (set, light, spp, view) => {
  const s = window.__gs
  s.settings.pathTracing = false
  await s.setAmbient({ set, [set]: light })
  s.view(view, false)
  s.settings.pathTracing = true
  const blob = await s.photo({ target: spp })
  const buf = await blob.arrayBuffer()
  let bin = ''; const u = new Uint8Array(buf)
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(bin)
}, set, light, spp, view)
const out = `shots/sets/photo_${set}_${light}_${view}.png`
fs.writeFileSync(out, Buffer.from(b64, 'base64'))
console.log(out, ((Date.now() - t0) / 1000).toFixed(1) + 's')
await browser.close()
