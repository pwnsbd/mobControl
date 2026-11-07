// Acceleration and turn rate, straight from the platform.
//
// Same contract as the orientation source: start(onSample) / stop(). A sample
// is { acceleration, rotationRate }, both in device coordinates — acceleration
// in m/s² with gravity already removed, rotation in deg/s.
//
// Kept separate from orientation because it is a separate permission on iOS
// and a separate thing to fake in a test.

const vector = (source, axes) => source
  ? Object.fromEntries(axes.map((axis) => [axis, source[axis] ?? null]))
  : null;

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
        acceleration: vector(a, ['x', 'y', 'z']),
        // rotationRate is given about the device's Z, X and Y axes.
        rotationRate: r ? { x: r.beta ?? null, y: r.gamma ?? null, z: r.alpha ?? null } : null
      });
    };
    window.addEventListener('devicemotion', this.#handler);
  }

  stop() {
    if (this.#handler) window.removeEventListener('devicemotion', this.#handler);
    this.#handler = null;
  }
}
