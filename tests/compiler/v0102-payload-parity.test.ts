/**
 * v0.10.2 T01 (#1320) — payload parity after the Domain Package move.
 *
 * The sealed K/S/router/feature/Business payload bytes moved (`git mv`) out of
 * `packages/domain-harness-compiler/src/qualified-package/{payload,v09}` and
 * `extensions/agent-improvement/packages` into `domain-packages/**` and
 * `examples/v010-meta-feedback`. Every moved file must keep the exact git
 * blob id it had at the v0.10.2 pin 91eb3b9a (L2 section 1.1 / INV section 4),
 * and no moved source may remain at its old location. The blob id is
 * recomputed from the file bytes (sha1 of `blob <len>\0<bytes>`), so the test
 * needs no git binary.
 *
 * NOT asserted here: README.md / build-probe.mjs of the four v0.10.1 features
 * (their old-path text was rewritten on purpose) and the new package.json /
 * README.md files of the six payload features.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** [pre-move git blob id, new repo-relative path, old repo-relative path] */
const MOVED: ReadonlyArray<readonly [string, string, string]> = [
  ['72a886ffca85fc90caea954ee9fb5b3df7b4fcfa', 'domain-packages/kernel/basic/kernel-mechanism-v1.mjs', 'packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs'],
  ['9b86835bf12262ef53548e0031550fcecd97a7f2', 'domain-packages/standard/basic/standard-sdk-v1.mjs', 'packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs'],
  ['e23694d7076d7ca61cbe0522fc1f54d418b848cc', 'domain-packages/standard/basic/workflow-router.mjs', 'packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.mjs'],
  ['d7ef07f1a5f8b66f8d71b0b72ecf19ce7c7c36cc', 'domain-packages/standard/basic/workflow-router.d.mts', 'packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.d.mts'],
  ['c19881f99ee1d31af81fc99ed5c8519ff3b3eb5d', 'examples/v010-meta-feedback/business-meta-feedback-v1.mjs', 'packages/domain-harness-compiler/src/qualified-package/payload/business-meta-feedback-v1.mjs'],
  ['997e8675bc03fdda4aa5edcb5edeff55e025f123', 'domain-packages/standard/features/semantic-decision/modules/sfeature-semantic-decision-v1.mjs', 'packages/domain-harness-compiler/src/qualified-package/payload/sfeature-semantic-decision-v1.mjs'],
  ['a4a48d8cb2987e6fc6b67dfdc04a4d92f531fa77', 'domain-packages/standard/features/workflow-control/modules/sfeature-workflow-control-v1.mjs', 'packages/domain-harness-compiler/src/qualified-package/payload/sfeature-workflow-control-v1.mjs'],
  ['a5175ac24387ccf1749f34eea001f180e09f5238', 'domain-packages/standard/features/context-assembly/modules/sfeature-context-assembly-v1.mjs', 'packages/domain-harness-compiler/src/qualified-package/payload/sfeature-context-assembly-v1.mjs'],
  ['f41b8d5226a60f93b5fbd029c655d63fc856aa78', 'domain-packages/standard/features/decision-evidence/modules/sfeature-decision-evidence-v1.mjs', 'packages/domain-harness-compiler/src/qualified-package/payload/sfeature-decision-evidence-v1.mjs'],
  ['2801aada10c838e2e836dbb30dd97a79ebe56824', 'domain-packages/standard/features/candidate-validation/modules/sfeature-candidate-validation-v1.mjs', 'packages/domain-harness-compiler/src/qualified-package/payload/sfeature-candidate-validation-v1.mjs'],
  ['5d8758876d2f0c18097f5286756e80365dd042f2', 'domain-packages/standard/features/meta-feedback/modules/sfeature-meta-feedback-v1.mjs', 'packages/domain-harness-compiler/src/qualified-package/payload/sfeature-meta-feedback-v1.mjs'],
  ['21ebe2c2a93121a931c9e2c5d7bd0c5cd0581b88', 'domain-packages/standard/features/agent-diagnostics/feature-manifest.mjs', 'extensions/agent-improvement/packages/agent-diagnostics/feature-manifest.mjs'],
  ['fe272537b626984869c87df20afe695b9032568d', 'domain-packages/standard/features/agent-diagnostics/modules/sfeature-agent-diagnostics-v1.mjs', 'extensions/agent-improvement/packages/agent-diagnostics/modules/sfeature-agent-diagnostics-v1.mjs'],
  ['6d43c31a131a12651efe01984e772d475327a727', 'domain-packages/standard/features/agent-diagnostics/package.json', 'extensions/agent-improvement/packages/agent-diagnostics/package.json'],
  ['f9b3936703ac35fc5a6ed1977d9efe067a65e463', 'domain-packages/standard/features/agent-diagnostics/tests/agent-diagnostics.test.mjs', 'extensions/agent-improvement/packages/agent-diagnostics/tests/agent-diagnostics.test.mjs'],
  ['61bfeba014eb3e5abede38834945ec54bceeba61', 'domain-packages/standard/features/bounded-experiment/feature-manifest.mjs', 'extensions/agent-improvement/packages/bounded-experiment/feature-manifest.mjs'],
  ['91aa80f01f0c864cf899610b53e4112f493ee0d4', 'domain-packages/standard/features/bounded-experiment/modules/sfeature-bounded-experiment-v1.mjs', 'extensions/agent-improvement/packages/bounded-experiment/modules/sfeature-bounded-experiment-v1.mjs'],
  ['ee330aca5c670053333342a8d52221f1e78563b4', 'domain-packages/standard/features/bounded-experiment/package.json', 'extensions/agent-improvement/packages/bounded-experiment/package.json'],
  ['d0f1f46746eadb285772dca2c3f58d18e60d2205', 'domain-packages/standard/features/bounded-experiment/tests/bounded-experiment.test.mjs', 'extensions/agent-improvement/packages/bounded-experiment/tests/bounded-experiment.test.mjs'],
  ['4341a61c90c1de653aa21de0bd05f13f4df69c40', 'domain-packages/standard/features/candidate-evaluation/feature-manifest.mjs', 'extensions/agent-improvement/packages/candidate-evaluation/feature-manifest.mjs'],
  ['0fcbf5c6627f62ef03723bded82d3cb3fa1c81b3', 'domain-packages/standard/features/candidate-evaluation/modules/sfeature-candidate-evaluation-v1.mjs', 'extensions/agent-improvement/packages/candidate-evaluation/modules/sfeature-candidate-evaluation-v1.mjs'],
  ['3db201cf8517b415cfa0adcf30c51b4694db6f02', 'domain-packages/standard/features/candidate-evaluation/package.json', 'extensions/agent-improvement/packages/candidate-evaluation/package.json'],
  ['9b07715b7c59e772c035f0766e03086ae2de18b0', 'domain-packages/standard/features/candidate-evaluation/tests/candidate-evaluation.test.mjs', 'extensions/agent-improvement/packages/candidate-evaluation/tests/candidate-evaluation.test.mjs'],
  ['b9d808012ebf6123895143d18ecaa9a6da13d9f8', 'domain-packages/standard/features/experience-reuse/feature-manifest.mjs', 'extensions/agent-improvement/packages/experience-reuse/feature-manifest.mjs'],
  ['25b7d59142396df0e8dd5a039b9acf1234981222', 'domain-packages/standard/features/experience-reuse/modules/sfeature-experience-reuse-v1.mjs', 'extensions/agent-improvement/packages/experience-reuse/modules/sfeature-experience-reuse-v1.mjs'],
  ['c17f3443202eb33b2029ef85cd06f862b74c807a', 'domain-packages/standard/features/experience-reuse/package.json', 'extensions/agent-improvement/packages/experience-reuse/package.json'],
  ['639e9f0c6fa194520449e4ed2dac223c991ef63f', 'domain-packages/standard/features/experience-reuse/tests/experience-reuse.test.mjs', 'extensions/agent-improvement/packages/experience-reuse/tests/experience-reuse.test.mjs'],
];

