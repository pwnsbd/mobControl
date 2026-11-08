// Every line of DOM code for the controller page lives here.
//
// The app talks to this view in its own vocabulary — stage, say, showDial —
// and never touches an element.

import * as poseDiagram from './pose-diagram.js';
import { ControlPad } from './control-pad.js';
import { PadLayoutStore } from './pad-layout.js';

/** @typedef {'connecting'|'ready'|'armed'|'teaching'|'playing'|'interrupted'|'blocked'} Stage */

const START_LABEL = {
  connecting: 'Start', ready: 'Enable motion', armed: 'Calibrate', interrupted: 'Start', blocked: 'Start'
};
const DIAL_CIRCUMFERENCE = 327;        // 2 * pi * r, r = 52

export class ControllerView {
  #el;
  #pad;
  #root;
  #store = new PadLayoutStore();
  #controls = [];
  #layoutOrientation;
  #fixedOrientation = 'any';
  #rotated = false;
  #recommendedOrientation;
  #tiltVisible = false;
  #tiltDirection = '';
  #canEdit = false;
  #editing = false;
  #motion = { available: false, enabled: false, settingUp: false, keepJoystick: false };

  constructor(root = document) {
    this.#root = root;
    const byId = (id) => root.getElementById(id);
    this.#el = {
      room: byId('room'), setup: byId('setup'), teaching: byId('teaching'),
      pose: byId('pose'), message: byId('message'), status: byId('status'),
      start: byId('start'), teach: byId('teach'), teachCancel: byId('teach-cancel'),
      teachText: byId('teach-text'), dialFill: byId('dial-fill'), dialValue: byId('dial-value'),
      tilt: byId('tilt'), tiltDot: byId('tilt-dot'), tiltLabel: byId('tilt-label'), pad: byId('pad'),
      recentre: byId('recentre'), readout: byId('readout'),
      motionToggle: byId('motion-toggle'),
      motionSkip: byId('motion-skip'),
      editHandle: byId('edit-handle'), editBar: byId('edit-bar'),
      editDone: byId('edit-done'), editReset: byId('edit-reset'),
      layoutOrientation: byId('layout-orientation'),
      yaw: byId('yaw'), pitch: byId('pitch'), roll: byId('roll'), shake: byId('shake')
    };
    this.#pad = new ControlPad(this.#el.pad);
  }

  onStart(fn) { this.#el.start.addEventListener('click', fn); }
  onTeach(fn) { this.#el.teach.addEventListener('click', fn); }
  onTeachCancel(fn) { this.#el.teachCancel.addEventListener('click', fn); }
  onRecentre(fn) { this.#el.recentre.addEventListener('click', fn); }
  onMotionToggle(fn) {
    this.#el.motionToggle.addEventListener('click', fn);
    this.#el.motionSkip.addEventListener('click', fn);
  }
  onControls(fn) { this.#pad.onChange(fn); }
  onDrag(fn) { this.#pad.onDrag(fn); }
  onEditDone(fn) { this.#el.editDone.addEventListener('click', fn); }
  onEditReset(fn) { this.#el.editReset.addEventListener('click', fn); }

  onEditHandle(fn) { this.#el.editHandle.addEventListener('click', fn); }

  /** True while the screen is wider than it is tall. */
  get isLandscape() { return window.innerWidth > window.innerHeight; }

  /** Browser screen angle with the controller's clockwise CSS turn applied. */
  get motionAngle() {
    const angle = window.screen?.orientation?.angle ?? window.orientation;
    if (!Number.isFinite(angle) || angle % 90 !== 0) return null;
    return angle - (this.#rotated ? 90 : 0);
  }

  /** Called when the phone is turned (or the window otherwise changes shape). */
  onOrientation() {
    const changed = () => {
      if (this.#layoutOrientation && (this.#layoutOrientation !== this.#effectiveOrientation
          || this.#rotated !== this.#needsRotation)) {
        this.#pad.releaseAll();
        this.#loadLayout();
      }
    };
    window.addEventListener('resize', changed);
    window.addEventListener('orientationchange', changed);
  }

  get #screenOrientation() { return this.isLandscape ? 'landscape' : 'portrait'; }
  get #effectiveOrientation() {
    return this.#fixedOrientation === 'any' ? this.#screenOrientation : this.#fixedOrientation;
  }
  get #needsRotation() { return this.#effectiveOrientation !== this.#screenOrientation; }

  /** @returns {{buttons:Object, sticks:Object}} */
  get controlState() { return this.#pad.state; }

  /** Let go of every held button and stick. */
  releaseControls() { this.#pad.releaseAll(); }

  showRoom(room) { this.#el.room.textContent = room ?? 'no room'; }
  showPose(mount, options) { this.#el.pose.innerHTML = poseDiagram.render(mount, options); }
  say(text) { this.#el.message.textContent = text; }
  status(text) { this.#el.status.textContent = text ?? ''; }
  set canTeach(on) { this.#el.teach.hidden = !on; }

  showControls(controls, orientation, recommendedOrientation) {
    this.#controls = controls;
    this.#fixedOrientation = orientation;
    this.#recommendedOrientation = recommendedOrientation;
    this.#loadLayout();
  }

  #loadLayout() {
    const orientation = this.#effectiveOrientation;
    const controls = this.#controls;
    this.#layoutOrientation = orientation;
    this.#rotated = this.#needsRotation;
    const root = this.#root.documentElement;
    root.dataset.layoutOrientation = orientation;
    root.dataset.layoutRotation = this.#rotated ? 'clockwise' : '';
    this.#pad.rotated = this.#rotated;
    this.#pad.setControls(controls, this.#store.load(controls, orientation));
    this.#pad.onLayoutChange((layout) => this.#store.save(controls, layout, orientation));
    const label = this.#el.layoutOrientation;
    label.textContent = orientation === 'portrait' ? 'Portrait' : 'Landscape';
    if (this.#recommendedOrientation && this.#recommendedOrientation !== orientation) {
      label.textContent += this.#recommendedOrientation === 'landscape'
        ? ' · Landscape recommended' : ' · Portrait recommended';
    }
  }

  /** Whether this game allows the player to rearrange its controls. */
  set editable(on) { this.#canEdit = on; }

  setEditing(on) {
    this.#editing = on && this.#canEdit;
    this.#pad.editing = this.#editing;
    this.#el.editBar.hidden = !this.#editing;
    this.#el.editHandle.setAttribute('aria-expanded', String(this.#editing));
    this.#el.editHandle.disabled = this.#editing;
    this.#el.editHandle.classList.toggle('is-active', this.#editing);
    this.status(this.#editing ? '' : 'Layout saved on this phone.');
  }

  /** Tell the player where to customize this controller. */
  hintEditing() {
    if (!this.#canEdit || !this.#controls.some(({ type }) => type !== 'drag')) return;
    this.status('Use Layout to move or resize controls');
    this.#el.editHandle.classList.add('is-new');
    setTimeout(() => this.#el.editHandle.classList.remove('is-new'), 5500);
  }

  resetLayout() {
    this.#store.forget(this.#controls, this.#layoutOrientation);
    this.#loadLayout();
  }

  /** The teaching dial: a prompt, and how far round the gesture has got. */
  showDial({ text, degrees = 0, progress = 0 }) {
    if (text !== undefined) this.#el.teachText.textContent = text;
    this.#el.dialValue.textContent = `${Math.round(degrees)}°`;
    this.#el.dialFill.style.strokeDashoffset =
      String(DIAL_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress))));
  }

  /** Live feedback that tilting is doing something. -1..1. */
  showTilt(value) {
    const amount = Math.max(-1, Math.min(1, Number(value) || 0));
    this.#el.tiltDot.style.transform = `translateX(${amount * 140}px)`;
    this.#el.tiltDot.style.opacity = String(0.58 + Math.abs(amount) * 0.42);
    const direction = Math.abs(amount) < 0.08 ? 'centred' : amount < 0 ? 'left' : 'right';
    if (direction !== this.#tiltDirection) {
      this.#tiltDirection = direction;
      this.#el.tiltLabel.textContent = direction === 'centred'
        ? 'Steering centred'
        : `Steering ${direction}`;
    }
  }

  showAngles({ yaw, pitch, roll }) {
    this.#el.yaw.textContent = `${yaw.toFixed(0)}°`;
    this.#el.pitch.textContent = `${pitch.toFixed(0)}°`;
    this.#el.roll.textContent = `${roll.toFixed(0)}°`;
  }

  showShake(level) { this.#el.shake.style.transform = `scaleX(${level})`; }

  set debug(on) { this.#el.readout.hidden = !on; }
  set usesTilt(on) { this.#tiltVisible = on; }

  /** Update the motion toggle and its motion-only play affordances. */
  setMotionMode({ available, enabled, settingUp, keepJoystick = false }) {
    this.#motion = {
      available: Boolean(available), enabled: Boolean(enabled),
      settingUp: Boolean(settingUp), keepJoystick: Boolean(keepJoystick)
    };
    this.#syncMotionMode();
  }

  #syncMotionMode() {
    const root = this.#root.documentElement;
    root.dataset.motionEnabled = String(this.#motion.enabled);
    root.dataset.motionReplacesJoystick = String(this.#motion.enabled && !this.#motion.keepJoystick);
    this.#el.motionToggle.setAttribute('aria-pressed', String(this.#motion.enabled));
    this.#el.motionToggle.textContent = this.#motion.settingUp
      ? 'Cancel motion' : `Motion ${this.#motion.enabled ? 'ON' : 'OFF'}`;
    const stage = root.dataset.stage;
    this.#el.motionSkip.hidden = !this.#motion.available || !['ready', 'armed'].includes(stage);
    this.#el.motionToggle.hidden = !this.#motion.available
      || !['teaching', 'playing'].includes(stage);
    const tilt = stage === 'playing' && this.#motion.enabled && this.#tiltVisible;
    this.#el.recentre.hidden = !tilt;
    this.#el.tilt.hidden = !tilt;
  }

  /**
   * Exactly one panel is on screen at a time; once playing, the screen belongs
   * to the player.
   * @param {Stage} stage
   */
  set stage(stage) {
    const playing = stage === 'playing';
    const teaching = stage === 'teaching';
    const hasControls = this.#controls.length > 0;

    // The stylesheet keys its palette and layout off this; no logic lives here.
    if (this.#root.documentElement) this.#root.documentElement.dataset.stage = stage;
    this.#el.setup.hidden = playing || teaching;
    this.#el.teaching.hidden = !teaching;
    this.#el.recentre.hidden = !(playing && this.#motion.enabled && this.#tiltVisible);
    this.#el.tilt.hidden = !(playing && this.#motion.enabled && this.#tiltVisible);
    this.#el.pad.hidden = !(playing && hasControls);
    this.#el.editHandle.hidden = !(playing && this.#canEdit && this.#controls.some(({ type }) => type !== 'drag'));

    if (!playing && this.#editing) this.setEditing(false);
    if (!playing && !teaching) {
      this.#el.start.textContent = START_LABEL[stage];
      this.#el.start.disabled = stage === 'blocked' || stage === 'connecting' || stage === 'interrupted';
    }
    this.#syncMotionMode();
  }
}
