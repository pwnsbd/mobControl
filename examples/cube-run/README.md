# Cube Run

A one-level cube platformer, built to find out whether **mobControl** is genuinely drop-in.
Tilt the phone left and right to move, tap **JUMP**.

```bash
npm run cube       # from the project root, then http://localhost:3200
```

Playable immediately with **← → and Space**. To use a phone, scan the QR on the game
screen — over HTTPS, so in local development run a tunnel first:

```bash
npx.cmd cloudflared tunnel --url http://localhost:3200
```

## What the integration actually cost

The server, in full:

```js
const pad = attachPhoneController(server);   // 1
app.use(pad.middleware);                     // 2
```

The game:

```js
const pad = new PhoneController({
  mount: 'landscape-left',                   // held sideways, screen up, head to the left
  axes: { x: 'roll' },                       // tilt left/right
  buttons: [{ id: 'jump', label: 'JUMP' }],
  deadzone: 4,
  range: 26                                  // 26 degrees of tilt = full speed
});

pad.on('press', ({ id }) => { if (id === 'jump') jumpBuffer = JUMP_BUFFER; });
```

...and then two reads inside the existing loop — `pad.axis.x` for steering and
`pad.button.jump` for a held jump. **No phone-side code was written for this game.** The
JUMP button, its label, the pose diagram and the calibration prompt all came from that
`buttons` declaration.

The keyboard and the phone feed the same two values, so the physics never asks where a
press came from:

```js
function steering() {
  if (left !== right) return right ? 1 : -1;
  return pad.axis.x;
}
```

## The level

One screen tall, 3240 wide, scrolling right. Two gaps to fall into, eleven floating
platforms, thirteen coins, a flag at the end. Falling respawns you at the start and
increments a death counter; there is no fail state beyond that.

Jump feel: coyote time (90 ms), input buffering (120 ms) and a jump cut on release, so it
behaves the way a platformer is expected to rather than the way the maths alone would give.

See the [project README](../../README.md) for the package itself.
