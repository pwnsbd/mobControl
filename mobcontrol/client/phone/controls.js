// The control types a game can ask for.
//
// A developer should never design a joystick. They declare one, and this file
// knows what that means. Adding a new type is one more class here plus a
// branch in `create` — nothing else in the codebase changes, because
// underneath there are still only two kinds of output:
//
//   button -> a boolean
//   stick  -> a vector, -1..1 on each axis
//   dpad   -> the same vector, snapped to eight directions
//
// So a game reading pad.stick.move does not care which of the last two the
// player is using, and swapping one for the other costs a single word.

const DEADZONE = 0.22;       // of the base radius, before a dpad commits
const SNAP = Math.PI / 4;    // eight directions

export function create(spec) {
  return spec.type === 'button' ? new ButtonControl(spec) : new VectorControl(spec);
}

class ButtonControl {
  type = 'button';
  value = false;

  constructor({ id, label }) {
    this.id = id;
    this.element = document.createElement('button');
    this.element.className = 'control control--button';
    this.element.type = 'button';
    this.element.dataset.id = id;
    this.element.textContent = label ?? id.toUpperCase();
  }

  down() { this.#set(true); }
  move() { /* a button does not care where the thumb went */ }
  up() { this.#set(false); }

  #set(down) {
    if (this.value === down) return false;
    this.value = down;
    this.element.classList.toggle('is-down', down);
    return true;
  }
}

class VectorControl {
  value = { x: 0, y: 0 };
  #knob;
  #centre = { x: 0, y: 0 };
  #radius = 1;

  constructor({ id, type, label }) {
    this.id = id;
    this.type = type;                     // 'stick' or 'dpad'
    this.element = document.createElement('div');
    this.element.className = `control control--${type}`;
    this.element.dataset.id = id;
    if (type === 'dpad') this.element.innerHTML = DPAD_ARMS;
    this.#knob = document.createElement('i');
    this.#knob.className = 'control-knob';
    this.element.append(this.#knob);
    if (label) this.element.setAttribute('aria-label', label);
  }

  down(point) {
    const box = this.element.getBoundingClientRect();
    this.#centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    this.#radius = box.width / 2;
    this.element.classList.add('is-active');
    return this.move(point);
  }

  move(point) {
    const dx = (point.x - this.#centre.x) / this.#radius;
    const dy = (point.y - this.#centre.y) / this.#radius;
    const raw = clampToUnit({ x: dx, y: dy });
    const next = this.type === 'dpad' ? snapToEight(raw) : raw;
    return this.#set(next, raw);
  }

  up() {
    this.element.classList.remove('is-active');
    return this.#set({ x: 0, y: 0 }, { x: 0, y: 0 });
  }

  /** @param next what the game reads; @param knob where the thumb actually is */
  #set(next, knob) {
    const changed = next.x !== this.value.x || next.y !== this.value.y;
    this.value = next;
    this.#knob.style.transform =
      `translate(calc(-50% + ${knob.x * 34}%), calc(-50% + ${knob.y * 34}%))`;
    if (this.type === 'dpad') this.#lightArms(next);
    return changed;
  }

  #lightArms({ x, y }) {
    const on = { left: x < 0, right: x > 0, up: y < 0, down: y > 0 };
    for (const [arm, lit] of Object.entries(on)) {
      this.element.querySelector(`.arm--${arm}`)?.classList.toggle('is-lit', lit);
    }
  }
}

export function clampToUnit({ x, y }) {
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

/** Beyond the deadzone, round the direction to one of eight and go full tilt. */
export function snapToEight({ x, y }) {
  if (Math.hypot(x, y) < DEADZONE) return { x: 0, y: 0 };
  const angle = Math.round(Math.atan2(y, x) / SNAP) * SNAP;
  return { x: round(Math.cos(angle)), y: round(Math.sin(angle)) };
}

const round = (v) => (Math.abs(v) < 1e-6 ? 0 : Math.sign(v));

const DPAD_ARMS = ['up', 'right', 'down', 'left']
  .map((arm) => `<span class="arm arm--${arm}"></span>`)
  .join('');
