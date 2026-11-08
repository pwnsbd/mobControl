// The controls a game declared: drawn where the player wants them, and
// usable with as many thumbs as they have.
//
// Two modes, deliberately exclusive:
//   playing — a pointer down on a control operates it
//   editing — drag a control with one finger or resize it with two
//
// Pointer events rather than touch events, so one implementation covers a
// thumb, several thumbs at once, and a mouse during development. What each
// control DOES lives in controls.js; this file only places them and routes
// pointers.

import * as controls from './controls.js';
import { clampPosition, maxControlDiameter, sizeFraction } from './pad-layout.js';

const DRAG_SLOP_PX = 7;

export class ControlPad {
  #root;
  #specs = [];
  #layout = {};
  #controls = new Map();
  #byPointer = new Map();
  #drag = null;
  #editing = false;
  rotated = false;
  #onChange = () => {};
  #onLayoutChange = () => {};
  #onDrag = () => {};
  #dragPointer = null;

  constructor(root) {
    this.#root = root;
    // Some mobile browsers still zoom on a rapid double tap. Pad controls
    // use pointer events, so the browser's touch-end action can be cancelled.
    root.addEventListener('touchend', (event) => {
      if (event.cancelable) event.preventDefault();
    }, { passive: false });
    root.addEventListener('pointerdown', (event) => this.#beginPinch(event));
    window.addEventListener('pointerup', (e) => this.#release(e));
    window.addEventListener('pointercancel', (e) => this.#release(e));
    window.addEventListener('pointermove', (e) => this.#move(e));
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => this.#paint()).observe(root);
    }
  }

  onChange(fn) { this.#onChange = fn; }
  onLayoutChange(fn) { this.#onLayoutChange = fn; }
  onDrag(fn) { this.#onDrag = fn; }

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
    this.#cancelDragInput();
    this.#specs = specs;
    this.#layout = layout;
    this.#byPointer.clear();
    this.#drag = null;
    this.#controls.clear();

    const elements = specs.filter((spec) => spec.type !== 'drag').map((spec) => {
      const control = controls.create(spec);
      this.#controls.set(spec.id, control);
      control.element.addEventListener('pointerdown', (e) => this.#down(e, control));
      return control.element;
    });
    const dragSpec = specs.find(({ type }) => type === 'drag');
    if (dragSpec) {
      const dragSurface = document.createElement('div');
      dragSurface.className = 'control--drag-surface';
      dragSurface.textContent = dragSpec.label ?? 'Drag';
      dragSurface.addEventListener('pointerdown', (event) => this.#startDragInput(event, dragSpec.id, dragSurface));
      dragSurface.addEventListener('lostpointercapture', (event) => {
        if (this.#dragPointer?.pointerId === event.pointerId) this.#cancelDragInput();
      });
      elements.unshift(dragSurface);
    }
    this.#root.replaceChildren(...elements);
    this.#paint();
  }

  set editing(on) {
    if (this.#editing === on) return;
    this.#editing = on;
    this.#root.classList.toggle('is-editing', on);
    this.releaseAll();                    // never leave a control held on exit
  }

  // --- rendering ---------------------------------------------------------

  #paint() {
    const { width, height } = this.#layoutBox();
    if (!width || !height) return;
    for (const [id, control] of this.#controls) {
      const entry = this.#layout[id] ?? { x: 0.5, y: 0.5, size: 'm' };
      const diameter = controlDiameter(entry.size, width, height);
      const { x, y } = clampPosition(entry, entry.size, width / height, diameter / width);
      control.element.style.left = `${x * 100}%`;
      control.element.style.top = `${y * 100}%`;
      // Fit the corners of a 2:1 button inside the same footprint used by pinch resizing.
      const buttonWidth = control.element.dataset.shape === 'rounded-rect'
        ? diameter / Math.hypot(1, 0.5) : diameter;
      control.element.style.width = `${buttonWidth}px`;
    }
  }

  // --- pointers ----------------------------------------------------------

  #down(event, control) {
    event.preventDefault();               // no scrolling, no double-tap zoom
    if (this.#editing) return this.#beginDrag(event, control.id);
    if (this.#byPointer.has(event.pointerId)) return;
    if ([...this.#byPointer.values()].includes(control)) return;
    this.#byPointer.set(event.pointerId, control);
    if (control.down(pointOf(event), this.rotated) !== false) this.#onChange(this.state);
  }

  #move(event) {
    if (this.#dragPointer?.pointerId === event.pointerId) return this.#moveDragInput(event);
    const drag = this.#drag;
    if (drag?.pinch?.pointerId === event.pointerId) {
      drag.pinch.point = pointOf(event);
      return this.#resize();
    }
    if (drag?.pointerId === event.pointerId) {
      drag.point = pointOf(event);
      return drag.pinch ? this.#resize() : this.#dragTo(event);
    }
    const control = this.#byPointer.get(event.pointerId);
    if (control && control.move(pointOf(event))) this.#onChange(this.state);
  }

  #release(event) {
    if (this.#dragPointer?.pointerId === event.pointerId) {
      return event.type === 'pointercancel' ? this.#cancelDragInput() : this.#finishDragInput(event);
    }
    if (this.#drag?.pointerId === event.pointerId || this.#drag?.pinch?.pointerId === event.pointerId) {
      return this.#endDrag(event.type === 'pointercancel');
    }
    const control = this.#byPointer.get(event.pointerId);
    if (!control) return;
    this.#byPointer.delete(event.pointerId);
    control.up(event.type !== 'pointercancel');
    this.#onChange(this.state);
  }

  /** Let go of everything, whatever is touching it. Safe with no controls. */
  releaseAll() {
    this.#cancelDragInput();
    this.#byPointer.clear();
    if (this.#drag) this.#endDrag(true);
    let changed = false;
    for (const control of this.#controls.values()) {
      if (control.up() !== false) changed = true;
    }
    if (changed) this.#onChange(this.state);
  }

  // --- rearranging -------------------------------------------------------

  #beginDrag(event, id) {
    if (this.#drag) return;
    this.#drag = {
      id,
      pointerId: event.pointerId,
      start: pointOf(event),
      point: pointOf(event),
      touch: event.pointerType === 'touch',
      moved: false,
      original: this.#layout[id],
      box: this.#layoutBox()
    };
    this.#controls.get(id)?.element.classList.add('is-dragging');
  }

  #dragTo(event) {
    const drag = this.#drag;
    if (distance(drag.point, drag.start) > DRAG_SLOP_PX) {
      drag.moved = true;
    }
    if (!drag.moved) return;

    const { box } = drag;
    const { size } = this.#layout[drag.id];
    const x = this.rotated ? event.clientY - box.top : event.clientX - box.left;
    const y = this.rotated ? box.right - event.clientX : event.clientY - box.top;
    this.#layout[drag.id] = {
      ...clampPosition(
        { x: x / box.width, y: y / box.height },
        size,
        box.width / box.height,
        controlDiameter(size, box.width, box.height) / box.width
      ),
      size
    };
    this.#paint();
  }

  #beginPinch(event) {
    const drag = this.#drag;
    if (!drag?.touch || drag.pinch || event.pointerType !== 'touch' || drag.pointerId === event.pointerId) return;
    const point = pointOf(event);
    const span = distance(drag.point, point);
    const { box, id } = drag;
    if (!span || !box.width || !box.height) return;
    const bounds = (entry) => {
      const diameter = controlDiameter(entry.size, box.width, box.height);
      return {
        ...clampPosition(entry, entry.size, box.width / box.height, diameter / box.width),
        diameter
      };
    };
    const center = bounds(this.#layout[id]);
    const neighbors = Object.entries(this.#layout)
      .filter(([other]) => other !== id)
      .map(([, entry]) => bounds(entry));
    event.preventDefault();
    drag.pinch = {
      pointerId: event.pointerId, point, span, center,
      limit: maxControlDiameter(center, box, neighbors),
      scale: controlScale(box.width, box.height)
    };
  }

  #resize() {
    const drag = this.#drag;
    const { point, span, center, limit, scale } = drag.pinch;
    if (limit < 1) return;
    const diameter = center.diameter * distance(drag.point, point) / span;
    this.#layout[drag.id] = {
      x: center.x,
      y: center.y,
      size: Math.min(limit, Math.max(1, diameter)) / scale
    };
    drag.moved = true;
    this.#paint();
  }

  #endDrag(cancelled) {
    const { id, moved, original } = this.#drag;
    this.#controls.get(id)?.element.classList.remove('is-dragging');
    this.#drag = null;
    if (cancelled) {
      this.#layout[id] = original;
      this.#paint();
      return;
    }

    if (moved) this.#onLayoutChange(this.layout);
  }

  #layoutBox() {
    const { left, top, width, height } = this.#root.getBoundingClientRect();
    return this.rotated
      ? { left, top, right: left + width, width: height, height: width }
      : { left, top, width, height };
  }

  #startDragInput(event, id, surface) {
    event.preventDefault();
    if (this.#editing || this.#dragPointer) return;
    const box = surface.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const position = this.#dragPosition(event, box);
    this.#dragPointer = { id, pointerId: event.pointerId, surface, box, position, time: event.timeStamp, lastSent: -Infinity };
    showDragPoint(surface, position);
    surface.classList.add('is-dragging');
    surface.setPointerCapture?.(event.pointerId);
    this.#onDrag({ id, phase: 'start', position, velocity: { x: 0, y: 0 } });
  }

  #moveDragInput(event) {
    const drag = this.#dragPointer;
    const position = this.#dragPosition(event, drag.box);
    showDragPoint(drag.surface, position);
    const seconds = (event.timeStamp - drag.time) / 1000;
    const width = this.rotated ? drag.box.height : drag.box.width;
    const height = this.rotated ? drag.box.width : drag.box.height;
    const scale = Math.min(width, height);
    const velocity = seconds > 0 ? {
      x: (position.x - drag.position.x) * width / scale / seconds,
      y: (position.y - drag.position.y) * height / scale / seconds
    } : { x: 0, y: 0 };
    drag.position = position;
    drag.time = event.timeStamp;
    drag.pending = { id: drag.id, phase: 'move', position, velocity };
    if (drag.time - drag.lastSent < 1000 / 60) return;
    drag.lastSent = drag.time;
    const sample = drag.pending;
    drag.pending = null;
    this.#onDrag(sample);
  }

  #finishDragInput(event) {
    const drag = this.#dragPointer;
    this.#dragPointer = null;
    drag.surface.classList.remove('is-dragging');
    if (drag.pending) this.#onDrag(drag.pending);
    const position = this.#dragPosition(event, drag.box);
    this.#onDrag({ id: drag.id, phase: 'end', position, velocity: { x: 0, y: 0 } });
  }

  #cancelDragInput() {
    if (!this.#dragPointer) return;
    const { id, position, surface } = this.#dragPointer;
    this.#dragPointer = null;
    surface.classList.remove('is-dragging');
    this.#onDrag({ id, phase: 'cancel', position, velocity: { x: 0, y: 0 } });
  }

  #dragPosition(event, rect) {
    const width = this.rotated ? rect.height : rect.width;
    const height = this.rotated ? rect.width : rect.height;
    const x = this.rotated ? event.clientY - rect.top : event.clientX - rect.left;
    const y = this.rotated ? rect.left + rect.width - event.clientX : event.clientY - rect.top;
    return {
      x: Math.max(0, Math.min(1, x / width)),
      y: Math.max(0, Math.min(1, y / height))
    };
  }
}

const pointOf = (event) => ({ x: event.clientX, y: event.clientY });

function showDragPoint(surface, { x, y }) {
  surface.style.setProperty('--drag-x', `${x * 100}%`);
  surface.style.setProperty('--drag-y', `${y * 100}%`);
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function controlDiameter(size, width, height) {
  return Math.min(width, height, sizeFraction(size) * controlScale(width, height));
}

function controlScale(width, height) {
  return Math.min(window.innerWidth, window.innerHeight, width, height / 0.76);
}
