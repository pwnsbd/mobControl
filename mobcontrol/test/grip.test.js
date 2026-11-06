// Learning the grip from a guided gesture.
//
// All of this is pure, so a grip that would need a hand and a phone to try can
// be checked in milliseconds instead.

import test from 'node:test';
import assert from 'node:assert/strict';

import { multiply, fromAxisAngle, fromBasis, axisAngle } from '../client/shared/quaternion.js';
import { toQuaternion } from '../client/shared/orientation.js';
import { vec } from '../client/shared/vec3.js';
import * as mounts from '../client/shared/mounts.js';
import { GripTeacher, Rejected } from '../client/phone/grip-teacher.js';

const closeTo = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);

const sameRotation = (a, b) => {
  // q and -q are the same rotation, so compare the angle between them.
  const dot = Math.abs(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z);
  closeTo(dot, 1, 1e-6);
};

// --- fromBasis -------------------------------------------------------------

test('fromBasis reproduces every mount in the table', () => {
  // Body axes are X=right, Y=forward, Z=up, expressed in device coordinates.
  const expected = {
    'portrait-up': [vec(1, 0, 0), vec(0, 1, 0)],
    'landscape-left': [vec(0, -1, 0), vec(1, 0, 0)],
    'landscape-right': [vec(0, 1, 0), vec(-1, 0, 0)],
    'portrait-down': [vec(-1, 0, 0), vec(0, -1, 0)]
  };
  for (const [name, [right, forward]] of Object.entries(expected)) {
    sameRotation(fromBasis(right, forward, vec(0, 0, 1)), mounts.rotationOf(name));
  }
});

test('axisAngle recovers the axis a rotation was made about', () => {
  const { axis, degrees } = axisAngle(fromAxisAngle('y', 37));
  closeTo(degrees, 37, 1e-9);
  closeTo(axis.x, 0, 1e-9);
  closeTo(axis.y, 1, 1e-9);
  closeTo(axis.z, 0, 1e-9);
});

// --- teaching --------------------------------------------------------------

/**
 * Tilting the right-hand edge down is a positive turn about the FORWARD axis.
 * So to fake a player in a known grip, rotate about that grip's forward axis.
 */
function tiltRight(rest, forwardAxis, degrees) {
  return multiply(rest, fromAxisAngle(forwardAxis, degrees));
}

test('a taught grip matches the mount the player is actually using', () => {
  // forward, in device axes, for each pose
  const forwardAxisOf = {
    'portrait-up': 'y',
    'landscape-left': 'x'
  };
  const rest = toQuaternion({ alpha: 143, beta: 3, gamma: -2 });

  for (const [name, axis] of Object.entries(forwardAxisOf)) {
    const teacher = new GripTeacher();
    teacher.rememberRest(rest);
    teacher.rememberTurn(tiltRight(rest, axis, 35));

    const result = teacher.solve();
    assert.ok(result.ok, `expected ${name} to solve`);
    assert.equal(result.mount, name);
    sameRotation(result.quaternion, mounts.rotationOf(name));
  }
});

test('a grip held at an angle no table could name still solves', () => {
  const rest = toQuaternion({ alpha: 0, beta: 0, gamma: 0 });
  // Forward lies 40 degrees between the device's +Y and +X axes.
  const forward = multiply(fromAxisAngle('z', -40), { w: 1, x: 0, y: 0, z: 0 });
  const tilted = multiply(rest, rotateAbout(forward, 35));

  const teacher = new GripTeacher();
  teacher.rememberRest(rest);
  teacher.rememberTurn(tilted);

  const result = teacher.solve();
  assert.ok(result.ok);
  assert.equal(result.mount, null, 'should not snap to a named pose');
  closeTo(result.degrees, -40, 0.5);
});

/** A rotation of `degrees` about the axis that `orientation` points along. */
function rotateAbout(orientation, degrees) {
  // orientation is a quaternion whose rotation carries +Y onto the wanted axis
  const a = axisOfY(orientation);
  const half = (degrees * Math.PI) / 360;
  const s = Math.sin(half);
  return { w: Math.cos(half), x: a.x * s, y: a.y * s, z: a.z * s };
}
function axisOfY(q) {
  // rotate (0,1,0) by q
  const { w, x, y, z } = q;
  return {
    x: 2 * (x * y - w * z),
    y: 1 - 2 * (x * x + z * z),
    z: 2 * (y * z + w * x)
  };
}

test('too small a gesture is rejected rather than guessed at', () => {
  const rest = toQuaternion({ alpha: 10, beta: 0, gamma: 0 });
  const teacher = new GripTeacher();
  teacher.rememberRest(rest);
  teacher.rememberTurn(tiltRight(rest, 'x', 4));
  assert.deepEqual(teacher.solve(), { ok: false, reason: Rejected.TOO_SMALL });
});

test('a flat twist is rejected, because it says nothing about forward', () => {
  const rest = toQuaternion({ alpha: 10, beta: 0, gamma: 0 });
  const teacher = new GripTeacher();
  teacher.rememberRest(rest);
  teacher.rememberTurn(multiply(rest, fromAxisAngle('z', 40)));   // spun flat
  assert.deepEqual(teacher.solve(), { ok: false, reason: Rejected.TOO_FLAT });
});

test('solving before anything was recorded fails cleanly', () => {
  assert.deepEqual(new GripTeacher().solve(), { ok: false, reason: Rejected.NO_REST });
});

test('turnedDegrees tracks the gesture for a live meter', () => {
  const rest = toQuaternion({ alpha: 0, beta: 0, gamma: 0 });
  const teacher = new GripTeacher();
  assert.equal(teacher.turnedDegrees(rest), 0, 'no rest yet');
  teacher.rememberRest(rest);
  closeTo(teacher.turnedDegrees(tiltRight(rest, 'x', 22)), 22, 1e-6);
});
