# Cube Run

A one-level cube platformer, built to find out whether **mobControl** is genuinely drop-in.
Move with the analog stick and tap **A** to jump. Rotate the phone to switch
between portrait and landscape, and open **Layout** to move or resize the controls.

```bash
npm run cube       # from the project root, then http://localhost:3200
```

Use **← → and Space** on the keyboard. To use a phone, open the game on a
network address the phone can reach, then scan the QR. The stick and D-pad use
touch input and work on a shared local network. Tilt mode requires HTTPS:

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
  ...layouts.simple({
    movement: 'stick',
    recommendedOrientation: 'landscape',
    buttons: [{ id: 'jump', label: 'A' }]
  })
});

pad.on('press', ({ id }) => { if (id === 'jump') jumpBuffer = JUMP_BUFFER; });
```

The game reads `pad.stick.move.x` for movement and `pad.button.jump` for a held
jump. The label and position can change independently of the `jump` ID.

Open `/?movement=dpad` to try a D-pad or `/?movement=tilt` for motion steering
with the steering wave. Each mode uses the same jump binding.

The keyboard and the phone feed the same two values, so the physics never asks where a
press came from:

```js
function steering() {
  if (left !== right) return right ? 1 : -1;
  return pad.stick.move?.x ?? pad.axis.x ?? 0;
}
```

## The level

One screen tall, 3240 wide, scrolling right. Two gaps to fall into, eleven floating
platforms, thirteen coins, a flag at the end. Falling respawns you at the start and
increments a death counter; there is no fail state beyond that.

Jump feel: coyote time (90 ms), input buffering (120 ms) and a jump cut on release, so it
behaves the way a platformer is expected to rather than the way the maths alone would give.

See the [project README](../../README.md) for the package itself.
