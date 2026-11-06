# Tilt Flyer

Fly a plane over a grid by holding your phone flat and tilting it. The demo for
**mobControl**'s three-axis case — no buttons at all, just yaw, pitch and roll.

```bash
npm run flyer        # from the project root, then http://localhost:3000
```

The whole integration:

```js
const pad = new PhoneController({
  mount: 'landscape-left',          // top edge = the nose, pointing left
  axes: { turn: 'yaw', climb: 'pitch', roll: 'roll' },
  deadzone: 3,
  range: 40,
  debug: true                       // show the angle readout on the phone
});
```

...and then `pad.axis.turn`, `pad.axis.climb`, `pad.axis.roll` and `pad.shake` inside the
existing loop.

Twist flat to turn · tip the nose down to dive, up to climb · roll to bank · shake to boost.

Flight feel is tuned under `// ---- flight model` in `public/index.html`: `TURN_RATE`,
`CLIMB_ACCEL`, `SLIP_ACCEL`, `DAMPING`, `SPEED`, `BOOST`. Deadzone and range belong to the
controller and are set in the `PhoneController` options above.

See the [project README](../../README.md) for the package itself.
