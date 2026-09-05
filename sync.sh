#!/bin/sh
set -eu

cd "$(dirname "$0")"
node scripts/sync-spec.mjs ../tetsuo --apply
npm run package
npm run install-vsix