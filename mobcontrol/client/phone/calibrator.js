// Turning a device attitude into a vehicle attitude.
//
// Pure: no sensors, no DOM, no sockets. Give it quaternions, get angles back.
// This is the heart of the module and the reason the rest can be swapped out
// freely — it is also the only part with tests.

import { changeBasis, difference } from '../shared/quaternion.js';
import { fromQuaternion, wrapDegrees } from '../shared/orientation.js';
import * as mounts from '../shared/mounts.js';

export class Calibrator {
  #reference = null;
  #mountName;
  #mountRotation;

  constructor(mountName = mounts.DEFAULT_MOUNT) {
    this.mount = mountName;
  }

  set mount(name) {
    this.#mountName = mounts.get(name).name;
    this.#mountRotation = mounts.rotationOf(name);
  }

  get mount() { return this.#mountName; }

  /**
   * Use a grip measured from the player rather than one looked up by name.
   * Everything downstream is unchanged — it is the same quaternion, obtained
   * a different way.
   */
  useMeasuredMount(quaternion, label = 'measured') {
    this.#mountName = label;
    this.#mountRotation = quaternion;
  }

  get isCalibrated() { return this.#reference !== null; }

  /** Adopt this attitude as "straight and level". */
  capture(attitude) {
    this.#reference = attitude;
  }

  forget() {
    this.#reference = null;
  }

  /**
   * The change since calibration, expressed in vehicle axes.
   * @returns {{yaw:number, pitch:number, roll:number}|null} degrees, or null
   *          if nothing has been captured yet.
   *
   * +yaw turns right, +pitch is nose up, +roll is right side down.
   */
  toVehicleAngles(attitude) {
    if (!this.#reference) return null;

    const sinceCalibration = difference(this.#reference, attitude);
    const inVehicleAxes = changeBasis(sinceCalibration, this.#mountRotation);
    const { alpha, beta, gamma } = fromQuaternion(inVehicleAxes);

    return {
      // alpha runs anticlockwise seen from above; flip it so right is positive.
      yaw: wrapDegrees(-alpha),
      pitch: wrapDegrees(beta),
      roll: wrapDegrees(gamma)
    };
  }
}
