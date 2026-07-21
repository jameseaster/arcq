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

- `<layer>` is a config shortcut (see `arcq layers --names`) or a raw URL.
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
- `2` - token missing, invalid, or expired. Ask the user to run
  `arcq token set <token>`, then retry.

## TLS

Certificates are verified by default. If a query fails with a TLS
certificate error, the server's chain is not publicly trusted (self-signed
or private CA). Do not silently disable verification - tell the user; for a
server they trust, they can opt in with `--insecure`, `ARCQ_INSECURE=1`, or
`"insecure": true` in `~/.arcq.json`. When insecure mode is already active
you will see one stderr line per invocation
(`[arcq] WARNING: TLS certificate verification is disabled`) - that is
expected, not a failure.
