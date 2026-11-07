# mobControl integration guide for coding agents

The game owns its actions and state. mobControl pairs a phone with the browser game and reports the inputs the game declares.

## Install and serve

Install `mobcontrol` and `express` in the game project. Attach the controller to the same HTTP server Express uses, then mount its middleware before the game's static files.

```js
const express = require('express');
const { createServer } = require('node:http');
const { attachPhoneController } = require('mobcontrol');

const app = express();
const server = createServer(app);
const phone = attachPhoneController(server); // optional { path: '/controller' }
app.use(phone.middleware);
app.use(express.static('public'));
server.listen(3000);
```

In a browser ES module, import `PhoneController` from `/__phone/controller.js`. If you use a custom server mount, import from that path. The controller derives its base path from its module URL. Call `pad.mountQR(element)` to display the pairing code. It points to the phone controller on the game's origin. The default QR renderer loads from a CDN. For self-hosting, pass a `qrRenderer` with an async `render(element, text, size)` method. On QR render failure, the URL appears as text. Use an address both devices can reach. Touch works over HTTP, and motion requires HTTPS.

## Declare controls and read input

Use `buttons` for button shorthand (`['jump']` or `[{ id: 'jump', label: 'Jump', haptic: true }]`) and `controls` for typed controls (`{ id, type: 'button' | 'stick' | 'dpad', label?, side?, x?, y?, size?, accent?, haptic? }`). A button can also appear in `controls`. IDs must be unique across both lists. `side` is `left` or `right`; `x` and `y` are normalized 0–1 positions; sizes are `s`, `m`, `l`; accents are `yellow`, `amber`, `blue`, `red`, `green`. Player layout editing is enabled by default (`allowLayoutEdit: false` disables it).

Read button levels from `pad.button[id]` or listen for `press`/`release` events carrying `{ id }`. Sticks and D-pads share the same `pad.stick[id]` shape: `x` and `y` each range from -1 to 1; a D-pad snaps to directions. `pad.on('input', pad => ...)` fires when an input frame arrives. `pad.shake` ranges from 0 to 1. Handle `pair`, `unpair`, `suspend`, and `resume` as needed; on a suspend, held controls are released. `pad.disconnect()` closes the game-side connection.

Presets are exported as `layouts` from the same browser module: `layouts.simple({ movement: 'none' | 'stick' | 'dpad' | 'tilt', buttons, orientation })`, `layouts.gamepad({ buttons?, ids? })`, `layouts.dualStick({ ids? })`, and `layouts.dpad({ buttons?, ids? })`. They return ordinary options to spread into the constructor. `simple` supports up to four action buttons; `gamepad` is a left D-pad plus four right buttons; `dualStick` is left move/right aim; `dpad` is a left D-pad plus two action buttons. Add other options after the spread, such as `motion`.

`orientation` defaults to `landscape`. Choose `portrait` for a fixed portrait layout or `any` to follow the phone's viewport. Fixed layouts rotate in software when needed. To override a preset, set `orientation` after spreading its options.

## Motion, tilt, and feedback

Set `motion: true` to request accelerometer/gyroscope data. The phone asks the player to enable motion before sending sensor readings; sensor APIs also require a secure HTTPS context. `pad.motionEnabled` reports the player's current choice. If motion and a joystick are alternatives, leave `motionWithJoystick` unset/false and the phone offers a Motion toggle. Set `motionWithJoystick: true` when the game needs both concurrently; the player gets the permission prompt and the joystick remains usable. Do not treat a failed or declined permission as active motion.

For tilt steering, declare game-named normalized axes, for example `axes: { steer: 'roll' }`, and read `pad.axis.steer` (-1..1). Signals are `yaw`, `pitch`, `roll`; `deadzone` defaults to 3 degrees, `range` to 35 degrees for full deflection, and `smoothing` to 0 (higher values keep more of the previous value). Tilt is calibrated and mapped according to the controller mount. `pad.motion` instead contains raw physical device-frame `acceleration` (m/s², gravity excluded) and `rotationRate` (deg/s), with nullable readings. `pad.controllerMotion` expresses those readings along the displayed controller's `right`, `up`, and `out` axes; it is null when unavailable. Use controller-relative motion for controls that should track the visible phone orientation; raw values stay tied to physical device axes. These differ from calibrated, normalized `pad.axis` tilt.

