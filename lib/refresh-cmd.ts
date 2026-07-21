import { loadConfig } from './config-core.js';
import { getToken } from './token-core.js';
import { fetchServiceCatalog } from './arcgis-core.js';
import { saveCache } from './cache-core.js';
import type { Cache } from './types.js';

export default async function refreshCmd(): Promise<void> {
  const config = loadConfig();
  const token = getToken();

  const cache: Cache = {};

  for (const [name, url] of Object.entries(config.services || {})) {
    console.error(`[arcq] indexing ${name}...`);
    cache[name] = await fetchServiceCatalog(url, token);
  }

  saveCache(cache);
  console.log('[arcq] cache updated');
}
