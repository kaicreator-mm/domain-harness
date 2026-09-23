// Issue #311 / A2 I-008 FINAL matrix — I-005 / #308 dac-bridge layer.
// Executes the deferred runtime halves: the C09/N10 stale-observed-basis
// classification (proceed / stale-reject-review / fail-closed, with no
// auto-proceed and no silent reinterpretation), the C33/N12 presentation-host
// boundary (no renderer/host/layout concept exists on this surface and none
// can become Runtime Host Binding identity) and the N11 alias-revision basis
// rejection.
//
// Test/doc-only: no product semantics changed, no DAC v0.0.3 V3 scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAC_BRIDGE_BASELINE,
  DacBridgeError,
  adoptDomainIntentRef,
  adoptSemanticTargetRef,
  classifyObservedBasis,
  commandRefFromDomainMessage,
  correlateDomainCommand,
  outcomeRefFromMessageDisposition,
  snapshotRefFromWorkflowInstanceSnapshot,
  validateObservedBasis,
  viewRefFromQueryResult,
  watchRefFromSubscription,
} from '../../src/dac-bridge/index.js';
import type {
  DomainMessage,
  MessageDispositionSnapshot,
} from '../../src/v2/contracts/message.js';
import type { WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';
import { assertErrorInstance, catchSync } from './final-matrix-fixtures.js';

const BRIDGE_BASELINE = { ...DAC_BRIDGE_BASELINE };

const WORKFLOW_ADDRESS = { workflowId: 'wf-invoice', instanceKey: 'inv-001' } as const;

function workflowSnapshot(stateRevision: number): WorkflowInstanceSnapshot {
  return {
    address: { ...WORKFLOW_ADDRESS },
    correlationId: 'corr-0001',
    packageId: 'fixture-sha256:pkg',
    lifecycle: 'active',
    stateRevision,
    state: null,
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
  };
}

const DOMAIN_MESSAGE: DomainMessage = {
  messageId: 'msg-0001',
  target: { ...WORKFLOW_ADDRESS },
  type: 'approve-invoice',
  payload: null,
  correlationId: 'corr-0001',
};

// ------------------------------------------------ C09 / N10 (stale basis)

test('final C09/N10 runtime half: observed-basis classification is fail-safe and never auto-proceeds', () => {
  // CURRENT: exact revision equality proceeds under Runtime rules.
  const current = classifyObservedBasis(
    { observedBasis: { kind: 'revision', sourceKind: 'workflow-instance', revision: '7' } },
    { kind: 'revision', sourceKind: 'workflow-instance', revision: '7' },
    { requireBasis: true },
  );
  assert.deepEqual(current, { status: 'CURRENT' });

  // STALE: the authoritative revision moved; the classifier reports and
  // requires REJECT_OR_EXPLICIT_REBASE_REVIEW — it never decides to proceed,
  // rebase or reject on its own.
  const stale = classifyObservedBasis(
    { observedBasis: { kind: 'revision', sourceKind: 'workflow-instance', revision: '7' } },
    { kind: 'revision', sourceKind: 'workflow-instance', revision: '9' },
    { requireBasis: true },
  );
  assert.equal(stale.status, 'STALE');
  if (stale.status !== 'STALE') throw new Error('unreachable');
  assert.equal(stale.observedRevision, '7');
  assert.equal(stale.authoritativeRevision, '9');
  assert.equal(stale.requiredHandling, 'REJECT_OR_EXPLICIT_REBASE_REVIEW');

  // BASIS_REQUIRED: stale-semantics operations with no basis fail closed —
  // never "assume current".
  const basisRequired = catchSync(() =>
    classifyObservedBasis(undefined, { kind: 'revision', sourceKind: 'workflow-instance', revision: '9' }, {
      requireBasis: true,
    }),
  );
  assertErrorInstance(basisRequired, DacBridgeError, 'BASIS_REQUIRED', 'absent basis');

  // NOT_OBSERVED: only when the caller did not require a basis.
  const notObserved = classifyObservedBasis(undefined, {
    kind: 'revision',
    sourceKind: 'workflow-instance',
    revision: '9',
  }, { requireBasis: false });
  assert.deepEqual(notObserved, { status: 'NOT_OBSERVED' });
});

test('final C09/N10: a stale basis never silently reinterprets to another source kind or target', () => {
  // Different source kind: classification refuses (a workflow-instance basis
  // is never read as a projection basis).
  assertErrorInstance(
    catchSync(() =>
      classifyObservedBasis(
        { observedBasis: { kind: 'revision', sourceKind: 'workflow-instance', revision: '7' } },
        { kind: 'revision', sourceKind: 'projection', revision: '7' },
        { requireBasis: true },
      ),
    ),
    DacBridgeError,
    'TARGET_MISMATCH',
    'source-kind reinterpretation',
  );

  // Different target key: an observation of instance A is never read as the
  // basis for instance B.
  assertErrorInstance(
    catchSync(() =>
      classifyObservedBasis(
        {
          observedBasis: {
            kind: 'revision',
            sourceKind: 'workflow-instance',
            revision: '7',
            targetKey: 'wf-invoice/inv-001',
          },
        },
        { kind: 'revision', sourceKind: 'workflow-instance', revision: '7', targetKey: 'wf-invoice/inv-999' },
        { requireBasis: true },
      ),
    ),
    DacBridgeError,
    'TARGET_MISMATCH',
    'target reinterpretation',
  );

  // A bridge-minted SnapshotRef basis works end to end against the same
  // authoritative snapshot (CURRENT), and drifts to STALE exactly like the
  // literal form — preserved, never erased.
  const snapshotRef = snapshotRefFromWorkflowInstanceSnapshot(workflowSnapshot(7));
  const fromRef = classifyObservedBasis(
    { observedBasis: { kind: 'snapshot-ref', snapshotRef } },
    { kind: 'workflow-instance', snapshot: workflowSnapshot(7) },
    { requireBasis: true },
  );
  assert.deepEqual(fromRef, { status: 'CURRENT' });
  const staleFromRef = classifyObservedBasis(
    { observedBasis: { kind: 'snapshot-ref', snapshotRef } },
    { kind: 'workflow-instance', snapshot: workflowSnapshot(8) },
    { requireBasis: true },
  );
  assert.equal(staleFromRef.status, 'STALE');
});

// ------------------------------------------------ N11 (alias basis rejection)

test('final N11/C02: an alias revision can never prove an exact observation basis', () => {
  for (const alias of ['latest', 'current', 'head'] as const) {
    assertErrorInstance(
      catchSync(() =>
        validateObservedBasis(
          { kind: 'revision', sourceKind: 'workflow-instance', revision: alias },
          'observedBasis',
        ),
      ),
      DacBridgeError,
      'MUTABLE_ALIAS_REJECTED',
      `alias basis "${alias}"`,
    );
    // Adoption of an intent carrying the aliased basis fails closed too.
    assertErrorInstance(
      catchSync(() =>
        adoptDomainIntentRef({
          baseline: BRIDGE_BASELINE,
          semanticIdentity: 'ux:approve-invoice',
          authorityScope: 'ux://acme/invoice-ops',
          observedBasis: { kind: 'revision', sourceKind: 'workflow-instance', revision: alias },
        }),
      ),
      DacBridgeError,
      'MUTABLE_ALIAS_REJECTED',
      `intent adoption with alias basis "${alias}"`,
    );
  }
});

// ------------------------------------------- C33 / N12 (presentation host)

test('final C33/N12: no bridge reference carries presentation-host identity — none can become Runtime Host Binding identity', () => {
  const target = adoptSemanticTargetRef({
    baseline: BRIDGE_BASELINE,
    semanticIdentity: 'ux:invoice-approval-card',
    authorityScope: 'ux://acme/invoice-ops',
  });
  const intent = adoptDomainIntentRef({
    baseline: BRIDGE_BASELINE,
    semanticIdentity: 'ux:approve-invoice',
    authorityScope: 'ux://acme/invoice-ops',
    semanticTarget: target,
  });
  const command = commandRefFromDomainMessage(DOMAIN_MESSAGE);
  const correlation = correlateDomainCommand(DOMAIN_MESSAGE, { intent });
  const disposition: MessageDispositionSnapshot = {
    messageId: 'msg-0001',
    target: { ...WORKFLOW_ADDRESS },
    targetSequence: 3,
    packageId: 'fixture-sha256:pkg',
    disposition: 'processed',
    correlationId: 'corr-0001',
    acceptedAt: '2026-09-24T00:00:00.000Z',
    resolvedAt: '2026-09-24T00:00:01.000Z',
  };
  const outcome = outcomeRefFromMessageDisposition(disposition);
  const view = viewRefFromQueryResult(
    { kind: 'instance', target: { ...WORKFLOW_ADDRESS } },
    { kind: 'instance', value: workflowSnapshot(7) },
  );
  const snapshotRef = snapshotRefFromWorkflowInstanceSnapshot(workflowSnapshot(7));
  const watch = watchRefFromSubscription({ kind: 'instance', target: { ...WORKFLOW_ADDRESS } });

  // The presentation/host vocabulary has no nominal slot on any of the seven
  // bridge roles: recursive key scan over every minted reference.
  const HOSTISH = /host|presenter|presentation|renderer|render|component|widget|layout|window|document|dom|canvas|screen|browser|device|viewport/iu;
  const seen = new Set<unknown>();
  const scan = (value: unknown, path: string): void => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (HOSTISH.test(key)) {
        throw new Error(`presentation-host-shaped field "${key}" leaked into bridge reference at ${path}`);
      }
      scan(nested, `${path}.${key}`);
    }
  };
  for (const [name, ref] of [
    ['semantic-target', target],
    ['domain-intent', intent],
    ['command', command],
    ['command-correlation', correlation],
    ['outcome', outcome],
    ['view', view],
    ['snapshot', snapshotRef],
    ['watch', watch],
  ] as const) {
    scan(ref, name);
  }

  // A host-authored presentation object is not a semantic-target/intent
  // anchor: forged references fail closed at adoption/correlation.
  const presentationHostObject = {
    role: 'semantic-target',
    adapter: 'dac-bridge-adapter/1',
    baseline: DAC_BRIDGE_BASELINE,
    semanticIdentity: 'ux:invoice-card',
    authorityScope: 'ux://acme/invoice-ops',
    hostBinding: { presenter: 'react-web', windowId: 42, componentInstanceId: 'cmp-1' },
  };
  assertErrorInstance(
    catchSync(() =>
      correlateDomainCommand(DOMAIN_MESSAGE, { intent: presentationHostObject as never }),
    ),
    DacBridgeError,
    'INVALID_CORRELATION',
    'presentation-host object as intent',
  );

  // Command authority is only ever derived from an actual DomainMessage — the
  // single constructor admits no host-supplied command identity.
  assert.equal(command.messageId, 'msg-0001');
  assert.deepEqual(command.target, { ...WORKFLOW_ADDRESS });
});

// ------------------------------- Outcome claim ceiling (C11 bridge half)

test('final C11 (bridge half): a Runtime disposition outcome never claims external business truth', () => {
  const disposition: MessageDispositionSnapshot = {
    messageId: 'msg-0001',
    target: { ...WORKFLOW_ADDRESS },
    targetSequence: 3,
    packageId: 'fixture-sha256:pkg',
    disposition: 'processed',
    correlationId: 'corr-0001',
    acceptedAt: '2026-09-24T00:00:00.000Z',
    resolvedAt: '2026-09-24T00:00:01.000Z',
  };
  const outcome = outcomeRefFromMessageDisposition(disposition);
  assert.equal(outcome.outcomeScope, 'runtime-logical');
  assert.equal(outcome.externalAuthorityOutcome, 'not-claimed');
  // "processed" means the Runtime processed the message — nothing more.
  assert.equal(outcome.disposition, 'processed');
});
