// The maths a stick and a D-pad are built from.
//
// The drawing needs a browser; the geometry does not, and the geometry is the
// part that would be wrong.

import test from 'node:test';
import assert from 'node:assert/strict';

import { clampToUnit, snapToEight } from '../client/phone/controls.js';

const closeTo = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);

test('a thumb inside the base reports where it is', () => {
  const v = clampToUnit({ x: 0.3, y: -0.4 });
  closeTo(v.x, 0.3);
  closeTo(v.y, -0.4);
});

test('a thumb dragged outside the base stays on its rim', () => {
  const v = clampToUnit({ x: 3, y: 4 });        // length 5
  closeTo(Math.hypot(v.x, v.y), 1);
  closeTo(v.x, 0.6);
  closeTo(v.y, 0.8);
});

test('a dpad ignores a thumb resting near the middle', () => {
  assert.deepEqual(snapToEight({ x: 0.1, y: 0.1 }), { x: 0, y: 0 });
});

test('a dpad commits to one of four directions', () => {
  assert.deepEqual(snapToEight({ x: 0.9, y: 0.02 }), { x: 1, y: 0 });
  assert.deepEqual(snapToEight({ x: -0.9, y: 0.02 }), { x: -1, y: 0 });
  assert.deepEqual(snapToEight({ x: 0.02, y: 0.9 }), { x: 0, y: 1 });
  assert.deepEqual(snapToEight({ x: 0.02, y: -0.9 }), { x: 0, y: -1 });
});

test('a dpad allows the diagonals too', () => {
  assert.deepEqual(snapToEight({ x: 0.6, y: 0.6 }), { x: 1, y: 1 });
  assert.deepEqual(snapToEight({ x: -0.6, y: 0.6 }), { x: -1, y: 1 });
});

test('a dpad never reports a fractional direction', () => {
  for (let angle = 0; angle < 360; angle += 7) {
    const radians = (angle * Math.PI) / 180;
    const { x, y } = snapToEight({ x: Math.cos(radians), y: Math.sin(radians) });
    assert.ok([-1, 0, 1].includes(x), `x was ${x} at ${angle} degrees`);
    assert.ok([-1, 0, 1].includes(y), `y was ${y} at ${angle} degrees`);
  }
});
