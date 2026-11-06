// What the controller page does, expressed once, in terms of its parts.
//
// Every collaborator arrives through the constructor, so this class can be
// driven by fake sensors and a fake transport. It owns the stage machine and
// nothing else: no DOM, no sensor APIs, no wire format details.

import * as protocol from '../shared/protocol.js';
import * as mounts from '../shared/mounts.js';
import { createRateLimiter } from '../shared/rate-limit.js';
import { difference, axisAngle } from '../shared/quaternion.js';
import { Rejected } from './grip-teacher.js';

const SAY = {
  connecting: 'Connecting to the game…',
  waiting: 'Connected. Waiting for the game…',
  ready: 'Tap Start to allow motion access.',
  noRoom: 'No room in the link. Scan the QR code on the game screen again.',
  noReading: 'No sensor reading yet — move the phone slightly.',
  recentred: 'Recentred. This posture is now level.',
  playing: 'Tilt to steer.',
  buttonsOnly: 'Ready — use the buttons.',
  denied: 'Motion access was denied. Open Settings → Apps → Safari → ' +
          'Motion & Orientation Access, turn it on, reload this page and tap Start again.',
  insecure: 'Motion access could not be requested. This page must be served over HTTPS.'
};

const TEACH = {
  rest: 'Hold the phone however you like — flat, screen up — and keep still.',
  tilt: 'Now tilt the right-hand edge down.',
  [Rejected.TOO_SMALL]: 'That was a small movement. Try tilting further.',
  [Rejected.TOO_FLAT]: 'That was a flat twist. Tilt one edge DOWN instead.',
  [Rejected.NO_REST]: 'Did not catch that — try again.'
};

const STILL_DEGREES = 1.4;      // per sample, to count as holding steady
const STILL_MS = 650;
const TEACH_TARGET_DEGREES = 30;

export class ControllerApp {
  #stage = 'connecting';
  #layout = null;
  #latestAttitude = null;
  #sensing = false;
  #hasMotion = false;
  #allowSend;
  #teachPhase = null;
  #stillSince = 0;
  #previousAttitude = null;

  constructor({
    room, transport, view, calibrator, gripTeacher, wakeLock,
    orientationSource, motionSource, shakeDetector, requestAccess,
    sendIntervalMs = 16, now = () => performance.now()
  }) {
    Object.assign(this, {
      room, transport, view, calibrator, gripTeacher, wakeLock,
      orientationSource, motionSource, shakeDetector, requestAccess, now
    });
    this.#allowSend = createRateLimiter(sendIntervalMs);
  }

