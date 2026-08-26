import fs from 'fs';
import {
  ensureStateDir,
  resolveTokenMetaPath,
  resolveTokenPath,
} from './paths-core.js';

export function getToken(): string | null {
  const tokenPath = resolveTokenPath();
  if (fs.existsSync(tokenPath)) {
    return fs.readFileSync(tokenPath, 'utf-8').trim();
  }
  return null;
}

export function setTokenValue(token: string): void {
  // The token is a secret: keep it readable only by the owner. writeFileSync's
  // `mode` applies only when creating the file, so chmod afterwards to also
  // tighten a pre-existing file written with looser permissions.
  ensureStateDir();
  const tokenPath = resolveTokenPath();
  fs.writeFileSync(tokenPath, token.trim(), { mode: 0o600 });
  fs.chmodSync(tokenPath, 0o600);
}

// What arcq knows about the access token beyond the opaque string itself. It
// lives alongside the token rather than with the OAuth credential because it
// describes the token, and because the request path needs it without pulling
// in the OAuth machinery.
export interface TokenMeta {
  // Epoch ms the current access token expires.
  expires: number;
  // Hostname the token was issued for. Optional: tokens stored before this
  // field existed have no recorded host.
  host?: string;
}

export function loadTokenMeta(): TokenMeta | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(resolveTokenMetaPath(), 'utf-8')
    ) as TokenMeta;
    if (!parsed || typeof parsed.expires !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTokenMeta(meta: TokenMeta): void {
  ensureStateDir();
  const tokenMetaPath = resolveTokenMetaPath();
  fs.writeFileSync(tokenMetaPath, JSON.stringify(meta), { mode: 0o600 });
  fs.chmodSync(tokenMetaPath, 0o600);
}
