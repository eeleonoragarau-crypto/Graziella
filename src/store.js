// UI state + the bridge to the engine. The engine is a plain object living
// outside React; the store mirrors what the UI needs and forwards actions.
import { create } from 'zustand'
import { paintHex } from './engine/materials.js'

const SAVE_KEY = 'graziella-studio-v1'

export const DEFAULTS = {
  bike: { paint: 'rosso', custom: '#2f6f8f', finish: 'lucida', tyres: 'fascia', leather: 'cuoio', guard: 'cromo', fenders: 'cromo', lamp: false },
  scene: { set: 'studio', env: 'studio', citta: 'pomeriggio', garage: 'giorno', exposure: 1, tonemap: 'neutral' },
  render: { pathTracing: true, quality: 0.75, grain: 0.03, bloom: 0.32, vignette: 0.38, ca: 0.45, fStop: 8 },
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') } catch (e) { return null }
}

export const useStore = create((set, get) => ({
  engine: null,
  ready: false,
  loading: 'Preparo lo studio',
  mode: 'raster',
  samples: 0,
  stickers: [],
  selected: null,
  armed: null,
  canUndo: false,
  canRedo: false,
  arts: [],
  hint: null,
  tab: 'bici',
  folded: false,
  spinning: false,
  photo: null,
  help: false,
  ...DEFAULTS,

  setStatus: (s) => set((st) => ({
    mode: s.mode ?? st.mode,
    samples: s.samples ?? st.samples,
    loading: 'loading' in s ? s.loading : st.loading,
    preparing: 'preparing' in s ? s.preparing : st.preparing,
  })),
  setStickerState: (snap) => set({ stickers: snap.stickers, selected: snap.selected, armed: snap.armed, canUndo: snap.canUndo, canRedo: snap.canRedo }),
  setHint: (hint) => set({ hint }),
  setTab: (tab) => set({ tab }),

  setBike: (patch) => {
    const bike = { ...get().bike, ...patch }
    set({ bike })
    get().engine?.applyBike(bike)
    persist(get)
  },
  setScene: (patch) => {
    const scene = { ...get().scene, ...patch }
    set({ scene })
    get().engine?.applyScene(scene, patch)
    persist(get)
  },
  setRender: (patch) => {
    const render = { ...get().render, ...patch }
    set({ render })
    get().engine?.applyRender(render)
    persist(get)
  },
}))

export function accentHex() {
  return paintHex(useStore.getState().bike)
}

let saveTimer = 0
export function persist(get = useStore.getState) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const st = typeof get === 'function' ? get() : get
    const eng = st.engine
    const data = {
      bike: st.bike, scene: st.scene, render: st.render,
      stickers: eng ? eng.stickers.serialize() : [],
      uploads: eng ? [...eng.stickers.arts.values()].filter((a) => a.source === 'upload').map((a) => ({ id: a.id, name: a.name })) : [],
    }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)) } catch (e) { void e }
  }, 250)
}

export function saved() { return loadSaved() }

// --- tiny IndexedDB store for uploaded artwork (data URLs can be large) -------
const DB = 'graziella-studio', STORE = 'uploads'
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
export async function idbPut(key, value) {
  try {
    const d = await db()
    await new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(value, key); t.oncomplete = res; t.onerror = () => rej(t.error) })
  } catch (e) { void e }
}
export async function idbGet(key) {
  try {
    const d = await db()
    return await new Promise((res, rej) => { const t = d.transaction(STORE, 'readonly'); const q = t.objectStore(STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
  } catch (e) { return null }
}
