// Pointer / keyboard / drag-and-drop layer between the viewport and the
// StickerManager. Listens on the viewport wrapper in the capture phase so a
// sticker grab never also orbits the camera.
import * as THREE from 'three'

export function attachInteraction(studio, wrapper, { onCursor, onHint } = {}) {
  const S = studio.stickers
  const ndc = new THREE.Vector2()
  const toNdc = (e) => {
    const r = studio.canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    return ndc
  }
  const cursor = (c) => { wrapper.style.cursor = c; onCursor?.(c) }
  let down = null
  let hoverQueued = false
  let lastMove = null

  const onDown = (e) => {
    if (e.button !== 0) return
    toNdc(e)
    // the bell rings when you press it
    S.setPointer(ndc)
    const first = S.raycaster.intersectObjects(S.bikeMeshes, false).find((x) => x.object.visible)
    if (first && (first.object.userData.bell || first.object.name === 'levaCampanello') && !S.armed) {
      studio.ringBell?.()
      e.stopPropagation(); e.preventDefault()
      return
    }
    if (S.armed) {
      const hit = S.pickSurface(ndc)
      if (hit) {
        S.place(S.armed, hit)
        if (!e.shiftKey) S.arm(null)
        S.hideGhost()
        e.stopPropagation(); e.preventDefault()
        return
      }
    }
    const sh = S.pickSticker(ndc)
    if (sh) {
      if (S.selected !== sh.sticker.id) S.select(sh.sticker.id)
      const mode = S.beginDrag(sh, ndc)
      cursor(mode === 'transform' ? 'crosshair' : 'grabbing')
      try { wrapper.setPointerCapture(e.pointerId) } catch (err) { void err }
      e.stopPropagation(); e.preventDefault()
      down = { x: e.clientX, y: e.clientY, sticker: true }
      return
    }
    down = { x: e.clientX, y: e.clientY, sticker: false }
  }

  const hover = () => {
    hoverQueued = false
    if (!lastMove || S.drag) return
    toNdc(lastMove)
    if (S.armed) {
      const hit = S.pickSurface(ndc)
      if (hit) { S.showGhost(S.armed, hit); cursor('copy') } else { S.hideGhost(); cursor('not-allowed') }
      return
    }
    if (down && !down.sticker) return // orbiting
    const sh = S.pickSticker(ndc)
    if (!sh) { cursor(''); return }
    const sel = sh.sticker.id === S.selected
    const cx = sh.uv.x < 0.14 || sh.uv.x > 0.86, cy = sh.uv.y < 0.14 || sh.uv.y > 0.86
    cursor(sel && cx && cy ? 'crosshair' : 'grab')
  }

  const onMove = (e) => {
    if (S.drag) {
      toNdc(e)
      S.dragTo(ndc)
      e.stopPropagation()
      return
    }
    lastMove = e
    if (!hoverQueued) { hoverQueued = true; requestAnimationFrame(hover) }
  }

  const onUp = (e) => {
    if (S.drag) {
      S.endDrag()
      cursor('grab')
      try { wrapper.releasePointerCapture(e.pointerId) } catch (err) { void err }
      e.stopPropagation()
    } else if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4 && e.button === 0) {
      toNdc(e)
      if (!S.pickSticker(ndc)) S.select(null)
    }
    down = null
  }

  const onWheel = (e) => {
    if (!S.selected || !(e.altKey || e.shiftKey)) return
    toNdc(e)
    const sh = S.pickSticker(ndc)
    if (!sh || sh.sticker.id !== S.selected) return
    e.preventDefault(); e.stopPropagation()
    const d = Math.sign(e.deltaY || e.deltaX)
    if (e.altKey) S.nudge('scale', d > 0 ? 0.94 : 1.06)
    else S.nudge('rot', d * (Math.PI / 48))
  }

  // --- drag & drop: from the library (dataTransfer 'text/x-sticker') or files ---
  const onDragOver = (e) => {
    const types = Array.from(e.dataTransfer?.types || [])
    if (!types.includes('text/x-sticker') && !types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    toNdc(e)
    const artId = window.__dragArt
    const hit = S.pickSurface(ndc)
    if (artId && hit) S.showGhost(artId, hit)
    else S.hideGhost()
    onHint?.(hit ? 'Rilascia per applicare' : 'Porta l’adesivo sopra la bici')
  }
  const onDragLeave = () => { S.hideGhost(); onHint?.(null) }
  const onDrop = async (e) => {
    e.preventDefault()
    S.hideGhost()
    onHint?.(null)
    toNdc(e)
    const hit = S.pickSurface(ndc)
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => /^image\//.test(f.type) || /\.svg$/i.test(f.name))
    if (files.length) {
      let offset = 0
      for (const f of files) {
        const art = await S.addUpload(f)
        const h = hit || null
        if (h) S.place(art.id, h, { rot: undefined })
        else S.arm(art.id)
        offset++
      }
      return
    }
    const artId = e.dataTransfer.getData('text/x-sticker') || window.__dragArt
    window.__dragArt = null
    if (artId && hit) S.place(artId, hit)
  }

  const onKey = (e) => {
    const tag = (e.target?.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) S.redo(); else S.undo(); return }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); S.redo(); return }
    if (e.key === 'Escape') { if (S.armed) S.arm(null); else S.select(null); return }
    if (!S.selected) return
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); S.remove(S.selected); return }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); S.duplicate(S.selected); return }
    if (e.key === 'q' || e.key === 'Q') S.nudge('rot', Math.PI / 12)
    if (e.key === 'e' || e.key === 'E') S.nudge('rot', -Math.PI / 12)
    if (e.key === '+' || e.key === '=') S.nudge('scale', 1.08)
    if (e.key === '-' || e.key === '_') S.nudge('scale', 1 / 1.08)
    if (e.key === 'f' || e.key === 'F') S.nudge('flip')
  }

  // double click on the bike: orbit around (and focus on) that point
  const onDbl = (e) => {
    toNdc(e)
    S.setPointer(ndc)
    const h = S.raycaster.intersectObjects(S.bikeMeshes, false).find((x) => x.object.visible)
    if (!h) return
    const c = studio.controls
    c.setOrbitPoint(h.point.x, h.point.y, h.point.z)
    studio.poke()
  }
  wrapper.addEventListener('dblclick', onDbl)
  wrapper.addEventListener('pointerdown', onDown, { capture: true })
  wrapper.addEventListener('pointermove', onMove, { capture: true })
  wrapper.addEventListener('pointerup', onUp, { capture: true })
  wrapper.addEventListener('pointercancel', onUp, { capture: true })
  wrapper.addEventListener('wheel', onWheel, { capture: true, passive: false })
  wrapper.addEventListener('dragover', onDragOver)
  wrapper.addEventListener('dragleave', onDragLeave)
  wrapper.addEventListener('drop', onDrop)
  window.addEventListener('keydown', onKey)
  return () => {
    wrapper.removeEventListener('dblclick', onDbl)
    wrapper.removeEventListener('pointerdown', onDown, { capture: true })
    wrapper.removeEventListener('pointermove', onMove, { capture: true })
    wrapper.removeEventListener('pointerup', onUp, { capture: true })
    wrapper.removeEventListener('pointercancel', onUp, { capture: true })
    wrapper.removeEventListener('wheel', onWheel, { capture: true })
    wrapper.removeEventListener('dragover', onDragOver)
    wrapper.removeEventListener('dragleave', onDragLeave)
    wrapper.removeEventListener('drop', onDrop)
    window.removeEventListener('keydown', onKey)
  }
}
