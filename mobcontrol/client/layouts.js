// Physical arrangements as one-line choices: gamepad, dual-stick, d-pad + buttons.
//
// Each preset is a plain function returning a plain config fragment,
// { controls, orientation } — exactly what a developer could have typed by
// hand. Nothing here remembers anything, and nothing depends on a fragment
// having come from here. Spread it, or take just `.controls`.

// Normalized default positions (fractions of the pad, inside pad-layout's
// 0.14..0.86 clamp) for a four-button diamond on the right half. Slot order
// follows the default ids: y west, x north, b south, a east.
// Sized and spaced from the WORST case, which is landscape: the pad is then
// about 289pt tall, and a small button is 0.23 of the short edge, so the north
// and south slots need a third of the pad's height between their centres or
// they touch. Portrait is roomier and inherits the same numbers.
// Tuned against landscape alone, which is the only way this preset is played:
// a 776x289 pad and an 86pt small button leave ~22pt between neighbours.
const DIAMOND = [
  { x: 0.58, y: 0.615, size: 's', accent: 'amber' },   // west
  { x: 0.70, y: 0.42, size: 's', accent: 'blue' },     // north
  { x: 0.70, y: 0.81, size: 's', accent: 'red' },      // south
  { x: 0.82, y: 0.615, size: 's', accent: 'green' }    // east
];

const GAMEPAD_BUTTONS = ['y', 'x', 'b', 'a'];
const DPAD_BUTTONS = ['b', 'a'];
const DPAD_SLOTS = [{ accent: 'red' }, { accent: 'green' }];

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
