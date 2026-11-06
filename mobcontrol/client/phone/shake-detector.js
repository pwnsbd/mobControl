// Acceleration in, a 0…1 "shake" out.
//
// A policy, not a fact: the threshold and decay are a judgement about what
// counts as a deliberate shake versus an ordinary unsteady hand. Isolated here
// so that judgement can be replaced (a gesture classifier, a tap detector)
// without touching the sensor plumbing.

export class ShakeDetector {
  #level = 0;

  /**
   * @param {object} [options]
   * @param {number} [options.floorMs2=2.5]  below this is hand tremor, ignored
   * @param {number} [options.spanMs2=12]    acceleration above the floor that reads as 1.0
   * @param {number} [options.decay=0.9]     fraction kept per sample
   */
  constructor({ floorMs2 = 2.5, spanMs2 = 12, decay = 0.9 } = {}) {
    this.floorMs2 = floorMs2;
    this.spanMs2 = spanMs2;
    this.decay = decay;
  }

  get level() { return this.#level; }

  /** @param {{x:number,y:number,z:number}} acceleration */
  feed({ x, y, z }) {
    const magnitude = Math.hypot(x, y, z);
    const hit = clamp01((magnitude - this.floorMs2) / this.spanMs2);
    this.#level = Math.max(this.#level * this.decay, hit);
    return this.#level;
  }

  reset() { this.#level = 0; }
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
