# Contract — a layout declares its orientation (P1.4b)

Touches: `client/layouts.js`, `client/controller.js`, `shared/protocol.js`,
`phone/app.js`, `phone/view.js`, `phone/controller.css`

## Why
Control positions are normalized fractions of the pad. The pad is ~339x672 in
portrait and ~776x289 in landscape, so one set of y values cannot serve both:
a four-button diamond tuned for portrait overlaps in landscape and vice versa.
A gamepad is a landscape object. Say so, tune once, and ask the player to turn
the phone — as every console-style mobile game already does.

## API change
Presets now return a config fragment, spread into the controller:

```js
new PhoneController({ ...layouts.gamepad() });              // landscape
new PhoneController({ ...layouts.gamepad(), orientation: 'any' });   // override
new PhoneController({ controls: layouts.gamepad().controls });       // controls only
```

`layouts.*()` returns `{ controls: Array<ControlSpec>, orientation }`.
- `gamepad` -> `'landscape'`
- `dualStick` -> `'landscape'`
- `dpad` -> `'any'` (a d-pad and two buttons fit either way)

`PhoneController` accepts a top-level `orientation` of `'landscape'`,
`'portrait'` or `'any'`. Default `'any'` — an existing game that passes no
orientation behaves exactly as it does today. An unknown value falls back to
`'any'` without throwing.

## Wire
`protocol.layout()` carries `orientation` alongside `controls`. A layout message
without the field means `'any'`, so an older game and a newer phone still work.

## Phone behaviour
When the layout's orientation is `'landscape'` or `'portrait'` and the device is
held the other way:
- Show a dedicated screen: an icon, and words telling the player which way to
  turn. Not a toast, not a status line.
- Controls are not interactive while it shows, and any held input is released
  first (reuse the existing release path; nothing may stay held).
- It resolves by itself on rotation. No button, no dismiss.
- It must not appear during `connecting`, `blocked`, or while a `'any'` layout
  is in use.
- It must not fire the stuck-input bug we already fixed: entering and leaving it
  leaves `controlState` neutral.

Treat it as a stage in the existing machine, not a flag bolted onto the view.
Mind that `interrupted` already exists and the two can coincide: a disconnection
while the phone is held the wrong way must still read as disconnected.

## Out of scope
- The drag control type (its own task, next).
- Locking orientation via the Screen Orientation API: ask, do not force.
- Retuning the diamond coordinates — a follow-up once this lands, tuned against
  landscape only.
- The edit-mode menu.

## Done check
- `npm test` green: the 69 existing tests plus new ones for the config default,
  the unknown-value fallback, the wire field's absence meaning `'any'`, each
  preset's declared orientation, and controls released on entering the screen.
- Both example games, which declare no orientation, behave exactly as before.
