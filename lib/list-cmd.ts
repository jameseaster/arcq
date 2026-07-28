import { loadConfig } from './config-core.js';
import { withTokenRetry } from './oauth-core.js';
import { fetchServiceCatalog } from './arcgis-core.js';

export default async function listCmd(args: string[]): Promise<void> {
  const config = loadConfig();
  const serviceKey = args[0];

  const serviceUrl =
    (serviceKey && config.services && config.services[serviceKey]) ||
    serviceKey;

  if (!serviceUrl) {
    console.log('Usage: arcq list <service>');
    return;
  }

  const layers = await withTokenRetry((token) =>
    fetchServiceCatalog(serviceUrl, token)
  );

  layers.forEach((l) => {
    console.log(`${l.id} → ${l.name}`);
  });
}
