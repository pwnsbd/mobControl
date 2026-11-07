import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const project = process.env.MOBCONTROL_TEST_PROJECT
  ? resolve(process.env.MOBCONTROL_TEST_PROJECT)
  : fileURLToPath(new URL('../../../', import.meta.url));
const requireProject = createRequire(join(project, 'package.json'));

test('an MCP client discovers, validates, and wires joystick steering with shake to jump', async () => {
  const companion = dirname(requireProject.resolve('mobcontrol-mcp/package.json'));
  const client = new Client({ name: 'mobcontrol-integration-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(companion, 'cli.mjs'), project]
  });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(({ name }) => name).sort(), ['list_capabilities', 'validate_configuration']);
    const capabilities = (await client.callTool({ name: 'list_capabilities', arguments: {} })).structuredContent;
    assert.ok(capabilities.controlTypes.includes('stick'));
    assert.equal(capabilities.fields.motionWithJoystick.type, 'boolean');
    assert.match(capabilities.inputs.shake, /pad\.shake/);

    const configuration = {
      controls: [{ id: 'steer', type: 'stick' }],
      motion: true,
      motionWithJoystick: true
    };
    const validate = async (value) => (await client.callTool({
      name: 'validate_configuration',
      arguments: { configuration: value }
    })).structuredContent;
    assert.deepEqual(await validate(configuration), { valid: true, issues: [] });
    const invalid = await validate({
      ...configuration, controls: [...configuration.controls, { id: 'steer', type: 'button' }]
    });
    assert.equal(invalid.valid, false);
    assert.equal(invalid.issues[0].path, 'controls[1].id');

    const { PhoneController } = await import(pathToFileURL(
      requireProject.resolve('mobcontrol/client/controller.js')
    ).href);
    globalThis.location = { origin: 'https://game.example', hostname: 'game.example', protocol: 'https:', search: '' };
    const handlers = new Map();
    const pad = new PhoneController({
      ...configuration, room: 'TEST', persistRoom: false, autoConnect: false,
      transport: { on: (name, callback) => handlers.set(name, callback), send() {} }
    });
    let jumps = 0;
    let shaking = false;
    const jump = () => { jumps += 1; };
    const onKey = (code) => { if (code === 'Space') jump(); };
    pad.on('input', () => {
      const aboveThreshold = pad.shake >= 0.6;
      if (aboveThreshold && !shaking) jump();
      shaking = aboveThreshold;
    });
    const phoneInput = (shake) => handlers.get('message')({
      type: 'input', motionEnabled: true, sticks: { steer: { x: 0.5, y: 0 } }, shake
    });

    onKey('Space');
    phoneInput(0.9);
    phoneInput(0.8);
    assert.equal(pad.stick.steer.x, 0.5);
    assert.equal(jumps, 2);
    phoneInput(0.2);
    phoneInput(0.9);
    assert.equal(jumps, 3);
  } finally {
    await client.close();
  }
});
