// Every line of DOM code for the controller page lives here.
//
// The app talks to this view in its own vocabulary — stage, say, showDial —
// and never touches an element.

import * as poseDiagram from './pose-diagram.js';
import { ControlPad } from './control-pad.js';
import { PadLayoutStore } from './pad-layout.js';

/** @typedef {'connecting'|'ready'|'armed'|'teaching'|'playing'|'rotate'|'interrupted'|'blocked'} Stage */

const START_LABEL = {
  connecting: 'Start', ready: 'Start', armed: 'Calibrate', interrupted: 'Start', blocked: 'Start'
};
const DIAL_CIRCUMFERENCE = 327;        // 2 * pi * r, r = 52
const DOUBLE_TAP_MS = 450;

export class ControllerView {
  #el;
  #pad;
  #root;
  #store = new PadLayoutStore();
  #controls = [];
  #tiltVisible = false;
  #canEdit = false;
  #editing = false;

  constructor(root = document) {
    this.#root = root;
    const byId = (id) => root.getElementById(id);
    this.#el = {
      room: byId('room'), setup: byId('setup'), rotate: byId('rotate'), rotateText: byId('rotate-text'), teaching: byId('teaching'),
      pose: byId('pose'), message: byId('message'), status: byId('status'),
      start: byId('start'), teach: byId('teach'), teachCancel: byId('teach-cancel'),
      teachText: byId('teach-text'), dialFill: byId('dial-fill'), dialValue: byId('dial-value'),
      tilt: byId('tilt'), tiltDot: byId('tilt-dot'), pad: byId('pad'),
      recentre: byId('recentre'), readout: byId('readout'),
      editHandle: byId('edit-handle'), editBar: byId('edit-bar'),
      editDone: byId('edit-done'), editReset: byId('edit-reset'),
      yaw: byId('yaw'), pitch: byId('pitch'), roll: byId('roll'), shake: byId('shake')
    };
    this.#pad = new ControlPad(this.#el.pad);
  }

  onStart(fn) { this.#el.start.addEventListener('click', fn); }
  onTeach(fn) { this.#el.teach.addEventListener('click', fn); }
  onTeachCancel(fn) { this.#el.teachCancel.addEventListener('click', fn); }
  onRecentre(fn) { this.#el.recentre.addEventListener('click', fn); }
  onControls(fn) { this.#pad.onChange(fn); }
  onEditDone(fn) { this.#el.editDone.addEventListener('click', fn); }
  onEditReset(fn) { this.#el.editReset.addEventListener('click', fn); }

  /**
   * Entering edit mode has to be deliberate — a stray thumb must never do it —
   * so it takes a double tap on a handle that is nowhere near the controls.
   */
  onEditHandle(fn) {
    let lastTap = 0;
    this.#el.editHandle.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastTap < DOUBLE_TAP_MS) {
        lastTap = 0;
        fn();
      } else {
        lastTap = now;
        this.status('Double-tap to rearrange');
      }
    });
  }

  /** True while the screen is wider than it is tall. */
  get isLandscape() { return window.innerWidth > window.innerHeight; }

  /** Called when the phone is turned (or the window otherwise changes shape). */
  onOrientation(fn) {
    window.addEventListener('resize', fn);
    window.addEventListener('orientationchange', fn);
  }

  /** Say which way to turn the phone. @param {'landscape'|'portrait'} want */
  showTurn(want) {
    this.#el.rotate.dataset.want = want;
    this.#el.rotateText.textContent = want === 'landscape'
      ? 'Turn your phone sideways to play'
      : 'Hold your phone upright to play';
  }

  /** @returns {{buttons:Object, sticks:Object}} */
  get controlState() { return this.#pad.state; }

  /** Let go of every held button and stick. */
  releaseControls() { this.#pad.releaseAll(); }

  showRoom(room) { this.#el.room.textContent = room ?? 'no room'; }
  showPose(mount, options) { this.#el.pose.innerHTML = poseDiagram.render(mount, options); }
  say(text) { this.#el.message.textContent = text; }
  status(text) { this.#el.status.textContent = text ?? ''; }
  set canTeach(on) { this.#el.teach.hidden = !on; }

  showControls(controls) {
    this.#controls = controls;
    this.#pad.setControls(controls, this.#store.load(controls));
    this.#pad.onLayoutChange((layout) => this.#store.save(controls, layout));
  }

  /** Whether this game allows the player to rearrange its controls. */
  set editable(on) { this.#canEdit = on; }

  setEditing(on) {
    this.#editing = on && this.#canEdit;
    this.#pad.editing = this.#editing;
    this.#el.editBar.hidden = !this.#editing;
    this.#el.editHandle.classList.toggle('is-active', this.#editing);
    this.status(this.#editing ? '' : 'Layout saved on this phone.');
  }

  /** Tell the player the handle is there — nobody discovers a double-tap alone. */
  hintEditing() {
    if (!this.#canEdit || !this.#controls.length) return;
    this.status('Double-tap ⋮⋮ at the top to move or resize the controls');
    this.#el.editHandle.classList.add('is-new');
    setTimeout(() => this.#el.editHandle.classList.remove('is-new'), 5500);
  }

  resetLayout() {
    this.#store.forget(this.#controls);
    this.showControls(this.#controls);
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
    this.#el.tiltDot.style.transform = `translateX(${value * 160}px)`;
  }

  showAngles({ yaw, pitch, roll }) {
    this.#el.yaw.textContent = `${yaw.toFixed(0)}°`;
    this.#el.pitch.textContent = `${pitch.toFixed(0)}°`;
    this.#el.roll.textContent = `${roll.toFixed(0)}°`;
  }

  showShake(level) { this.#el.shake.style.transform = `scaleX(${level})`; }

  set debug(on) { this.#el.readout.hidden = !on; }
  set usesTilt(on) { this.#tiltVisible = on; }

  /**
   * Exactly one panel is on screen at a time; once playing, the screen belongs
   * to the player.
   * @param {Stage} stage
   */
  set stage(stage) {
    const playing = stage === 'playing';
    const teaching = stage === 'teaching';
    const turning = stage === 'rotate';
    const hasControls = this.#controls.length > 0;

    // The stylesheet keys its palette and layout off this; no logic lives here.
    if (this.#root.documentElement) this.#root.documentElement.dataset.stage = stage;
    this.#el.setup.hidden = playing || teaching || turning;
    this.#el.rotate.hidden = !turning;
    this.#el.teaching.hidden = !teaching;
    this.#el.recentre.hidden = !playing;
    this.#el.tilt.hidden = !(playing && this.#tiltVisible);
    this.#el.pad.hidden = !(playing && hasControls);
    this.#el.editHandle.hidden = !(playing && hasControls && this.#canEdit);

    if (!playing && this.#editing) this.setEditing(false);
    if (!playing && !teaching && !turning) {
      this.#el.start.textContent = START_LABEL[stage];
      this.#el.start.disabled = stage === 'blocked' || stage === 'connecting' || stage === 'interrupted' || turning;
    }
  }
}
