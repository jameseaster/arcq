import { loadCache } from './cache-core.js';
import { loadConfig } from './config-core.js';
import { saveContext } from './context-core.js';
import { execSync } from 'child_process';
import { ArcqError } from './errors.js';
import { suggestNames } from './layer-resolve.js';
import type { CatalogLayer, Context } from './types.js';

type LayerWithService = CatalogLayer & { service: string };

// Resolution order for `arcq use <name>`: config layer key, then cache
// `service:id`, then exact cache layer name (ambiguity errors, not
// first-match). Documented in help — agents need to know which wins.
function resolveNamed(name: string, allLayers: LayerWithService[]): Context {
  const config = loadConfig();

  const configUrl = config.layers?.[name];
  if (configUrl) return { name, url: configUrl };

  // Split on the LAST ':' so service names containing ':' don't break.
  const sep = name.lastIndexOf(':');
  if (sep !== -1) {
    const service = name.slice(0, sep);
    const idStr = name.slice(sep + 1);
    if (/^\d+$/.test(idStr)) {
      const id = parseInt(idStr, 10);
      const match = allLayers.find((l) => l.service === service && l.id === id);
      if (match) {
        return {
          service: match.service,
          layerId: match.id,
          name: match.name,
          url: match.url,
        };
      }
    }
  }

  const byName = allLayers.filter((l) => l.name === name);
  if (byName.length === 1) {
    const match = byName[0]!;
    return {
      service: match.service,
      layerId: match.id,
      name: match.name,
      url: match.url,
    };
  }
  if (byName.length > 1) {
    const candidates = byName
      .map((l) => `${l.service}:${l.id} → ${l.name}`)
      .join(', ');
    throw new ArcqError(
      `ambiguous layer name '${name}' - use one of: ${candidates}`
    );
  }

  const candidates = [
    ...Object.keys(config.layers ?? {}),
    ...allLayers.map((l) => l.name),
  ];
  const suggestions = suggestNames(name, candidates);
  const hint = suggestions.length
    ? `did you mean: ${suggestions.join(', ')}? `
    : '';
  throw new ArcqError(
    `unknown layer '${name}' - ${hint}(see: arcq layers --names)`
  );
}

export default async function interactiveCmd(
  args: string[] = []
): Promise<void> {
  const cache = loadCache();

  const allLayers: LayerWithService[] = Object.entries(cache).flatMap(
    ([service, layers]) => layers.map((l) => ({ service, ...l }))
  );

  const name = args[0];
  if (name) {
    const ctx = resolveNamed(name, allLayers);
    saveContext(ctx);
    console.log(`[arcq] active layer set → ${ctx.name}`);
    return;
  }

  const input = allLayers
    .map((l) => `${l.service}:${l.id} → ${l.name}`)
    .join('\n');

  const selection = execSync('fzf', {
    input,
    encoding: 'utf-8',
  }).trim();

  const match = allLayers.find((l) =>
    selection.startsWith(`${l.service}:${l.id} →`)
  );

  if (!match) {
    console.log('[arcq] no matching layer selected');
    return;
  }

  const ctx: Context = {
    service: match.service,
    layerId: match.id,
    name: match.name,
    url: match.url,
  };

  saveContext(ctx);

  console.log(`[arcq] active layer set → ${match.name}`);
}
