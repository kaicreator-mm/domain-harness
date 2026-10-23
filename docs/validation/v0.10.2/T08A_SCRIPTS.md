# DomainHarness v0.10.2 - T08a scripts (reproducible generators and checker)

**Status:** `T08A_SUPPORT / NO_BUILD / NO_TESTS`. Reproduces the scripts that generated or checked `PATH_CLASSIFICATION_INVENTORY.md` and checked all T08a documents. Node v24, no dependencies, read-only on the repository (they write only the documents). Paths: the scripts were run from `C:\xDev\kAiCreator\_tmp\dh-t08a-1322-sonnet\` against the worktree `C:/xDev/kAiCreator/domain-harness/dh-t08a-1322-sonnet`; adjust `ROOT` in `lib.mjs`.

`L2_NEGATIVE_BOUNDARY_MATRIX.md` and `RETAINED_FUNCTION_SUCCESSOR_CROSSWALK.md` were rendered by two further authoring aids (`gen-matrix.mjs`, `gen-crosswalk.mjs` with the data module `crosswalk-data.mjs`) that stay in the task directory and are **not** reproduced: the committed tables are their output and are authoritative. Their claims are re-verified from the committed text alone by `check-docs.mjs` (every `path :: token` pair, every `NEW:` path against the L2 design, the grep-absence claims, the 44 ids against the closure ledger).

Run order: `node gen-inventory.mjs` then `node check-docs.mjs`; the checker exits 1 and lists the problems if any check fails.

## lib.mjs

Shared helpers: `git ls-files`, file/token checks, markdown table builder with column-count enforcement.

<details><summary>source</summary>

```js
// Shared helpers for the T08a document generators/checkers.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const ROOT = 'C:/xDev/kAiCreator/domain-harness/dh-t08a-1322-sonnet';
export const OUT = ROOT + '/docs/validation/v0.10.2';
export const TASKDIR = 'C:/xDev/kAiCreator/_tmp/dh-t08a-1322-sonnet';

export function gitFiles() {
  return execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0').filter(Boolean);
}
export const exists = (rel) => { try { return fs.statSync(path.join(ROOT, rel)).isFile(); } catch { return false; } };
export const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
export function hasToken(rel, token) { return exists(rel) && read(rel).includes(token); }

