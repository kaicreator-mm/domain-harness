# DIS v0.2.0 — minimal reproducible evolution Demo (Product/L1 R2)

This is a **standalone one-file self-verification demonstration**, not a production implementation of KDP, DomainHarness SDK, Domain-Forge, a real LLM provider or AOT build.

Run from the repository root:

~~~sh
node --check examples/dis-v020-evolution-demo/demo.mjs
node examples/dis-v020-evolution-demo/demo.mjs
~~~

Expected final line on a compatible Node runtime: `{"status":"PASS_SIMULATED","tests":25,...}`. It runs **10 named positive cases (E01–E10) and 15 adversarial/negative cases (N01–N15)**, all implemented using Node's built-in `assert` and crypto; no dependency installation and no external network/device effects. The self-verification was run locally using **Node v22.16.0**; **Node24/CI are NOT RUN**. The repository's project CI requirement remains Node >=24.

## Reference flow

AOT-first → mock bounded Harness/FakeLLM → in-process verified Experience → exact cache with source + version + scope → source-cohort de-duplication → mock Rule Candidate → closed rule-data AST → grouped Holdout + Negative qualification → future-Task local activation / security revoke → consent-flagged minimal Server feedback → independently qualified simulated new Package digest.

The independent fixture oracle uses a private `WeakMap` so the FakeLLM input cannot read the expected result. In-process provenance tokens and qualification receipts use private `WeakSet`; **these are illustrative, not authenticated cross-process receipts**. The fixed-path interpreter is intentionally tiny: no user code, dynamic Tool or external Effect is allowed.

## Limits and safe fallback

- FakeLLM returns deterministic fixture proposals. **No real model was called** and no semantic generalization claim is supported.
- The "independent" fixture oracle is a test double for real Domain evidence; source cohorts are labelled fixtures, not a proof of real-world statistical independence.
- Local activation/rollback/Task pin is simulated in memory. Durability, cross-process signing, concurrent writes, time-of-check/time-of-use races, device/Host effects and production security are **not validated**.
- Server Meta and AOT produce a simulated digest object, **not a real signed/released Domain Package**.
- If a production SDK does not provide a trusted bounded interpreter/validator/atomic pin/revocation API, R2 requires **Candidate + Shadow only**, with no local executable Rule activation.
- The 12 adversarial findings from [R2 review](../../docs/standards/domain-intelligence/DIS-0.2.0/ADVERSARIAL_REVIEW_R2.zh-CN.md) are **design-mitigated**; this test alone does not close production P0 gates or authorize L2 Freeze.

For the full modular local demo and per-test `node:test` suite, see the user-visible bundle delivered with this review (ZIP SHA256 `8998fbf790e216666a1368f646faf5473d63d648dbdfb1953b384ca89360eab1`). That bundle is not a GitHub CI artifact.
