// The controls a game declared: drawn where the player wants them, and
// usable with as many thumbs as they have.
//
// Two modes, deliberately exclusive:
//   playing — a pointer down on a control operates it
//   editing — a pointer down on a control drags it; a tap resizes it
//
// Pointer events rather than touch events, so one implementation covers a
// thumb, several thumbs at once, and a mouse during development. What each
// control DOES lives in controls.js; this file only places them and routes
// pointers.

import * as controls from './controls.js';
import { SIZE_FRACTION, clampPosition, nextSize } from './pad-layout.js';

const TAP_SLOP_PX = 7;        // moved less than this and it was a tap, not a drag

export class ControlPad {
  #root;
  #specs = [];
  #layout = {};
  #controls = new Map();
  #byPointer = new Map();
  #drag = null;
  #editing = false;
  #onChange = () => {};
  #onLayoutChange = () => {};

  constructor(root) {
    this.#root = root;
    window.addEventListener('pointerup', (e) => this.#release(e));
    window.addEventListener('pointercancel', (e) => this.#release(e));
    window.addEventListener('pointermove', (e) => this.#move(e));
  }

  onChange(fn) { this.#onChange = fn; }
  onLayoutChange(fn) { this.#onLayoutChange = fn; }

  /** Everything a game reads, in the two shapes it understands. */
  get state() {
    const buttons = {};
    const sticks = {};
    for (const control of this.#controls.values()) {
      if (control.type === 'button') buttons[control.id] = control.value;
      else sticks[control.id] = { ...control.value };
    }
    return { buttons, sticks };
  }

  get layout() {
    return Object.fromEntries(Object.entries(this.#layout).map(([id, v]) => [id, { ...v }]));
  }

  setControls(specs, layout) {
    this.#specs = specs;
    this.#layout = layout;
    this.#byPointer.clear();
    this.#drag = null;
    this.#controls.clear();

    const elements = specs.map((spec) => {
      const control = controls.create(spec);
      this.#controls.set(spec.id, control);
      control.element.addEventListener('pointerdown', (e) => this.#down(e, control));
      return control.element;
    });
    this.#root.replaceChildren(...elements);
    this.#paint();
  }

  set editing(on) {
    if (this.#editing === on) return;
    this.#editing = on;
    this.#root.classList.toggle('is-editing', on);
    this.#byPointer.clear();
    this.#drag = null;
    this.#releaseAll();                   // never leave a control held on exit
  }

  // --- rendering ---------------------------------------------------------

  #paint() {
    for (const [id, control] of this.#controls) {
      const { x, y, size } = this.#layout[id] ?? { x: 0.5, y: 0.5, size: 'm' };
      control.element.style.left = `${x * 100}%`;
      control.element.style.top = `${y * 100}%`;
      control.element.style.width = `${SIZE_FRACTION[size] * 100}%`;
    }
  }

  // --- pointers ----------------------------------------------------------

  #down(event, control) {
    event.preventDefault();               // no scrolling, no double-tap zoom
    if (this.#editing) return this.#beginDrag(event, control.id);
    if (this.#byPointer.has(event.pointerId)) return;
    this.#byPointer.set(event.pointerId, control);
    if (control.down(pointOf(event)) !== false) this.#onChange(this.state);
  }

  #move(event) {
    if (this.#drag?.pointerId === event.pointerId) return this.#dragTo(event);
    const control = this.#byPointer.get(event.pointerId);
    if (control && control.move(pointOf(event))) this.#onChange(this.state);
  }

  #release(event) {
    if (this.#drag?.pointerId === event.pointerId) return this.#endDrag();
    const control = this.#byPointer.get(event.pointerId);
    if (!control) return;
    this.#byPointer.delete(event.pointerId);
    control.up();
    this.#onChange(this.state);
  }

  #releaseAll() {
    let changed = false;
    for (const control of this.#controls.values()) {
      if (control.up() !== false) changed = true;
    }
    if (changed) this.#onChange(this.state);
  }

  // --- rearranging -------------------------------------------------------

  #beginDrag(event, id) {
    this.#drag = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      box: this.#root.getBoundingClientRect()
    };
    this.#controls.get(id)?.element.classList.add('is-dragging');
  }

  #dragTo(event) {
    const drag = this.#drag;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > TAP_SLOP_PX) {
      drag.moved = true;
    }
    if (!drag.moved) return;

    const { box } = drag;
    const { size } = this.#layout[drag.id];
    this.#layout[drag.id] = {
      ...clampPosition(
        { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height },
        size,
        box.width / box.height
      ),
      size
    };
    this.#paint();
  }

  #endDrag() {
    const { id, moved, box } = this.#drag;
    this.#controls.get(id)?.element.classList.remove('is-dragging');
    this.#drag = null;

    if (!moved) {
      // A tap in edit mode cycles the size, so resizing needs no extra chrome.
      const size = nextSize(this.#layout[id].size);
      this.#layout[id] = {
        ...clampPosition(this.#layout[id], size, box.width / box.height),
        size
      };
      this.#paint();
    }
    this.#onLayoutChange(this.layout);
  }
}

const pointOf = (event) => ({ x: event.clientX, y: event.clientY });
