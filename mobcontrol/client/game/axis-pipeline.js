// Tilt in degrees -> the axes a game actually asked for.
//
// A game declares  { steer: 'roll', throttle: 'pitch' }  and reads
// pad.axis.steer. Naming is the game's, signals are ours, and the mapping
// lives here alone.

import { SIGNALS } from '../shared/protocol.js';

/** Ignore the first `width` degrees, so an unsteady hand does not drift. */
export function applyDeadzone(value, width) {
  if (!value) return 0;
  if (value > width) return value - width;
  if (value < -width) return value + width;
  return 0;
}

/** Map degrees onto -1â€¦1, where `range` degrees is full deflection. */
export function normalise(value, range) {
  return clamp(value / range, -1, 1);
}

/** Exponential smoothing. `factor` is how much of the old value to keep. */
export function smooth(previous, next, factor) {
  return previous * factor + next * (1 - factor);
}

/**
 * @param {object} settings
 * @param {Record<string,string>} settings.axes  game's name -> 'yaw'|'pitch'|'roll'
 * @param {number} settings.deadzone  degrees
 * @param {number} settings.range     degrees for full deflection
 * @param {number} settings.smoothing 0 = raw
 */
export function createAxisMapper({ axes, deadzone, range, smoothing }) {
  const names = Object.keys(axes);
  for (const name of names) {
    if (!SIGNALS.includes(axes[name])) {
      throw new Error(
        `mobcontrol: axis "${name}" is mapped to "${axes[name]}", ` +
        `which is not one of ${SIGNALS.join(', ')}`
      );
    }
  }

  const held = Object.fromEntries(names.map((name) => [name, 0]));

  return {
    names,
    apply(sample) {
      const out = {};
      for (const name of names) {
        const degrees = sample[axes[name]] ?? 0;
        held[name] = smooth(held[name], applyDeadzone(degrees, deadzone), smoothing);
        out[name] = normalise(held[name], range);
      }
      return out;
    },
    zeroed() {
      return Object.fromEntries(names.map((name) => [name, 0]));
    },
    reset() {
      for (const name of names) held[name] = 0;
    }
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
