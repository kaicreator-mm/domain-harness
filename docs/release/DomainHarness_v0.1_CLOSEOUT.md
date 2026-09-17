# DomainHarness v0.1 — Version Closeout / Release Qualification

**Product:** Domain Harness Runtime  
**Package:** `@kaicreator/domain-harness`  
**Version:** v0.1  
**Current verdict:** **BLOCKED**  
**Reason:** final successor candidate has not completed its exact-SHA visible rerun or owner-held Hidden Validation

## 1. Frozen authorities

- Product authority: `docs/product/DomainHarness_v0.1_PRD_FROZEN.md`.
- Frozen PRD SHA-256: `4f19317dc46ae1eb888ff99bd4f50a21246483895fab16086341d0222a60e440`.
- Architecture: `docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`.
- Architecture baseline: `819e6587a5d4877b69a506f2259a0a35b4c38aff`.
- Standard revision: `0446f04583f6cf464c835f26e2f657c8b703cb4e`.
- Terminal Task DAG: `docs/implementation/DomainHarness_v0.1_TASK_DAG.md`.

The PRD was imported byte-for-byte via #54/#55; closeout must not rewrite it or reopen scope.

## 2. Implementation state

T-001 through T-017 are complete. Frozen v0.1 functionality includes the embedded TypeScript SDK, private XState v5 control adapter, Harness asset loading/validation, five Step kinds, SQLite journal/recovery, waiting lifecycle, definition/engine lock and package-root SDK.

## 3. Historical visible-qualified candidate

`edbe2b53c936107ba4dfbb4eef7aef5408c26b39` passed the visible release gates recorded in #39, including Tally, City Atlas, clean package/consumer regression, Critical Journey and focused recovery/Worker suites. It remains historical evidence, not the intended final candidate after the post-candidate hardening.

## 4. Post-candidate audit work completed

- **#49 / PR #50 / #51:** definitionHash relocation stability, frozen Script bytes and canonical asset containment — focused Build Host validation PASS; merged into `v0.1` as `1a4ad8ea17cc1e5ac81d138b41364ea95b5ac56e`.
- **PR #52 / #53:** canonical `npm test` now builds first and executes the plain-ESM host regression — clean checkout 113/113 PASS, 0 skip; merged as `b930c1bd39aae933d25e59c1ed99b1534f9ea7c1`.
- **#54 / PR #55:** frozen PRD imported byte-for-byte with checksum verified; merged as `3acacf447c4510733e38881310679c823061664f`.

## 5. Documentation / CI / repository process

- documentation reconciliation: #58 / `v0.1_docs_closure`;
- minimal Woodpecker workflow: #59 / PR #63;
- actual Woodpecker run + emitted GitHub status context: #57;
- `main` branch protection/ruleset: #56, requires repository admin action after #57 establishes the real context.

Minimal CI is intentionally limited to clean checkout install, lint, typecheck and canonical tests. Cross-platform crash/soak/cross-domain/Hidden Validation remain outside per-PR CI.

## 6. Remaining release gates

Before `READY`:

1. merge docs/process concerns;
2. freeze one exact successor `v0.1` SHA;
3. execute #60 on that exact SHA, including clean package/consumer, quality/definition-lock, Script/Expression, recovery/process-crash and Tally/City Atlas affected gates;
4. complete or explicitly disposition supplemental #42 without claiming a Linux/ext4 PASS until evidence exists;
5. execute owner-held Hidden Validation on the exact successor candidate;
6. verify no unresolved P0/P1 release blocker;
7. update this file to `READY` only with exact evidence;
8. then integrate/freeze the final baseline and create the release tag if authorized.

## 7. Hidden Validation

```text
NOT_RUN — owner-held case set
```

Public supplemental tests are not substitutes. A Hidden Validation defect invalidates the candidate and requires a focused fix plus affected-gate reruns.

## 8. Supplemental durability status

#42 was reopened during audit because its own completion criterion requires both Windows and Linux. Recorded evidence currently proves Windows NTFS 375/375; Linux/ext4 must be appended before #42 may close as a two-OS PASS.

## 9. Known v0.1 boundaries

Intentional non-goals remain: Static Parallel Composition, generic DAG Runtime, dynamic spawn, full hierarchical XState DSL/history, distributed/server control plane, PostgreSQL/storage abstraction/ORM, generic Admin Console/visual designer, hostile-code Script sandbox; Child Workflow remains same-Harness only.

## 10. Current verdict

```text
Product scope: FROZEN
PRD provenance: COMPLETE / checksum verified
Architecture: FROZEN
Implementation T-001..T-017: COMPLETE
Historical candidate edbe2b5: VISIBLE GATES PASS
Post-candidate quality hardening: MERGED / focused PASS
Canonical test-flow hardening: MERGED / PASS
Docs/process closure: IN PROGRESS
Exact final successor candidate: NOT YET FROZEN
Successor visible rerun: NOT_RUN
Hidden Validation: NOT_RUN
Release Qualification: BLOCKED
Tag/publish authorization: NO
```

`BLOCKED` remains the only valid release verdict until the remaining gates complete.
