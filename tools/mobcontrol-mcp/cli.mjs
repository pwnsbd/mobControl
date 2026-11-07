#!/usr/bin/env node

import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const projectDir = path.resolve(process.argv[2] ?? process.cwd());
const projectRequire = createRequire(path.join(projectDir, 'package.json'));
let configModule;

try {
  const configPath = projectRequire.resolve('mobcontrol/client/shared/config.js');
  configModule = await import(pathToFileURL(configPath).href);
} catch (error) {
  const detail = error?.code === 'MODULE_NOT_FOUND' || error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    ? `Could not resolve mobcontrol/client/shared/config.js from ${projectDir}. Install mobcontrol in that project, or pass the project directory containing its node_modules as the first argument.`
    : `Could not load MobControl configuration exports from ${projectDir}: ${error?.message ?? String(error)}`;
  process.stderr.write(`mobcontrol-mcp: ${detail}\n`);
  process.exit(1);
}

if (typeof configModule.validateConfiguration !== 'function' || !configModule.configurationContract) {
  process.stderr.write(`mobcontrol-mcp: ${projectDir} resolved a MobControl module without validateConfiguration and configurationContract exports. Check the installed MobControl version.\n`);
  process.exit(1);
}

const server = new McpServer({
  name: 'mobcontrol-mcp',
  version: '0.1.0'
});

server.registerTool('list_capabilities', {
  description: 'Return the MobControl configuration contract, presets, fields, and controller input capabilities.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true }
}, async () => {
  const contract = configModule.configurationContract;
  return {
    structuredContent: contract,
    content: [{ type: 'text', text: JSON.stringify(contract) }]
  };
});

server.registerTool('validate_configuration', {
  description: 'Validate a declarative MobControl configuration and return any issues.',
  inputSchema: z.object({
    configuration: z.record(z.string(), z.unknown())
  }),
  annotations: { readOnlyHint: true }
}, async ({ configuration }) => {
  const issues = configModule.validateConfiguration(configuration);
  const result = { valid: issues.length === 0, issues };
  return {
    structuredContent: result,
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
});

await serveStdio(() => server);
