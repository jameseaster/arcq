#!/usr/bin/env node

import { run } from '../index.js';
import { ArcqError } from '../lib/errors.js';

try {
  await run(process.argv.slice(2));
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = err instanceof ArcqError ? err.exitCode : 1;
}
