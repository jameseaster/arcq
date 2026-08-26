import fs from 'fs';
import { ensureStateDir, resolveConfigPath } from './paths-core.js';
import type { Config } from './types.js';

export { resolveConfigPath };

export function loadConfig(): Config {
  const configPath = resolveConfigPath();
  if (!fs.existsSync(configPath)) return {};
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Config;
  // The optional top-level `insecure` and `allowCrossHost` keys are only
  // honored when exactly the boolean true; anything else (missing, string,
  // number) is ignored.
  if (config.insecure !== true) delete config.insecure;
  if (config.allowCrossHost !== true) delete config.allowCrossHost;
  return config;
}

export function saveConfig(config: Config): void {
  ensureStateDir();
  fs.writeFileSync(resolveConfigPath(), JSON.stringify(config, null, 2));
}
