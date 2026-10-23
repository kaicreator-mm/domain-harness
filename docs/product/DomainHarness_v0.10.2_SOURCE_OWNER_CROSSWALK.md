# DomainHarness v0.10.2 — Current Source → Future Owner Crosswalk (pre-L2, CANDIDATE)

**Status:** `PRE_L2_PLANNING_EVIDENCE / NOT_DESIGN_FREEZE / SOURCE_INSPECTED_ONLY`.
**Pin:** `v0.10.2@fdf6086881cc53b4c03be1b9db837f7c535f5bd2` (= `main` after [PR #1313](https://github.com/kaicreator-mm/domain-harness/pull/1313)), tree `68d27260103757e79c8eb3821315b14e8070d10d`.
**Supersedes as working inventory:** the [#1301 ownership map](https://github.com/kaicreator-mm/domain-harness/issues/1301#issuecomment-6360728439) (pinned at pre-release `5c78265d`) and the [#1310 v0.10.1 refresh](https://github.com/kaicreator-mm/domain-harness/issues/1310) (pinned at `568a38a4`). Those comments remain the historical record.

Method values: **MOVE** = relocate bytes/exports, no logic rewrite; **SPLIT** = selected subset moves, residue archived/removed only after proof of non-selection; **KEEP** = stays with its owner; **EXCLUDE** = kept as history/test, out of production artifacts.

## 1. Drift since the R1 pre-review pin

`git diff 5c78265d..fdf6086` touches 56 files. Outside `docs/` (32 files), the only changes are: the four v0.10.1 feature packages and Host CT-02 invoker under `extensions/agent-improvement/**`; the subset-BUILD integration example `examples/v0101-agent-improvement/integration/`; three tests (`tests/conformance/v0101-sdk-features.test.ts`, `tests/hosts/node/v0101-{feature-suite,build-skipped-optional-provider}.test.ts`); and an 11-line change in `v10build/build.ts` plus its committed `dist/.../build.js` (selected-closure collision/provider checks now ignore absent optional modules recorded in `skippedOptional`). Every other blob listed below is byte-identical to the R1/#1301 pins. No existing package manifest changed and the lockfile is unchanged (`package-lock.json` blob `c16147cd27d2aa5170b32186a71956cd391035e6`); the four new feature `package.json` files (`@kaicreator/domain-feature-*@0.10.1-rc.0`, private, `engines >=24.0.0`) sit outside the `packages/*` workspaces and so do not enter the lockfile. R1's findings therefore still apply at this pin.

## 2. Crosswalk

Paths under `C/` abbreviate `packages/domain-harness-compiler/src/qualified-package/`; `H/` abbreviates `packages/domain-harness/src/`.

| Current source | Blob @ pin | Current behavior | Future owner / method |
| --- | --- | --- | --- |
| `C/v10build/activation.ts` | `62f1ae979fa0267ed6341e01f64d0a2618a1c611` | `activateV10App`, `V10AppFacade`, load→connect→init→execute→dispose, sealed `resources.call` dispatch, per-B K runtime factory | **Microkernel runtime + public Facade** — MOVE/SPLIT public vs privileged; no competing loader |
| `C/v10build/import-hook.ts` | `142e0e76b9059a7e4aa3a9ea9552fcdc2e38014c` | `node:module registerHooks` sealed import resolution | **Microkernel internal loader** — MOVE |
| `C/v10build/guards.ts`, `errors.ts` | `67789e6e37a6cf70dcd475876f8fee105bd2457c`, `c33f5fd1761d3041f2498802c120d5d5d948e26e` | runtime guards, typed error construction | **Microkernel / contracts** — MOVE (typed public errors via #1307) |
| `C/v10build/deployment.ts` | `58e1437046e5582cb9fac561a438371d1c1253d9` | Host-governed activation, durable activation ledger, occurrence→BUILD pins | **Host / deployment** — MOVE; never an unconditional runtime `load(package)` build |
| `C/v10build/external-effect.ts` | `ee2448b5883cf2a66e5b4193c7c4ee90838dae92` | trusted Host gate re-reads K permit/journal/fence before C adapter dispatch | **Host gate + K-owned read-only permit view**, or unchanged move into K Primary — **L2-A** decides; no second writer |
| `C/v10build/digest.ts` | `21fe039dbc9c46560b4c4614379e7657c9f94812` | role ABI, BUILD digest/profile, mirrored private K doc-key literals | **contracts + BUILD + K protocol** — SPLIT; wire literals unchanged |
| `C/v10build/build.ts`, `selected-closure.ts`, `import-policy.ts` | `5873fdd17a13b0f2625099f08d10154fe029498a`, `32eb44ec37b9502bb64dfc95ca8cbc204323ac68`, `d422ce7ed172a2a84cdb02c5e44e354bbfa0021a` | static BUILD graph, role binding, closure digest, import checks | **tooling/build (producer-only)** — KEEP/MOVE; absent from runtime closure |
| `C/payload/kernel-mechanism-v1.mjs` | `72a886ffca85fc90caea954ee9fb5b3df7b4fcfa` | K Primary: CAS, admission, journal, lane, governance pins, durable controls, Effect, Replay, UNKNOWN | **K Primary Domain Package** — MOVE, byte-stable where possible; one package |
| `C/payload/durable-receipt-carrier-v1.mjs` | `df9732acacb7d3c2e447363e550da2e1bdf5e46b` | pre-splice K02 fragment; restated inside the selected kernel (L2737+); ships in the compiler tarball. Used by `packages/domain-harness-compiler/tests/v08-k02-durable-receipt-carrier.test.ts`, `packages/domain-harness/tests/v08-host/{k02-receipt-cas-physical,k02-receipt-race-multiprocess,k02-namespace-two-b-physical,t10-multib-query-physical}.test.ts` and `children/k02-receipt-worker.mjs` — the K02-N and T10 tests run the selected kernel over the fragment's `createScopedDocumentStore`/`scopedNamespacePrefix` | **EXCLUDE** from production after rebinding every row whose evidence uses fragment exports (#1310) |
| `C/payload/standard-sdk-v1.mjs` | `9b86835bf12262ef53548e0031550fcecd97a7f2` | S Primary rule/expr/decision/workflow/context/evidence/candidate + `Retained*` helpers | **S Primary Domain Package** — MOVE; each `Retained*` helper dispositioned via #1310 |
| `C/payload/sfeature-*-v1.mjs`: semantic-decision, workflow-control, context-assembly, decision-evidence, candidate-validation, meta-feedback | `997e8675bc03fdda4aa5edcb5edeff55e025f123`, `a4a48d8cb2987e6fc6b67dfdc04a4d92f531fa77`, `a5175ac24387ccf1749f34eea001f180e09f5238`, `f41b8d5226a60f93b5fbd029c655d63fc856aa78`, `2801aada10c838e2e836dbb30dd97a79ebe56824`, `5d8758876d2f0c18097f5286756e80365dd042f2` | selected optional S features | **S Feature packages** — MOVE; keys/ABI unchanged |
| `C/v09/workflow-router.mjs` | `e23694d7076d7ca61cbe0522fc1f54d418b848cc` | current router, exported as `./v10payload/workflow-router` | **S Primary composition** — MOVE |
| `C/payload/business-meta-feedback-v1.mjs` | `c19881f99ee1d31af81fc99ed5c8519ff3b3eb5d` | T09 Meta Feedback **Business** module shipped in compiler tarball | **Business Domain Package / example** — MOVE out of compiler |
| `C/v10meta/meta-feedback-workflow.ts` | `fff9370d6cf05fe1ddf9cccf1a9c2a579667ea01` | `./v10meta` export | owner decided at L2 (S feature vs example); listed in #1310 |
| `C/v10shadow/shadow-l4-readonly.ts` | `c06554e00859466e44df65e944bbabb6c73b7b20` | `./v10shadow` L4 read-only observer | owner decided at L2; listed in #1310 |
| `H/host-v8/{sqlite-cas-store,cas,durable-controls,v010-scoped-memory,v010-authorized-multib-query}.ts` | `f6f92344…`, `3f839a9f…`, `37f3b62c…`, `408366f3…`, `be52e07b…` | current Node24 Host CAS, durable controls, scoped memory, authorized multi-B query | **host-node** — SPLIT/MOVE; never deleted wholesale |
| `H/public-v8/contracts.ts` | `cb20695e772862bb2b56569cc5f958b94d3efc5e` | `canonicalSnapshot` used by `v10build/build.ts` | **contracts** — MOVE the selected function only |
| `packages/domain-harness-node`, `packages/domain-harness-expo`, `examples/expo-conformance` | — | referenced by no v10build/payload/T11/clean-consumer file (R1) | explicit evidence-based fate at L2 (selected / unselected / reference / archival, per #1302) |
| `examples/v010-clean-consumer/runtime/runtime-core.mjs` | `484c2b8c5fd0dc74543ef6e99b7f734f39a78687` | installed Tiny/Rich import `@kaicreator/domain-harness-compiler/v10build` for activation | **flip** to installed Microkernel/Host public entries; SQLite adapter stays a witness |
| `extensions/agent-improvement/packages/{agent-diagnostics,candidate-evaluation,experience-reuse,bounded-experiment}/` | manifests `21ebe2c2…`, `4341a61c…`, `b9d80801…`, `61bfeba0…` | v0.10.1 qualified `role:standard-feature` packages, CT-02 data-only, SEMANTIC (non-Tool) | **reference Domain Package shape**; move-only to the S feature location chosen at L2 |
| `extensions/agent-improvement/host/ct02-data-only-invoker.mjs` | `df34951e6adfabca75600b5cdd307572d5d49fc8` | Host-side allowed-feature invoker; not K authority, not Tool runtime | **Host** — MOVE under one Host/selected-S interface owner |
| `extensions/agent-improvement/packages/*/build-probe.mjs` (all four; agent-diagnostics blob `c59e6bb4c68bf45ab42401e6bedf8cce38262139`) | line 11 deep-imports `../../../../examples/v010-clean-consumer/apps/rich/app-definition.mjs` | producer probe; the deep import is a **#1309 negative** in v0.10.2 |

## 3. Shared manifest surface (single-owner input for L2)

- `packages/domain-harness-compiler/package.json` (`@kaicreator/domain-harness-compiler@0.2.0`, blob `19213be06493ce07fb47a4ca1d44f60f4271ebfa`) — 16 exports: `.`, `./v10build`, `./v10shadow`, `./v10meta`; `./v10payload/{kernel-mechanism,standard-sdk,workflow-router,sfeature-semantic-decision,sfeature-workflow-control,sfeature-context-assembly,sfeature-decision-evidence,sfeature-candidate-validation}`; and `./payload/{business-meta-feedback-v1,sfeature-meta-feedback-v1,kernel-mechanism-v1,standard-sdk-v1}`. K and S Primary therefore each have **two** public paths. `files`: `dist`, `README.md`, `src/qualified-package/payload/*.mjs` (ships the K02 fragment), `src/qualified-package/v09/workflow-router.mjs`. Dependencies: `ajv`, `jsonata`, `typescript`, `yaml`.
- `packages/domain-harness/package.json` (`@kaicreator/domain-harness@0.2.0`) — 12 exports: `.`, `./v2`, `./workflow`, `./v3`, `./v4`, `./v7`, `./v7/execution`, `./v9`, `./v9/deployment`, `./v8`, `./v8/host`, `./v8/dac`; `files`: `dist`, `README.md`. `./v8/host` and `./v8` are consumed by `activation.ts`/`build.ts`.
- Four out-of-workspace feature manifests under `extensions/agent-improvement/packages/*/package.json` (`engines >=24.0.0`).
- Root `package.json` (blob `6fba7bd045ed092b15cad8925dcdfaa9d91f4861`) declares `engines.node >=22.15.0`.

Every move task touches these; L2 assigns one exclusive writer (PRD §7).

## 4. Questions owned by L2 (decide once)

- **L2-A** K permit/doc-key read protocol for the Host Effect gate, or the gate's unchanged relocation into K Primary.
- **L2-B** public Facade vs privileged internal seam (docs/store handles, test counters stay non-public).
- **L2-C** location of ABI constants/types shared by BUILD and runtime without import cycles.
- **L2-D** Manifest/operation shape under PD-01.
- **L2-E** owner of root + existing package manifests, dist and lockfile.
- **L2-F** `Retained*` helper and `v10meta`/`v10shadow` disposition from selected-path evidence.
