/*
 * Graziella Sticker Studio · built-in artwork library
 *
 * Every sticker is drawn procedurally with the Canvas 2D API (paths + text,
 * no bitmaps). The engine (artwork.js) turns the artwork alpha into a die-cut
 * vinyl sticker, so each draw() paints on a TRANSPARENT canvas and keeps a
 * ~4% margin from the canvas edge.
 *
 * Foil / holographic entries also provide foil(): white where the metal shows.
 * The engine reads that mask as R x A, so non-foil areas are left transparent.
 */
import '@fontsource/yellowtail'
import '@fontsource/bowlby-one-sc'
import '@fontsource/monoton'
import '@fontsource/dm-serif-display'
import '@fontsource/space-mono'
import '@fontsource/space-mono/700.css'
import '@fontsource/righteous'
import '@fontsource/alfa-slab-one'
import '@fontsource/bagel-fat-one'
import '@fontsource/instrument-serif'

// ---------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------
export const INK = {
  rosso: '#D6312B', crema: '#F4EAD5', verde: '#2E7D4F', blu: '#1F4E8C', giallo: '#F2B632',
  nero: '#1A1A1A', rosa: '#F29BA4', arancio: '#EE7A2F', azzurro: '#7CC4E4', oro: '#C9A24A',
  bianco: '#FBF8F2',
}
// litho inks for the printed paper labels: same hues, a touch muted
const LITHO = {
  blu: '#2A5588', azzurro: '#8AC2D9', giallo: '#EEB740', rosso: '#CC4335', arancio: '#E2803F',
  verde: '#3B7A52', nero: '#2B2623', rosa: '#E7A2A2', laguna: '#2C7A7C',
}
const CHROME = '#D9DDE1' // base colour under a silver foil
const ROSSO_SCURO = '#9C201C' // shaded red (rosso overprinted with a black tint)
const TAU = Math.PI * 2
const DEG = Math.PI / 180

// ---------------------------------------------------------------------------
// fonts
// ---------------------------------------------------------------------------
const FONTS = [
  ['Yellowtail', 400], ['Bowlby One SC', 400], ['DM Serif Display', 400], ['Space Mono', 700],
  ['Righteous', 400], ['Alfa Slab One', 400], ['Bagel Fat One', 400], ['Instrument Serif', 400],
  ['Monoton', 400], ['Space Mono', 400],
]
const FONT_SAMPLE = 'AaBbGgQqÈèÀà·!.,0123456789'

export async function loadStickerFonts() {
  if (typeof document === 'undefined' || !document.fonts) return []
  const res = await Promise.all(
    FONTS.map(([fam, wt]) => document.fonts.load(`${wt} 64px "${fam}"`, FONT_SAMPLE).catch(() => [])),
  )
  await document.fonts.ready
  return FONTS.map(([family, weight], i) => ({ family, weight, ok: res[i].length > 0 }))
}

const F = (size, family, weight = 400) => `${weight} ${size.toFixed(2)}px "${family}"`

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------
function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

function prep(entry, scale) {
  const c = makeCanvas(entry.w * scale, entry.h * scale)
  const ctx = c.getContext('2d')
  ctx.scale(c.width / entry.w, c.height / entry.h)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  return { c, ctx }
}

export function drawSticker(entry, { scale = 1 } = {}) {
  const { c, ctx } = prep(entry, scale)
  entry.draw(ctx, entry.w, entry.h)
  return c
}

export function drawFoilMask(entry, { scale = 1 } = {}) {
  if (!entry || typeof entry.foil !== 'function') return null
  const { c, ctx } = prep(entry, scale)
  entry.foil(ctx, entry.w, entry.h)
  return c
}

// ---------------------------------------------------------------------------
// helpers · maths & randomness
// ---------------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const pol = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(s) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h
}
// cubic bezier as a function of t
const bez = (p0, p1, p2, p3) => (t) => {
  const u = 1 - t
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]
}

// ---------------------------------------------------------------------------
// helpers · paths
// ---------------------------------------------------------------------------
function rrect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}
function circle(c, cx, cy, r, ccw = false) {
  c.moveTo(cx + r, cy)
  c.arc(cx, cy, r, 0, TAU, ccw)
}
function ring(c, cx, cy, r0, r1) {
  c.moveTo(cx + r1, cy); c.arc(cx, cy, r1, 0, TAU)
  c.moveTo(cx + r0, cy); c.arc(cx, cy, r0, TAU, 0, true)
}
function starPoints(cx, cy, rO, rI, n = 5, rot = -Math.PI / 2) {
  const pts = []
  for (let i = 0; i < n * 2; i++) pts.push(pol(cx, cy, i % 2 ? rI : rO, rot + (i * Math.PI) / n))
  return pts
}
// polygon, optionally with rounded corners (single radius or one per vertex)
function poly(c, pts, r = 0) {
  const n = pts.length
  if (!r) {
    c.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < n; i++) c.lineTo(pts[i][0], pts[i][1])
    c.closePath()
    return
  }
  const rs = Array.isArray(r) ? r : new Array(n).fill(r)
  const a = pts[n - 1], b = pts[0]
  c.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n]
    c.arcTo(p[0], p[1], q[0], q[1], rs[i])
  }
  c.closePath()
}
// closed outline of a stroke whose width varies along a centre line
function taper(c, fn, widthFn, steps = 72) {
  const L = [], R = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = fn(t)
    const q = fn(Math.min(1, t + 0.002)), o = fn(Math.max(0, t - 0.002))
    const dx = q[0] - o[0], dy = q[1] - o[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len, ny = dx / len
    const hw = Math.max(0, widthFn(t)) / 2
    L.push([p[0] + nx * hw, p[1] + ny * hw])
    R.push([p[0] - nx * hw, p[1] - ny * hw])
  }
  c.moveTo(L[0][0], L[0][1])
  for (let i = 1; i < L.length; i++) c.lineTo(L[i][0], L[i][1])
  for (let i = R.length - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1])
  c.closePath()
}
// mirrored path: segments describe the right half (x >= 0) from `start` to a point on the axis
function mirrored(c, start, segs, T) {
  c.moveTo(...T(start))
  for (const [c1, c2, p] of segs) c.bezierCurveTo(...T(c1), ...T(c2), ...T(p))
  const pts = [start, ...segs.map((s) => s[2])]
  const mx = (p) => [-p[0], p[1]]
  for (let i = segs.length - 1; i >= 0; i--) {
    const [c1, c2] = segs[i]
    c.bezierCurveTo(...T(mx(c2)), ...T(mx(c1)), ...T(mx(pts[i])))
  }
  c.closePath()
}
const xf = (cx, cy, s, rot = 0) => {
  const co = Math.cos(rot), si = Math.sin(rot)
  return ([x, y]) => [cx + s * (x * co - y * si), cy + s * (x * si + y * co)]
}

// stroke then fill a path so the outline sits outside the shape (visible width = lw)
function inked(ctx, path, fill, line, lw) {
  ctx.beginPath(); path(ctx)
  if (line && lw) { ctx.strokeStyle = line; ctx.lineWidth = lw * 2; ctx.stroke() }
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
}

// ---------------------------------------------------------------------------
// helpers · type
// ---------------------------------------------------------------------------
// kerning-aware glyph positions (+ optional tracking in px)
function glyphRun(ctx, text, tracking = 0) {
  const ch = Array.from(text)
  const n = ch.length
  const pos = new Array(n), adv = new Array(n)
  let L = Infinity, R = -Infinity, prefix = ''
  for (let i = 0; i < n; i++) {
    prefix += ch[i]
    const m = ctx.measureText(ch[i])
    adv[i] = m.width
    pos[i] = ctx.measureText(prefix).width - m.width + i * tracking
    if (ch[i].trim()) {
      L = Math.min(L, pos[i] - m.actualBoundingBoxLeft)
      R = Math.max(R, pos[i] + m.actualBoundingBoxRight)
    }
  }
  if (!isFinite(L)) { L = 0; R = 0 }
  return { ch, pos, adv, inkL: L, inkR: R, total: n ? pos[n - 1] + adv[n - 1] : 0 }
}
const capOf = (ctx) => ctx.measureText('H').actualBoundingBoxAscent
function sizeForCap(ctx, family, cap, weight = 400) {
  ctx.font = F(100, family, weight)
  return (100 * cap) / capOf(ctx)
}
// font size so the ink of `text` fits maxW x maxH (maxH = cap height unless script)
function fitFont(ctx, text, family, maxW, maxH, { weight = 400, tracking = 0, script = false } = {}) {
  ctx.font = F(100, family, weight)
  const g = glyphRun(ctx, text, tracking * 100)
  const m = ctx.measureText(text)
  const hh = script ? m.actualBoundingBoxAscent + m.actualBoundingBoxDescent : capOf(ctx)
  return 100 * Math.min(maxW / (g.inkR - g.inkL), maxH / hh)
}
// draw text glyph by glyph (tracking, ink-accurate alignment); mode fill | stroke | both
function text(ctx, str, x, y, { tracking = 0, align = 'center', mode = 'fill' } = {}) {
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const g = glyphRun(ctx, str, tracking)
  let x0 = x
  if (align === 'center') x0 = x - (g.inkL + g.inkR) / 2
  else if (align === 'right') x0 = x - g.inkR
  else if (align === 'left') x0 = x - g.inkL
  const passes = mode === 'both' ? ['stroke', 'fill'] : [mode]
  for (const p of passes) {
    for (let i = 0; i < g.ch.length; i++) {
      if (!g.ch[i].trim()) continue
      if (p === 'stroke') ctx.strokeText(g.ch[i], x0 + g.pos[i], y)
      else ctx.fillText(g.ch[i], x0 + g.pos[i], y)
    }
  }
  ctx.restore()
  return { left: x0 + g.inkL, right: x0 + g.inkR, width: g.inkR - g.inkL }
}
// text on a circle. r = radius of the cap-height centre line.
// side 'top' reads left-to-right over the top, 'bottom' reads left-to-right under the bottom.
function arcText(ctx, str, cx, cy, r, { side = 'top', at, tracking = 0, mode = 'fill' } = {}) {
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const g = glyphRun(ctx, str, tracking)
  const cap = capOf(ctx)
  const top = side === 'top'
  const a0 = at ?? (top ? -Math.PI / 2 : Math.PI / 2)
  const rb = top ? r - cap / 2 : r + cap / 2
  const mid = (g.inkL + g.inkR) / 2
  const passes = mode === 'both' ? ['stroke', 'fill'] : [mode]
  for (const p of passes) {
    for (let i = 0; i < g.ch.length; i++) {
      if (!g.ch[i].trim()) continue
      const s = g.pos[i] + g.adv[i] / 2 - mid
      const a = top ? a0 + s / r : a0 - s / r
      ctx.save()
      ctx.translate(cx + rb * Math.cos(a), cy + rb * Math.sin(a))
      ctx.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2)
      if (p === 'stroke') ctx.strokeText(g.ch[i], -g.adv[i] / 2, 0)
      else ctx.fillText(g.ch[i], -g.adv[i] / 2, 0)
      ctx.restore()
    }
  }
  ctx.restore()
  return (g.inkR - g.inkL) / r // angular span
}
// outlined text: stroke with round joins, then fill
function strokedText(ctx, str, x, y, { fill, line, lw, tracking = 0, align = 'center' }) {
  ctx.save()
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.strokeStyle = line; ctx.lineWidth = lw * 2
  text(ctx, str, x, y, { tracking, align, mode: 'stroke' })
  ctx.fillStyle = fill
  const r = text(ctx, str, x, y, { tracking, align, mode: 'fill' })
  ctx.restore()
  return r
}