export const esc = (v) => String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
export function table(headers, rows) {
  const out = ['| ' + headers.map(esc).join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |'];
  rows.forEach((r, i) => {
    if (r.length !== headers.length) throw new Error(`row ${i} has ${r.length} cells, expected ${headers.length}: ${String(r[0])}`);
    out.push('| ' + r.map(esc).join(' | ') + ' |');
  });
  return out.join('\n');
}
```

</details>

## groups.mjs

The ordered path-group table behind `PATH_CLASSIFICATION_INVENTORY.md` (classification, target, owner, evidence). Editing a group and re-running the generator regenerates the table.

<details><summary>source</summary>

```js
// Per-path group definitions for PATH_CLASSIFICATION_INVENTORY.md.
// m: string ending with '/' = directory prefix; other string = exact path or filename prefix when
// flagged prefix:true; array = list of exact paths/prefixes; RegExp = full-path test.
// First matching group wins (most specific first). Every tracked file must match a group.
const A = 'packages/domain-harness/', B = 'packages/domain-harness-compiler/', QP = B + 'src/qualified-package/';
const G = (id, m, cls, target, owner, role, ev, note = '') => ({ id, m, cls, target, owner, role, ev, note });

export const GROUPS = [
  // ---- root configuration ----
  G('R01', 'package.json', 'KEEP', '', 'T07a, T07b', 'config', 'L2 §5; INV §7', 'T07a adds `tooling/*` to `workspaces`; T07b sets engines to Node24.'),
  G('R02', 'package-lock.json', 'KEEP', '', 'T07a', 'config', 'L2 §5 (lockfile discipline)', 'Regenerated once; diff may only add new workspace keys.'),
  G('R03', 'tsconfig.base.json', 'KEEP', '', 'T07a', 'config', 'L2 §5 names T07 as sole writer of tsconfig files; this root base file is not named', 'NOT_VERIFIED whether any task edits it.'),
  G('R04', 'eslint.config.mjs', 'KEEP', '', 'T07a', 'config', 'L2 §5; INV §7', ''),
  G('R05', ['.gitignore', '.gitattributes'], 'KEEP', '', 'NO_OWNER_IN_L2_S12', 'config', '`.gitignore` ignores `dist/` and un-ignores only the two legacy dists; `.gitattributes` marks only those two `-text`', 'GAP: L2 §5 keeps committed `dist` for the four NEW TS packages and untracks the legacy dists (T07b) but no §12 write set names these two files.'),
  G('R06', 'AGENTS.md', 'KEEP', '', '-', 'governance', 'AGENTS.md read order; CV-01..12', 'Not edited by any listed task.'),
  G('R07', 'README.md', 'KEEP', '', 'T08b', 'docs', 'L2 §12 T08b; #1303 (root README drifts to v0.7)', 'Rewritten to the v0.10.2 route.'),
  G('R08', '.dev-standard/', 'KEEP', '', 'T07b', 'governance', 'L2 §5 (PROJECT_OVERRIDES lines 186, 240); VERSION pin', 'ADS pin (`VERSION`) untouched; only the CI-profile lines change.'),
  G('R09', '.woodpecker/verify-min-node.yaml', 'REMOVE', '', 'T07b', 'ci', 'L2 §5 (Node24 engines); INV §7', 'Its two v0.10 test files move into the main smoke list.'),
  G('R10', '.woodpecker/verify.yaml', 'KEEP', '', 'T07b', 'ci', 'L2 §5 (CI smoke swap); INV §7', 'Smoke list replaced; Node gate `< 22` becomes `< 24`.'),
  G('R11', '.agent/', 'ARCHIVE', '', '-', 'evidence', '#1302 scope: keep `.agent` intact', 'v0.10 task execution contracts; immutable provenance.'),
  G('R12', 'scripts/check-v010-error-code-catalog.mjs', 'KEEP', '', 'T00, T05, T04, T03, T11 (serialized)', 'test-support', 'L2 §12 preamble (catalog set); INV §7', 'Scan roots generalized by T00, edited in turn.'),
  G('R13', ['scripts/check-committed-dist.mjs', 'scripts/lint.mjs'], 'KEEP', '', 'T07a', 'config', 'L2 §5; INV §7', 'Roster derived from non-private workspaces (T07a).'),
  // ---- legacy core @kaicreator/domain-harness ----
  G('A01', A + 'dist/', 'REMOVE', '', 'T07b', 'generated', 'L2 §5 (T07b untracks legacy dist); INV §4 (57 legacy dist dirs, 604 map files)', 'Untrack only after T11 flips all importers; install path of legacy consumers NOT_VERIFIED.'),
  G('A02', /^packages\/domain-harness\/(package\.json|tsconfig[^/]*\.json)$/, 'KEEP', '', 'T07a, T07b', 'config', 'L2 §5', 'T07a: private:true, new deps, prebuild; T07b: prune exports.'),
  G('A03', A + 'README.md', 'KEEP', '', 'T08b', 'docs', 'L2 §7 (legacy banner)', ''),
  G('A04', A + 'scripts/', 'LEGACY_REFERENCE', '', '-', 'build-support', 'copies vendored acorn into `dist/host-v9`; serves only the legacy `build` script', 'Leaves the guard with the legacy dist (T07a/T07b).'),
  G('A05', A + 'examples/', 'LEGACY_REFERENCE', '', '-', 'example', 'L2 §7', ''),
  G('A06', /^packages\/domain-harness\/src\/host-v8\/(sqlite-cas-store|cas|errors|v010-scoped-memory|durable-controls)\.ts$/, 'MIGRATE', 'packages/host-node/src/', 'T03', 'host', 'L2 §1.1, §7; INV §2.1 (SELECTED)', 'Forwarding shim stays at the old path for legacy barrel importers (61 by path, 75 by resolver).'),
  G('A07', A + 'src/host-v8/v010-authorized-multib-query.ts', 'MIGRATE', 'packages/microkernel/src/', 'T04', 'runtime', 'L2 §1.1, §1.3 (zero-import file; removes the Microkernel to host-v8 edge)', 'Shim stays at old path.'),
  G('A08', A + 'src/host-v8/index.ts', 'LEGACY_REFERENCE', '', 'T03, T04 (re-export lines)', 'host', 'L2 §7; INV §2.1 (barrel re-exports all 15 files, closure drags `ajv`, `json-schema-library`)', 'Becomes a forwarding barrel; no longer a selected-path entry.'),
  G('A09', A + 'src/host-v8/', 'UNSELECTED_REFERENCE', '', 'T07b (not exported)', 'host', 'L2 §7; INV §2.1 (8 files, no root test names any export)', 'bootstrap, dispatcher, events, identity, hf20-mutation-observation, kernel-gateway, tool-call-port, ux-transport.'),
  G('A10', A + 'src/public-v8/contracts.ts', 'MIGRATE', 'packages/contracts/src/', 'T00', 'contract', 'L2 §1.3 item 5 (`canonicalSnapshot`, `QualifiedPackageError`); INV §2.1', 'Only the selected function and error class move; the re-export block stays as shim.'),
  G('A11', A + 'src/public-v8/', 'UNSELECTED_REFERENCE', '', 'T07b (not exported)', 'legacy-api', 'L2 §7; INV §2.1', ''),
  G('A12', [A + 'src/contracts/identity.ts', A + 'src/contracts/json.ts'], 'MIGRATE', 'packages/contracts/src/', 'T00', 'contract', 'L2 §1.3 item 5 (needed by `durable-controls.ts:35`); INV D2', ''),
  G('A13', /^packages\/domain-harness\/src\/(host-v9|public-v9|recovery-v2|legacy-v1|public-v2|public-v3|public-v4|public-v7|v2)\//, 'UNSELECTED_REFERENCE', '', 'T07b (not exported)', 'legacy-api', 'L2 §7 row "host-v8 residue ... host-v9, public-v9, recovery-v2, legacy-v1, v2-v7"', 'Evidence-carrying tests still import them; not deleted (O5).'),
  G('A14', A + 'src/', 'LEGACY_REFERENCE', '', '-', 'legacy-runtime', 'L2 §7 row `packages/domain-harness`; INV §1.1 (selected closure never reaches these subtrees)', 'Subtrees not named in L2 §7 (runtime, dac*, harness, ...): per-subtree consumer scan NOT_VERIFIED beyond INV §1.1.'),
  G('A15', A + 'tests/v08-host/', 'KEEP', '', 'T01, T01k, T11', 'test/evidence', 'L2 §9, §10; INV §3.1, Appendix A', 'K/S physical evidence; carries three of the four K blob pins (T01k; the fourth is `V08_K_BLOB` in the compiler test `v08-tf-oracle-fr02-fr07.test.ts`, group C23) and the fragment tests (T11).'),
  G('A16', A + 'tests/v08-integration/', 'KEEP', '', 'T01', 'test/evidence', 'L2 §10 (payload byte readers); INV §3.1', 'v0.8 retained-44 oracles; payload-path literals flipped by T01.'),
  G('A17', /^packages\/domain-harness\/tests\/v09-[^/]*$/, 'LEGACY_REFERENCE', '', 'T07b (3 files leave CI smoke)', 'test', 'INV §7 (verify.yaml smoke uses 3 v09 files)', 'Run in the manual full run only after T07b.'),
  G('A18', A + 'tests/', 'LEGACY_REFERENCE', '', 'T01 (payload literals in some files)', 'test', 'L2 §7, §10 (200 legacy-surface importers untouched)', ''),
  // ---- compiler @kaicreator/domain-harness-compiler ----
  G('C01', B + 'dist/', 'REMOVE', '', 'T07b', 'generated', 'L2 §5; INV §4 (112 tracked files)', ''),
  G('C02', /^packages\/domain-harness-compiler\/(package\.json|tsconfig[^/]*\.json)$/, 'KEEP', '', 'T07a, T07b', 'config', 'L2 §5', 'T07a: private:true, deps on new packages, prebuild; T07b: prune 16 exports.'),
  G('C03', B + 'README.md', 'KEEP', '', 'T08b', 'docs', 'L2 §7', ''),
  G('C04', /^packages\/domain-harness-compiler\/src\/qualified-package\/v10build\/(digest|errors|known-error-codes|guards)\.ts$/, 'MIGRATE', 'packages/contracts/src/', 'T00', 'contract', 'L2 §1.1, §1.3', 'Shim at old path until T11 (digest.ts K doc-key mirrors are removed, L2 §2).'),
  G('C05', /^packages\/domain-harness-compiler\/src\/qualified-package\/v10build\/(activation|import-hook|external-effect)\.ts$/, 'MIGRATE', 'packages/microkernel/src/', 'T04', 'runtime', 'L2 §1.1, §2, §3', 'Gate stays internal and read-only; shim until T11.'),
  G('C06', /^packages\/domain-harness-compiler\/src\/qualified-package\/v10build\/(deployment|error-type-parity|query-type-parity)\.ts$/, 'MIGRATE', 'packages/host-node/src/', 'T03', 'host', 'L2 §1.1', 'Shim until T11.'),
  G('C07', /^packages\/domain-harness-compiler\/src\/qualified-package\/v10build\/(build|selected-closure|import-policy)\.ts$/, 'MIGRATE', 'tooling/build/src/', 'T05', 'producer', 'L2 §1.1', 'BUILD only; no runtime import.'),
  G('C08', QP + 'v10build/index.ts', 'REMOVE', '', 'T11', 'barrel', 'L2 §12 T11 (delete v10 shim files); INV §1.1', 'Remains the compat barrel until T11.'),
  G('C09', [QP + 'v10meta/', QP + 'v10shadow/', QP + 'v10evidence/'], 'MIGRATE', 'packages/host-node/src/', 'T03', 'host', 'L2 §1.1, §6 (KEEP as host-node optional subpaths); INV §6', 'v10evidence is not in the frozen crosswalk (INV D2).'),
  G('C10', QP + 'payload/kernel-mechanism-v1.mjs', 'MIGRATE', 'domain-packages/kernel/basic/payload/', 'T01 (move), T01k (append-only protocol)', 'domain-package', 'L2 §1.1, §2; blob `72a886ff...`', 'Byte-identical move; one 300 KB file (PRD §5).'),
  G('C11', QP + 'payload/standard-sdk-v1.mjs', 'MIGRATE', 'domain-packages/standard/basic/payload/', 'T01', 'domain-package', 'L2 §1.1, §6', '`Retained*` helpers are dispositioned in RETAINED_FUNCTION_SUCCESSOR_CROSSWALK.md.'),
  G('C12', /^packages\/domain-harness-compiler\/src\/qualified-package\/payload\/sfeature-[a-z-]+-v1\.mjs$/, 'MIGRATE', 'domain-packages/standard/features/<feature>/', 'T01', 'domain-package', 'L2 §1.1 (6 payload features)', 'semantic-decision, workflow-control, context-assembly, decision-evidence, candidate-validation, meta-feedback.'),
  G('C13', QP + 'payload/business-meta-feedback-v1.mjs', 'MIGRATE', 'examples/v010-meta-feedback/', 'T01', 'example', 'L2 §1.1, §6; INV §6', 'Business reference, tests-only consumer.'),
  G('C14', QP + 'payload/durable-receipt-carrier-v1.mjs', 'ARCHIVE', 'tests/fixtures/k02-fragment/', 'T11 (after T08a)', 'test-fixture', 'L2 §9 (fragment exclusion), blob `df9732ac...`; PRD §5', 'Test-only; in no packlist (T07b). The rebinding table (this task) must merge first.'),
  G('C15', [QP + 'v09/workflow-router.mjs', QP + 'v09/workflow-router.d.mts'], 'MIGRATE', 'domain-packages/standard/basic/', 'T01', 'domain-package', 'L2 §1.1 names `v09/workflow-router.mjs`', 'The companion `.d.mts` is not named by L2: NOT_VERIFIED whether it moves.'),
  G('C16', [QP + 'v09/selected-abi.mjs', QP + 'v09/selected-abi.d.mts'], 'LEGACY_REFERENCE', '', '-', 'legacy-build', 'L2 §12 T01 ("except fragment, `selected-abi`")', 'Stays in the compiler.'),
  G('C17', [QP + 'v09build/parser.ts', QP + 'v09build/generated/acorn.mjs', QP + 'v09build/generated/acorn.d.mts'], 'LEGACY_REFERENCE', 'COPY to tooling/build/', 'T05 (copy); v09build itself frozen', 'producer', 'L2 §1.1 (copies; blob `aee191eb...`); INV D2', 'Copy, not move: `v09build` stays frozen.'),
  G('C18', QP + 'v09build/', 'LEGACY_REFERENCE', '', '-', 'legacy-build', 'L2 §1.1 ("v09build itself stays frozen")', ''),
  G('C19', B + 'src/index.ts', 'LEGACY_REFERENCE', '', 'T11 (line 140)', 'legacy-api', 'L2 §12 T11', 'Drops the v10build re-export.'),
  G('C20', QP + 'index.ts', 'LEGACY_REFERENCE', '', 'T11 (line 45)', 'legacy-api', 'L2 §12 T11', ''),
  G('C21', B + 'src/', 'LEGACY_REFERENCE', '', '-', 'legacy-build', 'L2 §7 row `-compiler (legacy parts: compile/raw/package/compat/v0.8-v0.9 BUILD)`; INV §1.2', ''),
  G('C22', B + 'tests/v08-k02-durable-receipt-carrier.test.ts', 'UNSELECTED_REFERENCE', '', 'T11 (relabel, path flip)', 'test', 'L2 §9: fragment-only evidence, "not selected-K proof"', ''),
  G('C23', /^packages\/domain-harness-compiler\/tests\/(v08-kernel-|v08-standard-sdk-|v08-tf-|v08-two-real|v09-selected-abi|v09-workflow-router)/, 'KEEP', '', 'T01', 'test/evidence', 'L2 §10; INV §3.1, Appendix A.1', 'Payload byte readers; literal paths flipped by T01; `v08-tf-oracle-fr02-fr07.test.ts` also holds a K blob pin (T01k). `v08-tf-oracle-fr05-fr08` reads no payload path in INV Appendix A: whether T01 edits it is NOT_VERIFIED.'),
  G('C24', B + 'tests/', 'LEGACY_REFERENCE', '', '-', 'test', 'L2 §7', ''),
  // ---- node / expo ----
  G('N01', 'packages/domain-harness-node/', 'UNSELECTED_REFERENCE', '', 'T07a (private:true), T08b (banner)', 'legacy-host', 'L2 §7; INV §8 (no selected importer)', 'No new package may import it; unpublished.'),
  G('N02', 'packages/domain-harness-expo/', 'UNSELECTED_REFERENCE', '', 'T07a (private:true), T08b (banner)', 'legacy-host', 'L2 §7; INV §8', 'No Expo support obligation.'),
  // ---- examples ----
  G('E01', 'examples/v010-clean-consumer/apps/rich/', 'KEEP', '', 'T03, T11, T09', 'example', 'L2 §12 T03 (`examples/v010-clean-consumer/apps/rich/**`), T09', 'Sealed `externalImports.npm` allowance string changes (digest-bound).'),
  G('E02', 'examples/v010-clean-consumer/build-apps.mjs', 'KEEP', '', 'T01, T11, T09', 'example', 'L2 §12 T01; INV §1.2', 'Payload specifier strings flipped.'),
  G('E03', 'examples/v010-clean-consumer/', 'KEEP', '', 'T11, T09, T08b', 'example', 'L2 §12 T11, T09; INV §1.2 (`runtime-core.mjs` imports `compiler/v10build`)', 'Tiny app, runtime, README, PROVENANCE.'),
  G('E04', 'examples/v0101-agent-improvement/', 'KEEP', '', 'T01, T03, T11', 'example', 'L2 §12 T01, T03', '`selected-subsets-build.mjs`: payload specifiers (T01) and the CT-02 invoker import (T03).'),
  G('E05', 'examples/v08-domain-apps/', 'LEGACY_REFERENCE', '', 'T08b (pointer README)', 'example/test-input', 'L2 §7; PROVENANCE.md of v010-clean-consumer (byte-copied into Tiny); core tests read these files by path', 'Regression input: MUST NOT move or delete while those tests live. L2 §7 says contents "not inspected".'),
  G('E06', 'examples/v09-clean-consumer/', 'LEGACY_REFERENCE', '', 'T08b (pointer README)', 'example', 'L2 §7; read by `packages/domain-harness/tests/v09-external-consumer.test.ts`', 'Imports `@kaicreator/domain-harness/v9`, pruned by T07b: that test breaks or is relabelled (NOT_VERIFIED).'),
  G('E07', 'examples/expo-conformance/', 'UNSELECTED_REFERENCE', '', 'T08b (banner)', 'example', 'L2 §7; INV §8', 'Own lockfile; no Expo support obligation.'),
  // ---- extensions ----
  G('X01', 'extensions/agent-improvement/packages/', 'MIGRATE', 'domain-packages/standard/features/<feature>/', 'T01', 'domain-package', 'L2 §1.1, §7 (`git mv`, content unchanged)', '`build-probe.mjs` relative deep import keeps resolving (equal depth) and stays the #1309 negative.'),
  G('X02', 'extensions/agent-improvement/host/', 'MIGRATE', 'packages/host-node/ (`./ct02-invoker`)', 'T03', 'host', 'L2 §1.1, §7', '`extensions/` is removed afterwards.'),
  // ---- root tests ----
  G('T01', 'tests/assembly/fixtures-v010/', 'KEEP', '', 'T03 (twins `capability-*.mjs`)', 'test-fixture', 'L2 §12 T03; `v010-fixture-parity.test.ts:20`', ''),
  G('T02', /^tests\/assembly\/(v010-[^/]*|helpers-v010\.ts)$/, 'KEEP', '', 'T01, T04, T03, T11', 'test/evidence', 'INV §3.3; L2 §10', 'Selected-path K/S/B/C assembly tests.'),
  G('T03', 'tests/assembly/', 'LEGACY_REFERENCE', '', '-', 'test', 'L2 §10', 'Legacy successor/mixed-coexistence tests.'),
  G('T04', /^tests\/compiler\/(v010-[^/]*|v10build-composition\.test\.ts)$/, 'KEEP', '', 'T00, T05, T04, T03, T11 (catalog set + boundary rewrite)', 'test/evidence', 'L2 §12 preamble, T04', '`v010-public-api-boundary.test.ts` is semantically rewritten by T04.'),
  G('T05', 'tests/compiler/', 'LEGACY_REFERENCE', '', '-', 'test', 'root `test:root` glob', ''),
  G('T06', 'tests/conformance/v0101-sdk-features.test.ts', 'KEEP', '', 'T01', 'test/evidence', 'L2 §12 T01', 'v0.10.1 16-subset BUILD witness.'),
  G('T07', 'tests/conformance/', 'LEGACY_REFERENCE', '', '-', 'test', 'root `test:root` glob', ''),
  G('T08', 'tests/hosts/node/', 'KEEP', '', 'T03, T11', 'test/evidence', 'L2 §10 (46 root files flip to package specifiers); INV §3', 'Includes `conformance.test.ts`, `node-conformance-host.ts`, `runtime-fixture.ts` (not v010-named; see the touch scan).'),
  G('T09', /^tests\/hosts\/(expo|expo-store|expo-v3-host|successor-expo)\//, 'UNSELECTED_REFERENCE', '', '-', 'test', 'L2 §7; INV §7 (in no `test:root` glob), §8', ''),
  G('T10', 'tests/integration/v010-clean-consumers/', 'KEEP', '', 'T01, T09', 'test/evidence', 'L2 §12 T01, T09', 'Pack list and Tiny/Rich closure assertions.'),
  G('T11', 'tests/integration/package-versioning/', 'LEGACY_REFERENCE', '', '-', 'test', 'INV §7 (in no `test:root` glob)', ''),
  G('T12', 'tests/architecture-v010-k-extensions/', 'UNSELECTED_REFERENCE', '', '-', 'test', 'L2 §15.2 O11 (#1150 spike, unrun reference)', 'Imports `host-v9/ast-gate.js` (INV §3.2).'),
  G('T13', ['tests/MATRIX.md'], 'LEGACY_REFERENCE', '', '-', 'docs', 'tests tree document', 'NOT_VERIFIED content currency.'),
  G('T14', /^tests\/(critical-journeys|migration|tools)\//, 'LEGACY_REFERENCE', '', '-', 'test', 'root `test:root` globs / INV §7', ''),
  // ---- docs ----
  G('D01', 'docs/architecture/DomainHarness_v0.10.2_', 'KEEP', '', '-', 'docs/frozen', 'L2 Freeze checkpoint (exact blobs)', 'FROZEN: never edited.'),
  G('D02', 'docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md', 'KEEP', '', '-', 'docs/normative', 'AGENTS.md rule; CV-01..12', ''),
  G('D03', 'docs/architecture/V010_TYPED_REFUSAL_LITERAL_CATALOG.json', 'KEEP', '', 'T00, T05, T04, T03, T11 (regenerated)', 'test-support', 'L2 §12 preamble (catalog set)', ''),
  G('D04', 'docs/architecture/', 'ARCHIVE', '', '-', 'docs/provenance', '#1303 (archive/index, do not bulk move)', 'Includes v0.10.1 L2 freeze and v0.10 R0.'),
  G('D05', 'docs/product/DomainHarness_v0.10.2_', 'KEEP', '', '-', 'docs/frozen', 'Product Freeze (PRD blob 746535c9..., crosswalk blob 46bfbe47...)', 'FROZEN: never edited.'),
  G('D06', 'docs/product/', 'ARCHIVE', '', '-', 'docs/provenance', '#1303', ''),
  G('D07', 'docs/validation/v0.10.2/', 'KEEP', '', 'T08a (new files only)', 'docs/validation', 'L2 §12 T08a write set', 'L2 inventory and scripts are frozen; this task adds files beside them.'),
  G('D08', 'docs/validation/', 'ARCHIVE', '', '-', 'docs/provenance', '#1303; the v0.10 T01 audit/ledger and v0.10.1 reports are immutable pins cited by the #1310 crosswalk', ''),
  G('D09', ['docs/README.md'], 'KEEP', '', 'T08b', 'docs', '#1303 (docs/README.md is v0.1-oriented)', 'Rewritten.'),
  G('D10', /^docs\/(sdk|migration|quickstart)\//, 'ARCHIVE', '', 'T08b (banner/index; new current docs added beside)', 'docs/provenance', '#1303 (docs/sdk/README.md claims v0.3 current); L2 §12 T08b', 'Historic files stay; current replacements are new files.'),
  G('D11', /^docs\/(implementation|tasks|roadmap|release|research|experiments|integration|harness|domain-data|operations|technical|governance)\//, 'ARCHIVE', '', '-', 'docs/provenance', '#1303', 'Includes the frozen v0.8 retained-44 manifest and the v0.10 historical crosswalk.'),
  G('D12', 'docs/DomainHarness_v0.1_INDEX.md', 'ARCHIVE', '', 'T08b (pointer)', 'docs/provenance', '#1303', ''),
];

// matching: string ending with '/' => startsWith; other string => equality OR startsWith when it is a
// filename prefix (D01, D05); arrays are any-of.
export function matches(m, p) {
  if (Array.isArray(m)) return m.some((x) => matches(x, p));
  if (m instanceof RegExp) return m.test(p);
  if (m.endsWith('/')) return p.startsWith(m);
  return p === m || (m.endsWith('_') && p.startsWith(m)) || (m === 'packages/domain-harness-compiler/tsconfig' && p.startsWith(m));
}
```

</details>

## gen-inventory.mjs

Generates `PATH_CLASSIFICATION_INVENTORY.md`: matches every tracked file to exactly one group (exit non-zero on an unmatched file or an empty group), counts, builds the MIGRATE file map and the touch scan.

<details><summary>source</summary>

```js
// Generates docs/validation/v0.10.2/PATH_CLASSIFICATION_INVENTORY.md from `git ls-files` and groups.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, OUT, gitFiles, table, read } from './lib.mjs';
import { GROUPS, matches } from './groups.mjs';

const files = gitFiles();
const head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const byGroup = new Map(GROUPS.map((g) => [g.id, []]));
const orphans = [];
for (const f of files) {
  const g = GROUPS.find((x) => matches(x.m, f));
  if (!g) orphans.push(f); else byGroup.get(g.id).push(f);
}
if (orphans.length) { console.error('ORPHANS', orphans.slice(0, 20), orphans.length); process.exit(2); }
const emptyGroups = GROUPS.filter((g) => byGroup.get(g.id).length === 0).map((g) => g.id);
if (emptyGroups.length) { console.error('EMPTY GROUPS (definition matches no tracked file):', emptyGroups.join(' ')); process.exit(3); }

const total = files.length;
const sum = [...byGroup.values()].reduce((a, v) => a + v.length, 0);
if (sum !== total) throw new Error('coverage mismatch ' + sum + ' vs ' + total);

// ---- selected-path touch scan (text search; not an AST) ----
const TAGS = {
  SEL_BUILD: /v10build|v10meta|v10shadow|v10evidence|domain-harness-compiler\/v10/,
  SEL_PAYLOAD: /kernel-mechanism-v1|standard-sdk-v1|sfeature-[a-z-]+-v1|business-meta-feedback-v1|workflow-router|v10payload\//,
  SEL_HOST: /host-v8|@kaicreator\/domain-harness\/v8\/host/,
  LEGACY: /public-v[2-9]|legacy-v1|host-v9|recovery-v2|@kaicreator\/domain-harness\/(?:v2|v3|v4|v7|v9)\b|domain-harness-node|domain-harness-expo/,
  FRAGMENT: /durable-receipt-carrier/,
};
const scanRe = /\.(ts|mts|mjs|js|cjs|tsx)$/;
const scanRoots = [/^tests\//, /^packages\/[^/]+\/tests\//, /^examples\//, /^extensions\//];
const scan = new Map();
for (const g of GROUPS) {
  const rows = byGroup.get(g.id).filter((f) => scanRe.test(f) && scanRoots.some((r) => r.test(f)) && !f.includes('/dist/'));
  if (!rows.length) continue;
  const c = { files: 0, SEL_BUILD: 0, SEL_PAYLOAD: 0, SEL_HOST: 0, LEGACY: 0, FRAGMENT: 0, selAny: 0 };
  for (const f of rows) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    c.files++;
    let sel = false;
    for (const [k, re] of Object.entries(TAGS)) if (re.test(t)) { c[k]++; if (k.startsWith('SEL_')) sel = true; }
    if (sel) c.selAny++;
  }
  scan.set(g.id, c);
}

// ---- tables ----
const clsOrder = ['KEEP', 'MIGRATE', 'ARCHIVE', 'REMOVE', 'UNSELECTED_REFERENCE', 'LEGACY_REFERENCE'];
const clsRows = clsOrder.map((c) => {
  const gs = GROUPS.filter((g) => g.cls === c);
  const n = gs.reduce((a, g) => a + byGroup.get(g.id).length, 0);
  return [c, gs.length, n, (100 * n / total).toFixed(1) + '%'];
});

const groupRows = GROUPS.map((g) => [
  g.id,
  '`' + (Array.isArray(g.m) ? g.m.join('`, `') : g.m instanceof RegExp ? 'regex ' + g.m.source : g.m) + '`',
  byGroup.get(g.id).length,
  g.cls,
  g.target ? '`' + g.target + '`' : '-',
  g.owner,
  g.role,
  g.ev,
  g.note || '-',
]);

function fileTarget(g, f) {
  const base = path.posix.basename(f);
  if (g.id === 'C10') return 'domain-packages/kernel/basic/payload/' + base;
  if (g.id === 'C11') return 'domain-packages/standard/basic/payload/' + base;
  if (g.id === 'C12') { const m = /sfeature-([a-z-]+)-v1\.mjs$/.exec(base); return 'domain-packages/standard/features/' + m[1] + '/ (file name inside the package: NOT_VERIFIED)'; }
  if (g.id === 'C13') return 'examples/v010-meta-feedback/payload/' + base;
  if (g.id === 'C14') return 'tests/fixtures/k02-fragment/' + base;
  if (g.id === 'C15') return 'domain-packages/standard/basic/v09/' + base + (base.endsWith('.d.mts') ? ' (NOT_VERIFIED)' : '');
  if (g.id === 'C17') return 'tooling/build/ (copy; location inside NOT_VERIFIED): ' + base;
  if (g.id === 'X01') return f.replace('extensions/agent-improvement/packages/', 'domain-packages/standard/features/');
  if (g.id === 'X02') return 'packages/host-node/ (' + base + ' as `./ct02-invoker`)';
  return g.target + base;
}
const moveGroups = GROUPS.filter((g) => g.cls === 'MIGRATE' || g.id === 'C14' || g.id === 'C17');
const moveRows = [];
for (const g of moveGroups) for (const f of byGroup.get(g.id)) moveRows.push(['`' + f + '`', '`' + fileTarget(g, f) + '`', g.owner, g.id, g.cls === 'MIGRATE' ? 'MIGRATE' : g.cls + ' (' + (g.id === 'C17' ? 'copy' : 'relocate') + ')']);

const newPaths = [
  ['packages/contracts/', 'T07a (skeleton) then T00', 'new TS workspace; committed `dist`', 'L2 §1.1'],
  ['packages/microkernel/', 'T07a (skeleton) then T04 (T06 adds subscribe)', 'new TS workspace; committed `dist`', 'L2 §1.1, §3, §8'],
  ['packages/host-node/', 'T07a (skeleton) then T03 (T06 adds governed subscribe)', 'new TS workspace; committed `dist`; optional peer `better-sqlite3`', 'L2 §1.1'],
  ['tooling/build/', 'T07a (skeleton) then T05', 'new TS workspace (needs `tooling/*` glob); committed `dist`', 'L2 §1.1, §5'],
  ['domain-packages/kernel/basic/', 'T01 (move), T01k (append)', 'not a workspace; `.mjs`', 'L2 §1.1, §2'],
  ['domain-packages/standard/basic/', 'T01', 'not a workspace; `.mjs`', 'L2 §1.1'],
  ['domain-packages/standard/features/<f>/ (10)', 'T01', 'not workspaces; 6 payload features + 4 v0.10.1 packages', 'L2 §1.1'],
  ['domain-packages/kernel/extensions/', 'NOT CREATED', 'no K extension package exists outside fixtures', 'L2 §1.1'],
  ['examples/v010-meta-feedback/', 'T01', 'private; tests-only Business reference', 'L2 §1.1, §6'],
  ['examples/v0102-external-producer/', 'T09', 'out-of-workspace producer journey (#1309)', 'L2 §12 T09'],
  ['tests/fixtures/k02-fragment/', 'T11', 'test-only home of `durable-receipt-carrier-v1.mjs`', 'L2 §9'],
  ['packages/{contracts,microkernel,host-node}/tests/, tooling/build/tests/', 'T00, T04, T03, T05, T06', 'new scoped tests of the new packages', 'L2 §12'],
  ['tests/compiler/v0102-{import-direction,wire-literals,payload-parity,kernel-protocol,tarball-inventory}.test.ts', 'T00, T00, T01, T01k+T04, T07b', 'new root tests (see L2_NEGATIVE_BOUNDARY_MATRIX.md)', 'L2 §1.3, §2, §5, §9'],
];

const scanRows = GROUPS.filter((g) => scan.has(g.id)).map((g) => {
  const c = scan.get(g.id);
  return [g.id, '`' + (Array.isArray(g.m) ? g.m.join('`, `') : g.m instanceof RegExp ? 'regex ' + g.m.source : g.m) + '`', c.files, c.selAny, c.SEL_BUILD, c.SEL_PAYLOAD, c.SEL_HOST, c.LEGACY, c.FRAGMENT, g.cls];
});

const md = [];
md.push(`# DomainHarness v0.10.2 - Per-path classification inventory (T08a, #1302 / #1303)

**Status:** \`T08A_DOC_DELIVERABLE / SOURCE_INSPECTED_PLUS_STATIC_SCRIPT / NO_BUILD / NO_TESTS / NO_NPM\`. Companion of the frozen L2 design (\`docs/architecture/DomainHarness_v0.10.2_L2_DESIGN_CANDIDATE.md\`, blob \`68e7dbc591f4c0c694818ec574b8585f95239c8b\`). It adds the per-path table that the L2 design lists as an L2 gap assigned to T08a (L2 §13, rows #1301 "KEEP/MOVE/ISOLATE/REMOVE map" and #1302 "Path -> owner -> ... inventory"). It decides nothing: every fate below is taken from L2 §1.1, §5, §6, §7, §9, §12 or from INV facts, and where those are silent the row says so.
**Parent:** [#1300](https://github.com/kaicreator-mm/domain-harness/issues/1300); scope #1302, #1303. Abbreviations: \`INV\` = \`docs/validation/v0.10.2/L2_SOURCE_INVENTORY.md\`; \`L2\` = the design above; \`T..\` = L2 §12 task ids.

## 0. Pin, method, vocabulary, truth limits

| Item | Value |
| --- | --- |
| Worktree HEAD | \`${head}\` (branch \`task/dh-t08a-1322-sonnet\`) |
| Relation to the L2 fact pin | L2/INV facts are pinned at \`f49c2a5f9ad79809959d1c5b6f6d8542c8d06f44\`; \`git diff --stat f49c2a5f 91eb3b9a\` lists 4 files, all documents (L2 design, L2 freeze, INV, INV scripts). Source and test paths are therefore identical to the INV pin. |
| Tracked files classified | ${total} (\`git ls-files\`), matched by ${GROUPS.length} ordered path groups; first match wins; no file is unmatched and no group is empty (checked by the generator). |
| Generator | \`C:\\xDev\\kAiCreator\\_tmp\\dh-t08a-1322-sonnet\\gen-inventory.mjs\` with group table \`groups.mjs\`; both are reproduced in \`T08A_SCRIPTS.md\`. |
| Touch scan | Section 5 is a literal-substring scan of test/example/extension sources, not an AST import resolver; it is context for the test-tree rows, not a proof of reachability. |
| Not run | No build, typecheck, test, pack or install. Classification of subtrees that INV did not measure is marked \`NOT_VERIFIED\` in the Notes column. |

Classification vocabulary (the six values required by #1302/#1310):

| Value | Meaning in this document |
| --- | --- |
| KEEP | Stays at its path with unchanged role; the owner task may still edit content (config, tests, docs). |
| MIGRATE | Moves (\`git mv\` or split) to the Target column; a forwarding shim stays at the old TS path until T11 (L2 §12 strategy S'); payload \`.mjs\` cannot be shimmed and is path-flipped by T01. |
| ARCHIVE | Immutable provenance kept in place (index/pointer), or a test-only artifact relocated out of production (\`C14\`). Never edited for aesthetics (#1303). |
| REMOVE | Leaves the tracked tree or every ship set, only at the named task and after its condition. |
| UNSELECTED_REFERENCE | Retained, \`private\`, no selected importer (INV §2.1, §8); still carries regression/evidence tests; not exported after T07b. |
| LEGACY_REFERENCE | Legacy package/tree retained as a private reference with its regression suite (O5); no new package may import it. |

## 1. Summary by classification

${table(['Classification', 'Groups', 'Tracked files', 'Share'], clsRows)}

## 2. Per-path-group table

${table(['ID', 'Path group', 'Files', 'Classification', 'Target (MIGRATE / relocate)', 'Owner task', 'Role', 'Evidence', 'Notes'], groupRows)}

## 3. MIGRATE and relocate file map (every moved tracked file)

Generated from the groups marked MIGRATE plus \`C14\` (fragment relocation) and \`C17\` (parser copy). Target file names inside a package directory are L2-named only where the L2 table names them; everything else is marked.

${table(['Source file', 'Target', 'Owner task', 'Group', 'Fate'], moveRows)}

## 4. Target paths that are not tracked yet (created by tasks)

${table(['Target path', 'Created by', 'Shape', 'Authority'], newPaths)}

## 5. Selected-path touch scan of test, example and extension sources

Columns: files scanned (\`.ts/.mts/.mjs/.js\`), files naming any selected-path token (\`SEL\` = build or payload or host), then per token class. \`SEL_BUILD\` = \`v10build|v10meta|v10shadow|v10evidence|compiler/v10\`; \`SEL_PAYLOAD\` = payload module names or \`v10payload/\`; \`SEL_HOST\` = \`host-v8\` or \`@kaicreator/domain-harness/v8/host\`; \`LEGACY\` = \`public-v2..v9|legacy-v1|host-v9|recovery-v2\`, legacy subpath specifiers, node/expo package names; \`FRAGMENT\` = \`durable-receipt-carrier\`. A file may carry several tokens; \`host-v8\` includes the legacy barrel (INV §2.1), so \`SEL_HOST\` in legacy trees does not mean selected-path use.

${table(['Group', 'Path group', 'Files', 'SEL any', 'SEL_BUILD', 'SEL_PAYLOAD', 'SEL_HOST', 'LEGACY', 'FRAGMENT', 'Classification'], scanRows)}

## 6. Findings for the controller (facts found while classifying; nothing here changes the frozen L2)

| # | Finding | Evidence | Consequence |
| --- | --- | --- | --- |
| F1 | \`.gitignore\` ignores \`dist/\` and un-ignores only \`packages/domain-harness/dist/\` and \`packages/domain-harness-compiler/dist/\`; \`.gitattributes\` marks only those two \`-text\`. L2 §5 commits \`dist\` for the four new TS packages and untracks the two legacy dists, but no L2 §12 write set (T07a/T07b included) lists \`.gitignore\` or \`.gitattributes\`. | \`.gitignore\`, \`.gitattributes\` at the pin; L2 §5 "Committed dist (#299)", §12 T07a/T07b | Without an owner the new dists cannot be committed normally and the CI freshness guard would not see them. A DAG admission decision is needed (assign to T07a/T07b). Not fixed here (outside the write set). |
| F2 | \`examples/v08-domain-apps/\` is not just a pointer-README candidate: its three files are read by path by core v08-integration tests and \`v09-deployment-bootstrap.test.ts\`, and are byte-copied into the Tiny app (\`examples/v010-clean-consumer/PROVENANCE.md\`). L2 §7 states the contents were not inspected. | \`grep\` of \`examples/v08-domain-apps\` over \`packages/*/tests\`; PROVENANCE.md lines 11-12 | Classified LEGACY_REFERENCE with a "must not move or delete" note (group \`E05\`). |
| F3 | \`examples/v09-clean-consumer/\` is consumed by \`packages/domain-harness/tests/v09-external-consumer.test.ts\` and imports \`@kaicreator/domain-harness/v9\`, which T07b prunes. | file greps; INV §1.2 | T07b must relabel or retire that test; no L2 row names it (NOT_VERIFIED). |
| F4 | \`packages/domain-harness/scripts/copy-vendored-dist-assets.mjs\` serves only the legacy \`build\` script (host-v9 acorn copy). | file header | Follows the legacy dist; not in any L2 row (group \`A04\`). |
| F5 | The INV Appendix lists payload readers for \`v08-tf-oracle-fr02-fr07\` but not for \`v08-tf-oracle-fr05-fr08\`; group \`C23\` includes both by name prefix. | INV Appendix A.1 | T01 edit scope for the second file is NOT_VERIFIED. |
| F6 | \`v09/workflow-router.d.mts\` and \`v09/selected-abi.d.mts\` exist beside the \`.mjs\` files; L2 names only \`workflow-router.mjs\` as moving. | \`git ls-files\` | Whether the declaration file moves is NOT_VERIFIED. |

## 7. Truth limits

Per-group classification, not per-file, for the docs trees (292 files), the \`.agent\` tree (116 files) and the legacy core/compiler test trees; per-file reachability of legacy subtrees beyond INV §1.1/§2.1/§8 is \`NOT_VERIFIED\`. No fate here is a new decision: a reviewer may check each Evidence cell against L2/INV. The generator can be re-run on a later pin; a changed file count or an unmatched path is then reported by the script (exit non-zero).
`);
fs.writeFileSync(OUT + '/PATH_CLASSIFICATION_INVENTORY.md', md.join('\n'));
console.log('written; files', total, 'groups', GROUPS.length, 'moveRows', moveRows.length);
```

</details>

## check-docs.mjs

Checker for all T08a documents: table column consistency, `file:line` citations (prints the cited line for manual review), test-path existence, every `path :: token` evidence pair, `NEW:` paths named by L2, "absent" claims, crosswalk id coverage against the closure ledger, inventory file-count coverage.

<details><summary>source</summary>

```js
// Checker for the T08a documents: table shape, file:line citations, test-path existence, id coverage.
// Usage: node check-docs.mjs   (exit 0 = all checks pass; prints cited lines for manual review)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, OUT, gitFiles, exists, read } from './lib.mjs';

const DOCS = ['PATH_CLASSIFICATION_INVENTORY.md', 'L2_NEGATIVE_BOUNDARY_MATRIX.md', 'RETAINED_FUNCTION_SUCCESSOR_CROSSWALK.md', 'T08A_SCRIPTS.md'];
const files = gitFiles();
const byBase = new Map();
for (const f of files) { const b = path.posix.basename(f); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(f); }
const L2 = read('docs/architecture/DomainHarness_v0.10.2_L2_DESIGN_CANDIDATE.md');
const problems = [];
const log = [];

const splitRow = (line) => {
  const cells = []; let cur = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (line[i] === '|') { cells.push(cur); cur = ''; continue; }
    cur += line[i];
  }
  cells.push(cur);
  return cells.slice(1, -1); // drop the empty cells before the first and after the last pipe
};

for (const d of DOCS) {
  const p = OUT + '/' + d;
  if (!fs.existsSync(p)) { problems.push(`${d}: missing`); continue; }
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  let fence = false, tables = 0, rows = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) fence = !fence;
    if (fence || !lines[i].startsWith('|')) continue;
    // table block
    const start = i; const block = [];
    while (i < lines.length && lines[i].startsWith('|')) { block.push(lines[i]); i++; }
    i--; tables++;
    const n = splitRow(block[0]).length;
    if (!/^\|(\s*:?-{3,}:?\s*\|)+$/.test(block[1] ?? '')) problems.push(`${d}:${start + 2} second table line is not a separator`);
    block.forEach((l, k) => { rows++; const c = splitRow(l).length; if (c !== n) problems.push(`${d}:${start + 1 + k} has ${c} cells, header has ${n}`); });
  }
  log.push(`${d}: ${tables} tables, ${rows} table lines checked for column consistency`);
}

// ---- file:line citations (outside code fences) ----
const re = /([A-Za-z0-9_\-./]+\.(?:ts|mts|mjs|md|yaml|json)):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)/g;
for (const d of DOCS.filter((x) => x !== 'T08A_SCRIPTS.md')) {
  const lines = fs.readFileSync(OUT + '/' + d, 'utf8').split(/\r?\n/);
  let fence = false;
  lines.forEach((line, i) => {
    if (/^```/.test(line)) fence = !fence;
    if (fence) return;
    for (const m of line.matchAll(re)) {
      let f = m[1];
      if (f.startsWith('C/')) f = 'packages/domain-harness-compiler/src/qualified-package/' + f.slice(2);
      else if (f.startsWith('H/')) f = 'packages/domain-harness/src/' + f.slice(2);
      let cands = files.includes(f) ? [f] : (byBase.get(path.posix.basename(f)) ?? []).filter((x) => x.endsWith(f.split('/').slice(-2).join('/')) || !f.includes('/'));
      if (cands.length > 1) { const pref = cands.filter((x) => x.includes('/v10build/')); if (pref.length === 1) cands = pref; }
      if (cands.length > 1) { const pref = cands.filter((x) => x.includes('/payload/')); if (pref.length === 1) cands = pref; }
      if (cands.length !== 1) { problems.push(`${d}:${i + 1} ${m[0]} resolves to ${cands.length} files`); continue; }
      const src = read(cands[0]).split(/\r?\n/);
      for (const part of m[2].split(',')) {
        const [a, b] = part.split('-').map(Number); const hi = b ?? a;
        if (a < 1 || hi > src.length) { problems.push(`${d}:${i + 1} ${m[0]} line out of range (${src.length} lines)`); continue; }
        log.push(`CITE ${d}:${i + 1} ${path.posix.basename(cands[0])}:${part} | ${src[a - 1].trim().slice(0, 100)}${hi !== a ? ' ... ' + src[hi - 1].trim().slice(0, 60) : ''}`);
      }
    }
  });
}

// ---- test paths mentioned in backticks ----
const pathRe = /`((?:tests|packages|extensions|examples|docs|scripts|domain-packages|tooling)\/[A-Za-z0-9_\-./<>{}*,]+\.(?:ts|mts|mjs|js|json|md|yaml))`/g;
const helperPrefix = { 'core:': 'packages/domain-harness/tests/', 'compiler:': 'packages/domain-harness-compiler/tests/' };
for (const d of DOCS.filter((x) => x !== 'T08A_SCRIPTS.md')) {
  const lines = fs.readFileSync(OUT + '/' + d, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(pathRe)) {
      const f = m[1];
      if (/[<>{}*]/.test(f)) continue; // patterns / placeholders
      const before = line.slice(Math.max(0, m.index - 4), m.index);
      if (/NEW:$/.test(before) || /domain-packages\/|tooling\/build\/|packages\/(contracts|microkernel|host-node)\//.test(f) && !exists(f)) {
        if (exists(f) && /NEW:$/.test(before)) problems.push(`${d}:${i + 1} NEW: path already exists: ${f}`);
        continue;
      }
      if (f.startsWith('tests/fixtures/k02-fragment/') || f.startsWith('examples/v010-meta-feedback/') || f.startsWith('examples/v0102-external-producer/')) continue; // future targets
      if (/^docs\/validation\/v0\.10\.2\/(PATH_CLASSIFICATION_INVENTORY|L2_NEGATIVE_BOUNDARY_MATRIX|RETAINED_FUNCTION_SUCCESSOR_CROSSWALK|T08A_SCRIPTS)\.md$/.test(f)) continue;
      if (!exists(f)) problems.push(`${d}:${i + 1} path does not exist at the pin: ${f}`);
    }
    for (const m of line.matchAll(/`(core|compiler):([A-Za-z0-9_\-./]+)`/g)) {
      const f = helperPrefix[m[1] + ':'] + m[2];
      if (!exists(f)) problems.push(`${d}:${i + 1} abbreviated path does not exist: ${f}`);
    }
  });
}

// ---- crosswalk coverage ----
{
  const t = fs.readFileSync(OUT + '/RETAINED_FUNCTION_SUCCESSOR_CROSSWALK.md', 'utf8');
  const ids = ['FR01', 'FR02', 'FR03', 'FR04', 'FR05', 'FR06', 'FR07', 'FR08', 'FR09', 'FR10', 'FR11', 'FR12', 'FR13', 'FR14', 'FR15', 'HF16', 'HF17', 'HF18', 'HF19', 'HF20', 'HF21', 'HF22', 'HF23', 'HF24', 'HF25', 'HF26', 'HF27', 'HF28', 'HF29', 'HF30', 'HF31', 'HF32', 'HF33', 'HF34', 'NEW-FUNCTION-01', 'NEW-FUNCTION-02', 'NEW-FUNCTION-03', 'NEW-FUNCTION-04', 'FR08-P-SD1', 'FR08-N-SD1', 'FR08-N-SD2', 'FR08-P-SD2', 'NEW-FUNCTION-05', 'NEW-FUNCTION-06'];
  if (ids.length !== 44 || new Set(ids).size !== 44) problems.push('id list is not 44 unique ids');
  // ids must equal the closure ledger's row ids in order
  const ledger = read('docs/validation/v0.10/T01_CLOSURE_LEDGER.md').split(/\r?\n/).filter((l) => /^\| `[A-Z0-9-]+` \|/.test(l)).map((l) => /^\| `([A-Z0-9-]+)`/.exec(l)[1]);
  const ledgerRows = ledger.slice(0, 44);
  if (JSON.stringify(ledgerRows) !== JSON.stringify(ids)) problems.push('crosswalk ids differ from the closure ledger row order: ' + JSON.stringify(ledgerRows.filter((x, k) => x !== ids[k])));
  const sec = (a, b) => t.slice(t.indexOf(a), t.indexOf(b));
  const tA = sec('### 2.1', '### 2.2'), tB = sec('### 2.2', '### 2.3');
  for (const id of ids) {
    for (const [name, tb] of [['2.1', tA], ['2.2', tB]]) {
      const n = tb.split(/\r?\n/).filter((l) => l.startsWith('| ' + id + ' |')).length;
      if (n !== 1) problems.push(`crosswalk ${name}: id ${id} appears ${n} times`);
    }
  }
  for (const must of ['PD-02', 'PD-03', 'REQUIRED_MINIMAL_T06', 'OUT_OF_SCOPE_V0102', 'NOT_REQUIRED_FOR_V0102', 'durable-receipt-carrier-v1.mjs', 'k02-combined-splice-physical', 'rich-race', 'NOT_VERIFIED', 'v10shadow', 'v10evidence', 'V0101-CT02', 'V010-T09H']) if (!t.includes(must)) problems.push('crosswalk lacks mandatory term ' + must);
  log.push('crosswalk: 44 ids x 2 tables verified against the closure ledger row order');
}
// ---- inventory coverage ----
{
  const t = fs.readFileSync(OUT + '/PATH_CLASSIFICATION_INVENTORY.md', 'utf8');
  const m = /\| Tracked files classified \| (\d+) /.exec(t);
  const rows = t.slice(t.indexOf('## 2. Per-path-group table'), t.indexOf('## 3. MIGRATE')).split(/\r?\n/).filter((l) => /^\| [A-Z]\d\d /.test(l));
  const sum = rows.reduce((a, l) => a + Number(splitRow(l)[2]), 0);
  if (!m || Number(m[1]) !== files.length) problems.push(`inventory states ${m && m[1]} files, git has ${files.length}`);
  if (sum !== files.length) problems.push(`inventory group counts sum to ${sum}, git has ${files.length}`);
  log.push(`inventory: ${rows.length} groups, counts sum ${sum}, git ${files.length}`);
}
// ---- every `file` :: `token` pair in the documents (P/N evidence) must hold at the pin ----
{
  let n = 0;
  for (const d of DOCS.filter((x) => x !== 'T08A_SCRIPTS.md')) {
    const text = fs.readFileSync(OUT + '/' + d, 'utf8');
    for (const m of text.matchAll(/`([^`\n]+)` :: `([^`\n]+)`/g)) {
      const f = m[1], tok = m[2].replace(/\\\|/g, '|');
      n++;
      if (!exists(f)) problems.push(`${d}: evidence file missing: ${f}`);
      else if (!read(f).includes(tok)) problems.push(`${d}: token not found in ${f}: ${tok}`);
    }
    for (const m of text.matchAll(/NEW:`([^`\n]+)`/g)) {
      const base = m[1].split('/').pop();
      if (exists(m[1])) problems.push(`${d}: NEW: path exists: ${m[1]}`);
      if (!L2.includes(base)) problems.push(`${d}: NEW: path not named by the L2 design: ${m[1]}`);
    }
  }
  log.push(`evidence pairs verified: ${n}`);
}
// ---- "absent" claims: tokens the documents say no selected test/source contains ----
{
  const T = files.filter((f) => /^tests\/assembly\/(v010-|fixtures-v010\/)|^tests\/hosts\/node\/v010-|^tests\/compiler\/(v010-|v10build-composition)|^tests\/integration\/v010-clean-consumers\/|^tests\/conformance\/v0101-|^packages\/domain-harness\/tests\/v08-host\/k0[12]-combined/.test(f) && /\.(ts|mts|mjs|js)$/.test(f));
  const V = files.filter((f) => /^packages\/domain-harness-compiler\/src\/qualified-package\/v10(build|meta|shadow|evidence)\//.test(f));
  const P = files.filter((f) => /qualified-package\/payload\/(?!durable-receipt)/.test(f));
  const claims = [['payloadExpression', T], ['subscribe', V], ['ProcessCommand', [...T, ...V, ...P]], ['AUTHORITY_CLASS_FORBIDDEN', T], ['CAPABILITY_PROVIDER_AMBIGUOUS', T], ['RESOURCE_CURRENTNESS', T], ['currentnessPin', T], ['SEMANTIC_UNAVAILABLE', T], ['SDK_SEMANTIC_EVENT_UNDECLARED', T], ['SDK_SEMANTIC_RESULT_INVALID', T], ['SDK_SEMANTIC_PROMOTION_UNRESOLVED', T], ['DECISION_RECEIPT', T]];
  for (const [tok, scope] of claims) { const hits = scope.filter((f) => read(f).includes(tok)); if (hits.length) problems.push(`absent claim violated: "${tok}" occurs in ${hits.slice(0, 3).join(', ')}`); }
  log.push(`absent claims verified: ${claims.length} tokens over ${T.length} test files, ${V.length} v10 sources, ${P.length} payloads`);
}
// ---- write set: only new files under docs/validation/v0.10.2 ----
fs.writeFileSync(path.join('C:/xDev/kAiCreator/_tmp/dh-t08a-1322-sonnet', 'check-docs.log'), log.join('\n') + '\n');
if (problems.length) { console.error('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
console.log('check-docs OK;', log.filter((l) => !l.startsWith('CITE')).join(' | '), '| cites:', log.filter((l) => l.startsWith('CITE')).length);
```

</details>
