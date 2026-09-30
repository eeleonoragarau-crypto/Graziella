// Screenshot of the sticker library sheet (sheet.html) on the real GPU.
// usage:
//   node tools/sheet.mjs                      -> shots/sheet.png (full page)
//   node tools/sheet.mjs --dsf 2              -> sharper
//   node tools/sheet.mjs --id rimini          -> single sticker view -> shots/sheet-rimini.png
//   node tools/sheet.mjs --export [ids,...]   -> full-res PNGs in shots/stickers/<id>.png (+ -mask, -cut)
//   node tools/sheet.mjs --crops              -> one crop per cell in shots/crops/<id>.png (dsf 2)
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }
const has = (k) => args.includes('--' + k)
const BASE = process.env.URL || 'http://127.0.0.1:5218/sheet.html'
const id = opt('id', null)
const dsf = +opt('dsf', has('crops') ? 2 : 1)
const W = +opt('w', 2100)
const suffix = dsf === 1 ? '' : `@${dsf}x`
const out = path.resolve(ROOT, opt('out', id ? `shots/sheet-${id}${suffix}.png` : `shots/sheet${suffix}.png`))

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const logs = []
try {
  const page = await browser.newPage()
  await page.setViewport({ width: W, height: 1200, deviceScaleFactor: dsf })
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 400)) })
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + (e.stack || e.message).slice(0, 800)))
  const t0 = Date.now()
  const q = new URLSearchParams()
  if (id) q.set('id', id)
  if (opt('scale')) q.set('scale', opt('scale'))
  await page.goto(BASE + (q.toString() ? '?' + q : ''), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__sheetReady === true', { timeout: 90000 })
  const info = await page.evaluate(() => ({ fonts: window.__fontReport, errors: window.__sheetErrors }))
  fs.mkdirSync(path.dirname(out), { recursive: true })
  await page.screenshot({ path: out, fullPage: true })
  console.log(JSON.stringify({ out: path.relative(ROOT, out), ms: Date.now() - t0, badFonts: (info.fonts || []).filter((f) => !f.ok), errors: info.errors }))

  if (has('export')) {
    const list = opt('export', '')
    const ids = list ? list.split(',') : []
    const dir = path.resolve(ROOT, 'shots/stickers')
    fs.mkdirSync(dir, { recursive: true })
    const recs = await page.evaluate((ids) => window.__exportAll(ids), ids)
    const save = (name, url) => fs.writeFileSync(path.join(dir, name), Buffer.from(url.split(',')[1], 'base64'))
    for (const r of recs) {
      save(`${r.id}.png`, r.art)
      if (r.mask) save(`${r.id}-mask.png`, r.mask)
      if (r.cut) save(`${r.id}-cut.png`, r.cut)
    }
    console.log('exported', recs.length, 'to', path.relative(ROOT, dir))
  }

  if (has('crops') && !id) {
    const dir = path.resolve(ROOT, 'shots/crops')
    fs.mkdirSync(dir, { recursive: true })
    const cells = await page.$$('.grid .cell[data-id]')
    for (const c of cells) {
      const cid = await c.evaluate((n) => n.dataset.id)
      await c.screenshot({ path: path.join(dir, `${cid}.png`) })
    }
    console.log('crops', cells.length, 'to', path.relative(ROOT, dir))
  }
} finally {
  if (logs.length) console.log(logs.slice(0, 30).join('\n'))
  await browser.close()
}
