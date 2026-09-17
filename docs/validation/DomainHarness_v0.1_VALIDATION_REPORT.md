# DomainHarness v0.1 — Validation Report

**Report stage:** Post-audit visible qualification complete; Hidden Validation pending  
**Validated executable/package tree:** `1835f3f31ca483dc7bd997a545391f622d38be63`  
**Final intended version-line SHA:** tracked by Release Closure #39  
**Release qualification:** BLOCKED — owner-held Hidden Validation has not run

A PASS belongs to the source/package tree that was executed. A later pure documentation commit may carry that executable/package evidence forward only when Git compare proves there is no Runtime/package/test/dependency/CI change and that equivalence is explicitly recorded in #60/#39.

## 1. Implementation state

T-001 through T-017 are DONE. The terminal execution record is `docs/implementation/DomainHarness_v0.1_TASK_DAG.md`.

Frozen Product authority is repository-local at `docs/product/DomainHarness_v0.1_PRD_FROZEN.md` with SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`.

## 2. Historical visible candidate `edbe2b5` — PASS

The earlier historical candidate `edbe2b53c936107ba4dfbb4eef7aef5408c26b39` passed Tally, City Atlas, package/consumer, Critical Journey and full regression. Post-candidate review intentionally produced a hardened successor line, so this SHA is historical evidence rather than the final release identity.

Issue #40 was found during real plain-ESM/cross-domain execution, fixed, and visible gates were rerun before that historical candidate was accepted.

## 3. Post-candidate audit hardening — COMPLETE

### #49 / PR #50 / #51 — definition lock / frozen Script / canonical asset containment

Status: **MERGED / focused validation PASS**.

#51 validated the hardening on a clean Build Host, including definitionHash relocation/content behavior, frozen Script TOCTOU protection, canonical link containment, Loader negative cases, Script/Expression, recovery/process-crash and ESM-host coverage.

### PR #52 / #53 — canonical test flow

Status: **MERGED / PASS**.

Canonical `npm test` builds first and runs the plain-ESM host regression instead of silently skipping it.

### #54 / PR #55 — frozen PRD provenance

Status: **MERGED / checksum verified**.

The authoritative PRD was copied byte-for-byte into `docs/product/DomainHarness_v0.1_PRD_FROZEN.md` and verified against the frozen SHA-256.

## 4. Supplemental public validation

| Issue | Concern | Status |
|---|---|---|
| #41 | Node/OS/package-consumer compatibility | PASS |
| #42 | WAL/FULL abrupt-kill durability Windows + Linux | PASS — Windows 375/375 + Linux 375/375 = 750/750, zero corruption and zero duplicate non-idempotent side effects |
| #43 | waiting/send/cancel race stress | PASS — 8000/8000 |
| #44 | Child Workflow stress | PASS |
| #45 | Worker boundary/resource/timeout/cancel matrix | PASS |
| #46 | definitionHash / engine-major lock | PASS |
| #47 | non-idempotent side-effect-before-crash | PASS |
| #48 | long-run soak / SQLite consistency | PASS |

These public tests do not replace Hidden Validation.

## 5. Final visible successor qualification — #60 PASS

Exact executed SHA:

`1835f3f31ca483dc7bd997a545391f622d38be63`

Build Host:
- Windows 10 x64;
- Node v26.8.1;
- npm 11.19.0;
- fresh clean worktree; no local patching.

Results:

- `npm ci` PASS;
- lint PASS;
- typecheck PASS;
- canonical `npm test`: **117/117 PASS, 0 fail, 0 skipped**;
- `npm pack -w @kaicreator/domain-harness` PASS;
- plain Node ESM tarball consumer PASS;
- quality-hardening 4/4;
- loader 2/2 + loader-negative 12/12;
- Script 7/7 + Expression 10/10;
- recovery lifecycle 8/8;
- process-crash recovery 8/8;
- run lifecycle 8/8;
- Child Workflow 12/12;
- ESM-host focused regression 1/1;
- Tally external runner PASS;
- City Atlas external runner PASS;
- public export containment PASS.

#60 is closed as PASS.

## 6. SDK documentation-only successor handling

PR #66 added the complete SDK Reference, Agent Migration Guide and consumer indexes after #60.

The compare from `1835f3f...` to the PR #66 version-line head changed documentation files only. There were no changes under `packages/domain-harness/**`, no package/lockfile modifications, and no Runtime/test/CI changes. #60 records this comparison and carries executable/package evidence forward.

Future pure documentation-only commits may use the same rule only after an explicit Git compare confirms executable/package tree equivalence. Any Runtime/package/public-contract/test/dependency change invalidates this carry-forward and requires affected visible validation again.

## 7. Repository process state

- Documentation/process reconciliation #58/#64: COMPLETE / MERGED.
- Minimal Woodpecker configuration #59/#63: COMPLETE / MERGED.
- Woodpecker workflow static validation: PASS.
- Actual Woodpecker pipeline/status context #57: **ENV-BLOCKED** because the repository is not connected to a Woodpecker instance; not a Runtime defect.
- `main` branch protection/ruleset #56: admin follow-up after the real Woodpecker context is known.

## 8. Hidden Validation

Status: **NOT_RUN / owner-held**.

Run against the final intended version-line SHA tracked in #39. Held-out case source/fixtures must remain unpublished. Record opaque case IDs and PASS/FAIL/NOT_RUN/ENV-BLOCKED only.

A Hidden Validation Runtime/package defect invalidates the candidate and requires a focused fix, successor SHA and affected visible-gate rerun.

## 9. Current decision

```text
Frozen PRD: FROZEN / repository-local / checksum verified
Architecture: FROZEN / no contradiction
Implementation T-001..T-017: DONE
Post-candidate quality hardening: COMPLETE / MERGED
Canonical test flow: COMPLETE / MERGED
Supplemental durability #42: PASS 750/750
Successor visible regression #60: PASS — 117/117, 0 skipped
Package/plain-Node consumer: PASS
Tally / City Atlas successor runners: PASS
SDK Reference / Agent Migration Guide: PUBLISHED ON v0.1
Woodpecker actual run #57: ENV-BLOCKED — repository not connected
Branch protection #56: PENDING ADMIN ACTION
Hidden Validation: NOT_RUN
Release Qualification: BLOCKED
Tag/publish: NOT AUTHORIZED
```
