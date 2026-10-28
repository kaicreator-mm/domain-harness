/** Typed Compiler error lineage and reviewed v0.10 known-code inventory. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { V10Error } from '@kaicreator/domain-harness-contracts';
import { V10_KNOWN_ERROR_CODES } from '@kaicreator/domain-harness-contracts';
import '../assembly/cjs-package-bridge.ts';
import { ShadowL4Error } from '../../packages/host-node/dist/index.js';
import { MetaFeedbackError } from '../../packages/host-node/dist/index.js';
import { DecisionEvidenceObserverError } from '../../packages/host-node/dist/index.js';

test('P-I1231: reviewed v0.10 known-code registry remains a sorted subset of current source literals', async () => {
  const path = new URL('../../docs/architecture/V010_TYPED_REFUSAL_LITERAL_CATALOG.json', import.meta.url);
  const catalog = JSON.parse(await readFile(path, 'utf8')) as { sourceFiles: Record<string, string[]> };
  const sourceCodes = new Set(Object.values(catalog.sourceFiles).flat());
  const registered = [...V10_KNOWN_ERROR_CODES];
  assert.ok(registered.length > 100, 'the bounded v0.10 known-code inventory must remain substantive');
  assert.deepEqual(registered, [...new Set(registered)].sort(), 'public known codes must be unique and sorted');
  assert.deepEqual(
    registered.filter((code) => !sourceCodes.has(code)),
    [],
    'every public v0.10 known code must remain observable in the source literal catalog',
  );
  // The catalog tracks new source literals across versions, including dynamic
  // reason suffixes; its superset is NOT the public v0.10 known-code contract.
});

test('P-I1231: compiler-owned Error subclasses preserve name, code, cause and detail', () => {
  const cause = new Error('origin');
  const shadow = new ShadowL4Error('SHADOW_TEST', 'shadow failed', { cause });
  const evidence = new DecisionEvidenceObserverError('EVIDENCE_TEST', 'observer failed', { cause });
  const meta = new MetaFeedbackError('META_TEST', 'meta failed', { round: 1 });
  for (const error of [shadow, evidence, meta]) {
    assert.ok(error instanceof V10Error, `${error.name} must share compiler typed error base`);
    assert.ok(error instanceof Error);
    assert.equal(typeof error.code, 'string');
  }
  assert.equal(shadow.name, 'ShadowL4Error');
  assert.equal(evidence.name, 'DecisionEvidenceObserverError');
  assert.equal(meta.name, 'MetaFeedbackError');
  assert.equal(shadow.cause, cause);
  assert.equal(evidence.cause, cause);
  assert.deepEqual(meta.detail, { round: 1 });
  assert.equal(Object.isFrozen(meta.detail), true);
});
