// Physical arrangements as one-line choices: gamepad, dual-stick, d-pad + buttons.
//
// Each preset is a plain function returning a plain array of control specs —
// exactly what a developer could have typed by hand. Nothing here remembers
// anything, and nothing depends on an array having come from here.

// Normalized default positions (fractions of the pad, inside pad-layout's
// 0.14..0.86 clamp) for a four-button diamond on the right half. Slot order
// follows the default ids: y west, x north, b south, a east.
const DIAMOND = [
  { x: 0.52, y: 0.5 },
  { x: 0.68, y: 0.2 },
  { x: 0.68, y: 0.8 },
  { x: 0.84, y: 0.5 }
];

const GAMEPAD_BUTTONS = ['y', 'x', 'b', 'a'];
const DPAD_BUTTONS = ['b', 'a'];

/** A label ('FIRE') or { id, label }, as the developer wrote it. */
function toButton(entry, index) {
  if (entry && typeof entry === 'object') {
    const id = String(entry.id ?? entry.label ?? `button${index + 1}`);
    return { id, label: entry.label !== undefined ? String(entry.label) : id };
  }
  const label = String(entry);
  return { id: label.toLowerCase().replace(/[^a-z0-9]+/g, '') || `button${index + 1}`, label };
}

/** Rename a default id via options.ids; unknown keys are ignored. */
function idOf(options, name) {
  const renamed = options?.ids?.[name];
  return typeof renamed === 'string' && renamed ? renamed : name;
}

function buttonsFor(options, defaults) {
  if (Array.isArray(options?.buttons)) return options.buttons.map(toButton);
  return defaults.map((name) => ({ id: idOf(options, name), label: name }));
}

/** Keep ids unique even if a developer's labels collide. */
function dedupe(controls) {
  const seen = new Set();
  return controls.map((c) => {
    let id = c.id;
    for (let n = 2; seen.has(id); n++) id = `${c.id}${n}`;
    seen.add(id);
    return id === c.id ? c : { ...c, id };
  });
}

function dpadWithButtons(options, defaults, slots) {
  const buttons = buttonsFor(options, defaults).map((b, i) => ({
    id: b.id, type: 'button', label: b.label, side: 'right', ...(slots[i] ?? {})
  }));
  return dedupe([
    { id: idOf(options, 'move'), type: 'dpad', label: 'MOVE', side: 'left' },
    ...buttons
  ]);
}

export const layouts = Object.freeze({
  /** Left d-pad, right diamond of four buttons (y x b a). */
  gamepad(options = {}) {
    return dpadWithButtons(options, GAMEPAD_BUTTONS, DIAMOND);
  },

  /** Left stick `move`, right stick `aim`. */
  dualStick(options = {}) {
    return dedupe([
      { id: idOf(options, 'move'), type: 'stick', label: 'MOVE', side: 'left' },
      { id: idOf(options, 'aim'), type: 'stick', label: 'AIM', side: 'right' }
    ]);
  },

  /** Left d-pad, right pair `b` `a` in a row. */
  dpad(options = {}) {
    return dpadWithButtons(options, DPAD_BUTTONS, []);
  }
});

export default layouts;
