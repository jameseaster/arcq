# Changelog

## [1.2.0] - 2026-08-26

Two credential-safety fixes. Neither is remotely exploitable - both required
only ordinary use to leak a token to a host that had no business seeing it.

### Fixed

- **A token minted for one portal is no longer sent to unrelated hosts.** arcq
  attached the stored access token to every request without checking that the
  token had been issued by the host being queried, so pointing it at a public
  ArcGIS Online service while an enterprise portal token was configured sent
  that credential to `services.arcgis.com` - which did not need one, the
  endpoint being anonymously readable. A token now records the host it was
  issued for, and arcq omits it on requests anywhere else, continuing
  anonymously rather than failing. Enforcement lives in the single HTTP choke
  point every request already passes through.
- **`ARCQ_CONFIG` isolated only the config file, not the rest of arcq's
  state.** The other five state files - context, cache, token, OAuth
  credential, and token metadata - were bound to the home directory at module
  load, so no environment variable could move them. Working with two portals
  side by side was impossible, and the token file was shared between them.
- **`arcq query` and `arcq fields` rejected `service:id`**, which `arcq use`
  has always accepted and `arcq --help` documents. The same identifier now
  resolves in all three, without needing a prior `arcq refresh`. An unknown
  name also suggests across service keys, not just layer keys.

### Added

- `ARCQ_HOME` - one directory holding a complete, independent set of arcq
  state, so two portals can be used side by side without one's token reaching
  the other. Created on first write with mode `700`. `ARCQ_CONFIG` keeps its
  exact meaning and still takes precedence for the config file alone.
- `arcq token set --host <host>` records the host a manually pasted token
  belongs to. Omitted, the host is inferred when every service in the config
  shares one. `arcq token connect` and `arcq token refresh` record it from the
  portal automatically.
- `arcq token show` reports the bound host.
- `--allow-cross-host`, `ARCQ_ALLOW_CROSS_HOST=1`, and `"allowCrossHost": true`
  send the token to hosts it was not issued for, for deployments that
  legitimately share one. Same three-tier precedence as `--insecure`, and each
  prints a stderr warning so the override is never silent.

### Changed

- The unknown-layer error now names `<service>:<id>` as well as the
  `arcq layers --names` hint, and `arcq --help` gains a `Layer arguments:`
  section listing the three accepted forms in resolution order.

### Upgrading

Nothing breaks. With neither `ARCQ_HOME` nor `ARCQ_CONFIG` set, every state
path is byte-identical to 1.1.1. A token stored by an older arcq has no
recorded host and keeps working exactly as before, with a one-time stderr
hint, until you re-run `arcq token connect` or `arcq token set --host`.

## [1.1.1] - 2026-08-13

### Fixed

- `arcq token connect` and the docs now read the `esriJSAPIOAuth` blob from
  session storage or local storage. ArcGIS JS API apps store the credential in
  whichever one matches how they signed in, so the old localStorage-only
  snippet returned `null` for a whole class of portals.
- Aligned the `token set` row in `arcq --help` with the rest of the table.

## [1.1.0] - 2026-07-30

### Added

- OAuth refresh-token support, so secured-portal users stop re-pasting short-lived tokens. `arcq token connect` stores a refresh credential once - from a pasted `esriJSAPIOAuth` blob, a bare refresh token, or a `--command` credential helper (1Password, `pass`, Keychain) that keeps the secret in your secret manager. Works with IWA/SAML/PKI portals, since the web app already performed the sign-in.
- `arcq token refresh` - mint a fresh access token on demand from the stored credential.
- Automatic refresh: `arcq query`, `arcq list`, and `arcq fields` transparently refresh once and retry when they hit an expired token (exit code `2`) and OAuth is configured.
- New state files `~/.arcq-oauth.json` (refresh credential) and `~/.arcq-token-meta.json` (access-token expiry), both written mode `600`. The refresh token is never printed by any command.

### Changed

- `arcq token set` now prompts for the token when it is omitted, so the secret no longer has to land in shell history; passing it as an argument still works.
- `arcq token show` now reports the access-token expiry and whether refresh is configured (portal origin only, never the token), on stderr so `$(arcq token show)` stays scriptable.
- The exit-code `2` guidance and error message now point at `arcq token refresh` as well as `arcq token set`.

## [1.0.1] - 2026-07-21

### Changed

- The npm package now ships `skills/arcq/SKILL.md`, so the agent skill can be installed from a global npm install (`cp -r "$(npm root -g)/@leverstack/arcq/skills/arcq" ~/.claude/skills/`) without cloning the repo. The README documents both install paths.

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
