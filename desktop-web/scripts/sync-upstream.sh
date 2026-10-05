#!/usr/bin/env bash
# Moves the web UI to a hermes-agent version, then type-checks and builds it.
#
#   npm run sync-upstream -- v2026.9.24   # a release tag (match your gateway)
#   npm run sync-upstream                 # upstream main
#
# `main` holds the hermes-agent files the UI is built from: one snapshot commit
# per version, each with only the files the build needs (picked by
# upstream.mjs). This script adds the next snapshot to `main`, merges it into
# `web`, and regenerates the root package.json and lockfile from upstream's.
# Only the requested upstream commit is downloaded.
#
# Run on a clean `web` branch, with any dev server stopped (the install
# replaces node_modules). It does not push.
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

tree=$(node desktop-web/scripts/upstream.mjs tree "$upstream")

if [ "$tree" = "$(git rev-parse 'refs/heads/main^{tree}')" ]; then
  echo "main already matches upstream $ref (${upstream:0:10})."
else
  snapshot=$(git commit-tree "$tree" -p refs/heads/main \
    -m "Upstream hermes-agent $ref at ${upstream:0:10} ($date)")
  git update-ref refs/heads/main "$snapshot"
  echo "main now matches upstream $ref (${upstream:0:10}, $date)."
fi

if ! git merge --no-ff --no-commit refs/heads/main; then
  echo "The merge has conflicts. Fix them, commit, then run this script again with the same version." >&2
  exit 1
fi

# The build reads the version label from this file.
if [ "$ref" = main ]; then
  printf '%s\n' "$date-${upstream:0:10}" > desktop-web/UPSTREAM_VERSION
else
  printf '%s\n' "$ref" > desktop-web/UPSTREAM_VERSION
fi

node desktop-web/scripts/upstream.mjs package "$upstream"
npx -y npm@11 install --package-lock-only --ignore-scripts --no-audit --no-fund
git add desktop-web/UPSTREAM_VERSION package.json package-lock.json

if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  git commit -q -m "Built from hermes-agent $ref (${upstream:0:10})."
elif ! git diff --cached --quiet; then
  git commit -q -m "Packages match hermes-agent $ref (${upstream:0:10})."
fi

ELECTRON_SKIP_BINARY_DOWNLOAD=1 npx -y npm@11 ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build

echo
echo "Done. To publish: git push origin main web"
