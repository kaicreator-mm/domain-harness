import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RuntimeEvidenceContractError,
  assertRuntimeEvidenceUsable,
  assertValidRuntimeEvidenceRecord,
  type RuntimeEvidenceGovernanceBaselineRef,
  type RuntimeEvidencePort,
  type RuntimeEvidenceRecord,
} from '../../src/contracts/runtime-evidence.js';

const governanceBaseline: RuntimeEvidenceGovernanceBaselineRef = {
  domainId: 'orders',
  governanceId: 'orders-governance',
  schemaVersion: '1',
  contentDigest: 'sha256:governance-b1',
};

function evidenceRecord(
  overrides: Partial<RuntimeEvidenceRecord> = {},
): RuntimeEvidenceRecord {
  return {
    evidenceId: 'evidence-001',
    truthClass: 'runtime-evidence',
    executionAuthority: 'none',
    domainId: 'orders',
    tenantScope: 'tenant-a',
    sourceKind: 'decision',
    durability: 'durable-audit',
    provenance: {
      packageId: 'pkg-orders-p1',
      governanceBaseline,
      sourceExecution: {
        workflowTarget: 'order-review',
        workflowInstanceId: 'wf-001',
        durableControlTurnId: 'turn-007',
        decisionTraceRef: 'trace-003',
        executionFactRefs: ['ai-result:4', 'query-result:9'],
      },
      producerArtifact: {
        kind: 'decision-procedure',
        artifactId: 'fraud-review',
        contentDigest: 'sha256:producer-a1',
      },
    },
    subjectArtifact: {
      kind: 'workflow',
      artifactId: 'order-review',
      contentDigest: 'sha256:workflow-w1',
    },
    payload: {
      outcome: 'manual-review',
      confidenceBucket: 'medium',
    },
    ...overrides,
  };
}

function hasCode(code: RuntimeEvidenceContractError['code']): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof RuntimeEvidenceContractError && error.code === code;
}

test('T-005: valid Runtime Evidence preserves exact provenance without becoming replay truth', () => {
  const record = evidenceRecord();

  assert.doesNotThrow(() => assertValidRuntimeEvidenceRecord(record));
  assert.equal(record.truthClass, 'runtime-evidence');
  assert.equal(record.executionAuthority, 'none');
  assert.equal(record.provenance.packageId, 'pkg-orders-p1');
  assert.deepEqual(record.provenance.governanceBaseline, governanceBaseline);
});

test('T-005: Runtime Evidence cannot claim committed-work/replay authority', () => {
  const invalid = {
    ...evidenceRecord(),
    executionAuthority: 'committed-effect',
  } as unknown as RuntimeEvidenceRecord;

  assert.throws(
    () => assertValidRuntimeEvidenceRecord(invalid),
    hasCode('RUNTIME_EVIDENCE_NOT_EXECUTION_TRUTH'),
  );

  const wrongTruthClass = {
    ...evidenceRecord(),
    truthClass: 'execution-journal',
  } as unknown as RuntimeEvidenceRecord;

  assert.throws(
    () => assertValidRuntimeEvidenceRecord(wrongTruthClass),
    hasCode('RUNTIME_EVIDENCE_NOT_EXECUTION_TRUTH'),
  );
});

test('T-005: governance-critical use fails closed without exact expected provenance', () => {
  const record = evidenceRecord();

  assert.throws(
    () =>
      assertRuntimeEvidenceUsable(record, {
        target: { domainId: 'orders', tenantScope: 'tenant-a' },
        governanceCritical: true,
      }),
    hasCode('RUNTIME_EVIDENCE_PROVENANCE_REQUIRED'),
  );

  assert.doesNotThrow(() =>
    assertRuntimeEvidenceUsable(record, {
      target: { domainId: 'orders', tenantScope: 'tenant-a' },
      governanceCritical: true,
      requireDurableAudit: true,
      expectedPackageId: 'pkg-orders-p1',
      expectedGovernanceBaseline: governanceBaseline,
      expectedSubjectArtifact: {
        kind: 'workflow',
        artifactId: 'order-review',
        contentDigest: 'sha256:workflow-w1',
      },
    }),
  );
});

