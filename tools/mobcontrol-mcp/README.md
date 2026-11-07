# mobControl MCP

Give a coding agent access to the controller options supported by the version
of mobControl installed in your game.

## Connect from this checkout

Run `npm install` at the repository root. Use this command and these arguments
when adding a local stdio server in your agent's MCP settings.

```json
{
  "command": "node",
  "args": ["/absolute/path/to/mobControl/tools/mobcontrol-mcp/cli.mjs", "/absolute/path/to/your/game"]
}
```

Use the game folder where mobControl is installed. To try it against the
workspace, use the repository root as the second argument. The agent launches
the companion when it connects.

If the companion is installed in the game, use the path to
`node_modules/mobcontrol-mcp/cli.mjs` in that game for the first argument.

## Use it

- `list_capabilities` lists presets, control fields, input bindings, and feedback options.
- `validate_configuration` accepts `{"configuration": {...}}` and returns `valid` and field-level `issues`.

Ask your agent to add joystick steering and shake-to-jump while preserving
keyboard controls. It can discover the options, validate the exact object
passed to `PhoneController`, and bind the inputs to your game's existing actions.

The companion runs locally during development. Your game and phone use the
regular mobControl API.
