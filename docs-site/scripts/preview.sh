#!/usr/bin/env bash
# Previews the docs site: exports the spec, generates the pages into a copy of
# the private theme, starts the theme's dev server, and keeps the pages up to
# date with docs/ and the API. The theme itself is never changed.
#
#   THEME_DIR    the chinook-docs-theme checkout (default: next to this
#                repository)
#   PREVIEW_DIR  where the copy goes (default: next to the theme, as
#                chinook-docs-theme-preview). Keep it outside this repository,
#                or Next.js warns about the repository's lockfile.
#   PORT         dev server port (default: 3001)
set -euo pipefail

cd "$(dirname "$0")/.."

THEME_DIR="${THEME_DIR:-../../chinook-docs-theme}"
PREVIEW_DIR="${PREVIEW_DIR:-${THEME_DIR%/}-preview}"
PORT="${PORT:-3001}"
SITE="$PREVIEW_DIR/site"

if [ ! -f "$THEME_DIR/package.json" ]; then
    echo "No theme at $THEME_DIR. Clone chinook-docs-theme there, or set THEME_DIR." >&2
    exit 1
fi

mkdir -p "$SITE"

echo "Exporting the OpenAPI spec..."
(cd ../api && bun run openapi:export "$OLDPWD/$PREVIEW_DIR/openapi.json")

echo "Copying the theme..."
# node_modules and .next are kept, so dependencies only install the first time.
rsync -a --delete --exclude .git --exclude node_modules --exclude .next --exclude out "$THEME_DIR/" "$SITE/"

echo "Generating the pages..."
bun generator/index.ts --spec "$PREVIEW_DIR/openapi.json" --pages content/pages.json --out "$SITE"

# Regenerates the pages when docs/, the generator or the API change. The dev
# server reloads whatever gets written. `bun --watch` reruns a script when
# anything it imports changes: the API code for the spec, and the spec, the
# guides and the generator for the pages.
(cd ../api && exec bun --watch --no-clear-screen scripts/export-openapi.ts "$OLDPWD/$PREVIEW_DIR/openapi.json") &
bun --watch --no-clear-screen generator/index.ts --spec "$PREVIEW_DIR/openapi.json" --pages content/pages.json --out "$SITE" &
trap 'kill $(jobs -p) 2>/dev/null' EXIT

cd "$SITE"
[ -d node_modules ] || npm ci

echo "Docs at http://127.0.0.1:$PORT (stop with Ctrl+C; edits to docs/ and the API reload by themselves)"
npm run dev -- -p "$PORT"
