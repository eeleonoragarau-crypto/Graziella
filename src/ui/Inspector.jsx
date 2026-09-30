import { useStore, persist } from '../store.js'
import { PAINTS, TYRES, LEATHERS, FINISHES, paintHex, paintName } from '../engine/materials.js'
import { ENVS } from '../engine/environment.js'
import { SETS } from '../engine/sets/index.js'
import { STICKER_FINISHES } from '../engine/stickers/finishes.js'
import { useState } from 'react'
import { Section, Segmented, Slider, Swatches, Toggle, Icon, ColorPicker } from './controls.jsx'
import { faTrashCan, faClone, faArrowsLeftRight, faXmark } from './icons.js'

const FINISH_SWATCH = {
  lucido: 'radial-gradient(circle at 32% 28%, #fff 0 18%, #d9d6cf 42%, #9a968e 100%)',
  opaco: 'radial-gradient(circle at 40% 35%, #efece6, #b9b5ad)',
  olografico: 'conic-gradient(from 200deg, #ff9ac8, #9ad8ff, #b7ffb0, #ffe89a, #ff9ac8)',
  foil: 'linear-gradient(135deg, #f7e7b0, #b98b33 45%, #fff2c4 60%, #9a6f22)',
  decal: 'linear-gradient(135deg, rgba(255,255,255,.9), rgba(255,255,255,.2)), #c93a3a',
  carta: 'repeating-linear-gradient(35deg, #efe6d2 0 3px, #e6dcc5 3px 5px)',
}

