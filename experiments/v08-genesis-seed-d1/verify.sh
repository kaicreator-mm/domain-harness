#!/usr/bin/env bash
# D1 full exact-source reproduction. This is NOT a Domain Package generator.
set -euo pipefail
cd "$(dirname "$0")/../.."
printf 'D1_HEAD=%s\nD1_TREE=%s\n' "$(git rev-parse HEAD)" "$(git rev-parse HEAD^{tree})"
sha256sum experiments/v08-genesis-seed-d1/packages/*/modules/*.mjs
npm ci
npm run build
npm run lint
npm run typecheck
npm test
node --test experiments/v08-genesis-seed-d1/tests/genesis.test.mjs
node experiments/v08-genesis-seed-d1/run.mjs
