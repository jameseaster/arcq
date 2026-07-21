import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Cache } from './types.js';

export const CACHE_PATH = path.join(os.homedir(), '.arcq-cache.json');

export function loadCache(): Cache {
  if (!fs.existsSync(CACHE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as Cache;
}

export function saveCache(cache: Cache): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}
