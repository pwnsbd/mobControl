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
import { pulse } from './haptics.js';

const SAY = {
  connecting: 'Connecting to the game…',
  waiting: 'Connected. Waiting for the game…',
  ready: 'This game uses your phone’s motion to steer. Tap Enable motion to continue.',
  rawMotion: 'This game uses your phone’s accelerometer and gyroscope. ' +
             'Enable motion to share those readings with the paired game while you play.',
  noRoom: 'No room in the link. Scan the QR code on the game screen again.',
  noReading: 'No sensor reading yet — move the phone slightly.',
  recentred: 'Recentred. This posture is now level.',
  playing: 'Tilt to steer.',
  interrupted: 'Connection lost — input is not reaching the game. Reconnecting…',
  buttonsOnly: 'Ready — use the buttons.',
  denied: 'Motion access was denied. Open Settings → Apps → Safari → ' +
          'Motion & Orientation Access, turn it on, reload this page and tap Enable motion again.',
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
  #latestMotion = null;
  #sensing = false;
  #sensingMotion = false;
  #shareMotion = false;
  #motionEnabled = false;
  #requestingMotion = false;
  #motionRequest = 0;
  #allowSend;
  #teachPhase = null;
  #stillSince = 0;
  #previousAttitude = null;
  #resumeStage = null;
  #releasing = false;

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
    this.view.onMotionToggle(() => this.#toggleMotion());
    this.view.onTeach(() => this.#beginTeaching());
    this.view.onTeachCancel(() => this.#stopTeaching('armed'));
    this.view.onRecentre(() => this.#recentre());
    this.view.onControls(() => { if (!this.#releasing) this.#sendFrame({ force: true }); });
    this.view.onEditHandle(() => this.view.setEditing(true));
    this.view.onEditDone(() => this.view.setEditing(false));
    this.view.onEditReset(() => this.view.resetLayout());
    this.view.onOrientation();

    if (!this.room) {
      this.#setStage('blocked');
      this.view.say(SAY.noRoom);
      return;
    }

    // Tell the game when the player stops looking — screen locked, another
    // app, another tab. The socket may well survive it; their attention does not.
    document.addEventListener('visibilitychange', () => {
      const visible = document.visibilityState === 'visible';
      // A thumb that was down when the screen went away will never come up.
      // The socket is alive, so the game gets told.
      if (!visible) {
        this.#latestMotion = null;
        this.#releaseControls();
        this.#sendFrame({ force: true });
      }
      this.transport.send(protocol.presence(visible));
    });

    this.transport.on('open', () => this.#onOpen());
    this.transport.on('close', () => this.#onClose());
    this.transport.on('message', (msg) => this.#onMessage(msg));
    this.view.say(SAY.connecting);
    this.transport.connect();
  }

  // --- the socket comes and goes -----------------------------------------

  /** Release locally; the socket is gone, so there is nothing to send to. */
  #onClose() {
    this.#latestMotion = null;
    this.#releaseControls();
    if (this.#stage !== 'interrupted') {
      this.#resumeStage = this.#stage;
      if (this.#stage === 'playing') {
        this.#setStage('interrupted');
        this.view.say(SAY.interrupted);
      }
    }
    this.view.status('Reconnecting…');
  }

  #onOpen() {
    this.view.status(SAY.waiting);
    if (this.#stage !== 'interrupted') return;
    if (this.#resumeStage === 'playing') {
      this.#enterPlay({ hint: false });
    } else {
      this.#setStage(this.#resumeStage);
      this.view.say(this.#layout?.usesTilt ? SAY.playing : SAY.buttonsOnly);
    }
    this.#sendFrame({ force: true });
  }

  #releaseControls() {
    this.#releasing = true;                // the pad's own change events must not send
    try { this.view.releaseControls(); } finally { this.#releasing = false; }
  }

  // --- the game tells us what it wants -----------------------------------

  #onMessage(msg) {
    switch (msg.type) {
      case protocol.MessageType.LAYOUT: return this.#applyLayout(msg);
      case protocol.MessageType.RECENTRE: return this.#recentre();
      case protocol.MessageType.MESSAGE: return this.view.status(msg.text);
      case protocol.MessageType.VIBRATE:
        if (this.#stage === 'playing' && document.visibilityState === 'visible') {
          pulse(msg.duration ?? 0);
        }
        break;
    }
  }

  #applyLayout(layout) {
    const wasOptional = this.#motionOptional;
    const previous = this.#layout;
    this.#layout = layout;
    const sensorsChanged = !previous || wasOptional !== this.#motionOptional ||
      ['usesMotion', 'usesTilt', 'motionWithJoystick'].some((key) =>
        Boolean(previous[key]) !== Boolean(layout[key]));
    if (sensorsChanged) this.#stopMotion();
    if (!layout.usesMotion) {
      this.#shareMotion = false;
      this.#latestMotion = null;
    }
    this.calibrator.mount = layout.mount;
    this.view.debug = layout.debug;
    this.view.usesTilt = layout.usesTilt;
    this.view.canTeach = layout.usesTilt;
    this.view.editable = layout.allowLayoutEdit !== false;
    this.view.showPose(mounts.get(layout.mount));
    this.view.showControls(
      layout.controls ?? [], protocol.normaliseOrientation(layout.orientation), layout.recommendedOrientation
    );
    this.view.status('');

    // A touch-only game can start as soon as it pairs.
    if (!this.#usesSensors || (sensorsChanged && this.#motionOptional)) {
      this.#enterPlay();
      this.#sendFrame({ force: true });
      return;
    }
    if (sensorsChanged) this.#showMotionSetup();
  }

  get #usesSensors() { return Boolean(this.#layout?.usesTilt || this.#layout?.usesMotion); }

  get #motionOptional() {
    return this.#usesSensors && !this.#layout.motionWithJoystick &&
      (this.#layout.controls ?? []).some(({ type }) => type === 'stick' || type === 'dpad');
  }

  #showMotionSetup() {
    this.#releaseControls();
    this.#setStage('ready');
    const notice = this.#layout.usesMotion ? SAY.rawMotion : SAY.ready;
    this.view.say(this.#motionOptional ? `${notice} You can use the joystick instead.` : notice);
    this.#sendFrame({ force: true });
  }

  #toggleMotion() {
    if (!this.#motionOptional) return;
    if (this.#stage === 'playing' && !this.#motionEnabled) {
      this.#showMotionSetup();
      return;
    }
    this.#releaseControls();
    this.#stopMotion();
    this.#enterPlay({ hint: false });
    this.view.status('Motion off. Use the joystick.');
    this.#sendFrame({ force: true });
  }

  #stopMotion() {
    this.#motionRequest += 1;
    this.#requestingMotion = false;
    if (this.#sensing) this.orientationSource.stop?.();
    if (this.#sensingMotion) this.motionSource.stop?.();
    this.#sensing = false;
    this.#sensingMotion = false;
    this.#motionEnabled = false;
    this.#shareMotion = false;
    this.#latestAttitude = null;
    this.#latestMotion = null;
    this.#teachPhase = null;
    this.shakeDetector.reset?.();
  }

  #enterPlay({ hint = true } = {}) {
    this.#setStage('playing');
    this.view.say(this.#motionEnabled && this.#layout?.usesTilt ? SAY.playing : SAY.buttonsOnly);
    if (hint) this.view.hintEditing();
  }

  // --- setup -------------------------------------------------------------

  async #handleStartTap() {
    if (this.#stage === 'armed') return void this.#beginPlaying();
    await this.#requestSensors();
  }

  async #requestSensors() {
    if (this.#stage !== 'ready' || this.#requestingMotion) return;
    this.#requestingMotion = true;
    const request = this.#motionRequest;
    const requestedRawMotion = this.#layout?.usesMotion === true;
    let access;
    try {
      access = await this.requestAccess({
        orientation: !!this.#layout?.usesTilt,
        motion: requestedRawMotion || !!this.#layout?.usesTilt
      });
    } catch {
      access = { insecure: true };
    } finally {
      if (request === this.#motionRequest) this.#requestingMotion = false;
    }
    if (this.#stage !== 'ready' || request !== this.#motionRequest) return;
    if (this.#layout?.usesTilt && !access.orientation) {
      if (this.#motionOptional) {
        this.#toggleMotion();
        this.view.status('Motion unavailable. Use the joystick.');
        return;
      }
      return void this.view.say(access.insecure ? SAY.insecure : SAY.denied);
    }

    this.#shareMotion = requestedRawMotion && this.#layout?.usesMotion === true && access.motion;
    if (access.orientation || access.motion) {
      this.#beginSensing({ orientation: access.orientation && !!this.#layout?.usesTilt, motion: access.motion });
    }
    if (!this.#layout?.usesTilt) {
      this.#motionEnabled = Boolean(access.motion);
      this.#enterPlay();
      if (!access.motion) {
        this.view.status(access.insecure
          ? 'Motion needs HTTPS. Touch controls still work.'
          : 'Motion unavailable. Touch controls still work.');
      }
      this.#sendFrame({ force: true });
      return;
    }
    this.#setStage('armed');
    this.view.say(this.#poseInstruction());
  }

  #beginSensing({ orientation, motion }) {
    if (orientation && !this.#sensing) {
      this.#sensing = true;
      this.orientationSource.start((attitude) => this.#onAttitude(attitude));
    }
    if (motion && !this.#sensingMotion) {
      this.#sensingMotion = true;
      this.motionSource.start((sample) => {
        if (document.visibilityState !== 'visible' || this.#stage === 'interrupted') return;
        if ((this.#layout?.usesTilt || this.#shareMotion) && sample.acceleration) {
          this.shakeDetector.feed(sample.acceleration);
        }
        if (this.#shareMotion && this.#stage === 'playing') {
          this.#latestMotion = { sample, angle: this.view.motionAngle };
          this.#sendFrame();
        }
      });
    }
  }

  #beginPlaying(reference = this.#latestAttitude) {
    if (!this.#capture(reference)) return;
    this.#motionEnabled = true;
    this.#enterPlay();
    this.#sendFrame({ force: true });
  }

  #recentre() {
    if (!this.#motionEnabled) return;
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
    if (!this.#motionEnabled) return;

    const tilt = this.calibrator.toVehicleAngles(attitude);
    if (!tilt) return;                        // not calibrated yet

    if (this.#stage === 'playing') this.view.showTilt(clamp(tilt.roll / 30, -1, 1));
    if (this.#layout?.debug) {
      this.view.showAngles(tilt);
      this.view.showShake(this.shakeDetector.level);
    }
    this.#sendFrame({ tilt });
  }

  /** Buttons send immediately. Sensor updates share a rate limit. */
  #sendFrame({ tilt = null, force = false } = {}) {
    // Nobody is listening while interrupted.
    if (this.#stage === 'interrupted') return;
    if (!force && !this.#allowSend()) return;
    const { buttons, sticks } = this.view.controlState;
    const input = {
      tilt: this.#motionEnabled ? tilt ?? this.#tiltNow() : null,
      buttons,
      sticks: this.#motionEnabled && !this.#layout.motionWithJoystick ? {} : sticks,
      shake: this.#motionEnabled ? this.shakeDetector.level : 0,
      motionEnabled: this.#usesSensors ? this.#motionEnabled : undefined
    };
    if (this.#shareMotion && this.#stage === 'playing' &&
        document.visibilityState === 'visible' && this.#latestMotion) {
      input.motion = this.#latestMotion.sample;
      input.motionAngle = this.#latestMotion.angle;
    }
    this.transport.send(protocol.input(input));
  }

  #tiltNow() {
    return this.#latestAttitude
      ? this.calibrator.toVehicleAngles(this.#latestAttitude)
      : null;
  }

  #setStage(stage) {
    this.#stage = stage;
    this.view.setMotionMode({
      available: this.#motionOptional,
      enabled: this.#motionEnabled,
      settingUp: stage === 'ready' || stage === 'armed' || stage === 'teaching',
      keepJoystick: this.#layout?.motionWithJoystick === true
    });
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