Set a button's `haptic: true` for a button flash and a short vibration request on press. For game events call `pad.vibrate(60)` (milliseconds; supported range 1–200). Vibration is a browser/device capability and may be unavailable; it must not be required for gameplay.

## Recover from a lost phone controller

Use `shape: 'rounded-rect'` on a button to distinguish menu actions such as
Play/Pause. Give the button a unique ID and bind its `press` event to the
game's own pause and resume actions. Use `x: 0.5, y: 0.14` for a top-center
starting position. Rounded rectangle buttons start small unless the developer
specifies another size.

Keep track of whether the player is using the phone or the keyboard. If the
phone is active, listen for `unpair` and `suspend`. Clear phone input, pause the
round, and offer **Reconnect phone** and **Continue with keyboard**. Show the
QR code when the player chooses to reconnect. Either choice should preserve
the round's progress.

`pad.connected && pad.watching` tells you when the phone is available again.
Use `pair` and `resume` to update the reconnect screen. Let the player choose
when to resume and whether to switch back from the keyboard.

## Joystick steering, shake jump, and keyboard Space

This browser-module example keeps keyboard and phone actions on the same game functions. Motion is explicitly enabled alongside the move stick so shake and steering can be used at once. The jump fires only on a rising threshold crossing, and rearms after the shake signal falls below the threshold.

```html
<div id="qr"></div>
<script type="module">
  import { PhoneController } from '/__phone/controller.js';

  const pad = new PhoneController({
    controls: [{ id: 'move', type: 'stick', label: 'Move', side: 'left' }],
    motion: true,
    motionWithJoystick: true,
    orientation: 'landscape'
  });
  let x = 0;
  let y = 0;
  let jumpWasAboveThreshold = false;
  const SHAKE_THRESHOLD = 0.65;

  function jump() { /* invoke the game's existing jump action */ }
  function steer(dx, dy) { x = dx; y = dy; }

  pad.on('input', () => {
    steer(pad.stick.move.x, pad.stick.move.y);
    const above = pad.motionEnabled && pad.shake >= SHAKE_THRESHOLD;
    if (above && !jumpWasAboveThreshold) jump();
    jumpWasAboveThreshold = above;
  });

  window.addEventListener('keydown', event => {
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      jump();
    }
  });
  pad.mountQR(document.querySelector('#qr'));

  // In the existing game update loop, use x/y as normalized steering input.
</script>
```

Connect `steer` to the game's existing movement/update path and replace the `jump` body with its existing jump action; do not create a second physics/action implementation for the phone.

## Validate configuration

The installed package exposes a Node-importable contract and validator at `mobcontrol/client/shared/config.js`. From an ES module in the game project:

```js
import { configurationContract, validateConfiguration } from 'mobcontrol/client/shared/config.js';
import { layouts } from 'mobcontrol/client/layouts.js';

const options = {
  ...layouts.simple({ movement: 'stick', buttons: ['jump'], orientation: 'any' }),
  motion: true,
  motionWithJoystick: true
};
const issues = validateConfiguration(options); // [] means valid
console.log(configurationContract.version, issues);
```

The validator returns `{ path, message }` issues and does not require a browser. It validates constructor configuration; runtime-only options such as `basePath`, `room`, and `qrRenderer` are accepted but not deeply checked.

## Optional MCP companion

The companion exposes the exact capabilities from the mobControl installed in the game. Configure a local stdio MCP server with Node and `mobcontrol-mcp/cli.mjs`, passing the game project directory as its argument; the CLI resolves `mobcontrol/client/shared/config.js` from that project's dependencies. In a checkout, use the absolute path to `tools/mobcontrol-mcp/cli.mjs`; in an installed companion use its installed CLI path. It requires `@modelcontextprotocol/server` and `zod` dependencies for the companion. This is development-time tooling; the game and phone still use the regular mobControl package.

- `list_capabilities` takes `{}`. Its structured result is the configuration contract (`version`, `presetUsage`, `presets`, `controlTypes`, `fields`, `feedback`, and `inputs`).
- `validate_configuration` takes `{ "configuration": { ...PhoneController options... } }`. Its structured result is `{ "valid": boolean, "issues": [{ "path": string, "message": string }] }`.

If no MCP setup is available, the direct Node imports above provide the same version-specific preset and validation information.
