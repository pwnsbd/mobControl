'use strict';

// The pairing rules, and nothing else.
//
// Given a registry and a socket that has already been accepted and labelled,
// this decides who gets told what. It does no routing, no upgrading and no
// static serving.

const { RoomRegistry } = require('./room-registry');

// Must match MessageType.LAYOUT in client/shared/protocol.js. The server is
// CommonJS and the protocol is an ES module, so this is the one duplicated
// constant in the codebase; a test pins them together.
const LAYOUT_TYPE = '__layout';
const CLOSE_BAD_REQUEST = 1008;
const CLOSE_OVERLOADED = 1013;

function createRelay({ registry, events }) {
  /**
   * @param {object} socket  a ws connection
   * @param {{room:string, role:string}} identity  parsed from the query string
   */
  function accept(socket, { room, role }) {
    if (!room || !RoomRegistry.isValidRole(role)) {
      return socket.close(CLOSE_BAD_REQUEST, 'room and role (game|phone) required');
    }
    if (!registry.has(room) && registry.isFull) {
      return socket.close(CLOSE_OVERLOADED, 'too many rooms');
    }

    const { peer, displaced } = registry.join(room, role, socket);
    displaced?.close(1000, 'replaced by a newer connection');
    events.emit('join', { room, role });

    if (peer) pair({ room, role, socket, peer });

    socket.on('message', (data, isBinary) => forward({ room, role, data, isBinary }));
    socket.on('close', () => release({ room, role, socket }));
    socket.on('error', () => { /* 'close' always follows; clean up there */ });
  }

  function pair({ room, role, socket, peer }) {
    send(peer, { type: 'paired', role });
    send(socket, { type: 'paired', role: role === 'game' ? 'phone' : 'game' });

    // A phone that arrived after the game declared its setup still needs it.
    const config = registry.configOf(room);
    if (role === 'phone' && config) send(socket, config);

    events.emit('pair', { room });
  }

  function forward({ room, role, data, isBinary }) {
    if (!isBinary) {
      const text = data.toString();
      rememberConfigIfPresent(room, text);
      events.emit('message', { room, role, text });
    }
    const peer = registry.peerOf(room, role);
    if (isOpen(peer)) {
      try { peer.send(data, { binary: isBinary }); } catch { /* peer vanished */ }
    }
  }

  function release({ room, role, socket }) {
    const { peer, emptied } = registry.leave(room, role, socket);
    if (!peer && !emptied) return;              // an older socket we already replaced
    send(peer, { type: 'unpaired', role });
    events.emit('unpair', { room, role, emptied });
  }

  function rememberConfigIfPresent(room, text) {
    if (!text.includes(LAYOUT_TYPE)) return;    // cheap reject before parsing
    try {
      const parsed = JSON.parse(text);
      if (parsed?.type === LAYOUT_TYPE) registry.rememberConfig(room, parsed);
    } catch { /* not ours — it still gets relayed */ }
  }

  return { accept };
}

function isOpen(socket) {
  return Boolean(socket) && socket.readyState === socket.OPEN;
}

function send(socket, payload) {
  if (!isOpen(socket)) return;
  try { socket.send(JSON.stringify(payload)); } catch { /* raced with a close */ }
}

module.exports = { createRelay };
