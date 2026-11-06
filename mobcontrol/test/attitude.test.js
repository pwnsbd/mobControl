// The attitude maths and the axis mapping, tested headlessly.
//
// This is the payoff from keeping both free of sensors and DOM: the parts most
// likely to break under a refactor run in Node in milliseconds.
//
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MessageType } from '../client/shared/protocol.js';

import { fromAxisAngle, multiply, IDENTITY } from '../client/shared/quaternion.js';
import { toQuaternion, fromQuaternion, wrapDegrees } from '../client/shared/orientation.js';
import { Calibrator } from '../client/phone/calibrator.js';
import * as mounts from '../client/shared/mounts.js';
import {
  applyDeadzone, normalise, smooth, createAxisMapper
} from '../client/game/axis-pipeline.js';

const closeTo = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);

const anglesCloseTo = (actual, expected, tolerance = 1e-6) => {
  for (const axis of Object.keys(expected)) closeTo(actual[axis], expected[axis], tolerance);
};

// --- the one constant that lives in two places -----------------------------

test('the relay sniffs for the same layout type the protocol defines', () => {
  // The server is CommonJS and cannot import the ES-module protocol, so this
  // string is duplicated. Renaming one without the other silently stops a
  // late-joining phone from ever receiving its layout.
  const relay = readFileSync(new URL('../src/relay.js', import.meta.url), 'utf8');
  assert.ok(
    relay.includes(`'${MessageType.LAYOUT}'`),
    `src/relay.js does not mention '${MessageType.LAYOUT}'`
  );
});

// --- orientation <-> quaternion -------------------------------------------

test('device orientation survives a round trip through a quaternion', () => {
  const poses = [
    { alpha: 0, beta: 0, gamma: 0 },
    { alpha: 37, beta: 12, gamma: -8 },
    { alpha: 200, beta: -45, gamma: 70 },
    { alpha: 90, beta: 0, gamma: 0 },
    { alpha: 15, beta: 55, gamma: -30 },
    { alpha: 340, beta: -5, gamma: 89 }
  ];
  for (const pose of poses) {
    const back = fromQuaternion(toQuaternion(pose));
    closeTo(wrapDegrees(back.alpha - pose.alpha), 0, 1e-9);
    closeTo(wrapDegrees(back.beta - pose.beta), 0, 1e-9);
    closeTo(wrapDegrees(back.gamma - pose.gamma), 0, 1e-9);
  }
});

test('wrapDegrees folds onto -180..180', () => {
  closeTo(wrapDegrees(200), -160);
  closeTo(wrapDegrees(-200), 160);
  closeTo(wrapDegrees(0), 0);
});

// --- calibration -----------------------------------------------------------

test('an uncalibrated calibrator reports nothing rather than guessing', () => {
  assert.equal(new Calibrator().toVehicleAngles(IDENTITY), null);
});

test('the calibration pose itself reads as dead level', () => {
  const awkward = toQuaternion({ alpha: 123, beta: -41, gamma: 67 });
  const calibrator = new Calibrator('landscape-left');
  calibrator.capture(awkward);
  anglesCloseTo(calibrator.toVehicleAngles(awkward), { yaw: 0, pitch: 0, roll: 0 }, 1e-9);
});

test('a flat twist is yaw in every mount, and nothing else', () => {
  const reference = toQuaternion({ alpha: 214, beta: -7, gamma: 11 });
  for (const name of mounts.names()) {
    const calibrator = new Calibrator(name);
    calibrator.capture(reference);
    const twisted = multiply(reference, fromAxisAngle('z', 25));
    anglesCloseTo(calibrator.toVehicleAngles(twisted), { yaw: -25, pitch: 0, roll: 0 }, 1e-9);
  }
});

test('dipping the nose end is pitch in every mount, though it is a different device axis each time', () => {
  const noseDown = {
    'landscape-left': ['y', 20],
    'landscape-right': ['y', -20],
    'portrait-up': ['x', -20],
    'portrait-down': ['x', 20]
  };
  const reference = toQuaternion({ alpha: 214, beta: -7, gamma: 11 });

  for (const [mount, [axis, degrees]] of Object.entries(noseDown)) {
    const calibrator = new Calibrator(mount);
    calibrator.capture(reference);
    const angles = calibrator.toVehicleAngles(multiply(reference, fromAxisAngle(axis, degrees)));
    anglesCloseTo(angles, { yaw: 0, pitch: -20, roll: 0 }, 1e-9);
  }
});

test('the reference pose is arbitrary: the same turn reads the same from any grip', () => {
  const turn = fromAxisAngle('z', 25);
  const readings = [
    { alpha: 0, beta: 0, gamma: 0 },
    { alpha: 123, beta: -41, gamma: 67 },
    { alpha: -80, beta: 30, gamma: -15 }
  ].map((pose) => {
    const reference = toQuaternion(pose);
    const calibrator = new Calibrator('landscape-left');
    calibrator.capture(reference);
    return calibrator.toVehicleAngles(multiply(reference, turn));
  });
  for (const reading of readings) anglesCloseTo(reading, readings[0], 1e-9);
});

test('an unknown mount falls back to the default instead of throwing', () => {
  assert.equal(new Calibrator('nonsense').mount, mounts.DEFAULT_MOUNT);
});

// --- axis mapping ----------------------------------------------------------

test('deadzone subtracts its width rather than clipping to zero', () => {
  closeTo(applyDeadzone(1, 3), 0);
  closeTo(applyDeadzone(5, 3), 2);
  closeTo(applyDeadzone(-5, 3), -2);
});

test('normalise clamps at full deflection', () => {
  closeTo(normalise(22.5, 45), 0.5);
  closeTo(normalise(90, 45), 1);
  closeTo(normalise(-90, 45), -1);
});

test('smoothing of 0 passes the value straight through', () => {
  closeTo(smooth(10, 20, 0), 20);
  closeTo(smooth(10, 20, 0.5), 15);
});

test('a game maps signals onto its own axis names', () => {
  const mapper = createAxisMapper({
    axes: { steer: 'roll', throttle: 'pitch' },
    deadzone: 3, range: 30, smoothing: 0
  });
  const out = mapper.apply({ yaw: 90, pitch: 18, roll: -33 });

  assert.deepEqual(Object.keys(out).sort(), ['steer', 'throttle']);
  closeTo(out.steer, -1);          // -33 deg, deadzone 3 -> -30, range 30 -> -1
  closeTo(out.throttle, 0.5);      //  18 deg, deadzone 3 ->  15, range 30 ->  0.5
  // yaw was not declared, so it is not reported at all
  assert.equal(out.yaw, undefined);
});

test('an axis mapped to something that is not a signal fails loudly at construction', () => {
  assert.throws(
    () => createAxisMapper({ axes: { x: 'elbow' }, deadzone: 3, range: 30, smoothing: 0 }),
    /not one of yaw, pitch, roll/
  );
});

test('a game that declares no axes gets no axes, and needs no tilt', () => {
  const mapper = createAxisMapper({ axes: {}, deadzone: 3, range: 30, smoothing: 0 });
  assert.equal(mapper.names.length, 0);
  assert.deepEqual(mapper.apply({ yaw: 40, pitch: 40, roll: 40 }), {});
});
