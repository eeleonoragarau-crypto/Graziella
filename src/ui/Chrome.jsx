// Floating chrome around the viewport: wordmark, render status, toolbar, hints.
import { useStore, persist } from '../store.js'
import { Icon, IconButton } from './controls.jsx'
import { faCamera, faArrowRotateLeft, faArrowRotateRight, faBell, faBicycle, faCube, faCompress, faArrowsRotate, faBinoculars, faEye, faSparkles, faKeyboard, faXmark, faCircleParking } from './icons.js'

export function Wordmark() {
  return (
    <div className="wordmark">
      <span className="wm-name">Graziella</span>
      <span className="wm-sub">Sticker Studio</span>
    </div>
  )
}

const TARGET = 256
export function StatusPill() {
  const mode = useStore((s) => s.mode)
  const samples = useStore((s) => s.samples)
  const loading = useStore((s) => s.loading)
  const pt = useStore((s) => s.render.pathTracing)
  const preparing = useStore((s) => s.preparing)
  const p = Math.min(1, samples / TARGET)
  const r = 7, c = 2 * Math.PI * r
  let label = 'Anteprima'
  if (loading) label = loading
  else if (mode === 'pt') label = samples >= TARGET ? 'Render completo' : 'Path tracing'
  else if (preparing && pt) label = 'Preparo il render'
  const busy = !!loading || (mode !== 'pt' && preparing && pt)
  return (
    <div className="status" data-mode={mode} data-loading={busy}>
      <svg className="status-ring" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r={r} className="ring-bg" />
        <circle cx="10" cy="10" r={r} className="ring-fg" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - (mode === 'pt' ? p : 0)) }} />
      </svg>
      <span className="status-label">{label}</span>
      {mode === 'pt' && !loading && <span className="status-num">{samples}<small> campioni</small></span>}
      {mode !== 'pt' && !loading && pt && !preparing && <span className="status-num muted">fermati per il render</span>}
    </div>
  )
}

const VIEWS = [
  { id: 'tre4', label: 'Tre quarti', icon: faCube, kbd: '1' },
  { id: 'lato', label: 'Di lato', icon: faBicycle, kbd: '2' },
  { id: 'fronte', label: 'Di fronte', icon: faEye, kbd: '3' },
  { id: 'telaio', label: 'Dettaglio', icon: faBinoculars, kbd: '4' },
]

export function Toolbar({ onPhoto }) {
  const engine = useStore((s) => s.engine)
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const folded = useStore((s) => s.folded)
  const spinning = useStore((s) => s.spinning)
  const parked = useStore((s) => s.parked)
  return (
    <div className="toolbar" role="toolbar">
      <div className="tb-group">
        {VIEWS.map((v) => <IconButton key={v.id} icon={v.icon} label={v.label} kbd={v.kbd} onClick={() => engine?.view(v.id)} />)}
      </div>
      <span className="tb-sep" />
      <div className="tb-group">
        <IconButton icon={faCompress} label={folded ? 'Apri' : 'Piega'} kbd="P" active={folded} onClick={() => engine?.toggleFold()} />
        <IconButton icon={faArrowsRotate} label={spinning ? 'Ferma' : 'Pedala'} kbd="G" active={spinning} onClick={() => engine?.toggleSpin()} />
        <IconButton icon={faCircleParking} label={parked ? 'Alza il cavalletto' : 'Cavalletto'} kbd="C" active={parked} onClick={() => engine?.toggleParked()} />
        <IconButton icon={faBell} label="Campanello" kbd="B" onClick={() => engine?.ringBell()} />
      </div>
      <span className="tb-sep" />
      <div className="tb-group">
        <IconButton icon={faArrowRotateLeft} label="Annulla" kbd="⌘Z" disabled={!canUndo} onClick={() => { engine?.stickers.undo(); persist() }} />
        <IconButton icon={faArrowRotateRight} label="Ripeti" kbd="⇧⌘Z" disabled={!canRedo} onClick={() => { engine?.stickers.redo(); persist() }} />
        <IconButton icon={faKeyboard} label="Scorciatoie" kbd="?" onClick={() => useStore.setState((s) => ({ help: !s.help }))} />
      </div>
      <span className="tb-sep" />
      <IconButton icon={faCamera} label="Scatta" primary onClick={onPhoto} />
    </div>
  )
}

