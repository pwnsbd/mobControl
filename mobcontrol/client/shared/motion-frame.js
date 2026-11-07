/** Remap physical axes into the directions printed on the controller. */
export function controllerRelativeMotion(sample, angle) {
  if (!sample || !Number.isFinite(angle) || angle % 90 !== 0) return null;
  const quarter = ((angle / 90) % 4 + 4) % 4;
  return {
    acceleration: relativeVector(sample.acceleration, quarter),
    rotationRate: relativeVector(sample.rotationRate, quarter)
  };
}

function relativeVector(vector, quarter) {
  if (!vector) return null;
  const { x, y, z: out } = vector;
  switch (quarter) {
    case 1: return { right: y, up: reverse(x), out };
    case 2: return { right: reverse(x), up: reverse(y), out };
    case 3: return { right: reverse(y), up: x, out };
    default: return { right: x, up: y, out };
  }
}

// Preserve missing readings and measured zero when changing direction.
const reverse = (value) => value ? -value : value;
