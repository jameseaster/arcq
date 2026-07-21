# Changelog

## [1.0.0] - 2026-07-21

Initial public release.

### Commands

- `arcq query <layer> "<where>"` - query a layer and print feature attributes as a JSON array, with automatic pagination; `arcq <layer> "<where>"` shorthand. Shaping flags: `--out-fields`, `--limit`, `--count`, `--order-by`, `-q`/`--quiet`.
- `arcq services add <name> <url>` - register a named FeatureServer/MapServer service.
- `arcq refresh` / `arcq sync` - index every configured service's catalog and generate `servicename-layername` shortcuts.
- `arcq use [name]` - select the active layer, interactively (fzf) or by name; `arcq active` prints the selection.
- `arcq fields [layer]` - field metadata as JSON; `arcq layers` and `arcq list <service>` for discovery.
- `arcq token set` / `arcq token show` - manage the auth token, stored at `~/.arcq-token` with mode `600`.
- `arcq version` / `--version` / `-V`.

### Design contract

- Exit codes: `0` success (an empty `[]` result is success), `1` error, `2` token invalid or expired. ArcGIS hides failures inside HTTP-200 bodies; arcq surfaces every one of them and exits non-zero.
- stdout carries only JSON results; summaries, warnings, and errors go to stderr, so piping to `jq` always works.
- TLS certificates are verified by default. For trusted servers with self-signed or private-CA certificates, opt in to relaxed verification with `--insecure`, `ARCQ_INSECURE=1`, or `"insecure": true` in `~/.arcq.json` (scoped to arcq's own requests; prints a stderr warning).
- Requests are sent as `POST` with form-encoded bodies, so the token never appears in a URL.

### Agent support

- Ships an installable agent skill at `skills/arcq/SKILL.md` covering discovery, the where-clause quoting rule, output shaping, the exit-code contract, and TLS behavior.
