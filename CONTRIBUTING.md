# Contributing to arcq

Thanks for your interest in improving arcq. Issues and pull requests are
welcome.

## Getting set up

Prerequisites: [Node.js](https://nodejs.org/) 18 or newer.

```bash
git clone https://github.com/jameseaster/arcq.git
cd arcq
npm install     # installs deps and compiles TypeScript -> dist/
npm link        # optional: put your working copy's `arcq` on PATH
```

arcq runs from compiled output in `dist/`, so rebuild after editing source:

```bash
npm run build
```

## Development workflow

```bash
npm test             # run the test suite (Mocha, runs the .ts sources via tsx)
npm run typecheck    # type-check source + tests without emitting
npm run lint         # ESLint; CI enforces zero warnings
npm run format       # Prettier
```

All four must pass before a PR can merge - CI runs them (plus a build)
across Node 18, 20, 22, and 24.

## Guidelines

- **Add or update tests with every behavior change.** Each `lib/*.ts` module
  has a matching `test/*.test.ts`.
- **Keep stdout clean.** Query results are the only thing arcq prints to
  stdout; everything human-readable (summaries, warnings, errors) goes to
  stderr. Scripts and agents depend on this contract.
- **Preserve the exit-code contract** (`0` success, `1` error, `2` token) -
  it is part of the public API, as is loud failure on the errors ArcGIS
  hides inside HTTP-200 bodies.
- **TypeScript strict mode**, no `any` unless there is no alternative.
- Match the existing code style; Prettier settles formatting arguments.

## Reporting bugs

Open an issue at <https://github.com/jameseaster/arcq/issues> with the
command you ran, what you expected, and what happened (redact tokens and
internal hostnames from any output you paste). For anything
security-sensitive, please use GitHub's private vulnerability reporting on
the repository instead of a public issue.

## Releases

Maintainers handle versioning and npm publishing; see `RELEASING.md`.
