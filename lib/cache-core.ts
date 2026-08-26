import fs from 'fs';
import { ensureStateDir, resolveCachePath } from './paths-core.js';
import type { Cache } from './types.js';

export function loadCache(): Cache {
  const cachePath = resolveCachePath();
  if (!fs.existsSync(cachePath)) return {};
  return JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as Cache;
}

export function saveCache(cache: Cache): void {
  ensureStateDir();
  fs.writeFileSync(resolveCachePath(), JSON.stringify(cache, null, 2));
}
