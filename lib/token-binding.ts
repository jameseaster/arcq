import { loadTokenMeta } from './token-core.js';

// arcq attaches the stored access token to every request it makes. Without a
// record of which authority issued that token, querying a service on another
// host sends an enterprise portal's credential to that host - the user needs
// only to run an ordinary query for it to happen.
//
// This module owns the decision of whether the token may go to a given URL.
// The comparison is on hostname, not host: ArcGIS deployments routinely front
// portal and server on different ports of the same machine, and treating those
// as separate authorities would drop the token on a legitimate same-host setup.

// Hostname of a URL, lowercased, or undefined when it will not parse. Also
// accepts a bare hostname so `token set --host portal.example.com` works.
export function hostOf(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    // Not a URL - accept a bare hostname, but not a path or an empty label.
    if (/^[a-z0-9.-]+$/i.test(trimmed)) return trimmed.toLowerCase();
    return undefined;
  }
}

// Mirrors tls-core's insecure switch: resolved once per invocation in run(),
// then read by the request path.
let allowCrossHost = false;

export function setAllowCrossHost(enabled: boolean): void {
  allowCrossHost = enabled;
}

export function isCrossHostAllowed(): boolean {
  return allowCrossHost;
}

// Warnings are per-invocation, not per-request: a paginated query makes many
// requests and should not repeat itself once per page.
let warnedCrossHost = false;
let warnedUnboundToken = false;

// Exported for tests, which run many invocations inside one process.
export function resetBindingNotices(): void {
  warnedCrossHost = false;
  warnedUnboundToken = false;
  allowCrossHost = false;
}

// The token to send to `url`, or null to send none. Failing open to an
// anonymous request is deliberate: many ArcGIS services are readable without a
// token, so dropping it lets those calls succeed, and the ones that do need
// auth fail with the server's own message rather than an arcq-invented error.
export function tokenForUrl(url: string, token: string | null): string | null {
  if (!token) return token;

  const meta = loadTokenMeta();
  const boundHost = meta?.host;

  if (!boundHost) {
    if (!warnedUnboundToken) {
      warnedUnboundToken = true;
      console.error(
        '[arcq] hint: this token has no recorded host, so arcq cannot keep it ' +
          'from reaching other hosts - run: arcq token set --host <host> ' +
          '(or arcq token connect)'
      );
    }
    return token;
  }

  const targetHost = hostOf(url);
  if (targetHost === boundHost) return token;

  // An unparseable target is treated as cross-host, not waved through: a
  // destination arcq cannot name is not one it should hand a credential to.
  const target = targetHost ?? `an unrecognized destination (${url})`;

  if (allowCrossHost) {
    if (!warnedCrossHost) {
      warnedCrossHost = true;
      console.error(
        `[arcq] WARNING: sending a token issued for ${boundHost} to ` +
          `${target} (--allow-cross-host)`
      );
    }
    return token;
  }

  if (!warnedCrossHost) {
    warnedCrossHost = true;
    console.error(
      `[arcq] omitting the token: it was issued for ${boundHost}, not ` +
        `${target}. Re-run with --allow-cross-host to send it anyway.`
    );
  }
  return null;
}
