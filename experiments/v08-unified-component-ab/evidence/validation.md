# Exact execution evidence — #942

Source ref: `spike/v08-unified-component-ab-942`.

## First iteration (deliberately retained failure evidence)

- Commit `30546b1bd6773e1b9222ef0f5e849afe5641ff26`, tree `8a7610634f24d8eeab7e6f0816fe55fb4f1b3485`.
- [GitHub Actions run 37787128225](https://github.com/kaicreator-mm/domain-harness/actions/runs/37787128225): **18 total, 16 passed, 2 failed** (Node v22.23.3). One invalid fixture access (`providedCapabilities` vs `providesCapabilities`), one real stale semantics defect (new Rule definition digest without new runtime behavior).
- No false PASS for this SHA.

## Corrected execution

- Commit `34a36574d1cde7b9aad365a8878921325f3b9dcc`, tree `645b64164f706da6f0ae37a5cc575aba8be91c15`.
- [GitHub Actions run 37787308653](https://github.com/kaicreator-mm/domain-harness/actions/runs/37787308653), Linux GitHub Actions runner / Node 22.23.3, command `node --import tsx --test experiments/v08-unified-component-ab/tests/*.test.mjs`, **18 tests, 18 passed, 0 failed, 0 skipped**, command Exit 0, job conclusion success.
- The runner checked out exactly the test commit; it fetched and verified the independent frozen oracle `version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521` and independent Package-first reference `beea9cdd29c51a046b8612871aa53be54b966e7c` via detached worktrees.

## Conformance matrix — bounded execution only

| ID | Tested result | Limit |
|---|---|---|
| U01 | PASS — Schema node exists, callable attempt refused | No Schema interpreter resource lifecycle |
| U02 | PASS — Rule current Definition + typed input | Partial JSON schema evaluator |
| U03 | PASS — Decision 0/1/N, deterministic tie and selection receipt | No durable replay |
| U04 | PASS — Workflow WAIT → new admitted input → COMPLETE | No actual persisted resume of occurrence |
| U05 | PASS — Pure Op and effectful authority rejection/referral | Fake injected effect port, no durable journal |
| U06 | PASS — real v0.7 validators/Tool selector/content+graph digest unchanged through A view | Real T002 Assembly/T004 Invocation NOT_RUN |
| U07 | PASS — five Kind shared graph/Assembly/Binding, custom open Kind | B native Package manifest loader NOT_TESTED |
| P03 | PASS — missing/duplicate/version-mismatched Provider | No cross-target host ABI proof |
| P04 | PASS — cross-package resolution, undeclared op/caller/cycle refusal | Only declared limited fixture graph |
| W01 | PASS — bounded 0/1/N WAIT/selection | No persistence/replay |
| V02 | PASS — same SDK Definition and implementation identities across Approval and Learning | Toy narrow apps only |
| P01/P02 reference | PASS — actual #938 3/4 Package bootstrap with exact pinned manifests | Original #938 reference is not production runtime |

## Verdict interpretation

```ini
A_UNIFIED_RUNTIME=PARTIAL
B_UNIFIED_SCHEMA=PASS_BOUNDED_TOY
STANDARD_KINDS=5
U01_U07=PASS_BOUNDED_ALL_7
PACKAGE_COMPOSITION=PASS_BOUNDED_WITH_938_LOADER
V07_IDENTITY_COMPATIBILITY=PARTIAL
V07_PRODUCTION_PARITY=NOT_TESTED
GATE_B=NOT_TESTED
REAL_GITHUB_LINUX_HOST=PASS_AT_34a3657
DESIGNATED_WINDOWS_ECF_BUILD_HOST=NOT_RUN
FORMAL_V08_IMPLEMENTATION=NOT_STARTED
MAIN_MERGE=NO
```

No broader release/Hidden Validation/production equivalence/Android parity conclusions follow.