test('T-005: package/governance/artifact provenance mismatches fail closed', () => {
  const record = evidenceRecord();
  const target = { domainId: 'orders', tenantScope: 'tenant-a' } as const;

  assert.throws(
    () =>
      assertRuntimeEvidenceUsable(record, {
        target,
        governanceCritical: true,
        expectedPackageId: 'pkg-orders-p2',
        expectedGovernanceBaseline: governanceBaseline,
      }),
    hasCode('RUNTIME_EVIDENCE_PROVENANCE_MISMATCH'),
  );

  assert.throws(
    () =>
      assertRuntimeEvidenceUsable(record, {
        target,
        governanceCritical: true,
        expectedPackageId: 'pkg-orders-p1',
        expectedGovernanceBaseline: {
          ...governanceBaseline,
          contentDigest: 'sha256:governance-b2',
        },
      }),
    hasCode('RUNTIME_EVIDENCE_PROVENANCE_MISMATCH'),
  );

  assert.throws(
    () =>
      assertRuntimeEvidenceUsable(record, {
        target,
        expectedSubjectArtifact: {
          kind: 'workflow',
          artifactId: 'order-review',
          contentDigest: 'sha256:workflow-w2',
        },
      }),
    hasCode('RUNTIME_EVIDENCE_PROVENANCE_MISMATCH'),
  );
});

test('T-005: cross-tenant/domain evidence use is rejected without an exact external contract', () => {
  const record = evidenceRecord();
  const target = { domainId: 'orders', tenantScope: 'tenant-b' } as const;

  assert.throws(
    () => assertRuntimeEvidenceUsable(record, { target }),
    hasCode('RUNTIME_EVIDENCE_CROSS_SCOPE_FORBIDDEN'),
  );

  assert.doesNotThrow(() =>
    assertRuntimeEvidenceUsable(record, {
      target,
      externalScopeContract: {
        contractId: 'privacy-contract-17',
        source: { domainId: 'orders', tenantScope: 'tenant-a' },
        target,
      },
    }),
  );

  assert.throws(
    () =>
      assertRuntimeEvidenceUsable(record, {
        target,
        externalScopeContract: {
          contractId: 'privacy-contract-wrong-source',
          source: { domainId: 'orders', tenantScope: 'tenant-c' },
          target,
        },
      }),
    hasCode('RUNTIME_EVIDENCE_CROSS_SCOPE_FORBIDDEN'),
  );
});

test('T-005: derived-ephemeral loss is outside correctness and cannot satisfy durable-audit policy', () => {
  const record = evidenceRecord({
    evidenceId: 'evidence-ephemeral-1',
    durability: 'derived-ephemeral',
    sourceKind: 'metric',
  });

  assert.doesNotThrow(() =>
    assertRuntimeEvidenceUsable(record, {
      target: { domainId: 'orders', tenantScope: 'tenant-a' },
    }),
  );

  assert.throws(
    () =>
      assertRuntimeEvidenceUsable(record, {
        target: { domainId: 'orders', tenantScope: 'tenant-a' },
        requireDurableAudit: true,
      }),
    hasCode('RUNTIME_EVIDENCE_DURABILITY_MISMATCH'),
  );

  assert.equal(record.executionAuthority, 'none');
});

test('T-005: provenance rejects malformed source refs and wrong-domain Governance Baselines', () => {
  const malformedSource = evidenceRecord({
    provenance: {
      packageId: 'pkg-orders-p1',
      governanceBaseline,
      sourceExecution: {
        executionFactRefs: [''],
      },
    },
  });

  assert.throws(
    () => assertValidRuntimeEvidenceRecord(malformedSource),
    hasCode('INVALID_RUNTIME_EVIDENCE'),
  );

  const wrongDomain = evidenceRecord({
    provenance: {
      packageId: 'pkg-orders-p1',
      governanceBaseline: {
        ...governanceBaseline,
        domainId: 'billing',
      },
    },
  });

  assert.throws(
    () => assertValidRuntimeEvidenceRecord(wrongDomain),
    hasCode('RUNTIME_EVIDENCE_PROVENANCE_MISMATCH'),
  );
});

test('T-005: runtime evidence port is an append-only runtime seam', async () => {
  const written: RuntimeEvidenceRecord[] = [];
  const port: RuntimeEvidencePort = {
    async append(record: RuntimeEvidenceRecord): Promise<void> {
      assertValidRuntimeEvidenceRecord(record);
      written.push(record);
    },
  };

  await port.append(evidenceRecord());
  assert.equal(written.length, 1);
  assert.equal(written[0]?.evidenceId, 'evidence-001');
});
