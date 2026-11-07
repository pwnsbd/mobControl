// A layout's orientation: the config default, the fallback, and the wire.

import test from 'node:test';
import assert from 'node:assert/strict';

import { PhoneController, layouts } from '../client/controller.js';
import * as protocol from '../client/shared/protocol.js';

function announced(options = {}) {
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
  return sent.find((m) => m.type === protocol.MessageType.LAYOUT);
}

test('a game that passes no orientation announces landscape', () => {
  assert.equal(announced({ buttons: ['jump'] }).orientation, 'landscape');
});

test('landscape, portrait and any pass through', () => {
  for (const o of ['landscape', 'portrait', 'any']) {
    assert.equal(announced({ orientation: o }).orientation, o);
  }
});

test('an unknown orientation falls back to any without throwing', () => {
  for (const bad of ['sideways', 'LANDSCAPE', '', null, 3, {}, []]) {
    assert.equal(announced({ orientation: bad }).orientation, 'any', String(bad));
  }
});

test('a preset spreads in with its orientation, and can be overridden or cut down', () => {
  assert.equal(announced({ ...layouts.gamepad() }).orientation, 'landscape');
  assert.equal(announced({ ...layouts.gamepad(), orientation: 'any' }).orientation, 'any');
  assert.equal(announced({ controls: layouts.gamepad().controls }).orientation, 'landscape');
  assert.equal(announced({ ...layouts.dpad() }).orientation, 'any');
});

test('a layout message with no orientation field means any', () => {
  assert.equal(protocol.normaliseOrientation(undefined), 'any');
  assert.equal(protocol.layout({ mount: 'flat', usesTilt: false, controls: [] }).orientation, 'any');
  assert.equal(
    protocol.layout({ mount: 'flat', usesTilt: false, controls: [], orientation: 'portrait' }).orientation,
    'portrait'
  );
});
