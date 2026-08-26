import tokenCmd from './lib/token-cmd.js';
import listCmd from './lib/list-cmd.js';
import layersCmd from './lib/layers-cmd.js';
import servicesCmd from './lib/services-cmd.js';
import queryCmd from './lib/query-cmd.js';
import fieldsCmd from './lib/fields-cmd.js';
import refreshCmd from './lib/refresh-cmd.js';
import syncCmd from './lib/sync-cmd.js';
import interactiveCmd from './lib/interactive-cmd.js';
import activeCmd from './lib/active-cmd.js';
import helpCmd from './lib/help-cmd.js';
import versionCmd from './lib/version-cmd.js';
import { loadConfig } from './lib/config-core.js';
import { setInsecureTls } from './lib/tls-core.js';
import { setAllowCrossHost } from './lib/token-binding.js';
import { ArcqError } from './lib/errors.js';

// Query flags that may legally appear before the where clause in the
// `arcq -q "1=1"` shorthand; everything else dash-prefixed is an error here.
const QUERY_PASSTHROUGH_FLAGS = ['-q', '--quiet', '-v', '--verbose'];

// `--insecure` is a top-level flag valid for every command. It is resolved
// and stripped here so it never reaches a command's own flag parser or gets
// swallowed as a layer name or where clause. Precedence (highest first): the
// flag, then ARCQ_INSECURE=1, then "insecure": true in the config. Returns
// the remaining args with any --insecure occurrences removed.
export function resolveInsecure(args: string[]): {
  insecure: boolean;
  args: string[];
} {
  const flag = args.includes('--insecure');

  const env = process.env.ARCQ_INSECURE;
  const envOn = env === '1' || env?.toLowerCase() === 'true';

  let configOn = false;
  try {
    configOn = loadConfig().insecure === true;
  } catch {
    // A malformed config is surfaced by the command that loads it; the TLS
    // decision defaults to secure here.
  }

  return {
    insecure: flag || envOn || configOn,
    args: args.filter((a) => a !== '--insecure'),
  };
}

// `--allow-cross-host` is a top-level flag valid for every command, resolved
// and stripped here for the same reason as `--insecure`, with the same
// precedence (highest first): the flag, then ARCQ_ALLOW_CROSS_HOST=1, then
// "allowCrossHost": true in the config.
export function resolveAllowCrossHost(args: string[]): {
  allowCrossHost: boolean;
  args: string[];
} {
  const flag = args.includes('--allow-cross-host');

  const env = process.env.ARCQ_ALLOW_CROSS_HOST;
  const envOn = env === '1' || env?.toLowerCase() === 'true';

  let configOn = false;
  try {
    configOn = loadConfig().allowCrossHost === true;
  } catch {
    // A malformed config is surfaced by the command that loads it; the token
    // binding defaults to enforced here.
  }

  return {
    allowCrossHost: flag || envOn || configOn,
    args: args.filter((a) => a !== '--allow-cross-host'),
  };
}

export async function run(rawArgs: string[]): Promise<void> {
  const { insecure, args: afterInsecure } = resolveInsecure(rawArgs);
  setInsecureTls(insecure);
  if (insecure) {
    // One warning per invocation, always on stderr, regardless of --quiet.
    console.error('[arcq] WARNING: TLS certificate verification is disabled');
  }

  const { allowCrossHost, args } = resolveAllowCrossHost(afterInsecure);
  // No warning here: it would fire on every invocation even when nothing
  // cross-host happens. token-binding warns at the moment it actually sends a
  // token somewhere it otherwise would not have.
  setAllowCrossHost(allowCrossHost);

  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    return helpCmd();
  }

  if (command === '--version' || command === '-V' || command === 'version') {
    return versionCmd();
  }

  switch (command) {
    case 'refresh':
      return refreshCmd();

    case 'sync':
      return syncCmd();

    case 'use':
      return interactiveCmd(args.slice(1));

    case 'active':
      return activeCmd();

    case 'query':
      return queryCmd(args.slice(1));

    case 'fields':
      return fieldsCmd(args.slice(1));

    case 'list':
      return listCmd(args.slice(1));

    case 'layers':
      return layersCmd(args.slice(1));

    case 'token':
      return tokenCmd(args.slice(1));

    case 'services':
      return servicesCmd(args.slice(1));

    default:
      if (
        command.startsWith('-') &&
        !QUERY_PASSTHROUGH_FLAGS.includes(command)
      ) {
        throw new ArcqError(`unknown flag '${command}' - run: arcq --help`);
      }
      // fallback: treat as query shorthand
      return queryCmd(args);
  }
}
