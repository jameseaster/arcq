import { execSync } from 'child_process';
import fs from 'fs';
import { requestOAuthToken } from './arcgis-core.js';
import { ArcqError } from './errors.js';
import { ensureStateDir, resolveOAuthPath } from './paths-core.js';
import { hostOf } from './token-binding.js';
import { getToken, saveTokenMeta, setTokenValue } from './token-core.js';
import type { OAuthTokenError, OAuthTokenResponse } from './types.js';

// OAuth credentials live in their own file, separate from the plain access
// token in .arcq-token, so the token file's format stays backward compatible.
// The access token's own metadata lives with the token, in token-core.

export interface OAuthConfig {
  portalUrl: string;
  appId: string;
  // Exactly one of these carries the minting secret. A stored refreshToken is a
  // live credential; a refreshTokenCommand resolves one on demand from an
  // external secret manager so arcq never writes the secret to disk itself.
  refreshToken?: string;
  refreshTokenCommand?: string;
  // Epoch ms the refresh token itself expires (best-effort, from the blob).
  refreshTokenExpires?: number;
}

// A missing or unreadable oauth file means "feature not configured", never an
// error - callers treat null as "no OAuth set up".
export function loadOAuth(): OAuthConfig | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(resolveOAuthPath(), 'utf-8')
    ) as OAuthConfig;
    if (
      !parsed ||
      typeof parsed.portalUrl !== 'string' ||
      typeof parsed.appId !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveOAuth(config: OAuthConfig): void {
  // Same secret-hygiene as setTokenValue: owner-only, and re-tightened in case
  // the file already existed with looser permissions.
  ensureStateDir();
  const oauthPath = resolveOAuthPath();
  fs.writeFileSync(oauthPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.chmodSync(oauthPath, 0o600);
}

export interface ParsedBlob {
  portalUrl: string;
  appId: string;
  refreshToken: string;
  refreshTokenExpires?: number;
}

// Extract the first portal entry from an `esriJSAPIOAuth` browser-storage blob,
// shaped `{"/": {"<portalUrl>": {appId, refreshToken, expires, ...}}}`. Throws
// a clear ArcqError when the structure or required fields are missing.
export function parseEsriOAuthBlob(raw: string): ParsedBlob {
  const data = JSON.parse(raw) as Record<string, unknown>;
  const root = data['/'] as Record<string, Record<string, unknown>> | undefined;
  if (!root || typeof root !== 'object') {
    throw new ArcqError('esriJSAPIOAuth JSON is missing its "/" section');
  }

  const portalUrl = Object.keys(root)[0];
  if (!portalUrl) {
    throw new ArcqError('esriJSAPIOAuth JSON has no portal entry');
  }

  const entry = root[portalUrl]!;
  const appId = entry.appId;
  const refreshToken = entry.refreshToken;
  if (typeof appId !== 'string' || typeof refreshToken !== 'string') {
    throw new ArcqError(
      'esriJSAPIOAuth entry is missing appId or refreshToken'
    );
  }

  const parsed: ParsedBlob = { portalUrl, appId, refreshToken };
  if (typeof entry.expires === 'number') {
    parsed.refreshTokenExpires = entry.expires;
  }
  return parsed;
}

// A pasted value or a credential-helper's stdout may be a bare refresh token or
// a full esriJSAPIOAuth blob; return the refresh token either way.
export function refreshTokenFrom(raw: string): string {
  const trimmed = raw.trim();
  try {
    return parseEsriOAuthBlob(trimmed).refreshToken;
  } catch {
    return trimmed;
  }
}

export interface RefreshDeps {
  // Runs a credential-helper command, returning its stdout. Injected in tests.
  exec?: (command: string) => string;
  // Performs the OAuth token POST. Injected in tests.
  request?: (
    portalUrl: string,
    params: Record<string, unknown>
  ) => Promise<OAuthTokenResponse>;
}

export interface RefreshResult {
  accessToken: string;
  expires: number;
}

function defaultExec(command: string): string {
  return execSync(command, { encoding: 'utf-8' });
}

// Portal answers an expired/invalid refresh token in several shapes; recognizing
// them lets `token refresh` exit 2 (re-connect needed) instead of a generic 1.
function isExpiredRefreshError(error: OAuthTokenError): boolean {
  if (error.code === 498 || error.code === 499) return true;
  const text =
    `${error.error ?? ''} ${error.error_description ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (text.includes('invalid_grant')) return true;
  return (
    text.includes('refresh') &&
    (text.includes('invalid') || text.includes('expired'))
  );
}

function oauthErrorMessage(error: OAuthTokenError): string {
  const detail =
    error.error_description || error.message || error.error || 'unknown error';
  return error.code != null
    ? `OAuth error ${error.code}: ${detail}`
    : `OAuth error: ${detail}`;
}

// Mint a fresh access token from the stored OAuth credentials and persist it
// (plus its expiry meta, and any rotated refresh token). Returns the token and
// its expiry; never prints - callers decide what to report.
export async function performRefresh(
  deps: RefreshDeps = {}
): Promise<RefreshResult> {
  const config = loadOAuth();
  if (!config) {
    throw new ArcqError('no OAuth credentials - run: arcq token connect', 1);
  }

  const exec = deps.exec ?? defaultExec;
  const request = deps.request ?? requestOAuthToken;

  // A configured command wins over a stored refresh token.
  let refreshToken: string;
  if (config.refreshTokenCommand) {
    let out: string;
    try {
      out = exec(config.refreshTokenCommand);
    } catch (err) {
      const stderr = (err as { stderr?: Buffer | string } | null)?.stderr;
      const detail =
        (stderr != null ? String(stderr) : '').trim() ||
        (err instanceof Error ? err.message : String(err));
      throw new ArcqError(`refresh command failed: ${detail}`, 1);
    }
    refreshToken = refreshTokenFrom(out);
  } else if (config.refreshToken) {
    refreshToken = config.refreshToken;
  } else {
    throw new ArcqError(
      'OAuth credentials have no refresh token or command - run: arcq token connect',
      1
    );
  }

  const res = await request(config.portalUrl, {
    client_id: config.appId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    f: 'json',
  });

  if (res.error) {
    if (isExpiredRefreshError(res.error)) {
      throw new ArcqError('refresh token expired - run: arcq token connect', 2);
    }
    throw new ArcqError(oauthErrorMessage(res.error), 1);
  }
  if (!res.access_token) {
    throw new ArcqError('OAuth token endpoint returned no access_token', 1);
  }

  const expires = Date.now() + (res.expires_in ?? 0) * 1000;
  setTokenValue(res.access_token);
  // The portal that minted the token is the authority it is valid for, so
  // record it rather than carrying a stale host forward from the old meta.
  const host = hostOf(config.portalUrl);
  saveTokenMeta(host ? { expires, host } : { expires });

  // Persist a rotated refresh token - but never when a command owns the secret,
  // so arcq keeps writing only the short-lived access token to disk.
  if (res.refresh_token && !config.refreshTokenCommand) {
    saveOAuth({ ...config, refreshToken: res.refresh_token });
  }

  return { accessToken: res.access_token, expires };
}

export function isOAuthConfigured(): boolean {
  return loadOAuth() !== null;
}

// Run an operation with the current token; if it fails with the expired/invalid
// token contract (exit 2) and OAuth is configured, silently refresh once and
// retry exactly once. A single attempt guards against refresh/retry loops.
export async function withTokenRetry<T>(
  op: (token: string | null) => Promise<T>,
  deps: RefreshDeps = {}
): Promise<T> {
  try {
    return await op(getToken());
  } catch (err) {
    if (err instanceof ArcqError && err.exitCode === 2 && loadOAuth()) {
      await performRefresh(deps);
      return op(getToken());
    }
    throw err;
  }
}
