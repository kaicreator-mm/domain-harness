# T016 — Repository Integration Recipe (for the controller, gate #943)

Status: PREPARED — execute ONLY after (1) the owner dispositions the Hidden
Validation rebind (see `t016-rq-record.md`) and (2) the RQ gates accept the RQ PR.

## Precedent

v0.4 bridge PR #420 (`main@5cf7a8fc`, tree `0523325e…`): lane->main integration
materialized with the integrated tree identical to the validated release tree.
This recipe follows the same pattern (tree-identical bridge), now with the
carried v0.6 governance content making the bridge lossless for the baseline chain.

## Why a plain merge conflicts (recorded, already simulated)

`git merge lane` into `main@535fd26` yields exactly 4 content conflicts
(PROJECT_OVERRIDES.md, README.md, and the Node/Expo production sqlite stores)
plus 45 main-only files that v0.7 deliberately does not carry (v0.6-only
sources/tests; see `t016-divergence-audit.md` class (c)). All conflicts resolve
to the LANE side; the 45 files are removed. After resolution the integrated tree
is byte-identical to the lane tree (verified: `git diff lane scratch` EMPTY in
the simulation; scratch tree `945031e3`, predicted integrated tree
`219efc4e…` — recompute at the final lane tip, it equals the lane tree).

## Exact recipe

```bash
# 0. LIVE preflight (gh api only; never trust the local mirror)
gh api repos/kaicreator-mm/domain-harness/commits/version/v0.7   # expect the RQ-accepted lane head
gh api repos/kaicreator-mm/domain-harness/commits/main           # expect 535fd267... or record drift

# 1. Controller opens PR: base = main, head = task/dh-t016-943 (the RQ-accepted lane head)
#    Title suggestion: "chore(release): v0.7 repository integration — tree-identical bridge (issue #943)"

# 2. Merge with the documented resolution (equivalently: merge commit whose tree == lane tree)
git fetch origin main task/dh-t016-943
git checkout -b integration origin/main
git merge --no-ff task/dh-t016-943
#    resolve the 4 conflicts by taking the LANE side; `git rm` the 45 class-(c)
#    main-only files listed in t016-divergence-audit.md (or `git checkout lane -- .`
#    then remove every file not in the lane tree); commit.
#    Result invariant: git diff task/dh-t016-943 HEAD  ->  EMPTY

# 3. Post-integration verify (exact, NO tags per convention)
git rev-parse HEAD HEAD^{tree}                    # record: integrated commit + tree
test -z "$(git diff task/dh-t016-943 HEAD)"       # tree-identical bridge invariant
npm ci && npm run build && node scripts/check-committed-dist.mjs
npm run lint && npm run typecheck && npm test      # full suite green
npm pack --workspaces                            # must reproduce:
#   f9400728…a2d332 / 54926261…83c78 / 3a254c62…030480 / d4c6ef8a…0bde1
#   set 0b5772fc…3d98e
```

Expected head/tree announcement: the integration PR body MUST state the expected
lane head SHA; merge only if the PR head matches it exactly (expected-head check).

## Post-integration housekeeping (NOT part of the release)

The v0.6 CI verify-redundancy cut (`341101b`: build-first test cascade,
`--test-isolation=none`, incremental tsc, `*.tsbuildinfo`) reverts with the
bridge because the v0.7 lane never carried it and it touches `package.json` /
`packages/*/tsconfig.build.json` (authority files the RQ lane constraint
forbids changing). Re-apply it as a separate post-integration housekeeping PR
with fresh CI proof; it does not affect the qualified release bytes (proven:
pack digests are independent of those files).

## Rollback / stop classification

- TARGET_DRIFT (main moved off `535fd26` before merge): re-run the divergence
  audit delta; if the new main commits touch anything outside class (b), STOP
  and report.
- CANDIDATE_DRIFT (lane head != expected): do not merge; re-qualify.
- INTEGRATION_BYTE_CHANGE (integrated tree != lane tree, or pack digests differ):
  integration INVALIDATES the qualification per #733; STOP, report, successor
  exact-candidate path.
