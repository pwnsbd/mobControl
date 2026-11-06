// Choosing the room a game pairs on.
//
// One job: decide the id. The precedence rule lives here rather than inside
// the controller, so "where did this room come from?" has a single answer.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0 or 1
const LENGTH = 6;
const STORAGE_KEY = 'mobcontrol:room';

export function generate() {
  const bytes = new Uint8Array(LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * Precedence: an id the game asked for, then one in the page URL, then the one
 * this tab used before (so reloading while tuning does not mean rescanning),
 * then a fresh one.
 */
export function resolve({ explicit = null, persist = true } = {}) {
  const room = explicit ?? fromUrl() ?? (persist ? fromSession() : null) ?? generate();
  if (persist) remember(room);
  return room;
}

function fromUrl() {
  return new URLSearchParams(location.search).get('room')?.toUpperCase() ?? null;
}

// sessionStorage throws in some private-browsing modes; a missing room is
// recoverable, a thrown exception at construction time is not.
function fromSession() {
  try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function remember(room) {
  try { sessionStorage.setItem(STORAGE_KEY, room); } catch { /* not important */ }
}
