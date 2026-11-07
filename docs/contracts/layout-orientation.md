# Controller orientation

`PhoneController` defaults to `orientation: 'landscape'`. Choose `'portrait'`
for an upright controller or `'any'` to follow the phone viewport.

```js
new PhoneController({ ...layouts.gamepad() });
new PhoneController({ ...layouts.gamepad(), orientation: 'portrait' });
```

`simple` defaults to landscape and accepts an `orientation` option. The
`gamepad` and `dualStick` presets declare landscape. The `dpad` preset
declares `'any'` because its controls fit either way.

The game announces the layout orientation alongside its controls. A missing
or unrecognized value on the wire means `'any'` for older game clients.

When a fixed orientation differs from the viewport, the phone rotates the
whole controller interface 90 degrees clockwise. The selected layout and its
saved edits stay in place. Pointer movement and editing use the rotated
controller coordinates. When the viewport changes between matching and
mismatching, the controller releases held input before switching.

With `'any'`, the interface follows the viewport and keeps separate portrait
and landscape edits.
