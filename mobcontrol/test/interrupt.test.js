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
  const view = {
    controlState: held,
    releaseControls() {
      held.buttons.fire = false;
      held.sticks.move = { x: 0, y: 0 };
      onControls();                       // the real pad reports its change
    },
    set stage(s) { stages.push(s); },
    onControls: (fn) => { onControls = fn; },
    onDrag() {},
    say() {}, status() {}, showRoom() {}, showPose() {}, showControls() {},
    hintEditing() {},
    isLandscape: landscape,
    onOrientation() {},
    onMotionToggle() {},
    setMotionMode() {}
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
  return { handlers, sent, held, stages, listeners, locks, taps, view };
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

function recordVibration(t) {
  const calls = [];
  const original = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    value: (duration) => { calls.push(duration); return true; }
  });
  t.after(() => {
    if (original) Object.defineProperty(navigator, 'vibrate', original);
    else delete navigator.vibrate;
  });
  return calls;
}

test('game feedback only pulses while the controller is visible and playing', (t) => {
  const calls = recordVibration(t);
  const r = rig();
  const request = { type: MessageType.VIBRATE, duration: 50 };
  r.handlers.message(request);
  document.visibilityState = 'hidden';
  r.handlers.message(request);
  document.visibilityState = 'visible';
  r.handlers.message({ ...request, duration: '50' });
  r.handlers.close();
  r.handlers.message(request);
  assert.deepEqual(calls, [50]);
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

test('an opted-in button pulses once for each separate press', async (t) => {
  const calls = recordVibration(t);
  padWorld();
  const { ControlPad } = await import('../client/phone/control-pad.js');
  const button = fakeEl();
  let flashes = 0;
  button.animate = () => { flashes += 1; return { cancel() {} }; };
  document.createElement = () => button;
  const pad = new ControlPad(fakeEl());
  pad.setControls([{ id: 'fire', type: 'button', haptic: true }], {});
  down(button, 1, 50, 50);
  down(button, 2, 50, 50);
  winListeners.pointerup({ pointerId: 2 });
  assert.equal(pad.state.buttons.fire, true);
  winListeners.pointerup({ pointerId: 1 });
  down(button, 3, 50, 50);
  winListeners.pointerup({ pointerId: 3 });
  assert.equal(calls.length, 2);
  assert.equal(flashes, 2);
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

test('a fixed landscape layout enters play regardless of the phone viewport', () => {
  const r = rig({ orientation: 'landscape', landscape: false });
  assert.equal(r.stages.at(-1), 'playing');
  assert.equal(r.locks.at(-1), 'on');
});

test('fixed layouts rotate on a mismatched viewport and stay selected after resizing', async () => {
  padWorld();
  window.innerWidth = 390;
  window.innerHeight = 844;
  window.screen = { orientation: { angle: 0 } };
  const elements = new Map();
  const root = {
    documentElement: fakeEl(),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fakeEl());
      return elements.get(id);
    }
  };
  const { ControllerView } = await import('../client/phone/view.js');
  const view = new ControllerView(root);
  view.onOrientation();
  let button;
  document.createElement = () => { button = fakeEl(); return button; };
  view.showControls([SPECS[0]], 'landscape');
  const data = root.documentElement.dataset;
  assert.equal(data.layoutOrientation, 'landscape');
  assert.equal(data.layoutRotation, 'clockwise');
  assert.equal(view.motionAngle, -90);
  const frames = [];
  view.onControls((frame) => frames.push(frame));
  down(button, 1, 50, 50);
  assert.equal(view.controlState.buttons.fire, true);

  window.innerWidth = 844;
  window.innerHeight = 390;
  window.screen.orientation.angle = 270;
  winListeners.resize();
  assert.equal(view.controlState.buttons.fire, false);
  assert.equal(frames.at(-1).buttons.fire, false);
  assert.equal(data.layoutOrientation, 'landscape');
  assert.equal(data.layoutRotation, '');
  assert.equal((view.motionAngle + 360) % 360, 270);

  view.showControls([], 'portrait');
  assert.equal(data.layoutOrientation, 'portrait');
  assert.equal(data.layoutRotation, 'clockwise');
  assert.equal(view.motionAngle, 180);
  delete window.screen.orientation;
  window.orientation = -90;
  assert.equal((view.motionAngle + 360) % 360, 180);

  view.showControls([], 'any');
  assert.equal(data.layoutOrientation, 'landscape');
  assert.equal(data.layoutRotation, '');
});

test('rotated stick input and layout editing use controller coordinates', async () => {
  padWorld();
  window.innerWidth = 390;
  window.innerHeight = 844;
  const { ControlPad } = await import('../client/phone/control-pad.js');
  const root = fakeEl();
  root.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 400 });
  const pad = new ControlPad(root);
  pad.rotated = true;
  const elements = [];
  document.createElement = () => { const el = fakeEl(); elements.push(el); return el; };
  pad.setControls([SPECS[1]], { move: { x: 0.5, y: 0.5, size: 'm' } });
  const [stick] = elements;
  down(stick, 1, 50, 100);
  assert.deepEqual(pad.state.sticks.move, { x: 1, y: 0 });
  winListeners.pointermove({ pointerId: 1, clientX: 0, clientY: 50 });
  assert.deepEqual(pad.state.sticks.move, { x: 0, y: 1 });
  winListeners.pointerup({ pointerId: 1 });

  pad.editing = true;
  down(stick, 2, 110, 220);
  winListeners.pointermove({ pointerId: 2, clientX: 130, clientY: 260 });
  winListeners.pointerup({ pointerId: 2 });
  assert.deepEqual(pad.layout.move, { x: 0.6, y: 0.4, size: 'm' });
});

