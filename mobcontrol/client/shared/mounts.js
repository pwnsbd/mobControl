// How the phone sits in the hand.
//
// Vehicle axes are X = right, Y = forward (the nose), Z = up. A mount is the
// rotation carrying vehicle axes onto device axes. The phone is flat and
// screen-up in every pose; they differ only in which edge is the nose, which
// is a rotation about the device's own Z.
//
// This is a registry rather than a constant so a game can add its own pose
// without touching the module.

import { fromAxisAngle } from './quaternion.js';

const registry = new Map();

/**
 * @param {string} name
 * @param {{degrees:number, nose:'left'|'right'|'away'|'near', instruction:string}} definition
 */
export function register(name, definition) {
  registry.set(name, Object.freeze({ name, ...definition }));
}

export function get(name) {
  return registry.get(name) ?? registry.get(DEFAULT_MOUNT);
}

export function names() {
  return [...registry.keys()];
}

/** The quaternion a reading is re-expressed through. */
export function rotationOf(name) {
  return fromAxisAngle('z', get(name).degrees);
}

export const DEFAULT_MOUNT = 'landscape-left';

register('landscape-left', {
  degrees: -90,
  nose: 'left',
  instruction: 'turned sideways with the top edge pointing to your LEFT'
});
register('landscape-right', {
  degrees: 90,
  nose: 'right',
  instruction: 'turned sideways with the top edge pointing to your RIGHT'
});
register('portrait-up', {
  degrees: 0,
  nose: 'away',
  instruction: 'with the top edge pointing away from you'
});
register('portrait-down', {
  degrees: 180,
  nose: 'near',
  instruction: 'with the top edge pointing towards you'
});
