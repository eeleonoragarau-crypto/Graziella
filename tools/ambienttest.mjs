// UI flow: Scena tab -> each ambient -> each light, screenshots with the UI.
import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1500,940'] })
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 940 })
const logs = []
page.on('console', (m) => { if (['error'].includes(m.type())) logs.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message))
await page.goto('http://127.0.0.1:5218/', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction('window.__gsReady === true', { timeout: 120000 })
await page.evaluate(() => { window.__gs.settings.pathTracing = false })
const clickText = async (sel, text) => {
  const ok = await page.evaluate((sel, text) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().startsWith(text))
    if (el) { el.click(); return true } return false
  }, sel, text)
  if (!ok) logs.push('not found: ' + text)
}
const waitIdle = () => page.waitForFunction(() => !document.querySelector('.status[data-loading="true"]'), { timeout: 60000 }).then(() => new Promise((r) => setTimeout(r, 1500)))
await clickText('.tab', 'Scena')
await new Promise((r) => setTimeout(r, 400))
for (const [amb, lights] of [['Città', ['Pomeriggio', 'Mezzogiorno', 'Tramonto', 'Sera']], ['Garage', ['Serranda su', 'Neon']], ['Studio', []]]) {
  await clickText('.ambient', amb)
  await waitIdle()
  await page.screenshot({ path: `shots/sets/ui_${amb}.png` })
  for (const l of lights) {
    await clickText('.env', l)
    await waitIdle()
    await page.screenshot({ path: `shots/sets/ui_${amb}_${l.replace(/ /g, '_')}.png` })
  }
}
const st = await page.evaluate(() => ({ ambient: window.__gs.ambient, scene: JSON.parse(localStorage.getItem('graziella-studio-v1') || '{}').scene }))
console.log(JSON.stringify(st))
console.log(logs.length ? logs.join('\n') : 'no errors')
await browser.close()
