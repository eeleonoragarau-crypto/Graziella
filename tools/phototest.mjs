import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900 })
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
const t0 = Date.now()
const res = await page.evaluate(async () => {
  const s = window.__gs
  const blob = await s.photo({ target: 64, onProgress: () => {} })
  if (!blob) return null
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
  return { size: blob.size, b64: btoa(bin), spp: s.pt.samples }
})
if (res) fs.writeFileSync('shots/photo_export.png', Buffer.from(res.b64, 'base64'))
console.log(JSON.stringify({ ok: !!res, size: res?.size, spp: res?.spp, seconds: ((Date.now() - t0) / 1000).toFixed(1) }))
await browser.close()