test('pinching a rotated button keeps its center and leaves space for its neighbor', async () => {
  padWorld();
  window.innerWidth = 200;
  window.innerHeight = 400;
  const { ControlPad } = await import('../client/phone/control-pad.js');
  const root = fakeEl();
  root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400 });
  const pad = new ControlPad(root);
  pad.rotated = true;
  const elements = [];
  document.createElement = () => { const el = fakeEl(); elements.push(el); return el; };
  const fire = { x: 0.35, y: 0.5, size: 'm' };
  const jump = { x: 0.65, y: 0.5, size: 'm' };
  pad.setControls([SPECS[0], { id: 'jump', type: 'button' }], { fire, jump });
  pad.editing = true;
  const saved = [];
  pad.onLayoutChange((layout) => saved.push(layout));
  const touch = (pointerId, clientY) => ({
    pointerId, clientX: 100, clientY, pointerType: 'touch', preventDefault() {}
  });
  const start = () => {
    elements[0].listeners.pointerdown(touch(1, 140));
    root.listeners.pointerdown(touch(2, 160));
  };
  start();
  winListeners.pointermove(touch(2, 260));
  // The centers are 120px apart, the neighboring radius is 30px, and the gap is 8px.
  assert.ok(Math.abs(parseFloat(elements[0].style.width) - 164) < 1e-9);
  assert.deepEqual(pad.layout.jump, jump);
  assert.equal(pad.layout.fire.x, fire.x);
  assert.equal(pad.layout.fire.y, fire.y);
  winListeners.pointermove(touch(2, 150));
  assert.equal(parseFloat(elements[0].style.width), 30);
  winListeners.pointerup(touch(2, 150));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].fire.size, 0.15);

  start();
  winListeners.pointermove(touch(2, 190));
  winListeners.pointercancel({ ...touch(2, 190), type: 'pointercancel' });
  assert.deepEqual(pad.layout, saved[0]);
  assert.equal(saved.length, 1);
});

test('a rotated drag reports local position and velocity, then ends or cancels exactly once', async () => {
  padWorld();
  const { ControlPad } = await import('../client/phone/control-pad.js');
  const surface = fakeEl();
  surface.style.setProperty = (key, value) => { surface.style[key] = value; };
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400 });
  document.createElement = () => surface;
  const pad = new ControlPad(fakeEl());
  pad.rotated = true;
  pad.setControls([{ id: 'lane', type: 'drag', label: 'Push' }], {});
  const events = [];
  pad.onDrag((event) => events.push(event));
  const pointer = (clientX, clientY, timeStamp) => ({
    pointerId: 1, clientX, clientY, timeStamp, preventDefault() {}
  });
  surface.listeners.pointerdown(pointer(150, 100, 0));
  winListeners.pointermove(pointer(150, 120, 20));
  winListeners.pointermove(pointer(130, 120, 25));
  assert.deepEqual(events.map(({ phase }) => phase), ['start', 'move']);
  assert.equal(surface.style['--drag-x'], '30%');
  assert.equal(surface.style['--drag-y'], '35%');
  assert.deepEqual(events[0].position, { x: 0.25, y: 0.25 });
  assert.ok(Math.abs(events[1].velocity.x - 5) < 1e-9);
  assert.equal(events[1].velocity.y, 0);
  winListeners.pointerup(pointer(130, 120, 28));
  assert.deepEqual(events.map(({ phase }) => phase), ['start', 'move', 'move', 'end']);
  assert.ok(Math.abs(events[2].velocity.y - 20) < 1e-9);

  surface.listeners.pointerdown(pointer(150, 100, 40));
  winListeners.pointermove(pointer(150, 120, 60));
  winListeners.pointermove(pointer(130, 120, 65));
  pad.editing = true;
  winListeners.pointerup(pointer(130, 120, 68));
  assert.deepEqual(events.slice(4).map(({ phase }) => phase), ['start', 'move', 'cancel']);
  assert.deepEqual(pad.state, { buttons: {}, sticks: {} });
});
