# v0.8 T-F — TF-D3 lane: Engineering self-dogfood independent test evidence

- **Lane:** #1005@6113088850 parallel workstream partition, row *TF-D3 Engineering self-dogfood*.
- **Actor:** independent Local test executor (worktree `domain-harness/dh-i1005-d3test`, branch `task/dh-i1005-d3test`). **No Builder Claim on #1005, no PR #1012 branch write, no F01/D2 file edits, no independent self-review terminal** (Controller directive #1005@6111376667).
- **Business module under test:** PR #1012 HEAD `9f6aaf4163f410081a6fd078d066c19f9a02ab16` `examples/v08-domain-apps/business-engineering.mjs`.
- **Test file (this lane's only test write):** `packages/domain-harness-compiler/tests/v08-tf-d3-engineering-lifecycle.test.ts` (12 tests, auto-included by the compiler suite glob).
- **Date:** 2026-10-12. Node v24.21.0, Windows (fnm), npm ci from the unmodified `package-lock.json`.

## Exact module digests (sha256, utf8)

| Module | Digest |
|--|--|
| K `kernel-mechanism-v1.mjs` (`v08-kernel-mechanism@1.0.0`) | `e660cffa9958b77866321c891a29aa46750dd93ce71e54b2250b5107e32ed53e` |
| S `standard-sdk-v1.mjs` (`standard-sdk@v08.1.0.0`) | `c08eaa04080fb13dc3454e62f2f10d5cd347a7e2459237c22292a514bcc70da0` |
| B engineering @ `9f6aaf4` (as shipped in PR #1012) | `d0f84aa6bde4e5a7be85f3f26b0c7b74eed9d70dcb7f655b5446ab677a02afd2` |
| B engineering with this lane's minimal fix (branch commit `3ce1118`) | `d39b101668ffd71cfe8db8e25729136f7b6d9538d5904bcdcc73d961c410e35a` |

Both K and S are executed from their exact sealed file bytes via data-URL import (V08-ABI-C01 discipline), never from build artifacts. The D2 Approval module under test is the same PR #1012 `business-approval.mjs`, unmodified.

## Finding (RED at exact PR HEAD): the D3 Business package cannot be wired by the real current Kernel

Against pristine `9f6aaf4` business-engineering.mjs, **11 of 12 tests fail identically at Kernel wiring**:

```
node --import tsx --test packages/domain-harness-compiler/tests/v08-tf-d3-engineering-lifecycle.test.ts
# tests 12 / pass 1 / fail 11
CentralAdmissionError ADMISSION_EFFECT_BINDING_INVALID:
  "inputFrom.validationId event path [payload, validationId] is outside
   the rule-authorized projection"     (thrown by createOccurrenceRuntime)
```

**Root cause (source-proven):** `wireAdmissionEffectBindings` (`kernel-mechanism-v1.mjs:1376-1417`) validates, for EVERY intent binding, the whole `binding.definition ?? businessEndpoint.workflowDefinition` against THAT binding's own rule projection (`Object.keys(rule.payloadFromInput)`, `:1272-1278`). The engineering policy binds three intents to one shared `workflowDefinition` whose three transitions each declare a dynamic `inputFrom` scoped to its own stage fields; each rule authorizes only its own stage fields, so every binding rejects the other stages' dynamic declarations. `createOccurrenceRuntime` is exactly the trusted installation boundary the public `DomainHarness.load` facade uses, so **PR #1012@9f6aaf4's D3 package cannot load in the real current composition** — a defect distinct from (and beyond) the already-registered Blockers A/B/C in #1005@6112954208. F01 does not call `createOccurrenceRuntime` (BUILD/source-level only), which is why CI-visible F01 did not surface it.

**Rejected alternative:** widening every rule projection to the union of all dynamic fields does pass wiring but forces every caller to submit every stage's fields — the real Standard SDK `project()` requires EVERY `payloadFromInput` key present in the input (`SDK_PROJECTION_MISSING`), so per-stage caller contracts would be destroyed.

**Minimal fix (branch commit `3ce1118`, integrable patch `patches/0001-TF-D3-scoped-intent-definitions.patch`):** the Kernel's established authoring pattern (V08-ABI-C01 fixture, and the D2 Approval package itself): each intent binding carries its own `definition` — a clone of the shared lifecycle in which only the binding's OWN transition keeps its dynamic evidence declaration; other transitions keep identical triggers/guards/targets with `effectIntents: []` (they can never be selected for this binding's trigger anyway). Shared `workflowDefinition`, all guards, rules, roles, effect handlers and idempotency templates are byte-identical in intent; F01's structural assertions still pass unchanged.

## Second finding: Woodpecker CI 1118 root cause is an F01 lint error, not a test failure

`.woodpecker/verify.yaml` step `verify` runs `npm ci → npm run build → npm run lint → npm run typecheck → npm test`. On exact PR HEAD `9f6aaf4`, `npm run lint` fails:

```
packages/domain-harness-compiler/tests/v08-two-real-domain-apps-f01.test.ts
  30:6  error  'Submission' is defined but never used.  @typescript-eslint/no-unused-vars
✖ 2 problems (1 error, 1 warning)   → eslint exit 1 → generic "Pipeline failed" (pipeline 1118)
```

Because lint runs BEFORE `npm test`, the F01 tests never executed in CI — consistent with "failing step unknown" from the outside. Locally, F01 is **green on Node v24.21.0/Windows (6/6)** both before and after the one-line fix. Fix: branch commit `a42b64e` / `patches/0002-TF-F01-unused-type-lint-ci1118.patch` (removes the unused type alias; zero behavior). The remaining `t012r/fixture-toolplane.mjs` item is a pre-existing WARNING (non-fatal), untouched by this lane.

## GREEN results (with the minimal fix)

```
node --import tsx --test packages/domain-harness-compiler/tests/v08-tf-d3-engineering-lifecycle.test.ts
# tests 12 / pass 12 / fail 0

node --import tsx --test packages/domain-harness-compiler/tests/v08-two-real-domain-apps-f01.test.ts
# tests 6 / pass 6 / fail 0          ← F01 is green locally on Node 24/Windows
                                                        (Woodpecker 1118 root cause is NOT the F01 source; see CI-diagnosis lane)

npm test -w @kaicreator/domain-harness-compiler
# 256 tests pass, 0 fail (includes C01, D01, D02, A01, F01, and this lane's 12)
```

Root `task-check` (lint → typecheck → test, Node v24.21.0/Windows): lint **0 errors** (one pre-existing warning in untouched `t012r` fixture); typecheck **green** (all workspaces); test — domain-harness **2982/2982**, compiler **256/256** (incl. this lane's 12 and F01's 6), expo **green**, root `test:root` **green** (71 checks); the single red is `domain-harness-node` 195/196 — a pre-existing, environment-order-dependent failure documented below, outside this branch's write set.

## Pre-existing environmental failure (NOT this lane's scope, documented for honesty)

`@kaicreator/domain-harness-node` full-suite run on this Windows host: **195/196 pass; `N08b: conflicting same-key ensure requests with a changed address fail closed deterministically` fails** with `SqliteError: disk I/O error` raised inside a spawned child process opening the store (`packages/domain-harness-node/tests/successor-host/fixtures/child-main.ts → openStore → NodeSqliteRuntimeStore.pragma`). Isolation matrix on the identical host/toolchain:

| Run | Files state | Result |
|--|--|--|
| N08b file alone (`n08-n10-provisioning.test.ts`) | pristine `9f6aaf4` | **4/4 pass** |
| N08b file alone | this branch (all 4 commits) | **4/4 pass** |
| Full node workspace suite (2 runs) | either | 195/196, N08b fails deterministically |

The failure is suite-order/environment-dependent (child-process SQLite on Windows), pre-existing, and in a package this branch does not touch (branch write set: `examples/v08-domain-apps/business-engineering.mjs`, compiler tests, docs). Single-file repro passes with and without this lane's changes, so the red is not caused or masked by them. The authoritative full gate for merge remains the remote Woodpecker Linux pipeline (`ci/woodpecker/pr/verify`), which this branch's evidence does not substitute for.

## What the 12 tests prove (IDs per lane plan / #1005@6110195587 vocabulary)

- **D3-P01** full guarded lifecycle `change-proposed → reviewed → validation-passed → release-qualified` on the REAL K mechanism + REAL S interpreter: per-stage admitted receipts, state/Journal readback, `engineering:{review|validation|release}:{changeId}` idempotency keys, exact per-stage dynamic input provenance through the physical resource port, 3 distinct effectIds/durable control turns, terminal `lifecycle: 'completed'` at revision 3.
- **D3-P01b** qualified release is terminal: all three intents afterwards → `no-candidate-transition`, zero new journal rows/resources.
- **D3-N01** wrong-role matrix (incl. D2's `requester` on every D3 intent, and the anonymous default caller) → `business-caller-role` denial naming the Business package as denier, ZERO journal rows, ZERO resource calls, state untouched.
- **D3-N01b** no stage-skipping promotion: validation/release before review, release straight from `reviewed` → `no-candidate-transition`; a D2 Approval intent type is typed-refused (`ADMISSION_EVALUATION_INPUT_INVALID`) by the D3 policy.
- **D3-N02a** validation SHA exactness: `testedSha ≠ reviewedSha` (stale), `testsPassed:false`, missing attestation (typed `SDK_PROJECTION_MISSING` at S, before the Kernel) → all refused; denial is final, state-preserving (revision/journal unchanged) and recovery with a current validation still succeeds.
- **D3-N02b** release currentness: `qualifiedSha ≠ testedSha` (stale), `releaseApproved:false`, missing attestation → guard `guard:release-qualified` refusals; state preserved; correct attestation then completes the release.
- **D3-N02c** evidence revocation hard invariant: `revoked:true` → `hard-invariant` / `inv:no-revoked-evidence` at every stage, and PRIORITY over guards (an event failing both is denied by the invariant); zero revoked evidence reaches journal or resource port.
- **D3-N03** without a physical Host resource port the evidence effect fails closed: typed `ADMISSION_EFFECT_FAILED` carrying the Business handler's "authenticated physical Host resource port" demand, exactly one journal record with status `failed`, transition never commits (revision 0), same-effectId blind retry refused (`durably failed`) with no second dispatch.
- **D3-N04** in-process replay containment: re-submitting an already-recorded stage occurrence appends no second evidence.
- **SHARED-P01** D2 Approval and D3 Engineering occurrences execute the EXACT same physical K/S: one real admitted occurrence per app, deep-equal `attribution.kernel` and `attribution.sdk` on both receipts, equal runtime `moduleSha256`/`moduleId`, byte-different Business identities.
- **SHARED-P01b** independent BUILD qualifications (own external issuer, fresh physical file reads) pin byte-identical K/S module sources and digests — equal to the digests above, i.e. to the bytes that actually executed — with byte-different Business packages, distinct subject/closure digests, frozen roots.
- **SHARED-N01** substituted Kernel digest refuses install: post-approval K byte swap → `BUILD_SUBJECT_DRIFT` at seal; and a different Kernel module identity cannot replay the durable D3 evidence records the real runtime wrote (`ADMISSION_EFFECT_JOURNAL_CONFLICT`, "no silent cross-version replay"), while the honest identity still reads its own completed record.

## Honest boundaries

- The doc store / resource dispatcher / clock in the test file are **TEST FIXTURES** (same boundary as V08-ABI-C01). **Real clean-process Host bootstrap, durable SQLite/Journal evidence trails, authenticated cross-tenant journeys and Host-principal revocation remain BLOCKED on #1013 (I01–I04)** and are NOT claimed here. Evidence "currentness" in this file means the policy's per-occurrence SHA-equality guards plus the S projection; durable evidence-trail currentness across restarts waits for #1013.
- F01 local green on Node 24/Windows does not diagnose Woodpecker 1118; that is the read-only CI-diagnosis lane's deliverable.
- Per Controller directives, this lane performs **no review/merge/approval terminal** and no push to `work/v08-tf-two-real-domain-apps`. Integration of the fix and tests belongs to the PR #1012 Web owner / parent builder; standalone patches: `docs/implementation/patches/0001-TF-D3-scoped-intent-definitions.patch` and `docs/implementation/patches/0002-TF-F01-unused-type-lint-ci1118.patch` (also cherry-pickable as branch commits `3ce1118` / `a42b64e`).

## Reproduction

```bash
git checkout task/dh-i1005-d3test           # or apply the patch onto PR #1012 HEAD
npm ci && npm rebuild better-sqlite3 esbuild
node --import tsx --test packages/domain-harness-compiler/tests/v08-tf-d3-engineering-lifecycle.test.ts
# RED variant: git stash the business fix (or check out 9f6aaf4's file) → 11/12 fail at wiring
```
