// The game-to-phone boundary: a control declared through PhoneController must
// arrive at the phone with every field the phone consumes. Nothing is faked
// between the two ends but the socket (a relay that hands messages across) and
// the view (which records what it was asked to draw).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PhoneController, configurationContract, layouts, validateConfiguration
} from '../client/controller.js';
import { ControllerApp } from '../client/phone/app.js';
import { DeviceMotionSource } from '../client/phone/motion-source.js';
import { ShakeDetector } from '../client/phone/shake-detector.js';
import { defaultLayout } from '../client/phone/pad-layout.js';
import { input, MessageType } from '../client/shared/protocol.js';
import { ReconnectingSocket } from '../client/shared/transport.js';
import { createRelay } from '../src/relay.js';
import { RoomRegistry } from '../src/room-registry.js';
import { EventEmitter } from 'node:events';

// Independent expectations (hand-written, not read back from the code).
const SMALL_SIZE = 's';
const AMBER = 'amber';
const AT_X = 0.6;
const AT_Y = 0.5;

test('a tab replaced by the relay stops retrying, while a network drop still retries', (t) => {
  const sockets = [];
  class FakeSocket extends EventEmitter {
    constructor() { super(); sockets.push(this); }
    close(code, reason) { this.onclose({ code, reason }); }
  }
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket;
  t.after(() => { globalThis.WebSocket = original; });
  const retry = t.mock.method(globalThis, 'setTimeout', () => {});

  const transport = new ReconnectingSocket(() => 'ws://test');
  const closes = [];
  transport.on('close', (event) => closes.push(event));
  transport.connect();
  const relay = createRelay({ registry: new RoomRegistry(), events: new EventEmitter() });
  const role = { room: 'ROOM', role: 'phone' };
  relay.accept(sockets[0], role);
  relay.accept(new FakeSocket(), role);
  assert.deepEqual(closes, [{ replaced: true }]);
  assert.equal(retry.mock.callCount(), 0);

  transport.connect();
  sockets.at(-1).close(1006, '');
  assert.deepEqual(closes.at(-1), { replaced: false });
  assert.equal(retry.mock.callCount(), 1);
});

/** Exercise the real game controller with an in-memory phone connection. */
function gameController(options) {
  globalThis.location = { origin: 'http://x', search: '', hostname: 'localhost', protocol: 'http:' };
  const handlers = {};
  const sent = [];
  const transport = {
    on: (name, fn) => { handlers[name] = fn; },
    send: (m) => sent.push(m),
    connect() {}, close() {}
  };
  const pad = new PhoneController({
    room: 'ABC', persistRoom: false, transport, qrRenderer: {}, autoConnect: false, ...options
  });
  handlers.open();
  return {
    pad,
    sent,
    layout: sent.find((m) => m.type === MessageType.LAYOUT),
    phoneMessage: handlers.message,
    phoneInput: (frame) => handlers.message(input(frame))
  };
}

const gameAnnounces = (options) => gameController(options).layout;

/** Phone side: deliver a message to a real ControllerApp; return what the view was told to draw. */
function phoneController(message, { motionAngle, controlState = { buttons: {}, sticks: {} }, ...options } = {}) {
  const handlers = {};
  const drawn = [];
  const sent = [];
  const listeners = {};
  const messages = [];
  const modes = [];
  let start;
  let toggle;
  let sendDrag;
  const noop = () => {};
  const view = new Proxy({
    showControls: (controls) => drawn.push(controls),
    say: (message) => messages.push(message),
    onStart: (handler) => { start = handler; },
    onMotionToggle: (handler) => { toggle = handler; },
    onDrag: (handler) => { sendDrag = handler; },
    setMotionMode: (mode) => modes.push(mode),
    controlState,
    motionAngle,
    isLandscape: true
  }, {
    get: (target, key) => (key in target ? target[key] : noop),
    set: () => true
  });
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener: (name, handler) => { listeners[name] = handler; }
  };
  const app = new ControllerApp({
    room: 'abc',
    transport: { on: (n, fn) => { handlers[n] = fn; }, send: (frame) => sent.push(frame), connect: noop },
    view,
    calibrator: { mount: 'flat', toVehicleAngles: () => null },
    gripTeacher: {}, shakeDetector: { level: 0 },
    wakeLock: { acquire: noop, release: noop },
    orientationSource: { start: noop }, motionSource: { start: noop },
    requestAccess: async () => ({ orientation: true, motion: false }),
    sendIntervalMs: 0,
    ...options
  });
  app.start();
  handlers.message(message);
  return { drawn, sent, listeners, messages, modes, start, toggle, sendDrag };
}

