// The smallest event emitter that does the job, so no class below needs to
// grow its own listener bookkeeping.

export class Emitter {
  #listeners = new Map();

  on(name, fn) {
    if (!this.#listeners.has(name)) this.#listeners.set(name, new Set());
    this.#listeners.get(name).add(fn);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    this.#listeners.get(name)?.delete(fn);
  }

  emit(name, payload) {
    for (const fn of this.#listeners.get(name) ?? []) {
      try {
        fn(payload);
      } catch (error) {
        // One bad listener must not stop the others, or the sensor loop.
        console.error(`[mobcontrol] listener for "${name}" threw:`, error);
      }
    }
  }
}
