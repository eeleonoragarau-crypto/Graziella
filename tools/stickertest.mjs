// places a generated test sticker on several parts and screenshots
import puppeteer from 'puppeteer-core'
const out = process.argv[2] || 'shots/stk01.png'
const view = process.argv[3] || 'tre4'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })
page.on('pageerror', (e) => console.log('PAGEERROR', e.stack))
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 400)) })
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
const r = await page.evaluate(async (view) => {
  const s = window.__gs, S = s.stickers
  s.settings.pathTracing = false
  const mk = (txt, bg, fg, w = 600, h = 260, round = 60) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const x = c.getContext('2d')
    x.fillStyle = bg; x.beginPath(); x.roundRect(30, 30, w - 60, h - 60, round); x.fill()
    x.fillStyle = fg; x.font = 'bold ' + Math.round(h * 0.42) + 'px Geist Variable, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'
    x.fillText(txt, w / 2, h / 2 + 4)
    return c
  }
  S.addArt('t1', mk('CIAO!', '#f29ba4', '#1a1a1a'), { name: 'Ciao', size: 0.09 })
  S.addArt('t2', mk('SUPER', '#1f4e8c', '#f4ead5', 700, 200, 30), { name: 'Super', size: 0.11, finish: 'lucido' })
  S.addArt('t3', mk('7', '#f2b632', '#1a1a1a', 300, 300, 150), { name: 'Sette', size: 0.06, finish: 'opaco' })
  const t0 = performance.now()
  const res = []
  const put = (art, part, t, dir, opts) => { const h = s.surfaceHit(part, t, new s.THREE.Vector3(...dir)); const st = h && S.place(art, h, { animate: false, ...opts }); res.push(part + ':' + (st ? 'ok' : 'FAIL')) }
  put('t1', 'tuboPrincipaleFronte', 0.5, [0, 0, 1])
  put('t2', 'tuboSella', 0.35, [0, 0, 1], { rot: Math.PI / 2 })
  put('t3', 'tuboSterzo', 0.5, [1, 0.2, 0.3])
  put('t2', 'carter', 0.5, [0, 0, 1])
  put('t3', 'parafangoPost', 0.45, [0, 1, 0.2])
  put('t1', 'forcellinoAltoDx', 0.5, [0, 0.3, 1], { width: 0.06 })
  const ms = performance.now() - t0
  if (view === 'close') s.controls.setLookAt(0.25, 0.62, 0.62, -0.02, 0.46, 0, false); else if (view === 'close2') s.controls.setLookAt(-0.35, 0.75, 0.55, -0.1, 0.5, 0, false); else s.view(view, false)
  return { res, ms }
}, view)
console.log(JSON.stringify(r))
await new Promise((r) => setTimeout(r, 2500))
await page.screenshot({ path: out })
await browser.close()
