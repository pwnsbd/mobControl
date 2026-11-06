# mobControl

Two things live here:

- **`mobcontrol/`** â€” a drop-in module that turns a phone into a motion controller for
  any web page. It handles pairing, permissions, calibration and the attitude maths, and
  hands your game three angles and a shake. It knows nothing about your game.
- **`public/` + `server.js`** â€” **Tilt Flyer**, a demo that consumes it: fly a plane over a
  grid by holding the phone flat on your palm.

```bash
npm start     # http://localhost:3000
npm test      # the attitude maths, headless
```

---

## Architecture

Every file has one job, and names it in its first line. Nothing reaches across a layer.

```
mobcontrol/
  index.js                 composition root â€” chooses the real parts, wires them
  src/
    room-registry.js       who is in which room          (pure state, no sockets)
    relay.js               who gets told what            (pairing rules)
    assets.js              serving client/               (static files, traversal-safe)
    upgrade-router.js      claiming one WebSocket path   (http plumbing)
  client/
    controller.js          GAME ENTRY â€” a facade over the parts below
    phone.html             markup only
    shared/
      quaternion.js        pure maths: multiply, conjugate, changeBasis, fromBasis
      vec3.js              dot, cross, normalize â€” for a measured grip
      orientation.js       the W3C alpha/beta/gamma convention, in one place
      mounts.js            holding poses â€” a registry, so games can add their own
      protocol.js          the wire format, defined once
      transport.js         reconnecting WebSocket (the WebRTC swap point)
      emitter.js           listeners
      rate-limit.js        "has long enough passed?"
    phone/
      main.js              composition root for the controller page
      app.js               the stage machine â€” no DOM, no sensor APIs
      calibrator.js        attitude -> vehicle angles   (pure, and tested)
      grip-teacher.js      one guided tilt -> a measured mount (pure, and tested)
      orientation-source.js  where attitude readings come from
      motion-source.js       where acceleration comes from
      shake-detector.js      acceleration -> 0..1       (a policy, replaceable)
      permissions.js         the iOS two-grant dance
      view.js                every line of DOM for the page
      control-pad.js         controls: placed, multi-touchable, draggable
      controls.js            what each type DOES — button, stick, dpad
      wake-lock.js           stops the screen sleeping mid-game
      pad-layout.js          where they sit â€” defaults, clamping, storage (pure)
      pose-diagram.js        mount -> SVG              (pure)
    game/
      room-id.js           choosing the room id
      axis-pipeline.js     signal -> the game's own axis names (pure)
      qr.js                drawing the pairing code
  test/                    42 tests, no browser needed
```

**The seams that matter.** Each of these is injected, so it can be replaced without
touching anything else:

| Seam | Contract | Why you would replace it |
| --- | --- | --- |
| `transport` | `on/send/close/isOpen` | WebRTC for lower latency; a loopback for tests |
| `orientationSource` | `start(onSample)` / `stop()` | a recorded session, the Generic Sensor API |
| `motionSource` | `start(onSample)` / `stop()` | a different gesture source |
| `shakeDetector` | `feed(accel)` â†’ `level` | a real gesture classifier |
| `qrRenderer` | `render(el, text, size)` | a local library instead of a CDN |
| `mounts` | `register(name, def)` | a holding pose this module never imagined |
| `axis-pipeline` | `apply(sample)` | an exponential curve instead of linear |

Because `calibrator.js`, `quaternion.js`, `orientation.js` and `axis-pipeline.js` touch no
sensor and no DOM, the part most likely to break under a refactor is the part that runs in
Node in milliseconds. That is the point of the split, not an accident of it.

---

## Using the module in another project

Copy `mobcontrol/` in. It needs only `ws`.

### Server

```js
const { attachPhoneController } = require('./mobcontrol');

const app = express();
const server = http.createServer(app);

const pad = attachPhoneController(server, { path: '/__phone' });
app.use(pad.middleware);          // serves the controller page and client modules

app.use(express.static('public'));
server.listen(3000);
```

It attaches to a server you already own. It upgrades **only** its own WebSocket path and
leaves every other upgrade alone, so an app with its own WebSockets keeps working. Requests
outside `path` fall straight through to your routes. Only `.js`, `.html`, `.css` and `.svg`
inside `client/` are served; traversal and everything else is refused.

Optional, if the server needs to know:

```js
pad.on('pair',    ({ room }) => {});
pad.on('unpair',  ({ room, role }) => {});
pad.on('message', ({ room, role, text }) => {});   // every relayed frame
pad.send(room, 'phone', { type: 'message', text: 'Checkpoint!' });
```

### Game

**A gamepad is axes and buttons.** You declare the layout; the phone renders itself to
match. You never write a line of phone code.

```js
import { PhoneController } from '/__phone/controller.js';

const pad = new PhoneController({
  axes:    { x: 'roll' },                      // YOUR name <- our signal
  buttons: [{ id: 'jump', label: 'JUMP' }]
});

pad.mountQR(document.getElementById('qr'));
pad.on('pair', () => hidePairingPanel());
pad.on('press', ({ id }) => { if (id === 'jump') player.jump(); });

function loop() {
  player.x += pad.axis.x * SPEED * dt;          // -1..1
  if (pad.button.jump) holdJumpHigher();        // true while held
}
```

