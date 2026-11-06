// Just enough vector algebra to turn a measured gesture into a set of axes.

export const vec = (x, y, z) => ({ x, y, z });

export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a, b) => vec(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x
);

export const scale = (a, k) => vec(a.x * k, a.y * k, a.z * k);

export const subtract = (a, b) => vec(a.x - b.x, a.y - b.y, a.z - b.z);

export const length = (a) => Math.hypot(a.x, a.y, a.z);

export function normalize(a) {
  const n = length(a);
  return n < 1e-9 ? vec(0, 0, 0) : scale(a, 1 / n);
}

/** The part of `a` that is perpendicular to the unit vector `axis`. */
export const reject = (a, axis) => subtract(a, scale(axis, dot(a, axis)));
