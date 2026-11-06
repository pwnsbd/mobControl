# Contract — phone visual pass (P1.1–P1.3)

Module: `mobcontrol/client/phone.html`, `phone/controller.css`, `phone/view.js`

## Intent
Make the controller feel like designed physical hardware, not a gaming
dashboard. Restrained depth, tactile materials, precise spacing, quiet play
surface. The existing `:root` token system stays; its values change.

## Palette (replaces the current purple-leaning values)
| Token role | Value | Use |
|---|---|---|
| Deep forest | `#142B26` | setup/calibration background, primary surfaces |
| Near-black | `#0B1715` | active controller background |
| Warm ivory | `#F6F1E7` | primary text on dark; developer-facing pages only as a background |
| Soft sage | `#85B18B` | interactive feedback, press states, connection-good |
| Muted stone | `#A5ADA5` | secondary text, labels, inactive |
| Soft amber | `#D5AB72` | occasional highlight, never a default |

**Decision:** the phone is dark at every stage. Ivory is a text colour here, not
a background. A phone that flips ivory→near-black on tapping Start is jarring in
a dark room. Ivory backgrounds belong to the desktop/developer surface.

No purple. No glowing gradients. No oversized cards. The existing radial
gradient on `body` becomes a forest-toned equivalent or goes away.

## Inputs
Stage changes via `view.stage` (`connecting|ready|armed|teaching|playing|interrupted|blocked`),
and control definitions via `showControls()`. No new JS state.

## Outputs
1. **Landscape.** `controller.css` currently has no `@media` and no orientation
   rule. Landscape is how a gamepad is held: controls reachable by thumbs at the
   left and right edges, the setup card still legible, no vertical scroll.
2. **Safe areas.** Today only `env(safe-area-inset-bottom)` is used, on `main`.
   Left, right and top insets must be respected too — in landscape the notch is
   beside the left thumb. Nothing interactive may sit under a system inset.
3. **Tactile press.** Controls gain visible press depth and release. Use
   `transform`/`box-shadow`, not colour alone. Honour
   `prefers-reduced-motion: reduce`.
4. **Quiet play surface.** During `playing`, status/recentre/edit chrome stays
   reachable but out of the thumb zones. Game-supplied button labels stay legible.
5. **Honest connection indicator.** A small, always-visible dot or pill reading
   connection state, sage when good, muted when interrupted.

## Errors / edge cases
- Very small viewports (≤320pt wide) must not clip controls.
- A game may supply 1 control or 8; neither may overflow.
- `interrupted` must read as clearly degraded, not merely restyled.

## Perf budget
No layout thrash during play: animate `transform`/`opacity` only, never `width`,
`height`, `top` or `left`. No new per-frame work, no new timers. The pad must
not repaint on every input frame.

## Out of scope
- Layout templates (gamepad / dual-stick / D-pad) — that is P1.4, a separate task.
- Any change to `app.js` flow, stage machine, protocol, transport or storage.
- Edit-mode discoverability (a visible menu replacing the double-tap) — P1.5.
- Accessibility beyond contrast and reduced-motion.

## Done check
- `npm test` green, 53 tests, no test edited to accommodate a visual change.
- Rendered at 375×812 portrait, 812×375 landscape, and 320pt wide: no clipping,
  no horizontal scroll, nothing under a safe-area inset.
- Body text meets 4.5:1 against its background; large text and non-text
  indicators meet 3:1.
- No `#14121a`, `#2a2133`, or any purple value remains in the stylesheet.
