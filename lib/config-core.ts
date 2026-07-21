import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Config } from './types.js';

export function resolveConfigPath(): string {
  return process.env.ARCQ_CONFIG || path.join(os.homedir(), '.arcq.json');
}

export function loadConfig(): Config {
  const configPath = resolveConfigPath();
  if (!fs.existsSync(configPath)) return {};
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Config;
  // The optional top-level `insecure` key is only honored when it is exactly
  // the boolean true; anything else (missing, string, number) is ignored.
  if (config.insecure !== true) delete config.insecure;
  return config;
}

export function saveConfig(config: Config): void {
  fs.writeFileSync(resolveConfigPath(), JSON.stringify(config, null, 2));
}
