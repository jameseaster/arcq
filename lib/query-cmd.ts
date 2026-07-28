import { loadContext } from './context-core.js';
import { loadConfig } from './config-core.js';
import { withTokenRetry } from './oauth-core.js';
import { queryLayer } from './arcgis-core.js';
import { ArcqError } from './errors.js';
import { resolveLayerArg } from './layer-resolve.js';
import type { Feature } from './types.js';

interface QueryFlags {
  quiet: boolean;
  count: boolean;
  outFields?: string;
  limit?: number;
  orderBy?: string;
}

// The query summary prints by default; -q / --quiet suppresses it.
// -v / --verbose is still accepted (now a no-op) so it doesn't break the
// positional parsing for anyone with it in muscle memory.
function parseQueryArgs(args: string[]): {
  flags: QueryFlags;
  positionals: string[];
} {
  const flags: QueryFlags = { quiet: false, count: false };
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    switch (arg) {
      case '-q':
      case '--quiet':
        flags.quiet = true;
        break;
      case '-v':
      case '--verbose':
        break;
      case '--count':
        flags.count = true;
        break;
      case '--out-fields':
      case '--order-by':
      case '--limit': {
        const value = args[++i];
        if (value === undefined) {
          throw new ArcqError(`${arg} requires a value`);
        }
        if (arg === '--out-fields') {
          flags.outFields = value;
        } else if (arg === '--order-by') {
          flags.orderBy = value;
        } else {
          if (!/^\d+$/.test(value) || parseInt(value, 10) < 1) {
            throw new ArcqError('--limit requires a positive integer');
          }
          flags.limit = parseInt(value, 10);
        }
        break;
      }
      default:
        if (arg.startsWith('-')) {
          throw new ArcqError(`unknown flag '${arg}' for query`);
        }
        positionals.push(arg);
    }
  }

  return { flags, positionals };
}

export default async function queryCmd(args: string[]): Promise<void> {
  const { flags, positionals } = parseQueryArgs(args);

  const ctx = loadContext();
  const config = loadConfig();

  let layerUrl: string;
  let where: string;
  let source: string;

  if (positionals.length === 1) {
    where = positionals[0]!;

    if (!ctx) {
      throw new ArcqError('no active layer - run: arcq use <name>');
    }

    layerUrl = ctx.url;
    source =
      ctx.name && ctx.service != null && ctx.layerId != null
        ? `${ctx.service}:${ctx.layerId} → ${ctx.name}`
        : ctx.name || ctx.url;
  } else {
    const resolved = resolveLayerArg(positionals[0]!, config);
    layerUrl = resolved.url;
    source = resolved.source;
    where = positionals[1] ?? '1=1';
  }

  if (!flags.quiet) {
    const rule = '─'.repeat(60);
    console.error('');
    console.error(rule);
    console.error(`layer:    ${source}`);
    console.error(`where:    ${where}`);
    console.error(`endpoint: ${layerUrl}/query`);
    console.error(rule);
    console.error('');
  }

  // withTokenRetry runs the request(s) with the stored token and, on an
  // expired/invalid-token failure with OAuth configured, refreshes once and
  // retries the whole operation a single time.
  const output = await withTokenRetry(async (token) => {
    if (flags.count) {
      // Single count request - --out-fields and --limit are ignored here
      // (documented in help), --order-by passes through harmlessly.
      const data = await queryLayer(layerUrl, {
        where,
        f: 'json',
        token,
        returnCountOnly: true,
        ...(flags.orderBy !== undefined && { orderByFields: flags.orderBy }),
      });
      return JSON.stringify({ count: data.count ?? 0 });
    }

    const all: Feature[] = [];
    let offset = 0;

    while (true) {
      const pageSize =
        flags.limit != null ? Math.min(1000, flags.limit - all.length) : 1000;

      const data = await queryLayer(layerUrl, {
        where,
        outFields: flags.outFields ?? '*',
        f: 'json',
        token,
        resultOffset: offset,
        resultRecordCount: pageSize,
        ...(flags.orderBy !== undefined && { orderByFields: flags.orderBy }),
      });

      const features = data.features || [];
      all.push(...features);

      if (!data.exceededTransferLimit || features.length === 0) break;
      if (flags.limit != null && all.length >= flags.limit) break;
      offset += features.length;
    }

    // Defends against a server returning more rows than asked.
    if (flags.limit != null) all.length = Math.min(all.length, flags.limit);

    return JSON.stringify(
      all.map((f) => f.attributes),
      null,
      2
    );
  });

  console.log(output);
}
