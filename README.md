# arcq

[![CI](https://github.com/jameseaster/arcq/actions/workflows/lint-and-test.yml/badge.svg)](https://github.com/jameseaster/arcq/actions/workflows/lint-and-test.yml)
[![npm version](https://img.shields.io/npm/v/%40leverstack%2Farcq)](https://www.npmjs.com/package/@leverstack/arcq)

A fast CLI for querying ArcGIS feature services, designed to be driven by both humans and coding agents.

## Why arcq

ArcGIS REST is awkward to drive from a terminal or a script: query strings are fiddly, failures hide inside HTTP-200 response bodies, and discovering what layers and fields exist usually means clicking through a services directory. arcq is built to be scripted and, in particular, to be safe for a coding agent to run unattended:

- **Strict exit-code contract.** `0` success (an empty `[]` result is success, not an error), `1` error, `2` token invalid or expired. An agent can branch on the exit code instead of parsing prose.
- **JSON-only stdout.** Query results are the only thing on stdout, so `arcq query ... | jq` always works. The human-readable query summary goes to stderr.
- **Loud errors.** ArcGIS reports failures (a malformed `where` clause, an expired token) inside HTTP-200 bodies; arcq inspects every response and exits non-zero, so a `[]` you see is trustworthy.
- **Non-interactive discovery.** `arcq layers --names`, `arcq active`, `arcq fields`, and `arcq list` expose the catalog and schema without the fzf picker, so an agent can find its way around a server on its own.
- **One-command setup for a whole server.** `arcq refresh && arcq sync` indexes every service in your config and turns each layer into a named shortcut.

## Installation

**Prerequisites**

- [Node.js](https://nodejs.org/) **18 or newer**
- [`fzf`](https://github.com/junegunn/fzf) - only needed for the interactive `arcq use` picker

Install globally from npm:

```bash
npm install -g @leverstack/arcq
```

`arcq` is now on your PATH (the package is scoped; the command is still `arcq`).

### From source

```bash
git clone https://github.com/jameseaster/arcq.git
cd arcq
npm install          # installs deps AND compiles TypeScript -> dist/ (via the "prepare" script)
npm install -g .     # put `arcq` on your PATH (also recompiles dist/ automatically)
```

You do **not** need to create any symlink by hand; `npm install -g .` (or `npm link` below) does that for you.

> **arcq is written in TypeScript and runs from compiled output in `dist/`.** The
> `npm run build` step (`tsc`) is wired into npm's `prepare` lifecycle, so it runs
> automatically on `npm install`, `npm install -g .`, and `npm link` - you normally
> never invoke it directly. The one exception is development (see below): after
> editing any `.ts` source you must rebuild for the global command to pick it up.

**Local development**

Link the working tree instead of installing a copy:

```bash
npm link             # also runs the build via "prepare"
```

Because the linked `arcq` runs the compiled `dist/`, **rebuild after editing source**:

```bash
npm run build        # recompile dist/ so the global `arcq` reflects your changes
```

Handy scripts:

```bash
npm run build        # compile TypeScript -> dist/
npm run typecheck    # type-check source + tests without emitting
npm test             # run the test suite
npm run lint         # lint
```

## Using arcq with coding agents

The repo ships a ready-made [Agent Skill](skills/arcq/SKILL.md) covering discovery, the quoting rule, output shaping, the exit-code contract, and TLS behavior. For Claude Code, install it with:

```bash
cp -r skills/arcq ~/.claude/skills/
```

(Any agent that reads markdown instructions can use the same file.)

Prefer something lighter? Drop this into your agent's instructions (e.g. a `CLAUDE.md`) to teach it the workflow:

```markdown
## Querying ArcGIS with arcq

- Discover configured layers: `arcq layers --names`
- Inspect a layer's schema: `arcq fields <layer>`
- Query data: `arcq query <layer> "<where>" --quiet`
- `where` is ArcGIS SQL; string literals need SINGLE quotes, so double-quote
  the shell argument: `arcq query parcels "STATUS = 'ACTIVE'" --quiet`
- Keep output small: `--limit <N>` caps rows, `--count` returns `{"count":N}`,
  `--out-fields a,b,c` returns only those fields.
- stdout is pure JSON (pipe to `jq`); the summary goes to stderr.
- Exit codes: 0 = success (an empty `[]` is a valid answer), 1 = error,
  2 = token invalid/expired (fix with `arcq token set <token>`).
```

## Security

arcq **verifies TLS certificates by default.** Requests to a server with an untrusted or invalid certificate fail with a clear error naming the host.

Some ArcGIS deployments (typically local or on-premises servers) use self-signed certificates. For those trusted hosts you can disable certificate verification, in order of precedence:

1. the `--insecure` flag on any command: `arcq --insecure list my-service`
2. the `ARCQ_INSECURE=1` environment variable
3. `"insecure": true` at the top level of `~/.arcq.json`

When insecure mode is active, arcq prints a single warning to stderr on every invocation:

```
[arcq] WARNING: TLS certificate verification is disabled
```

Verification is relaxed only for arcq's own requests (via a scoped `https.Agent`); it never sets `NODE_TLS_REJECT_UNAUTHORIZED` process-wide. Only use insecure mode against trusted hosts on trusted networks.

Two more hardening details:

- The auth token is stored at `~/.arcq-token` with file mode `600` (owner read/write only).
- Requests are sent as HTTP `POST` with form-encoded bodies, so the token is never placed in a URL query string where it would land in server or proxy access logs.

## Configuration

arcq reads a JSON config file from `~/.arcq.json` by default. Override the path with the `ARCQ_CONFIG` environment variable.

```json
{
  "services": {
    "my-service": "https://example.com/arcgis/rest/services/MyService/FeatureServer"
  },
  "layers": {
    "parcels": "https://example.com/arcgis/rest/services/MyService/FeatureServer/0"
  }
}
```

- **`services`** - named shortcuts used by `arcq list` and `arcq refresh`
- **`layers`** - named shortcuts used by `arcq query <layer>`
- **`insecure`** - optional; set to `true` to disable TLS verification (see [Security](#security))

`services` and `layers` both accept a raw URL in place of a name.

## Authentication

```bash
arcq token set <token>  # save a token to ~/.arcq-token (mode 600)
arcq token show  # print the stored token
```

If a token is stored it is sent with every request. Unauthenticated services work without one. The token is sent in the request body, not the URL.

## Commands

### `arcq services add <name> <url>`

Add a named service to the config. Creates `~/.arcq.json` if it doesn't exist yet.

```bash
arcq services add my-service https://example.com/arcgis/rest/services/MyService/FeatureServer
```

### `arcq refresh`

Fetches the layer/table catalog for every service in the config and writes it to `~/.arcq-cache.json`. Run this once after updating the config, and again whenever services change.

```bash
arcq refresh
```

### `arcq use [name]`

Selects the _active layer_ (saved to `~/.arcq-context.json`), used by subsequent `arcq query` and `arcq fields` calls.

With no argument, opens an interactive [fzf](https://github.com/junegunn/fzf) picker over the cached catalog (requires `fzf` on your `PATH`):

```bash
arcq use
# [arcq] active layer set → Parcels
```

With a name, selects non-interactively. The name is resolved in this order, first match wins:

1. a config layer key (`my-service-parcels`)
2. a cached `service:id` pair (`my-service:0`)
3. an exact cached layer name (`Parcels`) - if the same name exists in multiple services, arcq errors and lists the qualified candidates

```bash
arcq use my-service-parcels
arcq use my-service:0
arcq use Parcels
```

An unknown name exits 1 with closest-match suggestions.

### `arcq active`

Prints the active layer and its URL, or a `no active layer` line if none is set (exit 0 either way - absence is a valid answer).

```bash
arcq active
# my-service:0 → Parcels
# https://example.com/arcgis/rest/services/MyService/FeatureServer/0
```

### `arcq fields [layer]`

Prints a layer's field metadata as a JSON array of `{name, type, alias, length}`. Defaults to the active layer; accepts a config layer name or raw URL.

```bash
arcq fields
arcq fields my-service-parcels
# [
#   { "name": "OBJECTID", "type": "esriFieldTypeOID", "alias": "OBJECTID" },
#   { "name": "STATUS", "type": "esriFieldTypeString", "alias": "Status", "length": 50 },
#   ...
# ]
```

### `arcq query`

Query a layer and print feature attributes as a JSON array. Results are automatically paginated (1000 records per page).

```bash
# Query the active layer
arcq query "1=1"
arcq query "AREA > 1000"

# Query a named layer from config
arcq query parcels "1=1"

# Query a raw layer URL
arcq query https://example.com/.../FeatureServer/0 "STATUS = 'ACTIVE'"

# Shorthand - layer name or URL as the first argument
arcq parcels "1=1"
```

Output is a JSON array of attribute objects:

```json
[
  { "OBJECTID": 1, "AREA": 2048, "STATUS": "ACTIVE" },
  ...
]
```

A layer argument must be a config layer name or contain `://` to be treated as a raw URL - an unknown name exits 1 with closest-match suggestions instead of being sent as a URL. ArcGIS string literals use **single quotes** (double-quote the shell argument): `"STATUS = 'ACTIVE'"` works, `"STATUS = \"ACTIVE\""` is an ArcGIS syntax error and exits 1.

#### Query flags

```bash
arcq query --out-fields OBJECTID,STATUS "1=1"   # return only the listed fields
arcq query --limit 50 "1=1"                     # stop after 50 rows
arcq query --count "1=1"                        # print {"count":N} only
arcq query --order-by "NAME DESC" "1=1"         # sort server-side
```

`--count` makes a single `returnCountOnly` request; `--out-fields` and `--limit` are ignored when combined with it.

#### Global flags

`--insecure` is valid on any command and disables TLS certificate verification for arcq's own requests (see [Security](#security)).

#### Query summary

By default `arcq query` prints a short summary of what it queried to **stderr** - the resolved layer, the `where` clause, and the exact endpoint:

```
────────────────────────────────────────────────────────
layer:    my-service:0 → Parcels
where:    STATUS = 'ACTIVE'
endpoint: https://example.com/.../FeatureServer/0/query
────────────────────────────────────────────────────────
```

Because it goes to stderr, it never contaminates the JSON on stdout - `arcq query "1=1" | jq` works unchanged. Pass `-q` / `--quiet` to suppress it (useful in scripts):

```bash
arcq query "1=1" --quiet      # JSON only, no summary
```

### `arcq sync`

Fetches the layer/table catalog for every service in the config and rewrites the `layers` section of `~/.arcq.json` with auto-generated keys in the form `servicename-layername` (lowercase, hyphenated). Existing `layers` entries are overwritten.

```bash
arcq sync
# [arcq] syncing my-service...
# [arcq] config layers updated
```

After syncing you can query any layer by its generated name:

```bash
arcq query my-service-parcels "1=1"
```

### `arcq layers`

List all named layers currently in the config.

```bash
arcq layers
# my-service-parcels → https://example.com/.../FeatureServer/0
# my-service-roads   → https://example.com/.../FeatureServer/1

arcq layers --names
# my-service-parcels
# my-service-roads
```

### `arcq list <service>`

List all layers and tables in a service, showing their IDs and names.

```bash
arcq list my-service
# 0 → Parcels
# 1 → Addresses
# 2 → Boundaries

# Or use a raw URL
arcq list https://example.com/arcgis/rest/services/MyService/FeatureServer
```

### `arcq version`

Print the arcq version (also `--version` / `-V`).

## Exit codes

| Code | Meaning                                                                            |
| ---- | ---------------------------------------------------------------------------------- |
| 0    | success - an empty `[]` result is a real answer, not an error                      |
| 1    | error: bad where clause, unknown layer, no active layer, server or request failure |
| 2    | token invalid or expired - run `arcq token set`                                    |

Errors print `error: <message>` to stderr. ArcGIS reports failures inside HTTP-200 response bodies; arcq surfaces those as errors instead of printing `[]`.

## Typical workflow

```bash
# 1. Add services to ~/.arcq.json
# 2. Populate the fzf cache and named layer shortcuts
arcq refresh && arcq sync

# 3a. Pick a layer interactively
arcq use

# 3b. Or query a named layer directly
arcq query my-service-parcels "STATUS = 'ACTIVE'" | jq '.[0]'
```

## Contributing

Bug reports and pull requests are welcome - see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
