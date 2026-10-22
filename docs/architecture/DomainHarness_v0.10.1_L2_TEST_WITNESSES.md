# v0.10.1 L2 — Executable witness and acceptance map (PROPOSAL, NOT_RUN)

**Product:** #1274, PR #1284 R2, blob PRD `52b7169f62f040f9c869b288a7e78639473642db`.
**L2 issue:** #1286; **L2 stage:** candidate/unreviewed; no Task DAG or Host qualification.
**Physical** Node24/npm pack/SQLite/CI: NOT_RUN.

| Witness | Expected truth | Layer / narrow issue |
| --- | --- | --- |
| W01 no optional S Features | Tiny app retains same selected K/S/B/C and original v0.10 results | BUILD + physical Host |
| W02 four individual S Features | each module independently selected with `requires=[]`; no other new Feature installed/imported | C01–C04 + BUILD |
| W03 all 16 subsets | each selected closure has exactly the desired Feature provider keys and byte pins | BUILD/integration |
| W04 duplicate provider | `V10_FEATURE_COLLISION` before module evaluation | existing BUILD |
| W05 wrong S ABI | `V10_ABI_UNSUPPORTED` before module evaluation | existing BUILD |
| W06 bad digest | `V10_DIGEST_MISMATCH` before module evaluation | existing BUILD |
| W07 synthetic missing `requires` | `V10_FEATURE_MISSING` in selected closure, not a requirement of the real C01–C04 | existing BUILD |
| W08 forbidden static Node import | `V10_IMPORT_POLICY_DENIED` with hash recomputed, not confused with W06 | existing BUILD |
| W09 present-but-noncallable `featureExport` | `V10_FEATURE_ABI_INVALID` only at selected invocation, not static BUILD | existing facade |
| W09b missing/extra namespace export | missing declared export, missing `init`, or extra `*Error` export → `V10_EXPORT_CONTRACT_REFUSED` during selected activation before init | existing activation |
| W09a advisory init-return ABI | All four selected S Feature `init(context)` outputs carry `ok`, `featureKey`, `observedContext` but never undeclared top-level `appId`; intentional invalid init returns `V10_INIT_CONTRACT_REFUSED` during activation | selected activation |
| W10 C01 normalized event evidence | consistent first observed failure and ambiguity; repeats are *candidates*, never ROOT verified | C01 |
| W11 C02 oracle validity | matched cases + positive/negative/independent verifier and holdout valid; bad negative and hidden leak -> no winner | C02 |
| W12 C03 stale memory | current exact rules/scope override stale/correlated historical memory; safe review candidate still possible | C03 |
| W13 C04 safe bounded experiment | proposal with positive budget and verifier, **no Tool invocation or Effect permission**, real Shadow proof separate | C04 |
| W14 `request` injected effector/getter | T05 `extensions/agent-improvement/host/ct02-data-only-invoker.mjs` four-key allowlist denies request callbacks/getters via `FEATURE_INPUT_NOT_PLAIN_DATA`, no selected invocation or effect | T05 Host adapter |
| W15 `trustedDependencies` injected effector/getter | same single Host adapter typed denial for dependencies; no effect | T05 Host adapter |
| W15b T02 lawful callbacks survive | in the same Rich App, T02 SemanticDecision with callable model/tool/now and `procedures:Map` still uses existing facade and succeeds; T05 four-key adapter MUST NOT intercept | old T02 Host and integration |
| W16 ambient I/O (direct free globals) | producer-path-only Acorn/locked ESLint delta flags `fetch`, `WebSocket`, `process`, `globalThis`, timers and Buffer; existing `import-policy.ts` already handles eval/Function/require/constructor/import and MUST NOT be duplicated; aliases remain unproven | trusted Package source audit |
| W17 Rich clean install | each producer `npm pack`/isolated install, sealed exact source bytes; root integration tests `tests/hosts/node/v0101-feature-suite.test.ts` and `tests/conformance/v0101-sdk-features.test.ts` picked up by existing test:root globs; all four CT-02 features actually invoked | T05 integration |
| W18 old v0.10 critical journeys | immutable prior K Effect/restart/UNKNOWN, Shadow isolation, Tiny/Rich baseline unchanged | R01 |
| W19 Claim/governance | not selected/unapproved Feature cannot execute state-changing business operation, #1267 (separate owner) not bypassed | K Primary/Host |
| W20 source/release | exact SHA, CI/live tests / genuine independent code review, release packaging evidence all truthful | R01 |

**CAUTION:** W01–W20 plus W09a/W09b/W15b are *future scenarios*, not current test pass counts. Existing Draft PRs include local `node:test` and source probes but do **not** collectively prove W14–W19 or any Node24 physical result.
