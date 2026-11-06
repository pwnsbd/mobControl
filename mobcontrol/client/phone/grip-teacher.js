// Learning how the player is actually holding the phone.
//
// A phone resting flat, screen up, is rotationally ambiguous: gravity says
// "flat" but nothing says which edge points away from you. One guided gesture
// resolves it.
//
//   1. hold still            -> the resting attitude
//   2. "tilt it to your RIGHT" -> tilting right is a turn ABOUT the forward
//                                 axis, so the axis of that turn, measured in
//                                 device coordinates, IS forward
//   3. right = forward x up
//
// `up` is taken as the device's screen normal, which holds for any flat,
// screen-up grip — exactly the assumption the fixed mount table already makes,
// but without being limited to its four right-angle poses.
//
// Pure: quaternions in, a mount quaternion out. No DOM, no sensors, no sockets.

import { difference, axisAngle, fromBasis } from '../shared/quaternion.js';
import { vec, cross, dot, normalize, reject } from '../shared/vec3.js';
import * as mounts from '../shared/mounts.js';

const SCREEN_NORMAL = vec(0, 0, 1);

export const Rejected = Object.freeze({
  NO_REST: 'no-rest',
  TOO_SMALL: 'too-small',
  TOO_FLAT: 'too-flat'
});

export class GripTeacher {
  #rest = null;
  #turn = null;

  /**
   * @param {object} [options]
   * @param {number} [options.minDegrees=12]   smaller gestures are noise
   * @param {number} [options.maxTiltOfAxis=0.7] reject a flat twist, whose axis
   *        lies along the screen normal and so says nothing about forward
   * @param {number} [options.snapDegrees=20]  snap to a named pose within this
   */
  constructor({ minDegrees = 12, maxTiltOfAxis = 0.7, snapDegrees = 20 } = {}) {
    this.minDegrees = minDegrees;
    this.maxTiltOfAxis = maxTiltOfAxis;
    this.snapDegrees = snapDegrees;
  }

  /** Step 1: the attitude the phone rests at. */
  rememberRest(attitude) { this.#rest = attitude; this.#turn = null; }

  /** Step 2: the attitude after the player has tilted to their right. */
  rememberTurn(attitude) { this.#turn = attitude; }

  get hasRest() { return this.#rest !== null; }

  /** The resting attitude, which is what a learned grip should calibrate against. */
  get restAttitude() { return this.#rest; }

  /** How far the phone has turned since rest — for a live progress meter. */
  turnedDegrees(attitude) {
    if (!this.#rest) return 0;
    return axisAngle(difference(this.#rest, attitude)).degrees;
  }

  /**
   * @returns {{ok:true, quaternion, degrees:number, mount:string|null}
   *          |{ok:false, reason:string}}
   */
  solve() {
    if (!this.#rest || !this.#turn) return { ok: false, reason: Rejected.NO_REST };

    const turn = axisAngle(difference(this.#rest, this.#turn));
    if (turn.degrees < this.minDegrees) return { ok: false, reason: Rejected.TOO_SMALL };

    // A turn about the screen normal is a flat twist: it tells us nothing.
    if (Math.abs(dot(turn.axis, SCREEN_NORMAL)) > this.maxTiltOfAxis) {
      return { ok: false, reason: Rejected.TOO_FLAT };
    }

    const forward = normalize(reject(turn.axis, SCREEN_NORMAL));
    const right = cross(forward, SCREEN_NORMAL);

    // Where this grip sits relative to "top edge away", in degrees.
    const degrees = Math.atan2(-forward.x, forward.y) * (180 / Math.PI);
    const snapped = this.#snap(degrees);

    return snapped
      ? { ok: true, quaternion: mounts.rotationOf(snapped), degrees, mount: snapped }
      : { ok: true, quaternion: fromBasis(right, forward, SCREEN_NORMAL), degrees, mount: null };
  }

  /** A sloppy gesture near a named pose should just be that pose. */
  #snap(degrees) {
    return mounts.names().find(
      (name) => Math.abs(wrap180(mounts.get(name).degrees - degrees)) <= this.snapDegrees
    ) ?? null;
  }
}

function wrap180(d) {
  const folded = ((d + 180) % 360 + 360) % 360;
  return folded - 180;
}
