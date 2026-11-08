# DIS v0.2.0 — real existing KDP/SDK Effect seam Demo

Run **from the monorepo root after the ordinary dependency installation and build**:

~~~bash
node --check examples/dis-v020-sdk-integration/test.mjs
node --test examples/dis-v020-sdk-integration/test.mjs
~~~

This test imports the **actual repository's**:
- `domain-packages/kernel/basic/kernel-mechanism-v1.mjs` (selected Kernel Domain Package ABI);
- `packages/microkernel/dist/index.js` (public `load` facade);
- `packages/microkernel/dist/internal/external-effect.js` (existing trusted Host Effect gate, **internal test seam**).

It exercises denial and dispatch including **physical writes to private temporary files only**, which are deleted after each test. No network, device, external account, GitHub mutation, model Provider or public release. Native file access in a test-only adapter is **not** proof arbitrary untrusted native modules are sandboxed. `readAuthorityView` is **a test double** in this new suite: the **real selected K** authority is exercised separately by the existing repository test `tests/assembly/v010-c01-external-effect.test.ts`.

Woodpecker source: `.woodpecker/dis-v020-integration.yaml`:
- Uses **whatever Node is installed on the assigned worker**; no exact version gate in this Demo pipeline.
- `npm ci`, `npm run build`, direct import/physical-file-gate test, then existing **real Build → KDP → admission → journal → permit → Host gate → external adapter** C01 assembly suite.
- It is subject to actual npm dependency/runtime compatibility. Other existing release workflows may have historical Node24-specific requirements, which this Demo does not alter.

Current self-verification limits: the exact **existing Microkernel dist gate Git Blob `4e76f700769eb24ff15cbcb0dfd0e6f696fe3ad2`** was fetched and its code executed in an isolated V8 harness, with **8/8 behavior assertions PASS** (no physical file writes in that isolated run). This new `test.mjs` has had local Node syntax verification but its imported full repository checkout **has not run in this environment** (GitHub cannot be cloned directly here). CI must provide real module/import/physical proof. No production KDP/SDK v0.2.0 ABI is claimed.

**Status:** DESIGN_INTEGRATION_READY / LIVE_SOURCE_GATE_8_PASS / REAL_CHECKOUT_TEST_NOT_RUN / WOODPECKER_NOT_CONFIRMED.

See [DIS v0.2.0 R3 source mapping](../../docs/standards/domain-intelligence/DIS-0.2.0/REAL_KDP_SDK_SEAM_R3.zh-CN.md).
