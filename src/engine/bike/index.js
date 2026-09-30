// Assembles the Graziella. Hierarchy (so it can fold, steer and pedal):
//   bike
//   ├─ rear          frame rear half, saddle, rack, rear wheel, drivetrain
//   └─ frontPivot    (vertical hinge axis)  ─ front half of the frame
//        └─ steerPivot (steering axis)      ─ fork, front wheel, bar, lamp
import * as THREE from 'three'
import { makeDims } from './dims.js'
import { buildFrame, buildFork } from './frame.js'
import { buildWheel, SQUASH } from './wheel.js'
import { buildDrivetrain } from './drivetrain.js'
import { buildFenders, buildRack, buildHeadlamp, buildKickstand } from './extras.js'
import { buildCockpit, buildCaliper, cableGeo } from './cockpit.js'
import { buildSaddle } from './saddle.js'
import { part } from './part.js'
import { v3 } from '../geo.js'

function pivotGroup(name, point) {
  const pivot = new THREE.Group()
  pivot.name = name
  pivot.position.copy(point)
  const inner = new THREE.Group()
  inner.name = name + 'Inner'
  inner.position.copy(point).multiplyScalar(-1)
  pivot.add(inner)
  pivot.userData.inner = inner
  return pivot
}

export function buildGraziella(M) {
  const D = makeDims()
  const bike = new THREE.Group()
  bike.name = 'graziella'
  bike.position.y = -SQUASH // tyres are loaded: the whole bike sits on its contact patches

  const rear = new THREE.Group()
  rear.name = 'rear'
  const knuckle = v3(D.hinge.x, 0, -(D.mainR + 0.0092))
  const frontPivot = pivotGroup('frontPivot', knuckle)
  const front = frontPivot.userData.inner
  const steerPivot = pivotGroup('steerPivot', D.htBottom)
  const steer = steerPivot.userData.inner
  front.add(steerPivot)
  bike.add(rear, frontPivot)

  // frame
  const frame = buildFrame(D, M)
  rear.add(...frame.rear)
  front.add(...frame.front)
  steer.add(...buildFork(D, M))

  // wheels
  const rearWheel = buildWheel(D, M, { rear: true, name: 'ruotaPost' })
  rearWheel.position.copy(D.rear)
  const frontWheel = buildWheel(D, M, { rear: false, name: 'ruotaAnt' })
  frontWheel.position.copy(D.front)
  rear.add(rearWheel)
  steer.add(frontWheel)

  // drivetrain
  const dt = buildDrivetrain(D, M)
  rear.add(dt.cranks, dt.chain, dt.guard, dt.lipM, dt.tabs)
  rearWheel.userData.spin.add(dt.cogM)

  // fenders, rack, lights, stand
  const f = buildFenders(D, M)
  rear.add(f.rear.fender, f.rear.inner, f.rear.beads, f.rearStays, ...f.reflector)
  steer.add(f.front.fender, f.front.inner, f.front.beads, f.frontStays, f.bracket)
  const rack = buildRack(D, M)
  rear.add(rack.frame, rack.clip, rack.clamp)
  const lamp = buildHeadlamp(D, M)
  steer.add(...lamp.lamp)
  const stand = buildKickstand(D, M)
  rear.add(stand.group, stand.plate)

  // saddle (its own group so the seatpost can slide down when folding)
  const saddleGroup = new THREE.Group()
  saddleGroup.name = 'saddleGroup'
  saddleGroup.add(...buildSaddle(D, M))
  rear.add(saddleGroup)

  // cockpit + brakes
  const ck = buildCockpit(D, M)
  // stem + bar assembly slides into the head tube and turns when folding
  const barPivot = pivotGroup('barPivot', D.htTop)
  barPivot.userData.inner.add(...ck.steer, ...ck.bar)
  steer.add(barPivot)
  // front caliper hangs in front of the crown, rear one behind the seatstay bridge
  const frontMount = D.crown.clone().addScaledVector(D.steerN, 0.019).addScaledVector(D.steer, -0.004)
  const frontCal = buildCaliper(M, D.front, frontMount, 'pinzaAnt', D.steerN.clone())
  steer.add(...frontCal.meshes)
  const rearMount = frame.bridgeP.clone().add(v3(-0.006, -0.002, 0))
  const rearFace = frame.bridgeP.clone().sub(D.rear).normalize()
  const rearCal = buildCaliper(M, D.rear, rearMount, 'pinzaPost', v3(-rearFace.y, rearFace.x, 0).negate())
  rear.add(...rearCal.meshes)

  // cable housings
  const [leftLever, rightLever] = ck.leverEnds
  const barInner = barPivot.userData.inner
  const frontCableRoute = () => {
    bike.updateMatrixWorld(true)
    const toSteer = new THREE.Matrix4().copy(steer.matrixWorld).invert()
    const B = (obj, p) => obj.localToWorld(p.clone()).applyMatrix4(toSteer)
    return [
      B(barInner, rightLever.p), B(barInner, rightLever.p.clone().addScaledVector(rightLever.dir, 0.04)), B(barInner, D.stemTop.clone().add(v3(0.1, -0.12, 0.03))),
      D.crown.clone().addScaledVector(D.steerN, 0.07).addScaledVector(D.steer, 0.07).add(v3(0, 0, 0.02)), frontCal.anchor.clone().addScaledVector(frontCal.anchorDir, 0.03), frontCal.anchor,
    ]
  }
  const frontCable = part(cableGeo(frontCableRoute()), M.cable, 'guainaAnt', { sticker: false })
  steer.add(frontCable)
  // the rear cable crosses the hinge: its route is re-evaluated when folding
  const clipA = D.hinge.clone().lerp(D.mainFront, 0.55).add(v3(0, D.mainR + 0.003, -0.012))
  const clipB = D.hinge.clone().lerp(D.mainRear, 0.45).add(v3(0, D.mainR + 0.003, -0.012))
  const stUp = D.bb.clone().addScaledVector(D.seatDir, 0.2).add(v3(0.004, 0, -D.stR - 0.003))
  const rearCableRoute = () => {
    const wl = (obj, p) => obj.localToWorld(p.clone())
    bike.updateMatrixWorld(true)
    const toBike = new THREE.Matrix4().copy(bike.matrixWorld).invert()
    const B = (obj, p) => wl(obj, p).applyMatrix4(toBike)
    return [
      B(barInner, leftLever.p), B(barInner, leftLever.p.clone().addScaledVector(leftLever.dir, 0.045)), B(barInner, D.stemTop.clone().add(v3(0.075, -0.16, -0.035))),
      B(front, D.htTop.clone().add(v3(-0.03, -0.04, -0.03))), B(front, clipA), B(rear, clipB),
      B(rear, stUp.clone().add(v3(0.03, 0.02, 0))), B(rear, D.ssTop.clone().add(v3(0.006, 0.01, -0.02))),
      B(rear, rearCal.anchor.clone().addScaledVector(rearCal.anchorDir, 0.03)), B(rear, rearCal.anchor),
    ]
  }
  const rearCable = part(cableGeo(rearCableRoute()), M.cable, 'guainaPost', { sticker: false })
  bike.add(rearCable)

  bike.userData = {
    D, rear, front, frontPivot, steerPivot, steer, rearWheel, frontWheel,
    cranks: dt.cranks, chain: dt.chain, drivetrain: dt, bell: ck.bellMesh, bulb: lamp.bulb, stand,
    rearCable, rearCableRoute, frontCable, frontCableRoute, barPivot, saddleGroup, bellMesh: ck.bellMesh, leverPivot: frame.leverPivot,
  }
  return bike
}
