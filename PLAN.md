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

- [x] **P1.1 — landscape + safe areas.** `controller.css` has one bottom inset
      rule and no `@media`/orientation handling. Gamepads are held sideways.
- [x] **P1.2 — repalette to cream/forest.** Swap the existing `:root` values;
      no new token system needed.
- [x] **P1.3 — tactile pad.** Press depth, movement, optional haptics.
- [x] **P1.4 — layout templates.** Gamepad / dual-stick / D-pad presets. This is
      the one good product idea in the reference image; the brief omits it.

- [x] **P1.4b — a layout declares its orientation.** Contract:
      `docs/contracts/layout-orientation.md`. Positions are fractions of a pad
      that is ~339x672 portrait and ~776x289 landscape, so one set of numbers
      cannot serve both. Templates say which they were designed for.
- [x] **P1.5 — the drag control type.** The game can declare a fixed touch
      surface and receive the gesture's position, velocity, and lifecycle.
      Games that want no gamepad — quizzes, card and puzzle games, simple tilt
      games — want a draggable or swipeable area, usually in portrait. This is
      a new input primitive and gets the same treatment sticks got: its own
      contract, its own tests.
- [ ] **P1.6 — visible edit menu.** Replace the double-tap hint.

## Agent tooling for 0.1.0

Keep the game integration to server setup, a controller declaration, and
bindings to existing game actions. The local MCP companion is optional
development tooling. Games and phones use the existing runtime API.

1. **Discover and validate.** The package includes a versioned contract for
   presets, custom controls, and their inputs. Runtime setup and development
   validation share the supported control types. Validation reports invalid
   fields and duplicate IDs.
2. **Simulate input in tests.** An in-memory phone connection sends input
   frames through the real game controller. It verifies movement, held input,
   and press/release events without a handset.
3. **Expose discovery and validation over MCP.** The optional local companion
   reads the game's installed contract and runs its validator. It keeps MCP
   dependencies out of the game runtime.

Release check: install the packed module into a fresh game. Ask an agent to
add steering, hold-to-brake, and tap-to-boost while preserving keyboard input.
Verify the game actions, then check pairing and controller feel on a real phone.

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

- **2026-11-06 — a close outside `playing` is not "interrupted".** From
  `armed` or `teaching` the stage is left alone and only the 'Reconnecting…'
  status shows. Input is still released. The player is mid-setup, not mid-game;
  yanking them to an interrupted screen would be louder than the problem.
- **2026-11-06 — tests run by glob** (`node --test "test/*.test.js"`). A bare
  directory argument fails: `test/package.json` makes node load it as a module.

## Agent notes

- **Grep for a whitelist before believing a field arrives.** `normaliseControls`
  in `controller.js` rebuilds each control from named properties, so a new
  control-spec field is silently dropped unless it is added there. This ate
  `size`, then `accent`, with a green suite both times. `boundary.test.js`
  guards the crossing now; extend it when adding a field.
- **Accent values** are the four in `controls.js` ACCENTS; anything else is
  ignored by design, so a typo shows as a default sage button, not an error.

- **A builder with no browser cannot finish a visual task.** The P1 pass landed
  three defects that only rendering showed: the playing background never
  switched, every panel painted at once in landscape, and controls sized off
  the pad's width overflowed when the phone turned. All three looked correct in
  the source. Budget a Conductor render pass after every visual task.


- This repo is a plain `git init` with no remote. Worktree builders branch from
  `main`; name the base commit in every brief.
- Node's built-in test runner, `npm test` from the repo root (workspaces).
- Phone client is ~1,160 lines across small modules. Read the module, not the
  tree; it is well commented.