const phoneReceives = (message) => phoneController(message).drawn.at(-1);

test('size, accent and position declared on the game reach the phone intact', () => {
  const wire = gameAnnounces({
    controls: [{ id: 'jump', type: 'button', x: AT_X, y: AT_Y, size: SMALL_SIZE, accent: AMBER }]
  });
  const [arrived] = phoneReceives(wire);
  assert.equal(arrived.size, SMALL_SIZE, 'size dropped between game and phone');
  assert.equal(arrived.accent, AMBER, 'accent dropped between game and phone');
  assert.equal(arrived.x, AT_X);
  assert.equal(arrived.y, AT_Y);
});

test('a declared size survives all the way to the phone default layout', () => {
  const wire = gameAnnounces({ controls: [{ id: 'jump', x: AT_X, y: AT_Y, size: SMALL_SIZE }] });
  const placed = defaultLayout(phoneReceives(wire));
  assert.equal(placed.jump.size, SMALL_SIZE);
});

test('a rounded rectangle is an opt-in button shape on the phone', () => {
  const options = { buttons: [{ id: 'pause', shape: 'rounded-rect' }, 'jump'] };
  assert.deepEqual(validateConfiguration(options), []);
  const [pause, jump] = phoneReceives(gameAnnounces(options));
  assert.equal(pause.shape, 'rounded-rect');
  assert.equal(jump.shape, undefined);
  assert.equal(validateConfiguration({
    controls: [{ id: 'steer', type: 'stick', shape: 'rounded-rect' }]
  })[0].path, 'controls[0].shape');
});

test('the game receives drag lifecycle events from the phone and cancels interrupted gestures', () => {
  const options = { controls: [{ id: 'lane', type: 'drag' }], orientation: 'portrait' };
  assert.deepEqual(validateConfiguration(options), []);
  const game = gameController(options);
  const phone = phoneController(game.layout);
  assert.equal(phone.drawn.at(-1)[0].type, 'drag');
  assert.deepEqual(game.pad.stick, {});
  const events = [];
  for (const phase of ['start', 'move', 'end', 'cancel']) {
    game.pad.on(`drag${phase}`, (sample) => events.push({ phase, ...sample }));
  }
  game.phoneMessage({ type: MessageType.PAIRED });

  const position = { x: 0.5, y: 0.2 };
  const velocity = { x: 0, y: -2.5 };
  const emit = (phase, id = 'lane') => {
    phone.sendDrag({ id, phase, position, velocity });
    game.phoneMessage(phone.sent.at(-1));
  };
  emit('move'); // A move before a start is ignored.
  emit('start', 'other');
  emit('start');
  emit('move');
  emit('end');
  emit('start');
  game.phoneMessage({ type: MessageType.PRESENCE, visible: false });
  emit('end'); // Late end must not turn the cancellation into a shot.
  game.phoneMessage({ type: MessageType.PRESENCE, visible: true });
  emit('start');
  game.phoneMessage({ type: MessageType.UNPAIRED });
  assert.deepEqual(events.map(({ phase }) => phase), ['start', 'move', 'end', 'start', 'cancel', 'start', 'cancel']);
  assert.deepEqual(events[1], { phase: 'move', id: 'lane', position, velocity });
  assert.deepEqual(events[4].velocity, { x: 0, y: 0 });
});

test('a drag surface rejects a second surface or custom placement', () => {
  const options = { controls: [
    { id: 'lane', type: 'drag', x: 0.5 },
    { id: 'other', type: 'drag' }
  ] };
  assert.deepEqual(validateConfiguration(options).map(({ path }) => path), ['controls[0].x', 'controls[1].type']);
  assert.throws(() => gameController(options), /only one drag surface/);
});

test('every field a preset sets on a control survives the crossing', () => {
  const { controls } = layouts.gamepad();
  const wire = gameAnnounces({ controls });
  const arrived = phoneReceives(wire);
  assert.equal(arrived.length, controls.length);
  controls.forEach((sent, i) => {
    for (const [key, value] of Object.entries(sent)) {
      if (value === undefined) continue;
      assert.deepEqual(arrived[i][key], value, `${sent.id}.${key} lost in transit`);
    }
  });
  assert.ok(arrived.some((c) => c.accent), 'the preset should carry at least one accent');
  assert.ok(arrived.some((c) => c.size), 'the preset should carry at least one size');
});

