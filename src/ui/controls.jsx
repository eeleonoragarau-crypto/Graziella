import { useRef, useLayoutEffect, useState, useEffect, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

export function Icon({ icon, ...p }) { return <FontAwesomeIcon icon={icon} {...p} /> }

export function Section({ title, aside, children }) {
  return (
    <section className="section">
      {title && (
        <header className="section-head">
          <h3>{title}</h3>
          {aside && <span className="section-aside">{aside}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

// Segmented control with a sliding pill
export function Segmented({ value, options, onChange, size = 'md' }) {
  const ref = useRef(null)
  const [pill, setPill] = useState(null)
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('[data-active="true"]')
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, options.length])
  return (
    <div className={`seg seg-${size}`} ref={ref} role="radiogroup">
      {pill && <span className="seg-pill" style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} />}
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} data-active={value === o.id}
          className="seg-opt" onClick={() => onChange(o.id)} title={o.hint || o.label}>
          {o.swatch && <span className="seg-swatch" style={{ background: o.swatch }} />}
          {o.icon && <Icon icon={o.icon} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Slider({ label, value, min, max, step = 0.01, onChange, onCommit, format = (v) => v.toFixed(2), unit = '' }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="slider">
      <span className="slider-top">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{format(value)}{unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        style={{ '--pct': pct + '%' }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={() => onCommit?.()} onKeyUp={() => onCommit?.()} />
    </label>
  )
}

export function Swatches({ value, options, onChange, custom }) {
  return (
    <div className="swatches">
      {options.map((o) => (
        <button key={o.id} type="button" className="swatch" data-active={value === o.id} onClick={() => onChange(o.id)} title={o.name}
          style={{ '--c': o.hex }}>
          <span className="swatch-dot" />
        </button>
      ))}
      {custom && (
        <button type="button" className="swatch swatch-custom" data-active={value === 'custom'} data-open={custom.open} onClick={custom.onClick} title="Colore personalizzato"
          style={{ '--c': custom.hex }}>
          <span className="swatch-dot" />
        </button>
      )}
    </div>
  )
}

// --- colour maths --------------------------------------------------------------------------
export function hexToHsv(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  const n = m ? parseInt(m[1], 16) : 0x2f6f8f
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: ((h * 60) + 360) % 360, s: max ? d / max : 0, v: max }
}
export function hsvToHex({ h, s, v }) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0')
  return '#' + to(f(5)) + to(f(3)) + to(f(1))
}

const RECENT_KEY = 'graziella-recent-colours'
function loadRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch (e) { return [] } }

// Saturation / value field, hue strip, hex field and the last custom colours.
export function ColorPicker({ value, onChange }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value))
  const [text, setText] = useState(value)
  const [recent, setRecent] = useState(loadRecent)
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) { last.current = value; setHsv(hexToHsv(value)); setText(value) }
  }, [value])
  const emit = useCallback((next) => {
    setHsv(next)
    const hex = hsvToHex(next)
    last.current = hex
    setText(hex)
    onChange(hex)
  }, [onChange])
  const remember = () => {
    const hex = last.current
    const list = [hex, ...recent.filter((c) => c !== hex)].slice(0, 8)
    setRecent(list)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch (e) { void e }
  }
  const drag = (el, fn) => (e) => {
    const rect = el.current.getBoundingClientRect()
    const move = (ev) => fn(Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)))
    move(e)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); remember() }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const sv = useRef(null), hue = useRef(null)
  const onField = drag(sv, (x, y) => emit({ ...hsv, s: x, v: 1 - y }))
  const onHue = drag(hue, (x) => emit({ ...hsv, h: x * 359.9 }))
  const commitText = (t) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(t.trim())
    if (m) { const hex = '#' + m[1].toLowerCase(); emit(hexToHsv(hex)); setTimeout(remember) } else setText(last.current)
  }
  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 })
  return (
    <div className="picker">
      <div className="picker-field" ref={sv} onPointerDown={onField} style={{ '--hue': pure }}>
        <span className="picker-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }} />
      </div>
      <div className="picker-hue" ref={hue} onPointerDown={onHue}>
        <span className="picker-knob small" style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }} />
      </div>
      <div className="picker-row">
        <span className="picker-preview" style={{ background: hsvToHex(hsv) }} />
        <input className="picker-hex" value={text} spellCheck={false} maxLength={7}
          onFocus={(e) => e.target.select()} onChange={(e) => setText(e.target.value)} onBlur={(e) => commitText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} aria-label="Colore esadecimale" />
        <div className="picker-recent">
          {recent.map((c) => <button key={c} type="button" className="picker-chip" style={{ background: c }} title={c.toUpperCase()} onClick={() => emit(hexToHsv(c))} />)}
        </div>
      </div>
    </div>
  )
}

export function Toggle({ label, value, onChange, hint }) {
  return (
    <button type="button" className="toggle" data-on={value} onClick={() => onChange(!value)} title={hint}>
      <span className="toggle-label">{label}</span>
      <span className="toggle-track"><span className="toggle-knob" /></span>
    </button>
  )
}

export function IconButton({ icon, label, onClick, active, disabled, kbd, primary, className = '' }) {
  return (
    <button type="button" className={`ibtn ${primary ? 'ibtn-primary' : ''} ${className}`} data-active={!!active} disabled={disabled} onClick={onClick} aria-label={label}>
      <Icon icon={icon} />
      {primary && <span className="ibtn-text">{label}</span>}
      <span className="tip">{label}{kbd && <kbd>{kbd}</kbd>}</span>
    </button>
  )
}
