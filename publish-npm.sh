#!/usr/bin/env bash
set -euo pipefail

# ── git sanity checks ─────────────────────────────────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$BRANCH" != "main" ]] && { echo "✗ Must be on main (currently: $BRANCH)"; exit 1; }

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "✗ Uncommitted changes — stash or commit first"
  exit 1
fi

# ── version bump ──────────────────────────────────────────────────────────────
CURRENT=$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version")
MAJOR=$(echo "$CURRENT" | cut -d. -f1)
MINOR=$(echo "$CURRENT" | cut -d. -f2)
PATCH=$(echo "$CURRENT" | cut -d. -f3)

BUMP="${BUMP:-patch}"
case "$BUMP" in
  major) MAJOR=$((MAJOR+1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR+1)); PATCH=0 ;;
  patch) PATCH=$((PATCH+1)) ;;
  *) echo "✗ Unknown BUMP: $BUMP (patch/minor/major)"; exit 1 ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"
TAG="v$NEW"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "✗ Tag $TAG already exists — was a previous publish interrupted?"
  exit 1
fi

echo "Bumping $CURRENT → $NEW"

node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$NEW';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# ── test ──────────────────────────────────────────────────────────────────────
node test/test.js

# ── commit + tag + push (GHA workflow handles npm publish) ────────────────────
git add package.json
git commit -m "chore: release $NEW"
git tag "$TAG"
git push origin HEAD
git push origin "$TAG"

echo ""
echo "✓ Tagged $TAG — GitHub Actions will publish to npm"
echo "  https://github.com/jayf0x/usight/actions"
