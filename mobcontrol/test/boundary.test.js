// The game-to-phone boundary: a control declared through PhoneController must
// arrive at the phone with every field the phone consumes. Nothing is faked
// between the two ends but the socket (a relay that hands messages across) and
// the view (which records what it was asked to draw).

import test from 'node:test';
import assert from 'node:assert/strict';

import { PhoneController, layouts } from '../client/controller.js';
import { ControllerApp } from '../client/phone/app.js';
import { defaultLayout } from '../client/phone/pad-layout.js';
import { MessageType } from '../client/shared/protocol.js';

// Independent expectations (hand-written, not read back from the code).
const SMALL_SIZE = 's';
const AMBER = 'amber';
const AT_X = 0.6;
const AT_Y = 0.5;

/** Game side: declare controls, capture the layout the game puts on the wire. */
function gameAnnounces(options) {
  globalThis.location = { origin: 'http://x', search: '', hostname: 'localhost', protocol: 'http:' };
  const handlers = {};
  const sent = [];
  const transport = {
    on: (name, fn) => { handlers[name] = fn; },
    send: (m) => sent.push(m),
    connect() {}, close() {}
  };
  new PhoneController({
    room: 'ABC', persistRoom: false, transport, qrRenderer: {}, autoConnect: false, ...options
  });
  handlers.open();
  return sent.find((m) => m.type === MessageType.LAYOUT);
}

/** Phone side: deliver a message to a real ControllerApp; return what the view was told to draw. */
function phoneReceives(message) {
  const handlers = {};
  const drawn = [];
  const noop = () => {};
  const view = new Proxy({
    showControls: (controls) => drawn.push(controls),
    controlState: { buttons: {}, sticks: {} },
    isLandscape: true
  }, {
    get: (target, key) => (key in target ? target[key] : noop),
    set: () => true
  });
  globalThis.document = { visibilityState: 'visible', addEventListener: noop };
  const app = new ControllerApp({
    room: 'abc',
    transport: { on: (n, fn) => { handlers[n] = fn; }, send: noop, connect: noop },
    view,
    calibrator: { mount: 'flat', toVehicleAngles: () => null },
    gripTeacher: {}, shakeDetector: { level: 0 },
    wakeLock: { acquire: noop, release: noop },
    orientationSource: { start: noop }, motionSource: { start: noop },
    requestAccess: async () => ({ orientation: true, motion: false }),
    sendIntervalMs: 0
  });
  app.start();
  handlers.message(message);
  return drawn.at(-1);
}

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
