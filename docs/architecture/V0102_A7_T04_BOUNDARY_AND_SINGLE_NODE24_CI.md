**INDEPENDENT A7 REVIEW REQUIRED; NOT YET ADOPTED.**

# A7 — Unblock T04 final public seam, error Catalog and single-Node24 CI without runtime version migration

**STATE=PROSPECTIVE_DESIGN_ONLY; A7_ACCEPTED=NO.**
**SOURCE:** T04 exact-HEAD independent R1 [PR #1358 review](https://github.com/kaicreator-mm/domain-harness/pull/1358#issuecomment-6388229687), HEAD `1195ac729416bcbb823aa6baf72778d082100203`, P0=0/P1=3/P2=1, normal Node24 verify SUCCESS, legacy Node22 min-node lane FAILURE. Existing frozen L2 blob `68e7dbc591f4c0c694818ec574b8585f95239c8b` remains immutable. Implementation DAG stays 18 nodes. Target version branch `v0.10.2@caa813c1a51c3e755e3df641e8601b8b842b1ba0`; main HOLD.

## Decision request (small owner-delta only)

The product owner specifically authorizes **do not spend cycles adjusting runtime versions; only qualify one Node24 physical environment**. Preserve selected new TS package engine floors already `>=24.0.0` with no major ceiling. `node24-esm/1` is selected ABI profile identity, not an exclusive runtime-major equality guard. Do not reopen closed A5/A6 or Product/Architecture semantics.

### W1 — retro T03a Catalog debt included in T04 only with prospective ownership grant

T03a #1347 merged Host code but omitted its 25 typed Host/Child/etc error strings from Contracts `V10_KNOWN_ERROR_CODES`, creating a failing catalog lineage union. T04 local builder appended exactly those 25 to `packages/contracts/src/known-error-codes.ts` plus source-paired `packages/contracts/dist/known-error-codes.{js,d.ts}`; T04 already legitimately owns the serialized five-path Catalog turn. These **three extra Contracts files** are NOT in frozen T04 write set.

**Proposed narrow approval:** allow these exact three files in PR #1358 as **T03a inherited Catalog-defect repair executed alongside T04's serialized Catalog turn**, with exact 25 literal list unchanged, diff limited to registry append/paired output, independent R2 verification. No authority for arbitrary Contracts edits. If not approved, split those three changes into a T03a-specific source PR on `v0.10.2`, restore T04 branch to unmodified Contracts and rebase after legitimate debt PR merge. Never label write-set violation PASS without this explicit decision.

### W2 — public Microkernel host-seam package export

Frozen L2 §3 promises `@kaicreator/domain-harness-microkernel/host-seam` with exact export namespace. T04 PR includes `src/host-seam.ts` and emitted dist but `packages/microkernel/package.json` still exports only `.`. Runtime imported via relative source test is not public installed proof. Root `package-lock.json` metadata should be checked; export-map-only change normally does not alter dependency tree or lockfile.

**Proposed exception:** one-time reassign ONLY `packages/microkernel/package.json` exports map modification (add `"./host-seam": {"types":"./dist/host-seam.d.ts","import":"./dist/host-seam.js"}` leaving the existing `.` unmodified) to T04's PR owner, despite T07b being exclusive owner of other package manifests/engines/lockfile. T07b remains sole final package CI/packlist/export freeze owner later; it verifies but must not overwrite this already-accepted seam. Do not touch `engines`, `dependencies`, `package-lock` or other manifest keys. T04 R2 must test **public package specifier** on actual Node24 workspace import, check exact namespace, deny private `dist/internal/*`, and maintain Host seam as API hygiene (not security).

### W3 — old Node22 CI lane vs user single-runtime policy

At exact PR #1358 HEAD, `ci/woodpecker/pr/verify` SUCCESS 1904/2 and `ci/woodpecker/pr/verify-min-node` FAILURE 1904/1. **Root cause unobserved**: current reviewer could not obtain provider log; don't guess engine incompatibility or declare waiver. The old lane uses Node22.15 for legacy Compiler, includes important import-hook/API smoke, and its GitHub required-check configuration is UNKNOWN (403 to branch protection).

**After reading the actual pipeline log**, if the only blocker is the legacy Node22 runner/incompatibility with v0.10.2 selected Node24 source, permit one **T07b-owned early CI-only substep** (without T11 source/manifest changes) replacing only `.woodpecker/verify-min-node.yaml`'s Node22 bootstrap/pin with the **same Node24 runtime as main verify**, preserving exact existing `ci/woodpecker/pr/verify-min-node` status context and BOTH security tests (`tests/compiler/v010-import-hook-registry.test.ts`, `tests/compiler/v010-public-api-boundary.test.ts`) and its static/build/typecheck checks. No deletion of a possibly branch-required check. Node22 is **not** certified as supported for selected BUILD and should not be counted as v0.10.2 physical profile. Perform one scoped Node24 provider CI; no new Node majors/matrix. If the failure is network/provider infra, document real error then reuse valid alternate Node24 profile only through existing ADS infra waiver authority; do not edit CI for a guessed cause. T07b remains manifest/CI final owner of all remaining late work.

### W4 — T04 true code P1 (not an A7 design waiver)

Independent R1 found `packages/microkernel/src/domain-app.ts` public error wrapper passes unchanged V10Error through when message lacks protected-key regex, including possible `cause`/own extras. Frozen L2 exact output allows public `name/code/safe message` only. **No proposal to waive this.** T04 Builder must replace with identity-preserving allowlisted fresh typed public error, stripping `cause`/private fields regardless of message; add real injected Host/Store error negatives checking **returned actual error object**, not a handcrafted serialized subset, and redaction across load/send/query. T06b later adds real observer errors. Independently review the new HEAD and repeat changed-risk Node24 scoped tests only; previously green full-task-check reused where source unaffected.

### W5 — runtime activation/Host algorithm copy vs frozen forwarding-shim rule

Frozen L2 §12 T04 requires the old `C/v10build/{activation,import-hook,external-effect}.ts`, old `H/host-v8/v010-authorized-multib-query.ts` and H index exports to become **forwarding shims** when their owner implementation moves to the new Microkernel. PR #1358 duplicates the moved implementations in the Microkernel but leaves the old C/H sources unchanged, effectively two callable implementation copies. A5 R7's earlier exception deferred only **three BUILD-side algorithms** (build, selected-closure, import-policy), not all runtime activation/gate/query files; T04 cannot silently inherit that exception.

**Prospective bounded choice:** (a) restore the frozen T04 forwarding-shim obligation: change only four old C/H TS files and H index reexports within the ALREADY granted T04 owner set; ensure historic legacy callers delegate to one Microkernel implementation with no alternate gate, preserve original class/receipt identity and no import cycle; OR (b) explicitly time-limit the old active C/H copies as `LEGACY_COMPAT_ONLY` **through T11**, with exact import graph and physical negative proving no NEW v0.10.2 selected activation/Effect gate/query invokes old paths, then T11 deletes old C v10build and converts remaining H runtime callers. Under choice (b), the independent reviewer must inspect production legacy exposure, K permit/gate parity and the actual T11 write set; if old path remains callable by a supported public v0.10.2 runtime, or if T11 does not own the H path's retirement, **BLOCK** rather than grant a broad exception. The desired selected Microkernel never rewrites K State/Journal/Effect; single selected runtime authority is mandatory. No new Task or file grant here: the four old files and H index are already T04-owned.

T04 R2 must state **which** choice was adopted and verify it through exact source/dynamic tests. No claim that unchanged old C/H files are forwarding shims; no accidental extension of A5 R7's BUILD-only deferral.

## Merge and review gates

1. Independent A7 exact-head Product/L2 source-owner difference reviewer must check W1 exact 25, W2 one-file manifest exception, W3 logs/CI status preservation and existing Node24-only user policy, W4 non-waivable redaction, W5 legacy C/H forwarding or explicitly bounded legacy runtime separation. Return P0/P1/P2, PASS/BLOCK, A7_SCOPE_READY, T04_WRITES_OWNER_GRANTED, T07B_EARLY_CI_ONLY_GRANTED, DAG_ACYCLIC and MERGE_ELIGIBLE_DOC_ONLY.
2. After A7 PASS and docs merge into `v0.10.2`: local T04 builder repairs W2/W4, retains W1 exactly and reconfirms source-paired outputs; any T07b CI writer must not overlap same files and only executes W3 after real failure diagnosis. Preserve shared Claim/exact HEAD checks and independent R2 on T04 source/CI.
3. T03b #1325 / T06a #1348 scoped Node24 tests passed on isolated branches; they cannot merge until T04 accepted. T08b/T09 remain source-draft only. R01 full/Hidden/critical/packaging still NOT_RUN; no main.

**Acceptance negatives:** forbidden change to root/package Node engine, arbitrary Contracts codes, lost min-node status context, lost security canaries, dropped real required check, runtime→BUILD import, unredacted error cause, fake public installed host-seam, fake full-suite PASS. A7 is a source-authority repair; it creates no new runtime features or implementation DAG Task.
