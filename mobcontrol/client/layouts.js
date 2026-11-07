// Physical arrangements as one-line choices: gamepad, dual-stick, d-pad + buttons.
//
// Each preset is a plain function returning a plain config fragment,
// { controls, orientation } — exactly what a developer could have typed by
// hand. Nothing here remembers anything, and nothing depends on a fragment
// having come from here. Spread it, or take just `.controls`.

// Normalized positions for the existing landscape diamond. Preset semantics
// stay unchanged while the developer/player product contract is discussed.
const DIAMOND = [
  { x: 0.58, y: 0.615, size: 's', accent: 'amber' },
  { x: 0.70, y: 0.42, size: 's', accent: 'blue' },
  { x: 0.70, y: 0.81, size: 's', accent: 'red' },
  { x: 0.82, y: 0.615, size: 's', accent: 'green' }
];

const GAMEPAD_BUTTONS = ['y', 'x', 'b', 'a'];
const DPAD_BUTTONS = ['b', 'a'];
const DPAD_SLOTS = [{ accent: 'red' }, { accent: 'green' }];

/** A label ('FIRE') or { id, label }, as the developer wrote it. */
function toButton(entry, index) {
  if (entry && typeof entry === 'object') {
    const id = String(entry.id ?? entry.label ?? `button${index + 1}`);
    return {
      id, label: entry.label !== undefined ? String(entry.label) : id,
      ...(entry.haptic === true ? { haptic: true } : {})
    };
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
    ...b, type: 'button', side: 'right', ...(slots[i] ?? {})
  }));
  return dedupe([
    { id: idOf(options, 'move'), type: 'dpad', label: 'MOVE', side: 'left' },
    ...buttons
  ]);
}

export const layouts = Object.freeze({
  /** One movement input and up to four actions, arranged by the phone. */
  simple({ movement = 'none', buttons = [], recommendedOrientation = 'landscape',
    orientation = recommendedOrientation } = {}) {
    if (!['none', 'stick', 'dpad', 'tilt'].includes(movement)) {
      throw new TypeError('Choose movement: none, stick, dpad, or tilt.');
    }
    if (!Array.isArray(buttons) || buttons.length > 4) {
      throw new TypeError('The simple layout supports up to four action buttons.');
    }
    if (!['portrait', 'landscape', 'any'].includes(orientation)) {
      throw new TypeError('Choose an orientation: portrait, landscape, or any.');
    }
    const accents = new Map([['A', 'green'], ['B', 'red'], ['X', 'blue'], ['Y', 'yellow']]);
    const controls = buttons.map((entry, index) => {
      const button = toButton(entry, index);
      return { ...button, type: 'button', accent: accents.get(button.label.toUpperCase()) };
    });
    if (movement === 'stick' || movement === 'dpad') {
      controls.unshift({ id: 'move', type: movement, label: 'Move' });
    }
    if (new Set(controls.map(({ id }) => id)).size !== controls.length) {
      throw new TypeError('Give every control a unique ID.');
    }
    return { controls, axes: movement === 'tilt' ? { x: 'roll' } : {}, orientation };
  },

  /** Left d-pad, right diamond of four buttons (y x b a). */
  gamepad(options = {}) {
    return { controls: dpadWithButtons(options, GAMEPAD_BUTTONS, DIAMOND), orientation: 'landscape' };
  },

  /** Left stick `move`, right stick `aim`. */
  dualStick(options = {}) {
    return {
      controls: dedupe([
        { id: idOf(options, 'move'), type: 'stick', label: 'MOVE', side: 'left' },
        { id: idOf(options, 'aim'), type: 'stick', label: 'AIM', side: 'right' }
      ]),
      orientation: 'landscape'
    };
  },

  /** Left d-pad, right pair `b` `a` in a row. */
  dpad(options = {}) {
    return { controls: dpadWithButtons(options, DPAD_BUTTONS, DPAD_SLOTS), orientation: 'any' };
  }
});

export default layouts;
