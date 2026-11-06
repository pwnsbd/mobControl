// Layout presets: ordinary control arrays, and the x/y hints that place them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { layouts } from '../client/layouts.js';
import * as controllerModule from '../client/controller.js';
import { defaultLayout } from '../client/phone/pad-layout.js';

const ALL = ['gamepad', 'dualStick', 'dpad'];
const ids = (controls) => controls.map((c) => c.id);

test('layouts is importable from the module that exports PhoneController', () => {
  assert.equal(typeof controllerModule.PhoneController, 'function');
  assert.equal(controllerModule.layouts, layouts);
});

test('gamepad is a left d-pad plus a four-button diamond y x b a', () => {
  const c = layouts.gamepad().controls;
  assert.deepEqual(ids(c), ['move', 'y', 'x', 'b', 'a']);
  assert.equal(c[0].type, 'dpad');
  assert.equal(c[0].side, 'left');
  assert.ok(c.slice(1).every((b) => b.type === 'button' && b.side === 'right'));
  assert.deepEqual(c.slice(1).map((b) => b.label), ['y', 'x', 'b', 'a']);
});

test('the gamepad diamond is a real diamond, not a row', () => {
  const [, y, x, b, a] = layouts.gamepad().controls;
  assert.ok(x.y < y.y && y.y === a.y && b.y > y.y, 'north above, south below, west/east level');
  assert.ok(y.x < x.x && x.x === b.x && a.x > x.x, 'west left, east right, north/south aligned');
});

test('dualStick is move left, aim right', () => {
  const c = layouts.dualStick().controls;
  assert.deepEqual(c.map((s) => [s.id, s.type, s.side]), [
    ['move', 'stick', 'left'], ['aim', 'stick', 'right']
  ]);
});

test('dpad is a left d-pad plus right b and a', () => {
  const c = layouts.dpad().controls;
  assert.deepEqual(c.map((s) => [s.id, s.type, s.side]), [
    ['move', 'dpad', 'left'], ['b', 'button', 'right'], ['a', 'button', 'right']
  ]);
});

test('ids are unique in every preset, with defaults and awkward overrides', () => {
  for (const name of ALL) {
    for (const options of [undefined, {}, { buttons: ['Fire', 'FIRE', 'fire!'] },
      { ids: { move: 'a', a: 'a' } }]) {
      const list = layouts[name](options).controls;
      assert.equal(new Set(ids(list)).size, list.length, `${name} ${JSON.stringify(options)}`);
    }
  }
});

test('buttons override takes labels or { id, label }', () => {
  const c = layouts.gamepad({ buttons: ['FIRE', { id: 'bomb', label: 'BOOM' }] }).controls;
  assert.deepEqual(c.slice(1).map((b) => [b.id, b.label]), [['fire', 'FIRE'], ['bomb', 'BOOM']]);
  assert.equal(c.slice(1).every((b) => b.type === 'button'), true);
});

test('ids renames the defaults', () => {
  assert.deepEqual(ids(layouts.gamepad({ ids: { move: 'walk', a: 'jump' } }).controls),
    ['walk', 'y', 'x', 'b', 'jump']);
  assert.deepEqual(ids(layouts.dualStick({ ids: { aim: 'look' } }).controls), ['move', 'look']);
});

test('an empty buttons list leaves the d-pad alone', () => {
  assert.deepEqual(ids(layouts.gamepad({ buttons: [] }).controls), ['move']);
  assert.deepEqual(ids(layouts.dpad({ buttons: [] }).controls), ['move']);
});

test('unknown option keys are ignored', () => {
  for (const name of ALL) {
    assert.deepEqual(layouts[name]({ bogus: 1 }), layouts[name]());
  }
});

test('presets do not mutate their options, and results are independent copies', () => {
  const options = { buttons: ['A', { id: 'b', label: 'B' }], ids: { move: 'm' } };
  const before = structuredClone(options);
  for (const name of ALL) layouts[name](options);
  assert.deepEqual(options, before);

  const one = layouts.gamepad().controls;
  one[0].id = 'changed';
  one.push({ id: 'extra', type: 'button' });
  assert.equal(layouts.gamepad().controls[0].id, 'move');
  assert.equal(layouts.gamepad().controls.length, 5);
});

test('the diamond hints sit inside the pad clamp range', () => {
  for (const c of layouts.gamepad().controls) {
    if (c.x === undefined) continue;
    assert.ok(c.x >= 0.14 && c.x <= 0.86 && c.y >= 0.14 && c.y <= 0.86, c.id);
  }
});

test('a valid x/y hint becomes the default position', () => {
  const layout = defaultLayout([{ id: 'a', type: 'button', x: 0.6, y: 0.3 }]);
  assert.deepEqual(layout.a, { x: 0.6, y: 0.3, size: 'm' });
});

test('absent x/y keeps the side/index placement', () => {
  const layout = defaultLayout([
    { id: 'a', type: 'button' }, { id: 'b', type: 'button', x: undefined, y: undefined }
  ]);
  assert.equal(layout.a.y, 0.72);
  assert.equal(layout.a.x, 0.76);
  assert.deepEqual(layout.b, { x: 0.52, y: 0.72, size: 'm' });
});

test('invalid x/y is ignored without throwing', () => {
  const placed = defaultLayout([{ id: 'a', type: 'button' }]).a;
  for (const bad of [
    { x: NaN, y: 0.3 }, { x: 0.3, y: Infinity }, { x: -0.1, y: 0.3 }, { x: 1.2, y: 0.5 },
    { x: '0.5', y: 0.5 }, { x: null, y: 0.5 }, { x: {}, y: [] }, { x: 0.5 }, { y: 0.5 }
  ]) {
    assert.deepEqual(defaultLayout([{ id: 'a', type: 'button', ...bad }]).a, placed, JSON.stringify(bad));
  }
});

test('gamepad through defaultLayout places the diamond, not a row', () => {
  const layout = defaultLayout(layouts.gamepad().controls);
  assert.equal(new Set(['y', 'x', 'b', 'a'].map((k) => `${layout[k].x},${layout[k].y}`)).size, 4);
  assert.equal(layout.x.y < layout.y.y, true);
  assert.equal(layout.move.x < 0.5, true);
});

test('each preset declares the orientation it was designed for', () => {
  assert.equal(layouts.gamepad().orientation, 'landscape');
  assert.equal(layouts.dualStick().orientation, 'landscape');
  assert.equal(layouts.dpad().orientation, 'any');
});

test('a preset is { controls, orientation } and nothing else', () => {
  for (const name of ALL) {
    const fragment = layouts[name]();
    assert.deepEqual(Object.keys(fragment).sort(), ['controls', 'orientation'], name);
    assert.ok(Array.isArray(fragment.controls), name);
  }
});
