import { vibrationDuration } from '../shared/protocol.js';

/** Pulse when the browser and device allow vibration. */
export function pulse(duration = 18) {
  const milliseconds = vibrationDuration(duration);
  return Boolean(milliseconds && globalThis.navigator?.vibrate?.(milliseconds));
}
