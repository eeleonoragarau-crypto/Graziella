import { useMemo, useRef, useState } from 'react'
import { useStore, idbPut, persist } from '../store.js'
import { CATEGORIES, thumbOf } from '../engine/libraryBridge.js'
import { Icon } from './controls.jsx'
import { faUpload, faSparkles } from './icons.js'
import { surprise } from '../engine/decorate.js'

// deterministic little tilt per tile, like stickers on a sheet
const tilt = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return ((h % 7) - 3) * 0.9 }

export default function Library() {
  const arts = useStore((s) => s.arts)
  const armed = useStore((s) => s.armed)
  const engine = useStore((s) => s.engine)
  const [cat, setCat] = useState('tutti')
  const fileRef = useRef(null)
  const [dropping, setDropping] = useState(false)

  const list = useMemo(() => {
    if (cat === 'tutti') return arts
    if (cat === 'tuoi') return arts.filter((a) => a.source === 'upload')
    return arts.filter((a) => a.category === cat)
  }, [arts, cat])

  const upload = async (files) => {
    if (!engine) return
    for (const f of files) {
      if (!/^image\//.test(f.type) && !/\.svg$/i.test(f.name)) continue
      const art = await engine.stickers.addUpload(f)
      await idbPut(art.id, { dataUrl: art.dataUrl, name: art.name })
      useStore.setState((s) => ({ arts: [{ id: art.id, name: art.name, category: 'tuoi', finish: art.finish, thumb: thumbOf(art), source: 'upload' }, ...s.arts] }))
      engine.stickers.arm(art.id)
      persist()
    }
    setCat('tuoi')
  }

  const arm = (id) => engine?.stickers.arm(armed === id ? null : id)

  return (
    <aside className="panel library" aria-label="Adesivi">
      <header className="panel-head">
        <h2>Adesivi</h2>
        <button className="surprise" onClick={() => { if (engine) { surprise(engine, arts); persist() } }} title="Decora la bici a caso">
          <Icon icon={faSparkles} /> Sorprendimi
        </button>
      </header>
      <nav className="chips" role="tablist">
        {CATEGORIES.map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className="chip" data-active={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </nav>
      <div className="library-scroll">
        <div className="grid">
          <button type="button" className={`tile tile-upload ${dropping ? 'is-drop' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setDropping(true) } }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => { e.preventDefault(); setDropping(false); upload(Array.from(e.dataTransfer.files)) }}>
            <Icon icon={faUpload} />
            <span>Carica</span>
            <small>PNG, SVG, JPG</small>
          </button>
          {list.map((a) => (
            <button key={a.id} type="button" className="tile" data-armed={armed === a.id}
              draggable onDragStart={(e) => {
                window.__dragArt = a.id
                e.dataTransfer.setData('text/x-sticker', a.id)
                e.dataTransfer.effectAllowed = 'copy'
                const img = e.currentTarget.querySelector('img')
                if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2)
              }}
              onDragEnd={() => { window.__dragArt = null }}
              onClick={() => arm(a.id)} title={a.name}>
              <span className="tile-art" style={{ '--tilt': tilt(a.id) + 'deg' }}>
                <img src={a.thumb} alt="" draggable={false} />
              </span>
              <span className="tile-name">{a.name}</span>
            </button>
          ))}
        </div>
        {cat === 'tuoi' && list.length === 0 && (
          <p className="empty">Trascina qui le tue immagini, oppure direttamente sulla bici. Le immagini con trasparenza diventano adesivi fustellati.</p>
        )}
      </div>
      <footer className="panel-foot">
        <span>Clic per scegliere, poi clic sulla bici. Oppure trascina.</span>
      </footer>
      <input ref={fileRef} type="file" accept="image/*,.svg" multiple hidden onChange={(e) => { upload(Array.from(e.target.files || [])); e.target.value = '' }} />
    </aside>
  )
}
