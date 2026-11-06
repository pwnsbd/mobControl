// A control held when the socket drops or the page is hidden must not stay held.
// Fake transport, fake view, fake sensors: no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ControllerApp } from '../client/phone/app.js';
import { MessageType } from '../client/shared/protocol.js';

function rig({ usesTilt = false, orientation, landscape = true } = {}) {
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
  let turned = () => {};
  const turns = [];
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
    hintEditing() {},
    isLandscape: landscape,
    onOrientation: (fn) => { turned = fn; },
    showTurn: (want) => turns.push(want)
  };
  const taps = {};
  view.onStart = (fn) => { taps.start = fn; };
  view.onTeach = (fn) => { taps.teach = fn; };
  view.onTeachCancel = () => {};
  view.showDial = () => {};
  for (const name of ['onRecentre', 'onTeachCancel', 'onRecentre',
    'onEditHandle', 'onEditDone', 'onEditReset']) view[name] = () => {};
  view.onControlsFire = () => onControls();

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
    orientationSource: { start() {} }, motionSource: { start() {} },
    requestAccess: async () => ({ orientation: true, motion: false }),
    sendIntervalMs: 0
  });
  app.start();
  handlers.message({ type: MessageType.LAYOUT, mount: 'flat', usesTilt, controls: [], orientation });
  sent.length = 0;
  const turn = (isLandscape) => { view.isLandscape = isLandscape; turned(); };
  return { handlers, sent, held, stages, listeners, locks, taps, view, turn, turns };
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

const hold = (r) => { r.held.buttons.fire = true; r.held.sticks.move = { x: 0.5, y: -1 }; };
const inputs = (r) => r.sent.filter((m) => m.type === 'input');

test('a held stick is released on close and on hide', () => {
  const r = rig();
  r.handlers.close();
  assert.deepEqual(r.held.sticks.move, { x: 0, y: 0 });
  hold(r);
  r.handlers.open();
  document.visibilityState = 'hidden';
  r.sent.length = 0;
  r.listeners.visibilitychange();
  assert.deepEqual(r.held.sticks.move, { x: 0, y: 0 });
  assert.deepEqual(inputs(r)[0].sticks, { move: { x: 0, y: 0 } });
});

test('two closes then one open still resumes play', () => {
  const r = rig();
  r.handlers.close();
  r.handlers.close();
  r.handlers.open();
  assert.equal(r.stages.at(-1), 'playing');
});

test('nothing is sent while interrupted, even if the page is hidden', () => {
  const r = rig();
  r.handlers.close();
  hold(r);
  r.view.onControlsFire();               // a stray pad change event
  document.visibilityState = 'hidden';
  r.listeners.visibilitychange();
  assert.equal(inputs(r).length, 0);
  assert.ok(isNeutral(r.held));
});

test('a close while armed releases input, does not claim playing, and survives reopen', async () => {
  const r = rig({ usesTilt: true });
  await r.taps.start();
  assert.equal(r.stages.at(-1), 'armed');
  r.handlers.close();
  assert.ok(isNeutral(r.held));
  r.handlers.open();
  assert.notEqual(r.stages.at(-1), 'playing');
  assert.notEqual(r.stages.at(-1), 'interrupted');
  assert.equal(r.locks.at(-1), 'off');
});

test('a close while teaching releases input and does not jump to playing on reopen', async () => {
  const r = rig({ usesTilt: true });
  await r.taps.start();
  r.taps.teach();
  assert.equal(r.stages.at(-1), 'teaching');
  r.handlers.close();
  assert.ok(isNeutral(r.held));
  r.handlers.open();
  assert.equal(r.stages.at(-1), 'teaching');
});

// --- the real ControlPad (fake DOM) ---

const fakeEl = () => {
  const el = {
    dataset: {}, style: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(n, fn) { el.listeners[n] = fn; },
    append() {}, setAttribute() {}, querySelector: () => null,
    replaceChildren() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 })
  };
  return el;
};
const winListeners = {};
const padWorld = () => {
  globalThis.window = { addEventListener: (n, fn) => { winListeners[n] = fn; } };
  globalThis.document = { createElement: fakeEl };
};

const SPECS = [
  { id: 'fire', type: 'button' },
  { id: 'move', type: 'stick' }
];
const down = (el, pointerId, x, y) => el.listeners.pointerdown({
  pointerId, clientX: x, clientY: y, preventDefault() {}
});

