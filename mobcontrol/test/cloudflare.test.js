import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { MobControlRoom } from '../cloudflare/worker.mjs';

const request = (path, upgrade = false) => new Request(`https://game.example${path}`, {
  headers: upgrade ? { Upgrade: 'websocket' } : undefined
});

test('Cloudflare routes phone assets and upgrades under the game origin', async () => {
  const env = {
    CLIENT_ASSETS: { fetch: ({ url }) => new Response(url) },
    MOBCONTROL_ROOMS: {
      idFromName: (name) => `room:${name}`,
      get: (id) => ({ fetch: ({ url }) => new Response(`${id} ${url}`) })
    }
  };
  const phone = await worker.fetch(request('/__phone/phone?room=abc'), env);
  assert.equal(await phone.text(), 'https://game.example/phone.html?room=abc');
  const client = await worker.fetch(request('/__phone/phone/main.js'), env);
  assert.equal(await client.text(), 'https://game.example/phone/main.js');
  assert.equal((await worker.fetch(request('/controller.js'), env)).status, 404);
  assert.equal((await worker.fetch(request('/__phone/ws'), env)).status, 426);
  assert.equal((await worker.fetch(request('/__phone/ws?room=abc&role=other', true), env)).status, 400);
  const upgraded = await worker.fetch(request('/__phone/ws?room=abc&role=game', true), env);
  assert.equal(await upgraded.text(), 'room:abc https://game.example/__phone/ws?room=abc&role=game');
});

test('Cloudflare rooms replay layout and ignore displaced sockets after waking', (t) => {
  class Socket {
    readyState = 1;
    messages = [];
    serializeAttachment(value) { this.attachment = structuredClone(value); }
    deserializeAttachment() { return structuredClone(this.attachment); }
    send(message) { this.messages.push(message); }
    close(code, reason) {
      this.readyState = 2;
      this.closeFrame = { code, reason };
    }
  }

  const sockets = [];
  const layoutStore = new Map();
  const ctx = {
    acceptWebSocket(socket, [role]) { sockets.push({ socket, role }); },
    getWebSockets(role) {
      return sockets.filter((entry) => entry.role === role && entry.socket.readyState !== 3)
        .map((entry) => entry.socket);
    },
    storage: {
      kv: {
        get: (key) => layoutStore.get(key),
        put: (key, value) => layoutStore.set(key, value),
        delete: (key) => layoutStore.delete(key)
      }
    }
  };

  t.mock.method(globalThis, 'Response', function (_body, options) { return options; });
  globalThis.WebSocketPair = class {
    0 = new Socket();
    1 = new Socket();
  };
  t.after(() => { delete globalThis.WebSocketPair; });

  let room = new MobControlRoom(ctx);
  const connect = (role) => {
    assert.equal(room.fetch(request(`/__phone/ws?room=abc&role=${role}`, true)).status, 101);
    return sockets.at(-1).socket;
  };
  const game = connect('game');
  const layout = JSON.stringify({ type: '__layout', label: 'x'.repeat(16_300) });
  room.webSocketMessage(game, layout);

  room = new MobControlRoom(ctx);
  const oldPhone = connect('phone');
  assert.deepEqual(oldPhone.messages, ['{"type":"paired","role":"game"}', layout]);
  const phone = connect('phone');
  assert.deepEqual(phone.messages, oldPhone.messages);
  assert.equal(oldPhone.closeFrame.reason, 'replaced by a newer connection');
  room.webSocketMessage(oldPhone, 'stale');
  room.webSocketClose(oldPhone);
  assert.deepEqual(game.messages, Array(2).fill('{"type":"paired","role":"phone"}'));

  const input = Uint8Array.of(1, 2, 3).buffer;
  room.webSocketMessage(phone, input);
  assert.equal(game.messages.at(-1), input);
  room.webSocketMessage(phone, 'é'.repeat(8193));
  assert.equal(phone.closeFrame.code, 1009);
  phone.readyState = 3;
  room.webSocketClose(phone);
  assert.equal(game.messages.at(-1), '{"type":"unpaired","role":"phone"}');
});
