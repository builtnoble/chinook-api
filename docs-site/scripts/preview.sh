#!/usr/bin/env bash
# Previews the docs site: exports the spec, generates the pages into a copy of the private theme, and starts the
# theme's dev server. The theme itself is never modified.
#
#   THEME_DIR    the chinook-docs-theme checkout (default: next to this repository)
#   PREVIEW_DIR  where the copy lives (default: docs-site/.preview, ignored by git)
#   PORT         dev server port (default: 3001)
set -euo pipefail

cd "$(dirname "$0")/.."

THEME_DIR="${THEME_DIR:-../../chinook-docs-theme}"
PREVIEW_DIR="${PREVIEW_DIR:-.preview}"
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
# node_modules and .next are kept between runs, so only the first run installs.
rsync -a --delete --exclude .git --exclude node_modules --exclude .next --exclude out "$THEME_DIR/" "$SITE/"

echo "Generating the pages..."
bun generator/index.ts --spec "$PREVIEW_DIR/openapi.json" --pages content/pages.json --out "$SITE"

cd "$SITE"
[ -d node_modules ] || npm ci

echo "Docs at http://127.0.0.1:$PORT (stop with Ctrl+C; run again to pick up changes to the API or docs/)"
exec npm run dev -- -p "$PORT"
