#!/usr/bin/env bash
#
# Tag the current commit with the arcq version, marking exactly what shipped.
# The volta shim runs this repo's dist/ directly, so run this AFTER the
# release commit is on origin/main and `npm run build` has refreshed dist/.
#
# Usage:
#   scripts/release-tag.sh [--dry-run] [--force]
#
#   --dry-run  Print what would happen without creating or pushing the tag.
#   --force    Move the tag if it already exists (re-point and force-push).
#
# The version is read from package.json. Tags are annotated and named vX.Y.Z
# to match the public release convention.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(git -C "$ROOT_DIR" rev-parse --show-toplevel)"
GIT="git -C $REPO_ROOT"

DRY_RUN=false
FORCE=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --force) FORCE=true ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)" >&2; exit 64 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
run() {
  printf '  $ %s\n' "$*"
  if [ "$DRY_RUN" = false ]; then "$@"; fi
}

# Version, read from the one source of truth
step "Version"
VERSION=$(npm --prefix "$ROOT_DIR" pkg get version | tr -d '"')
[ -n "$VERSION" ] && [ "$VERSION" != "{}" ] || {
  echo "Could not read version from package.json." >&2
  exit 1
}
TAG="v$VERSION"
echo "  package.json: $VERSION"

# The tag must mark a commit that is really the release: nothing uncommitted,
# and already shared on origin/main.
step "Preflight"
if [ -n "$($GIT status --porcelain)" ]; then
  echo "Working tree is dirty - commit or stash first so the tag points at a" >&2
  echo "real released commit." >&2
  exit 1
fi
$GIT fetch --quiet 2>/dev/null || echo "  (warning: fetch failed; using last-known remote state)"
if ! $GIT merge-base --is-ancestor HEAD origin/main; then
  echo "HEAD is not on origin/main yet - push (or merge) first so the tag" >&2
  echo "marks the commit the release was actually cut from." >&2
  exit 1
fi
HEAD_SHA=$($GIT rev-parse --short HEAD)
echo "  tag:      $TAG"
echo "  commit:   $HEAD_SHA"

# Create or (with --force) move the tag
if $GIT rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  EXIST=$($GIT rev-parse --short "$TAG")
  if [ "$EXIST" = "$HEAD_SHA" ]; then
    step "Tag $TAG already points at $HEAD_SHA - nothing to do"
    exit 0
  fi
  if [ "$FORCE" = false ]; then
    echo "Tag $TAG already exists at $EXIST. Re-run with --force to move it to" >&2
    echo "$HEAD_SHA." >&2
    exit 1
  fi
  step "Move tag $TAG ($EXIST -> $HEAD_SHA)"
  run $GIT tag -fa "$TAG" -m "arcq $VERSION."
  run $GIT push --force origin "$TAG"
else
  step "Create tag $TAG at $HEAD_SHA"
  run $GIT tag -a "$TAG" -m "arcq $VERSION."
  run $GIT push origin "$TAG"
fi

step "Done - $TAG marks $HEAD_SHA on origin"
