# DomainHarness v0.1 — Version Closeout / Release Qualification

**Product:** Domain Harness Runtime  
**Package:** `@kaicreator/domain-harness`  
**Version:** v0.1  
**Current verdict:** **BLOCKED**  
**Reason:** owner-held Hidden Validation remains; Woodpecker runtime integration/branch protection are separate environment/admin follow-ups

## 1. Frozen authorities

- Product authority: `docs/product/DomainHarness_v0.1_PRD_FROZEN.md`, SHA-256 `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`.
- Architecture authority: `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`.
- Architecture baseline: `819e6587a5d4877b69a506f2259a0a35b4c38aff`.
- Standard revision: `0446f04583f6cf464c835f26e2f657c8b703cb4e`.
- Terminal Task DAG: `docs/implementation/DomainHarness_v0.1_TASK_DAG.md`.

No closeout action may reopen the frozen product scope merely to simplify validation or packaging.

## 2. Implementation state

T-001 through T-017 are complete. v0.1 includes the embedded SDK, private XState control adapter, Harness loading/static validation, all five Step kinds, waiting events, SQLite journal/recovery, definition/engine lock, package assembly and cross-domain validation assets.

## 3. Post-candidate audit closure

Completed and integrated into `v0.1`:

- #49 / PR #50 / #51 — definitionHash relocation stability, frozen Script bytes and canonical asset containment; focused validation PASS;
- PR #52 / #53 — canonical `npm test` builds first and executes plain-ESM host regression;
- #54 / PR #55 — frozen PRD imported byte-for-byte and checksum verified;
- #42 — Windows NTFS 375/375 + Linux ext4 375/375 abrupt-kill matrix PASS, total 750/750;
- #59 / PR #63 — minimal Woodpecker workflow merged;
- #58 / PR #64 — documentation/process reconciliation merged;
- PR #66 — complete SDK Reference, consumer entry point and downstream Agent Migration Guide merged.

## 4. Successor visible qualification — PASS

Executable/package tree validated by #60:

`1835f3f31ca483dc7bd997a545391f622d38be63`

Recorded evidence:

- clean `npm ci`, lint and typecheck PASS;
- canonical `npm test`: **117/117 PASS, 0 fail, 0 skipped**;
- package/tarball PASS;
- fresh plain Node ESM consumer PASS;
- public export containment PASS;
- quality/definition-lock and Loader negative suites PASS;
- Script/Expression suites PASS;
- recovery/process-crash/lifecycle/Child suites PASS;
- Tally runner PASS;
- City Atlas runner PASS.

Issue #60 is closed as PASS.

## 5. Documentation-only successor policy

SDK documentation was added after #60. Git compare proved those commits changed documentation only and did not modify `packages/domain-harness/**`, package/lockfile state, Runtime, tests, dependencies or CI. #60/#39 explicitly record the executable/package validation carry-forward.

The exact intended final version-line SHA is tracked in #39 rather than hard-coded here so a documentation-only record correction does not make this closeout document self-stale.

A future Runtime/package/public-contract/test/dependency change **does** invalidate the carry-forward and requires a new candidate plus affected visible-gate reruns.

## 6. Hidden Validation

Status: **NOT_RUN — owner-held case set**.

Run only on the final intended version-line head tracked in #39. Public supplemental tests are not substitutes. Record held-out results with opaque case IDs without publishing the held-out fixtures/source.

A Hidden Validation Runtime/package defect invalidates the candidate and requires a focused fix, new successor SHA and affected visible validation.

## 7. Repository/process follow-ups

- #57 — Woodpecker workflow configuration/static validation is available, but actual execution is **ENV-BLOCKED** because this repository is not connected to a Woodpecker instance. The emitted GitHub status context is therefore unknown.
- #56 — `main` branch protection/ruleset requires repository admin action after #57 establishes the real Woodpecker context.

These process items do not represent Runtime test failures and do not reopen product scope.

## 8. Final integration / release rule

After Hidden Validation PASS and no unresolved P0/P1 Runtime blocker:

1. merge the validated `v0.1` line to `main` according to project branch policy;
2. if the merge produces a different main commit SHA, verify tree equivalence and perform any required final main smoke evidence;
3. update this verdict to `READY` with the exact final release SHA/evidence;
4. only then create the v0.1 tag/baseline and authorize publish/release.

No v0.1 release tag or publish authorization is recorded yet.

## 9. Known v0.1 boundaries

Intentional non-goals remain unchanged: no Static Parallel Composition, generic DAG Runtime, dynamic spawn, full XState DSL/history, distributed execution/server, PostgreSQL/storage abstraction/ORM, generic Admin Console/visual designer or hostile-code Script sandbox. Child Workflow remains same-Harness only.

Current Script implementation executes Loader-frozen JavaScript ESM source in a Worker; it does not transpile TypeScript Script assets at runtime. Consumers use executable JavaScript/ESM assets or precompile before Harness load.

## 10. Current closeout verdict

```text
Product scope: FROZEN
Architecture: FROZEN
Implementation T-001..T-017: COMPLETE
Post-candidate quality/test hardening: COMPLETE / MERGED
Frozen PRD provenance: COMPLETE / MERGED
Supplemental durability #42: PASS 750/750
Successor visible regression #60: PASS — 117/117, 0 skipped
Package/plain-Node consumer: PASS
Tally / City Atlas successor runners: PASS
SDK Reference / Agent Migration Guide: PUBLISHED ON v0.1
Woodpecker actual run #57: ENV-BLOCKED
Branch protection #56: PENDING ADMIN ACTION
Hidden Validation: NOT_RUN
Release Qualification: BLOCKED
Tag/publish authorization: NO
```

This document may change to `READY` only after owner-held Hidden Validation passes on the final intended candidate, the validated version line is integrated to `main`, and no unresolved P0/P1 Runtime blocker remains.
