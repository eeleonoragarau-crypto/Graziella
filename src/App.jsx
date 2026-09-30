import { useEffect, useRef } from 'react'
import { Studio } from './engine/Studio.js'
import { attachInteraction } from './engine/interaction.js'
import { loadLibrary, thumbOf } from './engine/libraryBridge.js'
import { SETS } from './engine/sets/index.js'
import { paintHex } from './engine/materials.js'
import { useStore, saved, persist, idbGet, DEFAULTS } from './store.js'
import Library from './ui/Library.jsx'
import Inspector from './ui/Inspector.jsx'
import { Wordmark, StatusPill, Toolbar, Hint, Loader, PhotoOverlay, Help } from './ui/Chrome.jsx'

// the factory decals a new Graziella leaves the shop with
function factoryDecals(engine) {
  const S = engine.stickers
  const has = (id) => S.has(id)
  const V = engine.THREE.Vector3
  const put = (art, part, t, dir, opts = {}) => {
    if (!has(art)) return
    const h = engine.surfaceHit(part, t, new V(...dir))
    if (!h) return
    S.place(art, h, { animate: false, record: false, ...opts })
  }
  put('lib:graziella-script', 'tuboPrincipaleFronte', 0.52, [0, 0.35, 1])
  put('lib:graziella-script', 'tuboPrincipaleFronte', 0.52, [0, 0.35, -1])
  put('lib:stemma-sterzo', 'tuboSterzo', 0.5, [1, 0.05, 0])
  put('lib:tricolore', 'tuboSella', 0.84, [0, 0, 1], { rot: 0 })
  put('lib:made-in-italy', 'carter', 0.46, [0, 0, 1])
  S.select(null, false)
  S.emit('restore')
}

export default function App() {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  useEffect(() => {
    const st = useStore.getState()
    const saveData = saved()
    const engine = new Studio(canvasRef.current, { onStatus: (s) => useStore.getState().setStatus(s) })
    window.__gs = engine
    engine.onUi = (patch) => useStore.setState(patch)
    useStore.setState({ engine })
    const bike = { ...DEFAULTS.bike, ...(saveData?.bike || {}) }
    const scene = { ...DEFAULTS.scene, ...(saveData?.scene || {}) }
    const render = { ...DEFAULTS.render, ...(saveData?.render || {}) }
    useStore.setState({ bike, scene, render })
    engine.applyBike(bike)
    engine.applyRender(render)
    const off = engine.stickers.on((snap) => st.setStickerState(snap))
    const detach = attachInteraction(engine, wrapRef.current, { onHint: (h) => useStore.getState().setHint(h) })
    let alive = true
    ;(async () => {
      useStore.setState({ loading: 'Accendo le luci' })
      await engine.init(scene)
      engine.applyScene(scene)
      useStore.setState({ loading: 'Stampo gli adesivi' })
      const arts = await loadLibrary(engine.stickers)
      // uploaded artwork from previous sessions
      const ups = []
      for (const u of saveData?.uploads || []) {
        const rec = await idbGet(u.id)
        if (!rec) continue
        const art = await engine.stickers.addUploadFromDataUrl(u.id, rec.dataUrl, { name: rec.name || u.name, finish: 'lucido', size: 0.08, border: true })
        ups.push({ id: art.id, name: art.name, category: 'tuoi', finish: art.finish, thumb: thumbOf(art), source: 'upload' })
      }
      if (!alive) return
      useStore.setState({ arts: [...ups, ...arts] })
      if (saveData?.stickers?.length) engine.stickers.restore(saveData.stickers)
      else if (!saveData) factoryDecals(engine)
      engine.stickers.history = []
      engine.stickers.emit('restore')
      useStore.setState({ ready: true, loading: null })
      window.__gsReady = true
    })()
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return
      const views = { 1: 'tre4', 2: 'lato', 3: 'fronte', 4: 'telaio' }
      if (views[e.key]) engine.view(views[e.key])
      if (e.key === 'p' || e.key === 'P') engine.toggleFold?.()
      if (e.key === 'g' || e.key === 'G') engine.toggleSpin?.()
      if (e.key === 'c' || e.key === 'C') engine.toggleParked?.()
      if (e.key === 'b' || e.key === 'B') engine.ringBell?.()
      if (e.key === '?') useStore.setState((s) => ({ help: !s.help }))
      if (e.key === 'Escape' && useStore.getState().help) useStore.setState({ help: false })
    }
    window.addEventListener('keydown', onKey)
    const unsub = engine.stickers.on((snap, kind) => { if (kind !== 'select' && kind !== 'arm') persist() })
    return () => { alive = false; off(); unsub(); detach(); window.removeEventListener('keydown', onKey); engine.dispose?.() }
  }, [])

  // accent follows the frame colour (presets and custom)
  const paint = useStore((s) => paintHex(s.bike))
  const scene = useStore((s) => s.scene)
  useEffect(() => { document.documentElement.style.setProperty('--accent', paint) }, [paint])
  const set = scene.set || 'studio'
  const dark = set === 'studio' ? scene.env === 'nero' : !!SETS[set]?.variants.find((v) => v.id === scene[set])?.dark
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light' }, [dark])

  const photo = async () => {
    const engine = useStore.getState().engine
    if (!engine || useStore.getState().photo) return
    useStore.setState({ photo: { spp: 0, target: 192 } })
    const blob = await engine.photo({ target: 192, onProgress: (spp, target) => {
      const cur = useStore.getState().photo
      if (cur && cur.spp !== spp) useStore.setState({ photo: { spp, target } })
    } })
    useStore.setState({ photo: null })
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `graziella-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }

  return (
    <div className="app">
      <div className="viewport-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="viewport" />
      </div>
      <Wordmark />
      <StatusPill />
      <Library />
      <Inspector />
      <Hint />
      <Toolbar onPhoto={photo} />
      <PhotoOverlay />
      <Help />
      <Loader />
    </div>
  )
}
