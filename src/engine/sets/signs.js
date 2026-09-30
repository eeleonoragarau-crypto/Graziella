// Shop signs, the marble street plaque and the posters of la città, painted
// on canvases (fonts are the ones the app already ships with @fontsource).
import * as THREE from 'three'

async function fonts() {
  const list = ['400 64px "Bowlby One SC"', '400 64px "DM Serif Display"', '400 64px "Alfa Slab One"', '400 64px "Righteous"', '400 64px "Yellowtail"', '700 64px "Space Mono"']
  try { await Promise.all(list.map((f) => document.fonts.load(f))) } catch (e) { void e }
}

function tex(c, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  return t
}

function noise(g, w, h, amt = 0.06, seed = 3) {
  let s = seed
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  for (let i = 0; i < (w * h) / 60; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${amt * r()})` : `rgba(255,255,255,${amt * r()})`
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2)
  }
}

// fit text in width, letter spaced
function fitText(g, text, x, y, maxW, font, size, spacing = 0) {
  let s = size
  g.font = `${font.replace('SIZE', s)}`
  const measure = () => g.measureText(text).width + spacing * (text.length - 1)
  while (measure() > maxW && s > 8) { s -= 2; g.font = font.replace('SIZE', s) }
  const w = measure()
  let cx = x - w / 2
  for (const ch of text) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + spacing }
  return s
}

const painters = {
  // enamel shop signs, 1024 x 160 (6.4 : 1)
  cicli(g, W, H) {
    g.fillStyle = '#1d3f33'; g.fillRect(0, 0, W, H)
    g.strokeStyle = '#d9c9a0'; g.lineWidth = 6; g.strokeRect(14, 14, W - 28, H - 28)
    g.fillStyle = '#efe3c2'; g.textBaseline = 'middle'
    fitText(g, 'CICLI · RIPARAZIONI', W / 2, H / 2 + 4, W - 120, '400 SIZEpx "Bowlby One SC"', 84, 6)
  },
  tabacchi(g, W, H) {
    g.fillStyle = '#131619'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#f2efe6'; g.textBaseline = 'middle'
    g.fillRect(40, 30, 100, 22); g.fillRect(79, 30, 22, 100)
    fitText(g, 'SALI E TABACCHI', W / 2 + 70, H / 2 + 4, W - 280, '400 SIZEpx "Alfa Slab One"', 80, 4)
  },
  bar(g, W, H) {
    g.fillStyle = '#7d1f1d'; g.fillRect(0, 0, W, H)
    g.strokeStyle = '#f0d9a3'; g.lineWidth = 4; g.strokeRect(12, 12, W - 24, H - 24)
    g.fillStyle = '#f7e9c7'; g.textBaseline = 'middle'
    fitText(g, 'Bar Sport', W / 2, H / 2 + 8, W - 200, '400 SIZEpx "Yellowtail"', 118, 0)
  },
  latteria(g, W, H) {
    g.fillStyle = '#e8e1cf'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#244a7a'; g.textBaseline = 'middle'
    fitText(g, 'LATTERIA', W / 2, H / 2 + 6, W - 160, '400 SIZEpx "DM Serif Display"', 110, 16)
  },
  ferramenta(g, W, H) {
    g.fillStyle = '#2b2b2a'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#e9b949'; g.textBaseline = 'middle'
    fitText(g, 'FERRAMENTA', W / 2, H / 2 + 4, W - 140, '400 SIZEpx "Righteous"', 100, 10)
  },
  alimentari(g, W, H) {
    g.fillStyle = '#f1ead8'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#8c2a1c'; g.textBaseline = 'middle'
    fitText(g, 'ALIMENTARI', W / 2, H / 2 + 6, W - 150, '400 SIZEpx "Bowlby One SC"', 96, 8)
  },
}

export async function signTextures() {
  await fonts()
  const out = {}
  for (const [k, paint] of Object.entries(painters)) {
    const c = document.createElement('canvas')
    c.width = 1024; c.height = 160
    const g = c.getContext('2d')
    paint(g, c.width, c.height)
    noise(g, c.width, c.height, 0.05, k.length * 7)
    out[k] = tex(c)
  }
  return out
}

// Marble street plaque, engraved: 1024 x 340
export async function plaqueTexture(text = 'VIA DEI TINTORI') {
  await fonts()
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 340
  const g = c.getContext('2d')
  const grd = g.createLinearGradient(0, 0, 1024, 340)
  grd.addColorStop(0, '#efece6'); grd.addColorStop(0.5, '#e4e0d8'); grd.addColorStop(1, '#ebe7df')
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 340)
  // veins
  g.strokeStyle = 'rgba(120,120,125,0.18)'; g.lineWidth = 2
  for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(Math.random() * 1024, 0); g.bezierCurveTo(Math.random() * 1024, 120, Math.random() * 1024, 220, Math.random() * 1024, 340); g.stroke() }
  g.strokeStyle = 'rgba(60,55,50,0.55)'; g.lineWidth = 5; g.strokeRect(22, 22, 980, 296)
  g.fillStyle = '#2a2622'; g.textBaseline = 'middle'
  fitText(g, text, 512, 176, 900, '400 SIZEpx "DM Serif Display"', 120, 10)
  noise(g, 1024, 340, 0.04, 11)
  return tex(c)
}

// Vintage bill posters (2 : 3), for the billboard frame
export async function posterTextures() {
  await fonts()
  const make = (paint) => {
    const c = document.createElement('canvas')
    c.width = 512; c.height = 768
    const g = c.getContext('2d')
    paint(g, 512, 768)
    noise(g, 512, 768, 0.08, 5)
    // paper wear: lighter edges and a crease
    const v = g.createRadialGradient(256, 384, 200, 256, 384, 520)
    v.addColorStop(0, 'rgba(255,245,225,0)'); v.addColorStop(1, 'rgba(255,245,225,0.28)')
    g.fillStyle = v; g.fillRect(0, 0, 512, 768)
    return tex(c)
  }
  return [
    make((g, W, H) => {
      g.fillStyle = '#f0e2c2'; g.fillRect(0, 0, W, H)
      g.fillStyle = '#c0392b'; g.beginPath(); g.arc(W / 2, 330, 190, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#1b2a41'; g.textBaseline = 'middle'
      fitText(g, 'CINEMA', W / 2, 90, 440, '400 SIZEpx "Bowlby One SC"', 90, 8)
      g.fillStyle = '#f0e2c2'; fitText(g, 'ODEON', W / 2, 330, 330, '400 SIZEpx "Alfa Slab One"', 110, 4)
      g.fillStyle = '#1b2a41'; fitText(g, 'STASERA ORE 21', W / 2, 610, 420, '700 SIZEpx "Space Mono"', 40, 2)
      fitText(g, 'INGRESSO LIRE 150', W / 2, 670, 420, '700 SIZEpx "Space Mono"', 30, 2)
    }),
    make((g, W, H) => {
      g.fillStyle = '#1f5f8b'; g.fillRect(0, 0, W, H)
      g.fillStyle = '#f5d76e'
      for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(W / 2, 420); g.arc(W / 2, 420, 400, (i / 12) * Math.PI * 2, ((i + 0.5) / 12) * Math.PI * 2); g.fill() }
      g.fillStyle = '#fbf3df'; g.textBaseline = 'middle'
      fitText(g, 'GRANDE', W / 2, 110, 420, '400 SIZEpx "Righteous"', 80, 6)
      fitText(g, 'BALLO', W / 2, 200, 440, '400 SIZEpx "Bowlby One SC"', 130, 6)
      g.fillStyle = '#1f5f8b'; g.fillRect(40, 560, W - 80, 150)
      g.fillStyle = '#fbf3df'; fitText(g, 'SABATO IN PIAZZA', W / 2, 610, 400, '700 SIZEpx "Space Mono"', 36, 2)
      fitText(g, 'ORCHESTRA', W / 2, 665, 400, '400 SIZEpx "Alfa Slab One"', 44, 4)
    }),
    make((g, W, H) => {
      g.fillStyle = '#e9dfc9'; g.fillRect(0, 0, W, H)
      g.fillStyle = '#d35400'; g.fillRect(0, 0, W, 250)
      g.fillStyle = '#e9dfc9'; g.textBaseline = 'middle'
      fitText(g, 'GIRO', W / 2, 120, 420, '400 SIZEpx "Bowlby One SC"', 150, 10)
      g.fillStyle = '#2c3e50'; fitText(g, "D'ITALIA", W / 2, 330, 440, '400 SIZEpx "Alfa Slab One"', 96, 6)
      g.strokeStyle = '#2c3e50'; g.lineWidth = 10
      for (const x of [170, 342]) { g.beginPath(); g.arc(x, 520, 80, 0, Math.PI * 2); g.stroke() }
      g.beginPath(); g.moveTo(170, 520); g.lineTo(250, 440); g.lineTo(342, 520); g.lineTo(230, 520); g.closePath(); g.stroke()
      g.fillStyle = '#2c3e50'; fitText(g, 'ARRIVO DI TAPPA', W / 2, 690, 420, '700 SIZEpx "Space Mono"', 36, 2)
    }),
  ]
}