test('every discoverable preset validates and reaches the phone', () => {
  const contract = JSON.parse(JSON.stringify(configurationContract));
  assert.deepEqual(Object.keys(contract.presets).sort(), Object.keys(layouts).sort());

  for (const createPreset of Object.values(layouts)) {
    const options = createPreset();
    assert.deepEqual(validateConfiguration(options), []);
    assert.equal(phoneReceives(gameAnnounces(options)).length, options.controls.length);
  }
});

test('configuration validation finds duplicate IDs across buttons and controls', () => {
  const issues = validateConfiguration({
    buttons: ['boost'],
    controls: [{ id: 'boost', type: 'button' }]
  });
  assert.equal(issues.length, 1);
  assert.match(issues[0].path, /controls.*0.*id/);
  assert.match(issues[0].message, /boost/);
});

test('configuration validation reports misspelled fields and rejects invalid control shapes', () => {
  const issues = validateConfiguration({
    orientaton: 'landscape',
    controls: ['jump', { id: 'steer', type: 'stick', sze: 'l' }],
    autoConnect: false
  });
  assert.deepEqual(issues.map(({ path }) => path), ['orientaton', 'controls[0]', 'controls[1].sze']);
});

test('simulated phone input steers, holds brake, and fires boost once per tap', () => {
  const { pad, phoneInput } = gameController({
    controls: [{ id: 'steer', type: 'stick' }],
    buttons: ['brake', 'boost']
  });
  const boostEvents = [];
  pad.on('press', ({ id }) => {
    if (id === 'boost') boostEvents.push('press');
  });
  pad.on('release', ({ id }) => {
    if (id === 'boost') boostEvents.push('release');
  });

  const held = { buttons: { brake: true, boost: true }, sticks: { steer: { x: 0.5, y: 0 } } };
  phoneInput(held);
  assert.equal(pad.stick.steer.x, 0.5);
  assert.equal(pad.button.brake, true);

  phoneInput(held);
  assert.equal(pad.button.brake, true);
  assert.deepEqual(boostEvents, ['press']);

  phoneInput({});
  assert.equal(pad.stick.steer.x, 0);
  assert.equal(pad.button.brake, false);
  assert.deepEqual(boostEvents, ['press', 'release']);
});

test('button feedback and a bounded game pulse use the normal game-to-phone boundary', () => {
  const options = layouts.simple({ buttons: [{ id: 'jump', label: 'A', haptic: true }] });
  assert.deepEqual(validateConfiguration(options), []);
  const { pad, layout, sent } = gameController(options);
  assert.equal(phoneReceives(layout)[0].haptic, true);
  assert.equal(pad.vibrate(-1), false);
  pad.vibrate();
  pad.vibrate(900);
  assert.deepEqual(sent.slice(1), [
    { type: MessageType.VIBRATE, duration: 30 },
    { type: MessageType.VIBRATE, duration: 200 }
  ]);
});

test('opt-in raw motion reaches the game without tilt calibration and clears when hidden', async () => {
  const game = gameController({ motion: true, buttons: ['jump'] });
  assert.equal(game.layout.usesTilt, false);
  assert.equal(game.layout.usesMotion, true);
  assert.equal(game.pad.motion, null);
  let sensor;
  globalThis.window = { addEventListener: (name, handler) => {
    assert.equal(name, 'devicemotion');
    sensor = handler;
  } };
  const phone = phoneController(game.layout, {
    motionAngle: -90,
    motionSource: new DeviceMotionSource(),
    shakeDetector: new ShakeDetector(),
    requestAccess: async (requested) => {
      assert.deepEqual(requested, { orientation: false, motion: true });
      return { motion: true };
    }
  });
  assert.match(phone.messages.at(-1), /accelerometer and gyroscope.*share those readings with the paired game/);
  assert.equal(sensor, undefined);
  await phone.start();
  sensor({ acceleration: { x: 0, y: 2, z: null }, rotationRate: { alpha: 10, beta: 20, gamma: 30 } });
  game.phoneInput(phone.sent.at(-1));
  assert.deepEqual(game.pad.motion, {
    acceleration: { x: 0, y: 2, z: null },
    rotationRate: { x: 20, y: 30, z: 10 }
  });
  assert.deepEqual(game.pad.controllerMotion, {
    acceleration: { right: -2, up: 0, out: null },
    rotationRate: { right: -30, up: 20, out: 10 }
  });
  assert.ok(phone.sent.every(({ type }) => type !== MessageType.CALIBRATED));
  sensor({ acceleration: { x: 14.5, y: 0, z: 0 } });
  game.phoneInput(phone.sent.at(-1));
  assert.equal(game.pad.shake, 1);

  document.visibilityState = 'hidden';
  phone.listeners.visibilitychange();
  game.phoneInput(phone.sent.at(-2));
  assert.equal(game.pad.motion, null);
  assert.equal(game.pad.controllerMotion, null);
  const sentCount = phone.sent.length;
  sensor({ acceleration: null, rotationRate: { alpha: 5 } });
  assert.equal(phone.sent.length, sentCount);
});

