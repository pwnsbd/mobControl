// Where attitude readings come from.
//
// The contract an orientation source must satisfy:
//
//     start(onSample)   // onSample(quaternion) — call until stop()
//     stop()
//
// The app takes one by injection, so a replay source for tests, a smoothed
// source, or a future one built on the Sensor API can replace this without
// the app changing.

import { toQuaternion } from '../shared/orientation.js';

export class DeviceOrientationSource {
  #handler = null;

  static get isAvailable() {
    return typeof window !== 'undefined' && 'ondeviceorientation' in window;
  }

  start(onSample) {
    this.#handler = (event) => {
      if (event.alpha === null && event.beta === null && event.gamma === null) return;
      onSample(toQuaternion({
        alpha: event.alpha ?? 0,
        beta: event.beta ?? 0,
        gamma: event.gamma ?? 0
      }));
    };
    window.addEventListener('deviceorientation', this.#handler);
  }

  stop() {
    if (this.#handler) window.removeEventListener('deviceorientation', this.#handler);
    this.#handler = null;
  }
}
