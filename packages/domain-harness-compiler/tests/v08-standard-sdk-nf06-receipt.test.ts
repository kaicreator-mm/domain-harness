/**
 * #1003 NF06 — the selected S decision-receipt projection unit level.
 *
 * The projection is a bounded, redacted, DATA-ONLY record: everything the
 * Kernel hands in that is NOT on the allowlist (input payloads, request
 * ids, credentials, model text, caller identity) can never enter the
 * record even when present in the verified material. These cases pin the
 * allowlist exactly and the typed refusals; the physical OBSERVATIONAL_
 * OPTIONAL append/restart/fault path lives in
 * packages/domain-harness/tests/v08-integration/nf06-decision-receipt-physical.test.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// @ts-expect-error selected standard-sdk payload has no declaration file (.mjs)
import * as sdk from '../src/qualified-package/payload/standard-sdk-v1.mjs';

function code(error: unknown): unknown {
  return typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
}

/** The exact verified material the Kernel derives on an admitted semantic turn. */
function verifiedMaterial() {
  return {
    turnId: 'turn:sd-quote:t1:sd-quote:sd-rc-1:message:m-rc-1',
    workflowInstanceId: 'sd-quote:t1:sd-quote:sd-rc-1',
    declaration: {
      ruleId: 'rule:sd-fixed-quote',
      declarationDigest: 'cec497dae01dddea7df015a3ecbfb71086095ecb462d714aa80acd8b93fdd986',
    },
    resolved: {
      source: 'harness-machine',
      structuredDecision: {
        decision: { outcome: 'approve', data: { amount: 30, requestId: 'SD-1' } },
        event: { type: 'SD_QUOTE_DECIDED', payload: { amount: 30, requestId: 'SD-1' } },
      },
      llmAvoided: true,
      modelCallEvidence: { status: 'measured', count: 0, scope: 'bound-model-port-invocations' },
      // Sensitive adjacency the allowlist must exclude (raw input payload,
      // caller identity, credential-shaped fields riding the resolution).
      input: { amount: 30, requestId: 'SD-1' },
      caller: { subject: 'req', credential: 'secret:must-not-enter' },
    },
    durability: 'observational-optional',
  };
}

test('NF06-P (unit): the S projection reduces the verified outcome to the exact redacted allowlist', () => {
  const record = sdk.projectDecisionReceiptRecord(verifiedMaterial()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(record).sort(), [
    'authority', 'decision', 'declaration', 'durability', 'event', 'eventType',
    'kind', 'llmAvoided', 'modelCallEvidence', 'source', 'turnId', 'workflowInstanceId',
  ]);
  assert.equal(record.kind, 'decision-receipt-record');
  assert.equal(record.eventType, 'DECISION_RECEIPT');
  assert.equal(record.turnId, 'turn:sd-quote:t1:sd-quote:sd-rc-1:message:m-rc-1');
  assert.deepEqual(record.declaration, {
    ruleId: 'rule:sd-fixed-quote',
    declarationDigest: 'cec497dae01dddea7df015a3ecbfb71086095ecb462d714aa80acd8b93fdd986',
  });
  assert.deepEqual(record.decision, { outcome: 'approve' });
  assert.deepEqual(record.event, { type: 'SD_QUOTE_DECIDED' });
  assert.equal(record.source, 'harness-machine');
  assert.equal(record.llmAvoided, true);
  assert.deepEqual(record.modelCallEvidence, { status: 'measured', count: 0, scope: 'bound-model-port-invocations' });
  assert.equal(record.durability, 'observational-optional');
  assert.equal(record.authority, 'data-only');
  // Redaction: the raw payload/ids/credentials riding the verified material
  // never enter the record.
  const serialized = JSON.stringify(record);
  assert.ok(!serialized.includes('SD-1'), 'requestId must not enter the receipt record');
  assert.ok(!serialized.includes('amount'), 'the raw amount payload must not enter the receipt record');
  assert.ok(!serialized.includes('secret:must-not-enter'), 'credential-shaped fields must not enter the receipt record');
  assert.ok(!serialized.includes('"subject"'), 'caller identity must not enter the receipt record');
});

test('NF06-N (unit): a durable-mandatory durability is never an S claim — typed refusal', () => {
  const material = verifiedMaterial();
  (material as { durability: string }).durability = 'durable-mandatory';
  assert.throws(
    () => sdk.projectDecisionReceiptRecord(material),
    (error: unknown) => code(error) === 'SDK_DECISION_RECEIPT_RECORD_INVALID',
  );
});

test('NF06-N (unit): a resolution without a resolved decision refuses typed', () => {
  const material = verifiedMaterial();
  delete (material.resolved as Record<string, unknown>).structuredDecision;
  assert.throws(
    () => sdk.projectDecisionReceiptRecord(material),
    (error: unknown) => code(error) === 'SDK_DECLARATION_INVALID' || code(error) === 'SDK_DECISION_RECEIPT_RECORD_INVALID',
  );
});

test('NF06-N (unit): malformed model-call evidence refuses typed (no invented attestation)', () => {
  const material = verifiedMaterial();
  (material.resolved as Record<string, unknown>).modelCallEvidence = { status: 'measured', count: 'zero' };
  assert.throws(
    () => sdk.projectDecisionReceiptRecord(material),
    (error: unknown) => code(error) === 'SDK_DECISION_RECEIPT_RECORD_INVALID',
  );
});

test('NF06-N (unit): a non-boolean llmAvoided truth refuses typed', () => {
  const material = verifiedMaterial();
  (material.resolved as Record<string, unknown>).llmAvoided = 'yes';
  assert.throws(
    () => sdk.projectDecisionReceiptRecord(material),
    (error: unknown) => code(error) === 'SDK_DECISION_RECEIPT_RECORD_INVALID',
  );
});
