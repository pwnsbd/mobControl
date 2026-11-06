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
export function layoutKey(controls) {
  return STORAGE_PREFIX + controls.map((c) => `${c.id}:${c.type}`).sort().join(',');
}

/** Start from the control's type and the developer's hint; the player moves it. */
export function defaultLayout(controls) {
  const seen = { left: 0, right: 0 };
  const layout = {};
  for (const control of controls) {
    const byType = BY_TYPE[control.type] ?? BY_TYPE.button;
    const side = control.side === 'left' || control.side === 'right' ? control.side : byType.side;
    const index = seen[side]++;
    const x = side === 'right' ? EDGE_X - index * STEP_X : 1 - EDGE_X + index * STEP_X;
    const hinted = isFraction(control.x) && isFraction(control.y);
    layout[control.id] = hinted
      ? { x: clamp(control.x, 0.14, 0.86), y: clamp(control.y, 0.14, 0.86), size: byType.size }
      : { x: clamp(x, 0.14, 0.86), y: DEFAULT_Y, size: byType.size };
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
export function clampPosition({ x, y }, size, aspect) {
  const halfX = SIZE_FRACTION[size] / 2;
  const halfY = (SIZE_FRACTION[size] * aspect) / 2;
  return {
    x: clamp(x, halfX, 1 - halfX),
    y: clamp(y, Math.min(halfY, 0.5), Math.max(1 - halfY, 0.5))
  };
}

export function nextSize(size) {
  return SIZES[(SIZES.indexOf(size) + 1) % SIZES.length];
}

/** Drop anything that is not a control this game declared, and fill the gaps. */
export function reconcile(stored, controls) {
  const fallback = defaultLayout(controls);
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
    && SIZES.includes(entry.size);
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

  load(controls) {
    if (!controls.length) return {};
    let stored = null;
    try {
      stored = JSON.parse(this.#storage?.getItem(layoutKey(controls)) ?? 'null');
    } catch { /* unreadable or corrupt — fall back to the defaults */ }
    return reconcile(stored, controls);
  }

  save(controls, layout) {
    try {
      this.#storage?.setItem(layoutKey(controls), JSON.stringify(layout));
    } catch { /* not important enough to break play over */ }
  }

  forget(controls) {
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
