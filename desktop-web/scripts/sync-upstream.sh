#!/usr/bin/env bash
# Brings an upstream hermes-agent version into this fork, then checks that the
# browser build still type-checks and builds.
#
#   desktop-web/scripts/sync-upstream.sh             # upstream main
#   desktop-web/scripts/sync-upstream.sh v2026.9.24  # a release tag
#
# Use the tag of the hermes-agent image your gateway runs, so the UI and the
# gateway match.
#
# This fork does not carry upstream's history. `main` is a chain of snapshot
# commits, one per sync, each holding upstream's files as they were at that
# version. This script adds the next snapshot to `main` and merges it into
# `web`. Only the requested upstream commit is downloaded, never its history.
#
# Run from anywhere in the repo, on a clean `web` branch, with any dev server
# stopped (the install replaces node_modules). It does not push.
set -euo pipefail

ref=${1:-main}

cd "$(git rev-parse --show-toplevel)"

if [ "$(git branch --show-current)" != web ]; then
  echo "Switch to the web branch first." >&2
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Commit or stash your changes first." >&2
  exit 1
fi

git remote get-url upstream >/dev/null 2>&1 ||
  git remote add upstream https://github.com/NousResearch/hermes-agent.git

case $ref in
  v[0-9]*) git fetch --depth 1 --no-tags upstream "refs/tags/$ref" ;;
  *) git fetch --depth 1 --no-tags upstream "refs/heads/$ref" ;;
esac
upstream=$(git rev-parse 'FETCH_HEAD^{commit}')
date=$(git log -1 --format=%cs "$upstream")

git fetch origin

# Start from the newest snapshot, whether it was made here or on another machine.
if git rev-parse -q --verify refs/remotes/origin/main >/dev/null; then
  if git merge-base --is-ancestor refs/heads/main refs/remotes/origin/main; then
    git update-ref refs/heads/main refs/remotes/origin/main
  elif ! git merge-base --is-ancestor refs/remotes/origin/main refs/heads/main; then
    echo "Local main and origin/main have split. Sort that out by hand first." >&2
    exit 1
  fi
fi

if [ "$(git rev-parse "$upstream^{tree}")" = "$(git rev-parse 'refs/heads/main^{tree}')" ]; then
  echo "main already matches upstream $ref (${upstream:0:10})."
else
  snapshot=$(git commit-tree "$upstream^{tree}" -p refs/heads/main \
    -m "Upstream hermes-agent $ref at ${upstream:0:10} ($date)")
  git update-ref refs/heads/main "$snapshot"
  echo "main now matches upstream $ref (${upstream:0:10}, $date)."
fi

# The build reads the version label from this file, so it also works in a
# shallow clone that can't see the snapshot commits.
if [ "$ref" = main ]; then
  label="$date-${upstream:0:10}"
else
  label=$ref
fi

if ! git merge --no-ff --no-commit refs/heads/main; then
  echo "The merge has conflicts. Fix them, then run this script again." >&2
  exit 1
fi

printf '%s\n' "$label" > desktop-web/UPSTREAM_VERSION
git add desktop-web/UPSTREAM_VERSION

if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  git commit -q -m "Merge upstream hermes-agent $ref (${upstream:0:10})"
elif ! git diff --cached --quiet; then
  git commit -q -m "The version label shows upstream $label."
fi

ELECTRON_SKIP_BINARY_DOWNLOAD=1 npx -y npm@11 ci --ignore-scripts --no-audit --no-fund
npm run typecheck --prefix desktop-web
npm run build --prefix desktop-web

echo
echo "Done. To publish: git push origin main web"
