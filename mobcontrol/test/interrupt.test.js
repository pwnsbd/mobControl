// A control held when the socket drops or the page is hidden must not stay held.
// Fake transport, fake view, fake sensors: no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ControllerApp } from '../client/phone/app.js';
import { MessageType } from '../client/shared/protocol.js';

function rig() {
  const handlers = {};
  const sent = [];
  const transport = {
    on: (name, fn) => { handlers[name] = fn; },
    send: (m) => sent.push(m),
    connect() {}
  };
  const held = { buttons: { fire: true }, sticks: { move: { x: 0.5, y: -1 } } };
  const stages = [];
  let onControls = () => {};
  const view = {
    controlState: held,
    releaseControls() {
      held.buttons.fire = false;
      held.sticks.move = { x: 0, y: 0 };
      onControls();                       // the real pad reports its change
    },
    set stage(s) { stages.push(s); },
    onControls: (fn) => { onControls = fn; },
    say() {}, status() {}, showRoom() {}, showPose() {}, showControls() {},
    hintEditing() {}
  };
  for (const name of ['onStart', 'onTeach', 'onTeachCancel', 'onRecentre',
    'onEditHandle', 'onEditDone', 'onEditReset']) view[name] = () => {};

  const listeners = {};
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener: (n, fn) => { listeners[n] = fn; }
  };
  const locks = [];
  const app = new ControllerApp({
    room: 'abc', transport, view,
    calibrator: { mount: 'flat', toVehicleAngles: () => null },
    gripTeacher: {}, shakeDetector: { level: 0 },
    wakeLock: { acquire: () => locks.push('on'), release: () => locks.push('off') },
    orientationSource: {}, motionSource: {}, requestAccess: async () => ({}),
    sendIntervalMs: 0
  });
  app.start();
  handlers.message({ type: MessageType.LAYOUT, mount: 'flat', usesTilt: false, controls: [] });
  sent.length = 0;
  return { handlers, sent, held, stages, listeners, locks };
}

const isNeutral = ({ buttons, sticks }) =>
  Object.values(buttons).every((b) => b === false) &&
  Object.values(sticks).every((s) => s.x === 0 && s.y === 0);

test('a held button is released when the socket closes, with nothing sent', () => {
  const r = rig();
  r.handlers.close();
  assert.ok(isNeutral(r.held));
  assert.equal(r.sent.length, 0);
  assert.equal(r.stages.at(-1), 'interrupted');
  assert.equal(r.locks.at(-1), 'off');
});

test('hiding the page releases controls and sends exactly one forced frame', () => {
  const r = rig();
  document.visibilityState = 'hidden';
  r.listeners.visibilitychange();
  assert.ok(isNeutral(r.held));
  const inputs = r.sent.filter((m) => m.type === 'input');
  assert.equal(inputs.length, 1);
  assert.deepEqual(inputs[0].buttons, { fire: false });
  assert.deepEqual(inputs[0].sticks, { move: { x: 0, y: 0 } });
});

test('reconnecting after a close returns to play with nothing stuck', () => {
  const r = rig();
  r.handlers.close();
  r.handlers.open();
  assert.equal(r.stages.at(-1), 'playing');
  assert.equal(r.locks.at(-1), 'on');
  assert.ok(isNeutral(r.held));
  const last = r.sent.filter((m) => m.type === 'input').at(-1);
  assert.deepEqual(last.buttons, { fire: false });
});

test('a close before any open does not throw and releases', () => {
  const r = rig();
  r.handlers.close();
  r.handlers.close();
  assert.ok(isNeutral(r.held));
});
