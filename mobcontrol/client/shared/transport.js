// Moving JSON between the phone and the game.
//
// This is deliberately the only module that mentions WebSocket. Anything with
// the same shape can replace it — a WebRTC data channel, a loopback for tests —
// by implementing:
//
//     on('open'|'message'|'close', fn) -> unsubscribe
//     send(object)
//     close()
//     get isOpen
//
// Both the phone and the game take their transport by injection, so swapping
// it is a one-line change at the composition root rather than a rewrite.

import { Emitter } from './emitter.js';
import { parse } from './protocol.js';

export class ReconnectingSocket {
  #events = new Emitter();
  #socket = null;
  #attempt = 0;
  #stopped = false;
  #timer = null;

  /**
   * @param {() => string} urlFactory  called per attempt, so the URL can change
   * @param {{minDelayMs?:number, maxDelayMs?:number}} [options]
   */
  constructor(urlFactory, { minDelayMs = 400, maxDelayMs = 8000 } = {}) {
    this.urlFactory = urlFactory;
    this.minDelayMs = minDelayMs;
    this.maxDelayMs = maxDelayMs;
  }

  on(name, fn) { return this.#events.on(name, fn); }

  get isOpen() {
    return this.#socket?.readyState === WebSocket.OPEN;
  }

  connect() {
    this.#stopped = false;
    const socket = new WebSocket(this.urlFactory());
    this.#socket = socket;

    socket.onopen = () => {
      this.#attempt = 0;
      this.#events.emit('open');
    };
    socket.onmessage = (event) => {
      const parsed = parse(event.data);
      if (parsed) this.#events.emit('message', parsed);
    };
    socket.onclose = (event) => {
      if (socket !== this.#socket) return;
      // A second tab can take over this role. Retrying would evict the new tab
      // and let both tabs take turns disconnecting each other.
      const replaced = event.code === 1000 && event.reason === 'replaced by a newer connection';
      if (replaced) this.#stopped = true;
      this.#events.emit('close', { replaced });
      if (!this.#stopped) this.#scheduleRetry();
    };
    socket.onerror = () => { /* close always follows; handle it there */ };
    return this;
  }

  send(payload) {
    if (!this.isOpen) return false;
    this.#socket.send(JSON.stringify(payload));
    return true;
  }

  close() {
    this.#stopped = true;
    clearTimeout(this.#timer);
    this.#socket?.close();
  }

  #scheduleRetry() {
    const delay = Math.min(this.maxDelayMs, this.minDelayMs * 2 ** this.#attempt++);
    this.#timer = setTimeout(() => this.connect(), delay);
  }
}

/** Build the module's own WebSocket URL for a room and role. */
export function socketUrl({ basePath, room, role }) {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}${basePath}/ws` +
         `?room=${encodeURIComponent(room)}&role=${role}`;
}
