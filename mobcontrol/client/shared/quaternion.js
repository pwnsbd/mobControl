// Quaternions, as plain {w,x,y,z} objects.
//
// Nothing here knows about phones, sensors or the DOM. Every function is pure
// and does one thing, which is what makes the attitude maths testable in Node.

export const IDENTITY = Object.freeze({ w: 1, x: 0, y: 0, z: 0 });

export function multiply(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  };
}

export function conjugate(q) {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
}

/** Rotation of `degrees` about a single axis: 'x', 'y' or 'z'. */
export function fromAxisAngle(axis, degrees) {
  const half = (degrees * Math.PI) / 360;
  const s = Math.sin(half);
  return {
    w: Math.cos(half),
    x: axis === 'x' ? s : 0,
    y: axis === 'y' ? s : 0,
    z: axis === 'z' ? s : 0
  };
}

/**
 * Re-express a rotation in a different set of axes.
 *
 * `basis` is the rotation carrying the NEW axes onto the OLD ones, so this
 * answers: "what is this same physical turn, described in the new frame?"
 * It is the one operation that lets a reading taken in device axes be read as
 * a reading in vehicle axes.
 */
export function changeBasis(rotation, basis) {
  return multiply(conjugate(basis), multiply(rotation, basis));
}

/** The rotation that takes `from` to `to`. */
export function difference(from, to) {
  return multiply(conjugate(from), to);
}

/**
 * The axis a rotation turns about, and by how much.
 * Always the shortest way round, so the axis points the way the turn went.
 * @returns {{axis:{x,y,z}, degrees:number}}
 */
export function axisAngle(q) {
  const n = Math.hypot(q.x, q.y, q.z);
  if (n < 1e-9) return { axis: { x: 0, y: 0, z: 1 }, degrees: 0 };
  const sign = q.w < 0 ? -1 : 1;                 // take the short way round
  const degrees = 2 * Math.atan2(n, Math.abs(q.w)) * (180 / Math.PI);
  return { axis: { x: sign * q.x / n, y: sign * q.y / n, z: sign * q.z / n }, degrees };
}

/**
 * Build the rotation whose columns are the given axes — i.e. the rotation that
 * carries the reference frame onto one with these axes. Pass the three body
 * axes expressed in device coordinates and you get the mount quaternion.
 */
export function fromBasis(right, forward, up) {
  const m = [
    [right.x, forward.x, up.x],
    [right.y, forward.y, up.y],
    [right.z, forward.z, up.z]
  ];
  const trace = m[0][0] + m[1][1] + m[2][2];

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return normalizeQ({
      w: 0.25 * s,
      x: (m[2][1] - m[1][2]) / s,
      y: (m[0][2] - m[2][0]) / s,
      z: (m[1][0] - m[0][1]) / s
    });
  }
  // Pick the largest diagonal term for numerical stability.
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    return normalizeQ({
      w: (m[2][1] - m[1][2]) / s, x: 0.25 * s,
      y: (m[0][1] + m[1][0]) / s, z: (m[0][2] + m[2][0]) / s
    });
  }
  if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    return normalizeQ({
      w: (m[0][2] - m[2][0]) / s, x: (m[0][1] + m[1][0]) / s,
      y: 0.25 * s, z: (m[1][2] + m[2][1]) / s
    });
  }
  const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
  return normalizeQ({
    w: (m[1][0] - m[0][1]) / s, x: (m[0][2] + m[2][0]) / s,
    y: (m[1][2] + m[2][1]) / s, z: 0.25 * s
  });
}

function normalizeQ(q) {
  const n = Math.hypot(q.w, q.x, q.y, q.z) || 1;
  return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
}
