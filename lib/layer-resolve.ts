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

export function resolveLayerArg(
  name: string,
  config: Config
): { url: string; source: string } {
  const named = config.layers?.[name];
  if (named) return { url: named, source: `named layer '${name}'` };
  if (name.includes('://')) return { url: name, source: 'raw URL' };

  const suggestions = suggestNames(name, Object.keys(config.layers ?? {}));
  const hint = suggestions.length
    ? `did you mean: ${suggestions.join(', ')}? `
    : '';
  throw new ArcqError(
    `unknown layer '${name}' - ${hint}(see: arcq layers --names)`
  );
}