// ---------------------------------------------------------------------------
// helpers · print
// ---------------------------------------------------------------------------
// halftone dots on a rotated screen; r(x, y) returns the dot radius in px
function halftone(ctx, x0, y0, x1, y1, { step = 12, angle = 45 * DEG, r }) {
  const ca = Math.cos(angle), sa = Math.sin(angle)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const R = Math.hypot(x1 - x0, y1 - y0) / 2 + step
  ctx.beginPath()
  for (let v = -R; v <= R; v += step) {
    for (let u = -R; u <= R; u += step) {
      const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca
      if (x < x0 - step || x > x1 + step || y < y0 - step || y > y1 + step) continue
      const rr = r(x, y)
      if (!(rr > 0.35)) continue
      ctx.moveTo(x + rr, y)
      ctx.arc(x, y, rr, 0, TAU)
    }
  }
  ctx.fill()
}
// seeded specks (paper grain, ink voids)
function speckle(ctx, w, h, { seed = 1, n = 500, color = '#000', alpha = 0.15, r = [0.5, 1.5] } = {}) {
  const R = rng(seed)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, rr = r[0] + R() * R() * (r[1] - r[0])
    ctx.moveTo(x + rr, y)
    ctx.arc(x, y, rr, 0, TAU)
  }
  ctx.fill()
  ctx.restore()
}
// short paper fibres
function fibres(ctx, w, h, { seed = 1, n = 120, color = '#6B5236', alpha = 0.08 } = {}) {
  const R = rng(seed)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = 0.9
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, a = R() * TAU, l = 4 + R() * 10
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l)
  }
  ctx.stroke()
  ctx.restore()
}
// draw into an offscreen plate (same transform), then composite it once with `op`
function layer(ctx, fn, op = 'source-over') {
  const src = ctx.canvas
  const c = makeCanvas(src.width, src.height)
  const l = c.getContext('2d')
  l.setTransform(ctx.getTransform())
  l.lineJoin = 'round'
  l.lineCap = 'round'
  fn(l)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = op
  ctx.drawImage(c, 0, 0)
  ctx.restore()
}
// ink misregistration: draw one plate slightly off
function misreg(ctx, dx, dy, fn) {
  ctx.save()
  ctx.translate(dx, dy)
  fn(ctx)
  ctx.restore()
}
// knock out (paper shows through the inks under this shape)
function knock(ctx, P, fn) {
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = P
  ctx.strokeStyle = P
  fn(ctx)
  ctx.restore()
}
// a printed paper label: paper base, inks overprinted (multiply), then voids + grit
function paperLabel(ctx, w, h, shape, { seed = 1, base = INK.crema, voids = 1 } = {}, inks) {
  ctx.save()
  ctx.beginPath(); shape(ctx)
  ctx.fillStyle = base
  ctx.fill()
  ctx.clip()
  ctx.globalCompositeOperation = 'multiply'
  inks(ctx, base)
  ctx.globalCompositeOperation = 'source-over'
  const area = w * h
  speckle(ctx, w, h, { seed: seed + 3, n: Math.round((area / 480) * voids), color: base, alpha: 0.45, r: [0.45, 1.4] })
  speckle(ctx, w, h, { seed: seed + 5, n: Math.round((area / 5200) * voids), color: base, alpha: 0.8, r: [0.8, 2.1] })
  speckle(ctx, w, h, { seed: seed + 9, n: Math.round(area / 2600), color: '#3A2A1C', alpha: 0.18, r: [0.4, 1.1] })
  fibres(ctx, w, h, { seed: seed + 13, n: Math.round(area / 7000), color: '#6B5236', alpha: 0.07 })
  ctx.restore()
}
// set colours per role; in foil mode, foil roles paint white and the rest erase
function painter(ctx, foil, colors, foilRoles) {
  return (role) => {
    if (foil) {
      ctx.globalCompositeOperation = foilRoles.includes(role) ? 'source-over' : 'destination-out'
      ctx.fillStyle = ctx.strokeStyle = '#FFFFFF'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = ctx.strokeStyle = colors[role]
    }
  }
}

// ---------------------------------------------------------------------------
// shared motifs
// ---------------------------------------------------------------------------
// heraldic swallow (rondine), pointing up in local space, span ~2 units
const SWALLOW = [
  [[0.03, -0.735], [0.075, -0.712], [0.1, -0.664]], // beak -> cheek
  [[0.122, -0.61], [0.118, -0.54], [0.1, -0.49]], // round head -> nape
  [[0.095, -0.465], [0.1, -0.44], [0.14, -0.415]], // nape -> shoulder
  [[0.44, -0.5], [0.8, -0.34], [1.0, 0.07]], // leading edge -> wing tip
  [[0.76, -0.12], [0.44, -0.11], [0.16, -0.07]], // trailing edge -> wing root
  [[0.16, 0.04], [0.13, 0.14], [0.105, 0.22]], // flank -> tail root
  [[0.17, 0.46], [0.27, 0.72], [0.36, 0.99]], // outer streamer -> tip
  [[0.23, 0.79], [0.09, 0.53], [0.0, 0.43]], // inner streamer -> fork
]
function swallow(c, cx, cy, s, rot) {
  mirrored(c, [0, -0.745], SWALLOW, xf(cx, cy, s, rot))
}

// striped beach umbrella (ombrellone) for the paper labels
function umbrella(ctx, P, { x, y, span, hgt, rot = 0, gores = 6, color, pole, poleColor, poleLen, line = null, lw = 4 }) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  const s2 = span / 2
  const canopy = (c) => {
    c.moveTo(-s2, 0)
    c.bezierCurveTo(-s2 * 0.94, -hgt * 1.3, s2 * 0.94, -hgt * 1.3, s2, 0)
    for (let i = gores; i > 0; i--) {
      const xa = -s2 + (span * i) / gores, xb = -s2 + (span * (i - 1)) / gores
      c.quadraticCurveTo((xa + xb) / 2, -hgt * 0.2, xb, 0)
    }
    c.closePath()
  }
  ctx.strokeStyle = poleColor
  ctx.lineWidth = pole
  ctx.lineCap = 'butt'
  ctx.beginPath(); ctx.moveTo(0, -hgt * 0.9); ctx.lineTo(0, poleLen); ctx.stroke()
  knock(ctx, P, (c) => { c.beginPath(); canopy(c); c.fill() })
  ctx.save()
  ctx.beginPath(); canopy(ctx); ctx.clip()
  ctx.fillStyle = color
  ctx.beginPath()
  const ay = -hgt * 1.02
  for (let i = 0; i < gores; i += 2) {
    const xa = -s2 + (span * i) / gores, xb = -s2 + (span * (i + 1)) / gores
    const k = (hgt * 1.02 + 40) / (hgt * 1.02)
    ctx.moveTo(0, ay); ctx.lineTo(xa * k, 40); ctx.lineTo(xb * k, 40); ctx.closePath()
  }
  ctx.fill()
  ctx.restore()
  if (line) {
    ctx.strokeStyle = line
    ctx.lineWidth = lw
    ctx.lineJoin = 'round'
    ctx.beginPath(); canopy(ctx); ctx.stroke()
  }
  // finial
  ctx.fillStyle = poleColor
  ctx.beginPath(); circle(ctx, 0, -hgt * 1.0 - pole * 0.6, pole * 0.9); ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// the stickers
// ---------------------------------------------------------------------------

// 2 · head-tube badge (shared by draw + foil)
function drawStemma(ctx, w, h, foil) {
  const paint = painter(ctx, foil, { gold: INK.oro, red: INK.rosso, cream: INK.crema }, ['gold'])
  const cx = w / 2
  const shield = (c) => {
    c.moveTo(cx, 46)
    c.bezierCurveTo(cx + 150, 46, cx + 300, 64, cx + 332, 150)
    c.bezierCurveTo(cx + 356, 330, cx + 346, 560, cx + 258, 742)
    c.bezierCurveTo(cx + 190, 872, cx + 70, 944, cx, 982)
    c.bezierCurveTo(cx - 70, 944, cx - 190, 872, cx - 258, 742)
    c.bezierCurveTo(cx - 346, 560, cx - 356, 330, cx - 332, 150)
    c.bezierCurveTo(cx - 300, 64, cx - 150, 46, cx, 46)
    c.closePath()
  }
  ctx.save()
  ctx.beginPath(); shield(ctx)
  paint('gold'); ctx.fill()
  ctx.clip()
  paint('red'); ctx.fill()
  // guilloché sunburst under the translucent enamel
  if (!foil) {
    const [sx, sy] = [cx + 4, 330]
    ctx.fillStyle = '#C92C27'
    ctx.beginPath()
    for (let k = 0; k < 40; k++) {
      const a = (k * TAU) / 40
      ctx.moveTo(sx, sy); ctx.lineTo(...pol(sx, sy, 900, a - 0.036)); ctx.lineTo(...pol(sx, sy, 900, a + 0.036)); ctx.closePath()
    }
    ctx.fill()
  }
  // enamel band with the word
  const b0 = 596, b1 = 706
  paint('cream'); ctx.fillRect(0, b0, w, b1 - b0)
  paint('gold'); ctx.fillRect(0, b0 - 5, w, 10); ctx.fillRect(0, b1 - 5, w, 10)
  const fs = fitFont(ctx, 'PIEGHEVOLE', 'DM Serif Display', 430, 60, { tracking: 0.08 })
  ctx.font = F(fs, 'DM Serif Display')
  const cap = capOf(ctx)
  paint('red')
  text(ctx, 'PIEGHEVOLE', cx, (b0 + b1) / 2 + cap / 2, { tracking: 0.08 * fs })
  // swallow + star, raised gold
  paint('gold')
  ctx.beginPath(); swallow(ctx, cx + 4, 330, 226, 38 * DEG); ctx.fill()
  ctx.beginPath(); poly(ctx, starPoints(cx, 822, 54, 22), 3); ctx.fill()
  // rim: gold edge, red channel, gold keyline
  ctx.beginPath(); shield(ctx)
  paint('gold'); ctx.lineWidth = 2 * (30 + 11 + 8); ctx.stroke()
  paint('red'); ctx.lineWidth = 2 * (30 + 11); ctx.stroke()
  paint('gold'); ctx.lineWidth = 2 * 30; ctx.stroke()
  ctx.restore()
  ctx.globalCompositeOperation = 'source-over'
}

// 10 · holographic star
const STELLA = { cx: 512, cy: 556, rO: 462, ratio: 0.5, lw: 26 }
function stellaPts() {
  const { cx, cy, rO, ratio } = STELLA
  return starPoints(cx, cy, rO, rO * ratio)
}