function StickerEditor({ sel }) {
  const engine = useStore((s) => s.engine)
  const arts = useStore((s) => s.arts)
  const S = engine?.stickers
  if (!S || !sel) return null
  const art = arts.find((a) => a.id === sel.artId)
  const cm = (m) => (m * 100).toFixed(1).replace('.', ',')
  const deg = ((((sel.rot * 180) / Math.PI) % 360) + 540) % 360 - 180
  const commit = () => { S.emit('update'); persist() }
  return (
    <div className="panel inspector sticker-editor">
      <header className="editor-head">
        {art && <img className="editor-thumb" src={art.thumb} alt="" />}
        <div className="editor-title">
          <h2>{sel.name}</h2>
          <p>{sel.partLabel ? `Su ${sel.partLabel.toLowerCase()}` : 'Adesivo'}</p>
        </div>
        <button className="close" onClick={() => S.select(null)} aria-label="Chiudi"><Icon icon={faXmark} /></button>
      </header>
      <Section title="Finitura">
        <div className="finish-grid">
          {Object.entries(STICKER_FINISHES).map(([id, f]) => (
            <button key={id} className="finish" data-active={sel.finish === id} onClick={() => { S.update(sel.id, { finish: id }); persist() }} title={f.hint}>
              <span className="finish-ball" style={{ background: FINISH_SWATCH[id] }} />
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Misura" aside={`${cm(sel.width)} × ${cm(sel.height)} cm`}>
        <Slider label="Larghezza" value={sel.width * 100} min={1.5} max={40} step={0.1}
          format={(v) => v.toFixed(1).replace('.', ',')} unit=" cm"
          onChange={(v) => S.update(sel.id, { width: v / 100 }, { record: false })}
          onCommit={commit} />
        <Slider label="Rotazione" value={deg} min={-180} max={180} step={1}
          format={(v) => Math.round(v)} unit="°"
          onChange={(v) => S.update(sel.id, { rot: (v * Math.PI) / 180 }, { record: false })}
          onCommit={commit} />
      </Section>
      <div className="editor-actions">
        <button className="btn" onClick={() => { S.nudge('flip'); persist() }}><Icon icon={faArrowsLeftRight} /> Specchia</button>
        <button className="btn" onClick={() => { S.duplicate(sel.id); persist() }}><Icon icon={faClone} /> Duplica</button>
        <button className="btn btn-danger" onClick={() => { S.remove(sel.id); persist() }}><Icon icon={faTrashCan} /> Stacca</button>
      </div>
      <p className="editor-tip">Trascinalo per spostarlo, anche su un altro pezzo. Tira un angolo per ruotarlo e scalarlo. <kbd>Q</kbd> <kbd>E</kbd> ruota, <kbd>+</kbd> <kbd>−</kbd> scala.</p>
    </div>
  )
}

// a little ball of paint per finish, in the current colour
function finishBall(id, hex) {
  const c = hex
  switch (id) {
    case 'lucida': return `radial-gradient(circle at 34% 26%, #fff 0 7%, color-mix(in srgb, ${c} 55%, #fff) 13%, ${c} 38%, color-mix(in srgb, ${c} 55%, #000) 100%)`
    case 'metal': return `radial-gradient(circle at 34% 28%, #fff 0 5%, color-mix(in srgb, ${c} 45%, #fff) 16%, ${c} 42%, color-mix(in srgb, ${c} 35%, #000) 78%, color-mix(in srgb, ${c} 70%, #fff) 100%), repeating-conic-gradient(rgba(255,255,255,.18) 0 2deg, transparent 2deg 5deg)`
    case 'perlata': return `radial-gradient(circle at 34% 28%, #fff 0 6%, transparent 20%), conic-gradient(from 210deg at 60% 60%, color-mix(in srgb, ${c} 70%, #9ad8ff), color-mix(in srgb, ${c} 75%, #ffb3d9), color-mix(in srgb, ${c} 70%, #d9ffb3), color-mix(in srgb, ${c} 70%, #9ad8ff))`
    case 'satinata': return `radial-gradient(circle at 36% 30%, color-mix(in srgb, ${c} 55%, #fff) 0 12%, ${c} 46%, color-mix(in srgb, ${c} 60%, #000) 100%)`
    default: return `radial-gradient(circle at 40% 36%, color-mix(in srgb, ${c} 82%, #fff), color-mix(in srgb, ${c} 78%, #000))`
  }
}

function BikeTab() {
  const bike = useStore((s) => s.bike)
  const setBike = useStore((s) => s.setBike)
  const [picker, setPicker] = useState(bike.paint === 'custom')
  const hex = paintHex(bike)
  return (
    <>
      <Section title="Colore telaio" aside={paintName(bike)}>
        <Swatches value={bike.paint} options={PAINTS} onChange={(id) => { setBike({ paint: id }); setPicker(false) }}
          custom={{ hex: bike.custom, open: picker, onClick: () => { setBike({ paint: 'custom' }); setPicker((o) => bike.paint !== 'custom' || !o) } }} />
        {picker && bike.paint === 'custom' && <ColorPicker value={bike.custom} onChange={(c) => setBike({ paint: 'custom', custom: c })} />}
      </Section>
      <Section title="Vernice" aside={FINISHES[bike.finish]?.name}>
        <div className="finish-grid finish-grid-5">
          {Object.entries(FINISHES).map(([id, f]) => (
            <button key={id} className="finish" data-active={bike.finish === id} onClick={() => setBike({ finish: id })} title={f.name}>
              <span className="finish-ball" style={{ background: finishBall(id, hex) }} />
              <span>{f.name === 'Metallizzata' ? 'Metal' : f.name}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Parafanghi">
        <Segmented value={bike.fenders || 'cromo'} onChange={(id) => setBike({ fenders: id })} options={[
          { id: 'cromo', label: 'Cromo', swatch: 'linear-gradient(135deg,#fff,#9a9ea2 55%,#e8eaec)' },
          { id: 'colore', label: 'In tinta', swatch: hex },
          { id: 'bianco', label: 'Bianchi', swatch: '#efece4' },
        ]} />
      </Section>
      <Section title="Gomme">
        <Segmented value={bike.tyres} onChange={(id) => setBike({ tyres: id })} options={Object.entries(TYRES).map(([id, t]) => ({ id, label: t.name, swatch: t.wall }))} />
      </Section>
      <Section title="Sella e manopole">
        <Segmented value={bike.leather} onChange={(id) => setBike({ leather: id })} options={Object.entries(LEATHERS).map(([id, l]) => ({ id, label: l.name, swatch: l.hex }))} />
      </Section>
      <Section title="Carter">
        <Segmented value={bike.guard} onChange={(id) => setBike({ guard: id })} options={[
          { id: 'cromo', label: 'Cromo', swatch: 'linear-gradient(135deg,#fff,#9a9ea2 55%,#e8eaec)' },
          { id: 'colore', label: 'In tinta', swatch: hex },
          { id: 'bianco', label: 'Bianco', swatch: '#efece4' },
        ]} />
      </Section>
      <Section>
        <Toggle label="Fanale acceso" value={bike.lamp} onChange={(v) => setBike({ lamp: v })} />
      </Section>
    </>
  )
}

const ENV_SWATCH = {
  studio: 'linear-gradient(180deg,#f3f1ec,#d9d5cd)', nero: 'linear-gradient(180deg,#2a2a2c,#050505)',
  tramonto: 'linear-gradient(180deg,#f6c89a,#e9cdb0 55%,#b98a66)', loft: 'linear-gradient(180deg,#e9e4db,#b7aea2)',
  set: 'linear-gradient(180deg,#e3e2e0,#9fa0a3)', bottega: 'linear-gradient(180deg,#d9cdbd,#8f7d69)',
}

const AMBIENTS = [
  { id: 'studio', name: 'Studio', hint: 'Fondale fotografico', swatch: 'url(/thumbs/studio.jpg) center/cover, #e6e3dd' },
  { id: 'citta', name: 'Città', hint: 'Una via del centro', swatch: 'url(/thumbs/citta.jpg) center/cover, #b58a4a' },
  { id: 'garage', name: 'Garage', hint: 'Il box con il banco', swatch: 'url(/thumbs/garage.jpg) center/cover, #4a5a4c' },
]

const LIGHT_SWATCH = {
  pomeriggio: 'linear-gradient(180deg,#f3c47e,#e9a45a)', nuvole: 'linear-gradient(180deg,#bcd6ec,#f4efe3)',
  tramonto: 'linear-gradient(180deg,#f0a07a,#9d6a8f)', sera: 'linear-gradient(180deg,#34466b,#141c33)',
  giorno: 'linear-gradient(180deg,#f2d49a,#6e7a6c)', neon: 'linear-gradient(180deg,#dfe8f4,#2a3530)',
}

function SceneTab() {
  const scene = useStore((s) => s.scene)
  const setScene = useStore((s) => s.setScene)
  const loading = useStore((s) => s.loading)
  const set = scene.set || 'studio'
  const def = SETS[set]
  return (
    <>
      <Section title="Ambientazione" aside={loading ? 'Carico…' : null}>
        <div className="ambient-grid">
          {AMBIENTS.map((a) => (
            <button key={a.id} className="ambient" data-active={set === a.id} onClick={() => setScene({ set: a.id })} title={a.hint}>
              <span className="ambient-swatch" style={{ background: a.swatch }} />
              <span className="ambient-name">{a.name}</span>
              <span className="ambient-hint">{a.hint}</span>
            </button>
          ))}
        </div>
      </Section>
      {set === 'studio' ? (
        <Section title="Luce">
          <div className="env-grid">
            {Object.entries(ENVS).map(([id, e]) => (
              <button key={id} className="env" data-active={scene.env === id} onClick={() => setScene({ env: id })}>
                <span className="env-swatch" style={{ background: ENV_SWATCH[id] }} />
                <span>{e.name}</span>
              </button>
            ))}
          </div>
        </Section>
      ) : (
        <Section title="Luce">
          <div className="env-grid">
            {def.variants.map((v) => (
              <button key={v.id} className="env" data-active={(scene[set] || def.variants[0].id) === v.id} onClick={() => setScene({ [set]: v.id })}>
                <span className="env-swatch" style={{ background: LIGHT_SWATCH[v.id] }} />
                <span>{v.name}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
      <Section title="Esposizione">
        <Slider label="Luminosità" value={scene.exposure} min={0.5} max={1.8} step={0.01} format={(v) => (v >= 1 ? '+' : '') + Math.log2(v).toFixed(2).replace('.', ',')} unit=" EV" onChange={(v) => setScene({ exposure: v })} />
      </Section>
      <Section title="Resa colore">
        <Segmented value={scene.tonemap} onChange={(id) => setScene({ tonemap: id })} options={[
          { id: 'neutral', label: 'Neutra', hint: 'Colori fedeli, da catalogo' }, { id: 'agx', label: 'Filmica', hint: 'AgX, alte luci morbide' }, { id: 'aces', label: 'Contrasto', hint: 'ACES, più drammatica' },
        ]} />
      </Section>
    </>
  )
}

function RenderTab() {
  const render = useStore((s) => s.render)
  const setRender = useStore((s) => s.setRender)
  return (
    <>
      <Section>
        <Toggle label="Path tracing a vista ferma" value={render.pathTracing} onChange={(v) => setRender({ pathTracing: v })} hint="Luce fisica, riflessi veri, ombre morbide" />
      </Section>
      <Section title="Qualità">
        <Segmented value={render.quality} onChange={(v) => setRender({ quality: v })} options={[
          { id: 0.5, label: 'Bozza' }, { id: 0.75, label: 'Alta' }, { id: 1, label: 'Massima' },
        ]} />
      </Section>
      <Section title="Messa a fuoco" aside={`f/${render.fStop < 10 ? render.fStop.toFixed(1).replace('.', ',') : Math.round(render.fStop)}`}>
        <Slider label="Diaframma" value={Math.log2(render.fStop)} min={Math.log2(1.4)} max={Math.log2(22)} step={0.01}
          format={(v) => (v < Math.log2(4) ? 'molto sfocato' : v < Math.log2(9) ? 'naturale' : 'tutto a fuoco')} onChange={(v) => setRender({ fStop: Math.round(Math.pow(2, v) * 10) / 10 })} />
        <p className="note">Doppio clic sulla bici per mettere a fuoco quel punto.</p>
      </Section>
      <Section title="Obiettivo">
        <Slider label="Grana" value={render.grain} min={0} max={0.12} step={0.001} format={(v) => Math.round(v * 1000)} onChange={(v) => setRender({ grain: v })} />
        <Slider label="Bagliore" value={render.bloom} min={0} max={1.2} step={0.01} format={(v) => Math.round(v * 100)} onChange={(v) => setRender({ bloom: v })} />
        <Slider label="Vignettatura" value={render.vignette} min={0} max={0.8} step={0.01} format={(v) => Math.round(v * 100)} onChange={(v) => setRender({ vignette: v })} />
        <Slider label="Aberrazione" value={render.ca} min={0} max={2} step={0.01} format={(v) => Math.round(v * 100)} onChange={(v) => setRender({ ca: v })} />
      </Section>
    </>
  )
}

export default function Inspector() {
  const sel = useStore((s) => s.selected)
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  if (sel) return <StickerEditor sel={sel} />
  return (
    <div className="panel inspector">
      <nav className="tabs" role="tablist">
        {[['bici', 'Bici'], ['scena', 'Scena'], ['render', 'Render']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className="tab" data-active={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      <div className="inspector-scroll">
        {tab === 'bici' && <BikeTab />}
        {tab === 'scena' && <SceneTab />}
        {tab === 'render' && <RenderTab />}
      </div>
    </div>
  )
}
