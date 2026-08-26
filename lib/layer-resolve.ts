import { ArcqError } from './errors.js';
import type { Config } from './types.js';

// Cheap closest-match scoring over slug-style keys (substring first, then
// hyphen-token overlap) — good enough for typo suggestions without an
// edit-distance dependency.
export function suggestNames(input: string, candidates: string[]): string[] {
  const lower = input.toLowerCase();
  const tokens = new Set(lower.split('-').filter(Boolean));

  return candidates
    .map((name) => {
      const candidate = name.toLowerCase();
      let score = 0;
      if (candidate.includes(lower) || lower.includes(candidate)) score += 100;
      score += candidate.split('-').filter((t) => tokens.has(t)).length;
      return { name, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((c) => c.name);
}

// `<service>:<id>` as accepted by `arcq use`, so the same identifier a user
// picked there also works in `query` and `fields`. Split on the LAST ':' so a
// service name containing one still parses, and require an all-digit id so a
// layer legitimately named `foo:bar` is not misread as a service reference.
// A raw URL is never a candidate - its own ':' would make `http://host:8080`
// look like service `http://host`, layer 8080.
export function parseServiceId(
  name: string
): { service: string; id: number } | null {
  if (name.includes('://')) return null;

  const sep = name.lastIndexOf(':');
  if (sep === -1) return null;

  const idStr = name.slice(sep + 1);
  if (!/^\d+$/.test(idStr)) return null;

  const service = name.slice(0, sep);
  if (!service) return null;

  return { service, id: parseInt(idStr, 10) };
}

export function resolveLayerArg(
  name: string,
  config: Config
): { url: string; source: string } {
  const named = config.layers?.[name];
  if (named) return { url: named, source: `named layer '${name}'` };

  // Resolved from the configured service URL rather than the cache, so this
  // works without a prior `arcq refresh`.
  const parsed = parseServiceId(name);
  if (parsed) {
    const serviceUrl = config.services?.[parsed.service];
    if (serviceUrl) {
      return {
        url: `${serviceUrl.replace(/\/+$/, '')}/${parsed.id}`,
        source: `service '${parsed.service}' layer ${parsed.id}`,
      };
    }
  }

  if (name.includes('://')) return { url: name, source: 'raw URL' };

  // Suggest across both namespaces, since either could be what was meant.
  const suggestions = suggestNames(name, [
    ...Object.keys(config.layers ?? {}),
    ...Object.keys(config.services ?? {}),
  ]);
  const hint = suggestions.length
    ? `did you mean: ${suggestions.join(', ')}? `
    : '';
  throw new ArcqError(
    `unknown layer '${name}' - ${hint}(see: arcq layers --names, ` +
      `or use <service>:<id> from arcq services)`
  );
}
