// The W3C DeviceOrientation convention, and nothing else.
//
// `deviceorientation` reports an intrinsic Z-X'-Y'' rotation: Rz(alpha) then
// Rx(beta) then Ry(gamma). These two functions are the only place in the
// codebase that knows that.

import { multiply, fromAxisAngle } from './quaternion.js';

const DEG = 180 / Math.PI;

/** @param {{alpha:number, beta:number, gamma:number}} angles - degrees */
export function toQuaternion({ alpha = 0, beta = 0, gamma = 0 }) {
  return multiply(
    multiply(fromAxisAngle('z', alpha), fromAxisAngle('x', beta)),
    fromAxisAngle('y', gamma)
  );
}

/**
 * The inverse: decompose back into the same convention.
 * Returns degrees. Near beta = ±90 the alpha and gamma rotations describe the
 * same turn, so alpha is pinned to 0 and gamma carries it.
 */
export function fromQuaternion({ w, x, y, z }) {
  const m01 = 2 * (x * y - w * z);
  const m11 = 1 - 2 * (x * x + z * z);
  const m20 = 2 * (x * z - w * y);
  const m21 = 2 * (y * z + w * x);
  const m22 = 1 - 2 * (x * x + y * y);

  const beta = Math.asin(clamp(m21, -1, 1));
  const degenerate = Math.abs(m21) >= 0.9999;

  return {
    alpha: (degenerate ? 0 : Math.atan2(-m01, m11)) * DEG,
    beta: beta * DEG,
    gamma: (degenerate
      ? Math.atan2(2 * (x * y + w * z), 1 - 2 * (y * y + z * z))
      : Math.atan2(-m20, m22)) * DEG
  };
}

/** Fold an angle into -180…180, so turning past the wrap point is continuous. */
export function wrapDegrees(d) {
  const folded = ((d + 180) % 360 + 360) % 360;
  return folded - 180;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
