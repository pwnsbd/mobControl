# Cube Run

A one-level cube platformer, built to find out whether **mobControl** is genuinely drop-in.
Move with the analog stick and tap **A** to jump. Hold the phone sideways with
its top edge to your left. The controller shows its landscape layout even with
auto-rotate locked. Open **Layout** to drag a control or pinch it with two
fingers to resize it.

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
    buttons: [{ id: 'jump', label: 'A' }]
  })
});

pad.on('press', ({ id }) => { if (id === 'jump') jumpBuffer = JUMP_BUFFER; });
```

The game reads `pad.stick.move.x` for movement and `pad.button.jump` for a held
jump. The label and position can change independently of the `jump` ID.

Open `/?movement=dpad` to try a D-pad. Open `/?movement=tilt` to switch
between the stick and tilt using the phone’s **Motion** toggle. Add
`&combine=1` to try stick and tilt together after granting motion access.
Each mode uses the same jump binding.

Open `/?motion=1` over HTTPS to see live controller-relative acceleration and
gyro readings in the game HUD while using the touch controls. The displayed
`right`, `up`, and `out` directions follow the controller's screen orientation.
Try with phone rotation lock on and off, rotating the phone in each case. Motion
uses the same `motion: true` setup; see the root README for the API and raw
physical-axis readings.

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
