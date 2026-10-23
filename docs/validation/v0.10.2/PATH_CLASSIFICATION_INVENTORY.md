# DomainHarness v0.10.2 - Per-path classification inventory (T08a, #1302 / #1303)

**Status:** `T08A_DOC_DELIVERABLE / SOURCE_INSPECTED_PLUS_STATIC_SCRIPT / NO_BUILD / NO_TESTS / NO_NPM`. Companion of the frozen L2 design (`docs/architecture/DomainHarness_v0.10.2_L2_DESIGN_CANDIDATE.md`, blob `68e7dbc591f4c0c694818ec574b8585f95239c8b`). It adds the per-path table that the L2 design lists as an L2 gap assigned to T08a (L2 §13, rows #1301 "KEEP/MOVE/ISOLATE/REMOVE map" and #1302 "Path -> owner -> ... inventory"). It decides nothing: every fate below is taken from L2 §1.1, §5, §6, §7, §9, §12 or from INV facts, and where those are silent the row says so.
**Parent:** [#1300](https://github.com/kaicreator-mm/domain-harness/issues/1300); scope #1302, #1303. Abbreviations: `INV` = `docs/validation/v0.10.2/L2_SOURCE_INVENTORY.md`; `L2` = the design above; `T..` = L2 §12 task ids.

## 0. Pin, method, vocabulary, truth limits

| Item | Value |
| --- | --- |
| Worktree HEAD | `91eb3b9a84ed46671e92491515c0762808a3ae52` (branch `task/dh-t08a-1322-sonnet`) |
| Relation to the L2 fact pin | L2/INV facts are pinned at `f49c2a5f9ad79809959d1c5b6f6d8542c8d06f44`; `git diff --stat f49c2a5f 91eb3b9a` lists 4 files, all documents (L2 design, L2 freeze, INV, INV scripts). Source and test paths are therefore identical to the INV pin. |
| Tracked files classified | 3084 (`git ls-files`), matched by 92 ordered path groups; first match wins; no file is unmatched and no group is empty (checked by the generator). |
| Generator | `C:\xDev\kAiCreator\_tmp\dh-t08a-1322-sonnet\gen-inventory.mjs` with group table `groups.mjs`; both are reproduced in `T08A_SCRIPTS.md`. |
| Touch scan | Section 5 is a literal-substring scan of test/example/extension sources, not an AST import resolver; it is context for the test-tree rows, not a proof of reachability. |
| Not run | No build, typecheck, test, pack or install. Classification of subtrees that INV did not measure is marked `NOT_VERIFIED` in the Notes column. |

Classification vocabulary (the six values required by #1302/#1310):

| Value | Meaning in this document |
| --- | --- |
| KEEP | Stays at its path with unchanged role; the owner task may still edit content (config, tests, docs). |
| MIGRATE | Moves (`git mv` or split) to the Target column; a forwarding shim stays at the old TS path until T11 (L2 §12 strategy S'); payload `.mjs` cannot be shimmed and is path-flipped by T01. |
| ARCHIVE | Immutable provenance kept in place (index/pointer), or a test-only artifact relocated out of production (`C14`). Never edited for aesthetics (#1303). |
| REMOVE | Leaves the tracked tree or every ship set, only at the named task and after its condition. |
| UNSELECTED_REFERENCE | Retained, `private`, no selected importer (INV §2.1, §8); still carries regression/evidence tests; not exported after T07b. |
| LEGACY_REFERENCE | Legacy package/tree retained as a private reference with its regression suite (O5); no new package may import it. |

## 1. Summary by classification

| Classification | Groups | Tracked files | Share |
| --- | --- | --- | --- |
| KEEP | 34 | 256 | 8.3% |
| MIGRATE | 16 | 63 | 2.0% |
| ARCHIVE | 8 | 399 | 12.9% |
| REMOVE | 4 | 1324 | 42.9% |
| UNSELECTED_REFERENCE | 9 | 235 | 7.6% |
| LEGACY_REFERENCE | 21 | 807 | 26.2% |

## 2. Per-path-group table

| ID | Path group | Files | Classification | Target (MIGRATE / relocate) | Owner task | Role | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | `package.json` | 1 | KEEP | - | T07a, T07b | config | L2 §5; INV §7 | T07a adds `tooling/*` to `workspaces`; T07b sets engines to Node24. |
| R02 | `package-lock.json` | 1 | KEEP | - | T07a | config | L2 §5 (lockfile discipline) | Regenerated once; diff may only add new workspace keys. |
| R03 | `tsconfig.base.json` | 1 | KEEP | - | T07a | config | L2 §5 names T07 as sole writer of tsconfig files; this root base file is not named | NOT_VERIFIED whether any task edits it. |
| R04 | `eslint.config.mjs` | 1 | KEEP | - | T07a | config | L2 §5; INV §7 | - |
| R05 | `.gitignore`, `.gitattributes` | 2 | KEEP | - | NO_OWNER_IN_L2_S12 | config | `.gitignore` ignores `dist/` and un-ignores only the two legacy dists; `.gitattributes` marks only those two `-text` | GAP: L2 §5 keeps committed `dist` for the four NEW TS packages and untracks the legacy dists (T07b) but no §12 write set names these two files. |
| R06 | `AGENTS.md` | 1 | KEEP | - | - | governance | AGENTS.md read order; CV-01..12 | Not edited by any listed task. |
| R07 | `README.md` | 1 | KEEP | - | T08b | docs | L2 §12 T08b; #1303 (root README drifts to v0.7) | Rewritten to the v0.10.2 route. |
| R08 | `.dev-standard/` | 2 | KEEP | - | T07b | governance | L2 §5 (PROJECT_OVERRIDES lines 186, 240); VERSION pin | ADS pin (`VERSION`) untouched; only the CI-profile lines change. |
| R09 | `.woodpecker/verify-min-node.yaml` | 1 | REMOVE | - | T07b | ci | L2 §5 (Node24 engines); INV §7 | Its two v0.10 test files move into the main smoke list. |
| R10 | `.woodpecker/verify.yaml` | 1 | KEEP | - | T07b | ci | L2 §5 (CI smoke swap); INV §7 | Smoke list replaced; Node gate `< 22` becomes `< 24`. |
| R11 | `.agent/` | 116 | ARCHIVE | - | - | evidence | #1302 scope: keep `.agent` intact | v0.10 task execution contracts; immutable provenance. |
| R12 | `scripts/check-v010-error-code-catalog.mjs` | 1 | KEEP | - | T00, T05, T04, T03, T11 (serialized) | test-support | L2 §12 preamble (catalog set); INV §7 | Scan roots generalized by T00, edited in turn. |
| R13 | `scripts/check-committed-dist.mjs`, `scripts/lint.mjs` | 2 | KEEP | - | T07a | config | L2 §5; INV §7 | Roster derived from non-private workspaces (T07a). |
| A01 | `packages/domain-harness/dist/` | 1210 | REMOVE | - | T07b | generated | L2 §5 (T07b untracks legacy dist); INV §4 (57 legacy dist dirs, 604 map files) | Untrack only after T11 flips all importers; install path of legacy consumers NOT_VERIFIED. |
| A02 | `regex ^packages\/domain-harness\/(package\.json\|tsconfig[^/]*\.json)$` | 5 | KEEP | - | T07a, T07b | config | L2 §5 | T07a: private:true, new deps, prebuild; T07b: prune exports. |
| A03 | `packages/domain-harness/README.md` | 1 | KEEP | - | T08b | docs | L2 §7 (legacy banner) | - |
| A04 | `packages/domain-harness/scripts/` | 1 | LEGACY_REFERENCE | - | - | build-support | copies vendored acorn into `dist/host-v9`; serves only the legacy `build` script | Leaves the guard with the legacy dist (T07a/T07b). |
| A05 | `packages/domain-harness/examples/` | 3 | LEGACY_REFERENCE | - | - | example | L2 §7 | - |
| A06 | `regex ^packages\/domain-harness\/src\/host-v8\/(sqlite-cas-store\|cas\|errors\|v010-scoped-memory\|durable-controls)\.ts$` | 5 | MIGRATE | `packages/host-node/src/` | T03 | host | L2 §1.1, §7; INV §2.1 (SELECTED) | Forwarding shim stays at the old path for legacy barrel importers (61 by path, 75 by resolver). |
| A07 | `packages/domain-harness/src/host-v8/v010-authorized-multib-query.ts` | 1 | MIGRATE | `packages/microkernel/src/` | T04 | runtime | L2 §1.1, §1.3 (zero-import file; removes the Microkernel to host-v8 edge) | Shim stays at old path. |
| A08 | `packages/domain-harness/src/host-v8/index.ts` | 1 | LEGACY_REFERENCE | - | T03, T04 (re-export lines) | host | L2 §7; INV §2.1 (barrel re-exports all 15 files, closure drags `ajv`, `json-schema-library`) | Becomes a forwarding barrel; no longer a selected-path entry. |
| A09 | `packages/domain-harness/src/host-v8/` | 8 | UNSELECTED_REFERENCE | - | T07b (not exported) | host | L2 §7; INV §2.1 (8 files, no root test names any export) | bootstrap, dispatcher, events, identity, hf20-mutation-observation, kernel-gateway, tool-call-port, ux-transport. |
| A10 | `packages/domain-harness/src/public-v8/contracts.ts` | 1 | MIGRATE | `packages/contracts/src/` | T00 | contract | L2 §1.3 item 5 (`canonicalSnapshot`, `QualifiedPackageError`); INV §2.1 | Only the selected function and error class move; the re-export block stays as shim. |
| A11 | `packages/domain-harness/src/public-v8/` | 9 | UNSELECTED_REFERENCE | - | T07b (not exported) | legacy-api | L2 §7; INV §2.1 | - |
| A12 | `packages/domain-harness/src/contracts/identity.ts`, `packages/domain-harness/src/contracts/json.ts` | 2 | MIGRATE | `packages/contracts/src/` | T00 | contract | L2 §1.3 item 5 (needed by `durable-controls.ts:35`); INV D2 | - |
| A13 | `regex ^packages\/domain-harness\/src\/(host-v9\|public-v9\|recovery-v2\|legacy-v1\|public-v2\|public-v3\|public-v4\|public-v7\|v2)\/` | 45 | UNSELECTED_REFERENCE | - | T07b (not exported) | legacy-api | L2 §7 row "host-v8 residue ... host-v9, public-v9, recovery-v2, legacy-v1, v2-v7" | Evidence-carrying tests still import them; not deleted (O5). |
| A14 | `packages/domain-harness/src/` | 241 | LEGACY_REFERENCE | - | - | legacy-runtime | L2 §7 row `packages/domain-harness`; INV §1.1 (selected closure never reaches these subtrees) | Subtrees not named in L2 §7 (runtime, dac*, harness, ...): per-subtree consumer scan NOT_VERIFIED beyond INV §1.1. |
| A15 | `packages/domain-harness/tests/v08-host/` | 16 | KEEP | - | T01, T01k, T11 | test/evidence | L2 §9, §10; INV §3.1, Appendix A | K/S physical evidence; carries three of the four K blob pins (T01k; the fourth is `V08_K_BLOB` in the compiler test `v08-tf-oracle-fr02-fr07.test.ts`, group C23) and the fragment tests (T11). |
| A16 | `packages/domain-harness/tests/v08-integration/` | 78 | KEEP | - | T01 | test/evidence | L2 §10 (payload byte readers); INV §3.1 | v0.8 retained-44 oracles; payload-path literals flipped by T01. |
| A17 | `regex ^packages\/domain-harness\/tests\/v09-[^/]*$` | 13 | LEGACY_REFERENCE | - | T07b (3 files leave CI smoke) | test | INV §7 (verify.yaml smoke uses 3 v09 files) | Run in the manual full run only after T07b. |
| A18 | `packages/domain-harness/tests/` | 448 | LEGACY_REFERENCE | - | T01 (payload literals in some files) | test | L2 §7, §10 (200 legacy-surface importers untouched) | - |
| C01 | `packages/domain-harness-compiler/dist/` | 112 | REMOVE | - | T07b | generated | L2 §5; INV §4 (112 tracked files) | - |
| C02 | `regex ^packages\/domain-harness-compiler\/(package\.json\|tsconfig[^/]*\.json)$` | 3 | KEEP | - | T07a, T07b | config | L2 §5 | T07a: private:true, deps on new packages, prebuild; T07b: prune 16 exports. |
| C03 | `packages/domain-harness-compiler/README.md` | 1 | KEEP | - | T08b | docs | L2 §7 | - |
| C04 | `regex ^packages\/domain-harness-compiler\/src\/qualified-package\/v10build\/(digest\|errors\|known-error-codes\|guards)\.ts$` | 4 | MIGRATE | `packages/contracts/src/` | T00 | contract | L2 §1.1, §1.3 | Shim at old path until T11 (digest.ts K doc-key mirrors are removed, L2 §2). |
| C05 | `regex ^packages\/domain-harness-compiler\/src\/qualified-package\/v10build\/(activation\|import-hook\|external-effect)\.ts$` | 3 | MIGRATE | `packages/microkernel/src/` | T04 | runtime | L2 §1.1, §2, §3 | Gate stays internal and read-only; shim until T11. |
| C06 | `regex ^packages\/domain-harness-compiler\/src\/qualified-package\/v10build\/(deployment\|error-type-parity\|query-type-parity)\.ts$` | 3 | MIGRATE | `packages/host-node/src/` | T03 | host | L2 §1.1 | Shim until T11. |
| C07 | `regex ^packages\/domain-harness-compiler\/src\/qualified-package\/v10build\/(build\|selected-closure\|import-policy)\.ts$` | 3 | MIGRATE | `tooling/build/src/` | T05 | producer | L2 §1.1 | BUILD only; no runtime import. |
| C08 | `packages/domain-harness-compiler/src/qualified-package/v10build/index.ts` | 1 | REMOVE | - | T11 | barrel | L2 §12 T11 (delete v10 shim files); INV §1.1 | Remains the compat barrel until T11. |
| C09 | `packages/domain-harness-compiler/src/qualified-package/v10meta/`, `packages/domain-harness-compiler/src/qualified-package/v10shadow/`, `packages/domain-harness-compiler/src/qualified-package/v10evidence/` | 5 | MIGRATE | `packages/host-node/src/` | T03 | host | L2 §1.1, §6 (KEEP as host-node optional subpaths); INV §6 | v10evidence is not in the frozen crosswalk (INV D2). |
| C10 | `packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs` | 1 | MIGRATE | `domain-packages/kernel/basic/payload/` | T01 (move), T01k (append-only protocol) | domain-package | L2 §1.1, §2; blob `72a886ff...` | Byte-identical move; one 300 KB file (PRD §5). |
| C11 | `packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs` | 1 | MIGRATE | `domain-packages/standard/basic/payload/` | T01 | domain-package | L2 §1.1, §6 | `Retained*` helpers are dispositioned in RETAINED_FUNCTION_SUCCESSOR_CROSSWALK.md. |
| C12 | `regex ^packages\/domain-harness-compiler\/src\/qualified-package\/payload\/sfeature-[a-z-]+-v1\.mjs$` | 6 | MIGRATE | `domain-packages/standard/features/<feature>/` | T01 | domain-package | L2 §1.1 (6 payload features) | semantic-decision, workflow-control, context-assembly, decision-evidence, candidate-validation, meta-feedback. |
| C13 | `packages/domain-harness-compiler/src/qualified-package/payload/business-meta-feedback-v1.mjs` | 1 | MIGRATE | `examples/v010-meta-feedback/` | T01 | example | L2 §1.1, §6; INV §6 | Business reference, tests-only consumer. |
| C14 | `packages/domain-harness-compiler/src/qualified-package/payload/durable-receipt-carrier-v1.mjs` | 1 | ARCHIVE | `tests/fixtures/k02-fragment/` | T11 (after T08a) | test-fixture | L2 §9 (fragment exclusion), blob `df9732ac...`; PRD §5 | Test-only; in no packlist (T07b). The rebinding table (this task) must merge first. |
| C15 | `packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.mjs`, `packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.d.mts` | 2 | MIGRATE | `domain-packages/standard/basic/` | T01 | domain-package | L2 §1.1 names `v09/workflow-router.mjs` | The companion `.d.mts` is not named by L2: NOT_VERIFIED whether it moves. |
| C16 | `packages/domain-harness-compiler/src/qualified-package/v09/selected-abi.mjs`, `packages/domain-harness-compiler/src/qualified-package/v09/selected-abi.d.mts` | 2 | LEGACY_REFERENCE | - | - | legacy-build | L2 §12 T01 ("except fragment, `selected-abi`") | Stays in the compiler. |
| C17 | `packages/domain-harness-compiler/src/qualified-package/v09build/parser.ts`, `packages/domain-harness-compiler/src/qualified-package/v09build/generated/acorn.mjs`, `packages/domain-harness-compiler/src/qualified-package/v09build/generated/acorn.d.mts` | 3 | LEGACY_REFERENCE | `COPY to tooling/build/` | T05 (copy); v09build itself frozen | producer | L2 §1.1 (copies; blob `aee191eb...`); INV D2 | Copy, not move: `v09build` stays frozen. |
| C18 | `packages/domain-harness-compiler/src/qualified-package/v09build/` | 5 | LEGACY_REFERENCE | - | - | legacy-build | L2 §1.1 ("v09build itself stays frozen") | - |
| C19 | `packages/domain-harness-compiler/src/index.ts` | 1 | LEGACY_REFERENCE | - | T11 (line 140) | legacy-api | L2 §12 T11 | Drops the v10build re-export. |
| C20 | `packages/domain-harness-compiler/src/qualified-package/index.ts` | 1 | LEGACY_REFERENCE | - | T11 (line 45) | legacy-api | L2 §12 T11 | - |
| C21 | `packages/domain-harness-compiler/src/` | 28 | LEGACY_REFERENCE | - | - | legacy-build | L2 §7 row `-compiler (legacy parts: compile/raw/package/compat/v0.8-v0.9 BUILD)`; INV §1.2 | - |
| C22 | `packages/domain-harness-compiler/tests/v08-k02-durable-receipt-carrier.test.ts` | 1 | UNSELECTED_REFERENCE | - | T11 (relabel, path flip) | test | L2 §9: fragment-only evidence, "not selected-K proof" | - |
| C23 | `regex ^packages\/domain-harness-compiler\/tests\/(v08-kernel-\|v08-standard-sdk-\|v08-tf-\|v08-two-real\|v09-selected-abi\|v09-workflow-router)` | 21 | KEEP | - | T01 | test/evidence | L2 §10; INV §3.1, Appendix A.1 | Payload byte readers; literal paths flipped by T01; `v08-tf-oracle-fr02-fr07.test.ts` also holds a K blob pin (T01k). `v08-tf-oracle-fr05-fr08` reads no payload path in INV Appendix A: whether T01 edits it is NOT_VERIFIED. |
| C24 | `packages/domain-harness-compiler/tests/` | 25 | LEGACY_REFERENCE | - | - | test | L2 §7 | - |
| N01 | `packages/domain-harness-node/` | 81 | UNSELECTED_REFERENCE | - | T07a (private:true), T08b (banner) | legacy-host | L2 §7; INV §8 (no selected importer) | No new package may import it; unpublished. |
| N02 | `packages/domain-harness-expo/` | 26 | UNSELECTED_REFERENCE | - | T07a (private:true), T08b (banner) | legacy-host | L2 §7; INV §8 | No Expo support obligation. |
| E01 | `examples/v010-clean-consumer/apps/rich/` | 15 | KEEP | - | T03, T11, T09 | example | L2 §12 T03 (`examples/v010-clean-consumer/apps/rich/**`), T09 | Sealed `externalImports.npm` allowance string changes (digest-bound). |
| E02 | `examples/v010-clean-consumer/build-apps.mjs` | 1 | KEEP | - | T01, T11, T09 | example | L2 §12 T01; INV §1.2 | Payload specifier strings flipped. |
| E03 | `examples/v010-clean-consumer/` | 11 | KEEP | - | T11, T09, T08b | example | L2 §12 T11, T09; INV §1.2 (`runtime-core.mjs` imports `compiler/v10build`) | Tiny app, runtime, README, PROVENANCE. |
| E04 | `examples/v0101-agent-improvement/` | 2 | KEEP | - | T01, T03, T11 | example | L2 §12 T01, T03 | `selected-subsets-build.mjs`: payload specifiers (T01) and the CT-02 invoker import (T03). |
| E05 | `examples/v08-domain-apps/` | 3 | LEGACY_REFERENCE | - | T08b (pointer README) | example/test-input | L2 §7; PROVENANCE.md of v010-clean-consumer (byte-copied into Tiny); core tests read these files by path | Regression input: MUST NOT move or delete while those tests live. L2 §7 says contents "not inspected". |
| E06 | `examples/v09-clean-consumer/` | 3 | LEGACY_REFERENCE | - | T08b (pointer README) | example | L2 §7; read by `packages/domain-harness/tests/v09-external-consumer.test.ts` | Imports `@kaicreator/domain-harness/v9`, pruned by T07b: that test breaks or is relabelled (NOT_VERIFIED). |
| E07 | `examples/expo-conformance/` | 8 | UNSELECTED_REFERENCE | - | T08b (banner) | example | L2 §7; INV §8 | Own lockfile; no Expo support obligation. |
| X01 | `extensions/agent-improvement/packages/` | 24 | MIGRATE | `domain-packages/standard/features/<feature>/` | T01 | domain-package | L2 §1.1, §7 (`git mv`, content unchanged) | `build-probe.mjs` relative deep import keeps resolving (equal depth) and stays the #1309 negative. |
| X02 | `extensions/agent-improvement/host/` | 1 | MIGRATE | `packages/host-node/ (`./ct02-invoker`)` | T03 | host | L2 §1.1, §7 | `extensions/` is removed afterwards. |
| T01 | `tests/assembly/fixtures-v010/` | 24 | KEEP | - | T03 (twins `capability-*.mjs`) | test-fixture | L2 §12 T03; `v010-fixture-parity.test.ts:20` | - |
| T02 | `regex ^tests\/assembly\/(v010-[^/]*\|helpers-v010\.ts)$` | 11 | KEEP | - | T01, T04, T03, T11 | test/evidence | INV §3.3; L2 §10 | Selected-path K/S/B/C assembly tests. |
| T03 | `tests/assembly/` | 6 | LEGACY_REFERENCE | - | - | test | L2 §10 | Legacy successor/mixed-coexistence tests. |
| T04 | `regex ^tests\/compiler\/(v010-[^/]*\|v10build-composition\.test\.ts)$` | 9 | KEEP | - | T00, T05, T04, T03, T11 (catalog set + boundary rewrite) | test/evidence | L2 §12 preamble, T04 | `v010-public-api-boundary.test.ts` is semantically rewritten by T04. |
| T05 | `tests/compiler/` | 1 | LEGACY_REFERENCE | - | - | test | root `test:root` glob | - |
| T06 | `tests/conformance/v0101-sdk-features.test.ts` | 1 | KEEP | - | T01 | test/evidence | L2 §12 T01 | v0.10.1 16-subset BUILD witness. |
| T07 | `tests/conformance/` | 9 | LEGACY_REFERENCE | - | - | test | root `test:root` glob | - |
| T08 | `tests/hosts/node/` | 31 | KEEP | - | T03, T11 | test/evidence | L2 §10 (46 root files flip to package specifiers); INV §3 | Includes `conformance.test.ts`, `node-conformance-host.ts`, `runtime-fixture.ts` (not v010-named; see the touch scan). |
| T09 | `regex ^tests\/hosts\/(expo\|expo-store\|expo-v3-host\|successor-expo)\/` | 42 | UNSELECTED_REFERENCE | - | - | test | L2 §7; INV §7 (in no `test:root` glob), §8 | - |
| T10 | `tests/integration/v010-clean-consumers/` | 2 | KEEP | - | T01, T09 | test/evidence | L2 §12 T01, T09 | Pack list and Tiny/Rich closure assertions. |
| T11 | `tests/integration/package-versioning/` | 2 | LEGACY_REFERENCE | - | - | test | INV §7 (in no `test:root` glob) | - |
| T12 | `tests/architecture-v010-k-extensions/` | 15 | UNSELECTED_REFERENCE | - | - | test | L2 §15.2 O11 (#1150 spike, unrun reference) | Imports `host-v9/ast-gate.js` (INV §3.2). |
| T13 | `tests/MATRIX.md` | 1 | LEGACY_REFERENCE | - | - | docs | tests tree document | NOT_VERIFIED content currency. |
| T14 | `regex ^tests\/(critical-journeys\|migration\|tools)\/` | 10 | LEGACY_REFERENCE | - | - | test | root `test:root` globs / INV §7 | - |
| D01 | `docs/architecture/DomainHarness_v0.10.2_` | 2 | KEEP | - | - | docs/frozen | L2 Freeze checkpoint (exact blobs) | FROZEN: never edited. |
| D02 | `docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md` | 1 | KEEP | - | - | docs/normative | AGENTS.md rule; CV-01..12 | - |
| D03 | `docs/architecture/V010_TYPED_REFUSAL_LITERAL_CATALOG.json` | 1 | KEEP | - | T00, T05, T04, T03, T11 (regenerated) | test-support | L2 §12 preamble (catalog set) | - |
| D04 | `docs/architecture/` | 40 | ARCHIVE | - | - | docs/provenance | #1303 (archive/index, do not bulk move) | Includes v0.10.1 L2 freeze and v0.10 R0. |
| D05 | `docs/product/DomainHarness_v0.10.2_` | 3 | KEEP | - | - | docs/frozen | Product Freeze (PRD blob 746535c9..., crosswalk blob 46bfbe47...) | FROZEN: never edited. |
| D06 | `docs/product/` | 35 | ARCHIVE | - | - | docs/provenance | #1303 | - |
| D07 | `docs/validation/v0.10.2/` | 2 | KEEP | - | T08a (new files only) | docs/validation | L2 §12 T08a write set | L2 inventory and scripts are frozen; this task adds files beside them. |
| D08 | `docs/validation/` | 64 | ARCHIVE | - | - | docs/provenance | #1303; the v0.10 T01 audit/ledger and v0.10.1 reports are immutable pins cited by the #1310 crosswalk | - |
| D09 | `docs/README.md` | 1 | KEEP | - | T08b | docs | #1303 (docs/README.md is v0.1-oriented) | Rewritten. |
| D10 | `regex ^docs\/(sdk\|migration\|quickstart)\/` | 9 | ARCHIVE | - | T08b (banner/index; new current docs added beside) | docs/provenance | #1303 (docs/sdk/README.md claims v0.3 current); L2 §12 T08b | Historic files stay; current replacements are new files. |
| D11 | `regex ^docs\/(implementation\|tasks\|roadmap\|release\|research\|experiments\|integration\|harness\|domain-data\|operations\|technical\|governance)\/` | 133 | ARCHIVE | - | - | docs/provenance | #1303 | Includes the frozen v0.8 retained-44 manifest and the v0.10 historical crosswalk. |
| D12 | `docs/DomainHarness_v0.1_INDEX.md` | 1 | ARCHIVE | - | T08b (pointer) | docs/provenance | #1303 | - |

## 3. MIGRATE and relocate file map (every moved tracked file)

Generated from the groups marked MIGRATE plus `C14` (fragment relocation) and `C17` (parser copy). Target file names inside a package directory are L2-named only where the L2 table names them; everything else is marked.

| Source file | Target | Owner task | Group | Fate |
| --- | --- | --- | --- | --- |
| `packages/domain-harness/src/host-v8/cas.ts` | `packages/host-node/src/cas.ts` | T03 | A06 | MIGRATE |
| `packages/domain-harness/src/host-v8/durable-controls.ts` | `packages/host-node/src/durable-controls.ts` | T03 | A06 | MIGRATE |
| `packages/domain-harness/src/host-v8/errors.ts` | `packages/host-node/src/errors.ts` | T03 | A06 | MIGRATE |
| `packages/domain-harness/src/host-v8/sqlite-cas-store.ts` | `packages/host-node/src/sqlite-cas-store.ts` | T03 | A06 | MIGRATE |
| `packages/domain-harness/src/host-v8/v010-scoped-memory.ts` | `packages/host-node/src/v010-scoped-memory.ts` | T03 | A06 | MIGRATE |
| `packages/domain-harness/src/host-v8/v010-authorized-multib-query.ts` | `packages/microkernel/src/v010-authorized-multib-query.ts` | T04 | A07 | MIGRATE |
| `packages/domain-harness/src/public-v8/contracts.ts` | `packages/contracts/src/contracts.ts` | T00 | A10 | MIGRATE |
| `packages/domain-harness/src/contracts/identity.ts` | `packages/contracts/src/identity.ts` | T00 | A12 | MIGRATE |
| `packages/domain-harness/src/contracts/json.ts` | `packages/contracts/src/json.ts` | T00 | A12 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/digest.ts` | `packages/contracts/src/digest.ts` | T00 | C04 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/errors.ts` | `packages/contracts/src/errors.ts` | T00 | C04 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/guards.ts` | `packages/contracts/src/guards.ts` | T00 | C04 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/known-error-codes.ts` | `packages/contracts/src/known-error-codes.ts` | T00 | C04 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/activation.ts` | `packages/microkernel/src/activation.ts` | T04 | C05 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/external-effect.ts` | `packages/microkernel/src/external-effect.ts` | T04 | C05 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/import-hook.ts` | `packages/microkernel/src/import-hook.ts` | T04 | C05 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/deployment.ts` | `packages/host-node/src/deployment.ts` | T03 | C06 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/error-type-parity.ts` | `packages/host-node/src/error-type-parity.ts` | T03 | C06 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/query-type-parity.ts` | `packages/host-node/src/query-type-parity.ts` | T03 | C06 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/build.ts` | `tooling/build/src/build.ts` | T05 | C07 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/import-policy.ts` | `tooling/build/src/import-policy.ts` | T05 | C07 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10build/selected-closure.ts` | `tooling/build/src/selected-closure.ts` | T05 | C07 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10evidence/decision-evidence-observer.ts` | `packages/host-node/src/decision-evidence-observer.ts` | T03 | C09 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10meta/index.ts` | `packages/host-node/src/index.ts` | T03 | C09 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10meta/meta-feedback-workflow.ts` | `packages/host-node/src/meta-feedback-workflow.ts` | T03 | C09 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10shadow/index.ts` | `packages/host-node/src/index.ts` | T03 | C09 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v10shadow/shadow-l4-readonly.ts` | `packages/host-node/src/shadow-l4-readonly.ts` | T03 | C09 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs` | `domain-packages/kernel/basic/payload/kernel-mechanism-v1.mjs` | T01 (move), T01k (append-only protocol) | C10 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs` | `domain-packages/standard/basic/payload/standard-sdk-v1.mjs` | T01 | C11 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/payload/sfeature-candidate-validation-v1.mjs` | `domain-packages/standard/features/candidate-validation/ (file name inside the package: NOT_VERIFIED)` | T01 | C12 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/payload/sfeature-context-assembly-v1.mjs` | `domain-packages/standard/features/context-assembly/ (file name inside the package: NOT_VERIFIED)` | T01 | C12 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/payload/sfeature-decision-evidence-v1.mjs` | `domain-packages/standard/features/decision-evidence/ (file name inside the package: NOT_VERIFIED)` | T01 | C12 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/payload/sfeature-meta-feedback-v1.mjs` | `domain-packages/standard/features/meta-feedback/ (file name inside the package: NOT_VERIFIED)` | T01 | C12 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/payload/sfeature-semantic-decision-v1.mjs` | `domain-packages/standard/features/semantic-decision/ (file name inside the package: NOT_VERIFIED)` | T01 | C12 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/payload/sfeature-workflow-control-v1.mjs` | `domain-packages/standard/features/workflow-control/ (file name inside the package: NOT_VERIFIED)` | T01 | C12 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/payload/business-meta-feedback-v1.mjs` | `examples/v010-meta-feedback/payload/business-meta-feedback-v1.mjs` | T01 | C13 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/payload/durable-receipt-carrier-v1.mjs` | `tests/fixtures/k02-fragment/durable-receipt-carrier-v1.mjs` | T11 (after T08a) | C14 | ARCHIVE (relocate) |
| `packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.d.mts` | `domain-packages/standard/basic/v09/workflow-router.d.mts (NOT_VERIFIED)` | T01 | C15 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.mjs` | `domain-packages/standard/basic/v09/workflow-router.mjs` | T01 | C15 | MIGRATE |
| `packages/domain-harness-compiler/src/qualified-package/v09build/generated/acorn.d.mts` | `tooling/build/ (copy; location inside NOT_VERIFIED): acorn.d.mts` | T05 (copy); v09build itself frozen | C17 | LEGACY_REFERENCE (copy) |
| `packages/domain-harness-compiler/src/qualified-package/v09build/generated/acorn.mjs` | `tooling/build/ (copy; location inside NOT_VERIFIED): acorn.mjs` | T05 (copy); v09build itself frozen | C17 | LEGACY_REFERENCE (copy) |
| `packages/domain-harness-compiler/src/qualified-package/v09build/parser.ts` | `tooling/build/ (copy; location inside NOT_VERIFIED): parser.ts` | T05 (copy); v09build itself frozen | C17 | LEGACY_REFERENCE (copy) |
| `extensions/agent-improvement/packages/agent-diagnostics/README.md` | `domain-packages/standard/features/agent-diagnostics/README.md` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/agent-diagnostics/build-probe.mjs` | `domain-packages/standard/features/agent-diagnostics/build-probe.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/agent-diagnostics/feature-manifest.mjs` | `domain-packages/standard/features/agent-diagnostics/feature-manifest.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/agent-diagnostics/modules/sfeature-agent-diagnostics-v1.mjs` | `domain-packages/standard/features/agent-diagnostics/modules/sfeature-agent-diagnostics-v1.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/agent-diagnostics/package.json` | `domain-packages/standard/features/agent-diagnostics/package.json` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/agent-diagnostics/tests/agent-diagnostics.test.mjs` | `domain-packages/standard/features/agent-diagnostics/tests/agent-diagnostics.test.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/bounded-experiment/README.md` | `domain-packages/standard/features/bounded-experiment/README.md` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/bounded-experiment/build-probe.mjs` | `domain-packages/standard/features/bounded-experiment/build-probe.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/bounded-experiment/feature-manifest.mjs` | `domain-packages/standard/features/bounded-experiment/feature-manifest.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/bounded-experiment/modules/sfeature-bounded-experiment-v1.mjs` | `domain-packages/standard/features/bounded-experiment/modules/sfeature-bounded-experiment-v1.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/bounded-experiment/package.json` | `domain-packages/standard/features/bounded-experiment/package.json` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/bounded-experiment/tests/bounded-experiment.test.mjs` | `domain-packages/standard/features/bounded-experiment/tests/bounded-experiment.test.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/candidate-evaluation/README.md` | `domain-packages/standard/features/candidate-evaluation/README.md` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/candidate-evaluation/build-probe.mjs` | `domain-packages/standard/features/candidate-evaluation/build-probe.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/candidate-evaluation/feature-manifest.mjs` | `domain-packages/standard/features/candidate-evaluation/feature-manifest.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/candidate-evaluation/modules/sfeature-candidate-evaluation-v1.mjs` | `domain-packages/standard/features/candidate-evaluation/modules/sfeature-candidate-evaluation-v1.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/candidate-evaluation/package.json` | `domain-packages/standard/features/candidate-evaluation/package.json` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/candidate-evaluation/tests/candidate-evaluation.test.mjs` | `domain-packages/standard/features/candidate-evaluation/tests/candidate-evaluation.test.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/experience-reuse/README.md` | `domain-packages/standard/features/experience-reuse/README.md` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/experience-reuse/build-probe.mjs` | `domain-packages/standard/features/experience-reuse/build-probe.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/experience-reuse/feature-manifest.mjs` | `domain-packages/standard/features/experience-reuse/feature-manifest.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/experience-reuse/modules/sfeature-experience-reuse-v1.mjs` | `domain-packages/standard/features/experience-reuse/modules/sfeature-experience-reuse-v1.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/experience-reuse/package.json` | `domain-packages/standard/features/experience-reuse/package.json` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/packages/experience-reuse/tests/experience-reuse.test.mjs` | `domain-packages/standard/features/experience-reuse/tests/experience-reuse.test.mjs` | T01 | X01 | MIGRATE |
| `extensions/agent-improvement/host/ct02-data-only-invoker.mjs` | `packages/host-node/ (ct02-data-only-invoker.mjs as `./ct02-invoker`)` | T03 | X02 | MIGRATE |

## 4. Target paths that are not tracked yet (created by tasks)

| Target path | Created by | Shape | Authority |
| --- | --- | --- | --- |
| packages/contracts/ | T07a (skeleton) then T00 | new TS workspace; committed `dist` | L2 §1.1 |
| packages/microkernel/ | T07a (skeleton) then T04 (T06 adds subscribe) | new TS workspace; committed `dist` | L2 §1.1, §3, §8 |
| packages/host-node/ | T07a (skeleton) then T03 (T06 adds governed subscribe) | new TS workspace; committed `dist`; optional peer `better-sqlite3` | L2 §1.1 |
| tooling/build/ | T07a (skeleton) then T05 | new TS workspace (needs `tooling/*` glob); committed `dist` | L2 §1.1, §5 |
| domain-packages/kernel/basic/ | T01 (move), T01k (append) | not a workspace; `.mjs` | L2 §1.1, §2 |
| domain-packages/standard/basic/ | T01 | not a workspace; `.mjs` | L2 §1.1 |
| domain-packages/standard/features/<f>/ (10) | T01 | not workspaces; 6 payload features + 4 v0.10.1 packages | L2 §1.1 |
| domain-packages/kernel/extensions/ | NOT CREATED | no K extension package exists outside fixtures | L2 §1.1 |
| examples/v010-meta-feedback/ | T01 | private; tests-only Business reference | L2 §1.1, §6 |
| examples/v0102-external-producer/ | T09 | out-of-workspace producer journey (#1309) | L2 §12 T09 |
| tests/fixtures/k02-fragment/ | T11 | test-only home of `durable-receipt-carrier-v1.mjs` | L2 §9 |
| packages/{contracts,microkernel,host-node}/tests/, tooling/build/tests/ | T00, T04, T03, T05, T06 | new scoped tests of the new packages | L2 §12 |
| tests/compiler/v0102-{import-direction,wire-literals,payload-parity,kernel-protocol,tarball-inventory}.test.ts | T00, T00, T01, T01k+T04, T07b | new root tests (see L2_NEGATIVE_BOUNDARY_MATRIX.md) | L2 §1.3, §2, §5, §9 |

## 5. Selected-path touch scan of test, example and extension sources

Columns: files scanned (`.ts/.mts/.mjs/.js`), files naming any selected-path token (`SEL` = build or payload or host), then per token class. `SEL_BUILD` = `v10build|v10meta|v10shadow|v10evidence|compiler/v10`; `SEL_PAYLOAD` = payload module names or `v10payload/`; `SEL_HOST` = `host-v8` or `@kaicreator/domain-harness/v8/host`; `LEGACY` = `public-v2..v9|legacy-v1|host-v9|recovery-v2`, legacy subpath specifiers, node/expo package names; `FRAGMENT` = `durable-receipt-carrier`. A file may carry several tokens; `host-v8` includes the legacy barrel (INV §2.1), so `SEL_HOST` in legacy trees does not mean selected-path use.

| Group | Path group | Files | SEL any | SEL_BUILD | SEL_PAYLOAD | SEL_HOST | LEGACY | FRAGMENT | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A15 | `packages/domain-harness/tests/v08-host/` | 16 | 15 | 0 | 5 | 15 | 2 | 5 | KEEP |
| A16 | `packages/domain-harness/tests/v08-integration/` | 78 | 62 | 0 | 26 | 59 | 31 | 0 | KEEP |
| A17 | `regex ^packages\/domain-harness\/tests\/v09-[^/]*$` | 13 | 4 | 0 | 4 | 0 | 11 | 0 | LEGACY_REFERENCE |
| A18 | `packages/domain-harness/tests/` | 381 | 5 | 0 | 0 | 5 | 48 | 0 | LEGACY_REFERENCE |
| C22 | `packages/domain-harness-compiler/tests/v08-k02-durable-receipt-carrier.test.ts` | 1 | 0 | 0 | 0 | 0 | 0 | 1 | UNSELECTED_REFERENCE |
| C23 | `regex ^packages\/domain-harness-compiler\/tests\/(v08-kernel-\|v08-standard-sdk-\|v08-tf-\|v08-two-real\|v09-selected-abi\|v09-workflow-router)` | 21 | 18 | 0 | 18 | 0 | 1 | 0 | KEEP |
| C24 | `packages/domain-harness-compiler/tests/` | 25 | 2 | 0 | 2 | 0 | 20 | 0 | LEGACY_REFERENCE |
| N01 | `packages/domain-harness-node/` | 58 | 0 | 0 | 0 | 0 | 33 | 0 | UNSELECTED_REFERENCE |
| N02 | `packages/domain-harness-expo/` | 3 | 0 | 0 | 0 | 0 | 1 | 0 | UNSELECTED_REFERENCE |
| E01 | `examples/v010-clean-consumer/apps/rich/` | 15 | 3 | 1 | 1 | 2 | 0 | 0 | KEEP |
| E02 | `examples/v010-clean-consumer/build-apps.mjs` | 1 | 1 | 1 | 1 | 0 | 0 | 0 | KEEP |
| E03 | `examples/v010-clean-consumer/` | 8 | 1 | 1 | 0 | 0 | 0 | 0 | KEEP |
| E04 | `examples/v0101-agent-improvement/` | 1 | 1 | 1 | 1 | 0 | 0 | 0 | KEEP |
| E05 | `examples/v08-domain-apps/` | 3 | 1 | 0 | 1 | 0 | 0 | 0 | LEGACY_REFERENCE |
| E06 | `examples/v09-clean-consumer/` | 2 | 1 | 0 | 1 | 0 | 2 | 0 | LEGACY_REFERENCE |
| E07 | `examples/expo-conformance/` | 3 | 0 | 0 | 0 | 0 | 0 | 0 | UNSELECTED_REFERENCE |
| X01 | `extensions/agent-improvement/packages/` | 16 | 12 | 4 | 12 | 0 | 0 | 0 | MIGRATE |
| X02 | `extensions/agent-improvement/host/` | 1 | 0 | 0 | 0 | 0 | 0 | 0 | MIGRATE |
| T01 | `tests/assembly/fixtures-v010/` | 24 | 2 | 0 | 0 | 2 | 0 | 0 | KEEP |
| T02 | `regex ^tests\/assembly\/(v010-[^/]*\|helpers-v010\.ts)$` | 11 | 10 | 10 | 10 | 2 | 0 | 0 | KEEP |
| T03 | `tests/assembly/` | 6 | 0 | 0 | 0 | 0 | 0 | 0 | LEGACY_REFERENCE |
| T04 | `regex ^tests\/compiler\/(v010-[^/]*\|v10build-composition\.test\.ts)$` | 9 | 9 | 9 | 1 | 0 | 0 | 0 | KEEP |
| T05 | `tests/compiler/` | 1 | 0 | 0 | 0 | 0 | 0 | 0 | LEGACY_REFERENCE |
| T06 | `tests/conformance/v0101-sdk-features.test.ts` | 1 | 1 | 1 | 1 | 0 | 0 | 0 | KEEP |
| T07 | `tests/conformance/` | 8 | 0 | 0 | 0 | 0 | 0 | 0 | LEGACY_REFERENCE |
| T08 | `tests/hosts/node/` | 31 | 26 | 23 | 10 | 22 | 2 | 0 | KEEP |
| T09 | `regex ^tests\/hosts\/(expo\|expo-store\|expo-v3-host\|successor-expo)\/` | 21 | 0 | 0 | 0 | 0 | 9 | 0 | UNSELECTED_REFERENCE |
| T10 | `tests/integration/v010-clean-consumers/` | 2 | 0 | 0 | 0 | 0 | 0 | 0 | KEEP |
| T11 | `tests/integration/package-versioning/` | 1 | 0 | 0 | 0 | 0 | 1 | 0 | LEGACY_REFERENCE |
| T12 | `tests/architecture-v010-k-extensions/` | 14 | 2 | 0 | 2 | 0 | 1 | 0 | UNSELECTED_REFERENCE |
| T14 | `regex ^tests\/(critical-journeys\|migration\|tools)\/` | 8 | 0 | 0 | 0 | 0 | 5 | 0 | LEGACY_REFERENCE |

## 6. Findings for the controller (facts found while classifying; nothing here changes the frozen L2)

| # | Finding | Evidence | Consequence |
| --- | --- | --- | --- |
| F1 | `.gitignore` ignores `dist/` and un-ignores only `packages/domain-harness/dist/` and `packages/domain-harness-compiler/dist/`; `.gitattributes` marks only those two `-text`. L2 §5 commits `dist` for the four new TS packages and untracks the two legacy dists, but no L2 §12 write set (T07a/T07b included) lists `.gitignore` or `.gitattributes`. | `.gitignore`, `.gitattributes` at the pin; L2 §5 "Committed dist (#299)", §12 T07a/T07b | Without an owner the new dists cannot be committed normally and the CI freshness guard would not see them. A DAG admission decision is needed (assign to T07a/T07b). Not fixed here (outside the write set). |
| F2 | `examples/v08-domain-apps/` is not just a pointer-README candidate: its three files are read by path by core v08-integration tests and `v09-deployment-bootstrap.test.ts`, and are byte-copied into the Tiny app (`examples/v010-clean-consumer/PROVENANCE.md`). L2 §7 states the contents were not inspected. | `grep` of `examples/v08-domain-apps` over `packages/*/tests`; PROVENANCE.md lines 11-12 | Classified LEGACY_REFERENCE with a "must not move or delete" note (group `E05`). |
| F3 | `examples/v09-clean-consumer/` is consumed by `packages/domain-harness/tests/v09-external-consumer.test.ts` and imports `@kaicreator/domain-harness/v9`, which T07b prunes. | file greps; INV §1.2 | T07b must relabel or retire that test; no L2 row names it (NOT_VERIFIED). |
| F4 | `packages/domain-harness/scripts/copy-vendored-dist-assets.mjs` serves only the legacy `build` script (host-v9 acorn copy). | file header | Follows the legacy dist; not in any L2 row (group `A04`). |
| F5 | The INV Appendix lists payload readers for `v08-tf-oracle-fr02-fr07` but not for `v08-tf-oracle-fr05-fr08`; group `C23` includes both by name prefix. | INV Appendix A.1 | T01 edit scope for the second file is NOT_VERIFIED. |
| F6 | `v09/workflow-router.d.mts` and `v09/selected-abi.d.mts` exist beside the `.mjs` files; L2 names only `workflow-router.mjs` as moving. | `git ls-files` | Whether the declaration file moves is NOT_VERIFIED. |

## 7. Truth limits

Per-group classification, not per-file, for the docs trees (292 files), the `.agent` tree (116 files) and the legacy core/compiler test trees; per-file reachability of legacy subtrees beyond INV §1.1/§2.1/§8 is `NOT_VERIFIED`. No fate here is a new decision: a reviewer may check each Evidence cell against L2/INV. The generator can be re-run on a later pin; a changed file count or an unmatched path is then reported by the script (exit non-zero).
