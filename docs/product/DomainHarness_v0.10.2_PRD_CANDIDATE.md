# DomainHarness v0.10.2 — Microkernel + Domain Package Platform Convergence PRD (CANDIDATE)

**Status:** `L1_PRODUCT_CANDIDATE / PRODUCT_FREEZE_NOT_RUN / L2_NOT_FROZEN / TASK_DAG_NOT_ADMITTED / IMPLEMENTATION_NOT_AUTHORIZED`.
**Ownership:** Parent [#1300](https://github.com/kaicreator-mm/domain-harness/issues/1300); scope children #1301–#1310.
**Target branch:** `v0.10.2`, created from `main@fdf6086881cc53b4c03be1b9db837f7c535f5bd2` (tree `68d27260103757e79c8eb3821315b14e8070d10d`), the merge of [PR #1313](https://github.com/kaicreator-mm/domain-harness/pull/1313) that integrated the qualified v0.10.1 version branch. Branch creation is **not** a Release qualification.
**Predecessor:** v0.10.1 R01 [#1291](https://github.com/kaicreator-mm/domain-harness/issues/1291) `RELEASE_PASS=YES` at version HEAD `8b3c93141dc5ee224ad6826cf2e5900a24f019b8`; physically tested source `568a38a4730fdcf29bc8bf461e74bf33a50cbe68` (lock blob `c16147cd27d2aa5170b32186a71956cd391035e6`, unchanged at the base above). No `v0.10.1` tag exists at this writing; the version tag is a separate predecessor action and is not claimed here.
**ADS pin:** `4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd` at inherited `.dev-standard/VERSION`.
**Architecture:** CV-01..CV-12 (`docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md` blob `267c49fefd74b3fef9241e8eaccd02157702ac94`) inherited unchanged.

This document is the **clean normative snapshot** requested by Product R2 P2-R2-01. It consolidates, without expanding, the reviewed intake chain on #1300: [R1 pre-review](https://github.com/kaicreator-mm/domain-harness/issues/1300#issuecomment-6360249094) (`REQUIRES_AMENDMENT`, P0=2/P1=7/P2=6, historical and immutable), [R1 reconciliation](https://github.com/kaicreator-mm/domain-harness/issues/1300#issuecomment-6360379242), [independent Product R2](https://github.com/kaicreator-mm/domain-harness/issues/1300#issuecomment-6360637251) (`PASS`, P0=0/P1=0/P2=2), [Controller PD-01..03](https://github.com/kaicreator-mm/domain-harness/issues/1300#issuecomment-6360702987) and the Freeze candidate R0 comment. Where older issue-body wording ("subscribe if present in retained semantics", an unqualified "mixed C package") differs, **§4 of this document controls**.

## 1. Product problem

v0.10/v0.10.1 deliver a working closed-world selected K/S/B/C composition, but its runtime is not a consumable platform:

- The de-facto Microkernel (`activateV10App`/`V10AppFacade`, sealed import hook, `resources.call` dispatch), the trusted Effect gate and the deployment ledger live inside the BUILD compiler package `@kaicreator/domain-harness-compiler` and are exported as `./v10build`. The installed Tiny/Rich consumers therefore install the compiler and its declared dependencies (`ajv`, `jsonata`, `typescript`, `yaml`) at runtime.
- The current Node24 Host (SQLite CAS, durable controls, scoped memory, authorized multi-B query) lives under the legacy-named `packages/domain-harness/src/host-v8/`, beside obsolete v2–v9 surfaces.
- K Primary and S Primary are shipped as compiler payload files; v0.10.1 added a fourth layout (`extensions/agent-improvement/packages/*`).
- No single current public SDK, Package contract reference, author guide or documentation route exists; README/docs/sdk drift to v0.1–v0.7.

## 2. One Product objective

Deliver an independently consumable **Microkernel SDK + selected K/S/B/C Domain Package set + Host/BUILD tooling** with a clean public API, reproducible Node24 runtime artifacts, one current documentation/authoring route and real Tiny/Rich/external-producer journeys — **by moving selected existing code, preserving behavior and K authority**. This is a structural release: no new runtime, no Agent/platform feature expansion.

## 3. Release domains

| Domain | Scope Issue | Required Product end-state |
| --- | --- | --- |
| Microkernel & K/S/B/C authority boundaries | #1301 | Existing `activation.ts`/`import-hook.ts`/`guards.ts`/`errors.ts` **move** into the Microkernel runtime; no second loader beside them. K Primary remains sole CAS/Admission/Journal/Effect/Replay/UNKNOWN authority. Optional K extensions / S features stay independently selected. |
| Physical layout & active Host/producer paths | #1302 | One owner per shipped module. `host-v8` is **SPLIT**: v0.10-selected subset migrates to the Node Host / shared contracts, only proved-unselected residue is archived/removed. `domain-harness-node`, `domain-harness-expo`, `examples/expo-conformance` receive an explicit fate (no Expo support obligation). BUILD separated from runtime. v0.10.1 feature packages relocate move-only. |
| Current docs & preserved evidence index | #1303 | Root/docs/sdk route current to v0.10.2; one normative Package/ABI reference; immutable archive pointers for historical PRDs/evidence. |
| Domain Package Manifest/ABI, Tool vs non-Tool | #1304 | Existing role ABI preserved (§4 PD-01). Private helpers are not Tools; selected S/Feature/Kind semantics are not generic Tools; C Operations keep module-level trusted `externalEffect` classification and the K-permit path. |
| Package author guide & templates | #1305 | Runnable pure non-Tool S Feature, B with private helper, and C Tool examples through the official BUILD entry; the mixed example uses two C modules (PD-01). No deep compiler/example import. |
| Tiny/Rich runnable Apps | #1306 | Physically installed selected modules. K/S Basic Tiny imports no optional K-extension/S-feature/Agent/Memory/Effect-adapter module. Rich retains multiple B/C, real CAS/UNKNOWN/Shadow. |
| Public production SDK | #1307 | One supported safe public Facade: `load/send/query/subscribe/stop` (§4 PD-02) and typed redacted errors. No raw K permit, Host resource, store handle or privileged Effect helper exported. Today's consumer entry `@kaicreator/domain-harness-compiler/v10build` migrates to it. |
| Source→artifact→install distribution | #1308 | Distinct version/digest/ABI identities; Node24 engines; fresh dist/lock/pack. **The running Tiny App's installed dependency closure contains no compiler/BUILD package and no `typescript`/`jsonata`/`yaml`.** Committed `dist/` may remain for exact Git-SHA installs (#299) under the existing freshness guard; the channel choice is explicit. |
| External Package producer | #1309 | One independently authored out-of-workspace B or C Package uses only the supported producer/BUILD entry; P/N ABI/binding/scope evidence. The v0.10.1 `build-probe.mjs` repo-relative deep import is a required negative. |
| **Retained-function preservation gate** | **#1310** | Successor crosswalk over the 44 historical rows **plus** v0.10.1 C01–C04 + CT-02 invoker, T09 meta-feedback and `v10shadow`: selected owner, reachability, P/N evidence per row. FR04/HF19/HF27 rebound to selected `kernel-mechanism-v1.mjs` CB-*/T11 evidence or marked `NOT_VERIFIED`. Historical counts (3/34/5/2) are not rewritten; PARTIAL does not imply reimplementation work. |

The current-source → future-owner map is in `docs/product/DomainHarness_v0.10.2_SOURCE_OWNER_CROSSWALK.md` (same PR). It is pre-L2 planning evidence, not design freeze.

## 4. Product decisions (normative; supersede older ambiguous intake wording)

| ID | v0.10.2 requirement | Exclusion / limitation |
| --- | --- | --- |
| **PD-01** Package Tool/non-Tool ABI — Option A | One *logical* Domain Package may contain private non-Tool code and several selected implementation modules. Read-only and governed external-effect C Operations of one logical Package are **two separately selected C modules**, each with the existing module-level `externalEffect:false` / `externalEffect:true`. | No per-handler effect field, no `role:non-tool`, no Tool runtime, no duplicate K authority. A single C module with mixed effect classes is not promised. `externalEffect:false` is a trusted producer declaration (CV-01), not a sandbox or proof of no effect. Producer-declared typed I/O/errors are documentation/producer-tested, not runtime-validated manifest schema. |
| **PD-02** HF17 + [#1265](https://github.com/kaicreator-mm/domain-harness/issues/1265) | **REQUIRED:** minimal scoped public `subscribe`/`stop` on the single Facade, delegating to K/Host observation; protected caller/B scope, delivery authorization, teardown/resource cleanup; Tiny positive and negative evidence (no foreign-B oracle, stop/dispose/revocation). | Historical durable reconnect/coalescing = `OUT_OF_SCOPE_V0102` with this recorded reason (structural release, no new subscription engine); never marked IMPLEMENTED or v0.9-equivalent. #1265 stays OPEN until executable qualification. |
| **PD-03** HF20 | Restart-durable *ordered* observation cursor = `NOT_REQUIRED_FOR_V0102` (CV-12: observation is optional and non-authoritative). K Journal/Replay truth preserved. | Not globally deprecated for future versions; the existing Evidence sink is not claimed equivalent. Recorded as such in the #1310 successor crosswalk. |

## 5. Negative constraints

- Do not delete the live v0.10 Host because of its `host-v8` label (SQLite CAS, durable controls, scoped memory, multi-B query, `public-v8/contracts.ts` `canonicalSnapshot`). Do not revive Expo or legacy runtimes as mandatory.
- Do not decompose the ≈300 KB K Primary (`kernel-mechanism-v1.mjs`) into internal subpackages; "Tiny" is a **selected-module closure** contract. `Retained*` S helpers are dispositioned individually via #1310 (remove only without a selected caller), not by an S split.
- Keep persisted wire identities unchanged: `v08-kernel-abi/1`, `v08-standard-sdk-abi/1`, `v08/tc-intent`, doc-key prefix `v08-kernel:` and other digest-bound literals. Only paths/package names move unless a migration is deliberately scoped by a reviewed amendment.
- Do not create a Microkernel beside `activation.ts`. `deployment.ts` moves to the Host/deployment owner. The Host Effect gate (`external-effect.ts`) consumes one K-owned read-only permit/doc-key view, or moves unchanged into K Primary — chosen once at L2, with no second writer.
- Do not infer Tool from private `node:`/npm imports or turn Rule/Decision/Workflow semantics into Tools. Effectful callable C Operations stay on the K-permitted Effect path.
- Do not count `durable-receipt-carrier-v1.mjs` fragment-only K02 tests as selected-Kernel proof; exclude the fragment from production artifacts once rebinding is shown.
- No new BUILD runtime, QuickJS, runtime marketplace, runtime Package self-approval, public registry, external Creator/Forge/UX integration requirement, speculative Host ports, pre-1.0 legacy API compatibility, or per-leaf Full/Hidden regression.

## 6. Inherited residual risks

[#1267](https://github.com/kaicreator-mm/domain-harness/issues/1267) (state-changing S Primary decision → K Admission) and [#1270](https://github.com/kaicreator-mm/domain-harness/issues/1270) (non-atomic K genesis) remain OPEN with their own owners. v0.10.2 moves the code that contains them **without** claiming to fix them; any move must preserve their current behavior and test coverage so the issues remain reproducible against the new paths.

## 7. Gates

- **Product Freeze:** independent bounded review of this candidate and the crosswalk at the exact PR HEAD; then a Freeze checkpoint recording exact blobs (v0.10.1 pattern). No broad re-review unless scope or source materially changes.
- **L2 Freeze:** physical module import/owner graph; Package ABI/Manifest reference; K permit read seam (crosswalk L2-A); BUILD/runtime dependency closure; public/privileged seam split; ABI constant location without import cycles; one exclusive owner for root + existing package `package.json`/exports/files/lockfile/dist and root CI scripts; test-path rewrite plan (R1 counted 51 relative payload references and 67 legacy-surface test imports at `5c78265d`; recount at the L2 pin); CI smoke switched from v0.9 files to a v0.10.x selected-path smoke inside the task that removes v0.9.
- **Task DAG:** derive from the sketch on #1300 only after L2 Freeze; nonoverlapping write sets; reuse existing K/S/Host tests; scoped PR checks.
- **Release:** one exact-SHA RQ — independently reviewed source/ABI/pack inventory, clean Node24 install of Tiny+Rich and the external producer, scoped subscribe/stop P/N, selected K CAS/UNKNOWN/replay/external-effect negatives, #1310 dispositions for every row, Full/Hidden/critical journeys once. `NOT_RUN` is disclosed, never counted as PASS.

## 8. Truth limits

Prepared from source inspection at the base commit only: no build, tests, `npm pack` or physical Node24 runs. v0.10.1 physical evidence (T05 16/16, T06 Windows Node24 4310/4310 with clean-packed Tiny/Rich/SQLite, Hidden #70 33/33×2) belongs to the predecessor and is cited, not re-executed.
