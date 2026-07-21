import https from 'https';

// Owns arcq's TLS decision. By default no custom agent is used, so axios
// performs full certificate verification. Insecure mode is opt-in and only
// ever scopes the relaxed agent to arcq's own requests - it never touches
// NODE_TLS_REJECT_UNAUTHORIZED (which would disable verification
// process-wide).
let insecureAgent: https.Agent | undefined;

export function setInsecureTls(enabled: boolean): void {
  insecureAgent = enabled
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;
}

// The agent arcgis-core should attach to a request, or undefined on the
// secure path (let axios use its verifying default).
export function getHttpsAgent(): https.Agent | undefined {
  return insecureAgent;
}

// Node's TLS error codes for an untrusted/invalid server certificate.
const TLS_ERROR_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_UNTRUSTED',
  'CERT_NOT_YET_VALID',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// If `error` is a TLS certificate failure, return a friendly message naming
// the host and the --insecure escape hatch; otherwise null (not a TLS error).
export function tlsErrorMessage(error: unknown, url: string): string | null {
  const code = (error as { code?: string } | null)?.code;
  if (!code || !TLS_ERROR_CODES.has(code)) return null;

  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // fall back to the raw url in the message
  }

  return (
    `TLS certificate verification failed for ${host}. If this is a ` +
    `trusted server with a self-signed certificate, re-run with ` +
    `--insecure or set "insecure": true in ~/.arcq.json.`
  );
}