| | |
| --- | --- |
| `pad.axis.<yourName>` | âˆ’1â€¦1, from the tilt signal you mapped to it |
| `pad.button.<id>` | true while held |
| `pad.on('press'/'release', ({id}))` | edges, so you do not need to track them |
| `pad.shake` | 0â€¦1, decaying linear-acceleration energy |
| `pad.connected` / `pad.calibrated` | is a phone attached, has it been calibrated |
| `pad.room` / `pad.pairUrl` | the 6-character code and the URL behind the QR |
| `pad.message(text)` / `pad.recentre()` | push to the phone |
| `pad.watching` | false while connected but the player has looked away |

### Pausing

There is no pause button, because a pause button is just a button — declare one and tie it
to your own pause function. What the package *does* own is telling you when the player
stopped looking, which is not an input and cannot be faked by the game:

```js
pad.on('suspend', () => game.pause());   // screen off, app switched, tab hidden
pad.on('resume',  () => game.offerResume());
pad.on('unpair',  () => game.pause());   // the phone actually went away
```

`suspend` fires while the socket is still open, so it is distinct from `unpair`, and the
held state of every control is cleared — a player who has looked away is not holding
anything down.

**How you come back is yours.** The package never sees your keyboard, so it cannot decide
that. Cube Run shows the pattern worth copying: resuming is deliberate, not automatic, so
nobody returns to the screen already falling down a hole.

Signals you can map an axis to: **`yaw`**, **`pitch`**, **`roll`**. Anything else throws at
construction rather than silently reading zero.

Options: `mount`, `axes`, `buttons`, `deadzone` (degrees), `range` (degrees for full
deflection), `smoothing`, `debug`, `room`, `persistRoom`, `basePath`, `qrRenderer`,
`transport`.

Sign conventions: **+yaw turns right, +pitch is nose up, +roll is right side down.**

### The same six primitives, different games

These are examples to copy, not options to pick â€” nothing is locked to a "scheme".

```js
platformer:  axes: { x: 'roll' },                                  buttons: ['jump']
racer:       axes: { steer: 'roll' },                              buttons: ['gas', 'brake']
flight:      axes: { turn:'yaw', climb:'pitch', bank:'roll' },     buttons: []
quiz:        axes: {},                                             buttons: ['a','b','c','d']
```

**A game that declares no axes needs no tilt**, so the phone skips the permission prompt and
the calibration step entirely: scan, and play.

### Control types — the developer declares, never designs

A developer building a football game should not have to invent a joystick. They name one:

```js
const pad = new PhoneController({
  controls: [
    { type: 'dpad',   id: 'move' },
    { type: 'stick',  id: 'aim' },
    { type: 'button', id: 'shoot', label: 'SHOOT' }
  ]
});

pad.stick.move      // { x, y } in -1..1
pad.stick.aim       // the same shape
pad.button.shoot    // true while held
```

| `type` | On the phone | The game reads |
| --- | --- | --- |
| `button` | a round, lit key that depresses | `pad.button.<id>` — boolean |
| `stick` | a base with a knob that follows the thumb | `pad.stick.<id>` — `{x, y}` −1…1 |
| `dpad` | a plus whose arms light up | `pad.stick.<id>` — `{x, y}` snapped to −1 / 0 / 1 |

**A dpad is a stick that snaps**, so both report through `pad.stick` and swapping one for the
other costs a single word with no change to the game. Underneath there are still only two
kinds of output — a boolean and a vector — which is why adding a type costs one class in
`controls.js` and nothing anywhere else.

`buttons: ['jump']` remains shorthand for a single button control.

Defaults follow the type rather than nagging the developer for positions: a stick or dpad
lands under the left thumb and starts larger, buttons land on the right. The player moves
them anyway.

### The player arranges the controls

The developer says *which* buttons exist and hints at a side; the **player** decides where
they actually sit. A double-tap on the handle at the top of the controller enters edit mode:
drag a button anywhere, tap it to cycle through three sizes, **Done** to finish or **Reset**
to go back to the developer's defaults. The arrangement is saved per game on that phone.

This is free, architecturally: a game only ever reads `pad.button.jump`, so where that
button sits has never been its business. Positions are stored as fractions of the pad, so a
layout survives a different handset, a rotation or a resized window.

It is also the accessibility story â€” left-handers, hand size, reach â€” which almost no web
game handles at all. Buttons only: the tilt frame is measured, and editing never touches it.

A game with a deliberate interface can opt out with `allowLayoutEdit: false`.

---

## The mount: how the phone is held

The game declares the pose; the module tells the phone, which shows the matching diagram and
rotates its readings into vehicle axes. The phone is flat and screen-up in every pose â€” they
differ only in which edge is the nose.

