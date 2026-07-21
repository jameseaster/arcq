import { loadConfig, saveConfig } from './config-core.js';
import { getToken } from './token-core.js';
import { fetchServiceCatalog } from './arcgis-core.js';

function toLayerKey(serviceName: string, layerName: string): string {
  const slug = layerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${serviceName}-${slug}`;
}

export default async function syncCmd(): Promise<void> {
  const config = loadConfig();
  const token = getToken();
  const layers: Record<string, string> = {};

  for (const [name, url] of Object.entries(config.services || {})) {
    console.error(`[arcq] syncing ${name}...`);
    const catalog = await fetchServiceCatalog(url, token);
    for (const layer of catalog) {
      layers[toLayerKey(name, layer.name)] = layer.url;
    }
  }

  saveConfig({ ...config, layers });
  console.log('[arcq] config layers updated');
}
