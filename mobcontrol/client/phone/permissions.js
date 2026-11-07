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
export async function requestMotionAccess({ orientation = true, motion = true } = {}) {
  // No secure context, no sensors — on iOS the prompt is refused, and on
  // Android the events simply never fire. Better to say so than to wait.
  if (globalThis.isSecureContext === false) {
    return { orientation: false, motion: false, prompted: false, insecure: true };
  }
  const orientationGated = isGated(globalThis.DeviceOrientationEvent);
  const motionGated = isGated(globalThis.DeviceMotionEvent);
  const request = (ctor) => {
    try { return ctor.requestPermission().catch(() => 'denied'); }
    catch { return Promise.resolve('denied'); }
  };
  const orientationRequest = orientation && orientationGated
    ? request(DeviceOrientationEvent)
    : Promise.resolve(orientation ? 'granted' : 'denied');
  const motionRequest = motion && motionGated
    ? request(DeviceMotionEvent)
    : Promise.resolve(motion ? 'granted' : 'denied');

  // Start every requested gated permission before awaiting, inside the tap.
  const [orientationState, motionState] = await Promise.all([orientationRequest, motionRequest]);
  return {
    orientation: orientationState === 'granted',
    motion: motionState === 'granted',
    prompted: (orientation && orientationGated) || (motion && motionGated)
  };
}
