#!/usr/bin/env bash
#
# Bump the arcq version in package.json (+ lock), the single source of truth
# for what ships. `arcq version` reads this same value at runtime (via
# lib/version-cmd.ts), so no other file needs to change. It edits files only -
# review the diff, add the CHANGELOG entry, then commit yourself.
#
# Usage:
#   scripts/bump-version.sh <major|minor|patch> [--dry-run]
#
#   major   1.3.0 -> 2.0.0
#   minor   1.3.0 -> 1.4.0
#   patch   1.3.0 -> 1.3.1
#   --dry-run  Print the planned change without editing any files.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MODE=""
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    major|minor|patch) MODE="$arg" ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)" >&2; exit 64 ;;
  esac
done
[ -n "$MODE" ] || { echo "Missing bump type: major|minor|patch (see --help)" >&2; exit 64; }

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
npm_pkg() { npm --prefix "$ROOT_DIR" "$@"; }

step "Current version"
CUR_VER=$(npm_pkg pkg get version | tr -d '"')
[ -n "$CUR_VER" ] && [ "$CUR_VER" != "{}" ] || {
  echo "Could not read version from package.json." >&2
  exit 1
}
echo "  $CUR_VER"

IFS=. read -r MA MI PA <<EOF
$CUR_VER
EOF
case "$MODE" in
  major) NEW_VER="$((MA + 1)).0.0" ;;
  minor) NEW_VER="$MA.$((MI + 1)).0" ;;
  patch) NEW_VER="$MA.$MI.$((PA + 1))" ;;
esac

step "Bump ($MODE)"
echo "  $CUR_VER -> $NEW_VER"
if [ "$DRY_RUN" = true ]; then
  echo "  (dry run - no files changed)"
  exit 0
fi

npm_pkg pkg set version="$NEW_VER" >/dev/null
npm_pkg install --package-lock-only --silent >/dev/null 2>&1 || true

step "Verify"
GOT=$(npm_pkg pkg get version | tr -d '"')
[ "$GOT" = "$NEW_VER" ] || {
  echo "package.json did not update as expected - inspect the diff." >&2
  exit 1
}
echo "  package.json reports $NEW_VER"

step "Done - review the diff, add the CHANGELOG entry, then commit"
