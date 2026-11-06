# Contract — phone interruption handling

Module: `mobcontrol/client/phone/{app,view,control-pad}.js`

## Problem
A control held when the socket drops, or when the player switches apps, stays
logically held. `ControlPad` releases on `pointerup`/`pointercancel` and on
entering/leaving edit mode (`control-pad.js:31,77`), but `app.js`'s transport
`close` handler (`:87`) and `visibilitychange` handler (`:82`) only update a
status line. Nothing releases input.

## Inputs
- transport `close` event (socket lost; may reconnect)
- `document.visibilitychange` to `hidden` (screen lock, app switch, tab switch)
- transport `open` event after a prior close (reconnection)

## Outputs
- All buttons and sticks released locally, so `view.controlState` reports
  neutral: every button `false`, every stick `{x:0,y:0}`.
- Where the socket is still alive (visibility change), one forced input frame
  carrying the released state, so the game sees the release.
- A visible, honest stage telling the player input is not reaching the game.

## Errors
- Release must not throw when no controls are mounted (`showControls` never
  called, or an empty control list).
- A `close` before any `open` must behave the same as a mid-game close.

## Perf budget
Release is O(number of controls), runs on an event, not per frame. No new timers,
no new polling.

## Out of scope
- Visual restyle, palette changes, landscape, safe-area rules.
- Reconnect/backoff strategy in `transport.js`.
- Room authentication.
- Wire-format changes to `protocol.js`.

## Done check
- `npm test` green, 42 existing tests still passing.
- New tests prove: held button + transport close -> `controlState` neutral;
  held button + visibility hidden -> neutral AND a forced frame sent;
  reconnect after close leaves nothing stuck.
