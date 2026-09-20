#!/usr/bin/env bash
# Fetch today's station prices for Italy, France and Spain.
#
# Separate from the site on purpose: these are ungrouped station prices from
# three countries, not the comparable weekly figures the map is built on. The
# result lands in data/daily.json and is not published.
#
# Spain's portal is slow — expect the whole run to take three to five minutes.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f web/public/data/latest.json ]]; then
  echo "web/public/data/latest.json is missing — run: uv run python -m pipeline.build" >&2
  exit 1
fi

exec uv run python -m pipeline.build_daily "$@"
