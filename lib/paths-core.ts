import fs from 'fs';
import os from 'os';
import path from 'path';

// Every arcq state path is resolved here, and resolved on each call rather than
// captured in a module-level constant, so an environment change made after
// import is honored.
//
// ARCQ_HOME isolates a complete set of state - config, context, cache, token,
// OAuth credential, token metadata - as a unit. Isolating only the config, as
// ARCQ_CONFIG does on its own, still leaves the token shared, which means a
// token minted for one portal gets sent to whatever host the queried service
// lives on.
export function resolveStateDir(): string {
  return process.env.ARCQ_HOME || os.homedir();
}

// ARCQ_CONFIG names a single file and keeps precedence over ARCQ_HOME, so
// existing setups that point it at a shared config keep working unchanged.
export function resolveConfigPath(): string {
  return process.env.ARCQ_CONFIG || path.join(resolveStateDir(), '.arcq.json');
}

export function resolveContextPath(): string {
  return path.join(resolveStateDir(), '.arcq-context.json');
}

export function resolveCachePath(): string {
  return path.join(resolveStateDir(), '.arcq-cache.json');
}

export function resolveTokenPath(): string {
  return path.join(resolveStateDir(), '.arcq-token');
}

export function resolveOAuthPath(): string {
  return path.join(resolveStateDir(), '.arcq-oauth.json');
}

export function resolveTokenMetaPath(): string {
  return path.join(resolveStateDir(), '.arcq-token-meta.json');
}

// A custom ARCQ_HOME need not exist yet, so every write path calls this first.
// Mode 0700 because the directory holds files written 0600.
export function ensureStateDir(): void {
  const dir = resolveStateDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}
