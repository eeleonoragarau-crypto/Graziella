// Graziella geometry, in metres. x forward, y up, +z = drive (chain) side.
// Proportions calibrated on side-view photos of a 20" Graziella-style folder.
import * as THREE from 'three'
import { DEG, v3 } from '../geo.js'

export function makeDims() {
  const D = {}
  D.tyreR = 0.254          // tyre outer radius (20" balloon)
  D.tyreHalfW = 0.0232     // 46 mm section
  D.rimR = 0.2035          // bead seat (ISO 406)
  D.rear = v3(-0.405, 0.254, 0)
  D.front = v3(0.553, 0.254, 0)
  D.bb = v3(0, 0.288, 0)

  D.headAngle = 67 * DEG
  D.seatAngle = 70 * DEG
  D.steer = v3(-Math.cos(D.headAngle), Math.sin(D.headAngle), 0)   // up the steering axis
  D.steerN = v3(Math.sin(D.headAngle), Math.cos(D.headAngle), 0)   // forward, normal to it
  D.forkLen = 0.335
  D.forkOffset = 0.045
  D.steerFoot = D.front.clone().addScaledVector(D.steerN, -D.forkOffset)
  D.crown = D.steerFoot.clone().addScaledVector(D.steer, D.forkLen)
  D.htBottom = D.crown.clone().addScaledVector(D.steer, 0.013)
  D.htLen = 0.15
  D.htTop = D.htBottom.clone().addScaledVector(D.steer, D.htLen)
  D.htR = 0.0215

  D.mainR = 0.0188
  D.mainFront = D.htBottom.clone().addScaledVector(D.steer, 0.04)
  D.mainRear = D.bb.clone()
  D.mainDir = D.mainFront.clone().sub(D.mainRear).normalize()
  D.hinge = D.mainRear.clone().lerp(D.mainFront, 0.43)
  D.hingeGap = 0.0016

  D.seatDir = v3(-Math.cos(D.seatAngle), Math.sin(D.seatAngle), 0)
  D.stLen = 0.372
  D.stR = 0.0166
  D.stTop = D.bb.clone().addScaledVector(D.seatDir, D.stLen)
  D.postR = 0.0127
  D.saddleClamp = D.bb.clone().addScaledVector(D.seatDir, 0.605)
  D.ssTop = D.bb.clone().addScaledVector(D.seatDir, 0.262)

  D.bbHalf = 0.034
  D.bbR = 0.0205
  D.rearHalfOLD = 0.056
  D.frontHalfOLD = 0.05
  D.chainZ = 0.047
  D.pitch = 0.0127
  D.ringTeeth = 44
  D.cogTeeth = 18
  D.ringR = D.pitch / (2 * Math.sin(Math.PI / D.ringTeeth))
  D.cogR = D.pitch / (2 * Math.sin(Math.PI / D.cogTeeth))
  D.crankLen = 0.152
  D.crankZ = 0.071

  D.rackY = 0.556
  D.rackFrontX = -0.118
  D.rackRearX = -0.64
  D.rackHalfW = 0.066

  D.stemTop = D.htTop.clone().addScaledVector(D.steer, 0.3)
  D.barClamp = D.stemTop.clone().add(v3(0.032, 0.012, 0))

  D.fenderR = D.tyreR + 0.016
  return D
}

// Steering axis as a THREE.Line3-ish helper
export function steerAxis(D) {
  return { origin: D.htBottom.clone(), dir: D.steer.clone() }
}

export const _tmp = new THREE.Vector3()
