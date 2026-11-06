// Acceleration and turn rate, straight from the platform.
//
// Same contract as the orientation source: start(onSample) / stop(). A sample
// is { acceleration, rotationRate }, both in device coordinates — acceleration
// in m/s² with gravity already removed, rotation in deg/s.
//
// Kept separate from orientation because it is a separate permission on iOS
// and a separate thing to fake in a test.

const ZERO = { x: 0, y: 0, z: 0 };

export class DeviceMotionSource {
  #handler = null;

  static get isAvailable() {
    return typeof window !== 'undefined' && 'ondevicemotion' in window;
  }

  start(onSample) {
    this.#handler = (event) => {
      const a = event.acceleration;
      const r = event.rotationRate;
      if (!a && !r) return;                    // some devices report neither
      onSample({
        acceleration: a ? { x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 } : ZERO,
        // rotationRate is given about the device's Z, X and Y axes.
        rotationRate: r ? { x: r.beta ?? 0, y: r.gamma ?? 0, z: r.alpha ?? 0 } : ZERO
      });
    };
    window.addEventListener('devicemotion', this.#handler);
  }

  stop() {
    if (this.#handler) window.removeEventListener('devicemotion', this.#handler);
    this.#handler = null;
  }
}
