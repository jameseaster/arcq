---
name: arcq
description: Query ArcGIS feature services from the command line with arcq. Use when exploring, testing, or verifying data behind any ArcGIS FeatureServer or MapServer layer - discover layers and fields, run bounded SQL queries, and branch on a strict exit-code contract instead of parsing prose.
---

# arcq

`arcq` queries ArcGIS REST services directly, so you can prove what the data
actually is instead of trusting a UI, a cached response, or passing tests.
stdout is always pure JSON; human-readable summaries go to stderr.

## Discovery (don't guess)

Never guess layer or field names - look them up first:

- `arcq layers --names` - the configured layer shortcuts
- `arcq fields <layer>` - field names, types, aliases as JSON
- `arcq list <service-or-url>` - layer ids and names in a service
- `arcq active` - the currently selected layer (exit 0 even if none)

If no layers are configured yet, set them up once:

```bash
arcq services add <name> <FeatureServer-url>
arcq refresh && arcq sync    # index the catalog, generate layer shortcuts
```

## Querying

```bash
arcq query <layer> "<where>" --out-fields a,b,c --limit 20 --quiet
```

- `<layer>` is a config shortcut (see `arcq layers --names`), `<service>:<id>`
  against a configured service (see `arcq services`), or a raw URL. `query`,
  `fields`, and `use` all accept the same three forms - no `arcq refresh` is
  needed for the `<service>:<id>` form.
- **Quoting rule:** the `where` clause is ArcGIS SQL, and string literals
  need SINGLE quotes inside the double-quoted shell argument:
  `arcq query parcels "STATUS = 'ACTIVE'"`. Double-quoted literals are an
  ArcGIS syntax error (exit 1).
- Keep output bounded: `--limit <N>` caps rows, `--count` returns only
  `{"count":N}`, `--out-fields` trims columns, `--order-by "<field> DESC"`
  sorts server-side.
- `--quiet` suppresses the stderr summary; stdout stays clean JSON either
  way, so piping to `jq` always works.

## Exit codes (branch on these)

- `0` - success. An empty `[]` is a real, trustworthy answer, not an error:
  arcq surfaces the failures ArcGIS hides inside HTTP-200 bodies.
- `1` - error (bad where clause, unknown layer, server failure). The message
  on stderr says what went wrong; unknown layer names include closest-match
  suggestions.
- `2` - token missing, invalid, or expired. First run `arcq token refresh`
  and retry the command - if OAuth refresh is set up (see below) this mints a
  fresh token with no user interaction. Only if `arcq token refresh` also
  fails (it exits 2 with a `run: arcq token connect` hint when the refresh
  credential itself has expired, or exits 1 when none is configured) should you
  ask the user to run `arcq token connect` or `arcq token set <token>`.

## OAuth refresh setup (optional, removes token friction)

Access tokens on secured portals are short-lived, so instead of re-pasting one
each time the user can connect a refresh credential once:

```bash
arcq token connect    # paste the esriJSAPIOAuth blob from an ArcGIS web app
```

The blob comes from the browser DevTools console on any ArcGIS web app the user
is signed into. The app stores it in session or local storage depending on how
it signed in, so the line checks both:

```js
copy(
  sessionStorage.getItem('esriJSAPIOAuth') ??
    localStorage.getItem('esriJSAPIOAuth')
);
```

This works for IWA/SAML/PKI portals too, because the web app already performed
the sign-in.

For a setup where the secret never touches arcq's files, point it at a
credential-helper command that prints the refresh token:

```bash
arcq token connect --command 'op read op://Vault/arcgis/refresh-token'
```

Once connected, `arcq token refresh` mints a fresh access token on demand, and
query/list/fields commands auto-refresh once on an exit-2 before giving up.
`arcq token show` reports the token expiry and whether refresh is configured
(never the refresh token itself). Use `example.com` hosts and placeholder ids
when demonstrating this to a user.

## Token host binding

The stored token is bound to the host it was issued for. On a request to any
other host arcq omits the token and continues anonymously, printing
`[arcq] omitting the token: it was issued for <host>, not <other>` on stderr.
That line is the binding working, not a failure - if the service is public the
command still succeeds. If the user genuinely needs one token across hosts,
tell them about `--allow-cross-host` (or `ARCQ_ALLOW_CROSS_HOST=1`, or
`"allowCrossHost": true`); do not reach for it just to silence the message.

A token with no recorded host draws a one-time hint instead and is still sent -
that means it predates the binding, and `arcq token set --host <host>` or
`arcq token connect` fixes it. `arcq token show` reports the bound host.

## State directory

arcq's config, context, cache, token, OAuth credential, and token-expiry files
all live in the user's home directory unless `ARCQ_HOME` points at another
directory, which holds a complete independent set. A user working with more
than one portal should have one directory per portal - without that, the token
stored for one portal is sent to whatever host the queried service lives on.
`ARCQ_CONFIG` overrides the config file alone and wins over `ARCQ_HOME`; it
does not isolate the token.

## TLS

Certificates are verified by default. If a query fails with a TLS
certificate error, the server's chain is not publicly trusted (self-signed
or private CA). Do not silently disable verification - tell the user; for a
server they trust, they can opt in with `--insecure`, `ARCQ_INSECURE=1`, or
`"insecure": true` in `~/.arcq.json`. When insecure mode is already active
you will see one stderr line per invocation
(`[arcq] WARNING: TLS certificate verification is disabled`) - that is
expected, not a failure.