test('releaseAll neutralises a held button and a held stick, and reports it', async () => {
  padWorld();
  const { ControlPad } = await import('../client/phone/control-pad.js');
  const root = fakeEl();
  const pad = new ControlPad(root);
  const els = [];
  document.createElement = () => { const e = fakeEl(); els.push(e); return e; };
  pad.setControls(SPECS, {});
  const [fire, move] = els.filter((e) => e.listeners.pointerdown);
  let changes = 0;
  pad.onChange(() => { changes += 1; });

  down(fire, 1, 50, 50);
  down(move, 2, 100, 50);                 // stick centre is (50,50), radius 50 -> x = 1
  assert.equal(pad.state.buttons.fire, true);
  assert.deepEqual(pad.state.sticks.move, { x: 1, y: 0 });

  changes = 0;
  pad.releaseAll();
  assert.deepEqual(pad.state, { buttons: { fire: false }, sticks: { move: { x: 0, y: 0 } } });
  assert.ok(changes >= 1);

  // a late pointerup for a pointer that was already released must be harmless
  winListeners.pointerup({ pointerId: 1 });
  assert.equal(pad.state.buttons.fire, false);
});

test('releaseAll with no controls mounted, or an empty list, does not throw', async () => {
  padWorld();
  const { ControlPad } = await import('../client/phone/control-pad.js');
  const pad = new ControlPad(fakeEl());
  assert.doesNotThrow(() => pad.releaseAll());
  pad.setControls([], {});
  assert.doesNotThrow(() => pad.releaseAll());
  assert.deepEqual(pad.state, { buttons: {}, sticks: {} });
});

// --- the turn-your-phone stage ---

test('a landscape layout held upright shows the turn screen, with nothing held', () => {
  const r = rig({ orientation: 'landscape', landscape: false });
  assert.equal(r.stages.at(-1), 'rotate');
  assert.deepEqual(r.turns, ['landscape']);
  assert.ok(isNeutral(r.held));
  assert.equal(r.locks.at(-1), 'on');
});

test('a landscape layout held sideways plays, and a portrait one held upright plays', () => {
  assert.equal(rig({ orientation: 'landscape', landscape: true }).stages.at(-1), 'playing');
  assert.equal(rig({ orientation: 'portrait', landscape: false }).stages.at(-1), 'playing');
  const wrong = rig({ orientation: 'portrait', landscape: true });
  assert.equal(wrong.stages.at(-1), 'rotate');
  assert.deepEqual(wrong.turns, ['portrait']);
});

test('an any layout, or a message with no orientation field, never shows it', () => {
  for (const orientation of ['any', undefined, 'sideways', 7]) {
    for (const landscape of [true, false]) {
      const r = rig({ orientation, landscape });
      assert.equal(r.stages.at(-1), 'playing', `${orientation} ${landscape}`);
      r.turn(!landscape);
      assert.equal(r.stages.includes('rotate'), false, `${orientation} ${landscape}`);
    }
  }
});

test('turning the phone resolves the screen by itself, and back again', () => {
  const r = rig({ orientation: 'landscape', landscape: false });
  r.turn(true);
  assert.equal(r.stages.at(-1), 'playing');
  r.turn(false);
  assert.equal(r.stages.at(-1), 'rotate');
  r.turn(true);
  assert.equal(r.stages.at(-1), 'playing');
});

test('turning away mid-press releases the control and tells the game', () => {
  const r = rig({ orientation: 'landscape', landscape: true });
  hold(r);
  r.turn(false);
  assert.equal(r.stages.at(-1), 'rotate');
  assert.ok(isNeutral(r.held));
  assert.deepEqual(inputs(r).at(-1).buttons, { fire: false });
  assert.deepEqual(inputs(r).at(-1).sticks, { move: { x: 0, y: 0 } });
  r.turn(true);                          // leaving it leaves the state neutral too
  assert.equal(r.stages.at(-1), 'playing');
  assert.ok(isNeutral(r.held));
  assert.deepEqual(inputs(r).at(-1).buttons, { fire: false });
});

test('a turn that changes nothing sends nothing', () => {
  const r = rig({ orientation: 'landscape', landscape: true });
  r.turn(true);
  assert.equal(r.sent.length, 0);
});

test('a disconnection while held the wrong way reads as disconnected, then resumes right', () => {
  const r = rig({ orientation: 'landscape', landscape: false });
  r.handlers.close();
  assert.equal(r.stages.at(-1), 'interrupted');
  assert.ok(isNeutral(r.held));
  r.turn(true);                          // turning while disconnected must not hide that
  assert.equal(r.stages.at(-1), 'interrupted');
  r.handlers.open();
  assert.equal(r.stages.at(-1), 'playing');
  r.handlers.close();
  r.turn(false);
  r.handlers.open();
  assert.equal(r.stages.at(-1), 'rotate');
  assert.ok(isNeutral(r.held));
});

test('the turn screen does not appear before play, however the phone is held', () => {
  const r = rig({ usesTilt: true, orientation: 'landscape', landscape: false });
  assert.equal(r.stages.at(-1), 'ready');
  r.turn(true);
  r.turn(false);
  assert.equal(r.stages.includes('rotate'), false);
});

test('a layout that stops caring about orientation ends the turn screen', () => {
  const r = rig({ orientation: 'landscape', landscape: false });
  r.handlers.message({ type: MessageType.LAYOUT, mount: 'flat', usesTilt: false, controls: [] });
  assert.equal(r.stages.at(-1), 'playing');
});
