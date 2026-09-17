# DomainHarness v0.1 — Validation Report

**Report stage:** Successor-candidate preparation after post-candidate audit  
**Last fully visible-qualified candidate:** `edbe2b53c936107ba4dfbb4eef7aef5408c26b39`  
**Current version-line head after validated quality/test/PRD merges:** `3acacf447c4510733e38881310679c823061664f`  
**Release qualification:** BLOCKED — final successor SHA not yet frozen; owner-held Hidden Validation has not run

A PASS belongs to the exact SHA on which it was executed. Historical PASS evidence remains useful, but Runtime/package/process changes require a successor candidate and affected-gate reruns.

## 1. Implementation state

T-001 through T-017 are DONE. The terminal execution record is `docs/implementation/DomainHarness_v0.1_TASK_DAG.md`.

Frozen Product authority is now repository-local at `docs/product/DomainHarness_v0.1_PRD_FROZEN.md` with SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`.

## 2. Historical visible candidate `edbe2b5` — PASS

Recorded release-visible evidence includes:

- T-013 clean package/consumer gate PASS (#30);
- T-014 Critical Journey + real process-kill recovery PASS (#32);
- Tally external validation PASS (`kaicreator-mm/tally#54`, external SHA `256e3daba951fa6e400c1c73de02221571aafc59`);
- City Atlas external validation PASS (`kaicreator-mm/city-atlas#23`, external SHA `c58be0945acff58b02bee07c269cc28c8af61f76`);
- clean install, lint, typecheck, test, build, package and plain-node tarball consumer PASS as recorded in #39;
- Critical Journey, process-crash, recovery/lifecycle, Child Workflow, ExpressionRuntime and ScriptExecutor focused suites PASS.

Issue #40 was found on an earlier candidate during real plain-ESM/cross-domain execution, fixed, and the visible gates were rerun before `edbe2b5` became the historical visible-qualified candidate.

## 3. Post-candidate audit hardening — COMPLETE ON VERSION LINE

### #49 / PR #50 — definition lock / frozen Script / canonical asset containment

Status: **MERGED / focused validation PASS**.

#51 validated refreshed PR head `3fb39eface858abd60b42f09d63e2023358af100` on Windows 10, Node v26.8.1 / npm 11.19.0:

- `npm ci`, lint, typecheck and build PASS;
- full suite: 116 pass / 0 fail / 1 historical pre-build ESM skip;
- quality-hardening 4/4;
- loader 2/2 + loader-negative 12/12;
- Script 7/7; Expression 10/10;
- recovery lifecycle 8/8; process-crash 8/8;
- ESM host focused run 1/1 PASS;
- relocation-stable hash, real asset-change hashing, frozen Script TOCTOU and canonical link containment PASS.

PR #50 was squash-merged into `v0.1` as `1a4ad8ea17cc1e5ac81d138b41364ea95b5ac56e`.

### PR #52 / #53 — canonical test flow

Status: **MERGED / PASS**.

On exact PR SHA `c672c06f5b34219aacd599ef9e63765fbd9bae94`, a clean checkout with no pre-existing `dist/` produced:

- `npm test`: 113/113 PASS, 0 skipped;
- build occurred inside canonical test flow;
- plain-ESM host regression executed and PASSed;
- lint/typecheck PASS.

PR #52 was squash-merged into `v0.1` as `b930c1bd39aae933d25e59c1ed99b1534f9ea7c1`.

### #54 / PR #55 — frozen PRD provenance

Status: **MERGED / checksum verified**.

The authoritative PRD was copied byte-for-byte into `docs/product/DomainHarness_v0.1_PRD_FROZEN.md` and verified with the frozen SHA-256. PR #55 merged as `3acacf447c4510733e38881310679c823061664f`.

## 4. Supplemental public validation

| Issue | Concern | Status |
|---|---|---|
| #41 | Node/OS/package-consumer compatibility | PASS |
| #42 | WAL/FULL abrupt-kill durability Windows + Linux | OPEN — Windows NTFS 375/375 PASS; Linux/ext4 evidence still required by the issue's own completion rule |
| #43 | waiting/send/cancel race stress | PASS — 8000/8000 |
| #44 | Child Workflow stress | PASS |
| #45 | Worker boundary/resource/timeout/cancel matrix | PASS |
| #46 | definitionHash / engine-major lock | PASS on tested historical candidate scenarios |
| #47 | non-idempotent side-effect-before-crash | PASS |
| #48 | long-run soak / SQLite consistency | PASS |

These public tests do not replace Hidden Validation.

## 5. Documentation / CI / repository-process closure

- Documentation reconciliation: #58, branch `v0.1_docs_closure` — in progress.
- Minimal Woodpecker workflow: #59 / PR #63 — in progress. Official Woodpecker 3.18.x syntax is used for PR and `main` push conditions; the workflow intentionally contains only `npm ci`, lint, typecheck and canonical `npm test`.
- Actual Woodpecker run and emitted GitHub status context: #57 — local/CI environment required.
- `main` branch protection/ruleset: #56 — repository admin action required after #57 establishes the real check context.

## 6. Successor visible-gate rerun

After documentation/process concerns merge, freeze one exact `v0.1` successor SHA and execute #60. Because the quality hardening changes definition-lock and Script execution, at minimum rerun:

- clean install/lint/typecheck/canonical tests/package;
- plain-node package consumer;
- quality/definition-lock focused suite;
- Script/Expression focused suites;
- recovery/process-crash coverage;
- Tally and City Atlas runners against the same DomainHarness SHA.

No dirty-worktree patching is allowed.

## 7. Hidden Validation

Status: **NOT_RUN / owner-held**.

Run only after the final successor SHA passes its visible entry gates. Held-out case source/fixtures must remain unpublished. Public Issues #41–#48 are not substitutes.

## 8. Current decision

```text
Frozen PRD: FROZEN / repository-local / checksum verified
Architecture: FROZEN / no contradiction
Implementation T-001..T-017: DONE
Historical visible candidate edbe2b5: VISIBLE GATES PASS
Quality hardening #49/#50/#51: COMPLETE / MERGED
Canonical test flow #52/#53: COMPLETE / MERGED
PRD provenance #54/#55: COMPLETE / MERGED
Docs reconciliation #58: IN PROGRESS
Minimal Woodpecker CI #59/#63: IN PROGRESS
CI execution/status context #57: NOT YET VERIFIED
Branch protection #56: NOT YET CONFIGURED
Supplemental #42 Linux/ext4: INCOMPLETE
Final successor visible rerun #60: NOT_RUN
Hidden Validation: NOT_RUN
Release Qualification: BLOCKED
Tag/publish: NOT AUTHORIZED
```