test('controller-relative motion follows right and up across all screen angles', () => {
  const { pad, phoneInput } = gameController({ motion: true });
  const cases = [
    [0, { x: 5, y: 2, z: 0 }],
    [90, { x: -2, y: 5, z: 0 }],
    [180, { x: -5, y: -2, z: 0 }],
    [270, { x: 2, y: -5, z: 0 }]
  ];
  for (const [motionAngle, acceleration] of cases) {
    phoneInput({ motion: { acceleration }, motionAngle });
    assert.deepEqual(pad.controllerMotion, {
      acceleration: { right: 5, up: 2, out: 0 },
      rotationRate: null
    });
    assert.deepEqual(pad.motion.acceleration, acceleration);
  }
  phoneInput({ motion: { acceleration: { x: 1 } } });
  assert.equal(pad.controllerMotion, null);
  assert.deepEqual(pad.motion.acceleration, { x: 1, y: null, z: null });
});

test('motion stays unavailable when permission is denied or the game does not opt in', async () => {
  const game = gameController({ motion: true, buttons: ['jump'] });
  const phone = phoneController(game.layout, {
    motionSource: { start: () => assert.fail('denied sensor started') },
    requestAccess: async () => ({ motion: false })
  });
  await phone.start();
  assert.equal(phone.sent.at(-1).type, MessageType.INPUT);
  assert.equal(phone.sent.at(-1).motion, undefined);
  const touch = gameController({ buttons: ['jump'] });
  assert.equal(touch.layout.usesMotion, undefined);
  assert.ok(phoneController(touch.layout).messages.every((message) => !message.includes('Enable motion')));
  touch.phoneInput({ motion: { acceleration: { x: 1, y: 2, z: 3 } } });
  assert.equal(touch.pad.motion, null);
});

test('optional motion replaces joystick input and switching off restores it', async () => {
  const game = gameController({ ...layouts.simple({ movement: 'stick' }), motion: true });
  const controlState = { buttons: {}, sticks: { move: { x: 0.5, y: 0 } } };
  let stopped = false;
  let permissionRequests = 0;
  const phone = phoneController(game.layout, {
    controlState,
    motionSource: { start() {}, stop() { stopped = true; } },
    requestAccess: async () => { permissionRequests += 1; return { motion: true }; }
  });
  game.phoneInput(phone.sent.at(-1));
  assert.equal(game.pad.motionEnabled, false);
  assert.equal(game.pad.stick.move.x, 0.5);
  assert.equal(phone.modes.at(-1).available, true);

  phone.toggle();
  assert.match(phone.messages.at(-1), /share those readings/);
  assert.match(phone.messages.at(-1), /use the joystick instead/);
  phone.toggle();
  assert.equal(permissionRequests, 0);
  assert.equal(phone.modes.at(-1).enabled, false);
  phone.toggle();
  await phone.start();
  game.phoneInput(phone.sent.at(-1));
  assert.equal(game.pad.motionEnabled, true);
  assert.equal(game.pad.stick.move.x, 0);

  phone.toggle();
  game.phoneInput(phone.sent.at(-1));
  assert.equal(stopped, true);
  assert.equal(game.pad.motionEnabled, false);
  assert.equal(game.pad.stick.move.x, 0.5);
});

test('combined motion and joystick ask for permission and keep both inputs available', async () => {
  const options = { ...layouts.simple({ movement: 'stick' }), motion: true, motionWithJoystick: true };
  assert.deepEqual(validateConfiguration(options), []);
  const game = gameController(options);
  const phone = phoneController(game.layout, {
    controlState: { buttons: {}, sticks: { move: { x: 0.5, y: 0 } } },
    requestAccess: async () => ({ motion: true })
  });
  assert.equal(phone.modes.at(-1).available, false);
  assert.match(phone.messages.at(-1), /share those readings/);
  await phone.start();
  game.phoneInput(phone.sent.at(-1));
  assert.equal(game.pad.motionEnabled, true);
  assert.equal(game.pad.stick.move.x, 0.5);
  assert.equal(phone.modes.at(-1).keepJoystick, true);
  phone.toggle();
  assert.equal(phone.modes.at(-1).enabled, true);
});
