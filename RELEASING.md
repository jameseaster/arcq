# Releasing arcq

arcq is a local CLI: the volta shim on PATH executes this repo's gitignored
`dist/` directly, so **`npm run build` is the ship step**. A release is a
version bump, a changelog entry, a push to `main`, a rebuilt `dist/`, and a
git tag marking exactly what shipped.

`package.json` `"version"` is the single source of truth - `arcq version`
reads it at runtime (via `lib/version-cmd.ts`), so bumping it updates the CLI
too.

## 1. Prepare the version

```bash
cd ~/dev/cli-tools/arcq
git checkout main && git pull origin main   # start from a clean, current main

npm run bump <major|minor|patch>            # updates package.json (+ lock)
```

Add a dated `X.Y.Z` section to `CHANGELOG.md` describing the changes (call
out any behavior breaks plainly), then commit:

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "Release X.Y.Z."
```

## 2. Verify, push, and ship

```bash
npm run lint && npm run typecheck && npm test
git push origin main
npm run build                               # the shim runs dist/ - this IS the deploy
```

Smoke-check through the shim: `arcq --version` should print the new version.

## 3. Tag the shipped commit

```bash
npm run release:tag -- --dry-run   # preview the tag and its target commit
npm run release:tag                # create and push the X.Y.Z tag
```

`release:tag` refuses if the working tree is dirty or HEAD is not on
`origin/main`, so the tag always marks a commit the release was actually cut
from.
