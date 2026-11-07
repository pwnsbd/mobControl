// Public, versioned description of the configuration surface. Keep this file
// usable in both the browser bundle and Node-based development tools.
import { SIGNALS, ORIENTATIONS } from './protocol.js';
import { names as mountNames } from './mounts.js';

export const CONTROL_TYPES = Object.freeze(['button', 'stick', 'dpad']);

const sides = Object.freeze(['left', 'right']);
const sizes = Object.freeze(['s', 'm', 'l']);
const accents = Object.freeze(['yellow', 'amber', 'blue', 'red', 'green']);
const buttonShapes = Object.freeze(['circle', 'rounded-rect']);
const controlFields = new Set(['id', 'type', 'label', 'side', 'x', 'y', 'size', 'accent', 'haptic', 'shape']);
const configFields = new Set(['mount', 'axes', 'motion', 'motionWithJoystick', 'buttons', 'controls', 'orientation', 'recommendedOrientation', 'deadzone', 'range', 'smoothing', 'allowLayoutEdit', 'debug', 'persistRoom']);
const runtimeFields = new Set(['autoConnect', 'basePath', 'qrRenderer', 'room', 'transport']);

export const configurationContract = {
  version: '0.1.0',
  presetUsage: 'Call layouts.<name>(options) and pass the returned options to validateConfiguration.',
  presets: {
    simple: {
      description: 'A small custom arrangement, with optional movement.',
      defaultOptions: {},
      options: {
        movement: { type: 'string', values: ['none', 'stick', 'dpad', 'tilt'], default: 'none' },
        buttons: { type: 'array', maxItems: 4, items: 'string | {id?, label?, haptic?}', default: [] },
        orientation: { type: 'string', values: [...ORIENTATIONS], default: 'landscape' }
      }
    },
    gamepad: { description: 'Left d-pad and four action buttons.', defaultOptions: {}, options: { buttons: 'optional string[] or {id,label,haptic?}[]', ids: 'optional name-to-id map' } },
    dualStick: { description: 'Left move stick and right aim stick.', defaultOptions: {}, options: { ids: 'optional name-to-id map' } },
    dpad: { description: 'Left d-pad and two action buttons.', defaultOptions: {}, options: { buttons: 'optional string[] or {id,label,haptic?}[]', ids: 'optional name-to-id map' } }
  },
  controlTypes: [...CONTROL_TYPES],
  fields: {
    axes: { type: 'object', values: [...SIGNALS], description: 'Game axis name mapped to yaw, pitch, or roll.' },
    motion: { type: 'boolean', default: false, description: 'Request accelerometer and gyroscope readings.' },
    motionWithJoystick: { type: 'boolean', default: false, description: 'Keep the joystick available while motion is on.' },
    buttons: { type: 'array', items: 'string | {id,label,side,x,y,size,accent,haptic?,shape?}' },
    controls: { type: 'array', items: '{id,type,label,side,x,y,size,accent,haptic?,shape?}' },
    side: { type: 'string', values: [...sides] },
    size: { type: 'string', values: [...sizes] },
    accent: { type: 'string', values: [...accents] },
    shape: { type: 'string', values: [...buttonShapes], default: 'circle', description: 'Button shape. Use rounded-rect for Play/Pause and other menu actions.' },
    orientation: { type: 'string', values: [...ORIENTATIONS], default: 'landscape' },
    recommendedOrientation: { type: 'string', values: ['portrait', 'landscape'] },
    mount: { type: 'string', values: mountNames(), default: 'landscape-left', extensible: true },
    deadzone: { type: 'number', minimum: 0, default: 3 },
    range: { type: 'number', exclusiveMinimum: 0, default: 35 },
    smoothing: { type: 'number', minimum: 0, maximum: 1, default: 0 },
    allowLayoutEdit: { type: 'boolean', default: true },
    debug: { type: 'boolean', default: false },
    persistRoom: { type: 'boolean', default: true }
  },
  feedback: {
    haptic: { type: 'boolean', default: false, description: 'Request a short pulse and flash on each button press.' },
    vibrate: { method: 'pad.vibrate(duration)', unit: 'ms', minimum: 1, maximum: 200, default: 30 }
  },
  connection: {
    available: 'pad.connected && pad.watching',
    events: ['pair', 'unpair', 'suspend', 'resume'],
    recovery: 'If the phone is the active input, pause on unpair or suspend and let the player reconnect or continue with another input.'
  },
  inputs: {
    axes: 'Declared names receive normalized -1..1 tilt values.',
    buttons: 'Read pad.button[id] while held, or listen for press/release events with {id}.',
    controls: 'Read pad.stick[id].x and .y from -1 to 1. D-pad directions snap.',
    shake: 'Read pad.shake from 0 to 1. Trigger one action when it crosses a threshold.',
    motion: {
      property: 'pad.motion',
      coordinates: 'device',
      acceleration: { unit: 'm/s²', gravityIncluded: false, axes: ['x', 'y', 'z'] },
      rotationRate: { unit: 'deg/s', axes: ['x', 'y', 'z'] },
      unavailable: null
    },
    controllerMotion: {
      property: 'pad.controllerMotion',
      coordinates: 'controller',
      axes: ['right', 'up', 'out'],
      accelerationUnit: 'm/s²',
      rotationRateUnit: 'deg/s',
      unavailable: null
    }
  }
};
deepFreeze(configurationContract);

