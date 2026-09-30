// Delights: fold the Graziella on its hinge, pedal (wheels, cranks, chain),
// ring the bell (synthesised), take a photo.
import * as THREE from 'three'
import gsap from 'gsap'
import { cableGeo } from './bike/cockpit.js'
import { SQUASH } from './bike/wheel.js'

export function installAnimations(studio) {
  const U = studio.bike.userData
  const D = U.D
  const state = { folded: false, spinning: false, crank: 0, wheel: 0, chain: 0, fold: 0 }
  studio.anim = state

  // Cables follow the steering / folding. They are rewritten in place (same
  // vertex count, same geometry object) so the path tracer can refit its BVH
  // instead of rebuilding it.
  const rewrite = (mesh, route) => {
    const g = cableGeo(route)
    const dst = mesh.geometry
    if (dst.attributes.position.count !== g.attributes.position.count) { dst.dispose(); mesh.geometry = g; return }
    for (const k of ['position', 'normal']) { dst.attributes[k].array.set(g.attributes[k].array); dst.attributes[k].needsUpdate = true }
    dst.computeBoundingSphere()
    dst.computeBoundingBox()
    g.dispose()
  }
  const rebuildCables = () => {
    rewrite(U.frontCable, U.frontCableRoute())
    rewrite(U.rearCable, U.rearCableRoute())
  }

  // --- parked on the kickstand ---------------------------------------------------------------
  // The stand swings down and splays out, the bike leans onto it and the
  // front wheel flops a few degrees towards the lean. The splay is solved so
  // the foot sits exactly on the ground at LEAN.
  const stand = U.stand.group
  const standQ0 = stand.quaternion.clone()
  const LEAN = THREE.MathUtils.degToRad(6.5), PARK_STEER = THREE.MathUtils.degToRad(11)
  const legTip = new THREE.Vector3(-0.269, -0.034, -0.013) // foot centre, stand space (retracted)
  const LEG = legTip.length(), FOOT_R = 0.0072
  const pivot = stand.position.clone()
  const worldY = (p) => p.y * Math.cos(LEAN) + p.z * Math.sin(LEAN) - SQUASH
  const legDir = (dz) => { const dx = -0.24; return new THREE.Vector3(dx, -Math.sqrt(Math.max(0, 1 - dx * dx - dz * dz)), dz) }
  let lo = -0.85, hi = 0
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const y = worldY(pivot.clone().addScaledVector(legDir(mid), LEG)) - FOOT_R
    // more splay (more negative dz) raises the foot
    if (y > 0) hi = mid; else lo = mid
  }
  const standQ1 = new THREE.Quaternion().setFromUnitVectors(legTip.clone().normalize(), legDir((lo + hi) / 2)).multiply(standQ0)
  const park = { t: 0 }
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

  // --- fold ------------------------------------------------------------------------------
  const pose = { hinge: 0, steer: 0, stemDrop: 0, barTurn: 0, post: 0, lever: 0 }
  const applyPose = () => {
    const standT = sstep(0, 0.55, park.t), leanT = sstep(0.4, 1, park.t)
    stand.quaternion.slerpQuaternions(standQ0, standQ1, standT)
    studio.bike.rotation.x = -LEAN * leanT
    U.frontPivot.rotation.y = pose.hinge
    if (U.leverPivot) U.leverPivot.rotation.y = pose.lever
    U.steerPivot.quaternion.setFromAxisAngle(D.steer, pose.steer + PARK_STEER * leanT * (1 - Math.min(1, pose.hinge)))
    const bp = U.barPivot
    bp.position.copy(D.htTop).addScaledVector(D.steer, -pose.stemDrop)
    bp.quaternion.setFromAxisAngle(D.steer, pose.barTurn)
    U.saddleGroup.position.copy(D.seatDir).multiplyScalar(-pose.post)
    rebuildCables()
  }
  studio.toggleFold = () => {
    state.folded = !state.folded
    const to = state.folded
      ? { hinge: THREE.MathUtils.degToRad(162), steer: THREE.MathUtils.degToRad(-24), stemDrop: 0.2, barTurn: THREE.MathUtils.degToRad(88), post: 0.2 }
      : { hinge: 0, steer: 0, stemDrop: 0, barTurn: 0, post: 0 }
    studio.hold('fold', true)
    gsap.killTweensOf(pose)
    const tl = gsap.timeline({
      onUpdate: applyPose,
      onComplete: () => { studio.hold('fold', false); studio.geometryChanged(true); studio.floor.reset() },
    })
    if (state.folded) {
      tl.to(pose, { lever: 1.75, duration: 0.45, ease: 'back.out(1.6)' }, 0)
        .to(pose, { post: to.post, duration: 0.7, ease: 'power2.inOut' }, 0)
        .to(pose, { stemDrop: to.stemDrop, barTurn: to.barTurn, duration: 0.9, ease: 'power3.inOut' }, 0.1)
        .to(pose, { steer: to.steer, duration: 0.6, ease: 'power2.inOut' }, 0.55)
        .to(pose, { hinge: to.hinge, duration: 1.5, ease: 'power3.inOut' }, 0.75)
    } else {
      tl.to(pose, { hinge: 0, duration: 1.3, ease: 'power3.inOut' }, 0)
        .to(pose, { steer: 0, duration: 0.6, ease: 'power2.inOut' }, 0.9)
        .to(pose, { stemDrop: 0, barTurn: 0, duration: 0.9, ease: 'power3.inOut' }, 1.1)
        .to(pose, { post: 0, duration: 0.7, ease: 'power2.inOut' }, 1.3)
        .to(pose, { lever: 0, duration: 0.35, ease: 'power3.in' }, 1.25)
    }
    studio.onStatus({ folded: state.folded })
    studio.onUi?.({ folded: state.folded })
  }

  studio.setParked = (on, animate = true) => {
    if (state.parked === on) return
    state.parked = on
    studio.onUi?.({ parked: on })
    gsap.killTweensOf(park)
    // a few degrees of lean: refitting the path tracer's BVH is enough
    const done = () => { studio.hold('park', false); studio.geometryChanged(false); studio.floor.reset() }
    if (!animate) { park.t = on ? 1 : 0; applyPose(); done(); return }
    studio.hold('park', true)
    gsap.to(park, { t: on ? 1 : 0, duration: on ? 1.4 : 1.0, ease: on ? 'power2.inOut' : 'power2.out', onUpdate: applyPose, onComplete: done })
  }
  studio.toggleParked = () => { studio.parkAuto = false; studio.setParked(!state.parked) }

  // --- pedal ------------------------------------------------------------------------------
  const ratio = D.cogTeeth / D.ringTeeth
  studio.toggleSpin = () => {
    if (state.folded) return
    state.spinning = !state.spinning
    studio.hold('spin', state.spinning)
    if (!state.spinning) { studio.geometryChanged(); studio.floor.reset() }
    studio.onUi?.({ spinning: state.spinning })
  }
  let speed = 0
  studio.hooks.push((dt) => {
    const target = state.spinning ? 2.4 : 0 // crank rad/s (a relaxed cadence)
    speed += (target - speed) * Math.min(1, dt * 2.2)
    if (Math.abs(speed) < 1e-3) { speed = 0; return }
    state.crank -= speed * dt
    state.wheel -= (speed / ratio) * dt
    state.chain += speed * dt * D.ringR
    U.cranks.rotation.z = state.crank
    for (const p of U.cranks.userData.pedals) p.rotation.z = -state.crank
    U.rearWheel.userData.spin.rotation.z = state.wheel
    U.frontWheel.userData.spin.rotation.z = state.wheel
    // scroll the tread so the (static) tyres look like they roll
    const tread = studio.M.tyre.normalMap
    if (tread) tread.offset.x = -state.wheel * D.tyreR * tread.repeat.x
    for (const w of [U.rearWheel, U.frontWheel]) for (const l of w.userData.letters || []) {
      const off = l.userData.scroll * state.wheel / Math.PI
      l.material.map.offset.x = off; l.material.normalMap.offset.x = off
    }
    U.chain.userData.animate(state.chain)
    studio.poke()
  })

  // --- bell ---------------------------------------------------------------------------------
  let ctx = null
  studio.ringBell = () => {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    const t0 = ctx.currentTime + 0.01
    const out = ctx.createGain()
    out.gain.value = 0.32
    const comp = ctx.createDynamicsCompressor()
    out.connect(comp).connect(ctx.destination)
    const strike = (t, amp) => {
      // a thin steel dome: inharmonic partials, the pair near 1.0 beats
      const f0 = 2340
      const partials = [[1, 1, 1.4], [1.0065, 0.7, 1.35], [1.51, 0.45, 0.8], [2.66, 0.3, 0.45], [3.9, 0.16, 0.28], [5.3, 0.08, 0.18]]
      for (const [r, a, d] of partials) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = f0 * r
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(a * amp, t + 0.002)
        g.gain.exponentialRampToValueAtTime(0.0001, t + d)
        o.connect(g).connect(out)
        o.start(t); o.stop(t + d + 0.05)
      }
      // the striker's click
      const n = ctx.createBufferSource()
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate)
      const ch = buf.getChannelData(0)
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.003))
      n.buffer = buf
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000
      const ng = ctx.createGain(); ng.gain.value = 0.35 * amp
      n.connect(hp).connect(ng).connect(out)
      n.start(t)
    }
    strike(t0, 1)
    strike(t0 + 0.16, 0.85)
    // wiggle the bell lever a touch
    const bell = U.bellMesh
    if (bell) {
      gsap.fromTo(bell.position, { y: 0 }, { y: 0.0012, duration: 0.05, yoyo: true, repeat: 3, ease: 'sine.inOut', onUpdate: () => studio.poke() })
    }
  }

  // --- photo --------------------------------------------------------------------------------
  // Waits for the path tracer to reach `target` samples (or for saveNow), then
  // grabs the canvas in the same task as a fresh composite render.
  studio.photo = ({ target = 192, onProgress } = {}) => new Promise((resolve) => {
    const job = { target, onProgress, resolve, saveNow: false, cancelled: false }
    studio.captureJob = job
    studio.controls.enabled = false
    if (!studio.settings.pathTracing) job.saveNow = true
    studio.lastActivity = -1e9
  })
  studio.photoSaveNow = () => { if (studio.captureJob) studio.captureJob.saveNow = true }
  studio.photoCancel = () => {
    const j = studio.captureJob
    if (!j) return
    j.cancelled = true
    studio.captureJob = null
    studio.controls.enabled = true
    j.resolve(null)
  }
}
