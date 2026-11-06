// mobcontrol, game side â€” the public entry point.
//
//   const pad = new PhoneController({
//     axes:    { x: 'roll' },
//     buttons: [{ id: 'jump', label: 'JUMP' }]
//   });
//
//   pad.axis.x        // -1..1
//   pad.button.jump   // held
//   pad.on('press', ({ id }) => ...)
//
// A gamepad: axes and buttons. The game declares the layout, the phone renders
// itself to match, and nothing here knows what your buttons mean.

import { Emitter } from './shared/emitter.js';
import * as protocol from './shared/protocol.js';
import { ReconnectingSocket, socketUrl } from './shared/transport.js';
import { DEFAULT_MOUNT } from './shared/mounts.js';
import * as roomId from './game/room-id.js';
import { createAxisMapper } from './game/axis-pipeline.js';
import { CdnQrRenderer } from './game/qr.js';

const DEFAULTS = {
  mount: DEFAULT_MOUNT,
  axes: {},
  buttons: [],              // shorthand for controls of type 'button'
  controls: [],             // { id, type: 'button' | 'stick' | 'dpad', label?, side? }
  orientation: 'any',       // 'landscape' | 'portrait' | 'any': how the controls were designed to be held
  deadzone: 3,        // degrees of slop ignored
  range: 35,          // degrees that count as full deflection
  smoothing: 0,
  debug: false,
  allowLayoutEdit: true,      // let the player drag the buttons where they want
  persistRoom: true
};

export class PhoneController {
  #events = new Emitter();
  #mapper;
  #transport;
  #qr;
  #layout;

  constructor(options = {}) {
    const settings = { ...DEFAULTS, ...options };

    this.basePath = settings.basePath ?? defaultBasePath();
    this.mount = settings.mount;
    this.room = roomId.resolve({ explicit: settings.room, persist: settings.persistRoom });
    this.pairUrl = `${location.origin}${this.basePath}/phone?room=${this.room}`;

    this.#mapper = createAxisMapper(settings);
    /** Whether a phone can really use this page, and what to say if not. */
    this.reachability = checkReachability(Object.keys(settings.axes).length > 0);
    const controls = normaliseControls(settings);
    this.#layout = protocol.layout({
      mount: settings.mount,
      usesTilt: this.#mapper.names.length > 0,
      controls,
      orientation: settings.orientation,     // unknown values become 'any' on the wire
      debug: settings.debug,
      allowLayoutEdit: settings.allowLayoutEdit
    });

    /** -1â€¦1 per declared axis, under the game's own names. */
    this.axis = this.#mapper.zeroed();
    /** true while held, per declared button id. */
    this.button = zeroed(onlyOfType(controls, 'button'), () => false);
    /**
     * -1…1 on each axis, per declared stick or dpad. A dpad is a stick that
     * snaps, so a game reads both the same way and can swap one for the other.
     */
    this.stick = zeroed(
      controls.filter((c) => c.type !== 'button'),
      () => ({ x: 0, y: 0 })
    );
    this.shake = 0;
    this.connected = false;
    this.calibrated = false;
    /** False while the phone is connected but the player has looked away. */
    this.watching = true;

    this.#qr = settings.qrRenderer ?? new CdnQrRenderer();
    this.#transport = settings.transport ?? new ReconnectingSocket(
      () => socketUrl({ basePath: this.basePath, room: this.room, role: 'game' })
    );

    this.#transport.on('open', () => this.#transport.send(this.#layout));
    this.#transport.on('message', (msg) => this.#onMessage(msg));
    this.#transport.on('close', () => this.#reset());
    if (options.autoConnect !== false) this.#transport.connect();
  }

  /**
   * 'pair' | 'unpair' — a phone arrived or left
   * 'suspend' | 'resume' — still connected, but the player looked away
   * 'calibrate' | 'press' | 'release' | 'input' | 'error'
   */
  on(name, fn) { return this.#events.on(name, fn); }

  /** Draw the pairing code into an element. Resolves when it is on screen. */
  async mountQR(element, size) {
    try {
      await this.#qr.render(element, this.pairUrl, size);
    } catch (error) {
      element.textContent = this.pairUrl;      // still typable
      this.#events.emit('error', error);
    }
  }

  /** Show a line of text on the phone. */
  message(text) { this.#transport.send(protocol.message(text)); }
  /** Ask the phone to recapture its reference pose. */
  recentre() { this.#transport.send(protocol.recentre()); }
  disconnect() { this.#transport.close(); }

  // --- incoming ----------------------------------------------------------

  #onMessage(msg) {
    switch (msg.type) {
      case protocol.MessageType.PAIRED:
        this.connected = true;
        // Re-announce, so a phone that joined after us is laid out correctly
        // whether or not the relay remembered anything.
        this.#transport.send(this.#layout);
        this.#events.emit('pair');
        break;
      case protocol.MessageType.UNPAIRED:
        this.#reset();
        break;
      case protocol.MessageType.CALIBRATED:
        this.calibrated = true;
        this.#events.emit('calibrate');
        break;
      case protocol.MessageType.PRESENCE:
        this.#onPresence(msg.visible !== false);
        break;
      case protocol.MessageType.INPUT:
        this.#onInput(msg);
        break;
    }
  }

  #onInput(frame) {
    this.axis = this.#mapper.apply(frame);
    this.shake = frame.shake ?? 0;
    this.#updateButtons(frame.buttons ?? {});
    this.#updateSticks(frame.sticks ?? {});
    this.#events.emit('input', this);
  }

  /**
   * The phone is still connected but the player has looked away. Most games
   * should pause; what "resume" means is theirs to decide, so nothing happens
   * here beyond saying so.
   */
  #onPresence(visible) {
    if (visible === this.watching) return;
    this.watching = visible;
    if (!visible) this.#releaseEverything();
    this.#events.emit(visible ? 'resume' : 'suspend');
  }

  /** A player who has looked away is not holding anything down. */
  #releaseEverything() {
    this.#updateButtons({});
    this.#updateSticks({});
    this.axis = this.#mapper.zeroed();
    this.#mapper.reset();
    this.shake = 0;
  }

  #updateSticks(incoming) {
    for (const id of Object.keys(this.stick)) {
      const next = incoming[id];
      this.stick[id] = next ? { x: next.x ?? 0, y: next.y ?? 0 } : { x: 0, y: 0 };
    }
  }

  /** Edges become events; levels stay readable on `button`. */
  #updateButtons(incoming) {
    for (const id of Object.keys(this.button)) {
      const down = Boolean(incoming[id]);
      if (down === this.button[id]) continue;
      this.button[id] = down;
      this.#events.emit(down ? 'press' : 'release', { id });
    }
  }

  #reset() {
    const wasConnected = this.connected;
    this.connected = false;
    this.calibrated = false;
    this.watching = true;
    this.shake = 0;
    this.axis = this.#mapper.zeroed();
    this.#mapper.reset();
    this.#updateButtons({});                   // release anything still held
    this.#updateSticks({});
    if (wasConnected) this.#events.emit('unpair');
  }
}

