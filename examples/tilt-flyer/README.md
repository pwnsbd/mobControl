# Tilt Flyer

Fly a plane over a grid by holding your phone flat and tilting it. The demo for
**mobControl**'s three-axis steering case uses yaw, pitch, and roll.

```bash
npm run flyer        # from the project root, then http://localhost:3000
```

The demo uses phone tilt only for steering. Tap the phone's top-center Play/Pause
button to stop or resume flight. Hold **Boost** on the left to accelerate or
**Brake** on the right to slow down. If the phone disconnects or sleeps,
tap Play/Pause after reconnecting or waking it to resume.

The controller setup:

```js
const pad = new PhoneController({
  controls: [
    { id: 'play-pause', type: 'button', label: 'Play/Pause', shape: 'rounded-rect', x: 0.5, y: 0.14 },
    { id: 'boost', type: 'button', label: 'Boost', x: 0.22, y: 0.66, size: 'l', haptic: true },
    { id: 'brake', type: 'button', label: 'Brake', x: 0.78, y: 0.66, size: 'l' }
  ],
  mount: 'landscape-left',          // top edge = the nose, pointing left
  axes: { turn: 'yaw', climb: 'pitch', roll: 'roll' },
  deadzone: 3,
  range: 40,
  debug: true                       // show the angle readout on the phone
});
```

The game reads `pad.axis.turn`, `pad.axis.climb`, `pad.axis.roll` and `pad.shake` in its
existing loop.

Twist flat to turn · tip the nose down to dive, up to climb · roll to bank · shake to boost.

Flight feel is tuned under `// ---- flight model` in `public/index.html`: `TURN_RATE`,
`CLIMB_ACCEL`, `SLIP_ACCEL`, `DAMPING`, `SPEED`, `BOOST`. Deadzone and range belong to the
controller and are set in the `PhoneController` options above.

See the [project README](../../README.md) for the package itself.
