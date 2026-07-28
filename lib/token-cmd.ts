import { getToken, setTokenValue } from './token-core.js';
import { loadOAuth, loadTokenMeta } from './oauth-core.js';
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
    if (meta) {
      const minsLeft = Math.round((meta.expires - Date.now()) / 60000);
      console.error(
        `expires: ${new Date(meta.expires).toISOString()} (${minsLeft} min left)`
      );
    }

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
    // Passing the token as an argument leaks it into shell history and `ps`
    // output; when it's omitted, prompt for it (or read piped stdin) instead.
    let token = args[1];
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
    console.log('Token saved.');
    return;
  }

  if (sub === 'connect') {
    return tokenConnectCmd(args.slice(1));
  }

  if (sub === 'refresh') {
    return tokenRefreshCmd();
  }

  console.log('Usage:');
  console.log('  arcq token set [<token>]   (prompts when omitted)');
  console.log('  arcq token show');
  console.log('  arcq token connect [--command <cmd>]');
  console.log('  arcq token refresh');
}
