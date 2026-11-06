// "Has long enough passed?" — used to cap the send rate without the caller
// keeping its own timestamp around.

export function createRateLimiter(intervalMs) {
  let last = -Infinity;
  return function allow(now = performance.now()) {
    if (now - last < intervalMs) return false;
    last = now;
    return true;
  };
}
