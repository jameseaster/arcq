# Releasing arcq

A release is: a version bump + changelog entry on `main`, a green CI run, an
annotated `vX.Y.Z` tag, a GitHub Release, and an `npm publish`.

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

## 2. Verify and push

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm pack --dry-run                          # sanity-check the tarball contents
git push origin main
```

Wait for the CI run on `main` to go green before tagging - the tag should
mark a commit that provably passed the full matrix.

## 3. Tag and cut the GitHub Release

```bash
npm run release:tag -- --dry-run   # preview the tag and its target commit
npm run release:tag                # create and push the annotated vX.Y.Z tag
```

`release:tag` refuses if the working tree is dirty or HEAD is not on
`origin/main`, so the tag always marks a commit the release was actually cut
from.

Then create the GitHub Release from the new changelog section:

```bash
gh release create vX.Y.Z --verify-tag --title "arcq X.Y.Z" --notes "<paste the CHANGELOG section>"
```

## 4. Publish to npm

Publishing requires the npm account's 2FA (a one-time code or browser
approval), so run it interactively:

```bash
npm publish
```

The `prepare` script compiles `dist/` automatically before packing, and the
tarball ships only `dist/`, `README.md`, `LICENSE`, and `package.json`.
Verify the result:

```bash
npm view @leverstack/arcq version    # should print the new version
```

## Local development note

A globally linked arcq (`npm link` / volta shim) runs this repo's gitignored
`dist/` directly - rebuild with `npm run build` after any source edit for the
global command to pick it up. This is independent of releasing.
