'use strict';

// Claiming exactly one WebSocket path on a server we do not own.
//
// The host app may have its own upgrade handlers, so anything that is not
// ours must be left strictly alone — except when we are the only listener, in
// which case nobody else will ever answer and the socket must be closed
// rather than left hanging.

/**
 * @param {import('http').Server} server
 * @param {{path:string, onUpgrade:(req, socket, head, url) => void}} options
 */
function routeUpgrades(server, { path: wsPath, onUpgrade }) {
  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://placeholder');
    } catch {
      return socket.destroy();
    }

    if (url.pathname !== wsPath) {
      if (server.listenerCount('upgrade') === 1) socket.destroy();
      return;
    }

    onUpgrade(req, socket, head, url);
  });
}

module.exports = { routeUpgrades };
