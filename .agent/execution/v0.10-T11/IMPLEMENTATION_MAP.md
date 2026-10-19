# T11 — Tests → Contract → Implementation → Failure Handling → Reference

**Version pin:** v0.10@a420807413c33f8dfb9cbc4c1f6628f8f47eb385. Check exact `v0.10` before accepted Builder Claim.

## Reuse existing source, not a synthetic new runtime
- `examples/v09-clean-consumer/README.md` and `consumer.mjs` as packaging/externally installed consumer *pattern*, not as v0.10 proof.
- `packages/domain-harness-compiler/src/qualified-package/v10build/build.ts` and `activation.ts`: actual BUILD static seal + public selected K/S/B/C/feature runtime.
- `packages/domain-harness-compiler/src/qualified-package/v10build/deployment.ts`: T08 authorized A/B deployment selection and immutable old in-flight pins.
- `packages/domain-harness-compiler/src/qualified-package/v10shadow/shadow-l4-readonly.ts`: T07 read-only selected K physical observer.
- `tests/hosts/node/v010-c01-external-effect-physical.test.ts`, `v010-t03-workflow-control-physical.test.ts`, `v010-t07-shadow-l4-physical.test.ts`, `v010-t08-governed-build-activation.test.ts`, `v010-t10-selected-app-query.test.ts`: accepted focused physical counterexamples to wire through real consumer.
- `tests/critical-journeys/node/process-kill-recovery.test.ts`: recoverable child crash/harness outline.

## Minimum durable new sources
- `examples/v010-clean-consumer/tiny/`: its own actual build+install recipe, artifact manifest, runtime and logs.
- `examples/v010-clean-consumer/rich/`: independent build/pack/install, >=2 real K extension module files + >=3 real S feature module files, 2 B and C.
- `tests/integration/v010-clean-consumers/` or `tests/critical-journeys/node/v010-*.test.ts`: external installed consumer orchestration, real sqlite witness and assertions; one receipt/log manifest per scenario.
- `examples/v010-clean-consumer/README.md` documented fixed-SHA rebuild runbook. Avoid hard-coded local absolute paths.

## Suggested minimal execution order
1. Inspect T08/Rich ABI closure; create Tiny clean-install CLI witness (verify no advanced package installed).
2. Independently build/install Rich and measure physical package selected module graph; invoke each extension/feature in real selected App.
3. Reuse K02/T10 proofs for two B scoped queries and pin/journal isolation; thread through installed Rich App.
4. Layer selected Decision→Workflow→Memory/Context/Agent interactions, then external C01 two-adapter end-to-end and fault negative.
5. Combine K01 competing writers, K02 17+ turns/lost Disposition, T07 zero-write Shadow, T08 authorized new BUILD/old pinned resume.
6. Execute focused real Node24+SQLite clean-install suite and exact-head CI. Record genuinely NOT_RUN scenarios, never infer release pass from green build.

Check each manifest against the frozen L2 R3 §H, Issue #1180 and selected Task DAG before claiming acceptance. If a real implementation contract gap is demonstrated, raise an exact path/counterexample owner issue rather than expanding T11 fixture authority.
