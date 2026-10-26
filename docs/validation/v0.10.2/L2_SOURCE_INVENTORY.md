# DomainHarness v0.10.2 - L2 Source Inventory (facts only)

**Status:** `L2_INPUT_EVIDENCE / SOURCE_INSPECTED_PLUS_STATIC_SCRIPTS / NO_BUILD / NO_TESTS / NO_NPM_INSTALL`. Companion of `docs/architecture/DomainHarness_v0.10.2_L2_DESIGN_CANDIDATE.md`; contains no design decisions.
**Parent:** [#1300](https://github.com/kaicreator-mm/domain-harness/issues/1300). Scripts that produced every table are reproduced in `L2_SOURCE_INVENTORY_SCRIPTS.md` (same directory).

## 0. Pin, method, truth limits

| Item | Value |
| --- | --- |
| Worktree HEAD (every fact below) | `f49c2a5f9ad79809959d1c5b6f6d8542c8d06f44` (`git rev-parse HEAD`; `git status --short` empty before this commit; branch `task/dh-i1300-l2-claude`) |
| Product freeze inputs | PRD blob `746535c97e87c24b373a02175f8681015a16a589`, crosswalk blob `46bfbe4755fe2b3aa07c0e8e71ceac842c5873e4` (`DomainHarness_v0.10.2_PRODUCT_FREEZE.md`) |
| ADS pin | `.dev-standard/VERSION`: `kaicreator-mm/ai-development-standard` `4.13.1` rev `f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd` |
| Node used for static scripts | `node -v` = `v24.21.0`; `npm -v` = `11.19.0`; no `npm install/ci`, no build, no test executed |
| Path abbreviations | `C/` = `packages/domain-harness-compiler/src/qualified-package/`; `H/` = `packages/domain-harness/src/` |

Method: regex-based import extraction (static `import`/`export ... from`, `import('lit')`, `require('lit')`; comments stripped) - **not** a TypeScript/AST resolver. Type-only imports are included in the tables of section 1 unless stated. `NOT_RUN` marks anything not executed. Scripts live in `_tmp` and are reproduced verbatim in the scripts file; numbers are therefore re-derivable but were not re-run by a second party.

**Discrepancies found against the frozen Product crosswalk (facts, not decisions):**

| # | Frozen statement | Fact at HEAD | Evidence |
| --- | --- | --- | --- |
| D1 | Crosswalk section 3: core package has "no `files` field" | `packages/domain-harness/package.json` **has** `"files": ["dist", "README.md"]`; the tarball is therefore `dist`-only (no `src/`, no tests), but `dist` contains every legacy surface | `git show HEAD:packages/domain-harness/package.json`; section 4 |
| D2 | Crosswalk lists v10build/v10meta/v10shadow/payload/host-v8/public-v8 | Also on the selected path and **not listed**: `C/v10evidence/decision-evidence-observer.ts` (Host-origin evidence bridge, imported by 3 tests, not in any `exports` map), `C/v09build/parser.ts` + `C/v09build/generated/acorn.mjs` (the vendored BUILD parser used by `v10build/import-policy.ts:47-49`), `H/contracts/identity.ts` (+`json.ts` type) required by `host-v8/durable-controls.ts:35` | sections 1, 2, 6 |
| D3 | PRD section 1 says Tiny installs "the compiler and its declared dependencies (`ajv`, `jsonata`, `typescript`, `yaml`)" | True, and additionally the core tarball it requires (peer) pulls `ajv` + `json-schema-library` through the `host-v8/index.ts` barrel (section 2.3) | `closure.mjs` run (section 2.2), section 2.3 |

## 1. Runtime import graph

### 1.1 Command and result

```
node imports.mjs <worktree> graph      # files: C/{v10build,v10meta,v10shadow,v09,payload}/*, H/host-v8/*.ts, H/public-v8/contracts.ts
```
46 files. Relative imports are resolved to repository paths (`.js`->`.ts`); `UNRESOLVED` entries and string fragments captured from template literals inside `import-policy.ts` were filtered from the table (its real imports, read directly: `node:module`, `./guards.js`, `../v09build/generated/acorn.mjs`, `../v09build/parser.js`, `./errors.js` - `C/v10build/import-policy.ts:45-50`).

| File | Relative imports | Package-subpath imports | `node:` | External |
|---|---|---|---|---|
| `C/payload/business-meta-feedback-v1.mjs` | - | - | - | - |
| `C/payload/durable-receipt-carrier-v1.mjs` | - | - | - | - |
| `C/payload/kernel-mechanism-v1.mjs` | - | - | - | - |
| `C/payload/sfeature-candidate-validation-v1.mjs` | - | - | - | - |
| `C/payload/sfeature-context-assembly-v1.mjs` | - | - | - | - |
| `C/payload/sfeature-decision-evidence-v1.mjs` | - | - | - | - |
| `C/payload/sfeature-meta-feedback-v1.mjs` | - | - | - | - |
| `C/payload/sfeature-semantic-decision-v1.mjs` | - | - | - | - |
| `C/payload/sfeature-workflow-control-v1.mjs` | - | - | - | - |
| `C/payload/standard-sdk-v1.mjs` | - | - | - | - |
| `C/v09/selected-abi.mjs` | - | - | - | - |
| `C/v09/workflow-router.mjs` | - | - | - | - |
| `C/v10build/activation.ts` | `C/v10build/digest.ts`<br>`C/v10build/errors.ts`<br>`C/v10build/external-effect.ts`<br>`C/v10build/guards.ts`<br>`C/v10build/import-hook.ts` | `@kaicreator/domain-harness/v8/host` | `node:buffer`<br>`node:crypto` | - |
| `C/v10build/build.ts` | `C/v10build/digest.ts`<br>`C/v10build/errors.ts`<br>`C/v10build/guards.ts`<br>`C/v10build/import-policy.ts`<br>`C/v10build/selected-closure.ts` | `@kaicreator/domain-harness/v8` | - | - |
| `C/v10build/deployment.ts` | `C/v10build/activation.ts`<br>`C/v10build/build.ts`<br>`C/v10build/digest.ts`<br>`C/v10build/errors.ts`<br>`C/v10build/guards.ts` | - | `node:crypto` | - |
| `C/v10build/digest.ts` | - | - | `node:crypto` | - |
| `C/v10build/error-type-parity.ts` | `C/v10build/known-error-codes.ts` | `@kaicreator/domain-harness/v8/host` | - | - |
| `C/v10build/errors.ts` | `C/v10build/known-error-codes.ts` | - | - | - |
| `C/v10build/external-effect.ts` | `C/v10build/errors.ts`<br>`C/v10build/guards.ts` | - | - | - |
| `C/v10build/guards.ts` | - | - | - | - |
| `C/v10build/import-hook.ts` | `C/v10build/activation.ts`<br>`C/v10build/errors.ts`<br>`C/v10build/guards.ts` | - | `node:module`<br>`node:path`<br>`node:url` | - |
| `C/v10build/import-policy.ts` | `C/v09build/generated/acorn.mjs`<br>`C/v09build/parser.ts`<br>`C/v10build/errors.ts`<br>`C/v10build/guards.ts` | - | `node:module` | - |
| `C/v10build/index.ts` | `C/v10build/activation.ts`<br>`C/v10build/build.ts`<br>`C/v10build/deployment.ts`<br>`C/v10build/digest.ts`<br>`C/v10build/errors.ts`<br>`C/v10build/external-effect.ts`<br>`C/v10build/import-policy.ts`<br>`C/v10build/known-error-codes.ts` | - | - | - |
| `C/v10build/known-error-codes.ts` | - | - | - | - |
| `C/v10build/query-type-parity.ts` | `C/v10build/activation.ts` | `@kaicreator/domain-harness/v8/host` | - | - |
| `C/v10build/selected-closure.ts` | `C/v10build/digest.ts`<br>`C/v10build/errors.ts` | - | - | - |
| `C/v10meta/index.ts` | `C/v10meta/meta-feedback-workflow.ts` | - | - | - |
| `C/v10meta/meta-feedback-workflow.ts` | `C/v10build/activation.ts`<br>`C/v10build/digest.ts`<br>`C/v10build/errors.ts`<br>`C/v10build/guards.ts` | - | - | - |
| `C/v10shadow/index.ts` | `C/v10shadow/shadow-l4-readonly.ts` | - | - | - |
| `C/v10shadow/shadow-l4-readonly.ts` | `C/v10build/activation.ts`<br>`C/v10build/digest.ts`<br>`C/v10build/errors.ts`<br>`C/v10build/guards.ts` | - | `node:vm` | - |
| `H/host-v8/bootstrap.ts` | `H/public-v8/contracts.ts`<br>`H/public-v8/deploy.ts`<br>`H/public-v8/kernel-host.ts`<br>`H/public-v8/microkernel.ts`<br>`H/public-v8/model-port.ts`<br>`H/public-v8/trust.ts`<br>`H/host-v8/cas.ts`<br>`H/host-v8/dispatcher.ts`<br>`H/host-v8/errors.ts`<br>`H/host-v8/events.ts`<br>`H/host-v8/identity.ts`<br>`H/host-v8/sqlite-cas-store.ts` | - | `node:crypto` | - |
| `H/host-v8/cas.ts` | `H/host-v8/errors.ts` | - | `node:crypto` | - |
| `H/host-v8/dispatcher.ts` | `H/host-v8/errors.ts`<br>`H/host-v8/identity.ts` | - | - | - |
| `H/host-v8/durable-controls.ts` | `H/contracts/identity.ts`<br>`H/host-v8/cas.ts` | - | - | - |
| `H/host-v8/errors.ts` | - | - | - | - |
| `H/host-v8/events.ts` | `H/public-v8/contracts.ts`<br>`H/host-v8/errors.ts`<br>`H/host-v8/identity.ts` | - | - | - |
| `H/host-v8/hf20-mutation-observation.ts` | - | - | - | - |
| `H/host-v8/identity.ts` | `H/public-v8/contracts.ts`<br>`H/host-v8/cas.ts`<br>`H/host-v8/errors.ts` | - | `node:crypto` | - |
| `H/host-v8/index.ts` | `H/host-v8/bootstrap.ts`<br>`H/host-v8/cas.ts`<br>`H/host-v8/dispatcher.ts`<br>`H/host-v8/durable-controls.ts`<br>`H/host-v8/errors.ts`<br>`H/host-v8/events.ts`<br>`H/host-v8/hf20-mutation-observation.ts`<br>`H/host-v8/identity.ts`<br>`H/host-v8/kernel-gateway.ts`<br>`H/host-v8/sqlite-cas-store.ts`<br>`H/host-v8/tool-call-port.ts`<br>`H/host-v8/ux-transport.ts`<br>`H/host-v8/v010-authorized-multib-query.ts`<br>`H/host-v8/v010-scoped-memory.ts` | - | - | - |
| `H/host-v8/kernel-gateway.ts` | `H/execution/schema-validator.ts`<br>`H/public-v8/contracts.ts`<br>`H/public-v8/deploy.ts`<br>`H/public-v8/microkernel.ts`<br>`H/host-v8/bootstrap.ts`<br>`H/host-v8/durable-controls.ts`<br>`H/host-v8/errors.ts`<br>`H/host-v8/events.ts`<br>`H/host-v8/identity.ts`<br>`H/host-v8/tool-call-port.ts`<br>`H/host-v8/ux-transport.ts` | - | - | - |
| `H/host-v8/sqlite-cas-store.ts` | `H/host-v8/cas.ts`<br>`H/host-v8/errors.ts` | - | - | `better-sqlite3` |
| `H/host-v8/tool-call-port.ts` | `H/contracts/json.ts`<br>`H/execution/executor-error.ts`<br>`H/execution/schema-validator.ts`<br>`H/public-v8/microkernel.ts`<br>`H/schema/domainharness-json-schema-v1.ts`<br>`H/host-v8/errors.ts` | - | - | - |
| `H/host-v8/ux-transport.ts` | `H/public-v8/contracts.ts`<br>`H/host-v8/bootstrap.ts`<br>`H/host-v8/errors.ts`<br>`H/host-v8/events.ts`<br>`H/host-v8/identity.ts` | - | - | - |
| `H/host-v8/v010-authorized-multib-query.ts` | - | - | - | - |
| `H/host-v8/v010-scoped-memory.ts` | `H/host-v8/cas.ts` | - | `node:buffer` | - |
| `H/public-v8/contracts.ts` | - | - | `node:crypto` | - |

Derived reading of the table (facts):

| Observation | Evidence |
| --- | --- |
| All 10 `payload/*.mjs` and both `v09/*.mjs` have **zero imports of any kind** (self-contained ESM) | table rows `C/payload/*`, `C/v09/*` |
| `v10build/activation.ts` is the only runtime consumer of `@kaicreator/domain-harness/v8/host`: value import `createV10AuthorizedMultiBQuery` (+ 3 types) | `activation.ts:53-58` |
| `v10build/build.ts` imports `canonicalSnapshot` (value) from `@kaicreator/domain-harness/v8` | `build.ts:51`, used `build.ts:219` |
| `error-type-parity.ts` and `query-type-parity.ts` import **types** from `@kaicreator/domain-harness/v8/host` | `error-type-parity.ts:7`, `query-type-parity.ts:9-12` |
| `import-hook.ts` imports the **type** `V10AppView` from `activation.ts` while `activation.ts` imports values from `import-hook.ts`: a type-level cycle (runtime acyclic) | `import-hook.ts:13` (`import type { V10AppView } from './activation.js'`); `activation.ts:49` |
| `deployment.ts` imports values from `activation.ts` (`activateV10App`, `v10DeploymentDocsPrefix`, `v10K02DocumentPrefix`, `v10SelectedKernelIdentity`, `V10AppFacade`) and only the **type** `V10BuiltApp` from `build.ts` | `deployment.ts:37-39` |
| `digest.ts` is imported by `activation`, `build`, `deployment`, `selected-closure`, `meta`, `shadow`, `evidence`; it mixes BUILD constants, the per-role ABI table, canonical JSON/sha256 and two mirrored K doc-key literals | `digest.ts:21-56,60-69,71-118` |
| `v10meta/*` and `v10shadow/*` import `activation.ts`, `digest.ts`, `errors.ts`, `guards.ts`; `shadow` also imports `node:vm` | table |
| `v10evidence/decision-evidence-observer.ts` imports `errors`, `guards`, `activation` (value `V10AppFacade`, type `V10PublicIntent`), `digest` (`sha256Canonical`) | `decision-evidence-observer.ts:43-47` |

### 1.2 Importers of the package subpaths outside tests

```
node imports.mjs <worktree> consumers   # scans examples/ extensions/ packages/ scripts/, excludes tests/ dirs and *.test.*
```
73 files carry an `@kaicreator/...` import specifier or string mention. The 23 files under `packages/domain-harness-node/src` and `packages/domain-harness-expo/src` import only `@kaicreator/domain-harness` and `@kaicreator/domain-harness/v2` (legacy; omitted from the table). Counts of **import specifiers** by area:

| Area | Specifier -> count |
| --- | --- |
| `examples/v010-clean-consumer` | `domain-harness/v8/host` 1, `domain-harness-compiler/v10build` 3, `domain-harness-compiler/v10shadow` 1 |
| `examples/v0101-agent-improvement` | `domain-harness-compiler/v10build` 1 |
| `extensions/agent-improvement` (4 `build-probe.mjs`) | `domain-harness-compiler/v10build` 4 |
| `examples/v09-clean-consumer` | `domain-harness/v9` 1, `domain-harness/v9/deployment` 1 |
| `packages/domain-harness-compiler/src` (non-v10) | `domain-harness/v2` 10, `/v7` 3, `/v8` 6 (3 are v10build), `/v8/host` 3 (v10build) |
| `packages/domain-harness-node/src`, `packages/domain-harness-expo/src` | `domain-harness/v2` 9 + root 7 each |

Files (non-test, excluding node/expo packages):

| File (non-test) | Import specifiers | String-only mentions (not import statements) |
|---|---|---|
| `examples/v010-clean-consumer/apps/rich/app-definition.mjs` | - | `@kaicreator/domain-harness/v8/host` |
| `examples/v010-clean-consumer/apps/rich/modules/capability-agent-memory-v1.mjs` | `@kaicreator/domain-harness/v8/host` | - |
| `examples/v010-clean-consumer/apps/rich/scenario.mjs` | `@kaicreator/domain-harness-compiler/v10build`<br>`@kaicreator/domain-harness-compiler/v10shadow` | - |
| `examples/v010-clean-consumer/build-apps.mjs` | `@kaicreator/domain-harness-compiler/v10build` | `@kaicreator/domain-harness`<br>`@kaicreator/domain-harness-compiler`<br>`@kaicreator/domain-harness-compiler/v10payload/kernel-mechanism`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-context-assembly`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-decision-evidence`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-semantic-decision`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-workflow-control`<br>`@kaicreator/domain-harness-compiler/v10payload/standard-sdk`<br>`@kaicreator/domain-harness-compiler/v10payload/workflow-router` |
| `examples/v010-clean-consumer/runtime/runtime-core.mjs` | `@kaicreator/domain-harness-compiler/v10build` | - |
| `examples/v0101-agent-improvement/integration/selected-subsets-build.mjs` | `@kaicreator/domain-harness-compiler/v10build` | `@kaicreator/domain-harness-compiler/v10payload/kernel-mechanism`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-context-assembly`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-decision-evidence`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-semantic-decision`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-workflow-control`<br>`@kaicreator/domain-harness-compiler/v10payload/standard-sdk`<br>`@kaicreator/domain-harness-compiler/v10payload/workflow-router` |
| `examples/v09-clean-consumer/consumer.mjs` | `@kaicreator/domain-harness/v9` | - |
| `examples/v09-clean-consumer/operator.mjs` | `@kaicreator/domain-harness/v9/deployment` | - |
| `extensions/agent-improvement/packages/agent-diagnostics/build-probe.mjs` | `@kaicreator/domain-harness-compiler/v10build` | `@kaicreator/domain-harness-compiler/v10payload/kernel-mechanism`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-context-assembly`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-decision-evidence`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-semantic-decision`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-workflow-control`<br>`@kaicreator/domain-harness-compiler/v10payload/standard-sdk`<br>`@kaicreator/domain-harness-compiler/v10payload/workflow-router` |
| `extensions/agent-improvement/packages/bounded-experiment/build-probe.mjs` | `@kaicreator/domain-harness-compiler/v10build` | `@kaicreator/domain-harness-compiler/v10payload/kernel-mechanism`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-context-assembly`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-decision-evidence`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-semantic-decision`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-workflow-control`<br>`@kaicreator/domain-harness-compiler/v10payload/standard-sdk`<br>`@kaicreator/domain-harness-compiler/v10payload/workflow-router` |
| `extensions/agent-improvement/packages/candidate-evaluation/build-probe.mjs` | `@kaicreator/domain-harness-compiler/v10build` | `@kaicreator/domain-harness-compiler/v10payload/kernel-mechanism`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-context-assembly`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-decision-evidence`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-semantic-decision`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-workflow-control`<br>`@kaicreator/domain-harness-compiler/v10payload/standard-sdk`<br>`@kaicreator/domain-harness-compiler/v10payload/workflow-router` |
| `extensions/agent-improvement/packages/experience-reuse/build-probe.mjs` | `@kaicreator/domain-harness-compiler/v10build` | `@kaicreator/domain-harness-compiler/v10payload/kernel-mechanism`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-context-assembly`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-decision-evidence`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-semantic-decision`<br>`@kaicreator/domain-harness-compiler/v10payload/sfeature-workflow-control`<br>`@kaicreator/domain-harness-compiler/v10payload/standard-sdk`<br>`@kaicreator/domain-harness-compiler/v10payload/workflow-router` |
| `packages/domain-harness-compiler/src/compat/raw-v07/harness-config-promoted-subworkflow.ts` | `@kaicreator/domain-harness/v7` | - |
| `packages/domain-harness-compiler/src/compat/raw-v07/identity-correspondence.ts` | `@kaicreator/domain-harness/v7` | - |
| `packages/domain-harness-compiler/src/compat/raw-v07/index.ts` | `@kaicreator/domain-harness/v7` | - |
| `packages/domain-harness-compiler/src/compile/capabilities.ts` | `@kaicreator/domain-harness/v2` | - |
| `packages/domain-harness-compiler/src/compile/compile-domain-package.ts` | `@kaicreator/domain-harness/v2` | - |
| `packages/domain-harness-compiler/src/compile/semantic-decisions.ts` | `@kaicreator/domain-harness/v2` | - |
| `packages/domain-harness-compiler/src/index.ts` | `@kaicreator/domain-harness/v2` | `@kaicreator/domain-harness`<br>`@kaicreator/domain-harness-compiler`<br>`@kaicreator/domain-harness/v7` |
| `packages/domain-harness-compiler/src/package/business-sources.ts` | `@kaicreator/domain-harness/v2` | - |
| `packages/domain-harness-compiler/src/package/domain-data.ts` | `@kaicreator/domain-harness/v2` | - |
| `packages/domain-harness-compiler/src/package/manifest.ts` | `@kaicreator/domain-harness/v2` | - |
| `packages/domain-harness-compiler/src/package/module-emitter.ts` | - | `@kaicreator/domain-harness-compiler` |
| `packages/domain-harness-compiler/src/package/profile.ts` | `@kaicreator/domain-harness/v2` | - |
| `packages/domain-harness-compiler/src/qualified-package/approval.ts` | `@kaicreator/domain-harness/v8` | - |
| `packages/domain-harness-compiler/src/qualified-package/build.ts` | `@kaicreator/domain-harness/v8` | - |
| `packages/domain-harness-compiler/src/qualified-package/qualify.ts` | `@kaicreator/domain-harness/v8` | - |
| `packages/domain-harness-compiler/src/qualified-package/v09build/build.ts` | `@kaicreator/domain-harness/v8` | - |
| `packages/domain-harness-compiler/src/qualified-package/v09build/digest.ts` | `@kaicreator/domain-harness/v8` | - |
| `packages/domain-harness-compiler/src/qualified-package/v09build/index.ts` | - | `@kaicreator/domain-harness` |
| `packages/domain-harness-compiler/src/qualified-package/v10build/activation.ts` | `@kaicreator/domain-harness/v8/host` | - |
| `packages/domain-harness-compiler/src/qualified-package/v10build/build.ts` | `@kaicreator/domain-harness/v8` | - |
| `packages/domain-harness-compiler/src/qualified-package/v10build/error-type-parity.ts` | `@kaicreator/domain-harness/v8/host` | - |
| `packages/domain-harness-compiler/src/qualified-package/v10build/query-type-parity.ts` | `@kaicreator/domain-harness/v8/host` | - |
| `packages/domain-harness-compiler/src/raw/load-raw-package.ts` | `@kaicreator/domain-harness/v2` | - |
| `packages/domain-harness-compiler/src/raw/types.ts` | `@kaicreator/domain-harness/v2` | - |
| `packages/domain-harness/src/host-v8/index.ts` | - | `@kaicreator/domain-harness/v8/host` |
| `packages/domain-harness/src/host-v8/sqlite-cas-store.ts` | - | `@kaicreator/domain-harness` |
| `packages/domain-harness/src/host-v9/digest.ts` | - | `@kaicreator/domain-harness/v8` |
| `packages/domain-harness/src/public-v3/index.ts` | - | `@kaicreator/domain-harness-compiler` |
| `packages/domain-harness/src/public-v7/execution.ts` | - | `@kaicreator/domain-harness/v7/execution` |
| `packages/domain-harness/src/public-v8/contracts.ts` | - | `@kaicreator/domain-harness-compiler` |
| `packages/domain-harness/src/public-v8/index.ts` | - | `@kaicreator/domain-harness/v8` |
| `packages/domain-harness/src/public-v8/kernel-host.ts` | - | `@kaicreator/domain-harness/v8` |
| `packages/domain-harness/src/public-v8/load.ts` | - | `@kaicreator/domain-harness-compiler` |
| `packages/domain-harness/src/public-v8/microkernel.ts` | - | `@kaicreator/domain-harness-compiler` |
| `packages/domain-harness/src/public-v8/model-port.ts` | - | `@kaicreator/domain-harness/v8` |
| `packages/domain-harness/src/public-v8/trust.ts` | - | `@kaicreator/domain-harness/v8` |
| `packages/domain-harness/src/public-v9/deployment.ts` | - | `@kaicreator/domain-harness/v9`<br>`@kaicreator/domain-harness/v9/deployment` |
| `scripts/check-committed-dist.mjs` | - | `@kaicreator/domain-harness`<br>`@kaicreator/domain-harness-compiler` |

Payload files are consumed by **string specifier** (`import.meta.resolve('@kaicreator/domain-harness-compiler/v10payload/...')`), e.g. `examples/v010-clean-consumer/build-apps.mjs:42-52`, `examples/v0101-agent-improvement/integration/selected-subsets-build.mjs:28-34`, and the four `extensions/agent-improvement/packages/*/build-probe.mjs`. The four `build-probe.mjs` files deep-import `../../../../examples/v010-clean-consumer/apps/rich/app-definition.mjs` (`build-probe.mjs:11`, agent-diagnostics).

## 2. `host-v8` SPLIT evidence

### 2.1 Files (15 under `H/host-v8/`) and classification

Three reachability definitions were evaluated; the module-graph definition is useless as a discriminator because of the barrel.

| Definition | Command | Result |
| --- | --- | --- |
| M (module graph) - transitively imported (relative imports + `@kaicreator/domain-harness/v8/host` mapped to `H/host-v8/index.ts`) from `C/v10build/*.ts`, `examples/v010-clean-consumer/**`, `H/host-v8/v010-*.ts` (40 seed files) | `node imports.mjs <wt> reach` | **all 15 files reached** (73 files in total graph); `index.ts` is reached from `activation.ts` and re-exports every sibling (`H/host-v8/index.ts`) |
| S (symbol) - an exported name of the file occurs (comment-stripped, word match) in a selected-path non-test source: `C/v10build/*.ts`, `examples/v010-clean-consumer/**`, `examples/v0101-agent-improvement/**`, `extensions/**` | `node sym.mjs <wt>` | see column S below |
| T (selected-path tests) - file is imported by a root `tests/**` test (relative path or `@kaicreator/domain-harness/v8/host`) | `node hostimporters.mjs <wt>` | see columns T-direct / T-barrel |

| File (LOC) | S (selected non-test symbol use) | T-direct (root tests importing the file path) | Class |
| --- | --- | --- | --- |
| `sqlite-cas-store.ts` (230) | `openSqliteCasStore` <- `examples/v010-clean-consumer/apps/rich/modules/capability-agent-memory-v1.mjs:21-23` | 3: `assembly/v010-t05-agent-workflow`, `hosts/node/v010-memory-scoped`, `hosts/node/v010-t03-workflow-control-physical` | **SELECTED** |
| `cas.ts` (281) | none directly; imported by `sqlite-cas-store.ts:29`, `v010-scoped-memory.ts:6`, `durable-controls.ts:36` | 1: `hosts/node/v010-memory-scoped` | **SELECTED (transitive)** |
| `errors.ts` (22) | none directly; `HostBoundaryError` imported by `cas.ts:26`, `sqlite-cas-store.ts:30` | 0 | **SELECTED (transitive)** |
| `v010-scoped-memory.ts` (195) | `createV10ScopedMemory` <- same rich module; `V10MemoryError` <- `C/v10build/error-type-parity.ts:7` | 2: `hosts/node/v010-memory-scoped`, `hosts/node/v010-t07-shadow-l4-physical` | **SELECTED** |
| `v010-authorized-multib-query.ts` (266) | `createV10AuthorizedMultiBQuery` etc. <- `C/v10build/activation.ts:53-58`; types <- `query-type-parity.ts`, `error-type-parity.ts` | 2: `hosts/node/v010-authorized-multib-query`, `hosts/node/v010-t10-selected-app-fixture` | **SELECTED** (zero imports; the only runtime edge from `activation.ts` into Host) |
| `durable-controls.ts` (1228) | none | 1: `hosts/node/v010-t03-workflow-control-physical.test.ts:24` (`ChildInvocationCoordinator`, `ExternalWorkCoordinator`) | **SELECTED BY TEST ONLY**; imports `H/contracts/identity.ts` (`canonicalJsonStringify`) `durable-controls.ts:35` |
| `index.ts` (158) | barrel | 21 root files via the barrel; the only barrel names taken by root tests (token count in the 8 lines preceding each barrel import; approximate): `openSqliteCasStore` 19, `SqliteCasStore` 8, `createV10ScopedMemory` 2 | barrel - re-exports all 15 |
| `bootstrap.ts` (342), `dispatcher.ts` (307), `events.ts` (151), `identity.ts` (279), `hf20-mutation-observation.ts` (398), `kernel-gateway.ts` (2196), `tool-call-port.ts` (362), `ux-transport.ts` (356) | none | 0 root tests name any export; only reached through the barrel | **NOT SELECTED** (barrel-only) |

Importers of the non-selected eight: 75 `packages/domain-harness/tests/**` files import the barrel (relative `host-v8/index.js` or `@kaicreator/domain-harness/v8/host`; `hostimporters.mjs`); `kernel-gateway.ts` imports `public-v8/microkernel.ts`, `public-v8/deploy.ts`, `execution/schema-validator.ts` (`H/host-v8/kernel-gateway.ts` imports in the graph table). These are the v0.8-era Host gateway tests (59 in `tests/v08-integration`, 16 in `tests/v08-host`, 11 in `tests/v08-abi`, section 3.2).

`public-v8/contracts.ts` (641 LOC): zero relative imports (`node:crypto` only); selected function `canonicalSnapshot` (line 240) depends on `QualifiedPackageError` of the same file; sole selected consumer `C/v10build/build.ts:51`.

### 2.2 Closures (static, value imports)

| Seed set | Command | Files | External packages |
| --- | --- | --- | --- |
| Selected host files (`sqlite-cas-store`, `v010-scoped-memory`, `v010-authorized-multib-query`, `durable-controls`) | `node closure.mjs <wt> <seeds>` | 7: 6 in `host-v8/` (+`cas`, `errors`) and `H/contracts/identity.ts` | `better-sqlite3` (dynamic `import('better-sqlite3')`, `sqlite-cas-store.ts:208`) |
| Whole barrel `H/host-v8/index.ts` | same | 30: host-v8 15, public-v8 8, execution 2, schema 1, contracts 1, package 2, v2 1 | `better-sqlite3`, `ajv/dist/2020.js`, `json-schema-library` |

### 2.3 Consequence for today's Tiny closure (derived; physical install NOT_RUN)

`C/v10build/activation.ts` -> `@kaicreator/domain-harness/v8/host` -> `dist/host-v8/index.js` loads the 30-file barrel closure (above), including `ajv` and `json-schema-library`; the compiler tarball itself declares `ajv`, `jsonata`, `typescript`, `yaml` (`packages/domain-harness-compiler/package.json` `dependencies`) and a peer dependency on the core package. `tests/integration/v010-clean-consumers/clean-consumers.test.ts:170-171` packs exactly these two workspaces for Tiny/Rich.

## 3. Test-path rewrite counts at this pin

Definitions: test file = any `.ts/.mts/.mjs/.js` under root `tests/` or `packages/*/tests/`. Counted by string-literal path/specifier occurrence (`testpaths.mjs`, `tpa2.mjs`).

### 3.1 (a) Relative paths into compiler `qualified-package/*`

| Target segment | Test files | Literal occurrences | of which in `tests/` | `packages/domain-harness/tests` | `packages/domain-harness-compiler/tests` |
| --- | --- | --- | --- | --- | --- |
| `.../payload/...` | **69** | 109 | 16 | 35 | 18 |
| `.../v09/...` | 17 | 18 | - | - | - |
| `.../v10build/...` | 39 | 74 | - | - | - |
| `.../v10meta/...` | 8 | 8 | - | - | - |
| `.../v10shadow/...` | 3 | 4 | - | - | - |
| any of the above (unique) | **98** | 214 (loose regex) | - | - | - |

Non-test references: `packages/domain-harness-compiler/src/index.ts` (1, to `v10build`). R1 (`5c78265d`) reported 51 "relative payload references"; the definitions differ (files vs. occurrences, unstated scope) - the figures are not comparable and are not reconciled here. Payload references additionally occur via package specifier strings in `examples/`/`extensions/` (section 1.2).

### 3.2 (b) Legacy-surface imports

Pattern: relative `.../(public-v[0-9]+|legacy-v1|host-v9|recovery-v2|host-v8)(/...)?` or `@kaicreator/domain-harness/(v2|v3|v4|v7|v9|v8|workflow)`. **200 test files**:

| Location | Files | Targets (files) |
| --- | --- | --- |
| `tests/` (root) | 34 | `host-v8` 23, `pkg:v8` 4, `pkg:v2` 7, `host-v9` 1 |
| `packages/domain-harness/tests` | 123 | `host-v8` 61, `public-v8` 41, `pkg:v8` 20, `public-v7` 3, `pkg:v7` 11, `pkg:v3` 8, `pkg:v2` 7, `public-v9` 10, `host-v9` 5, `legacy-v1` 4, `recovery-v2` 3, others (sum >123: files may match several) |
| `packages/domain-harness-compiler/tests` | 19 | `pkg:v2` 10, `pkg:v7` 5, `public-v8` 3, `pkg:v3` 2, `pkg:v8` 2, `host-v9` 1 |
| `packages/domain-harness-node/tests` | 24 | `pkg:v2` 24 |

Of the 34 root files, 26 touch v8 surfaces (selected-path tests); 8 are pure legacy (expo/critical-journeys/package-versioning/k-extension loader -> `host-v9/ast-gate.js` at `tests/architecture-v010-k-extensions/harness/v10-loader.ts:35`). By sub-directory of `packages/domain-harness/tests`: `v08-integration` 59, `v08-host` 16, `v08-abi` 11, `public-v7` 7, `t012r` 4, `t012` 3, `recovery-v2` 3, remainder 1-per-file (v09-*, legacy-v1, etc.). R1 reported 67; the broader definition here includes node-package tests and fixtures.

### 3.3 Cross-owner overlap (input for write-set partitioning)

`overlap.mjs` classifies each test file by which *moved owner classes* its path literals touch (K payload, S payload, router, S feature payloads, K02 fragment, Business meta, selected-abi, v10build runtime, v10build BUILD, v10meta, v10shadow, v10evidence, host selected, host barrel, host residue, public-v8, other compiler). Result: **162 test files** (root 54, core 83, compiler 23, plus 2 other) touch at least one; **94** touch two or more *task bundles* (K+fragment, S+router+features+Business meta+abi, microkernel, build, host, legacy). Largest pairs: Host+Legacy 13 and Host+Microkernel 13 files, K+S 14, K+Host+Legacy+S 16. Full per-file listing: Appendix C.

## 4. Tarball inventory without building

Command (cwd changes were unavailable in the harness shell, so the folder form was used; equivalent to running in the package directory):
```
npm pack <abs>/packages/domain-harness          --dry-run --json --ignore-scripts
npm pack <abs>/packages/domain-harness-compiler --dry-run --json --ignore-scripts
```
Both exited 0 (stderr empty). Committed `dist/` trees are packed as they are (1210 + 112 tracked files: `git ls-files packages/domain-harness/dist | wc -l` = 1210, compiler 112). `prepack`/`build` were NOT run; freshness of `dist` is guarded by `scripts/check-committed-dist.mjs` (NOT_RUN).

| Property | `@kaicreator/domain-harness@0.2.0` | `@kaicreator/domain-harness-compiler@0.2.0` |
| --- | --- | --- |
| entryCount / size / unpacked | 1212 / 1,341,024 B / 6,179,165 B | 125 / 368,888 B / 1,492,317 B |
| top-level split | `dist` 1210, `README.md`, `package.json` | `dist` 112, `src` 11, `README.md`, `package.json` |
| `src/` ships | **no** (0 files) | **yes - 11 files**: 10 `src/qualified-package/payload/*.mjs` + `src/qualified-package/v09/workflow-router.mjs` |
| tests ship | no | no |
| `*.map` files | 604 (declaration + source maps) | 0 |
| legacy dist ships | **yes**: `dist/` dirs public-v2 4, public-v3 4, public-v4 4, public-v7 8, public-v8 40, public-v9 24, legacy-v1 4, host-v8 60, host-v9 38, recovery-v2 16, v2 68, public, runtime 84, contracts 96, dac-* ..., workflow, etc. (57 top-level `dist/` subdirectories) | `dist/` : app-contracts, compat/{raw-v07,v01-expr,v01-script}, compile, package, raw, script, qualified-package (v09build 14, v10build 28, v10evidence 2, v10meta 4, v10shadow 4, + 10) |
| K02 fragment ships | n/a | **yes**: `src/qualified-package/payload/durable-receipt-carrier-v1.mjs` is in the packlist |
| business-meta-feedback / sfeature-meta-feedback ship | n/a | yes (both under `src/qualified-package/payload/`) |
| manifest allowlist | `files: ["dist","README.md"]`; **no** `.npmignore` (`git ls-files packages/domain-harness/.npmignore` empty) | `files: ["dist","README.md","src/qualified-package/payload/*.mjs","src/qualified-package/v09/workflow-router.mjs"]` |
| dependencies | `ajv`, `json-schema-library`, `xstate` (dev: `jsonata`, `yaml`, `zod`) | `ajv`, `jsonata`, `typescript`, `yaml`; peer `@kaicreator/domain-harness@0.2.0` |
| `engines` | none | `node >=22.15.0` |

Full file listings are in `pack-core.json`/`pack-comp.json` under `_tmp/dh-i1300-l2-claude` (not committed; regenerate with the command above).

## 5. `Retained*` helpers exported by `payload/standard-sdk-v1.mjs`

`grep -rn '\b<name>\b'` across `*.ts,*.mjs,*.mts,*.js,*.cjs` excluding `node_modules`, `dist`, `.d.mts` and the defining file. "Selected callers" = `C/v10build/**`, `examples/**`, `extensions/**`, root `tests/**`.

| Helper (definition line) | Non-test callers | Test callers (files:hits) | `examples/` `extensions/` | Selected-path callers |
| --- | --- | --- | --- | --- |
| `projectRetainedRead` (1228) | `H/host-v8/kernel-gateway.ts` 3, `H/public-v8/microkernel.ts` 3 | compiler `v08-standard-sdk-retention-d02` 7, `v08-tf-oracle-fr05-fr08` 1; core `v08-integration/fr05-hf17-hf23-selected-physical` 2 | none | **0** |
| `resolveRetainedDecision` (1280) | `public-v8/microkernel.ts` 3; **`payload/kernel-mechanism-v1.mjs` 3 (comment `4245-4246`, error message `4881`, comment `5001`)** | compiler `retention-d02` 7, `tf-oracle` 1; core fixtures `v08-integration/fixtures/{business-decision-source,business-decision-source-bad,sdk-no-decision-source}.mjs` 3 | none | 0 code callers; **named by K Primary** |
| `projectRetainedAgentTools` (1326) | `kernel-gateway.ts` 1, `microkernel.ts` 3 | `retention-d02` 5 | none | **0** |
| `projectRetainedCompiledData` (1455) | `microkernel.ts` 3 | none | none | **0** |
| `makeRetainedDecisionReceipt` (1567) | none | `retention-d02` 3 | none | **0** |
| `selectRetainedPromotedChild` (1660) | `microkernel.ts` 3; **`kernel-mechanism-v1.mjs` 2 (comments/message)** | `retention-d02` 5; core fixtures 3 | none | 0 code callers; **named by K Primary** |
| `coalesceRetainedObservations` (1689) | `kernel-gateway.ts` 2, `microkernel.ts` 3 | `retention-d02` 4; core `fr05-hf17-hf23-selected-physical` 1 | none | **0** |
| `checkRetainedEvidenceApplicability` (1720) | `microkernel.ts` 3; **`kernel-mechanism-v1.mjs` 2** | `retention-d02` 4; core fixtures 3 | none | 0 code callers; **named by K Primary** |

Kernel contract fact: K Primary requires the three decision-source endpoints on its `sdkEndpoint` (`resolveDecisionSource`, `selectPromotedChild`, `checkEvidenceApplicability`) whenever a Business policy declares decision-source rules, otherwise it throws `DECISION_SOURCE_SDK_ENDPOINT_UNAVAILABLE` (`kernel-mechanism-v1.mjs:4871-4882`, uses `5093,5134,5146,5162,5198`). The v0.8 microkernel wires them (`H/public-v8/microkernel.ts:1319-1326`); the v0.10 activation passes `sdkEndpoint: { packageId, interpret }` only (`C/v10build/activation.ts:~951-956`), so on the v0.10 path those rules fail closed (relates to open #1267).

## 6. `v10meta`, `v10shadow` (and the unlisted `v10evidence`)

| Module | Exports (names) | Consumers (non-test) | Consumers (tests) | Declared owner in source |
| --- | --- | --- | --- | --- |
| `C/v10meta` (`index.ts` 32 LOC, `meta-feedback-workflow.ts` 975) | `META_FEEDBACK_*` constants, `MAX_META_*`, `MetaFeedbackError`, `metaFeedbackClaimKey/EvidencePrefix/LedgerKey`, `runMetaFeedbackWorkflow` + 6 types; imports `activation`, `digest`, `errors`, `guards` | none in `examples/`/`extensions/`; compiler `exports["./v10meta"]` | root `tests/hosts/node/v010-t09-meta-{feedback-workflow,fixture,crash-child,race-child,r1-repair,packed-consumer}.*` (7 files), `tests/compiler/v010-{comment-invariants,error-lineage-union,error-code-catalog}.test.ts`, `scripts/check-v010-error-code-catalog.mjs` | header: "Host-owned recurring proposal-only Meta Feedback Workflow" |
| `C/v10shadow` (`index.ts` 27, `shadow-l4-readonly.ts` 1205) | `SHADOW_K_DOCS_PREFIX`, `SHADOW_L4_ABI`, `SHADOW_L4_EVIDENCE_KIND`, `ShadowL4Error`, `pinCandidateSource`, `runShadowL4`, `selectedFallbackPin`, `selectedFallbackProvenance` + 9 types; imports `activation`, `digest`, `errors`, `guards`, `node:vm` | `examples/v010-clean-consumer/apps/rich/scenario.mjs` (import `@kaicreator/domain-harness-compiler/v10shadow`); compiler `exports["./v10shadow"]` | `tests/hosts/node/v010-t07-shadow-l4-physical.test.ts`, `tests/hosts/node/v010-t09-meta-fixture.ts`, `tests/compiler/v010-{comment-invariants,error-code-catalog,error-lineage-union}.test.ts`, `scripts/check-v010-error-code-catalog.mjs` | header: "Host-owned read-only Shadow L4 surface" |
| `C/v10evidence` (`decision-evidence-observer.ts` 17 KB) | `OBSERVER_ABI`, `DecisionEvidenceObserverError`, `createDecisionEvidenceObserver`, types | none; **no `exports` entry**, yet shipped in compiler `dist/qualified-package/v10evidence/` | `tests/assembly/v010-t06-decision-evidence.test.ts`, `tests/hosts/node/v010-t09-meta-fixture.ts`, `tests/compiler/v010-error-lineage-union.test.ts` | header: "Host-origin read-only DecisionEvidence observation bridge" / "deployment-owned trusted counterpart" |
| `C/payload/business-meta-feedback-v1.mjs` (137), `sfeature-meta-feedback-v1.mjs` (250) | Business module / S feature | compiler `exports["./payload/business-meta-feedback-v1"]`, `["./payload/sfeature-meta-feedback-v1"]` | `tests/hosts/node/v010-t09-meta-{fixture.ts,feedback-workflow.test.ts,packed-consumer.mjs}` | `MODULE_ID` `business-meta-feedback@v010.1.0.0` / `sfeature-meta-feedback@v010.1.0.0` |

`scripts/check-v010-error-code-catalog.mjs:18,20` hard-codes `packages/domain-harness-compiler/src/qualified-package` and `packages/domain-harness/src/host-v8` as scan roots; the catalog artifact is `docs/architecture/V010_TYPED_REFUSAL_LITERAL_CATALOG.json`.

## 7. CI and engines

| Item | Fact | Evidence |
| --- | --- | --- |
| Workflows | `.woodpecker/verify.yaml`, `.woodpecker/verify-min-node.yaml` (only two) | `ls .woodpecker` |
| `verify.yaml` triggers | `pull_request`; `push` on branches `main, v0.2, v0.3, v0.4`; `manual` | `verify.yaml:4-8` |
| `verify.yaml` auto steps | `git --version && node --version && npm --version`; `test "$(git rev-parse HEAD)" = "$CI_COMMIT_SHA"`; node major `< 22` gate; `npm ci`; `npm run build`; `npm run lint`; `npm run typecheck`; **smoke:** `node --import tsx --test packages/domain-harness/tests/v09-host-registry-n06.test.ts packages/domain-harness/tests/v09-private-principal.test.ts packages/domain-harness-compiler/tests/v09-build-zero-import-n06.test.ts` | `verify.yaml:15-29` |
| `verify.yaml` manual step | `full-regression`: `npm test` | `verify.yaml:35-40` |
| `verify-min-node.yaml` | triggers `pull_request`, `manual`; pins `MIN_NODE=v22.15.0` (musl build downloaded from `unofficial-builds.nodejs.org`); same `npm ci/build/lint/typecheck`; tests: `v09-host-registry-n06`, `v09-private-principal`, `v09-build-zero-import-n06`, then `tests/compiler/v010-import-hook-registry.test.ts`, `tests/compiler/v010-public-api-boundary.test.ts` | `verify-min-node.yaml:12-14,23,37-45` |
| Node on CI | ECF local-backend workers: Alpine with Node 24 preinstalled (comment); min lane Node 22.15.0 | yaml comments; `PROJECT_OVERRIDES.md:195` |
| `PROJECT_OVERRIDES.md` CI profile | line 186 describes the auto smoke as "three bounded v0.9 Host/private-principal/BUILD test files" and "Node major-version 22+ gate"; line 240: "Node.js `>=22` remains the existing workspace/CI toolchain floor"; line 291: any change to `.woodpecker/verify.yaml` requires a truthful CI Profile update in this file; the min-node lane is **not mentioned** in the file | `grep -n` |
| Root `package.json` scripts | `build` = `npm run build --workspaces --if-present && node scripts/check-committed-dist.mjs`; `typecheck`; `test` = workspaces + `test:root`; `test:root` globs `tests/assembly/*.test.ts`, `tests/conformance/*.test.ts`, `tests/compiler/*.test.ts`, `tests/hosts/node/*.test.ts`, `tests/migration/v01-expr/*.test.ts`, `tests/tools/remote/*.test.ts` (node --import tsx) and `tests/migration/v01-script/*.test.mjs`, `tests/tools/script/*.test.mjs`; `lint` = `node scripts/lint.mjs && eslint .` | `package.json:5-17` |
| Not in any `test:root` glob | `tests/architecture-v010-k-extensions/**` (#1150 spike), `tests/integration/**` (T11 clean consumers, package-versioning), `tests/critical-journeys/**`, `tests/hosts/{expo,expo-store,expo-v3-host,successor-expo}` | globs above |
| Path-bound root scripts | `scripts/lint.mjs:6` roots `['packages','scripts']` + portable-core path list (`17-32`); `eslint.config.mjs:77-92,118-122` per-package paths and `examples/**` ignore (`45`); `scripts/check-committed-dist.mjs` `shippedEntries` for `packages/domain-harness` and `packages/domain-harness-compiler` only; `scripts/check-v010-error-code-catalog.mjs:18,20` | files |
| Lockfile | `package-lock.json` `lockfileVersion` 3, 189 package entries; workspace entries record only `name`, `version`, `dependencies`, `devDependencies`, `peerDependencies`, `engines` (+ root `workspaces`, and `node_modules/@kaicreator/*` link entries) | `node -e` over the lockfile |

**All `engines` fields** (`git ls-files '*package.json'`): root `node >=22.15.0`; `@kaicreator/domain-harness-compiler` `>=22.15.0`; `@kaicreator/domain-harness-node` `>=22`; `@kaicreator/domain-harness` none; `@kaicreator/domain-harness-expo` none; the four `@kaicreator/domain-feature-*` (v0.10.1, private) `>=24.0.0`; `examples/v010-clean-consumer`, `examples/expo-conformance`, test consumers: none. Root devDependency `@types/node` is `^22.0.0`.

## 8. Does the selected path import `domain-harness-node` / `domain-harness-expo`?

No. Evidence: (i) section 1.2 - no file in `C/v10build|v10meta|v10shadow|v10evidence|payload|v09`, `examples/v010-clean-consumer`, `examples/v0101-agent-improvement`, `extensions/` imports either package; (ii) `grep -rl 'domain-harness-node'` over `*.ts,*.mjs,*.mts,*.json,*.yaml` excluding docs, `node_modules`, `dist`, the package itself and lockfiles returns only `.agent/execution/**` (documentation) - no code; (iii) `domain-harness-expo`/`expo-conformance` code references are confined to `eslint.config.mjs`, legacy `packages/domain-harness/tests/{t012,t012r,t014,v2-boundaries}`, `packages/domain-harness-node/tests/**`, `tests/hosts/{expo,expo-store,expo-v3-host,successor-expo}` and `examples/expo-conformance`. Both packages' `src` import only `@kaicreator/domain-harness` and `/v2` (section 1.2). Both are `packages/*` workspaces and are therefore built by `npm run build --workspaces` and tested by `npm test` today (`package.json:5-7,12-14`; `packages/domain-harness-node/package.json` scripts).

## 9. Other facts used by the design

| Fact | Evidence |
| --- | --- |
| K Primary runtime takes an `observe` option; `safeObserve(receipt)` is called at admission, replay, terminal and recovery receipts; observer failures are swallowed; "not an authority path" | `kernel-mechanism-v1.mjs:64,4764,5895-5900` (calls `5453,5487,5582,5939,5995,6028,6299,6440`) |
| The v0.10 activation passes a **no-op** `observe` ("no side observation at T00") | `activation.ts:946-948` |
| `V10AppFacade` public methods: `send` (1011), scoped `queryScopedSnapshot` (738), `queryManyScopedSnapshots` (766), `invokeSelectedStandardFeature` (674), `selectedExtensions/Features/ShadowBinding` getters (608-634), `isClosed` (696), `close` (700, sets a flag only), `kCounters` (705), `resolveIntentTarget` (717), `preflightIntentRouting` (981). `V10Activation.dispose()` (idempotent; releases bare-import allowance, closes facade, reverse-disposes advisories) at `1295-1310`. No `subscribe`/`stop` | `activation.ts` |
| Public barrel today exports `V10AppFacade` (class), `activateV10App`, deployment functions, errors; it deliberately omits `freshV10Counters`, `V10Counters`, `V10AppView`, the effect gate, `v10SelectedKernelIdentity` (`index.ts:7-82`); guarded by `tests/compiler/v010-public-api-boundary.test.ts` | files |
| Query authority: `V10QueryAuthority { principal, authorize(principal, target) }` is activation wiring; absent -> `QUERY_AUTHORIZATION_REQUIRED`; without `deploymentIdentity` -> `QUERY_DEPLOYMENT_REQUIRED` | `activation.ts:187-196,738-754` |
| Existing authenticated subscription pattern (v0.8 gateway): filter by `receipt.occurrence.workflowInstanceId`, re-authenticate on **every** delivery, unsubscribe on invalidation | `H/host-v8/kernel-gateway.ts:1230-1260` (and `1361-1441`) |
| v0.8 microkernel facade was `send/query/subscribe/stop` with `subscribe` refused (`refusePublicRoute('subscribe')`) | `H/public-v8/microkernel.ts:20,1767-1774,2170` |
| Effect gate takes **K-issued addresses** from the per-call `attest.effectPermit.keys` (`permit`,`journal`,`fence`,`dispatchClaim`) and contains no key builder; it reads document value fields `state==='live'`, `durableControlTurnId`, `businessPackageId`, `capabilityKey`, `operations[]`, `expiresAt`, `attempt`, `awaitPolicy`, `target{workflowId,instanceKey}`; journal `record{effectId,status:'started'}`; fence `turnId`; claim `{effectId,durableControlTurnId,businessPackageId,attempt}` | `external-effect.ts:151-286`; K writers `kernel-mechanism-v1.mjs:5829-5841,5694,2867-2918` |
| Mirrored K doc-key literals (outside K): `v08-kernel:wf-instance:`, `v08-kernel:receipt-archive:` in `digest.ts:51-56` (consumed `deployment.ts:1503,1511`; drift fence = governed reservation witness RES4, `digest.ts:46-50`, `tests/hosts/node/v010-t08-reservation-recovery.test.ts:374`); K02 grammar root `v010-k02` + component escape (`%`->`%25`, `:`->`%3A`) in `activation.ts:355-358,379-388,403-420,658`, `deployment.ts:1482` | files; K originals `kernel-mechanism-v1.mjs:2765-2781,2821,2838-2857,2867-2918` |
| K Primary structural export check at activation: only `createOccurrenceRuntime` must be a function; extension/feature modules have strict export allowlists | `activation.ts:1118-1160` |
| BUILD never evaluates module source, performs no I/O, refuses cross-package import edges; module bytes are produced by the producer, not bundled by BUILD (`V10_BUNDLER_REVISION` is only a recorded constant) | `build.ts:31-34,47-49`; `digest.ts:28`; `build.ts:651,669` |
| `V10ModuleInput` fields: `packageId, role, abiVersion, moduleSource?, moduleSha256?, endpoint, dependencies?, externalImports?{node,npm,native}, provides?, requires?, optional?, providerId?, hookExport?, featureExport?, capabilityId?, handlers?[{operationId,handler}], externalEffect?`; `handlers` and `externalEffect` are refused on non-capability roles (`V10_AUTHORITY_FORGERY`) | `build.ts:88-118,369-373`; extension needs `providerId`+`hookExport`+exactly one `provides`; feature needs `featureExport`+one `provides` starting `standard:` (`462-478`) |
| Role ABI strings: `kernel-primary` `v08-kernel-abi/1`, `standard-primary` `v08-standard-sdk-abi/1`, `business` `v08-business-abi/1`, `capability` `v08-capability-abi/1`, `kernel-extension` `dh.v10.k-extension/1`, `standard-feature` `dh.v10.standard-feature/1`; profile `node24-esm/1`; format `dh.v10.build/1`; intent kind `v08/tc-intent` | `digest.ts:21-69` |
| `better-sqlite3` is opened by dynamic import and is a root devDependency; absent -> typed error | `sqlite-cas-store.ts:202-216`, `package.json:22` |
| Vendored BUILD parser: `assertVendoredParserBytes()` hashes `generated/acorn.mjs` located next to `parser.js` at runtime; committed compiler `dist/qualified-package/v09build/generated/acorn.mjs` exists; the compiler `build` script is plain `tsc -p tsconfig.build.json` (how the `.mjs` reaches `dist` is NOT_VERIFIED here) | `C/v09build/parser.ts:12-60`; `ls dist/.../generated`; `packages/domain-harness-compiler/package.json` scripts |
| The four `extensions/agent-improvement/packages/*` are `private`, `engines >=24.0.0`, `files: [modules/*.mjs, feature-manifest.mjs, README.md]`, tests `node --test tests/<name>.test.mjs`; sit outside `workspaces` (`packages/*`) | their `package.json` |
| `extensions/agent-improvement/host/ct02-data-only-invoker.mjs` is imported by `tests/hosts/node/v0101-feature-suite.test.ts:6` and `examples/v0101-agent-improvement/integration/selected-subsets-build.mjs:19` | grep |
| Open residual-risk locations: #1270 genesis (`kernel-mechanism-v1.mjs` `createInstance` then `bindGovernance`; `activation.ts` `send` skips genesis when the instance doc exists; T11 `rich-race` matcher); #1267 (`interpret` calls only the S Primary; features are Host-invoked through `invokeSelectedStandardFeature`); #1265 (no `subscribe`/`stop`) | issue bodies |
| K outward receipt on admission carries `status, admitted, instance, occurrence{messageId,workflowInstanceId}, attribution, decisionReceipt?, turnDisposition` and is passed to `safeObserve` then returned to the caller; a scoped query answer is `{target, snapshot}` only | `kernel-mechanism-v1.mjs:6431-6441`; `activation.ts:205-215` |
| K builders for the doc-key families: `legacyKernelDocKeys` (2867), `scopedDocKeyPrefix` (2887), `scopedKernelDocKeys` (2905); `K02_SCOPED_KEY_ROOT` (2765) | `kernel-mechanism-v1.mjs` |
| K blob-id pins in tests: `K02_SPLICED_KERNEL_BLOB_SHA1` = `72a886ff...` in `packages/domain-harness/tests/v08-host/k02-combined-splice-physical.test.ts:61`, `k02-namespace-two-b-physical.test.ts:54`, `t10-multib-query-physical.test.ts:61`; `V08_K_BLOB` in `packages/domain-harness-compiler/tests/v08-tf-oracle-fr02-fr07.test.ts:136`. K sha256 `66f19f8968cb58cc59808c9c15cfbb193618a150a61ac00a5b5797bec1250630` appears only in historical evidence `docs/validation/v0.10.1/t06/logs/08-t11-evidence.json`. A scan for 64-hex string literals in `tests/`, `packages/`, `examples/` (excluding legacy t012-t014 vectors) found no K-derived golden in the root v010 tests; candidates in `v08-integration/{helpers.ts,fixtures/*}`, `v09-host-registry-n06.test.ts`, `v08-standard-sdk-nf06-receipt.test.ts` are NOT classified | `findhash.mjs`, `hex64.mjs` (scripts file) |
| Error-code catalog: `scripts/check-v010-error-code-catalog.mjs:18-38` enumerates `.ts` files of `v10build, v10evidence, v10meta, v10shadow` under the compiler root plus `host-v8/v010-*.ts`; `tests/compiler/v010-comment-invariants.test.ts:6-18` reads the same four directories; artifact `docs/architecture/V010_TYPED_REFUSAL_LITERAL_CATALOG.json` | files |
| Governed activation (`GovernedBuildActivation`): `send`, `queryScopedSnapshot`, `queryManyScopedSnapshots`, `kCounters`, `resolveIntentTarget`, `readPin`, `recoverReservation`, `close` (calls `this.#activation.dispose()`); queries delegate to the raw facade without a pin check; no `subscribe`/`stop`; `V10DeploymentError` carries a frozen `detail` | `deployment.ts:81-88,960-1013,1519-1539` |
| Names imported from `activation.ts` by Host-side modules: meta `V10AppFacade`; shadow `V10AppFacade, v10DeploymentDocsPrefix, v10K02DocumentPrefix` (+type `V10AppView`); evidence `V10AppFacade` (used for `instanceof`, `decision-evidence-observer.ts:145`); deployment `activateV10App, v10DeploymentDocsPrefix, v10K02DocumentPrefix, v10SelectedKernelIdentity, V10AppFacade` (+types) | the four files |

## Appendix A - payload / v09 / v10build literal references in tests

<details><summary>A.1 files with a literal path into <code>qualified-package/payload</code> (69)</summary>

- `packages/domain-harness-compiler/tests/v08-k02-durable-receipt-carrier.test.ts`
- `packages/domain-harness-compiler/tests/v08-kernel-d3-context-projection.test.ts`
- `packages/domain-harness-compiler/tests/v08-kernel-fr07-continuation.test.ts`
- `packages/domain-harness-compiler/tests/v08-kernel-message-dedup.test.ts`
- `packages/domain-harness-compiler/tests/v08-kernel-package-c01.test.ts`
- `packages/domain-harness-compiler/tests/v08-kernel-turn-source.test.ts`
- `packages/domain-harness-compiler/tests/v08-standard-sdk-d01.test.ts`
- `packages/domain-harness-compiler/tests/v08-standard-sdk-fr02-expression.test.ts`
- `packages/domain-harness-compiler/tests/v08-standard-sdk-fr07-step.test.ts`
- `packages/domain-harness-compiler/tests/v08-standard-sdk-fr08-sd.test.ts`
- `packages/domain-harness-compiler/tests/v08-standard-sdk-nf06-receipt.test.ts`
- `packages/domain-harness-compiler/tests/v08-standard-sdk-retention-d02.test.ts`
- `packages/domain-harness-compiler/tests/v08-tf-d2-approval-rig.ts`
- `packages/domain-harness-compiler/tests/v08-tf-d3-engineering-lifecycle.test.ts`
- `packages/domain-harness-compiler/tests/v08-tf-oracle-fr02-fr07.test.ts`
- `packages/domain-harness-compiler/tests/v08-two-real-domain-apps-f01.test.ts`
- `packages/domain-harness-compiler/tests/v09-selected-abi-n01.test.ts`
- `packages/domain-harness-compiler/tests/v09-workflow-router-n01-integration.test.ts`
- `packages/domain-harness/tests/v08-host/children/k01-fence-worker.mjs`
- `packages/domain-harness/tests/v08-host/children/k02-receipt-worker.mjs`
- `packages/domain-harness/tests/v08-host/children/k02-splice-worker.mjs`
- `packages/domain-harness/tests/v08-host/k02-combined-splice-physical.test.ts`
- `packages/domain-harness/tests/v08-host/k02-namespace-two-b-physical.test.ts`
- `packages/domain-harness/tests/v08-host/k02-receipt-cas-physical.test.ts`
- `packages/domain-harness/tests/v08-host/k02-receipt-race-multiprocess.test.ts`
- `packages/domain-harness/tests/v08-host/t10-multib-query-physical.test.ts`
- `packages/domain-harness/tests/v08-integration/d3-lineage-clean-process.test.ts`
- `packages/domain-harness/tests/v08-integration/fr01-child-depth-physical.test.ts`
- `packages/domain-harness/tests/v08-integration/fr05-hf17-hf23-selected-physical.test.ts`
- `packages/domain-harness/tests/v08-integration/fr08-load-cache-fault-negatives.test.ts`
- `packages/domain-harness/tests/v08-integration/fr11-hf24-compiled-data-selected.test.ts`
- `packages/domain-harness/tests/v08-integration/helpers.ts`
- `packages/domain-harness/tests/v08-integration/hf18-durable-deadline-callback-physical.test.ts`
- `packages/domain-harness/tests/v08-integration/hf18-history-eviction-physical.test.ts`
- `packages/domain-harness/tests/v08-integration/hf20-mutation-observation.test.ts`
- `packages/domain-harness/tests/v08-integration/hf23-shared-operationid-negative.test.ts`
- `packages/domain-harness/tests/v08-integration/hf29-tool-call-port-physical.test.ts`
- `packages/domain-harness/tests/v08-integration/hf32-child-routing-physical.test.ts`
- `packages/domain-harness/tests/v08-integration/hf34-definition-graph-module-binding.test.ts`
- `packages/domain-harness/tests/v08-integration/i04-model-bind-negatives.test.ts`
- `packages/domain-harness/tests/v08-integration/i04-model-port.test.ts`
- `packages/domain-harness/tests/v08-integration/r02-stale-admission-cas-physical.test.ts`
- `packages/domain-harness/tests/v08-integration/s04-operation-call.test.ts`
- `packages/domain-harness/tests/v08-integration/s04-register-atomic.test.ts`
- `packages/domain-harness/tests/v08-integration/s05-capability-identity.test.ts`
- `packages/domain-harness/tests/v08-integration/tf-two-real-apps-packed-e2e.test.ts`
- `packages/domain-harness/tests/v08-integration/tg5-kernel-taxonomy-selected-physical.test.ts`
- `packages/domain-harness/tests/v08-integration/v08-tf-fr02-fr07-selected-clean-process.test.ts`
- `packages/domain-harness/tests/v08-integration/v08-tf-fr02-fr07-selected-physical.test.ts`
- `packages/domain-harness/tests/v09-deployment-bootstrap.test.ts`
- `packages/domain-harness/tests/v09-external-consumer.test.ts`
- `packages/domain-harness/tests/v09-lifecycle-integration.test.ts`
- `packages/domain-harness/tests/v09-operation-bridge.test.ts`
- `tests/architecture-v010-k-extensions/harness/v10-subject.ts`
- `tests/assembly/helpers-v010.ts`
- `tests/assembly/v010-c01-external-effect.test.ts`
- `tests/assembly/v010-semantic-decision-feature.test.ts`
- `tests/assembly/v010-t03-workflow-control-feature.test.ts`
- `tests/assembly/v010-t04-selected-memory.test.ts`
- `tests/assembly/v010-t05-agent-workflow.test.ts`
- `tests/assembly/v010-t05-context-feature.test.ts`
- `tests/assembly/v010-t06-decision-evidence.test.ts`
- `tests/assembly/v010-t07-candidate-validation.test.ts`
- `tests/hosts/node/v010-c01-child.mjs`
- `tests/hosts/node/v010-c01-external-effect-physical.test.ts`
- `tests/hosts/node/v010-t03-workflow-control-physical.test.ts`
- `tests/hosts/node/v010-t08-reservation-recovery.test.ts`
- `tests/hosts/node/v010-t09-meta-fixture.ts`
- `tests/hosts/node/v010-t10-selected-app-fixture.ts`

</details>

<details><summary>A.2 files with a literal path into <code>qualified-package/v09</code> (17)</summary>

- `packages/domain-harness-compiler/tests/v09-selected-abi-n01.test.ts`
- `packages/domain-harness-compiler/tests/v09-workflow-router-n01-integration.test.ts`
- `packages/domain-harness-compiler/tests/v09-workflow-router-n01.test.mjs`
- `packages/domain-harness/tests/v09-deployment-bootstrap.test.ts`
- `packages/domain-harness/tests/v09-external-consumer.test.ts`
- `packages/domain-harness/tests/v09-lifecycle-integration.test.ts`
- `packages/domain-harness/tests/v09-operation-bridge.test.ts`
- `tests/architecture-v010-k-extensions/harness/v10-subject.ts`
- `tests/assembly/helpers-v010.ts`
- `tests/assembly/v010-c01-external-effect.test.ts`
- `tests/assembly/v010-t04-selected-memory.test.ts`
- `tests/assembly/v010-t05-agent-workflow.test.ts`
- `tests/assembly/v010-t06-decision-evidence.test.ts`
- `tests/hosts/node/v010-c01-child.mjs`
- `tests/hosts/node/v010-c01-external-effect-physical.test.ts`
- `tests/hosts/node/v010-t09-meta-fixture.ts`
- `tests/hosts/node/v010-t10-selected-app-fixture.ts`

</details>

<details><summary>A.3 files with a literal path into <code>qualified-package/v10build</code> (39)</summary>

- `tests/assembly/helpers-v010.ts`
- `tests/assembly/v010-build-activation.test.ts`
- `tests/assembly/v010-c01-external-effect.test.ts`
- `tests/assembly/v010-semantic-decision-feature.test.ts`
- `tests/assembly/v010-t03-workflow-control-feature.test.ts`
- `tests/assembly/v010-t04-selected-memory.test.ts`
- `tests/assembly/v010-t05-agent-workflow.test.ts`
- `tests/assembly/v010-t05-context-feature.test.ts`
- `tests/assembly/v010-t06-decision-evidence.test.ts`
- `tests/assembly/v010-t07-candidate-validation.test.ts`
- `tests/compiler/v010-comment-invariants.test.ts`
- `tests/compiler/v010-error-boundaries.test.ts`
- `tests/compiler/v010-error-lineage-union.test.ts`
- `tests/compiler/v010-import-hook-registry.test.ts`
- `tests/compiler/v010-public-api-boundary.test.ts`
- `tests/compiler/v010-record-guards.test.ts`
- `tests/compiler/v010-selected-closure.test.ts`
- `tests/compiler/v10build-composition.test.ts`
- `tests/conformance/v0101-sdk-features.test.ts`
- `tests/hosts/node/v010-c01-child.mjs`
- `tests/hosts/node/v010-c01-external-effect-physical.test.ts`
- `tests/hosts/node/v010-t07-shadow-l4-physical.test.ts`
- `tests/hosts/node/v010-t08-governed-build-activation.test.ts`
- `tests/hosts/node/v010-t08-governed-build-fixture.ts`
- `tests/hosts/node/v010-t08-governed-decision.test.ts`
- `tests/hosts/node/v010-t08-pinned-restore-child.ts`
- `tests/hosts/node/v010-t08-pinned-restore.test.ts`
- `tests/hosts/node/v010-t08-reservation-f2-child.ts`
- `tests/hosts/node/v010-t08-reservation-recovery.test.ts`
- `tests/hosts/node/v010-t08-restart-child.ts`
- `tests/hosts/node/v010-t09-meta-crash-child.ts`
- `tests/hosts/node/v010-t09-meta-feedback-workflow.test.ts`
- `tests/hosts/node/v010-t09-meta-fixture.ts`
- `tests/hosts/node/v010-t09-meta-r1-repair.test.ts`
- `tests/hosts/node/v010-t10-selected-app-fixture.ts`
- `tests/hosts/node/v010-t10-selected-app-query-child.ts`
- `tests/hosts/node/v010-t10-selected-app-query.test.ts`
- `tests/hosts/node/v010-t10b-querymany-physical.test.ts`
- `tests/hosts/node/v0101-build-skipped-optional-provider.test.ts`

</details>

## Appendix B - legacy-surface importers (200 test files, `path :: targets`)

<details><summary>Full list</summary>

- `packages/domain-harness-compiler/tests/app-contract-packed-consumer.test.ts` :: `pkg:v3`
- `packages/domain-harness-compiler/tests/business-source-section.test.ts` :: `pkg:v2`
- `packages/domain-harness-compiler/tests/domain-data-key-order.test.ts` :: `pkg:v2`
- `packages/domain-harness-compiler/tests/domain-data-schema-contract.test.ts` :: `pkg:v2`
- `packages/domain-harness-compiler/tests/domain-data-schema-shape.test.ts` :: `pkg:v2`
- `packages/domain-harness-compiler/tests/domain-data-section.test.ts` :: `pkg:v2`
- `packages/domain-harness-compiler/tests/e8a-legacy-raw-compatibility-reference.test.ts` :: `pkg:v7,pkg:v3`
- `packages/domain-harness-compiler/tests/e8b-final-v06-compat-reference.test.ts` :: `pkg:v2`
- `packages/domain-harness-compiler/tests/profile-scaffold.test.ts` :: `pkg:v2`
- `packages/domain-harness-compiler/tests/public-api-compatibility.test.ts` :: `pkg:v2`
- `packages/domain-harness-compiler/tests/public-consumer.test.ts` :: `pkg:v2,pkg:v7`
- `packages/domain-harness-compiler/tests/raw-v07-adapter.test.ts` :: `pkg:v7`
- `packages/domain-harness-compiler/tests/raw-v07-harness-config-promoted-subworkflow.test.ts` :: `pkg:v7`
- `packages/domain-harness-compiler/tests/raw-v07-identity-correspondence.test.ts` :: `pkg:v7`
- `packages/domain-harness-compiler/tests/semantic-decision-declaration.test.ts` :: `pkg:v2`
- `packages/domain-harness-compiler/tests/v08-capability-package-s02a.test.ts` :: `public-v8,pkg:v8`
- `packages/domain-harness-compiler/tests/v08-qualified-package-a01.test.ts` :: `public-v8,pkg:v8`
- `packages/domain-harness-compiler/tests/v08-tf-d2-approval-rig.ts` :: `public-v8`
- `packages/domain-harness-compiler/tests/v09-build-zero-import-n06.test.ts` :: `host-v9`
- `packages/domain-harness-node/tests/cross-host/chm-corpus.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/cross-host/chm-cross-host.test.ts` :: `public-v2,pkg:v2`
- `packages/domain-harness-node/tests/cross-host/e8b-final-v06-expo-parity-reference.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/cross-host/t003-expo-revision-guard.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/accepted-message-identity.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/concurrency.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/e8b-final-v06-message-identity-reference.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/e8b-final-v06-processed-command-revision-reference.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/i135-processing-reclaim.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/runtime-lifecycle.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/runtime-store.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/t003-processed-command-revision-guard.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/t016-package-consumer.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/t016-runtime-smoke.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/t022-execution-stores.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/t022-runtime-store-seams.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/t180-provisioning.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/store/t312-observation.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/successor-host/e07-e08-regression.test.ts` :: `public-v2,pkg:v2`
- `packages/domain-harness-node/tests/successor-host/fr11-domain-data-consumer.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/successor-host/helper.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/successor-host/n11-n17-durability.test.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/v3-host/host-fixture.ts` :: `pkg:v2`
- `packages/domain-harness-node/tests/v3-host/t022-promoted-stack.test.ts` :: `pkg:v2`
- `packages/domain-harness/tests/component/component-envelope.test.ts` :: `public-v2`
- `packages/domain-harness/tests/critical-journeys.test.ts` :: `legacy-v1`
- `packages/domain-harness/tests/dac-v0041-foundation/dac-v0041-authority-ceiling.test.ts` :: `public-v4`
- `packages/domain-harness/tests/public-contracts.test.ts` :: `legacy-v1`
- `packages/domain-harness/tests/public-sdk.test.ts` :: `legacy-v1`
- `packages/domain-harness/tests/public-v7/execution-type-fixtures.ts` :: `pkg:v7`
- `packages/domain-harness/tests/public-v7/public-v7-execution-portability.test.ts` :: `pkg:v7,pkg:v3`
- `packages/domain-harness/tests/public-v7/public-v7-execution.test.ts` :: `public-v7,public-v8,host-v8,public-v9,pkg:v7`
- `packages/domain-harness/tests/public-v7/public-v7-portability.test.ts` :: `pkg:v7,pkg:v2`
- `packages/domain-harness/tests/public-v7/public-v7-repaired-semantics-consumer.test.ts` :: `pkg:v7,pkg:v2`
- `packages/domain-harness/tests/public-v7/public-v7-surface.test.ts` :: `public-v7,public-v2,public-v3,public-v4,public-v8,host-v8,public-v9`
- `packages/domain-harness/tests/public-v7/type-fixtures.ts` :: `pkg:v7,pkg:v2`
- `packages/domain-harness/tests/quality-hardening.test.ts` :: `legacy-v1`
- `packages/domain-harness/tests/recovery-v2/hf16-poison-drain-integration.test.ts` :: `recovery-v2`
- `packages/domain-harness/tests/recovery-v2/poison-message-recovery.test.ts` :: `recovery-v2`
- `packages/domain-harness/tests/recovery-v2/recovery-store-fake.ts` :: `recovery-v2`
- `packages/domain-harness/tests/root-portability.test.ts` :: `pkg:v3`
- `packages/domain-harness/tests/t012/consumer-src/n02b-types.ts` :: `pkg:v7,pkg:v3,pkg:v2`
- `packages/domain-harness/tests/t012/consumer-src/n03-sqlite.mjs` :: `pkg:v3`
- `packages/domain-harness/tests/t012/consumer-src/t010-journeys.mjs` :: `pkg:v7,pkg:v3,pkg:v2,pkg:v4,pkg:workflow`
- `packages/domain-harness/tests/t012r/consumer-src/fixture-toolplane.mjs` :: `pkg:v7`
- `packages/domain-harness/tests/t012r/consumer-src/n02b-types.ts` :: `pkg:v7,pkg:v3,pkg:v2`
- `packages/domain-harness/tests/t012r/consumer-src/n03-sqlite.mjs` :: `pkg:v3`
- `packages/domain-harness/tests/t012r/consumer-src/t010-journeys.mjs` :: `pkg:v7,pkg:v3,pkg:v2,pkg:v4,pkg:workflow`
- `packages/domain-harness/tests/t015/t015-closure-contract.test.ts` :: `public-v7`
- `packages/domain-harness/tests/v08-abi/s01-deploy-child.mjs` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-abi/v08-abi-a01.test.ts` :: `public-v8`
- `packages/domain-harness/tests/v08-abi/v08-abi-a02-trust-atomic.test.ts` :: `public-v8`
- `packages/domain-harness/tests/v08-abi/v08-abi-b01-facade.test.ts` :: `public-v8`
- `packages/domain-harness/tests/v08-abi/v08-abi-b01-untrusted.test.ts` :: `public-v8`
- `packages/domain-harness/tests/v08-abi/v08-abi-s01-installed-package.test.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-abi/v08-abi-s02a-capability.test.ts` :: `public-v8`
- `packages/domain-harness/tests/v08-abi/v08-abi-s03-lifecycle.test.ts` :: `public-v8`
- `packages/domain-harness/tests/v08-abi/v08-dac-b3b-approved-bytes.test.ts` :: `pkg:v8,pkg:v4`
- `packages/domain-harness/tests/v08-abi/v08-dac-public-verifier.test.ts` :: `pkg:v8,pkg:v4`
- `packages/domain-harness/tests/v08-abi/v08-tb-fixture.ts` :: `public-v8`
- `packages/domain-harness/tests/v08-host/children/cas-worker.mjs` :: `pkg:v8`
- `packages/domain-harness/tests/v08-host/children/k01-fence-worker.mjs` :: `pkg:v8`
- `packages/domain-harness/tests/v08-host/children/k02-receipt-worker.mjs` :: `pkg:v8`
- `packages/domain-harness/tests/v08-host/children/k02-splice-worker.mjs` :: `pkg:v8`
- `packages/domain-harness/tests/v08-host/children/unbootstrapped-load.mjs` :: `pkg:v8`
- `packages/domain-harness/tests/v08-host/children/ux-consumer.mjs` :: `pkg:v8`
- `packages/domain-harness/tests/v08-host/helpers.ts` :: `public-v8`
- `packages/domain-harness/tests/v08-host/k01-fence-race-multiprocess.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-host/k02-combined-splice-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-host/k02-namespace-two-b-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-host/k02-receipt-cas-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-host/k02-receipt-race-multiprocess.test.ts` :: `host-v8,pkg:v8`
- `packages/domain-harness/tests/v08-host/t10-multib-query-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-host/v08-host-b01.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-host/v08-host-c01-cas.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-host/v08-host-multiprocess.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/clean-process-child.mjs` :: `pkg:v8`
- `packages/domain-harness/tests/v08-integration/d3-lineage-clean-process-child.mjs` :: `pkg:v8`
- `packages/domain-harness/tests/v08-integration/d3-lineage-clean-process.test.ts` :: `pkg:v8`
- `packages/domain-harness/tests/v08-integration/fr01-child-depth-physical.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/fr05-hf17-hf23-selected-physical.test.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-integration/fr07-kh2-clean-process-child.mjs` :: `pkg:v8`
- `packages/domain-harness/tests/v08-integration/fr07-kh2-continuation-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/fr08-fr09-fr12-decision-source-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/fr08-load-cache-fault-negatives.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/fr08-sd-nf05-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/fr11-hf24-compiled-data-selected.test.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-integration/helpers.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-integration/hf16-authorized-recovery-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/hf16-recovery-reopen-child.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/hf18-child-hosts.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/hf18-durable-deadline-callback-physical.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/hf18-history-eviction-physical.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/hf20-mutation-observation.test.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-integration/hf20-restart-driver.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/hf21-restart-child.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/hf21-sim-prod-authority-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/hf23-shared-operationid-negative.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/hf29-tool-call-port-physical.test.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-integration/hf32-child-routing-physical.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/hf34-definition-graph-module-binding.test.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-integration/i01-bootstrap-failclosed-getter.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/i01-bootstrap-failclosed-occupied-kernel.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/i01-bootstrap-failclosed-occupied-model.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/i01-bootstrap-failclosed-residue.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/i01-kernel-ports.test.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-integration/i02-auth-ux-kernel.test.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-integration/i03-closure-pin.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/i03-genesis.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/i04-model-bind-negatives.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/i04-model-physical-path.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/i04-model-port.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/journal-tenant-isolation.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/model-port-callable-proxy-bind-positive.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/model-port-preflight-snapshot-positive.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/model-port-proxy-drift-negative.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/nf06-decision-receipt-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/nf06-restart-reader.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/packed-gateway-session-negative.test.ts` :: `pkg:v8`
- `packages/domain-harness/tests/v08-integration/packed-raw-ports-session-negative.test.ts` :: `pkg:v8`
- `packages/domain-harness/tests/v08-integration/r02-stale-admission-cas-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/s04-clean-process-child.mjs` :: `pkg:v8`
- `packages/domain-harness/tests/v08-integration/s04-operation-call.test.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-integration/s04-register-atomic.test.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-integration/s05-capability-identity.test.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v08-integration/s05-clean-process-child.mjs` :: `pkg:v8`
- `packages/domain-harness/tests/v08-integration/tf-two-real-apps-packed-e2e.test.ts` :: `pkg:v8`
- `packages/domain-harness/tests/v08-integration/tg5-hf16-poison-selected-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/tg5-hf16-reopen-child.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/tg5-hf27-lane-selected-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/tg5-hf33-resource-pin-selected-physical.test.ts` :: `host-v8`
- `packages/domain-harness/tests/v08-integration/tg5-kernel-taxonomy-selected-physical.test.ts` :: `host-v8,public-v8`
- `packages/domain-harness/tests/v08-integration/v08-tf-fr02-fr07-selected-clean-process-child.mjs` :: `pkg:v8`
- `packages/domain-harness/tests/v08-integration/v08-tf-fr02-fr07-selected-clean-process.test.ts` :: `public-v8,pkg:v8`
- `packages/domain-harness/tests/v08-integration/v08-tf-fr02-fr07-selected-physical.test.ts` :: `public-v8,host-v8`
- `packages/domain-harness/tests/v09-deployment-bootstrap.test.ts` :: `pkg:v9`
- `packages/domain-harness/tests/v09-host-effect-permit.test.ts` :: `host-v9`
- `packages/domain-harness/tests/v09-host-registry-n06.test.ts` :: `host-v9`
- `packages/domain-harness/tests/v09-lifecycle-integration.test.ts` :: `host-v9,public-v9`
- `packages/domain-harness/tests/v09-lifecycle-scoped-delivery.test.ts` :: `public-v9`
- `packages/domain-harness/tests/v09-operation-bridge.test.ts` :: `host-v9,public-v9`
- `packages/domain-harness/tests/v09-package-export-contract.test.ts` :: `public-v9,host-v9,pkg:v9`
- `packages/domain-harness/tests/v09-packed-artifact-integrity.test.ts` :: `public-v9`
- `packages/domain-harness/tests/v09-public-contracts.test.ts` :: `public-v9`
- `packages/domain-harness/tests/v09-public-errors.test.ts` :: `public-v9`
- `packages/domain-harness/tests/v09-public-runtime-channel.test.ts` :: `public-v9,pkg:v9`
- `packages/domain-harness/tests/v3-assembly/surface.test.ts` :: `public-v3`
- `tests/architecture-v010-k-extensions/harness/v10-loader.ts` :: `host-v9`
- `tests/assembly/fixtures-v010/capability-agent-memory-v1.mjs` :: `pkg:v8`
- `tests/assembly/fixtures-v010/capability-memory-v1.mjs` :: `pkg:v8`
- `tests/assembly/v010-t04-selected-memory.test.ts` :: `pkg:v8`
- `tests/assembly/v010-t05-agent-workflow.test.ts` :: `host-v8,pkg:v8`
- `tests/critical-journeys/node/process-kill-worker.mts` :: `pkg:v2`
- `tests/hosts/expo-v3-host/run-expo-v3-host-validation.ts` :: `pkg:v2`
- `tests/hosts/expo/compiled-fixture.ts` :: `pkg:v2`
- `tests/hosts/expo/restart-critical-journey.ts` :: `pkg:v2`
- `tests/hosts/expo/runtime-conformance-host.ts` :: `pkg:v2`
- `tests/hosts/node/v010-authorized-multib-query.test.ts` :: `host-v8`
- `tests/hosts/node/v010-c01-child.mjs` :: `host-v8`
- `tests/hosts/node/v010-c01-external-effect-physical.test.ts` :: `host-v8`
- `tests/hosts/node/v010-memory-scoped.test.ts` :: `host-v8`
- `tests/hosts/node/v010-t03-workflow-control-physical.test.ts` :: `host-v8`
- `tests/hosts/node/v010-t07-shadow-l4-physical.test.ts` :: `host-v8`
- `tests/hosts/node/v010-t08-governed-build-activation.test.ts` :: `host-v8`
- `tests/hosts/node/v010-t08-governed-build-fixture.ts` :: `host-v8`
- `tests/hosts/node/v010-t08-governed-decision.test.ts` :: `host-v8`
- `tests/hosts/node/v010-t08-pinned-restore-child.ts` :: `host-v8`
- `tests/hosts/node/v010-t08-pinned-restore.test.ts` :: `host-v8`
- `tests/hosts/node/v010-t08-reservation-f2-child.ts` :: `host-v8`
- `tests/hosts/node/v010-t08-reservation-recovery.test.ts` :: `host-v8`
- `tests/hosts/node/v010-t08-restart-child.ts` :: `host-v8`
- `tests/hosts/node/v010-t09-meta-crash-child.ts` :: `host-v8`
- `tests/hosts/node/v010-t09-meta-fixture.ts` :: `host-v8`
- `tests/hosts/node/v010-t09-meta-r1-repair.test.ts` :: `host-v8`
- `tests/hosts/node/v010-t09-meta-race-child.ts` :: `host-v8`
- `tests/hosts/node/v010-t10-selected-app-fixture.ts` :: `host-v8`
- `tests/hosts/node/v010-t10-selected-app-query-child.ts` :: `host-v8`
- `tests/hosts/node/v010-t10-selected-app-query.test.ts` :: `host-v8`
- `tests/hosts/node/v010-t10b-querymany-physical.test.ts` :: `host-v8`
- `tests/hosts/successor-expo/compile-successor-fixture.mts` :: `pkg:v2`
- `tests/integration/package-versioning/t022-package-versioning.test.ts` :: `pkg:v2`

</details>

## Appendix C - test files touching moved owner classes (162, `path :: classes`)

Class legend: `K` kernel payload, `S` standard-sdk payload, `ROUTER`, `SFEAT` S feature payloads, `FRAG` K02 fragment, `BMETA` business-meta-feedback, `ABI` v09 selected-abi, `V10BUILD_RT` v10build runtime-side files, `V10BUILD_BUILD` build/selected-closure/import-policy, `V10META`, `V10SHADOW`, `V10EVID`, `HOST_SEL` selected host-v8 files, `HOST_BARREL` `host-v8/index`, `HOST_RES` non-selected host-v8, `PUBV8`, `COMPILER_OTHER`.

<details><summary>Full list</summary>

- `packages/domain-harness-compiler/tests/packed-fixture-stage.ts` :: `ROUTER`
- `packages/domain-harness-compiler/tests/v08-capability-package-s02a.test.ts` :: `PUBV8`
- `packages/domain-harness-compiler/tests/v08-k02-durable-receipt-carrier.test.ts` :: `FRAG`
- `packages/domain-harness-compiler/tests/v08-kernel-d3-context-projection.test.ts` :: `K,S`
- `packages/domain-harness-compiler/tests/v08-kernel-fr07-continuation.test.ts` :: `K,S`
- `packages/domain-harness-compiler/tests/v08-kernel-message-dedup.test.ts` :: `K`
- `packages/domain-harness-compiler/tests/v08-kernel-package-c01.test.ts` :: `K`
- `packages/domain-harness-compiler/tests/v08-kernel-turn-source.test.ts` :: `K,S`
- `packages/domain-harness-compiler/tests/v08-qualified-package-a01.test.ts` :: `PUBV8`
- `packages/domain-harness-compiler/tests/v08-standard-sdk-d01.test.ts` :: `S`
- `packages/domain-harness-compiler/tests/v08-standard-sdk-fr02-expression.test.ts` :: `S`
- `packages/domain-harness-compiler/tests/v08-standard-sdk-fr07-step.test.ts` :: `S`
- `packages/domain-harness-compiler/tests/v08-standard-sdk-fr08-sd.test.ts` :: `K,S`
- `packages/domain-harness-compiler/tests/v08-standard-sdk-nf06-receipt.test.ts` :: `S`
- `packages/domain-harness-compiler/tests/v08-standard-sdk-retention-d02.test.ts` :: `S`
- `packages/domain-harness-compiler/tests/v08-tf-d2-approval-rig.ts` :: `K,S,PUBV8`
- `packages/domain-harness-compiler/tests/v08-tf-d3-engineering-lifecycle.test.ts` :: `K,S`
- `packages/domain-harness-compiler/tests/v08-tf-oracle-fr02-fr07.test.ts` :: `K,S`
- `packages/domain-harness-compiler/tests/v08-two-real-domain-apps-f01.test.ts` :: `K,S`
- `packages/domain-harness-compiler/tests/v09-build-zero-import-n06.test.ts` :: `K,S`
- `packages/domain-harness-compiler/tests/v09-selected-abi-n01.test.ts` :: `K,S,ROUTER,ABI`
- `packages/domain-harness-compiler/tests/v09-workflow-router-n01-integration.test.ts` :: `S,ROUTER`
- `packages/domain-harness-compiler/tests/v09-workflow-router-n01.test.mjs` :: `ROUTER`
- `packages/domain-harness-node/tests/successor-host/e07-e08-regression.test.ts` :: `COMPILER_OTHER`
- `packages/domain-harness-node/tests/successor-host/helper.ts` :: `COMPILER_OTHER`
- `packages/domain-harness/tests/public-v7/public-v7-execution.test.ts` :: `HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/public-v7/public-v7-surface.test.ts` :: `HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/v08-abi/s01-deploy-child.mjs` :: `HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-abi/v08-abi-a01.test.ts` :: `PUBV8`
- `packages/domain-harness/tests/v08-abi/v08-abi-a02-trust-atomic.test.ts` :: `PUBV8`
- `packages/domain-harness/tests/v08-abi/v08-abi-b01-facade.test.ts` :: `PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-abi/v08-abi-b01-untrusted.test.ts` :: `PUBV8`
- `packages/domain-harness/tests/v08-abi/v08-abi-s01-installed-package.test.ts` :: `HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/v08-abi/v08-abi-s02a-capability.test.ts` :: `PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-abi/v08-abi-s03-lifecycle.test.ts` :: `PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-abi/v08-tb-fixture.ts` :: `PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-host/children/k01-fence-worker.mjs` :: `K`
- `packages/domain-harness/tests/v08-host/children/k02-receipt-worker.mjs` :: `FRAG`
- `packages/domain-harness/tests/v08-host/children/k02-splice-worker.mjs` :: `K`
- `packages/domain-harness/tests/v08-host/helpers.ts` :: `PUBV8`
- `packages/domain-harness/tests/v08-host/k01-fence-race-multiprocess.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-host/k02-combined-splice-physical.test.ts` :: `K,S,HOST_BARREL`
- `packages/domain-harness/tests/v08-host/k02-namespace-two-b-physical.test.ts` :: `K,FRAG,HOST_BARREL`
- `packages/domain-harness/tests/v08-host/k02-receipt-cas-physical.test.ts` :: `FRAG,HOST_BARREL`
- `packages/domain-harness/tests/v08-host/k02-receipt-race-multiprocess.test.ts` :: `FRAG,HOST_BARREL`
- `packages/domain-harness/tests/v08-host/t10-multib-query-physical.test.ts` :: `K,FRAG,HOST_SEL,HOST_BARREL`
- `packages/domain-harness/tests/v08-host/v08-host-b01.test.ts` :: `HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/v08-host/v08-host-c01-cas.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-host/v08-host-multiprocess.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/d3-lineage-clean-process.test.ts` :: `K,S,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/fixtures/sdk-no-decision-source.mjs` :: `S`
- `packages/domain-harness/tests/v08-integration/fixtures/sdk-stale-bind.mjs` :: `S`
- `packages/domain-harness/tests/v08-integration/fr01-child-depth-physical.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/fr05-hf17-hf23-selected-physical.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/fr07-kh2-continuation-physical.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/fr08-fr09-fr12-decision-source-physical.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/fr08-load-cache-fault-negatives.test.ts` :: `K,HOST_SEL,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/fr08-sd-nf05-physical.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/fr11-hf24-compiled-data-selected.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/helpers.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/hf16-authorized-recovery-physical.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/hf16-recovery-reopen-child.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/hf18-child-hosts.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/hf18-durable-deadline-callback-physical.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/hf18-history-eviction-physical.test.ts` :: `K,S,HOST_SEL,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/hf20-mutation-observation.test.ts` :: `K,S,HOST_SEL,HOST_BARREL,HOST_RES,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/hf20-restart-driver.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/hf21-restart-child.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/hf21-sim-prod-authority-physical.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/hf23-shared-operationid-negative.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/hf29-tool-call-port-physical.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/hf32-child-routing-physical.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/hf34-definition-graph-module-binding.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/i01-bootstrap-failclosed-getter.test.ts` :: `HOST_SEL,HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/v08-integration/i01-bootstrap-failclosed-occupied-kernel.test.ts` :: `HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/v08-integration/i01-bootstrap-failclosed-occupied-model.test.ts` :: `HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/v08-integration/i01-bootstrap-failclosed-residue.test.ts` :: `HOST_SEL,HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/v08-integration/i01-kernel-ports.test.ts` :: `HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/v08-integration/i02-auth-ux-kernel.test.ts` :: `HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/v08-integration/i03-closure-pin.test.ts` :: `HOST_SEL,HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/i03-genesis.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/i04-model-bind-negatives.test.ts` :: `K,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/i04-model-physical-path.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/i04-model-port.test.ts` :: `S,HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/v08-integration/journal-tenant-isolation.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/model-port-callable-proxy-bind-positive.test.ts` :: `HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/v08-integration/model-port-preflight-snapshot-positive.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/model-port-proxy-drift-negative.test.ts` :: `HOST_BARREL,PUBV8`
- `packages/domain-harness/tests/v08-integration/nf06-decision-receipt-physical.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/nf06-restart-reader.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/packed-gateway-session-negative.test.ts` :: `PUBV8`
- `packages/domain-harness/tests/v08-integration/packed-raw-ports-session-negative.test.ts` :: `PUBV8`
- `packages/domain-harness/tests/v08-integration/r02-stale-admission-cas-physical.test.ts` :: `K,HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/s04-operation-call.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/s04-register-atomic.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/s05-capability-identity.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/tf-two-real-apps-packed-e2e.test.ts` :: `K,S,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/tg5-hf16-poison-selected-physical.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/tg5-hf16-reopen-child.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/tg5-hf27-lane-selected-physical.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/tg5-hf33-resource-pin-selected-physical.test.ts` :: `HOST_BARREL`
- `packages/domain-harness/tests/v08-integration/tg5-kernel-taxonomy-selected-physical.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/v08-tf-fr02-fr07-selected-clean-process.test.ts` :: `K,S,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v08-integration/v08-tf-fr02-fr07-selected-physical.test.ts` :: `K,S,HOST_BARREL,PUBV8,COMPILER_OTHER`
- `packages/domain-harness/tests/v09-deployment-bootstrap.test.ts` :: `K,S,ROUTER`
- `packages/domain-harness/tests/v09-external-consumer.test.ts` :: `K,S,ROUTER`
- `packages/domain-harness/tests/v09-lifecycle-integration.test.ts` :: `K,S,ROUTER`
- `packages/domain-harness/tests/v09-operation-bridge.test.ts` :: `K,S,ROUTER`
- `tests/architecture-v010-k-extensions/harness/v10-subject.ts` :: `K,S,ROUTER,ABI`
- `tests/assembly/helpers-v010.ts` :: `K,S,ROUTER,SFEAT,V10BUILD_RT`
- `tests/assembly/helpers.ts` :: `COMPILER_OTHER`
- `tests/assembly/successor-emission.test.ts` :: `COMPILER_OTHER`
- `tests/assembly/successor-immutability.test.ts` :: `COMPILER_OTHER`
- `tests/assembly/v010-build-activation.test.ts` :: `SFEAT,V10BUILD_RT`
- `tests/assembly/v010-c01-external-effect.test.ts` :: `K,S,ROUTER,V10BUILD_RT`
- `tests/assembly/v010-semantic-decision-feature.test.ts` :: `SFEAT,V10BUILD_RT`
- `tests/assembly/v010-t03-workflow-control-feature.test.ts` :: `SFEAT,V10BUILD_RT`
- `tests/assembly/v010-t04-selected-memory.test.ts` :: `K,S,ROUTER,V10BUILD_RT`
- `tests/assembly/v010-t05-agent-workflow.test.ts` :: `K,S,ROUTER,SFEAT,V10BUILD_RT,HOST_SEL`
- `tests/assembly/v010-t05-context-feature.test.ts` :: `SFEAT,V10BUILD_RT`
- `tests/assembly/v010-t06-decision-evidence.test.ts` :: `K,S,ROUTER,SFEAT,V10BUILD_RT,V10EVID`
- `tests/assembly/v010-t07-candidate-validation.test.ts` :: `SFEAT,V10BUILD_RT`
- `tests/compiler/compiler.test.ts` :: `COMPILER_OTHER`
- `tests/compiler/v010-comment-invariants.test.ts` :: `V10META,V10SHADOW,V10EVID`
- `tests/compiler/v010-error-boundaries.test.ts` :: `V10BUILD_RT`
- `tests/compiler/v010-error-code-catalog.test.ts` :: `V10BUILD_RT,V10SHADOW,COMPILER_OTHER`
- `tests/compiler/v010-error-lineage-union.test.ts` :: `V10BUILD_RT,V10META,V10SHADOW,V10EVID`
- `tests/compiler/v010-import-hook-registry.test.ts` :: `V10BUILD_RT`
- `tests/compiler/v010-public-api-boundary.test.ts` :: `V10BUILD_RT,COMPILER_OTHER`
- `tests/compiler/v010-record-guards.test.ts` :: `V10BUILD_RT`
- `tests/compiler/v010-selected-closure.test.ts` :: `V10BUILD_RT,V10BUILD_BUILD`
- `tests/compiler/v10build-composition.test.ts` :: `SFEAT,V10BUILD_RT,V10BUILD_BUILD`
- `tests/conformance/v0101-sdk-features.test.ts` :: `SFEAT,V10BUILD_RT`
- `tests/hosts/node/v010-authorized-multib-query.test.ts` :: `HOST_SEL`
- `tests/hosts/node/v010-c01-child.mjs` :: `K,S,ROUTER,V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v010-c01-external-effect-physical.test.ts` :: `K,S,ROUTER,V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v010-memory-scoped.test.ts` :: `HOST_SEL`
- `tests/hosts/node/v010-t03-workflow-control-physical.test.ts` :: `K,SFEAT,HOST_SEL`
- `tests/hosts/node/v010-t07-shadow-l4-physical.test.ts` :: `SFEAT,V10BUILD_RT,V10SHADOW,HOST_SEL,HOST_BARREL`
- `tests/hosts/node/v010-t08-governed-build-activation.test.ts` :: `V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v010-t08-governed-build-fixture.ts` :: `V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v010-t08-governed-decision.test.ts` :: `V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v010-t08-pinned-restore-child.ts` :: `V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v010-t08-pinned-restore.test.ts` :: `V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v010-t08-reservation-f2-child.ts` :: `V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v010-t08-reservation-recovery.test.ts` :: `K,V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v010-t08-restart-child.ts` :: `V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v010-t09-meta-crash-child.ts` :: `V10BUILD_RT,V10META,HOST_BARREL`
- `tests/hosts/node/v010-t09-meta-feedback-workflow.test.ts` :: `SFEAT,V10BUILD_RT,V10META`
- `tests/hosts/node/v010-t09-meta-fixture.ts` :: `K,S,ROUTER,SFEAT,BMETA,V10BUILD_RT,V10META,V10EVID,HOST_BARREL`
- `tests/hosts/node/v010-t09-meta-packed-consumer.mjs` :: `K,S,SFEAT,BMETA,V10META`
- `tests/hosts/node/v010-t09-meta-packed-consumer.test.ts` :: `V10META`
- `tests/hosts/node/v010-t09-meta-r1-repair.test.ts` :: `V10BUILD_RT,V10META,HOST_BARREL`
- `tests/hosts/node/v010-t09-meta-race-child.ts` :: `V10META,HOST_BARREL`
- `tests/hosts/node/v010-t10-selected-app-fixture.ts` :: `K,S,ROUTER,V10BUILD_RT,HOST_SEL,HOST_BARREL`
- `tests/hosts/node/v010-t10-selected-app-query-child.ts` :: `V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v010-t10-selected-app-query.test.ts` :: `V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v010-t10b-querymany-physical.test.ts` :: `V10BUILD_RT,HOST_BARREL`
- `tests/hosts/node/v0101-build-skipped-optional-provider.test.ts` :: `SFEAT,V10BUILD_RT`
- `tests/hosts/successor-expo/compile-successor-fixture.mts` :: `COMPILER_OTHER`
- `tests/migration/v01-expr/expr-migration-equivalence.test.ts` :: `COMPILER_OTHER`
- `tests/tools/script/contract-typecheck.ts` :: `COMPILER_OTHER`

</details>
