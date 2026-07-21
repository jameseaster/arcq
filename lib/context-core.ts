import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Context } from './types.js';

const CONTEXT_PATH = path.join(os.homedir(), '.arcq-context.json');

export function loadContext(): Context | null {
  if (!fs.existsSync(CONTEXT_PATH)) return null;
  return JSON.parse(fs.readFileSync(CONTEXT_PATH, 'utf-8')) as Context;
}

export function saveContext(ctx: Context): void {
  fs.writeFileSync(CONTEXT_PATH, JSON.stringify(ctx, null, 2));
}
