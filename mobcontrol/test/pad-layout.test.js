// Where the buttons sit.
//
// Positions are fractions, storage is injected, and nothing here touches the
// DOM — so the whole layout model is checkable without a phone or a browser.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIZE_FRACTION, layoutKey, defaultLayout, clampPosition, nextSize, reconcile,
  PadLayoutStore
} from '../client/phone/pad-layout.js';

const BUTTONS = [
  { id: 'jump', type: 'button', label: 'JUMP', side: 'right' },
  { id: 'fire', type: 'button', label: 'FIRE', side: 'left' }
];

/** A stand-in for localStorage that cannot throw. */
const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    get size() { return map.size; }
  };
};

test('the same button set always maps to the same key, whatever the order', () => {
  assert.equal(
    layoutKey(BUTTONS),
    layoutKey([...BUTTONS].reverse())
  );
  assert.notEqual(layoutKey(BUTTONS), layoutKey([{ id: 'jump' }]));
});

test('defaults follow the side the developer asked for', () => {
  const layout = defaultLayout(BUTTONS);
  assert.ok(layout.jump.x > 0.5, 'a right-side button starts on the right');
  assert.ok(layout.fire.x < 0.5, 'a left-side button starts on the left');
  assert.equal(layout.jump.size, 'm');
});

test('several buttons on one side do not land on top of each other', () => {
  const layout = defaultLayout([
    { id: 'a', type: 'button', side: 'right' },
    { id: 'b', type: 'button', side: 'right' },
    { id: 'c', type: 'button', side: 'right' }
  ]);
  const xs = Object.values(layout).map((p) => p.x);
  assert.equal(new Set(xs).size, 3);
});

test('a stick lands under the left thumb and a button under the right', () => {
  const layout = defaultLayout([
    { id: 'move', type: 'dpad' },
    { id: 'jump', type: 'button' }
  ]);
  assert.ok(layout.move.x < 0.5, 'the dpad goes left');
  assert.ok(layout.jump.x > 0.5, 'the button goes right');
  assert.equal(layout.move.size, 'l', 'a thumb rests on a pad, so it starts larger');
  assert.equal(layout.jump.size, 'm');
});

test('changing a control from a button to a stick does not reuse its layout', () => {
  assert.notEqual(
    layoutKey([{ id: 'move', type: 'button' }]),
    layoutKey([{ id: 'move', type: 'dpad' }])
  );
});

test('a button cannot be dragged off the pad', () => {
  const aspect = 375 / 500;
  const far = clampPosition({ x: 2, y: -3 }, 'l', aspect);
  assert.ok(far.x <= 1 - SIZE_FRACTION.l / 2 + 1e-9);
  assert.ok(far.x >= SIZE_FRACTION.l / 2 - 1e-9);
  assert.ok(far.y >= 0 && far.y <= 1);

  const inside = clampPosition({ x: 0.5, y: 0.5 }, 's', aspect);
  assert.deepEqual(inside, { x: 0.5, y: 0.5 }, 'the middle is always allowed');
});

test('sizes cycle round', () => {
  assert.equal(nextSize('s'), 'm');
  assert.equal(nextSize('m'), 'l');
  assert.equal(nextSize('l'), 's');
});

test('a stored layout for different buttons is discarded, not trusted', () => {
  const stale = { jump: { x: 0.2, y: 0.3, size: 'l' }, ghost: { x: 0.9, y: 0.9, size: 's' } };
  const layout = reconcile(stale, BUTTONS);
  assert.deepEqual(Object.keys(layout).sort(), ['fire', 'jump']);
  assert.deepEqual(layout.jump, { x: 0.2, y: 0.3, size: 'l' }, 'a known button is kept');
  assert.ok(layout.fire, 'a missing one falls back to its default');
});

test('corrupt entries fall back instead of breaking the pad', () => {
  const rubbish = { jump: { x: 'left', y: null, size: 'enormous' } };
  const layout = reconcile(rubbish, BUTTONS);
  assert.deepEqual(layout.jump, defaultLayout(BUTTONS).jump);
});

test('a layout survives being saved and loaded again', () => {
  const store = new PadLayoutStore(fakeStorage());
  const moved = { jump: { x: 0.2, y: 0.4, size: 'l' }, fire: { x: 0.8, y: 0.6, size: 's' } };
  store.save(BUTTONS, moved);
  assert.deepEqual(store.load(BUTTONS), moved);
});

test('forgetting a layout returns the player to the defaults', () => {
  const store = new PadLayoutStore(fakeStorage());
  store.save(BUTTONS, { jump: { x: 0.1, y: 0.1, size: 's' }, fire: { x: 0.9, y: 0.9, size: 's' } });
  store.forget(BUTTONS);
  assert.deepEqual(store.load(BUTTONS), defaultLayout(BUTTONS));
});

test('storage that throws is survivable', () => {
  const hostile = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  };
  const store = new PadLayoutStore(hostile);
  assert.deepEqual(store.load(BUTTONS), defaultLayout(BUTTONS));
  store.save(BUTTONS, defaultLayout(BUTTONS));     // must not throw
  store.forget(BUTTONS);
});

test('a game with no controls has nothing to lay out', () => {
  assert.deepEqual(new PadLayoutStore(fakeStorage()).load([]), {});
});
