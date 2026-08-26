import fs from 'fs';
import { ensureStateDir, resolveContextPath } from './paths-core.js';
import type { Context } from './types.js';

export function loadContext(): Context | null {
  const contextPath = resolveContextPath();
  if (!fs.existsSync(contextPath)) return null;
  return JSON.parse(fs.readFileSync(contextPath, 'utf-8')) as Context;
}

export function saveContext(ctx: Context): void {
  ensureStateDir();
  fs.writeFileSync(resolveContextPath(), JSON.stringify(ctx, null, 2));
}
