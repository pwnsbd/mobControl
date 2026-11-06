# mobControl — PLAN

Source: v0.2 Design & Engineering Brief (external), audited 2026-11-06.
Audit found three of the brief's premises wrong: `controller.css` already has a
`:root` token palette; the edit handle is visible (double-tap on a `⋮⋮` grip),
not a hidden gesture; layout keys are derived from the control-set signature by
deliberate design (`pad-layout.js:30`). Baseline: 42/42 tests green at `dcc473e`.

## Now

- [x] **P0.1 — version control.** `git init`, `.gitignore`, baseline commit. (dcc473e)
- [x] **P0.2 — release held input on interruption.** Owner: builder.
      Files: `phone/app.js`, `phone/view.js`, `phone/control-pad.js`, `test/`.
      Contract: `docs/contracts/phone-interrupt.md`.
      Done when: tests prove nothing stays held across close / hide / reconnect. (46 tests green)

## Next (visual pass — the point of the exercise)

- [ ] **P1.1 — landscape + safe areas.** `controller.css` has one bottom inset
      rule and no `@media`/orientation handling. Gamepads are held sideways.
- [ ] **P1.2 — repalette to cream/forest.** Swap the existing `:root` values;
      no new token system needed.
- [ ] **P1.3 — tactile pad.** Press depth, movement, optional haptics.
- [ ] **P1.4 — layout templates.** Gamepad / dual-stick / D-pad presets. This is
      the one good product idea in the reference image; the brief omits it.

## Parked (justify before starting)

Each is defensible someday, none blocks a player or a developer today.

- Room authentication. `relay.js:23-29` checks only that room is non-empty and
  role is game|phone; a same-role joiner evicts the first. Fine on a LAN, not
  fine deployed. **Promote the moment this is hosted publicly.**
- Bundled QR generator (`game/qr.js:10` hardcodes a cdnjs URL; renderer is
  already pluggable, so this is a default change, not a subsystem).
- `mountPairing()` ready-made pairing component.
- TypeScript declarations.
- Control presets (platformer/racing/twin-stick/flight/quiz).
- Live Input Inspector.

## Decisions

- **2026-11-06 — the brief is a menu, not a contract.** Phases C and D are most
  of its word count and the least of its present value. Correctness and feel
  first; developer surface area only once the thing is good to hold.
- **2026-11-06 — no worktree agents before P0.1.** The project had no VCS at all.

## Agent notes

- This repo is a plain `git init` with no remote. Worktree builders branch from
  `main`; name the base commit in every brief.
- Node's built-in test runner, `npm test` from the repo root (workspaces).
- Phone client is ~1,160 lines across small modules. Read the module, not the
  tree; it is well commented.
