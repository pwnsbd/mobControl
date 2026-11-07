# mobControl

Turn a phone into a controller for your web game. Players scan a QR code and use buttons, a thumbstick, a D-pad, or motion controls in their phone browser.

You choose the controls and bind them to your game. mobControl serves the phone interface, pairs the devices, and sends input over WebSockets.

## Quick start

Once mobControl is published, install it in a Node project. This example uses Express.

```sh
npm install mobcontrol express
```

**1. Create `server.cjs`**

```js
const express = require('express');
const { createServer } = require('node:http');
const { attachPhoneController } = require('mobcontrol');

const app = express();
const server = createServer(app);

app.use(attachPhoneController(server).middleware);
app.use(express.static('public'));
server.listen(3000);
```

**2. Create `public/index.html`**

```html
<!doctype html>
<meta charset="utf-8">
<title>mobControl quick start</title>
<div id="qr"></div>
<p id="status">Scan the QR code to connect.</p>

<script type="module">
  import { PhoneController } from '/__phone/controller.js';

  const pad = new PhoneController({ buttons: [{ id: 'jump', label: 'Jump' }] });
  const status = document.querySelector('#status');

  pad.mountQR(document.querySelector('#qr'));
  pad.on('pair', () => { status.textContent = 'Connected. Tap Jump.'; });
  pad.on('press', ({ id }) => {
    if (id === 'jump') status.textContent = 'Jump pressed!';
  });
</script>
```

**3. Pair your phone**

Run `node server.cjs`. With both devices on the same Wi-Fi, open `http://<computer-LAN-IP>:3000` on your computer and scan the QR code. Tap **Jump** on the phone. The game page should show **Jump pressed!**

## Connect it to your game

| Input | What your game reads |
| --- | --- |
| Button | Listen for `press` and `release`, or read `pad.button.jump` while held. |
| Stick or D-pad | Read `pad.stick.move.x` and `pad.stick.move.y` for a control named `move`. |
| Tilt | Map a signal with `axes: { x: 'roll' }`, then read `pad.axis.x`. |
| Shake | Read `pad.shake` for shake intensity. |

Use `layouts` from the same browser module to start from a preset. See [Cube Run](examples/cube-run/README.md) for a working example that shares movement and jump logic between the keyboard and phone.

## Try the demos from this repository

Run `npm install` from the repository root, then choose a demo.

| Command | Demo |
| --- | --- |
| `npm run cube` | [Cube Run](examples/cube-run/README.md), a platformer on port 3200. |
| `npm run flyer` | [Tilt Flyer](examples/tilt-flyer/README.md), a motion-controlled flight demo on port 3000. |

Touch controls work over local HTTP. Use HTTPS for motion controls and open the HTTPS URL on your computer before scanning the QR. For public hosting, enable WebSocket upgrades and add room access controls. The built-in relay lets a new connection replace an existing connection in the same room and role.

[MIT license](LICENSE)
