import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Source (lib/ -> root) and compiled (dist/lib -> root) sit at different
// depths, so probe both; the name check rejects an unrelated package.json
// that happens to sit at the other depth.
export function getVersion(): string {
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      const pkg = require(rel) as { name?: string; version?: string };
      if (pkg.name === '@leverstack/arcq' && pkg.version) return pkg.version;
    } catch {
      // keep probing
    }
  }
  return 'unknown';
}

export default function versionCmd(): void {
  console.log(getVersion());
}