/** Validate declarative configuration without invoking runtime dependencies.
 * Unknown keys are ignored so constructor-only options (transport, room, etc.)
 * remain valid. Returns an empty array when the configuration is usable.
 */
export function validateConfiguration(config) {
  const issues = [];
  const issue = (path, message) => issues.push({ path, message });
  if (!isObject(config) || Array.isArray(config)) {
    return [{ path: '$', message: 'Expected a configuration object.' }];
  }
  for (const key of Object.keys(config)) {
    if (!configFields.has(key) && !runtimeFields.has(key)) issue(key, 'Unknown configuration field.');
  }

  // Presets are authored with layouts.<name>(options); validate the exact
  // resulting constructor options, so the validator never accepts a shape the
  // runtime constructor cannot consume.
  if (config.axes !== undefined) {
    if (!isObject(config.axes) || Array.isArray(config.axes)) issue('axes', 'Expected an object mapping names to signals.');
    else for (const [name, signal] of Object.entries(config.axes)) {
      if (!name.trim()) issue(`axes.${name}`, 'Axis names must not be empty.');
      if (!SIGNALS.includes(signal)) issue(`axes.${name}`, `Choose one of: ${SIGNALS.join(', ')}.`);
    }
  }
  if (config.buttons !== undefined && !Array.isArray(config.buttons)) issue('buttons', 'Expected an array.');
  if (config.controls !== undefined && !Array.isArray(config.controls)) issue('controls', 'Expected an array.');
  const seen = new Set();
  const checkControl = (item, path, shorthand = false) => {
    if (typeof item === 'string' && shorthand) item = { id: item };
    if (!isObject(item) || Array.isArray(item)) { issue(path, 'Expected a control object or ID string.'); return; }
    for (const key of Object.keys(item)) if (!controlFields.has(key)) issue(`${path}.${key}`, 'Unknown control field.');
    if (typeof item.id !== 'string' || !item.id.trim()) issue(`${path}.id`, 'Expected a non-empty string ID.');
    else if (seen.has(item.id)) issue(`${path}.id`, `Duplicate control ID "${item.id}".`);
    else seen.add(item.id);
    const type = shorthand ? 'button' : (item.type ?? 'button');
    if (!CONTROL_TYPES.includes(type)) issue(`${path}.type`, `Choose one of: ${CONTROL_TYPES.join(', ')}.`);
    if (item.label !== undefined && typeof item.label !== 'string') issue(`${path}.label`, 'Expected a string.');
    if (item.side !== undefined && !sides.includes(item.side)) issue(`${path}.side`, 'Choose left or right.');
    for (const axis of ['x', 'y']) if (item[axis] !== undefined && !(typeof item[axis] === 'number' && Number.isFinite(item[axis]) && item[axis] >= 0 && item[axis] <= 1)) issue(`${path}.${axis}`, 'Expected a number from 0 to 1.');
    if (item.size !== undefined && !sizes.includes(item.size)) issue(`${path}.size`, `Choose one of: ${sizes.join(', ')}.`);
    if (item.accent !== undefined && !accents.includes(item.accent)) issue(`${path}.accent`, `Choose one of: ${accents.join(', ')}.`);
    if (item.haptic !== undefined && typeof item.haptic !== 'boolean') issue(`${path}.haptic`, 'Expected a boolean.');
    if (item.shape !== undefined && (type !== 'button' || !buttonShapes.includes(item.shape))) {
      issue(`${path}.shape`, 'Buttons support circle or rounded-rect.');
    }
  };
  if (Array.isArray(config.buttons)) config.buttons.forEach((item, i) => checkControl(item, `buttons[${i}]`, true));
  if (Array.isArray(config.controls)) config.controls.forEach((item, i) => checkControl(item, `controls[${i}]`));

  for (const [field, allowed] of [['orientation', ORIENTATIONS], ['recommendedOrientation', ['portrait', 'landscape']]]) {
    if (config[field] !== undefined && !allowed.includes(config[field])) issue(field, `Choose one of: ${allowed.join(', ')}.`);
  }
  if (config.mount !== undefined && (typeof config.mount !== 'string' || !config.mount.trim())) issue('mount', 'Expected a non-empty mount name.');
  for (const [field, min, max, exclusive] of [['deadzone', 0, Infinity, false], ['range', 0, Infinity, true], ['smoothing', 0, 1, false]]) {
    const value = config[field];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || (exclusive ? value <= min : value < min) || value > max)) {
      issue(field, `Expected a finite number ${exclusive ? 'greater than 0' : 'at least 0'}${max < Infinity ? ' and at most 1' : ''}.`);
    }
  }
  for (const field of ['motion', 'motionWithJoystick', 'allowLayoutEdit', 'debug', 'persistRoom']) if (config[field] !== undefined && typeof config[field] !== 'boolean') issue(field, 'Expected a boolean.');
  return issues;
}

const isObject = (value) => value !== null && typeof value === 'object';
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
