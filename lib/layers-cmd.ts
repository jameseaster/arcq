import { loadConfig } from './config-core.js';

export default function layersCmd(args: string[] = []): void {
  const namesOnly = args.includes('--names');
  const config = loadConfig();
  const layers = config.layers || {};
  const entries = Object.entries(layers);

  if (entries.length === 0) {
    console.log('No layers in config. Run: arcq sync');
    return;
  }

  entries.forEach(([key, url]) => {
    console.log(namesOnly ? key : `${key} → ${url}`);
  });
}
