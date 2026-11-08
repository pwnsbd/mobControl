const LAYOUT_TYPE = '__layout';
const MAX_MESSAGE_BYTES = 16 * 1024;
const MESSAGE_TOO_LARGE = 1009;
const encoder = new TextEncoder();
const otherRole = (role) => role === 'game' ? 'phone' : 'game';

/** One Durable Object instance represents one room. */
export class MobControlRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  fetch(request) {
    // The Worker validates the upgrade and chooses the object for the room.
    const role = new URL(request.url).searchParams.get('role');
    const [client, socket] = Object.values(new WebSocketPair());
    const displaced = this.#current(role);
    this.ctx.acceptWebSocket(socket, [role]);
    socket.serializeAttachment({ role, retired: false });
    if (displaced) {
      displaced.serializeAttachment({ role, retired: true });
      try { displaced.close(1000, 'replaced by a newer connection'); } catch { /* already closed */ }
    }
    if (role === 'game') this.ctx.storage.kv.delete('layout');

    const peer = this.#current(otherRole(role));
    if (peer) {
      this.#send(peer, JSON.stringify({ type: 'paired', role }));
      this.#send(socket, JSON.stringify({ type: 'paired', role: otherRole(role) }));
      if (role === 'phone') {
        const config = this.ctx.storage.kv.get('layout');
        if (config) this.#send(socket, config);
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, message) {
    const info = socket.deserializeAttachment();
    if (!info || info.retired || socket.readyState !== 1) return;
    const bytes = typeof message === 'string' ? encoder.encode(message).byteLength : message.byteLength;
    if (bytes > MAX_MESSAGE_BYTES) {
      try { socket.close(MESSAGE_TOO_LARGE, 'message too large'); } catch { /* already closed */ }
      return;
    }
    if (info.role === 'game' && typeof message === 'string' && message.includes(LAYOUT_TYPE)) {
      let parsed;
      try { parsed = JSON.parse(message); } catch { /* relay non-JSON text unchanged */ }
      if (parsed?.type === LAYOUT_TYPE) this.ctx.storage.kv.put('layout', message);
    }
    this.#send(this.#current(otherRole(info.role)), message);
  }

  webSocketClose(socket) {
    this.#release(socket);
  }

  webSocketError(socket) {
    this.#release(socket);
  }

  #release(socket) {
    const info = socket.deserializeAttachment();
    if (!info || info.retired) return;
    socket.serializeAttachment({ ...info, retired: true });
    if (this.#current(info.role)) return;
    if (info.role === 'game') this.ctx.storage.kv.delete('layout');
    this.#send(this.#current(otherRole(info.role)), JSON.stringify({ type: 'unpaired', role: info.role }));
  }

  #current(role) {
    return this.ctx.getWebSockets(role).find((socket) =>
      socket.readyState === 1 && !socket.deserializeAttachment()?.retired
    );
  }

  #send(socket, message) {
    if (!socket || socket.readyState !== 1) return;
    try { socket.send(message); } catch { /* raced with close */ }
  }
}
