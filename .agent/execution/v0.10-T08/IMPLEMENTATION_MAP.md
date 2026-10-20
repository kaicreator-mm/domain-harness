# T08 — Tests → Contract → Implementation

**Version scope:** frozen issue #1175, L2 R3 §F and canonical K occurrence tuple; base `b8acbf46614ecb600d13a0f320f78af92e391bb9`.

## Implemented surface (R1 repair)
- `packages/domain-harness-compiler/src/qualified-package/v10build/deployment.ts`: Host-owned exact decision + closure verification, create-only activation ledger, immutable occurrence→BUILD pin CAS, and the split `CURRENT` / `PINNED_ONLY` activation paths. `CURRENT` re-checks the promotion window and current unrevoked authority verdict; `PINNED_ONLY` restores from the durable accepted record + exact BUILD/closure/tenant/deployment identity, tolerates ordinary promotion-window expiry by re-verifying the durable acceptance instant, refuses explicit revocation, missing/corrupt records and wrong versions, and never mints a new acceptance.
- `.../v10build/index.ts`: the public governed activation surface; no raw facade bypass.
- `tests/hosts/node/v010-t08-governed-build-fixture.ts`: two real independently BUILT A/B versions, trusted test authority, physical SQLite row helpers, T0/T1/T2 instants.
- `tests/hosts/node/v010-t08-governed-build-activation.test.ts`, `v010-t08-governed-decision.test.ts`: the original six P/N witnesses.
- `tests/hosts/node/v010-t08-pinned-restore.test.ts` + `v010-t08-pinned-restore-child.ts`: the R1 T0/T1/T2 real-second-process expiry witness and revocation/missing/corrupt/wrong-version/unpinned negatives.

## Existing seams to inspect
- `packages/domain-harness-compiler/src/qualified-package/v10build/build.ts`: trusted BUILD output, exact selected closure and subject digest.
- `.../v10build/activation.ts`: actual selected App facade, private activated deployment tuple and `v10K02DocumentPrefix()` write-path authority; T07's `selectedShadowBinding` read-only evidence must remain non-authoritative.
- `.../v10build/index.ts`: approved public BUILD/activation exports; avoid extending public send/query with version-selection parameters.
- Existing actual K02/Host SQLite E2E suites; prefer `tests/integration/package-versioning` and targeted `tests/hosts/node` as necessary.

## Minimal intended approach
1. Introduce a **Host-owned, immutable exact BUILD activation decision**: logical stable deployedAppId + tenant/app + new BUILD subjectDigest + sealed closure/version + authentic external authorization reference; bounded typed verification before activating B. Never accept `candidate.approved` or a Shadow report as approval.
2. Pin each admitted occurrence to its original full Build/Host scope; maintain a durable lookup surviving process restart (real CAS where needed), with no `latest` pointer used to resume an old occurrence. If existing K02 store already provides binding, reuse it instead of a second SoR.
3. B activation changes where **new** occurrence creation is routed, not live A's Kernel/facade/State/Journal/Effect. Retry of same authorized deployment decision is deterministic, incompatible decision refused.
4. Use actual two independent BUILD A/B, same stable deployedAppId but different subjectDigests on physical Node24 SQLite. Exercise A old send/replay/changed-input rejection after B new admission and after restart.
5. Preserve T07 exact per-deployment Shadow evidence and T10 authorized multi-B query behavior. Do not mutate K02 original receipt to satisfy a new test.

Exact files and TS ABI are subject to current source readback and smallest accepted L3 write set. Record intentional tradeoffs and no-production-write boundaries in PR.
