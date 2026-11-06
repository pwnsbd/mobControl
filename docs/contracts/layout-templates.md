# Contract — layout templates (P1.4)

New: `mobcontrol/client/layouts.js`
Touches: `mobcontrol/client/controller.js` (re-export), `phone/pad-layout.js`

## Intent
The three arrangements from the reference image, as one-line developer choices:
**gamepad**, **dual-stick**, **d-pad + buttons**. They return ordinary control
configurations. They are not a second controller engine, and every detail stays
overridable.

Distinct from the parked *gameplay* presets (platformer/racing/flight/quiz),
which describe a genre. These describe a physical arrangement only.

## API
```js
import { PhoneController, layouts } from '/__phone/controller.js';

new PhoneController({ controls: layouts.gamepad() });
new PhoneController({ controls: layouts.gamepad({ buttons: ['FIRE', 'BOMB'] }) });
new PhoneController({ controls: [...layouts.dualStick(), { type:'button', id:'boost' }] });
```
- `layouts.gamepad(options?)` — left d-pad `move`, right diamond of four
  buttons, default ids/labels `y x b a` as in the image.
- `layouts.dualStick(options?)` — `move` left, `aim` right.
- `layouts.dpad(options?)` — left d-pad `move`, right pair `b` `a`.

Each returns a plain `Array<{id, type, label?, side?, x?, y?}>`. A developer may
edit, filter, concat or discard the result; nothing may depend on a returned
array being produced by a preset.

`options` is optional and shallow: at minimum `buttons` (array of labels or
`{id,label}`) and `ids` (rename the defaults). Unknown keys are ignored, not an
error.

## Position hints
`defaultLayout()` currently puts every control of a side in one row at
`y = 0.72`, so a four-button diamond is impossible. Extend the control spec with
OPTIONAL normalized `x` and `y` (0..1):
- Present and valid → used as the control's default position.
- Absent → today's side/index placement, unchanged.
- Present and invalid (not a finite number in 0..1) → ignored, fall back to
  today's placement. Never throw.

A stored player layout still wins over any default, as today.

## Errors
- Duplicate ids within a returned array are a programming error in the preset:
  must not happen, and a test must prove it for all three.
- `layouts.gamepad({ buttons: [] })` returns the d-pad alone, not a crash.
- Presets must not mutate the `options` object they are given.

## Out of scope
- `layoutKey()` and the storage format: unchanged. x/y are defaults, never persisted state.
- The edit-mode menu (P1.5), gameplay presets, TypeScript definitions.
- Changing either example game.

## Done check
- `npm test` green: the 53 existing tests plus new ones covering each preset's
  shape, id uniqueness, override behaviour, non-mutation, and the three
  x/y cases (valid, absent, invalid).
- `layouts` is importable from the same module as `PhoneController`.
- A game declaring `controls: layouts.gamepad()` renders a d-pad left and four
  buttons in a diamond right, not a row.
- README gains a short block showing one preset and one override.
