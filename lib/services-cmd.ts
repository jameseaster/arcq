import { loadConfig, saveConfig } from './config-core.js';

export default function servicesCmd(args: string[]): void {
  const sub = args[0];

  if (sub === 'add') {
    const name = args[1];
    const url = args[2];

    if (!name || !url) {
      console.log('Usage: arcq services add <name> <url>');
      return;
    }

    const config = loadConfig();
    config.services = { ...config.services, [name]: url };
    saveConfig(config);
    console.log(`[arcq] service added → ${name}`);
    return;
  }

  console.log('Usage:');
  console.log('  arcq services add <name> <url>');
}
