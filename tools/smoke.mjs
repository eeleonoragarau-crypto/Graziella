import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('ERR ' + m.text().slice(0, 200)) })
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 90000 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const clickAll = async (sel, pause = 250) => { const els = await page.$$(sel); for (const e of els) { await e.click().catch(() => {}); await wait(pause) } return els.length }
const log = {}
log.swatches = await clickAll('.swatch', 120)
log.segs = await clickAll('.inspector .seg-opt', 200)
await clickAll('.toggle', 300)
const tabs = await page.$$('.tab')
await tabs[1].click(); await wait(300)
log.envs = await clickAll('.env', 1500)
await tabs[2].click(); await wait(300)
log.renderSegs = await clickAll('.inspector .seg-opt', 300)
await clickAll('.toggle', 300)
await clickAll('.toggle', 300)
// stickers: arm + place via API, cycle finishes through the UI
await page.evaluate(() => { const s = window.__gs, V = s.THREE.Vector3; const h = s.surfaceHit('tuboSella', 0.4, new V(0, 0, 1)); const st = s.stickers.place('lib:sole', h); s.stickers.select(st.id) })
await wait(900)
log.finishes = await clickAll('.finish', 350)
await clickAll('.editor-actions .btn', 300)
// chips + toolbar
log.chips = await clickAll('.chip', 150)
await page.keyboard.press('g'); await wait(1200); await page.keyboard.press('g'); await wait(600)
await page.keyboard.press('b'); await wait(300)
await page.keyboard.press('p'); await wait(3500); await page.keyboard.press('p'); await wait(3500)
for (const k of ['1', '2', '3', '4']) { await page.keyboard.press(k); await wait(400) }
const state = await page.evaluate(() => ({ n: window.__gs.stickers.list.length, mode: window.__gs.mode, env: window.__gs.env.key }))
console.log(JSON.stringify({ log, state, errs: errs.filter((e) => !e.includes('AudioContext')).slice(0, 10) }))
await page.evaluate(() => localStorage.clear())
await browser.close()
