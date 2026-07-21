import { loadContext } from './context-core.js';
import { loadConfig } from './config-core.js';
import { getToken } from './token-core.js';
import { fetchLayerMetadata } from './arcgis-core.js';
import { ArcqError } from './errors.js';
import { resolveLayerArg } from './layer-resolve.js';

export default async function fieldsCmd(args: string[]): Promise<void> {
  let layerUrl: string;

  if (args.length === 0) {
    const ctx = loadContext();
    if (!ctx) {
      throw new ArcqError('no active layer - run: arcq use <name>');
    }
    layerUrl = ctx.url;
  } else {
    layerUrl = resolveLayerArg(args[0]!, loadConfig()).url;
  }

  const fields = await fetchLayerMetadata(layerUrl, getToken());

  console.log(JSON.stringify(fields, null, 2));
}
