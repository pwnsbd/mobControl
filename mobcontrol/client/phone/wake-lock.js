// Keeping the screen awake while someone is playing.
//
// A controller that nobody touches for thirty seconds is still being used —
// they are tilting it. Without this the phone dims, locks, drops the socket,
// and the game stops. The lock is also lost whenever the page is hidden, so it
// has to be taken again every time the page comes back.

export class ScreenWakeLock {
  #sentinel = null;
  #wanted = false;

  static get isSupported() {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  constructor() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (this.#wanted && document.visibilityState === 'visible') this.#take();
    });
  }

  /** @returns {Promise<boolean>} whether the screen is now held awake */
  async acquire() {
    this.#wanted = true;
    return this.#take();
  }

  async release() {
    this.#wanted = false;
    try {
      await this.#sentinel?.release();
    } catch { /* already gone */ }
    this.#sentinel = null;
  }

  get isHeld() { return Boolean(this.#sentinel); }

  async #take() {
    if (!ScreenWakeLock.isSupported || this.#sentinel) return this.isHeld;
    try {
      this.#sentinel = await navigator.wakeLock.request('screen');
      // The browser drops it on its own account too (a call, low battery).
      this.#sentinel.addEventListener?.('release', () => { this.#sentinel = null; });
      return true;
    } catch {
      // Refused — low battery, or not allowed here. Playing still works.
      this.#sentinel = null;
      return false;
    }
  }
}
