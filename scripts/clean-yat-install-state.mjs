#!/usr/bin/env node
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const target = process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes');

if (!target.endsWith('/.hermes') && !target.includes('/hermes-fresh')) {
  console.error(`Refusing to remove unexpected HERMES_HOME: ${target}`);
  process.exit(1);
}

if (existsSync(target)) {
  rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
} else {
  console.log(`Already clean: ${target}`);
}

console.log('Next Yat launch will run the bundled install flow again.');
