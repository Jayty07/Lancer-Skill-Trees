#!/usr/bin/env bash
# Rebuild module.zip from the current files. Run after any change, bump "version" in
# module.json, then commit and push both module.json and module.zip. Foundry and The Forge
# check the manifest on main for updates.
set -euo pipefail
cd "$(dirname "$0")"
rm -f module.zip
zip -qr module.zip module.json scripts styles assets examples README.md
echo "Built module.zip for version $(grep -m1 '"version"' module.json | sed 's/[^0-9.]//g')"
