import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { RuntimeEvidenceRecord } from '@kaicreator/domain-harness';
import { NodeSqliteRuntimeEvidenceStore } from '../../src/store/node-sqlite-evidence-store.js';
import { openAuthorityTestDatabase } from './authority-test-helpers.js';

function evidenceRecord(evidenceId: string, marker: string): RuntimeEvidenceRecord {
  return {
    evidenceId,
    truthClass: 'runtime-evidence',
    executionAuthority: 'none',
    domainId: 'domain-a',
    sourceKind: 'decision',
    durability: 'durable-audit',
    provenance: {
      packageId: 'pkg-a',
      governanceBaseline: {
        domainId: 'domain-a',
        governanceId: 'gov-a',
        schemaVersion: '1',
        contentDigest: 'sha256:baseline-1',
      },
    },
    payload: { marker },
  };
}

test('T-022 evidence store: append-only semantics survive reopen on the real host', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-evidence-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteRuntimeEvidenceStore(first.db);
  const record = evidenceRecord('ev:domain-a:decision:turn-1:0', 'alpha');
  await store.append(record);
  await store.append(record); // idempotent same-content re-append
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteRuntimeEvidenceStore(second.db);
  assert.equal(reopened.records().length, 1);
  assert.deepEqual(reopened.records()[0], JSON.parse(JSON.stringify(record)));
  await reopened.append(record);
  await assert.rejects(
    () => reopened.append(evidenceRecord('ev:domain-a:decision:turn-1:0', 'beta')),
    (error: unknown) =>
      error instanceof Error &&
      error.name === 'RuntimeEvidenceIntegrationError' &&
      (error as { code?: string }).code === 'RUNTIME_EVIDENCE_APPEND_CONFLICT',
  );
  assert.equal(reopened.records().length, 1, 'conflict never overwrites');
  second.close();
});
