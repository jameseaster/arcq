import fs from 'fs';
import { ensureStateDir, resolveTokenPath } from './paths-core.js';

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
