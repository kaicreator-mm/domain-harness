# T01 source map at `v0.10@32b6e776`

Allowed output: `docs/roadmap/DomainHarness_v0.10_HISTORICAL_CAPABILITY_CROSSWALK.md` only. The six `.agent/execution/v0.10-T01/` pack files were created by the scheduler **before** Builder Claim; they carry no Product/K runtime code and are excluded from package output.

Source inputs (read-only):
- `docs/implementation/DomainHarness_v0.8_RETAINED_FUNCTION_MANIFEST.json` exact blob `a9954b82eab6e57e9ac1af1bf7b7d5b268d61c49`
- `docs/validation/v08-retained-44-web-source-evidence-map.md` exact blob `7c218c569077be98e4252ca6d1d67a56d9368571`
- `packages/domain-harness/src/public-v9/index.ts` blob `10746676bb6312bcb459c624f684f0286d7c8aaa`
- `packages/domain-harness/src/public-v9/contracts.ts` blob `8437f9860a788b3eca2fdcc91d135aa3eb0d446a`
- `packages/domain-harness/src/public-v9/operation-bridge.ts` blob `66a7404d265d9f1dbddbe34cf03bf359fa89e381`
- `packages/domain-harness-compiler/src/qualified-package/v09/` selected router + `v09build/`
- `packages/domain-harness/tests/v09-*.test.ts`, `packages/domain-harness-compiler/tests/v09-*.test.ts`, `packages/domain-harness-node/tests/store/v09-*.test.ts` selected-source witnesses
- Frozen Product R3/A01, L2 R3, DAG Stage2.4.

Tests → Contract → Implementation → Failure Handling → Reference are bound by this Pack. Reader classification is per *selected published v09 path*, not whole source tree. Never treat old v08 P/N test file as public v09 witness without independently observed bridge reachability.