const CONTROL_TYPES = new Set(['button', 'stick', 'dpad']);

/**
 * `buttons: ['jump']` and `controls: [{type:'stick', id:'move'}]` are the same
 * list underneath. The short form stays short; the long form names the type.
 */
function normaliseControls({ buttons = [], controls = [] }) {
  const all = [
    ...buttons.map((b) => (typeof b === 'string' ? { id: b } : b))
              .map((b) => ({ ...b, type: 'button' })),
    ...controls.map((c) => ({ ...c, type: c.type ?? 'button' }))
  ];
  for (const control of all) {
    if (!control.id) throw new Error('mobcontrol: every control needs an id');
    if (!CONTROL_TYPES.has(control.type)) {
      throw new Error(
        `mobcontrol: control "${control.id}" has type "${control.type}", ` +
        `which is not one of ${[...CONTROL_TYPES].join(', ')}`
      );
    }
  }
  return all.map((control) => ({
    id: control.id,
    type: control.type,
    label: control.label ?? (control.type === 'button' ? control.id.toUpperCase() : control.id),
    side: control.side,
    x: control.x,
    y: control.y
  }));
}

const onlyOfType = (controls, type) => controls.filter((c) => c.type === type);

const zeroed = (controls, make) =>
  Object.fromEntries(controls.map(({ id }) => [id, make()]));

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Can a phone actually use this page? Two things go wrong in development and
 * both fail quietly, so the game is told plainly enough to show the player.
 *
 * @param {boolean} usesTilt  buttons work on an insecure page; sensors do not
 */
export function checkReachability(usesTilt, loc = location) {
  if (LOCAL_HOSTS.has(loc.hostname) || loc.hostname.endsWith('.localhost')) {
    return {
      ok: false,
      reason: 'localhost',
      message: 'This page is on localhost, so the QR code points somewhere your phone ' +
               'cannot reach. Run a tunnel and open the https:// address it prints.'
    };
  }
  if (usesTilt && loc.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'insecure',
      message: 'This page is not HTTPS. Your phone will pair and the buttons will work, ' +
               'but iOS and Android both block motion sensors on insecure pages, so tilt will not.'
    };
  }
  return { ok: true, reason: 'ok', message: '' };
}

/** Accepts ['jump'] or [{id,label,side}] â€” both are obvious to write. */
function normaliseButtons(buttons) {
  return buttons.map((button, index) => {
    const spec = typeof button === 'string' ? { id: button } : button;
    return {
      id: spec.id,
      label: spec.label ?? spec.id.toUpperCase(),
      side: spec.side ?? (index === 0 ? 'right' : 'left')
    };
  });
}

function buttonsDown(buttons, value) {
  return Object.fromEntries(buttons.map(({ id }) => [id, value]));
}

/** This file is served from <basePath>/controller.js, so its own URL says where. */
function defaultBasePath() {
  return new URL('.', import.meta.url).pathname.replace(/\/$/, '');
}

export { names as mountNames, register as registerMount, DEFAULT_MOUNT } from './shared/mounts.js';
export { layouts } from './layouts.js';
export default PhoneController;
