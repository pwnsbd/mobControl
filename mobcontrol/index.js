'use strict';

// mobcontrol â€” turn any phone into a motion controller for a web page.
//
//   const pad = attachPhoneController(httpServer);
//   app.use(pad.middleware);
//
// This file is the composition root: it chooses the real parts and wires them
// together. The parts themselves live in src/ and know nothing about each
// other â€”
//
//   room-registry   who is in which room          (pure state)
//   relay           what each side gets told      (pairing rules)
//   assets          serving client/               (static files)
//   upgrade-router  claiming one WebSocket path   (http plumbing)
//
// Replacing any one of them is an edit here, not a rewrite of the others.

const { EventEmitter } = require('node:events');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const { RoomRegistry } = require('./src/room-registry');
const { createRelay } = require('./src/relay');
const { createAssetMiddleware } = require('./src/assets');
const { routeUpgrades } = require('./src/upgrade-router');

const DEFAULTS = {
  path: '/__phone',
  maxRooms: 500,
  maxPayloadBytes: 16 * 1024      // attitude frames are ~120 bytes
};

/**
 * @param {import('http').Server} server  a server you already own
 * @param {{path?:string, maxRooms?:number, maxPayloadBytes?:number}} [options]
 */
function attachPhoneController(server, options = {}) {
  const { path: mountPath, maxRooms, maxPayloadBytes } = { ...DEFAULTS, ...options };
  const basePath = mountPath.replace(/\/+$/, '');

  const registry = new RoomRegistry({ maxRooms });
  const events = new EventEmitter();
  const relay = createRelay({ registry, events });

  const sockets = new WebSocketServer({ noServer: true, maxPayload: maxPayloadBytes });
  sockets.on('connection', (socket, req) => {
    const { searchParams } = new URL(req.url, 'http://placeholder');
    relay.accept(socket, {
      room: searchParams.get('room'),
      role: searchParams.get('role')
    });
  });

  routeUpgrades(server, {
    path: `${basePath}/ws`,
    onUpgrade: (req, socket, head) => {
      sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit('connection', ws, req));
    }
  });

  const api = {
    basePath,

    /** Mount with app.use(...). Requests outside basePath pass straight through. */
    middleware: createAssetMiddleware({
      basePath,
      rootDir: path.join(__dirname, 'client')
    }),

    /** 'join' | 'pair' | 'unpair' | 'message', each with a {room, role} payload. */
    on(name, listener) {
      events.on(name, listener);
      return api;
    },

    /** Push a message into a room from the server side. */
    send(room, role, payload) {
      const socket = registry.connectionOf(room, role);
      if (!socket || socket.readyState !== socket.OPEN) return false;
      try {
        socket.send(JSON.stringify(payload));
        return true;
      } catch {
        return false;                         // raced a close
      }
    },

    get roomCount() { return registry.size; },

    close() { sockets.close(); }
  };

  return api;
}

module.exports = { attachPhoneController };
