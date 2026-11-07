// Where the controls sit — the player's business, not the game's.
//
// The game declares WHICH controls exist; it never learns where they ended up,
// because it only ever reads pad.button.<id> and pad.stick.<id>. That makes a
// layout editor a view-layer concern and nothing more.
//
// Positions are fractions of the pad area (0..1, measured to the control's
// centre) rather than pixels, so a layout survives a different phone, a
// rotation, or a resized window.

export const SIZES = ['s', 'm', 'l'];

/** Control diameter, as a fraction of the pad's WIDTH. */
export const SIZE_FRACTION = Object.freeze({ s: 0.23, m: 0.3, l: 0.38 });

/** Resolve a preset or an explicitly stored width fraction. */
export function sizeFraction(size) {
  if (typeof size === 'number') return Number.isFinite(size) && size > 0 ? size : undefined;
  return SIZES.includes(size) ? SIZE_FRACTION[size] : undefined;
}

/** Largest circular control that fits within the pad and clears its neighbors. */
export function maxControlDiameter(center, box, neighbors = []) {
  const { width, height } = box;
  let maximum = Math.max(0, Math.min(
    2 * center.x * width, 2 * (1 - center.x) * width,
    2 * center.y * height, 2 * (1 - center.y) * height
  ));
  for (const neighbor of neighbors) {
    const dx = (center.x - neighbor.x) * width;
    const dy = (center.y - neighbor.y) * height;
    const clearRadius = Math.hypot(dx, dy) - neighbor.diameter / 2 - 8;
    maximum = Math.min(maximum, 2 * clearRadius);
  }
  return Math.max(0, maximum);
}

const STORAGE_PREFIX = 'mobcontrol:pad:';
const DEFAULT_Y = 0.72;
const EDGE_X = 0.76;
const STEP_X = 0.24;

/** A thumb rests on a stick; it reaches for a button. So they differ. */
const BY_TYPE = {
  stick: { side: 'left', size: 'l' },
  dpad: { side: 'left', size: 'l' },
  button: { side: 'right', size: 'm' }
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Same controls, same key — so each game remembers its own arrangement. */
export function layoutKey(controls, orientation) {
  const key = STORAGE_PREFIX + controls.map((c) => `${c.id}:${c.type}`).sort().join(',');
  return orientation ? `${key}:${orientation}` : key;
}

/** Start from the control's type and the developer's hint; the player moves it. */
export function defaultLayout(controls, orientation) {
  const buttons = controls.filter(({ type }) => type === 'button');
  if (orientation && buttons.length <= 4 && controls.length - buttons.length <= 1
      && controls.every(({ side, x, y, size }) => side == null && x == null && y == null && size == null)) {
    const center = 0.53;
    const step = orientation === 'portrait' ? 0.17 : 0.26;
    const left = [0.58, center];
    const right = [0.86, center];
    const top = [0.72, center - step];
    const bottom = [0.72, center + step];
    const slots = [[], [[0.76, center]], [left, right], [top, left, right], [top, left, right, bottom]];
    const classic = ['Y', 'X', 'B', 'A'].map((label) =>
      buttons.find((button) => String(button.label ?? '').toUpperCase() === label));
    const ordered = buttons.length === 4 && classic.every(Boolean) ? classic : buttons;
    const entries = ordered.map(({ id }, index) => {
      const [x, y] = slots[buttons.length][index];
      return [id, { x, y, size: buttons.length === 1 ? 'm' : 's' }];
    });
    const movement = controls.find(({ type }) => type !== 'button');
    if (movement) entries.push([movement.id, { x: 0.23, y: center, size: 'l' }]);
    return Object.fromEntries(entries);
  }
  const seen = { left: 0, right: 0 };
  const layout = {};
  for (const control of controls) {
    const byType = BY_TYPE[control.type] ?? BY_TYPE.button;
    const side = control.side === 'left' || control.side === 'right' ? control.side : byType.side;
    const index = seen[side]++;
    const x = side === 'right' ? EDGE_X - index * STEP_X : 1 - EDGE_X + index * STEP_X;
    const hinted = isFraction(control.x) && isFraction(control.y);
    // A cluster of four needs smaller parts than a lone button, so size is a
    // hint too. Anything that is not a known size falls back to the type's.
    const size = SIZES.includes(control.size) ? control.size : byType.size;
    layout[control.id] = hinted
      ? { x: clamp(control.x, 0.14, 0.86), y: clamp(control.y, 0.14, 0.86), size }
      : { x: clamp(x, 0.14, 0.86), y: DEFAULT_Y, size };
  }
  return layout;
}

/** A developer's x/y hint is only used as a pair; anything else is ignored. */
function isFraction(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

/**
 * Keep a control fully inside the pad.
 * @param {number} aspect pad width / pad height
 */
export function clampPosition({ x, y }, size, aspect, widthFraction = sizeFraction(size)) {
  const halfX = widthFraction / 2;
  const halfY = (widthFraction * aspect) / 2;
  return {
    x: clamp(x, halfX, 1 - halfX),
    y: clamp(y, Math.min(halfY, 0.5), Math.max(1 - halfY, 0.5))
  };
}

/** Drop anything that is not a control this game declared, and fill the gaps. */
export function reconcile(stored, controls, orientation) {
  const fallback = defaultLayout(controls, orientation);
  if (!stored) return fallback;
  const layout = {};
  for (const control of controls) {
    const saved = stored[control.id];
    layout[control.id] = isUsable(saved) ? { ...saved } : fallback[control.id];
  }
  return layout;
}

function isUsable(entry) {
  return Boolean(entry)
    && Number.isFinite(entry.x) && entry.x >= 0 && entry.x <= 1
    && Number.isFinite(entry.y) && entry.y >= 0 && entry.y <= 1
    && sizeFraction(entry.size) !== undefined;
}

/**
 * Reading and writing the player's arrangement.
 * Storage is injected so this can be tested without a browser, and because
 * localStorage throws outright in some private-browsing modes.
 */
export class PadLayoutStore {
  #storage;

  constructor(storage = safeLocalStorage()) {
    this.#storage = storage;
  }

  load(controls, orientation) {
    if (!controls.length) return {};
    let stored = null;
    try {
      const saved = this.#storage?.getItem(layoutKey(controls, orientation))
        ?? this.#storage?.getItem(layoutKey(controls));
      stored = JSON.parse(saved ?? 'null');
    } catch { /* unreadable or corrupt — fall back to the defaults */ }
    return reconcile(stored, controls, orientation);
  }

  save(controls, layout, orientation) {
    try {
      this.#storage?.setItem(layoutKey(controls, orientation), JSON.stringify(layout));
    } catch { /* not important enough to break play over */ }
  }

  forget(controls, orientation) {
    if (orientation) return this.save(controls, null, orientation);
    try {
      this.#storage?.removeItem(layoutKey(controls));
    } catch { /* ignore */ }
  }
}

function safeLocalStorage() {
  try {
    globalThis.localStorage?.getItem('probe');
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
