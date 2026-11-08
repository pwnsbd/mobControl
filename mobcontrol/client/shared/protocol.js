// The wire format, defined once.
//
// Both ends and the server import this, so a change to the protocol is a
// change to exactly one file.
//
// The phone stays dumb: it reports tilt in degrees and which buttons are down.
// Deciding that "roll means steering" is the game's job, so that mapping never
// travels over the wire.

export const MessageType = Object.freeze({
  /** game -> phone: the control layout to render, and how to hold the phone */
  LAYOUT: '__layout',
  /** phone -> game: one input frame */
  INPUT: 'input',
  /** phone -> game: one touch-surface gesture sample */
  DRAG: 'drag',
  /** server -> both: a peer arrived / left */
  PAIRED: 'paired',
  UNPAIRED: 'unpaired',
  /** phone -> game: the player captured a reference pose */
  CALIBRATED: 'calibrated',
  /** phone -> game: the controller page went away, or came back */
  PRESENCE: 'presence',
  /** game -> phone: show this text / recapture the reference pose */
  MESSAGE: 'message',
  RECENTRE: 'recentre',
  /** game -> phone: vibrate for a bounded duration */
  VIBRATE: 'vibrate'
});

/** Clamp finite positive durations to the supported 1..200 ms range. */
export function vibrationDuration(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(200, Math.max(1, Math.round(value))) : 0;
}

/** The three things tilt can give. A game maps these onto its own axis names. */
export const SIGNALS = Object.freeze(['yaw', 'pitch', 'roll']);

/** Which way up the phone should be held for a layout. 'any' asks for nothing. */
export const ORIENTATIONS = Object.freeze(['landscape', 'portrait', 'any']);

/**
 * Anything unrecognised, or absent (an older game), means 'any': a layout that
 * cannot say how it wants to be held does not get to nag the player.
 */
export const normaliseOrientation = (value) => (ORIENTATIONS.includes(value) ? value : 'any');

/**
 * @param {object} layout
 * @param {string} layout.mount      holding pose
 * @param {boolean} layout.usesTilt  false lets the phone skip calibration entirely
 * @param {boolean} [layout.usesMotion] sends device-frame acceleration and rotation rate
 * @param {Array<{id:string,type:'button'|'stick'|'dpad',label?:string,side?:string}>} layout.controls
 * @param {'landscape'|'portrait'|'any'} [layout.orientation] how the controls were designed to be held
 * @param {boolean} [layout.debug]   show the raw angle readout on the phone
 * @param {boolean} [layout.allowLayoutEdit] let the player rearrange the controls
 */
export const layout = ({
  mount, usesTilt, usesMotion, motionWithJoystick, controls, orientation, recommendedOrientation,
  debug = false, allowLayoutEdit = true
}) => ({
  type: MessageType.LAYOUT,
  mount,
  usesTilt,
  ...(usesMotion === true ? { usesMotion } : {}),
  ...(motionWithJoystick === true && (usesTilt || usesMotion) ? { motionWithJoystick } : {}),
  controls,
  orientation: normaliseOrientation(orientation),
  ...(recommendedOrientation === 'portrait' || recommendedOrientation === 'landscape'
    ? { recommendedOrientation } : {}),
  debug,
  allowLayoutEdit
});

/**
 * @param {{yaw:number,pitch:number,roll:number}} tilt  degrees, calibrated
 * @param {Record<string, boolean>} buttons
 * @param {Record<string, {x:number,y:number}>} sticks  sticks and dpads alike
 * @param {number} shake
 * @param {object} [motion] optional uncalibrated device motion
 * @param {number} [motionAngle] rotation used to map device motion to controller axes
 */
export const input = ({ tilt, buttons, sticks, shake, motion, motionAngle, motionEnabled }) => ({
  type: MessageType.INPUT,
  yaw: round(tilt?.yaw), pitch: round(tilt?.pitch), roll: round(tilt?.roll),
  buttons,
  sticks,
  shake: round(shake, 3),
  ...(motion ? { motion } : {}),
  ...(motion && Number.isFinite(motionAngle) ? { motionAngle } : {}),
  ...(typeof motionEnabled === 'boolean' ? { motionEnabled } : {})
});

/** A missing sensor or reading stays null so zero remains a real measurement. */
export function motionSample(sample) {
  const acceleration = motionVector(sample?.acceleration);
  const rotationRate = motionVector(sample?.rotationRate);
  return acceleration || rotationRate ? { acceleration, rotationRate } : null;
}

function motionVector(vector) {
  if (!vector) return null;
  const x = Number.isFinite(vector.x) ? vector.x : null;
  const y = Number.isFinite(vector.y) ? vector.y : null;
  const z = Number.isFinite(vector.z) ? vector.z : null;
  return x === null && y === null && z === null ? null : { x, y, z };
}

export const calibrated = () => ({ type: MessageType.CALIBRATED });

export const drag = ({ id, phase, position, velocity }) => ({
  type: MessageType.DRAG, id, phase, position, velocity
});

/** Accept only complete gesture samples with finite coordinates. */
export function dragSample(message) {
  const { id, phase, position, velocity } = message;
  if (typeof id !== 'string' || !['start', 'move', 'end', 'cancel'].includes(phase)) return null;
  if (!finiteVector(position) || !finiteVector(velocity)) return null;
  if (position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) return null;
  return {
    id, phase,
    position: { x: position.x, y: position.y },
    velocity: { x: velocity.x, y: velocity.y }
  };
}

const finiteVector = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);

/**
 * The socket can stay open while the player is no longer looking — screen
 * locked, another app, another tab. That is not a disconnection, but a game
 * usually wants to pause for it, so it is reported separately.
 */
export const presence = (visible) => ({ type: MessageType.PRESENCE, visible });
export const message = (text) => ({ type: MessageType.MESSAGE, text: String(text) });
export const recentre = () => ({ type: MessageType.RECENTRE });
export const vibrate = (duration) => ({ type: MessageType.VIBRATE, duration: vibrationDuration(duration) });

/** Returns the parsed object, or null if it was not usable JSON. */
export function parse(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function round(value, places = 2) {
  return Number((value ?? 0).toFixed(places));
}
