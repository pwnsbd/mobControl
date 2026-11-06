// The iOS motion-permission dance, in one place.
//
// iOS 13+ gates orientation and motion behind two SEPARATE grants, and both
// must be requested from inside the same user gesture. Everywhere else the
// sensors are simply available. Isolating that here keeps the quirk from
// leaking into the app logic.

/** @typedef {{orientation:boolean, motion:boolean, prompted:boolean}} MotionAccess */

const isGated = (ctor) =>
  typeof ctor !== 'undefined' && typeof ctor.requestPermission === 'function';

/**
 * Must be called synchronously from a user gesture (a tap handler).
 * @returns {Promise<MotionAccess>}
 */
export async function requestMotionAccess() {
  // No secure context, no sensors — on iOS the prompt is refused, and on
  // Android the events simply never fire. Better to say so than to wait.
  if (globalThis.isSecureContext === false) {
    return { orientation: false, motion: false, prompted: false, insecure: true };
  }
  if (!isGated(globalThis.DeviceOrientationEvent)) {
    return { orientation: true, motion: true, prompted: false };
  }

  // Both requests must start inside the gesture, so fire them before awaiting.
  const orientation = DeviceOrientationEvent.requestPermission();
  const motion = isGated(globalThis.DeviceMotionEvent)
    ? DeviceMotionEvent.requestPermission().catch(() => 'denied')
    : Promise.resolve('granted');

  const [orientationState, motionState] = await Promise.all([orientation, motion]);
  return {
    orientation: orientationState === 'granted',
    motion: motionState === 'granted',
    prompted: true
  };
}
