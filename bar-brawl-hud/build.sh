#!/usr/bin/env bash
# Rebuild module.zip. Bump "version" in module.json first, then commit and push both files.
set -euo pipefail
cd "$(dirname "$0")"
rm -f module.zip
zip -qr module.zip module.json scripts assets README.md
echo "Built bar-brawl-hud/module.zip for version $(grep -m1 '"version"' module.json | sed 's/[^0-9.]//g')"
