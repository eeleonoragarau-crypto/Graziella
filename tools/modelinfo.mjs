// Prints bounding boxes of every set prop (loaded through the app's loader).
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const ids = fs.readdirSync('public/sets/models')
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal'] })
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gs', { timeout: 60000 })
const out = await page.evaluate(async (ids) => {
  const A = await import('/src/engine/sets/assets.js')
  const THREE = window.__gs.THREE
  const res = {}
  for (const id of ids) {
    try {
      const o = await A.loadModel(id)
      const b = new THREE.Box3().setFromObject(o)
      const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3())
      let tris = 0, mats = new Set()
      o.traverse((m) => { if (m.isMesh) { tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; mats.add(m.material.name + (m.material.userData.pt ? '[T]' : '') + (m.material.emissiveMap || m.material.emissiveIntensity > 0 && m.material.emissive?.getHex() ? '[E]' : '')) } })
      res[id] = { size: s.toArray().map((v) => +v.toFixed(3)), center: c.toArray().map((v) => +v.toFixed(3)), minY: +b.min.y.toFixed(3), tris, mats: [...mats].join(',') }
    } catch (e) { res[id] = 'ERR ' + e.message }
  }
  return res
}, ids)
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(30), JSON.stringify(v))
await browser.close()
