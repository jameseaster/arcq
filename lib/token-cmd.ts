import {
  getToken,
  loadTokenMeta,
  saveTokenMeta,
  setTokenValue,
} from './token-core.js';
import { loadOAuth } from './oauth-core.js';
import { loadConfig } from './config-core.js';
import { hostOf } from './token-binding.js';
import { ArcqError } from './errors.js';
import { makePrompter } from './prompt-core.js';
import tokenConnectCmd from './token-connect-cmd.js';
import tokenRefreshCmd from './token-refresh-cmd.js';

function portalOrigin(portalUrl: string): string {
  try {
    return new URL(portalUrl).origin;
  } catch {
    return portalUrl;
  }
}

// `token set` has no portal to ask, so fall back to the config: when every
// configured service lives on one host, that host is unambiguously the one the
// token is for. Mixed hosts are left unrecorded rather than guessed at.
function inferHostFromServices(): string | undefined {
  let config;
  try {
    config = loadConfig();
  } catch {
    // A malformed config is surfaced by the commands that need it; inferring
    // a host is best-effort and never the reason a `token set` fails.
    return undefined;
  }

  const hosts = new Set<string>();
  for (const url of Object.values(config.services ?? {})) {
    const host = hostOf(url);
    if (host) hosts.add(host);
  }
  return hosts.size === 1 ? [...hosts][0] : undefined;
}

// Splits `--host <value>` out of the `token set` args, leaving the token (if
// it was passed positionally) behind.
function parseSetArgs(args: string[]): { token?: string; host?: string } {
  const rest: string[] = [];
  let host: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host') {
      const value = args[++i];
      if (value === undefined) throw new ArcqError('--host requires a value');
      host = hostOf(value);
      if (!host) throw new ArcqError(`--host value is not a host: ${value}`);
    } else {
      rest.push(args[i]!);
    }
  }

  return host !== undefined ? { token: rest[0], host } : { token: rest[0] };
}

export interface TokenDeps {
  // Prompts for a line of input. Injected in tests.
  prompt?: (question: string) => Promise<string>;
}

export default async function tokenCmd(
  args: string[],
  deps: TokenDeps = {}
): Promise<void> {
  const sub = args[0];

  if (sub === 'show') {
    // stdout stays machine-clean (the bare token) so `$(arcq token show)`
    // keeps working in scripts; the human-facing status lines go to stderr.
    console.log(getToken() || 'No token set.');

    const meta = loadTokenMeta();
    if (meta?.expires) {
      const minsLeft = Math.round((meta.expires - Date.now()) / 60000);
      console.error(
        `expires: ${new Date(meta.expires).toISOString()} (${minsLeft} min left)`
      );
    }

    // Which authority the token may be sent to is as much a part of its status
    // as its expiry, so `token show` reports it either way.
    console.error(
      meta?.host
        ? `host: ${meta.host} (arcq will not send this token elsewhere)`
        : 'host: not recorded - run: arcq token set --host <host>'
    );

    // The refresh token is a secret and is never printed - only whether one is
    // configured and which portal it targets.
    const oauth = loadOAuth();
    console.error(
      oauth
        ? `refresh: configured (portal ${portalOrigin(oauth.portalUrl)})`
        : 'refresh: not configured'
    );
    return;
  }

  if (sub === 'set') {
    const parsed = parseSetArgs(args.slice(1));

    // Passing the token as an argument leaks it into shell history and `ps`
    // output; when it's omitted, prompt for it (or read piped stdin) instead.
    let token = parsed.token;
    if (!token) {
      if (deps.prompt) {
        token = (await deps.prompt('Token: ')).trim();
      } else {
        const prompter = makePrompter();
        try {
          token = (await prompter.prompt('Token: ')).trim();
        } finally {
          prompter.close();
        }
      }
    }
    if (!token) {
      throw new ArcqError('no token provided');
    }
    setTokenValue(token);

    // Record the host so the token cannot later be sent to a different one.
    // An explicit --host wins; otherwise infer it when the config is
    // unambiguous. A manually set token has no expiry we can know, so keep
    // whatever the previous meta reported rather than inventing one.
    const host = parsed.host ?? inferHostFromServices();
    const prior = loadTokenMeta();
    if (host) {
      saveTokenMeta({ expires: prior?.expires ?? 0, host });
    } else if (prior?.host) {
      // The new token is not the old one: a stale binding would be a lie.
      saveTokenMeta({ expires: prior.expires });
    }

    console.log(host ? `Token saved (host ${host}).` : 'Token saved.');
    return;
  }

  if (sub === 'connect') {
    return tokenConnectCmd(args.slice(1));
  }

  if (sub === 'refresh') {
    return tokenRefreshCmd();
  }

  console.log('Usage:');
  console.log(
    '  arcq token set [<token>] [--host <host>]   (prompts when omitted)'
  );
  console.log('  arcq token show');
  console.log('  arcq token connect [--command <cmd>]');
  console.log('  arcq token refresh');
}
