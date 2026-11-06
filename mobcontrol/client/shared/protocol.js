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
  /** server -> both: a peer arrived / left */
  PAIRED: 'paired',
  UNPAIRED: 'unpaired',
  /** phone -> game: the player captured a reference pose */
  CALIBRATED: 'calibrated',
  /** phone -> game: the controller page went away, or came back */
  PRESENCE: 'presence',
  /** game -> phone: show this text / recapture the reference pose */
  MESSAGE: 'message',
  RECENTRE: 'recentre'
});

/** The three things tilt can give. A game maps these onto its own axis names. */
export const SIGNALS = Object.freeze(['yaw', 'pitch', 'roll']);

/**
 * @param {object} layout
 * @param {string} layout.mount      holding pose
 * @param {boolean} layout.usesTilt  false lets the phone skip calibration entirely
 * @param {Array<{id:string,type:'button'|'stick'|'dpad',label?:string,side?:string}>} layout.controls
 * @param {boolean} [layout.debug]   show the raw angle readout on the phone
 * @param {boolean} [layout.allowLayoutEdit] let the player rearrange the controls
 */
export const layout = ({ mount, usesTilt, controls, debug = false, allowLayoutEdit = true }) => ({
  type: MessageType.LAYOUT,
  mount,
  usesTilt,
  controls,
  debug,
  allowLayoutEdit
});

/**
 * @param {{yaw:number,pitch:number,roll:number}} tilt  degrees, calibrated
 * @param {Record<string, boolean>} buttons
 * @param {Record<string, {x:number,y:number}>} sticks  sticks and dpads alike
 * @param {number} shake
 */
export const input = ({ tilt, buttons, sticks, shake }) => ({
  type: MessageType.INPUT,
  yaw: round(tilt?.yaw), pitch: round(tilt?.pitch), roll: round(tilt?.roll),
  buttons,
  sticks,
  shake: round(shake, 3)
});

export const calibrated = () => ({ type: MessageType.CALIBRATED });

/**
 * The socket can stay open while the player is no longer looking — screen
 * locked, another app, another tab. That is not a disconnection, but a game
 * usually wants to pause for it, so it is reported separately.
 */
export const presence = (visible) => ({ type: MessageType.PRESENCE, visible });
export const message = (text) => ({ type: MessageType.MESSAGE, text: String(text) });
export const recentre = () => ({ type: MessageType.RECENTRE });

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