// 21 · chrome SUPER badge (shared by draw + foil)
function drawSuper(ctx, w, h, foil) {
  const paint = painter(ctx, foil, { chrome: CHROME, ink: INK.nero }, ['chrome'])
  const x0 = 44, y0 = 44, x1 = w - 44, y1 = h - 44
  const R = (y1 - y0) / 2
  const pill = (c, i = 0) => rrect(c, x0 + i, y0 + i, x1 - x0 - 2 * i, y1 - y0 - 2 * i, R - i)
  const cy = (y0 + y1) / 2
  ctx.save()
  // chrome bezel, black face, chrome keyline
  ctx.beginPath(); pill(ctx); paint('chrome'); ctx.fill()
  ctx.beginPath(); pill(ctx, 18); paint('ink'); ctx.fill()
  ctx.beginPath(); pill(ctx, 34); paint('chrome'); ctx.lineWidth = 7; ctx.stroke()
  // word
  const fam = 'Bowlby One SC'
  const fs = fitFont(ctx, 'SUPER', fam, 520, 150, { tracking: 0.04 })
  ctx.font = F(fs, fam)
  const cap = capOf(ctx)
  paint('chrome')
  const r = text(ctx, 'SUPER', w * 0.585, cy + cap / 2, { tracking: 0.04 * fs })
  // speed lines: square-cut at the word, drawn out to a point toward the tail
  const th = cap * 0.25
  const lines = [[-0.37, 0.66], [0, 1], [0.37, 0.82]]
  const xr = r.left - cap * 0.2
  for (const [dy, len] of lines) {
    const yy = cy + dy * cap
    const xl = xr - (xr - 118) * len
    ctx.beginPath()
    ctx.moveTo(xr, yy - th / 2)
    ctx.lineTo(xr, yy + th / 2)
    ctx.lineTo(lerp(xl, xr, 0.45), yy + th / 2)
    ctx.quadraticCurveTo(lerp(xl, xr, 0.12), yy + th * 0.3, xl, yy)
    ctx.quadraticCurveTo(lerp(xl, xr, 0.12), yy - th * 0.3, lerp(xl, xr, 0.45), yy - th / 2)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  ctx.globalCompositeOperation = 'source-over'
}

export const LIBRARY = [
  // =========================================================================
  // CLASSICI
  // =========================================================================
  {
    id: 'graziella-script', name: 'Graziella', category: 'classici',
    w: 1024, h: 360, size: 0.16, finish: 'decal', border: false,
    draw(ctx, w, h) {
      const CREAM = '#F6F0E1', GOLD = '#C9A24A'
      const word = 'Graziella'
      const fam = 'Yellowtail'
      ctx.font = F(100, fam)
      let m = ctx.measureText(word)
      // composition box at 100px: word ink + the tail (0.17 em right of the ink, 0.37 em under the baseline)
      const bw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight + 17
      const bh = m.actualBoundingBoxAscent + 37
      const k = Math.min((w * 0.9) / bw, (h * 0.84) / bh)
      const size = 100 * k
      ctx.font = F(size, fam)
      m = ctx.measureText(word)
      const x = (w - bw * k) / 2 + m.actualBoundingBoxLeft
      const y = (h - bh * k) / 2 + m.actualBoundingBoxAscent
      const lw = size * 0.034
      const s = size
      const left = x - m.actualBoundingBoxLeft, right = x + m.actualBoundingBoxRight
      // return tail: leaves the exit stroke of the final "a", loops and sweeps back under the word
      const P0 = [right - 0.03 * s, y - 0.145 * s]
      const J = [right + 0.075 * s, y + 0.16 * s]
      const segA = bez(P0, [right + 0.1 * s, y - 0.25 * s], [right + 0.26 * s, y - 0.02 * s], J)
      const segB = bez(J, [right - 0.11 * s, y + 0.34 * s], [lerp(left, right, 0.55), y + 0.33 * s], [left + 0.19 * (right - left), y + 0.235 * s])
      const TA = 0.24
      const sw = (t) => (t < TA ? segA(t / TA) : segB((t - TA) / (1 - TA)))
      const wfn = (t) => s * (t < 0.34 ? lerp(0.03, 0.068, Math.sin((t / 0.34) * Math.PI * 0.5)) : 0.068 * Math.pow((1 - t) / 0.66, 0.85))
      const swash = (c) => taper(c, sw, wfn, 140)
      ctx.lineJoin = 'round'
      ctx.strokeStyle = GOLD
      ctx.lineWidth = lw * 2
      ctx.strokeText(word, x, y)
      ctx.beginPath(); swash(ctx); ctx.stroke()
      ctx.fillStyle = CREAM
      ctx.fillText(word, x, y)
      ctx.beginPath(); swash(ctx); ctx.fill()
    },
  },
  {
    id: 'stemma-sterzo', name: 'Stemma', category: 'classici',
    w: 768, h: 1024, size: 0.045, finish: 'foil', border: true,
    draw(ctx, w, h) { drawStemma(ctx, w, h, false) },
    foil(ctx, w, h) { drawStemma(ctx, w, h, true) },
  },
  {
    id: 'tricolore', name: 'Tricolore', category: 'classici',
    w: 1024, h: 170, size: 0.11, finish: 'decal', border: false,
    draw(ctx, w, h) {
      const x0 = 70, x1 = w - 70, y0 = 38, y1 = h - 38
      const r = (y1 - y0) / 2
      const pill = (c, i = 0) => rrect(c, x0 - i, y0 - i, x1 - x0 + 2 * i, y1 - y0 + 2 * i, r + i)
      ctx.save()
      ctx.beginPath(); pill(ctx); ctx.clip()
      const t = (x1 - x0) / 3
      ctx.fillStyle = '#1F7A45'; ctx.fillRect(x0 - 2, y0 - 2, t + 3, y1 - y0 + 4)
      ctx.fillStyle = '#F4EFE2'; ctx.fillRect(x0 + t, y0 - 2, t + 1, y1 - y0 + 4)
      ctx.fillStyle = '#C8262B'; ctx.fillRect(x0 + 2 * t, y0 - 2, t + 3, y1 - y0 + 4)
      ctx.restore()
      // hand-pulled pinstripes along the two long edges, flicked off at the ends
      ctx.fillStyle = INK.oro
      const xa = x0 + r * 0.5, xb = x1 - r * 0.5
      for (const yy of [y0 - 13, y1 + 13]) {
        ctx.beginPath()
        taper(ctx, (t) => [lerp(xa, xb, t), yy], (t) => 7 * Math.min(1, Math.min(t, 1 - t) / 0.035) ** 0.45, 160)
        ctx.fill()
      }
    },
  },
  {
    id: 'made-in-italy', name: 'Made in Italy', category: 'classici',
    w: 1024, h: 680, size: 0.065, finish: 'lucido', border: true,
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, RX = 468, RY = 298
      const oval = (c, i = 0) => c.ellipse(cx, cy, RX - i, RY - i, 0, 0, TAU)
      ctx.fillStyle = INK.blu; ctx.beginPath(); oval(ctx); ctx.fill()
      ctx.fillStyle = INK.crema; ctx.beginPath(); oval(ctx, 32); ctx.fill()
      ctx.strokeStyle = INK.blu; ctx.lineWidth = 7; ctx.beginPath(); oval(ctx, 50); ctx.stroke()
      const fam = 'DM Serif Display'
      // MADE IN
      let fs = sizeForCap(ctx, fam, 46)
      ctx.font = F(fs, fam)
      ctx.fillStyle = INK.blu
      text(ctx, 'MADE IN', cx, 232, { tracking: 0.32 * fs })
      // ITALY
      fs = fitFont(ctx, 'ITALY', fam, 560, 168, { tracking: 0.04 })
      ctx.font = F(fs, fam)
      ctx.fillStyle = INK.rosso
      text(ctx, 'ITALY', cx, 432, { tracking: 0.04 * fs })
      // tricolore bar
      const bw = 330, bh = 30, bx = cx - bw / 2, by = 470
      const seg = bw / 3
      ctx.fillStyle = INK.verde; ctx.fillRect(bx, by, seg, bh)
      ctx.fillStyle = INK.bianco; ctx.fillRect(bx + seg, by, seg, bh)
      ctx.fillStyle = INK.rosso; ctx.fillRect(bx + 2 * seg, by, seg, bh)
      ctx.strokeStyle = INK.blu; ctx.lineWidth = 5; ctx.lineJoin = 'miter'
      ctx.strokeRect(bx, by, bw, bh)
      // flanking stars
      ctx.fillStyle = INK.blu
      for (const sx of [-1, 1]) { ctx.beginPath(); poly(ctx, starPoints(cx + sx * 238, 214, 20, 8.5), 1.5); ctx.fill() }
    },
  },
  {
    id: 'pieghevole-20', name: 'Pieghevole 20', category: 'classici',
    w: 1024, h: 150, size: 0.12, finish: 'decal', border: false,
    draw(ctx, w, h) {
      const fam = 'Bowlby One SC', CREAM = '#F6F0E1', GOLD = INK.oro
      const trk = 0.04
      ctx.font = F(100, fam)
      const cap100 = capOf(ctx)
      const gA = glyphRun(ctx, 'PIEGHEVOLE', trk * 100), gB = glyphRun(ctx, '20', trk * 100)
      const wA = gA.inkR - gA.inkL, wB = gB.inkR - gB.inkL
      const gap = cap100 * 0.42, dot = cap100 * 0.2
      const shade = 0.1
      const total100 = wA + gap + dot + gap + wB
      const s = 100 * Math.min((w * 0.9) / (total100 + cap100 * shade), (h * 0.72) / (cap100 * (1 + shade)))
      const k = s / 100
      ctx.font = F(s, fam)
      const cap = cap100 * k, d = cap * shade
      const x0 = (w - total100 * k - d) / 2
      const yb = (h - cap - d) / 2 + cap
      const put = (ox, oy, mode) => {
        text(ctx, 'PIEGHEVOLE', x0 + ox, yb + oy, { tracking: trk * s, align: 'left', mode })
        const dx = x0 + (wA + gap + dot / 2) * k + ox, dy = yb - cap * 0.5 + oy
        ctx.beginPath(); circle(ctx, dx, dy, (dot * k) / 2)
        if (mode === 'stroke') ctx.stroke(); else ctx.fill()
        text(ctx, '20', x0 + (wA + 2 * gap + dot) * k + ox, yb + oy, { tracking: trk * s, align: 'left', mode })
      }
      ctx.lineJoin = 'round'
      ctx.fillStyle = GOLD; ctx.strokeStyle = GOLD; ctx.lineWidth = cap * 0.07
      for (let i = 1; i <= Math.ceil(d); i++) { put(i, i, 'fill'); put(i, i, 'stroke') }
      put(0, 0, 'stroke')
      ctx.fillStyle = CREAM
      put(0, 0, 'fill')
    },
  },

  // =========================================================================
  // POP
  // =========================================================================
  {
    id: 'margherita', name: 'Margherita', category: 'pop',
    w: 1024, h: 1024, size: 0.07, finish: 'lucido', border: true,
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, R = rng(hash('margherita')), LW = 15
      const N = 9
      for (let i = 0; i < N; i++) {
        const a = -Math.PI / 2 + (i * TAU) / N + (R() - 0.5) * 0.08
        const len = 440 + (R() - 0.5) * 16, wid = 186 + (R() - 0.5) * 18
        ctx.save()
        ctx.translate(cx, cy); ctx.rotate(a)
        const rb = 70, xt = len - wid / 2
        inked(ctx, (c) => {
          c.moveTo(rb, 0)
          c.bezierCurveTo(rb + 60, -wid * 0.3, xt - wid * 0.7, -wid / 2, xt, -wid / 2)
          c.arc(xt, 0, wid / 2, -Math.PI / 2, Math.PI / 2)
          c.bezierCurveTo(xt - wid * 0.7, wid / 2, rb + 60, wid * 0.3, rb, 0)
          c.closePath()
        }, INK.bianco, INK.nero, LW)
        ctx.restore()
      }
      const disc = (c) => circle(c, cx, cy, 150)
      inked(ctx, disc, INK.giallo, INK.nero, LW)
      ctx.save()
      ctx.beginPath(); disc(ctx); ctx.clip()
      ctx.fillStyle = INK.arancio; ctx.fillRect(cx - 160, cy - 160, 320, 320)
      ctx.fillStyle = INK.giallo; ctx.beginPath(); circle(ctx, cx - 26, cy - 26, 150); ctx.fill()
      ctx.fillStyle = INK.arancio
      ctx.beginPath()
      for (let k = 1; k < 80; k++) {
        const r = 15.5 * Math.sqrt(k), a = k * 2.39996
        if (r > 112) break
        circle(ctx, cx + r * Math.cos(a) - 8, cy + r * Math.sin(a) - 8, 5.2)
      }
      ctx.fill()
      ctx.restore()
    },
  },
  {
    id: 'cuore-amore', name: 'Amore', category: 'pop',
    w: 1024, h: 940, size: 0.06, finish: 'lucido', border: true,
    draw(ctx, w, h) {
      const heart = (c) => {
        c.moveTo(512, 292)
        c.bezierCurveTo(512, 214, 440, 104, 300, 104)
        c.bezierCurveTo(150, 104, 64, 226, 64, 356)
        c.bezierCurveTo(64, 560, 290, 720, 512, 896)
        c.bezierCurveTo(734, 720, 960, 560, 960, 356)
        c.bezierCurveTo(960, 226, 874, 104, 724, 104)
        c.bezierCurveTo(584, 104, 512, 214, 512, 292)
        c.closePath()
      }
      ctx.save()
      ctx.translate(512, 470); ctx.scale(1.04, 1.04); ctx.translate(-512, -500)
      ctx.beginPath(); heart(ctx)
      ctx.fillStyle = INK.rosso; ctx.fill()
      // keyline: a smaller heart, so the top cusp stays sharp
      ctx.save()
      const k = 0.855
      ctx.translate(512, 492); ctx.scale(k, k); ctx.translate(-512, -492)
      ctx.beginPath(); heart(ctx)
      ctx.strokeStyle = INK.rosa; ctx.lineWidth = 13 / k; ctx.lineJoin = 'miter'; ctx.miterLimit = 6
      ctx.stroke()
      ctx.restore()
      ctx.save()
      ctx.translate(512, 452); ctx.rotate(-8 * DEG)
      const fam = 'Yellowtail'
      const fs = fitFont(ctx, 'Amore', fam, 600, 290, { script: true })
      ctx.font = F(fs, fam)
      const m = ctx.measureText('Amore')
      const tx = -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2
      const ty = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
      ctx.fillStyle = ROSSO_SCURO
      ctx.fillText('Amore', tx + 9, ty + 11)
      ctx.fillStyle = INK.bianco
      ctx.fillText('Amore', tx, ty)
      ctx.restore()
      ctx.restore()
    },
  },
  {
    id: 'sole', name: 'Sole', category: 'pop',
    w: 1024, h: 1024, size: 0.07, finish: 'opaco', border: true,
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, LINE = INK.rosso, LW = 13
      const P = (r, a) => pol(cx, cy, r, a)
      const flame = (c, a, r0, r1, hb, bend) => {
        const b1 = P(r0, a - hb), b2 = P(r0, a + hb), tip = P(r1, a + bend)
        c.moveTo(...b1); c.lineTo(...b2)
        c.bezierCurveTo(...P(lerp(r0, r1, 0.4), a + hb * 1.2), ...P(lerp(r0, r1, 0.72), a + bend - hb * 0.1), ...tip)
        c.bezierCurveTo(...P(lerp(r0, r1, 0.7), a + bend - hb * 0.85), ...P(lerp(r0, r1, 0.38), a - hb * 0.45), ...b1)
        c.closePath()
      }
      const N = 12
      // short straight rays between the flames
      for (let k = 0; k < N; k++) {
        const a = -Math.PI / 2 + ((k + 0.62) * TAU) / N
        inked(ctx, (c) => poly(c, [P(250, a - 0.085), P(418, a + 0.03), P(250, a + 0.085)], [6, 5, 6]), INK.giallo, LINE, LW)
      }
      for (let k = 0; k < N; k++) {
        const a = -Math.PI / 2 + (k * TAU) / N
        inked(ctx, (c) => flame(c, a, 240, 462, 0.18, 0.2), INK.arancio, LINE, LW)
      }
      const disc = (c) => circle(c, cx, cy, 282)
      inked(ctx, disc, INK.giallo, LINE, LW)
      // cheeks: halftone blush
      ctx.save()
      ctx.fillStyle = INK.rosso
      for (const sx of [-1, 1]) {
        const qx = cx + sx * 112, qy = cy + 70
        ctx.save(); ctx.beginPath(); circle(ctx, qx, qy, 48); ctx.clip()
        halftone(ctx, qx - 50, qy - 50, qx + 50, qy + 50, { step: 13, angle: 30 * DEG, r: (x, y) => 5.4 * (1 - Math.hypot(x - qx, y - qy) / 62) })
        ctx.restore()
      }
      ctx.restore()
      // face
      ctx.strokeStyle = LINE; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.lineWidth = 17
      for (const sx of [-1, 1]) {
        const ex = cx + sx * 96, ey = cy - 18
        ctx.beginPath(); ctx.moveTo(ex - 50, ey + 10); ctx.quadraticCurveTo(ex, ey - 42, ex + 50, ey + 10); ctx.stroke()
      }
      ctx.lineWidth = 14
      ctx.beginPath(); ctx.moveTo(cx - 2, cy - 4); ctx.quadraticCurveTo(cx - 20, cy + 50, cx - 10, cy + 62); ctx.quadraticCurveTo(cx + 8, cy + 70, cx + 26, cy + 60); ctx.stroke()
      ctx.lineWidth = 17
      ctx.beginPath(); ctx.moveTo(cx - 78, cy + 118); ctx.quadraticCurveTo(cx, cy + 176, cx + 78, cy + 118); ctx.stroke()
    },
  },
  {
    id: 'limone', name: 'Limone', category: 'pop',
    w: 1024, h: 900, size: 0.06, finish: 'lucido', border: true,
    draw(ctx, w, h) {
      const LW = 14, L = 332, W = 198
      const ROT = 27 * DEG, CX = 584, CY = 548
      ctx.save()
      ctx.translate(w / 2, h / 2); ctx.scale(1.13, 1.13); ctx.translate(-541, -462)
      // leaves first (world space), springing from the stem end
      const [sx, sy] = xf(CX, CY, 1, ROT)([-L - 18, 0])
      const leaf = (ang, len, wid, bend) => {
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang)
        const path = (c) => {
          c.moveTo(0, 0)
          c.bezierCurveTo(len * 0.22, -wid * (0.62 + bend), len * 0.68, -wid * (0.64 + bend), len, -wid * bend * 0.6)
          c.bezierCurveTo(len * 0.7, wid * (0.46 - bend), len * 0.26, wid * (0.5 - bend * 0.5), 0, 0)
          c.closePath()
        }
        inked(ctx, path, INK.verde, INK.nero, LW)
        ctx.strokeStyle = '#8DC07A'; ctx.lineWidth = 9
        ctx.beginPath(); ctx.moveTo(len * 0.12, -wid * 0.02); ctx.quadraticCurveTo(len * 0.52, -wid * (0.1 + bend * 0.5), len * 0.88, -wid * bend * 0.55); ctx.stroke()
        ctx.restore()
      }
      leaf(-38 * DEG, 318, 128, 0.08)
      leaf(-118 * DEG, 262, 112, -0.06)
      // stem nub
      ctx.strokeStyle = INK.nero; ctx.lineWidth = 26
      ctx.beginPath(); ctx.moveTo(sx + 8, sy + 6); ctx.lineTo(sx - 16, sy - 14); ctx.stroke()
      ctx.save()
      ctx.translate(CX, CY); ctx.rotate(ROT)
      const lemon = (c) => {
        c.moveTo(-L - 22, 0)
        c.bezierCurveTo(-L - 20, -24, -L + 4, -W * 0.52, -L * 0.6, -W * 0.86)
        c.bezierCurveTo(-L * 0.22, -W * 1.05, L * 0.3, -W * 1.03, L * 0.64, -W * 0.7)
        c.bezierCurveTo(L * 0.86, -W * 0.48, L * 0.98, -W * 0.24, L + 4, -W * 0.13)
        c.bezierCurveTo(L + 26, -W * 0.1, L + 52, -17, L + 60, 0)
        c.bezierCurveTo(L + 52, 17, L + 26, W * 0.1, L + 4, W * 0.13)
        c.bezierCurveTo(L * 0.98, W * 0.24, L * 0.86, W * 0.48, L * 0.64, W * 0.7)
        c.bezierCurveTo(L * 0.3, W * 1.03, -L * 0.22, W * 1.05, -L * 0.6, W * 0.86)
        c.bezierCurveTo(-L + 4, W * 0.52, -L - 20, 24, -L - 22, 0)
        c.closePath()
      }
      ctx.beginPath(); lemon(ctx)
      ctx.strokeStyle = INK.nero; ctx.lineWidth = LW * 2; ctx.stroke()
      ctx.fillStyle = INK.giallo; ctx.fill()
      ctx.save(); ctx.clip()
      // print shading: an orange screen toward the shadow side
      ctx.fillStyle = INK.arancio
      halftone(ctx, -L - 80, -W - 60, L + 80, W + 60, {
        step: 14, angle: 20 * DEG,
        r: (x, y) => 6.2 * clamp((0.62 * (x / L) + 0.78 * (y / W) - 0.12) / 0.85) ** 1.1,
      })
      // highlight
      ctx.fillStyle = INK.bianco
      ctx.beginPath()
      taper(ctx, bez([-L * 0.72, -W * 0.34], [-L * 0.52, -W * 0.78], [-L * 0.1, -W * 0.9], [L * 0.24, -W * 0.8]), (t) => 34 * Math.pow(Math.sin(Math.PI * t), 0.85))
      ctx.fill()
      ctx.beginPath(); circle(ctx, L * 0.42, -W * 0.66, 12); ctx.fill()
      ctx.restore()
      ctx.restore()
      ctx.restore()
    },
  },
  {
    id: 'stella-holo', name: 'Stella', category: 'pop',
    w: 1024, h: 1024, size: 0.06, finish: 'olografico', border: true,
    draw(ctx) {
      const pts = stellaPts()
      const { cx, cy, lw } = STELLA
      ctx.fillStyle = '#EEF1F4'
      ctx.beginPath(); poly(ctx, pts); ctx.fill()
      ctx.fillStyle = '#CDD3DA'
      ctx.beginPath()
      for (let k = 0; k < 5; k++) {
        const O = pts[2 * k], Ia = pts[(2 * k + 1) % 10]
        ctx.moveTo(cx, cy); ctx.lineTo(O[0], O[1]); ctx.lineTo(Ia[0], Ia[1]); ctx.closePath()
      }
      ctx.fill()
      ctx.strokeStyle = INK.nero; ctx.lineWidth = lw; ctx.lineJoin = 'round'
      ctx.beginPath(); poly(ctx, pts); ctx.stroke()
    },
    foil(ctx) {
      const pts = stellaPts()
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath(); poly(ctx, pts); ctx.fill()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = STELLA.lw; ctx.lineJoin = 'round'
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
    },
  },
  {
    id: 'fulmine', name: 'Fulmine', category: 'pop',
    w: 700, h: 1024, size: 0.06, finish: 'lucido', border: true,
    draw(ctx) {
      const pts = [[452, 52], [178, 548], [362, 548], [232, 930], [628, 390], [430, 390], [590, 52]].map(([x, y]) => [x - 70, y + 8])
      const LW = 17, SX = 30, SY = 26
      const bolt = (c, ox = 0, oy = 0) => poly(c, pts.map(([x, y]) => [x + ox, y + oy]), [5, 9, 9, 2.5, 9, 9, 5])
      ctx.lineJoin = 'round'
      ctx.fillStyle = INK.nero; ctx.strokeStyle = INK.nero; ctx.lineWidth = LW
      ctx.beginPath(); bolt(ctx, SX, SY); ctx.fill(); ctx.stroke()
      ctx.beginPath(); bolt(ctx)
      ctx.fillStyle = INK.giallo; ctx.fill()
      ctx.lineWidth = LW; ctx.stroke()
      // highlight along the upper edge
      const A = pts[0], B = pts[1]
      const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy)
      const nx = -dy / l, ny = dx / l
      const inset = -40
      ctx.strokeStyle = INK.bianco; ctx.lineWidth = 16; ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(A[0] + dx * 0.14 + nx * inset, A[1] + dy * 0.14 + ny * inset)
      ctx.lineTo(A[0] + dx * 0.58 + nx * inset, A[1] + dy * 0.58 + ny * inset)
      ctx.stroke()
    },
  },
  {
    id: 'sorriso', name: 'Sorriso', category: 'pop',
    w: 1024, h: 1024, size: 0.05, finish: 'lucido', border: true,
    draw(ctx) {
      const cx = 512, cy = 512
      ctx.beginPath(); circle(ctx, cx, cy, 452)
      ctx.fillStyle = INK.giallo; ctx.fill()
      ctx.strokeStyle = INK.nero; ctx.lineWidth = 18; ctx.stroke()
      // rosy cheeks, just outside the corners of the smile
      ctx.fillStyle = INK.rosa
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + sx * 262, cy + 118, 62, 50, 0, 0, TAU); ctx.fill() }
      // eyes with a glint
      for (const sx of [-1, 1]) {
        ctx.fillStyle = INK.nero
        ctx.beginPath(); ctx.ellipse(cx + sx * 116, cy - 100, 46, 86, 0, 0, TAU); ctx.fill()
        ctx.fillStyle = INK.bianco
        ctx.beginPath(); ctx.ellipse(cx + sx * 116 + 14, cy - 134, 12, 18, -0.3, 0, TAU); ctx.fill()
      }
      // smile
      ctx.strokeStyle = INK.nero; ctx.lineCap = 'round'; ctx.lineWidth = 38
      ctx.beginPath(); ctx.moveTo(cx - 208, cy + 76); ctx.bezierCurveTo(cx - 150, cy + 230, cx + 150, cy + 230, cx + 208, cy + 76); ctx.stroke()
    },
  },
  {
    id: 'ciliegie', name: 'Ciliegie', category: 'pop',
    w: 1024, h: 1024, size: 0.055, finish: 'lucido', border: true,
    draw(ctx) {
      const LW = 15, J = [604, 142]
      const cherry = (c, cx, cy, r) => {
        c.moveTo(cx, cy - 0.8 * r)
        c.bezierCurveTo(cx + 0.25 * r, cy - 1.05 * r, cx + r, cy - 0.95 * r, cx + r, cy - 0.1 * r)
        c.bezierCurveTo(cx + r, cy + 0.6 * r, cx + 0.55 * r, cy + r, cx, cy + r)
        c.bezierCurveTo(cx - 0.55 * r, cy + r, cx - r, cy + 0.6 * r, cx - r, cy - 0.1 * r)
        c.bezierCurveTo(cx - r, cy - 0.95 * r, cx - 0.25 * r, cy - 1.05 * r, cx, cy - 0.8 * r)
        c.closePath()
      }
      ctx.save()
      ctx.translate(-20, 22)
      const C1 = [352, 704, 204], C2 = [680, 690, 194]
      // stems
      const stems = (c) => {
        c.moveTo(C1[0], C1[1] - 0.78 * C1[2]); c.bezierCurveTo(C1[0] + 10, 400, 470, 230, J[0], J[1])
        c.moveTo(C2[0], C2[1] - 0.78 * C2[2]); c.bezierCurveTo(C2[0] - 8, 400, 650, 250, J[0], J[1])
      }
      ctx.lineCap = 'round'
      ctx.strokeStyle = INK.nero; ctx.lineWidth = 24 + LW * 2; ctx.beginPath(); stems(ctx); ctx.stroke()
      ctx.strokeStyle = '#6B8E3A'; ctx.lineWidth = 24; ctx.beginPath(); stems(ctx); ctx.stroke()
      // leaf
      const leaf = (c) => {
        c.moveTo(J[0], J[1])
        c.bezierCurveTo(680, 44, 830, 58, 918, 136)
        c.bezierCurveTo(830, 214, 690, 222, J[0], J[1])
        c.closePath()
      }
      inked(ctx, leaf, INK.verde, INK.nero, LW)
      ctx.strokeStyle = '#8DC07A'; ctx.lineWidth = 9
      ctx.beginPath(); ctx.moveTo(J[0] + 30, J[1] - 2); ctx.quadraticCurveTo(760, 126, 880, 136); ctx.stroke()
      // cherries
      for (const [cx, cy, r] of [C1, C2]) {
        const p = (c) => cherry(c, cx, cy, r)
        inked(ctx, p, INK.rosso, INK.nero, LW)
        ctx.save()
        ctx.beginPath(); p(ctx); ctx.clip()
        ctx.fillStyle = ROSSO_SCURO; ctx.fillRect(cx - r - 20, cy - r - 20, 2 * r + 40, 2 * r + 40)
        ctx.fillStyle = INK.rosso; ctx.beginPath(); circle(ctx, cx - 0.12 * r, cy - 0.12 * r, 0.9 * r); ctx.fill()
        ctx.fillStyle = INK.bianco
        ctx.beginPath(); ctx.ellipse(cx - 0.44 * r, cy - 0.3 * r, 0.12 * r, 0.24 * r, 38 * DEG, 0, TAU); ctx.fill()
        ctx.beginPath(); circle(ctx, cx - 0.18 * r, cy - 0.58 * r, 0.065 * r); ctx.fill()
        ctx.restore()
        ctx.beginPath(); p(ctx); ctx.strokeStyle = INK.nero; ctx.lineWidth = LW; ctx.stroke()
      }
      ctx.restore()
    },
  },

  // =========================================================================
  // RIVIERA · printed paper labels
  // =========================================================================
  {
    id: 'rimini', name: 'Rimini', category: 'riviera',
    w: 1024, h: 1024, size: 0.08, finish: 'carta', border: true,
    draw(ctx, w, h) {
      const cx = 512, cy = 512, I = LITHO
      paperLabel(ctx, w, h, (c) => circle(c, cx, cy, 468), { seed: hash('rimini') }, (ctx, P) => {
        // ---- scene
        ctx.save()
        ctx.beginPath(); circle(ctx, cx, cy, 306); ctx.clip()
        const HZ = 566, SX = 604
        // sun rays
        ctx.fillStyle = I.giallo
        ctx.beginPath()
        for (let k = 0; k < 12; k++) {
          const a = Math.PI + ((k + 0.5) * Math.PI) / 12
          const hw = 3.4 * DEG
          ctx.moveTo(...pol(SX, HZ, 148, a - hw * 0.5)); ctx.lineTo(...pol(SX, HZ, 600, a - hw))
          ctx.lineTo(...pol(SX, HZ, 600, a + hw)); ctx.lineTo(...pol(SX, HZ, 148, a + hw * 0.5)); ctx.closePath()
        }
        ctx.fill()
        ctx.beginPath(); circle(ctx, SX, HZ, 116); ctx.fill()
        // sea
        knock(ctx, P, (c) => c.fillRect(0, HZ, w, 120))
        ctx.fillStyle = I.azzurro; ctx.fillRect(0, HZ, w, 120)
        // sun glitter on the water
        knock(ctx, P, (c) => {
          c.lineWidth = 9; c.lineCap = 'round'; c.beginPath()
          for (const [yy, hw] of [[HZ + 18, 92], [HZ + 40, 66], [HZ + 62, 44], [HZ + 84, 26]]) { c.moveTo(SX - hw, yy); c.lineTo(SX + hw, yy) }
          c.stroke()
        })
        ctx.strokeStyle = I.giallo; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath()
        for (const [yy, hw] of [[HZ + 18, 92], [HZ + 40, 66], [HZ + 62, 44], [HZ + 84, 26]]) { ctx.moveTo(SX - hw, yy); ctx.lineTo(SX + hw, yy) }
        ctx.stroke()
        // waves
        ctx.strokeStyle = I.blu; ctx.lineWidth = 6
        ctx.beginPath()
        for (const [x0, yy, n] of [[236, HZ + 34, 3], [372, HZ + 70, 4], [700, HZ + 52, 3], [262, HZ + 100, 3]]) {
          ctx.moveTo(x0, yy)
          for (let i = 0; i < n; i++) ctx.quadraticCurveTo(x0 + i * 32 + 16, yy - 9, x0 + i * 32 + 32, yy)
        }
        ctx.stroke()
        // Adriatic fishing boat with a painted lug sail (vela al terzo)
        const bx = 384, by = HZ + 20
        const sail = [[bx - 30, by - 112], [bx + 56, by - 176], [bx + 70, by - 24], [bx - 34, by - 30]]
        knock(ctx, P, (c) => { c.beginPath(); poly(c, sail, 5); c.fill() })
        ctx.fillStyle = I.rosso
        ctx.beginPath(); poly(ctx, sail, 5); ctx.fill()
        // the family emblem painted on the sail: a sun
        knock(ctx, P, (c) => { c.beginPath(); circle(c, bx + 18, by - 86, 22); c.fill() })
        ctx.fillStyle = I.giallo; ctx.beginPath(); circle(ctx, bx + 18, by - 86, 22); ctx.fill()
        ctx.strokeStyle = I.blu; ctx.lineWidth = 6
        ctx.beginPath(); ctx.moveTo(bx - 4, by - 138); ctx.lineTo(bx - 2, by - 4); ctx.stroke()
        ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(bx - 34, by - 106); ctx.lineTo(bx + 60, by - 180); ctx.stroke()
        ctx.fillStyle = I.blu
        ctx.beginPath(); ctx.moveTo(bx - 70, by - 16); ctx.quadraticCurveTo(bx, by + 20, bx + 80, by - 18); ctx.lineTo(bx + 64, by + 4); ctx.quadraticCurveTo(bx, by + 24, bx - 56, by + 4); ctx.closePath(); ctx.fill()
        // beach
        const BY = HZ + 118
        knock(ctx, P, (c) => c.fillRect(0, BY, w, 300))
        ctx.fillStyle = I.giallo
        halftone(ctx, 180, BY, 850, 830, { step: 11, angle: 45 * DEG, r: (x, y) => 2.1 + 2.6 * clamp((y - BY) / 170) })
        // umbrellas
        umbrella(ctx, P, { x: 404, y: BY + 34, span: 168, hgt: 58, rot: 5 * DEG, gores: 6, color: I.blu, pole: 7, poleColor: I.blu, poleLen: 88, line: I.blu, lw: 4 })
        umbrella(ctx, P, { x: 640, y: BY + 58, span: 290, hgt: 104, rot: -7 * DEG, gores: 8, color: I.rosso, pole: 10, poleColor: I.blu, poleLen: 160, line: I.rosso, lw: 5 })
        ctx.restore()
        // ---- ring
        misreg(ctx, 2.2, 1.4, (ctx) => {
          ctx.fillStyle = I.blu
          ctx.beginPath(); ring(ctx, cx, cy, 322, 450); ctx.fill()
          knock(ctx, P, (c) => {
            const fam = 'Bowlby One SC'
            let fs = sizeForCap(c, fam, 82)
            c.font = F(fs, fam)
            arcText(c, 'RIMINI', cx, cy, 386, { side: 'top', tracking: 0.12 * fs })
            fs = sizeForCap(c, fam, 38)
            c.font = F(fs, fam)
            arcText(c, 'RIVIERA ADRIATICA', cx, cy, 386, { side: 'bottom', tracking: 0.2 * fs })
            for (const a of [0, Math.PI]) {
              const [sx, sy] = pol(cx, cy, 386, a)
              c.beginPath(); poly(c, starPoints(sx, sy, 22, 9, 5, -Math.PI / 2), 1.5); c.fill()
            }
          })
        })
      })
    },
  },
  {
    id: 'portofino', name: 'Portofino', category: 'riviera',
    w: 880, h: 1024, size: 0.075, finish: 'carta', border: true,
    draw(ctx, w, h) {
      const I = LITHO
      const L = 46, Rt = w - 46, T = 44
      const shield = (c) => {
        const r = 36
        c.moveTo(L + r, T); c.lineTo(Rt - r, T); c.arcTo(Rt, T, Rt, T + r, r)
        c.lineTo(Rt, 560)
        c.bezierCurveTo(Rt, 772, 640, 906, w / 2, 982)
        c.bezierCurveTo(240, 906, L, 772, L, 560)
        c.lineTo(L, T + r); c.arcTo(L, T, L + r, T, r)
        c.closePath()
      }
      paperLabel(ctx, w, h, shield, { seed: hash('portofino') }, (ctx, P) => {
        const HB = 224, Q = 704
        // sky: a fine, light blue screen
        ctx.fillStyle = I.blu
        halftone(ctx, 0, HB, w, Q, { step: 8, angle: 15 * DEG, r: (x, y) => 1.05 + 0.75 * clamp(1 - (y - HB) / 260) })
        // the promontory
        const hill = (c) => {
          c.moveTo(-10, 452)
          c.bezierCurveTo(160, 400, 330, 360, 470, 330)
          c.bezierCurveTo(560, 316, 640, 288, 720, 294)
          c.bezierCurveTo(800, 300, 850, 318, w + 10, 336)
          c.lineTo(w + 10, Q); c.lineTo(-10, Q); c.closePath()
        }
        knock(ctx, P, (c) => { c.beginPath(); hill(c); c.fill() })
        ctx.fillStyle = I.verde; ctx.beginPath(); hill(ctx); ctx.fill()
        // umbrella pines along the ridge
        const pines = [[118, 426, 1.0, -5], [426, 346, 0.9, 7], [566, 326, 0.8, -6]]
        const canopy = (c, tx, ty, s) => {
          c.moveTo(tx - 64 * s, ty)
          c.bezierCurveTo(tx - 70 * s, ty - 22 * s, tx - 44 * s, ty - 36 * s, tx - 22 * s, ty - 31 * s)
          c.bezierCurveTo(tx - 12 * s, ty - 46 * s, tx + 18 * s, ty - 47 * s, tx + 28 * s, ty - 33 * s)
          c.bezierCurveTo(tx + 50 * s, ty - 38 * s, tx + 74 * s, ty - 20 * s, tx + 66 * s, ty)
          c.quadraticCurveTo(tx, ty + 12 * s, tx - 64 * s, ty)
          c.closePath()
        }
        for (const [tx, ty, s, lean] of pines) {
          const top = ty - 44 * s
          ctx.strokeStyle = I.verde; ctx.lineWidth = 10 * s; ctx.lineCap = 'round'
          ctx.beginPath(); ctx.moveTo(tx, ty + 8); ctx.quadraticCurveTo(tx + lean * 0.4, ty - 22 * s, tx + lean, top + 4); ctx.stroke()
          knock(ctx, P, (c) => { c.beginPath(); canopy(c, tx + lean, top, s); c.fill() })
          ctx.fillStyle = I.verde; ctx.beginPath(); canopy(ctx, tx + lean, top, s); ctx.fill()
        }
        // San Giorgio on the headland: ochre walls, red roofs
        const church = (c) => {
          c.rect(700, 258, 28, 48)
          c.rect(628, 276, 74, 30)
        }
        const roofs = (c) => {
          c.moveTo(696, 260); c.lineTo(714, 234); c.lineTo(732, 260); c.closePath()
          c.moveTo(622, 278); c.lineTo(664, 256); c.lineTo(706, 278); c.closePath()
        }
        knock(ctx, P, (c) => { c.beginPath(); church(c); roofs(c); c.fill() })
        ctx.fillStyle = I.giallo; ctx.beginPath(); church(ctx); ctx.fill()
        ctx.fillStyle = I.rosso; ctx.beginPath(); roofs(ctx); ctx.fill()
        knock(ctx, P, (c) => { c.fillRect(708, 268, 12, 16); c.fillRect(657, 284, 14, 18) })
        ctx.fillStyle = I.verde; ctx.fillRect(708, 268, 12, 16); ctx.fillRect(657, 284, 14, 18)
        // the houses of the piazzetta
        const houses = [
          [70, 98, 300, 'giallo'], [168, 112, 368, 'rosso'], [280, 88, 290, 'carta'], [368, 118, 338, 'arancio'],
          [486, 94, 392, 'rosa'], [580, 106, 310, 'giallo'], [686, 124, 350, 'rosso'],
        ]
        for (const [hx, hw, hh, col] of houses) {
          const top = Q - hh
          knock(ctx, P, (c) => c.fillRect(hx, top, hw, hh))
          if (col === 'giallo' || col === 'arancio') { ctx.fillStyle = I.giallo; ctx.fillRect(hx, top, hw, hh) }
          if (col === 'rosso') { ctx.fillStyle = I.rosso; ctx.fillRect(hx, top, hw, hh) }
          if (col === 'arancio' || col === 'rosa') {
            ctx.save(); ctx.beginPath(); ctx.rect(hx, top, hw, hh); ctx.clip()
            ctx.fillStyle = I.rosso
            halftone(ctx, hx, top, hx + hw, Q, { step: 9, angle: 75 * DEG, r: () => (col === 'arancio' ? 3.1 : 2.5) })
            ctx.restore()
          }
          // cornice (same ink twice reads darker) or a blue line on the paper house
          if (col === 'carta') { ctx.fillStyle = I.blu; ctx.fillRect(hx, top, hw, 8) }
          else { ctx.fillStyle = col === 'rosso' ? I.rosso : I.giallo; ctx.fillRect(hx - 3, top, hw + 6, 13) }
          // green shutters, knocked out so they print true
          const cols = hw > 105 ? 3 : 2
          const gx = hw / cols
          const shutters = (c) => {
            for (let yy = top + 40; yy < Q - 90; yy += 62) {
              for (let i = 0; i < cols; i++) c.rect(hx + gx * i + gx / 2 - 9, yy, 18, 32)
            }
          }
          knock(ctx, P, (c) => { c.beginPath(); shutters(c); c.fill() })
          ctx.fillStyle = I.verde; ctx.beginPath(); shutters(ctx); ctx.fill()
          // arcade door
          const dw = 30, dx = hx + hw / 2 - dw / 2
          const door = (c) => { c.moveTo(dx, Q); c.lineTo(dx, Q - 44); c.arc(dx + dw / 2, Q - 44, dw / 2, Math.PI, 0); c.lineTo(dx + dw, Q); c.closePath() }
          knock(ctx, P, (c) => { c.beginPath(); door(c); c.fill() })
          ctx.fillStyle = I.blu; ctx.beginPath(); door(ctx); ctx.fill()
        }
        // quay + water
        knock(ctx, P, (c) => c.fillRect(0, Q, w, 400))
        ctx.fillStyle = I.blu; ctx.fillRect(0, Q + 18, w, 400)
        // reflections
        for (const [hx, hw, , col] of houses) {
          if (col === 'carta') continue
          const ink = col === 'rosso' || col === 'rosa' ? I.rosso : I.giallo
          for (let j = 0; j < 4; j++) {
            const yy = Q + 40 + j * 30, inset = 10 + j * 9 + ((hx * 7) % 13)
            knock(ctx, P, (c) => c.fillRect(hx + inset, yy, hw - inset * 2, 10))
            ctx.fillStyle = ink; ctx.fillRect(hx + inset, yy, hw - inset * 2, 10)
          }
        }
        // sailing boat
        const bx = 610, by = 866
        knock(ctx, P, (c) => {
          c.beginPath(); c.moveTo(bx, by - 196); c.lineTo(bx, by - 26); c.lineTo(bx + 104, by - 26); c.closePath(); c.fill()
          c.beginPath(); c.moveTo(bx - 10, by - 176); c.lineTo(bx - 10, by - 30); c.lineTo(bx - 82, by - 30); c.closePath(); c.fill()
        })
        const hull = (c) => { c.moveTo(bx - 110, by - 20); c.lineTo(bx + 130, by - 20); c.lineTo(bx + 104, by + 8); c.lineTo(bx - 90, by + 8); c.closePath() }
        knock(ctx, P, (c) => { c.beginPath(); hull(c); c.fill() })
        ctx.fillStyle = I.rosso; ctx.beginPath(); hull(ctx); ctx.fill()
        // mast
        ctx.strokeStyle = I.blu; ctx.lineWidth = 5; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(bx - 5, by - 204); ctx.lineTo(bx - 5, by - 22); ctx.stroke()
        // title band + frame
        misreg(ctx, 1.8, -1.6, (ctx) => {
          ctx.fillStyle = I.blu; ctx.fillRect(0, 0, w, HB)
          knock(ctx, P, (c) => {
            const fam = 'DM Serif Display'
            const fs = fitFont(c, 'PORTOFINO', fam, 640, 84, { tracking: 0.06 })
            c.font = F(fs, fam)
            text(c, 'PORTOFINO', w / 2, 158, { tracking: 0.06 * fs })
            c.lineWidth = 5
            c.beginPath(); c.moveTo(w / 2 - 150, 188); c.lineTo(w / 2 + 150, 188); c.stroke()
            c.beginPath(); circle(c, w / 2, 188, 7); c.fill()
          })
          ctx.beginPath(); shield(ctx)
          ctx.strokeStyle = I.blu; ctx.lineWidth = 2 * (22 + 12 + 6); ctx.stroke()
          knock(ctx, P, (c) => { c.lineWidth = 2 * (22 + 12); c.stroke() })
          ctx.lineWidth = 2 * 22; ctx.stroke()
        })
      })
    },
  },
  {
    id: 'capri', name: 'Capri', category: 'riviera',
    w: 1024, h: 720, size: 0.08, finish: 'carta', border: true,
    draw(ctx, w, h) {
      const I = LITHO
      const shape = (c) => rrect(c, 42, 32, w - 84, h - 64, 72)
      paperLabel(ctx, w, h, shape, { seed: hash('capri') }, (ctx, P) => {
        const HZ = 436, SX = 618, SY = 352
        // sunset glow: giallo screen getting denser toward the horizon
        ctx.fillStyle = I.giallo
        halftone(ctx, 0, 0, w, HZ, { step: 12, angle: 45 * DEG, r: (x, y) => 5.4 * clamp((y - 50) / (HZ - 50)) ** 1.5 })
        // sun (knocked out of the screen so it prints clean)
        knock(ctx, P, (c) => { c.beginPath(); circle(c, SX, SY, 124); c.fill() })
        ctx.fillStyle = I.arancio; ctx.beginPath(); circle(ctx, SX, SY, 124); ctx.fill()
        // the island and the three Faraglioni: Stella (dome), Mezzo (low, with the arch), Scopolo (spire)
        const B = HZ + 20
        const island = [[-20, 206], [34, 194], [78, 204], [112, 222], [140, 250], [164, 284], [186, 326], [204, 368], [222, 410], [232, B], [-20, B]]
        const stella = [[268, B], [272, 398], [280, 350], [294, 318], [308, 312], [314, 284], [326, 244], [346, 212], [372, 192], [400, 186], [422, 198], [440, 226], [452, 262], [462, 314], [472, 380], [478, B]]
        const mezzo = [[526, B], [530, 376], [542, 330], [562, 300], [590, 280], [632, 272], [666, 280], [690, 302], [704, 338], [712, 390], [716, B]]
        const scopolo = [[766, B], [772, 392], [782, 330], [796, 270], [810, 226], [824, 202], [838, 222], [850, 270], [862, 334], [874, B]]
        const arch = (c) => {
          c.moveTo(610, B + 2); c.lineTo(612, 408)
          c.bezierCurveTo(614, 384, 628, 370, 642, 370)
          c.bezierCurveTo(656, 372, 666, 388, 668, 410)
          c.lineTo(670, B + 2); c.closePath()
        }
        const rocks = (c) => {
          poly(c, island, 8); poly(c, stella, 8); poly(c, mezzo, 8); poly(c, scopolo, 7)
          arch(c)
        }
        knock(ctx, P, (c) => { c.beginPath(); rocks(c); c.fill('evenodd') })
        ctx.fillStyle = I.nero; ctx.beginPath(); rocks(ctx); ctx.fill('evenodd')
        // rims lit by the low sun (knocked out, then orange)
        const rims = (c) => {
          c.moveTo(418, 196); c.bezierCurveTo(440, 218, 458, 262, 466, 330)
          c.moveTo(590, 282); c.bezierCurveTo(610, 274, 640, 270, 664, 280)
          c.moveTo(818, 206); c.bezierCurveTo(808, 232, 796, 274, 786, 330)
        }
        knock(ctx, P, (c) => { c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); rims(c); c.stroke() })
        ctx.strokeStyle = I.arancio; ctx.lineWidth = 7; ctx.lineCap = 'round'
        ctx.beginPath(); rims(ctx); ctx.stroke()
        // sea
        knock(ctx, P, (c) => c.fillRect(0, HZ, w, h))
        ctx.fillStyle = I.blu; ctx.fillRect(0, HZ, w, h)
        // a little motorboat slipping through the arch, with its wake
        knock(ctx, P, (c) => {
          c.beginPath(); c.moveTo(626, HZ - 4); c.lineTo(660, HZ - 4); c.lineTo(654, HZ + 5); c.lineTo(630, HZ + 5); c.closePath(); c.fill()
          c.fillRect(634, HZ - 12, 14, 8)
          c.lineWidth = 3; c.lineCap = 'round'; c.beginPath()
          c.moveTo(624, HZ + 4); c.lineTo(592, HZ + 11); c.moveTo(626, HZ + 7); c.lineTo(600, HZ + 18)
          c.stroke()
        })
        // reflection of the sun
        const refl = [[HZ + 16, 110], [HZ + 38, 84], [HZ + 60, 94], [HZ + 84, 60], [HZ + 108, 70], [HZ + 134, 40], [HZ + 160, 30]]
        knock(ctx, P, (c) => { for (const [yy, hw] of refl) { c.beginPath(); rrect(c, SX - hw, yy, hw * 2, 10, 5); c.fill() } })
        ctx.fillStyle = I.giallo
        for (const [yy, hw] of refl) { ctx.beginPath(); rrect(ctx, SX - hw, yy, hw * 2, 10, 5); ctx.fill() }
        // rock shadows on the water
        ctx.fillStyle = I.nero
        for (const [x0, x1] of [[-20, 226], [274, 472], [530, 610], [670, 712], [772, 868]]) ctx.fillRect(x0 + 8, HZ, x1 - x0 - 16, 6)
        // sparkles
        knock(ctx, P, (c) => {
          c.lineWidth = 5; c.lineCap = 'round'; c.beginPath()
          for (const [x0, yy, l] of [[120, HZ + 34, 50], [250, HZ + 24, 30], [806, HZ + 40, 46], [884, HZ + 84, 30], [760, HZ + 118, 40], [420, HZ + 60, 26]]) { c.moveTo(x0, yy); c.lineTo(x0 + l, yy) }
          c.stroke()
        })
        // title: caps knocked out of the sea, standing on a solid yellow block shade
        const fam = 'DM Serif Display'
        const trk = 0.1
        const fs = fitFont(ctx, 'CAPRI', fam, 360, 118, { tracking: trk })
        ctx.font = F(fs, fam)
        const tx = 108, ty = 604, depth = Math.round(fs * 0.075)
        const cap = (c, ox, oy) => text(c, 'CAPRI', tx + ox, ty + oy, { tracking: trk * fs, align: 'left' })
        knock(ctx, P, (c) => { c.font = F(fs, fam); for (let i = 1; i <= depth; i++) cap(c, i, i) })
        // one flat yellow plate (a layer, so overlapping steps don't overprint each other)
        layer(ctx, (l) => { l.font = F(fs, fam); l.fillStyle = I.giallo; for (let i = 1; i <= depth; i++) cap(l, i, i) }, 'multiply')
        knock(ctx, P, (c) => { c.font = F(fs, fam); cap(c, 0, 0) })
        // frame
        misreg(ctx, -1.8, 1.5, (ctx) => {
          ctx.beginPath(); shape(ctx)
          ctx.strokeStyle = I.blu; ctx.lineWidth = 2 * (20 + 11 + 5); ctx.stroke()
          knock(ctx, P, (c) => { c.lineWidth = 2 * (20 + 11); c.stroke() })
          ctx.lineWidth = 2 * 20; ctx.stroke()
        })
      })
    },
  },
  {
    id: 'venezia', name: 'Venezia', category: 'riviera',
    w: 800, h: 1024, size: 0.08, finish: 'carta', border: true,
    draw(ctx, w, h) {
      const I = LITHO
      const cx = w / 2
      const arch = (c) => {
        const L = 52, R = w - 52, B = 982, S = 430, r = 40
        c.moveTo(cx, 44)
        c.bezierCurveTo(cx + 6, 200, R, 250, R, S)
        c.lineTo(R, B - r); c.arcTo(R, B, R - r, B, r)
        c.lineTo(L + r, B); c.arcTo(L, B, L, B - r, r)
        c.lineTo(L, S)
        c.bezierCurveTo(L, 250, cx - 6, 200, cx, 44)
        c.closePath()
      }
      paperLabel(ctx, w, h, arch, { seed: hash('venezia') }, (ctx, P) => {
        const WL = 690, AR = 214 // waterline, half-span of the arch
        // sunset glow + sun
        ctx.fillStyle = I.arancio
        halftone(ctx, 0, 100, w, WL, { step: 11, angle: 45 * DEG, r: (x, y) => 4.6 * clamp((y - 230) / 420) ** 1.25 })
        knock(ctx, P, (c) => { c.beginPath(); circle(c, cx + 64, 318, 86); c.fill() })
        ctx.fillStyle = I.arancio; ctx.beginPath(); circle(ctx, cx + 64, 318, 86); ctx.fill()
        // distant skyline in a teal tint: the campanile and the domes of the Salute
        const skyline = (c) => {
          c.rect(304, 338, 42, 222) // shaft
          c.rect(298, 300, 54, 40) // belfry
          c.rect(304, 280, 42, 22) // attic
          c.moveTo(302, 282); c.lineTo(325, 222); c.lineTo(348, 282); c.closePath() // spire
          c.rect(496, 470, 128, 90) // drum
          c.moveTo(496, 472); c.ellipse(560, 472, 64, 60, 0, Math.PI, 0); c.closePath()
          c.rect(552, 390, 16, 26); c.moveTo(569, 392); c.arc(560, 392, 9, 0, TAU)
          c.rect(640, 494, 64, 70)
          c.moveTo(640, 496); c.ellipse(672, 496, 32, 32, 0, Math.PI, 0); c.closePath()
          c.rect(667, 450, 10, 18)
          c.rect(-10, 524, 314, 40); c.rect(346, 516, 150, 44); c.rect(624, 530, 190, 30)
        }
        knock(ctx, P, (c) => { c.beginPath(); skyline(c); c.fill() })
        ctx.save(); ctx.beginPath(); skyline(ctx); ctx.clip()
        ctx.fillStyle = I.laguna
        halftone(ctx, -10, 190, w + 10, 570, { step: 8, angle: 15 * DEG, r: () => 2.35 })
        ctx.restore()
        // far canal seen through the arch
        const far = (c) => { for (const [x0, x1, hh] of [[186, 236, 34], [236, 300, 50], [300, 348, 28], [348, 420, 44], [420, 470, 30], [470, 540, 52], [540, 614, 36]]) c.rect(x0, 658 - hh, x1 - x0, hh) }
        knock(ctx, P, (c) => { c.beginPath(); far(c); c.fill() })
        ctx.save(); ctx.beginPath(); far(ctx); ctx.clip()
        ctx.fillStyle = I.laguna
        halftone(ctx, 180, 590, 620, 660, { step: 8, angle: 15 * DEG, r: () => 3.0 })
        ctx.restore()
        knock(ctx, P, (c) => c.fillRect(180, 658, 440, 34))
        ctx.fillStyle = I.laguna
        ctx.fillRect(180, 658, 440, 5)
        halftone(ctx, 180, 666, 620, WL, { step: 8, angle: 45 * DEG, r: () => 1.5 })
        // the bridge
        const bridge = (c) => {
          c.moveTo(-10, 560)
          c.quadraticCurveTo(cx, 470, w + 10, 560)
          c.lineTo(w + 10, WL); c.lineTo(cx + AR, WL)
          c.bezierCurveTo(cx + AR, 560, cx - AR, 560, cx - AR, WL)
          c.lineTo(-10, WL); c.closePath()
        }
        knock(ctx, P, (c) => { c.beginPath(); bridge(c); c.fill() })
        ctx.fillStyle = I.laguna; ctx.beginPath(); bridge(ctx); ctx.fill()
        // parapet line + the ring of the arch
        knock(ctx, P, (c) => {
          c.lineWidth = 6; c.beginPath(); c.moveTo(-10, 580); c.quadraticCurveTo(cx, 490, w + 10, 580); c.stroke()
          c.lineWidth = 5; c.beginPath(); c.moveTo(cx + AR + 18, WL); c.bezierCurveTo(cx + AR + 18, 538, cx - AR - 18, 538, cx - AR - 18, WL); c.stroke()
        })
        // water
        knock(ctx, P, (c) => c.fillRect(0, WL, w, 400))
        ctx.fillStyle = I.laguna
        ctx.save(); ctx.beginPath(); ctx.rect(0, WL, w, 400); ctx.clip()
        halftone(ctx, 0, WL, w, 900, { step: 10, angle: 45 * DEG, r: (x, y) => 2.0 + 1.7 * clamp((y - WL) / 170) })
        ctx.restore()
        // reflection of the bridge: the arch mirrored, broken by ripples
        ctx.fillStyle = I.laguna
        const rise = WL - 592
        for (let j = 0; j < 6; j++) {
          const d = 6 + j * 17
          const half = d < rise ? AR * Math.sqrt(1 - (d / rise) ** 2) : 0
          const wob = (j % 2 ? 1 : -1) * 6
          ctx.fillRect(-10, WL + d, cx - half + 10 + wob, 8)
          ctx.fillRect(cx + half + wob, WL + d, cx, 8)
        }
        // gondola, trapped with a hair of paper where it crosses the bridge
        const gx = 400, gy = 794, gs = 0.9
        knock(ctx, P, (c) => { c.save(); c.translate(gx, gy); c.scale(gs, gs); gondola(c, 3); c.restore() })
        ctx.save(); ctx.translate(gx, gy); ctx.scale(gs, gs)
        ctx.fillStyle = I.nero; ctx.strokeStyle = I.nero
        gondola(ctx, 0)
        ctx.restore()
        ctx.fillStyle = I.nero
        const ripples = [[30, [[-236, -128], [-104, 36], [60, 222]]], [46, [[-176, -70], [-44, 84], [106, 168]]], [61, [[-104, -24], [8, 98]]]]
        for (const [yy, segs] of ripples) for (const [a, b] of segs) ctx.fillRect(gx + a * gs, gy + yy, (b - a) * gs, 6)
        // title band + frame
        misreg(ctx, 1.6, 1.8, (ctx) => {
          knock(ctx, P, (c) => c.fillRect(0, 856, w, 220))
          ctx.fillStyle = I.laguna
          ctx.fillRect(0, 856, w, 5)
          ctx.fillRect(0, 870, w, 200)
          knock(ctx, P, (c) => {
            const fam = 'DM Serif Display'
            const fs = fitFont(c, 'VENEZIA', fam, 470, 48, { tracking: 0.2 })
            c.font = F(fs, fam)
            text(c, 'VENEZIA', cx, 908 + capOf(c) / 2, { tracking: 0.2 * fs })
          })
          ctx.beginPath(); arch(ctx)
          ctx.strokeStyle = I.laguna; ctx.lineWidth = 2 * (20 + 11 + 5); ctx.stroke()
          knock(ctx, P, (c) => { c.lineWidth = 2 * (20 + 11); c.stroke() })
          ctx.lineWidth = 2 * 20; ctx.stroke()
        })
      })
    },
  },

  // =========================================================================
  // RETRÒ
  // =========================================================================
  {
    id: 'numero-7', name: 'Numero 7', category: 'retro',
    w: 1024, h: 1024, size: 0.07, finish: 'lucido', border: true,
    draw(ctx) {
      const cx = 512, cy = 512
      ctx.fillStyle = INK.rosso; ctx.beginPath(); circle(ctx, cx, cy, 466); ctx.fill()
      ctx.strokeStyle = INK.bianco; ctx.lineWidth = 9; ctx.beginPath(); circle(ctx, cx, cy, 428); ctx.stroke()
      ctx.fillStyle = INK.bianco; ctx.beginPath(); circle(ctx, cx, cy, 384); ctx.fill()
      const fam = 'Alfa Slab One'
      ctx.font = F(100, fam)
      let m = ctx.measureText('7')
      const k = 500 / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)
      ctx.font = F(100 * k, fam)
      m = ctx.measureText('7')
      const x = cx - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 - 6
      const y = cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 - 4
      ctx.fillStyle = INK.nero
      ctx.fillText('7', x, y)
    },
  },
  {
    id: 'scacchi', name: 'Scacchi', category: 'retro',
    w: 1024, h: 1024, size: 0.06, finish: 'lucido', border: true,
    draw(ctx) {
      const LW = 15
      const PX = 176, PW = 36
      const fx0 = PX + PW / 2 - 4, fy0 = 118, FW = 742, FH = 436
      const cols = 6, rows = 4
      const ph = (u) => TAU * 1.05 * u - 0.5
      const warp = (u, v) => {
        const a = ph(u), amp = 44 * Math.pow(u, 0.9)
        return [fx0 + u * FW - 18 * Math.sin(a) * u, fy0 + v * FH + amp * Math.sin(a) + v * u * 26]
      }
      const edge = (c) => {
        const S = 60
        for (let i = 0; i <= S; i++) { const p = warp(i / S, 0); i ? c.lineTo(...p) : c.moveTo(...p) }
        for (let i = 0; i <= S; i++) c.lineTo(...warp(1, i / S))
        for (let i = S; i >= 0; i--) c.lineTo(...warp(i / S, 1))
        for (let i = S; i >= 0; i--) c.lineTo(...warp(0, i / S))
        c.closePath()
      }
      // lean the whole flag back a touch: it reads as waving, not standing
      ctx.save()
      ctx.translate(510, 514); ctx.rotate(-7 * DEG); ctx.scale(0.95, 0.95); ctx.translate(-530, -522)
      // pole
      const pole = (c) => rrect(c, PX - PW / 2, 96, PW, 842, PW / 2)
      inked(ctx, pole, INK.rosso, INK.nero, LW)
      // flag
      ctx.beginPath(); edge(ctx)
      ctx.strokeStyle = INK.nero; ctx.lineWidth = LW * 2; ctx.lineJoin = 'round'; ctx.stroke()
      ctx.fillStyle = INK.bianco; ctx.fill()
      ctx.save(); ctx.clip()
      const SUB = 10
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const black = (i + j) % 2 === 0
          for (let s = 0; s < SUB; s++) {
            const u0 = (i + s / SUB) / cols, u1 = (i + (s + 1) / SUB) / cols
            const v0 = j / rows, v1 = (j + 1) / rows
            const shade = Math.cos(ph((u0 + u1) / 2))
            if (black) ctx.fillStyle = INK.nero
            else ctx.fillStyle = shade < -0.25 ? '#D9D4CA' : INK.bianco
            if (!black && ctx.fillStyle === INK.bianco.toLowerCase()) continue
            ctx.beginPath()
            ctx.moveTo(...warp(u0, v0)); ctx.lineTo(...warp(u1, v0)); ctx.lineTo(...warp(u1, v1)); ctx.lineTo(...warp(u0, v1)); ctx.closePath()
            ctx.fill()
            ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.2; ctx.stroke()
          }
        }
      }
      ctx.restore()
      ctx.beginPath(); edge(ctx); ctx.strokeStyle = INK.nero; ctx.lineWidth = LW; ctx.stroke()
      // finial
      inked(ctx, (c) => circle(c, PX, 82, 40), INK.giallo, INK.nero, LW)
      ctx.restore()
    },
  },
  {
    id: 'prezzo', name: 'Prezzo', category: 'retro',
    w: 1024, h: 560, size: 0.05, finish: 'carta', border: true,
    draw(ctx, w, h) {
      const tag = [[168, 40], [982, 40], [982, 520], [168, 520], [44, 350], [44, 210]]
      const HX = 136, HY = 280, HR = 34
      const shape = (c) => { poly(c, tag, [26, 26, 26, 26, 30, 30]); circle(c, HX, HY, HR, true) }
      paperLabel(ctx, w, h, shape, { seed: hash('prezzo'), base: '#F4C24A', voids: 0.8 }, (ctx, P) => {
        // reinforcement ring around the hole
        ctx.strokeStyle = '#D9A12E'; ctx.lineWidth = 14
        ctx.beginPath(); circle(ctx, HX, HY, HR + 10); ctx.stroke()
        misreg(ctx, 1.6, 1.2, (ctx) => {
          ctx.strokeStyle = INK.nero; ctx.lineWidth = 7
          const inner = tag.map(([x, y]) => [x, y])
          inner[0] = [186, 66]; inner[1] = [956, 66]; inner[2] = [956, 494]; inner[3] = [186, 494]; inner[4] = [74, 344]; inner[5] = [74, 216]
          ctx.beginPath(); poly(ctx, inner, [16, 16, 16, 16, 20, 20]); ctx.stroke()
          ctx.fillStyle = INK.nero
          let fs = sizeForCap(ctx, 'Space Mono', 34, 700)
          ctx.font = F(fs, 'Space Mono', 700)
          text(ctx, 'PREZZO', 236, 146, { tracking: 0.3 * fs, align: 'left' })
          text(ctx, 'N° 0417', 916, 146, { tracking: 0.08 * fs, align: 'right' })
          fs = fitFont(ctx, 'L. 29.900', 'Space Mono', 680, 150, { weight: 700, tracking: -0.02 })
          ctx.font = F(fs, 'Space Mono', 700)
          text(ctx, 'L. 29.900', 576, 352, { tracking: -0.02 * fs })
          fs = sizeForCap(ctx, 'Space Mono', 26, 700)
          ctx.font = F(fs, 'Space Mono', 700)
          text(ctx, 'IVA COMPRESA', 236, 450, { tracking: 0.22 * fs, align: 'left' })
        })
        ctx.fillStyle = LITHO.rosso
        ctx.fillRect(236, 388, 680, 12)
        ctx.beginPath(); poly(ctx, starPoints(900, 440, 30, 13), 2); ctx.fill()
      })
    },
  },
  {
    id: 'super', name: 'Super', category: 'retro',
    w: 1024, h: 380, size: 0.08, finish: 'foil', border: true,
    draw(ctx, w, h) { drawSuper(ctx, w, h, false) },
    foil(ctx, w, h) { drawSuper(ctx, w, h, true) },
  },
  {
    id: 'caffe', name: 'Caffè', category: 'retro',
    w: 860, h: 1024, size: 0.055, finish: 'opaco', border: true,
    draw(ctx, w, h) {
      const cx = w / 2, L = 60, R = w - 60, T = 46, B = 980, r = 56
      const arch = (c) => {
        const rr = (R - L) / 2
        c.moveTo(L, T + rr); c.arc(cx, T + rr, rr, Math.PI, 0)
        c.lineTo(R, B - r); c.arcTo(R, B, R - r, B, r); c.lineTo(L + r, B); c.arcTo(L, B, L, B - r, r); c.closePath()
      }
      ctx.save()
      ctx.beginPath(); arch(ctx); ctx.fillStyle = INK.nero; ctx.fill()
      ctx.clip()
      ctx.strokeStyle = INK.crema; ctx.lineWidth = 2 * (26 + 8); ctx.stroke()
      ctx.strokeStyle = INK.nero; ctx.lineWidth = 2 * 26; ctx.stroke()
      ctx.restore()
      const U = -34 // lift the whole still life a little
      // steam: three parallel wisps, pointed at both ends
      ctx.fillStyle = INK.crema
      for (const [x0, top, wd] of [[cx - 84, 262, 26], [cx, 196, 32], [cx + 84, 250, 26]]) {
        ctx.beginPath()
        taper(ctx, (t) => [x0 + 24 * Math.sin(t * TAU * 0.95 - 0.4), lerp(452 + U, top + U, t)], (t) => wd * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8), 96)
        ctx.fill()
      }
      // saucer
      ctx.fillStyle = INK.crema
      ctx.beginPath(); ctx.ellipse(cx, 742 + U, 300, 52, 0, 0, TAU); ctx.fill()
      ctx.strokeStyle = INK.rosso; ctx.lineWidth = 12
      ctx.beginPath(); ctx.ellipse(cx, 742 + U, 294, 46, 0, 0.05 * Math.PI, 0.95 * Math.PI); ctx.stroke()
      ctx.strokeStyle = INK.nero; ctx.lineWidth = 7
      ctx.beginPath(); ctx.ellipse(cx, 728 + U, 150, 18, 0, 0, TAU); ctx.stroke()
      // handle
      ctx.strokeStyle = INK.crema; ctx.lineWidth = 34
      ctx.beginPath(); ctx.moveTo(cx + 170, 548 + U); ctx.bezierCurveTo(cx + 290, 540 + U, cx + 280, 670 + U, cx + 132, 652 + U); ctx.stroke()
      // cup body
      const cup = (c) => {
        c.moveTo(cx - 206, 520 + U)
        c.bezierCurveTo(cx - 200, 640 + U, cx - 150, 720 + U, cx - 90, 730 + U)
        c.lineTo(cx + 90, 730 + U)
        c.bezierCurveTo(cx + 150, 720 + U, cx + 200, 640 + U, cx + 206, 520 + U)
        c.closePath()
      }
      ctx.fillStyle = INK.crema; ctx.beginPath(); cup(ctx); ctx.fill()
      ctx.save(); ctx.beginPath(); cup(ctx); ctx.clip()
      ctx.strokeStyle = INK.rosso; ctx.lineWidth = 26
      ctx.beginPath(); ctx.ellipse(cx, 540 + U, 240, 44, 0, 0, Math.PI); ctx.stroke()
      ctx.restore()
      // rim + coffee
      ctx.fillStyle = INK.crema; ctx.beginPath(); ctx.ellipse(cx, 520 + U, 206, 40, 0, 0, TAU); ctx.fill()
      ctx.fillStyle = '#3B2418'; ctx.beginPath(); ctx.ellipse(cx, 522 + U, 184, 28, 0, 0, TAU); ctx.fill()
      // word
      const fam = 'Righteous'
      const fs = fitFont(ctx, 'CAFFÈ', fam, 540, 104, { tracking: 0.1 })
      ctx.font = F(fs, fam)
      ctx.fillStyle = INK.crema
      text(ctx, 'CAFFÈ', cx, 924, { tracking: 0.1 * fs })
    },
  },
  {
    id: 'ciao', name: 'Ciao!', category: 'retro',
    w: 1024, h: 860, size: 0.06, finish: 'lucido', border: true,
    draw(ctx) {
      const LW = 17
      const bubble = (c) => { c.moveTo(956, 390); c.ellipse(522, 390, 434, 318, 0, 0, TAU) }
      const tail = (c) => {
        c.moveTo(262, 600)
        c.quadraticCurveTo(232, 716, 126, 800)
        c.quadraticCurveTo(300, 772, 430, 676)
        c.closePath()
      }
      ctx.lineJoin = 'round'
      ctx.strokeStyle = INK.nero; ctx.lineWidth = LW * 2
      ctx.beginPath(); bubble(ctx); ctx.stroke()
      ctx.beginPath(); tail(ctx); ctx.stroke()
      ctx.fillStyle = INK.rosa
      ctx.beginPath(); bubble(ctx); ctx.fill()
      ctx.beginPath(); tail(ctx); ctx.fill()
      // glint
      ctx.strokeStyle = INK.bianco; ctx.lineWidth = 22; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.ellipse(522, 390, 366, 252, 0, 1.08 * Math.PI, 1.3 * Math.PI); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(522, 390, 366, 252, 0, 1.36 * Math.PI, 1.42 * Math.PI); ctx.stroke()
      // word
      ctx.save()
      ctx.translate(532, 400); ctx.rotate(-6 * DEG)
      const fam = 'Bagel Fat One'
      const fs = fitFont(ctx, 'Ciao!', fam, 600, 330, { script: true })
      ctx.font = F(fs, fam)
      const m = ctx.measureText('Ciao!')
      const ty = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
      ctx.fillStyle = INK.nero; ctx.strokeStyle = INK.nero; ctx.lineWidth = 26
      text(ctx, 'Ciao!', 12, ty + 14, { mode: 'both' })
      strokedText(ctx, 'Ciao!', 0, ty, { fill: INK.bianco, line: INK.nero, lw: 13 })
      ctx.restore()
    },
  },
  {
    id: 'pedala', name: 'Pedala!', category: 'retro',
    w: 1024, h: 1024, size: 0.065, finish: 'lucido', border: true,
    draw(ctx) {
      const cx = 512, cy = 512
      ctx.fillStyle = INK.blu; ctx.beginPath(); circle(ctx, cx, cy, 466); ctx.fill()
      ctx.strokeStyle = INK.crema; ctx.lineWidth = 9
      ctx.beginPath(); circle(ctx, cx, cy, 436); ctx.stroke()
      ctx.beginPath(); circle(ctx, cx, cy, 318); ctx.stroke()
      const fam = 'Bowlby One SC'
      ctx.fillStyle = INK.crema
      let fs = sizeForCap(ctx, fam, 84)
      ctx.font = F(fs, fam)
      arcText(ctx, 'PEDALA!', cx, cy, 377, { side: 'top', tracking: 0.1 * fs })
      ctx.fillStyle = INK.giallo
      fs = sizeForCap(ctx, fam, 40)
      ctx.font = F(fs, fam)
      arcText(ctx, 'SEMPRE AVANTI', cx, cy, 377, { side: 'bottom', tracking: 0.22 * fs })
      for (const a of [0, Math.PI]) {
        const [sx, sy] = pol(cx, cy, 377, a)
        ctx.beginPath(); poly(ctx, starPoints(sx, sy, 24, 10), 2); ctx.fill()
      }
      // wheel
      ctx.strokeStyle = INK.crema; ctx.lineWidth = 34
      ctx.beginPath(); circle(ctx, cx, cy, 238); ctx.stroke()
      ctx.strokeStyle = INK.giallo; ctx.lineWidth = 12
      ctx.beginPath(); circle(ctx, cx, cy, 206); ctx.stroke()
      ctx.lineWidth = 7; ctx.lineCap = 'round'
      ctx.beginPath()
      for (let k = 0; k < 18; k++) {
        const a = (k * TAU) / 18
        ctx.moveTo(...pol(cx, cy, 34, a)); ctx.lineTo(...pol(cx, cy, 204, a + (k % 2 ? 0.18 : -0.18)))
      }
      ctx.stroke()
      ctx.fillStyle = INK.giallo; ctx.beginPath(); circle(ctx, cx, cy, 44); ctx.fill()
      ctx.fillStyle = INK.blu; ctx.beginPath(); circle(ctx, cx, cy, 15); ctx.fill()
      // tyre tread ticks
      ctx.strokeStyle = INK.blu; ctx.lineWidth = 5
      ctx.beginPath()
      for (let k = 0; k < 48; k++) { const a = (k * TAU) / 48; ctx.moveTo(...pol(cx, cy, 246, a)); ctx.lineTo(...pol(cx, cy, 254, a)) }
      ctx.stroke()
    },
  },
]

