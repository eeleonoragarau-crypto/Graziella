// Renders the bike with a debug material: front faces grey, back faces RED.
import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 900, height: 600 })
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.stack))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
await page.addStyleTag({ content: '.panel,.toolbar,.status,.hint,.wordmark,.help,.photo{display:none!important}' })
const names = await page.evaluate(() => {
  const s = window.__gs, T = s.THREE
  s.settings.pathTracing = false
  const dbg = new T.ShaderMaterial({
    side: T.DoubleSide,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ float l = 0.35 + 0.65 * max(0.0, normalize(vN).z); gl_FragColor = gl_FrontFacing ? vec4(vec3(l), 1.0) : vec4(1.0, 0.05, 0.05, 1.0); }',
  })
  const flagged = []
  s.bike.traverse((o) => { if (o.isMesh) { o.userData._m = o.material; o.material = dbg } })
  s.scene.traverse((o) => { if (o.isMesh && o.userData.sticker) o.visible = false })
  return flagged
})
const views = [[1.5, 0.98, 3.02], [-1.6, 1.1, -2.6], [2.4, 0.4, -0.8], [-2.2, 0.35, 1.4], [0.3, 2.6, 0.6], [0.2, 0.25, 2.2]]
for (let i = 0; i < views.length; i++) {
  await page.evaluate((p) => window.__gs.controls.setLookAt(...p, 0.07, 0.5, 0, false), views[i])
  await new Promise((r) => setTimeout(r, 700))
  await page.screenshot({ path: `shots/bf_${i}.png` })
}
// also: per mesh, count back-facing pixels by rendering each mesh alone? cheaper: winding vs normal agreement
const report = await page.evaluate(() => {
  const s = window.__gs, T = s.THREE
  const bad = []
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3(), fn = new T.Vector3(), e1 = new T.Vector3(), e2 = new T.Vector3()
  s.bike.traverse((o) => {
    if (!o.isMesh) return
    const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, idx = g.index
    if (!nor) return
    const tri = (idx ? idx.count : pos.count) / 3
    let agree = 0, disagree = 0
    const step = Math.max(1, Math.floor(tri / 3000))
    for (let t = 0; t < tri; t += step) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2)
      fn.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a))
      if (fn.lengthSq() < 1e-16) continue
      n.fromBufferAttribute(nor, i0).add(e1.fromBufferAttribute(nor, i1)).add(e2.fromBufferAttribute(nor, i2))
      if (fn.dot(n) >= 0) agree++; else disagree++
    }
    if (disagree > agree * 0.02) bad.push(o.name + ' ' + disagree + '/' + (agree + disagree))
  })
  return bad
})
console.log('winding/normal disagreement:', report.join(', ') || 'none')
await browser.close()