| `mount` | The phone's top edge points | |
| --- | --- | --- |
| `landscape-left` | to your **left** | default |
| `landscape-right` | to your right | |
| `portrait-up` | away from you | |
| `portrait-down` | towards you | |

**`mount` is the only thing a game changes to support a different grip.** Dipping the nose
end reads as pitch in every pose, even though it is a different device axis each time â€”
there is a test that says so.

Add your own with `registerMount(name, { degrees, nose, instruction })`.

### â€¦or let the player teach their grip

The developer's declaration is a *default*, not a decree. On the phone, **"I hold it
differently"** runs a three-second guided calibration:

1. **Hold still.** Captures the resting attitude.
2. **Tilt the right-hand edge down.** Tilting right is a turn *about* the forward axis, so
   the axis of that turn, measured in device coordinates, **is** forward.
3. `right = forward Ã— up`, and the mount quaternion is built from those axes.

A phone lying flat is rotationally ambiguous â€” gravity says "flat" but nothing says which
edge points away from you â€” so a static pose genuinely cannot be read. One gesture resolves
it, and the result is **more general than the table**: a grip held at 40Â° solves fine, and
is only snapped to a named pose when it lands within 20Â° of one.

Gestures that are too small (<12Â°), or that are a flat twist (whose axis says nothing about
forward), are rejected and re-asked rather than guessed at.

---

## How calibration works

`deviceorientation` reports an intrinsic Z-X'-Y'' rotation (alpha, beta, gamma). The phone
converts it to a quaternion, stores one as the reference when you calibrate, and reports
later readings as:

```
qVehicle = qMountâ»Â¹ Â· (qReferenceâ»Â¹ Â· qNow) Â· qMount
```

â€” the change since calibration, re-expressed in vehicle axes â€” then decomposes that back
into yaw/pitch/roll.

Working through the quaternion is what lets the reference pose be arbitrary: subtracting
Euler angles only behaves near the pose they were taken in. That is why a hard-coded
"neutral is 30Â°" had to go; any grip, on a table or in a hand, becomes level.

---

## What the sensors can and cannot do

- **Fused orientation is solid.** Gyro + accelerometer + magnetometer, combined by the OS,
  good to a degree or two. Everything here rests on it.
- **Gyro is rotation *rate*, not rotation** â€” `devicemotion.rotationRate`. Unused so far; it
  is what you would reach for to catch a sharp flick that the smoothed orientation rounds off.
- **Yaw drifts.** On iOS `alpha` is relative to page load and integrates gyro, so heading
  creeps over minutes. That is what **Recentre** is for.
- **Position is not available, by any route.** GPS is ~5 m at ~1 Hz and useless indoors, so
  it cannot sense a phone moving in your hands. Double-integrating acceleration drifts metres
  within seconds. Transient gestures (the shake) work because they read acceleration
  directly; sustained position does not work at all.
- **Vibration is Android-only.** iOS Safari has no `navigator.vibrate`.
- **The modern Generic Sensor API is Chrome/Android-only.** iOS has only the legacy events,
  so anything cross-platform is built on what is used here.

---

## Running the demo

iPhone motion sensors require HTTPS, so serve it through a tunnel. `http://<laptop-ip>:3000`
will connect but will never deliver motion events.

```bash
node server.js
```

```bash
npx.cmd cloudflared tunnel --url http://localhost:3000
```

(On Windows PowerShell use `npx.cmd`; plain `npx` is blocked by the execution policy.)

1. Open the `https://â€¦trycloudflare.com` URL **on the laptop**.
2. Scan the QR with the phone.
3. Tap **Start**, allow motion access (iOS asks twice â€” orientation and motion are separate
   grants; denying the second only costs the shake boost).
4. Lay the phone flat on your palm, screen up, **top edge to your left**. Tap
   **Calibrate & fly**.

Twist flat to turn Â· tip the nose down to dive, up to climb Â· roll to bank Â· shake to boost.
**Recentre** whenever you shift grip.

Flight feel is tuned under `// ---- flight model` in `public/index.html`: `TURN_GAIN` (1.3 â€”
a 30Â° twist turns ~35 Â°/s), `CLIMB_GAIN`, `SLIP_GAIN`, `DAMPING`, `SPEED`, `BOOST`.
Deadzones belong to the controller and are set in the `PhoneController` options.

---

## Known gaps, before this could be released

- **Calibration does not survive a reload** â€” the reference pose should be persisted.
- **Android is untested.** It should work (no permission gate, same events) but the claim is
  unverified.
- **The Wake Lock is unproven on a real phone.** It is requested and the refusal path is
  exercised, but only a device can show it actually keeps the screen on.
- **Layouts are per-phone, not per-player.** They live in that phone's `localStorage`, so a
  player on a different handset starts from the defaults again.
- **No TypeScript types.** Hand-written `.d.ts` files would be the single biggest thing for
  adoption, and need no build step.
- **No abuse limits** beyond a 16 KB payload cap: no origin check, no rate limiting, no
  authorisation hook.
