import { resolveConfigPath, resolveStateDir } from './paths-core.js';

export default function helpCmd(): void {
  console.log(`
arcq - ArcGIS query CLI

Usage:
  arcq refresh                       Fetch and cache all service catalogs
  arcq sync                          Rewrite config layers from all services (servicename-layername keys)
  arcq use                           Select the active layer interactively (requires fzf)
  arcq use <name>                    Select the active layer by config key, service:id, or cached layer name (first match wins)
  arcq active                        Print the active layer and its URL
  arcq query <where>                 Query the active layer
  arcq query <layer> <where>         Query a named layer or raw URL
  arcq <layer> <where>               Shorthand for query
  arcq fields [layer]                Print layer field metadata as JSON (default: the active layer)
  arcq list <service>                List layers/tables in a service or URL
  arcq layers                        List named layers in the config (--names for keys only)
  arcq services add <name> <url>     Add a named service to the config
  arcq token set [<token>]           Save an auth token (prompts when omitted)
  arcq token show                    Print the stored token, its expiry, and refresh status
  arcq token connect                 Set up OAuth refresh from an esriJSAPIOAuth blob or refresh token
  arcq token connect --command <cmd> Set up OAuth refresh via a credential-helper command
  arcq token refresh                 Mint a fresh access token from stored OAuth credentials
  arcq version, --version, -V        Print the arcq version
  arcq --help, -h                    Show this help

Global flags:
  --insecure                         Disable TLS certificate verification for arcq's own requests
                                     (trusted self-signed servers only; prints a stderr warning).
                                     Also settable via ARCQ_INSECURE=1 or "insecure": true in the config.

Query flags:
  -q, --quiet                        Suppress the query summary (layer/where/endpoint) on stderr
  --out-fields <a,b,c>               Return only the listed fields (default: all)
  --limit <N>                        Stop after N rows
  --count                            Print {"count":N} only (--out-fields and --limit are ignored)
  --order-by <expr>                  Sort server-side, e.g. --order-by "NAME DESC"

Where clauses:
  ArcGIS string literals use SINGLE quotes; double-quote the shell argument:
    arcq query parcels "STATUS = 'ACTIVE'"
  "STATUS = \\"ACTIVE\\"" is an ArcGIS syntax error and exits 1.

Exit codes:
  0  success - an empty [] result is a real answer, not an error
  1  error (bad where clause, unknown layer, no active layer, server error)
  2  token invalid or expired - run: arcq token set or arcq token refresh

Examples:
  arcq refresh && arcq sync
  arcq use my-service-parcels
  arcq active
  arcq fields
  arcq query "AREA > 1000"
  arcq query --count "1=1"
  arcq query --limit 5 --out-fields OBJECTID,STATUS "STATUS = 'ACTIVE'"
  arcq parcels "1=1"

State directory:
  ${resolveStateDir()} (override with ARCQ_HOME env var)

  Holds .arcq.json, .arcq-context.json, .arcq-cache.json, .arcq-token,
  .arcq-oauth.json, and .arcq-token-meta.json. Point ARCQ_HOME at a separate
  directory per portal to keep one portal's token from reaching another.

Config:
  ${resolveConfigPath()} (override with ARCQ_CONFIG env var, which wins over ARCQ_HOME)

  {
    "services": { "my-service": "https://example.com/.../FeatureServer" },
    "layers":   { "parcels":    "https://example.com/.../FeatureServer/0" }
  }

  Service and layer values accept a raw URL in place of a name.

Output:
  query prints a JSON array of feature attributes, paginated automatically.
  fields prints a JSON array of {name,type,alias,length}.
`);
}