  start() {
    this.view.showRoom(this.room);
    this.view.showPose(mounts.get(this.calibrator.mount));
    this.view.onStart(() => this.#handleStartTap());
    this.view.onTeach(() => this.#beginTeaching());
    this.view.onTeachCancel(() => this.#stopTeaching('armed'));
    this.view.onRecentre(() => this.#recentre());
    this.view.onControls(() => this.#sendFrame({ force: true }));
    this.view.onEditHandle(() => this.view.setEditing(true));
    this.view.onEditDone(() => this.view.setEditing(false));
    this.view.onEditReset(() => this.view.resetLayout());

    if (!this.room) {
      this.#setStage('blocked');
      this.view.say(SAY.noRoom);
      return;
    }

    // Tell the game when the player stops looking — screen locked, another
    // app, another tab. The socket may well survive it; their attention does not.
    document.addEventListener('visibilitychange', () => {
      this.transport.send(protocol.presence(document.visibilityState === 'visible'));
    });

    this.transport.on('open', () => this.view.status(SAY.waiting));
    this.transport.on('close', () => this.view.status('Reconnecting…'));
    this.transport.on('message', (msg) => this.#onMessage(msg));
    this.view.say(SAY.connecting);
    this.transport.connect();
  }

  // --- the game tells us what it wants -----------------------------------

  #onMessage(msg) {
    switch (msg.type) {
      case protocol.MessageType.LAYOUT: return this.#applyLayout(msg);
      case protocol.MessageType.RECENTRE: return this.#recentre();
      case protocol.MessageType.MESSAGE: return this.view.status(msg.text);
    }
  }

  #applyLayout(layout) {
    this.#layout = layout;
    this.calibrator.mount = layout.mount;
    this.view.debug = layout.debug;
    this.view.usesTilt = layout.usesTilt;
    this.view.canTeach = layout.usesTilt;
    this.view.editable = layout.allowLayoutEdit !== false;
    this.view.showPose(mounts.get(layout.mount));
    this.view.showControls(layout.controls ?? []);
    this.view.status('');

    // A game with no tilt needs no sensors: no permission prompt, no
    // calibration. Scan, and play.
    if (!layout.usesTilt) {
      this.#setStage('playing');
      this.view.say(SAY.buttonsOnly);
      this.view.hintEditing();
      this.#sendFrame({ force: true });
      return;
    }
    if (this.#stage === 'connecting') {
      this.#setStage('ready');
      this.view.say(SAY.ready);
    }
  }

  // --- setup -------------------------------------------------------------

  async #handleStartTap() {
    if (this.#stage === 'armed') return void this.#beginPlaying();
    await this.#requestSensors();
  }

  async #requestSensors() {
    let access;
    try {
      access = await this.requestAccess();
    } catch {
      return void this.view.say(SAY.insecure);
    }
    if (!access.orientation) {
      return void this.view.say(access.insecure ? SAY.insecure : SAY.denied);
    }

    this.#hasMotion = access.motion;
    this.#beginSensing();
    this.#setStage('armed');
    this.view.say(this.#poseInstruction());
  }

  #beginSensing() {
    if (this.#sensing) return;
    this.#sensing = true;
    this.orientationSource.start((attitude) => this.#onAttitude(attitude));
    if (this.#hasMotion) {
      this.motionSource.start((sample) => this.shakeDetector.feed(sample.acceleration));
    }
  }

  #beginPlaying(reference = this.#latestAttitude) {
    if (!this.#capture(reference)) return;
    this.#setStage('playing');
    this.view.say(SAY.playing);
    this.view.hintEditing();
  }

  #recentre() {
    if (this.#capture()) this.view.status(SAY.recentred);
  }

  #capture(attitude = this.#latestAttitude) {
    if (!attitude) {
      this.view.say(SAY.noReading);
      return false;
    }
    this.calibrator.capture(attitude);
    this.transport.send(protocol.calibrated());
    return true;
  }

  // --- learning the grip -------------------------------------------------
  //
  // A phone lying flat is rotationally ambiguous, so one guided tilt is what
  // tells us which way the player is facing.

  #beginTeaching() {
    if (!this.#sensing) return void this.view.say(SAY.ready);
    this.#teachPhase = 'rest';
    this.#stillSince = 0;
    this.#previousAttitude = null;
    this.#setStage('teaching');
    this.view.showDial({ text: TEACH.rest, degrees: 0, progress: 0 });
  }

  #stopTeaching(stage, message) {
    this.#teachPhase = null;
    this.#setStage(stage);
    if (message) this.view.say(message);
  }

  #teachStep(attitude) {
    if (this.#teachPhase === 'rest') return this.#waitForStillness(attitude);

    const degrees = this.gripTeacher.turnedDegrees(attitude);
    this.view.showDial({ degrees, progress: degrees / TEACH_TARGET_DEGREES });
    if (degrees < TEACH_TARGET_DEGREES) return;

    this.gripTeacher.rememberTurn(attitude);
    const result = this.gripTeacher.solve();
    if (!result.ok) {
      return this.#stopTeaching('armed', TEACH[result.reason] ?? TEACH[Rejected.NO_REST]);
    }

    this.calibrator.useMeasuredMount(result.quaternion, result.mount ?? 'measured');
    if (result.mount) this.view.showPose(mounts.get(result.mount));
    this.#teachPhase = null;
    // Calibrate against the RESTING pose, not the tilted one they are in now.
    this.#beginPlaying(this.gripTeacher.restAttitude);
    this.view.status(result.mount ? `Grip learned: ${result.mount}` : 'Grip learned.');
  }

  #waitForStillness(attitude) {
    const moved = this.#previousAttitude
      ? axisAngle(difference(this.#previousAttitude, attitude)).degrees
      : Infinity;
    this.#previousAttitude = attitude;

    const time = this.now();
    if (moved > STILL_DEGREES) { this.#stillSince = time; return; }
    if (!this.#stillSince) { this.#stillSince = time; return; }

    const held = time - this.#stillSince;
    this.view.showDial({ degrees: 0, progress: held / STILL_MS });
    if (held < STILL_MS) return;

    this.gripTeacher.rememberRest(attitude);
    this.#teachPhase = 'tilt';
    this.view.showDial({ text: TEACH.tilt, degrees: 0, progress: 0 });
  }

  // --- the input loop ----------------------------------------------------

  #onAttitude(attitude) {
    this.#latestAttitude = attitude;
    if (this.#stage === 'teaching') return this.#teachStep(attitude);

    const tilt = this.calibrator.toVehicleAngles(attitude);
    if (!tilt) return;                        // not calibrated yet

    if (this.#stage === 'playing') this.view.showTilt(clamp(tilt.roll / 30, -1, 1));
    if (this.#layout?.debug) {
      this.view.showAngles(tilt);
      this.view.showShake(this.shakeDetector.level);
    }
    this.#sendFrame({ tilt });
  }

  /** Buttons send immediately; tilt is rate limited. */
  #sendFrame({ tilt = null, force = false } = {}) {
    if (!force && !this.#allowSend()) return;
    const { buttons, sticks } = this.view.controlState;
    this.transport.send(protocol.input({
      tilt: tilt ?? this.#tiltNow(),
      buttons,
      sticks,
      shake: this.shakeDetector.level
    }));
  }

  #tiltNow() {
    return this.#latestAttitude
      ? this.calibrator.toVehicleAngles(this.#latestAttitude)
      : null;
  }

  #setStage(stage) {
    this.#stage = stage;
    this.view.stage = stage;
    // Someone tilting a phone is using it, but the screen does not know that,
    // so it would dim, lock, and drop the socket mid-game.
    if (stage === 'playing') this.wakeLock?.acquire();
    else this.wakeLock?.release();
  }

  #poseInstruction() {
    return 'Rest the phone flat on your palm, screen up, ' +
           `${mounts.get(this.calibrator.mount).instruction}. Then tap Calibrate.`;
  }
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
