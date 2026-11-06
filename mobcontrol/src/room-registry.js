'use strict';

// Who is in which room. Pure bookkeeping: it has never heard of WebSockets,
// HTTP or JSON, which is what makes the pairing rules testable on their own.

const ROLES = Object.freeze(['game', 'phone']);

const other = (role) => (role === 'game' ? 'phone' : 'game');

class RoomRegistry {
  #rooms = new Map();
  #limit;

  constructor({ maxRooms = 500 } = {}) {
    this.#limit = maxRooms;
  }

  static isValidRole(role) {
    return ROLES.includes(role);
  }

  get size() { return this.#rooms.size; }

  get isFull() { return this.#rooms.size >= this.#limit; }

  has(roomId) { return this.#rooms.has(roomId); }

  /**
   * Seat a connection. A role reconnecting replaces its own stale seat rather
   * than being refused, because a phone that locks and wakes is the normal
   * case, not an error.
   * @returns {{peer:*|null, displaced:*|null}}
   */
  join(roomId, role, connection) {
    const room = this.#ensure(roomId);
    const displaced = room[role] && room[role] !== connection ? room[role] : null;
    room[role] = connection;
    return { peer: room[other(role)], displaced };
  }

  /** Only clears the seat if this exact connection still holds it. */
  leave(roomId, role, connection) {
    const room = this.#rooms.get(roomId);
    if (!room || room[role] !== connection) return { peer: null, emptied: false };

    room[role] = null;
    const peer = room[other(role)];
    const emptied = !room.game && !room.phone;
    if (emptied) this.#rooms.delete(roomId);
    return { peer, emptied };
  }

  peerOf(roomId, role) {
    return this.#rooms.get(roomId)?.[other(role)] ?? null;
  }

  connectionOf(roomId, role) {
    return this.#rooms.get(roomId)?.[role] ?? null;
  }

  /** The game's declared setup, kept so a phone joining later still gets it. */
  rememberConfig(roomId, config) {
    const room = this.#rooms.get(roomId);
    if (room) room.config = config;
  }

  configOf(roomId) {
    return this.#rooms.get(roomId)?.config ?? null;
  }

  #ensure(roomId) {
    if (!this.#rooms.has(roomId)) {
      this.#rooms.set(roomId, { game: null, phone: null, config: null });
    }
    return this.#rooms.get(roomId);
  }
}

module.exports = { RoomRegistry, ROLES, other };
