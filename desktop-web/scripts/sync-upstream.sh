#!/usr/bin/env bash
# Brings the latest upstream hermes-agent into this fork, then checks that the
# browser build still type-checks and builds.
#
# This fork does not carry upstream's history. `main` is a chain of snapshot
# commits, one per sync, each holding upstream's files as they were at that
# moment. This script adds the next snapshot to `main` and merges it into
# `web`. Upstream's history stays on your machine (the `upstream` remote) and
# is never pushed.
#
# Run from anywhere in the repo, on a clean `web` branch. It does not push.
set -euo pipefail

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

git fetch upstream main
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

upstream=$(git rev-parse refs/remotes/upstream/main)

if [ "$(git rev-parse "$upstream^{tree}")" = "$(git rev-parse 'refs/heads/main^{tree}')" ]; then
  echo "main already matches upstream ${upstream:0:10}."
else
  date=$(git log -1 --format=%cs "$upstream")
  snapshot=$(git commit-tree "$upstream^{tree}" -p refs/heads/main -m "Upstream hermes-agent at ${upstream:0:10} ($date)")
  git update-ref refs/heads/main "$snapshot"
  echo "main now matches upstream ${upstream:0:10} ($date)."
fi

git merge --no-edit refs/heads/main

ELECTRON_SKIP_BINARY_DOWNLOAD=1 npx -y npm@11 ci --ignore-scripts --no-audit --no-fund
npm run typecheck --prefix desktop-web
npm run build --prefix desktop-web

echo
echo "Done. To publish: git push origin main web"