export function Hint() {
  const hint = useStore((s) => s.hint)
  const armed = useStore((s) => s.armed)
  const selected = useStore((s) => s.selected)
  const stickers = useStore((s) => s.stickers)
  let text = hint
  if (!text && armed) text = 'Clic sulla bici per applicarlo. Maiusc per applicarne altri. Esc per annullare.'
  if (!text && !armed && !selected && stickers.length === 0) text = 'Trascina un adesivo sulla bici'
  return <div className="hint" data-show={!!text}><Icon icon={faSparkles} /><span>{text}</span></div>
}

const KEYS = [
  ['Adesivi', [
    ['Clic su un adesivo, poi sulla bici', 'Applica'],
    ['Trascina dalla libreria o dal Finder', 'Applica dove lo lasci'],
    ['Trascina un adesivo applicato', 'Spostalo, anche su un altro pezzo'],
    ['Tira un angolo', 'Ruota e scala'],
    [<><kbd>Q</kbd> <kbd>E</kbd></>, 'Ruota di 15°'],
    [<><kbd>+</kbd> <kbd>−</kbd></>, 'Scala'],
    [<><kbd>⌥</kbd> rotella</>, 'Scala sotto il puntatore'],
    [<><kbd>F</kbd></>, 'Specchia'],
    [<><kbd>⌘</kbd> <kbd>D</kbd></>, 'Duplica'],
    [<><kbd>⌫</kbd></>, 'Stacca'],
    [<><kbd>Maiusc</kbd> clic</>, 'Applica più copie'],
  ]],
  ['Vista', [
    [<><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></>, 'Tre quarti, lato, fronte, dettaglio'],
    ['Doppio clic sulla bici', 'Orbita e metti a fuoco lì'],
    [<><kbd>P</kbd></>, 'Piega e apri la Graziella'],
    [<><kbd>G</kbd></>, 'Pedala'],
    [<><kbd>C</kbd></>, 'Cavalletto'],
    [<><kbd>B</kbd></>, 'Campanello'],
    [<><kbd>⌘</kbd> <kbd>Z</kbd></>, 'Annulla'],
  ]],
]

export function Help() {
  const help = useStore((s) => s.help)
  if (!help) return null
  return (
    <div className="help" role="dialog" aria-label="Scorciatoie">
      <header className="help-head">
        <h2>Scorciatoie</h2>
        <button className="close" onClick={() => useStore.setState({ help: false })} aria-label="Chiudi"><Icon icon={faXmark} /></button>
      </header>
      <div className="help-cols">
        {KEYS.map(([title, rows]) => (
          <section key={title}>
            <h3>{title}</h3>
            <dl>
              {rows.map(([k, v], i) => (<div key={i} className="help-row"><dt>{k}</dt><dd>{v}</dd></div>))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}

export function PhotoOverlay() {
  const photo = useStore((s) => s.photo)
  const engine = useStore((s) => s.engine)
  if (!photo) return null
  const p = Math.min(1, photo.spp / photo.target)
  return (
    <div className="photo">
      <div className="photo-top">
        <span className="photo-title">Sviluppo la foto</span>
        <span className="photo-num">{photo.spp} / {photo.target}</span>
      </div>
      <span className="photo-bar"><span style={{ transform: `scaleX(${p})` }} /></span>
      <div className="photo-actions">
        <button className="btn" onClick={() => engine?.photoCancel()}>Annulla</button>
        <button className="btn btn-ink" onClick={() => engine?.photoSaveNow()}>Salva ora</button>
      </div>
    </div>
  )
}

export function Loader() {
  const ready = useStore((s) => s.ready)
  const loading = useStore((s) => s.loading)
  return (
    <div className="loader" data-hide={ready}>
      <div className="loader-inner">
        <span className="wm-name big">Graziella</span>
        <span className="loader-line"><span /></span>
        <span className="loader-text">{loading || 'Quasi pronto'}</span>
      </div>
    </div>
  )
}