// gondola silhouette in local space (prow to the right), used by Venezia.
// trap > 0 widens every part (paper knockout pass).
function gondola(c, trap = 0) {
  const T = trap
  c.lineJoin = 'round'
  c.lineCap = 'round'
  const hull = (p) => {
    p.moveTo(-272, -56)
    p.bezierCurveTo(-222, -6, -120, 18, 0, 20)
    p.bezierCurveTo(120, 20, 214, 8, 264, -34)
    p.lineTo(270, -44)
    p.bezierCurveTo(214, -8, 120, 0, 0, 0)
    p.bezierCurveTo(-120, 0, -214, -14, -272, -56)
    p.closePath()
  }
  const fillT = () => { c.fill(); if (T) { c.lineWidth = T * 2; c.stroke() } }
  c.beginPath(); hull(c); fillT()
  // the ferro: an S-shaped blade with six teeth and a curled cap
  const blade = bez([262, -34], [282, -62], [262, -98], [286, -132])
  c.beginPath(); taper(c, blade, (t) => 11 + 6 * t + T * 2); c.fill()
  c.lineWidth = 6 + T * 2
  c.beginPath()
  for (let i = 0; i < 6; i++) { const [px, py] = blade(0.26 + i * 0.12); c.moveTo(px + 4, py); c.lineTo(px + 22, py + 2) }
  c.moveTo(285, -133); c.quadraticCurveTo(302, -138, 308, -124)
  c.moveTo(262, -40); c.lineTo(248, -46)
  c.stroke()
  // the gondolier, standing on the stern
  c.beginPath(); poly(c, [[-214, -150], [-184, -152], [-189, -86], [-209, -86]], 5); fillT()
  c.lineWidth = 15 + T * 2
  c.beginPath(); c.moveTo(-203, -90); c.lineTo(-212, -20); c.moveTo(-195, -90); c.lineTo(-187, -20); c.stroke()
  c.lineWidth = 11 + T * 2
  c.beginPath(); c.moveTo(-190, -146); c.quadraticCurveTo(-172, -136, -160, -118); c.stroke()
  // the oar, blade in the water
  c.beginPath(); taper(c, bez([-172, -146], [-142, -84], [-100, -26], [-56, 38]), (t) => 7 + (t > 0.78 ? (t - 0.78) * 46 : 0) + T * 2); c.fill()
  // head + straw boater
  c.beginPath(); circle(c, -198, -167, 13 + T); c.fill()
  c.beginPath(); c.rect(-220 - T, -181 - T, 44 + T * 2, 6 + T * 2); c.rect(-209 - T, -195 - T, 22 + T * 2, 15 + T * 2); c.fill()
}