/** The only payload source that intentionally stays in the compiler package (T11). */
const STAYING = 'packages/domain-harness-compiler/src/qualified-package/payload/durable-receipt-carrier-v1.mjs';

function gitBlobId(bytes: Buffer): string {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

test('v0.10.2 T01 payload parity: every moved file keeps its pre-move git blob id', () => {
  assert.equal(MOVED.length, 27);
  for (const [blobId, newPath, oldPath] of MOVED) {
    const actual = gitBlobId(readFileSync(join(REPO_ROOT, newPath)));
    assert.equal(actual, blobId, `${newPath} (moved from ${oldPath}) changed bytes`);
  }
});

test('v0.10.2 T01 payload parity: K, S and router blob ids match the L2 section 1.1 / INV record', () => {
  const byPath = new Map(MOVED.map(([blobId, newPath]) => [newPath, blobId]));
  assert.equal(byPath.get('domain-packages/kernel/basic/kernel-mechanism-v1.mjs'), '72a886ffca85fc90caea954ee9fb5b3df7b4fcfa');
  assert.ok(byPath.get('domain-packages/standard/basic/standard-sdk-v1.mjs')?.startsWith('9b86835b'));
  assert.ok(byPath.get('domain-packages/standard/basic/workflow-router.mjs')?.startsWith('e23694d7'));
  assert.ok(byPath.get('examples/v010-meta-feedback/business-meta-feedback-v1.mjs')?.startsWith('c19881f9'));
});

test('v0.10.2 T01 payload parity: no moved source remains at its old location; the carrier stays', () => {
  for (const [, , oldPath] of MOVED) {
    assert.equal(existsSync(join(REPO_ROOT, oldPath)), false, `${oldPath} must be removed by the move`);
  }
  assert.equal(existsSync(join(REPO_ROOT, STAYING)), true);
});
