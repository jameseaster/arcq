import { getToken, setTokenValue } from './token-core.js';
import { loadOAuth, loadTokenMeta } from './oauth-core.js';
import tokenConnectCmd from './token-connect-cmd.js';
import tokenRefreshCmd from './token-refresh-cmd.js';

function portalOrigin(portalUrl: string): string {
  try {
    return new URL(portalUrl).origin;
  } catch {
    return portalUrl;
  }
}

export default async function tokenCmd(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === 'show') {
    console.log(getToken() || 'No token set.');

    const meta = loadTokenMeta();
    if (meta) {
      const minsLeft = Math.round((meta.expires - Date.now()) / 60000);
      console.log(
        `expires: ${new Date(meta.expires).toISOString()} (${minsLeft} min left)`
      );
    }

    // The refresh token is a secret and is never printed - only whether one is
    // configured and which portal it targets.
    const oauth = loadOAuth();
    console.log(
      oauth
        ? `refresh: configured (portal ${portalOrigin(oauth.portalUrl)})`
        : 'refresh: not configured'
    );
    return;
  }

  if (sub === 'set') {
    const token = args[1];
    if (!token) {
      console.log('Usage: arcq token set <token>');
      return;
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
  console.log('  arcq token set <token>');
  console.log('  arcq token show');
  console.log('  arcq token connect [--command <cmd>]');
  console.log('  arcq token refresh');
}
