// Issue #308 / A2 I-005 focused conformance + negative tests for the DAC
// UX<->Runtime correlation bridge. Anchored to the frozen authority:
// PRD Amendment A2 G3, L2 Amendment A2 sections 6.4/6.5/8.5/8.6, DAC v0.0.2
// sections 1/9/11/12 and conformance cases C08/C09/C10.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_BRIDGE_ADAPTER_VERSION,
  DAC_BRIDGE_BASELINE,
  DAC_BRIDGE_ROLES,
  DacBridgeError,
  adoptDomainIntentRef,
  adoptSemanticTargetRef,
  commandRefFromDomainMessage,
  correlateDomainCommand,
  outcomeRefFromAcceptedAck,
  outcomeRefFromMessageDisposition,
  correlateDomainOutcome,
  viewRefFromQueryResult,
  snapshotRefFromBusinessSnapshot,
  snapshotRefFromProjectionSnapshot,
  snapshotRefFromWorkflowInstanceSnapshot,
  watchRefFromSubscription,
  watchRefFromObservedChange,
  classifyObservedBasis,
  resolvedObservedBasis,
  isCommandRef,
  isDomainCommandCorrelation,
  isDomainIntentRef,
  isDomainOutcomeCorrelation,
  isOutcomeRef,
  isSemanticTargetRef,
  isSnapshotRef,
  isViewRef,
  isWatchRef,
  isDacBridgeReference,
  getDacBridgeRole,
  expectCommandRef,
  expectOutcomeRef,
} from '../../src/dac-bridge/index.js';
import { isDacReference } from '../../src/dac/index.js';
import type {
  DomainChange,
  DomainSubscription,
} from '../../src/v2/contracts/subscription.js';
import type { DomainMessage } from '../../src/v2/contracts/message.js';
import type { MessageDispositionSnapshot } from '../../src/v2/contracts/message.js';
import type { ProjectionSnapshot } from '../../src/v2/contracts/projection.js';
import type { WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';

const baseline = { ...DAC_BRIDGE_BASELINE };

function assertBridgeErrorCode(fn: () => void, code: string, label: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacBridgeError, `${label}: expected DacBridgeError`);
  assert.equal((caught as DacBridgeError).code, code, `${label}: code ${code}`);
}

const address = { workflowId: 'billing', instanceKey: 'inv-42' };
const message: DomainMessage = {
  messageId: 'msg-1001',
  target: address,
  type: 'ApproveInvoice',
  payload: { amount: 42 },
  correlationId: 'corr-7',
  causationId: 'cause-3',
};

const instanceSnapshot: WorkflowInstanceSnapshot = {
  address,
  correlationId: 'corr-7',
  packageId: 'pkg-sha256:abc',
  lifecycle: 'active',
  stateRevision: 12,
  state: { status: 'draft' },
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
};

const projectionSnapshot: ProjectionSnapshot = {
  projectionId: 'invoice-summary',
  key: 'inv-42',
  packageId: 'pkg-sha256:abc',
  revision: 'rev-9',
  value: { total: 42 },
  workflowSources: [{ address, stateRevision: 12, state: { status: 'draft' } }],
  businessSources: [{ source: 'ledger', key: 'inv-42', revision: 'lrev-5' }],
};

const disposition: MessageDispositionSnapshot = {
  messageId: 'msg-1001',
  target: address,
  targetSequence: 4,
  packageId: 'pkg-sha256:abc',
  disposition: 'processed',
  correlationId: 'corr-7',
  acceptedAt: '2026-09-23T10:00:01.000Z',
  resolvedAt: '2026-09-23T10:00:02.000Z',
};

test('dac bridge: nominal adoption of UX intent and semantic target preserves provenance', () => {
  const target = adoptSemanticTargetRef({
    baseline,
    semanticIdentity: 'domain:billing:invoice-approval-button',
    authorityScope: 'dac://ux/acme-invoices',
    opaque: { region: 'eu' },
  });
  const intent = adoptDomainIntentRef({
    baseline,
    semanticIdentity: 'intent:approve-invoice',
    authorityScope: 'dac://ux/acme-invoices',
    semanticTarget: target,
    opaque: { actor: 'user-9' },
  });
  assert.equal(target.adapter, DAC_BRIDGE_ADAPTER_VERSION);
  assert.deepEqual(target.baseline, DAC_BRIDGE_BASELINE);
  assert.equal(intent.semanticIdentity, 'intent:approve-invoice');
  assert.equal(intent.semanticTarget, target);
  assert.ok(Object.isFrozen(target));
  assert.ok(Object.isFrozen(target.opaque));
  assert.ok(isSemanticTargetRef(target));
  assert.ok(isDomainIntentRef(intent));
  assert.ok(isDacBridgeReference(target));
  assert.equal(getDacBridgeRole(intent), 'domain-intent');
  // Opaque fields round-trip verbatim, never interpreted.
  assert.deepEqual(intent.opaque, { actor: 'user-9' });
  assert.deepEqual(target.opaque, { region: 'eu' });
  assert.deepEqual(
    [...DAC_BRIDGE_ROLES].sort(),
    ['command', 'domain-intent', 'outcome', 'semantic-target', 'snapshot', 'view', 'watch'].sort(),
  );
});

test('dac bridge: adoption fails closed on wrong baseline and invalid identity', () => {
  assertBridgeErrorCode(
    () =>
      adoptDomainIntentRef({
        baseline: { contract: 'other', version: 'v0.0.2', baselineCommit: 'x' },
        semanticIdentity: 'i',
        authorityScope: 's',
      }),
    'UNSUPPORTED_DAC_BASELINE',
    'wrong baseline',
  );
  assertBridgeErrorCode(
    () => adoptSemanticTargetRef({ baseline, semanticIdentity: '', authorityScope: 's' }),
    'INVALID_REFERENCE',
    'empty semantic identity',
  );
  assertBridgeErrorCode(
    () => adoptSemanticTargetRef({ baseline, semanticIdentity: 't', authorityScope: ' ' }),
    'INVALID_REFERENCE',
    'blank authority scope',
  );
});

test('dac bridge: intent basis correlation — snapshot-ref and exact revision forms', () => {
  const snapshotRef = snapshotRefFromWorkflowInstanceSnapshot(instanceSnapshot);
  const intent = adoptDomainIntentRef({
    baseline,
    semanticIdentity: 'intent:approve-invoice',
    authorityScope: 'dac://ux/acme-invoices',
    observedBasis: { kind: 'snapshot-ref', snapshotRef },
  });
  assert.equal(intent.observedBasis?.kind, 'snapshot-ref');
  const revisionIntent = adoptDomainIntentRef({
    baseline,
    semanticIdentity: 'intent:approve-invoice',
    authorityScope: 'dac://ux/acme-invoices',
    observedBasis: {
      kind: 'revision',
      sourceKind: 'workflow-instance',
      revision: '12',
      targetKey: 'billing/inv-42',
    },
  });
  assert.equal(revisionIntent.observedBasis?.kind, 'revision');
  // Forged snapshot bases and mutable alias revisions fail closed.
  assertBridgeErrorCode(
    () =>
      adoptDomainIntentRef({
        baseline,
        semanticIdentity: 'i',
        authorityScope: 's',
        observedBasis: { kind: 'snapshot-ref', snapshotRef: { role: 'snapshot' } as never },
      }),
    'INVALID_CORRELATION',
    'forged snapshot basis',
  );
  assertBridgeErrorCode(
    () =>
      adoptDomainIntentRef({
        baseline,
        semanticIdentity: 'i',
        authorityScope: 's',
        observedBasis: { kind: 'revision', sourceKind: 'workflow-instance', revision: 'latest' },
      }),
    'MUTABLE_ALIAS_REJECTED',
    'mutable alias basis',
  );
});

test('dac bridge: CommandRef adapts the existing DomainMessage identity without minting a second authority', () => {
  const command = commandRefFromDomainMessage(message);
  assert.equal(command.messageId, 'msg-1001');
  assert.deepEqual(command.target, address);
  assert.equal(command.correlationId, 'corr-7');
  assert.equal(command.causationId, 'cause-3');
  assert.ok(isCommandRef(command));
  assert.ok(Object.isFrozen(command));
  // Internal commands (no UX origin) adapt identically — no UX dependency.
  const internal = commandRefFromDomainMessage({
    messageId: 'msg-internal',
    target: address,
    type: 'Tick',
    payload: null,
  });
  assert.equal(internal.correlationId, undefined);
  assertBridgeErrorCode(
    () => commandRefFromDomainMessage({ ...message, messageId: '' }),
    'INVALID_REFERENCE',
    'empty messageId',
  );
  assertBridgeErrorCode(
    () => commandRefFromDomainMessage({ ...message, target: { workflowId: '', instanceKey: 'x' } }),
    'INVALID_REFERENCE',
    'invalid target',
  );
});

test('dac bridge: command correlation binds intent chain and fails closed on contradiction', () => {
  const target = adoptSemanticTargetRef({
    baseline,
    semanticIdentity: 'domain:billing:invoice-approval',
    authorityScope: 'dac://ux/acme-invoices',
  });
  const intent = adoptDomainIntentRef({
    baseline,
    semanticIdentity: 'intent:approve-invoice',
    authorityScope: 'dac://ux/acme-invoices',
    semanticTarget: target,
  });
  const correlation = correlateDomainCommand(message, { intent });
  assert.ok(isDomainCommandCorrelation(correlation));
  assert.equal(correlation.intent, intent);
  assert.equal(correlation.semanticTarget, undefined);

  // The same semantic target object passes through; a different adopted
  // target for the same command is a contradiction, never a silent preference.
  const ok = correlateDomainCommand(message, { intent, semanticTarget: target });
  assert.equal(ok.semanticTarget, target);
  const otherTarget = adoptSemanticTargetRef({
    baseline,
    semanticIdentity: 'domain:billing:other-button',
    authorityScope: 'dac://ux/acme-invoices',
  });
  assertBridgeErrorCode(
    () => correlateDomainCommand(message, { intent, semanticTarget: otherTarget }),
    'CORRELATION_CONFLICT',
    'conflicting semantic targets',
  );

  // Conflicting observed bases fail closed.
  const basedIntent = adoptDomainIntentRef({
    baseline,
    semanticIdentity: 'intent:x',
    authorityScope: 'dac://ux/a',
    observedBasis: { kind: 'revision', sourceKind: 'workflow-instance', revision: '12' },
  });
  assertBridgeErrorCode(
    () =>
      correlateDomainCommand(message, {
        intent: basedIntent,
        observedBasis: { kind: 'revision', sourceKind: 'workflow-instance', revision: '13' },
      }),
    'CORRELATION_CONFLICT',
    'conflicting observed bases',
  );
  // Forged intent correlation fails closed (C08: UX intent is typed input).
  assertBridgeErrorCode(
    () => correlateDomainCommand(message, { intent: { role: 'domain-intent' } as never }),
    'INVALID_CORRELATION',
    'forged intent',
  );
  // Basis-less internal command correlation stays valid.
  const plain = correlateDomainCommand(message);
  assert.ok(isDomainCommandCorrelation(plain));
  assert.equal(plain.intent, undefined);
  assert.equal(resolvedObservedBasis(plain), undefined);
});

test('dac bridge: OutcomeRef carries Runtime-logical truth and structurally cannot claim external outcomes', () => {
  const outcome = outcomeRefFromMessageDisposition(disposition);
  assert.equal(outcome.disposition, 'processed');
  assert.equal(outcome.messageId, 'msg-1001');
  assert.equal(outcome.outcomeScope, 'runtime-logical');
  assert.equal(outcome.externalAuthorityOutcome, 'not-claimed');
  assert.ok(isOutcomeRef(outcome));
  const ack = outcomeRefFromAcceptedAck({
    status: 'accepted',
    messageId: 'msg-1001',
    target: address,
    targetSequence: 4,
    packageId: 'pkg-sha256:abc',
    acceptedAt: '2026-09-23T10:00:01.000Z',
  });
  assert.equal(ack.disposition, 'accepted');
  assert.equal(ack.opaque.ackStatus, 'accepted');
  // failure detail is carried verbatim (effectId stays correlated ambiguity).
  const failed = outcomeRefFromMessageDisposition({
    ...disposition,
    disposition: 'failed',
    failure: { code: 'EFFECT_AMBIGUOUS', message: 'recovery required', effectId: 'eff-1' },
  });
  assert.equal(failed.failure?.effectId, 'eff-1');
  assert.equal(failed.externalAuthorityOutcome, 'not-claimed');
  assertBridgeErrorCode(
    () =>
      outcomeRefFromMessageDisposition({ ...disposition, disposition: 'committed' as never }),
    'INVALID_REFERENCE',
    'invalid disposition',
  );
});

test('dac bridge: outcome correlation resolves the same command only (causal chain integrity)', () => {
  const intent = adoptDomainIntentRef({
    baseline,
    semanticIdentity: 'intent:approve-invoice',
    authorityScope: 'dac://ux/acme-invoices',
  });
  const correlation = correlateDomainCommand(message, { intent });
  const bound = correlateDomainOutcome({ disposition, correlation });
  assert.ok(isDomainOutcomeCorrelation(bound));
  assert.equal(bound.command?.messageId, 'msg-1001');
  assert.equal(bound.intent, intent);
  // An outcome for a different command never binds into this chain.
  assertBridgeErrorCode(
    () =>
      correlateDomainOutcome({
        disposition: { ...disposition, messageId: 'msg-OTHER' },
        correlation,
      }),
    'CORRELATION_CONFLICT',
    'cross-command outcome binding',
  );
  assertBridgeErrorCode(
    () =>
      correlateDomainOutcome({
        disposition,
        ack: {
          status: 'accepted',
          messageId: 'msg-1001',
          target: address,
          targetSequence: 4,
          packageId: 'pkg-sha256:abc',
          acceptedAt: '2026-09-23T10:00:01.000Z',
        },
      }),
    'INVALID_CORRELATION',
    'both sources supplied',
  );
  assertBridgeErrorCode(
    () => correlateDomainOutcome({}),
    'INVALID_CORRELATION',
    'neither source supplied',
  );
  const ackOnly = correlateDomainOutcome({
    ack: {
      status: 'duplicate',
      messageId: 'msg-1001',
      target: address,
      targetSequence: 4,
      packageId: 'pkg-sha256:abc',
      acceptedAt: '2026-09-23T10:00:01.000Z',
    },
    correlation,
  });
  assert.equal(ackOnly.outcome.opaque.ackStatus, 'duplicate');
});

test('dac bridge: ViewRef/SnapshotRef/WatchRef adapters preserve renderer-independent identity + revisions', () => {
  // ViewRef over each query kind.
  const instanceView = viewRefFromQueryResult(
    { kind: 'instance', target: address },
    { kind: 'instance', value: instanceSnapshot },
  );
  assert.equal(instanceView.viewKind, 'instance');
  assert.ok(instanceView.valuePresent);
  assert.deepEqual(instanceView.target, address);
  const emptyInstanceView = viewRefFromQueryResult(
    { kind: 'instance', target: address },
    { kind: 'instance', value: null },
  );
  assert.ok(!emptyInstanceView.valuePresent);
  const dispositionView = viewRefFromQueryResult(
    { kind: 'message-disposition', target: address, messageId: 'msg-1001' },
    { kind: 'message-disposition', value: disposition },
  );
  assert.equal(dispositionView.messageId, 'msg-1001');
  const failureView = viewRefFromQueryResult(
    { kind: 'runtime-failure', target: address },
    { kind: 'runtime-failure', value: { code: 'X', message: 'y' } },
  );
  assert.ok(failureView.valuePresent);
  const pinsView = viewRefFromQueryResult({ kind: 'package-pins' }, { kind: 'package-pins', value: ['pkg-sha256:abc'] });
  assert.equal(pinsView.viewKind, 'package-pins');
  const projectionView = viewRefFromQueryResult(
    { kind: 'projection', projectionId: 'invoice-summary', key: 'inv-42' },
    { kind: 'projection', value: projectionSnapshot },
  );
  assert.equal(projectionView.revision, 'rev-9');
  assert.ok(isViewRef(projectionView));
  assertBridgeErrorCode(
    () =>
      viewRefFromQueryResult(
        { kind: 'projection', projectionId: 'other', key: 'inv-42' },
        { kind: 'projection', value: projectionSnapshot },
      ),
    'INVALID_CORRELATION',
    'projection view pairing',
  );

  // SnapshotRef over all three primitives — revision relationships preserved.
  const instanceBasis = snapshotRefFromWorkflowInstanceSnapshot(instanceSnapshot);
  assert.equal(instanceBasis.sourceKind, 'workflow-instance');
  assert.equal(instanceBasis.stateRevision, 12);
  const projectionBasis = snapshotRefFromProjectionSnapshot(projectionSnapshot);
  assert.equal(projectionBasis.sourceKind, 'projection');
  assert.ok(projectionBasis.sourceKind === 'projection');
  assert.equal(projectionBasis.revision, 'rev-9');
  assert.deepEqual(projectionBasis.workflowSources, [{ address, stateRevision: 12 }]);
  assert.deepEqual(projectionBasis.businessSources, [
    { source: 'ledger', key: 'inv-42', revision: 'lrev-5' },
  ]);
  const businessBasis = snapshotRefFromBusinessSnapshot({
    source: 'ledger',
    key: 'inv-42',
    revision: 'lrev-5',
    value: { total: 42 },
  });
  assert.equal(businessBasis.sourceKind, 'business');
  assert.ok(isSnapshotRef(businessBasis));
  // Mutable-alias projection revisions never become a basis.
  assertBridgeErrorCode(
    () =>
      snapshotRefFromProjectionSnapshot({ ...projectionSnapshot, revision: 'current' }),
    'MUTABLE_ALIAS_REJECTED',
    'mutable alias projection revision',
  );
  // Uniform fail-closed contract: business-source revisions too (review F1).
  assertBridgeErrorCode(
    () =>
      snapshotRefFromBusinessSnapshot({ source: 'ledger', key: 'inv-42', revision: 'latest', value: {} }),
    'MUTABLE_ALIAS_REJECTED',
    'mutable alias business revision',
  );

  // WatchRef over subscription + observed change.
  const watchSub: DomainSubscription = { kind: 'projection', projectionId: 'invoice-summary', key: 'inv-42' };
  const watch = watchRefFromSubscription(watchSub);
  assert.equal(watch.watchKind, 'projection');
  assert.equal(watch.observedRevision, undefined);
  const change: DomainChange = { kind: 'projection', revision: 'rev-10' };
  const observed = watchRefFromObservedChange(watchSub, change);
  assert.equal(observed.observedRevision, 'rev-10');
  assert.equal(observed.changeKind, 'projection');
  assert.ok(isWatchRef(observed));
  const instanceWatch = watchRefFromSubscription({ kind: 'instance', target: address });
  assert.deepEqual(instanceWatch.target, address);
  assertBridgeErrorCode(
    () => watchRefFromObservedChange(watchSub, { kind: 'instance', revision: 'r' }),
    'INVALID_CORRELATION',
    'foreign change kind',
  );
  assertBridgeErrorCode(
    () => watchRefFromObservedChange(watchSub, { kind: 'projection', revision: 'head' }),
    'MUTABLE_ALIAS_REJECTED',
    'mutable alias change revision',
  );
});

test('dac bridge: stale-basis classification implements the fail-safe matrix (C09/N10)', () => {
  const snapshotRef = snapshotRefFromWorkflowInstanceSnapshot(instanceSnapshot);
  const correlation = correlateDomainCommand(message, {
    observedBasis: { kind: 'snapshot-ref', snapshotRef },
  });
  // Matching basis -> CURRENT (proceed under Runtime rules).
  assert.deepEqual(
    classifyObservedBasis(correlation, { kind: 'workflow-instance', snapshot: instanceSnapshot }, { requireBasis: true }),
    { status: 'CURRENT' },
  );
  // Stale basis -> STALE with explicit rebase-review handling; never silent.
  const moved = { ...instanceSnapshot, stateRevision: 13 };
  const stale = classifyObservedBasis(
    correlation,
    { kind: 'workflow-instance', snapshot: moved },
    { requireBasis: true },
  );
  assert.equal(stale.status, 'STALE');
  if (stale.status === 'STALE') {
    assert.equal(stale.observedRevision, '12');
    assert.equal(stale.authoritativeRevision, '13');
    assert.equal(stale.requiredHandling, 'REJECT_OR_EXPLICIT_REBASE_REVIEW');
  }
  // Basis required but absent -> fail closed, never assume-current.
  assertBridgeErrorCode(
    () => classifyObservedBasis(undefined, { kind: 'workflow-instance', snapshot: instanceSnapshot }, { requireBasis: true }),
    'BASIS_REQUIRED',
    'required basis absent',
  );
  // Basis absent and not required -> NOT_OBSERVED (internal command path).
  assert.deepEqual(
    classifyObservedBasis(undefined, { kind: 'workflow-instance', snapshot: instanceSnapshot }, { requireBasis: false }),
    { status: 'NOT_OBSERVED' },
  );
  // Basis for another source kind / another target -> TARGET_MISMATCH, never reinterpretation.
  assertBridgeErrorCode(
    () => classifyObservedBasis(correlation, { kind: 'projection', snapshot: projectionSnapshot }, { requireBasis: true }),
    'TARGET_MISMATCH',
    'cross-kind basis',
  );
  assertBridgeErrorCode(
    () =>
      classifyObservedBasis(correlation, { kind: 'workflow-instance', snapshot: { ...instanceSnapshot, address: { workflowId: 'billing', instanceKey: 'OTHER' } } }, { requireBasis: true }),
    'TARGET_MISMATCH',
    'cross-target basis',
  );
  // Intent-carried basis satisfies correlatability (DAC section 9).
  const intentCorrelation = correlateDomainCommand(message, {
    intent: adoptDomainIntentRef({
      baseline,
      semanticIdentity: 'intent:approve-invoice',
      authorityScope: 'dac://ux/acme-invoices',
      observedBasis: {
        kind: 'revision',
        sourceKind: 'workflow-instance',
        revision: '12',
        targetKey: 'billing/inv-42',
      },
    }),
  });
  assert.deepEqual(
    classifyObservedBasis(intentCorrelation, { kind: 'workflow-instance', snapshot: instanceSnapshot }, { requireBasis: true }),
    { status: 'CURRENT' },
  );
  // Projection basis classification uses the projection revision string.
  const projectionBasis = snapshotRefFromProjectionSnapshot(projectionSnapshot);
  const projectionCorrelation = correlateDomainCommand(message, {
    observedBasis: { kind: 'snapshot-ref', snapshotRef: projectionBasis },
  });
  assert.deepEqual(
    classifyObservedBasis(projectionCorrelation, { kind: 'projection', snapshot: projectionSnapshot }, { requireBasis: true }),
    { status: 'CURRENT' },
  );
});

test('dac bridge: role inequalities — no guard accepts a foreign role, forged objects fail closed', () => {
  const command = commandRefFromDomainMessage(message);
  const outcome = outcomeRefFromMessageDisposition(disposition);
  const intent = adoptDomainIntentRef({ baseline, semanticIdentity: 'i', authorityScope: 's' });
  const snapshotRef = snapshotRefFromWorkflowInstanceSnapshot(instanceSnapshot);
  const view = viewRefFromQueryResult(
    { kind: 'package-pins' },
    { kind: 'package-pins', value: [] },
  );
  const watch = watchRefFromSubscription({ kind: 'instance', target: address });

  // intent != command (UX intent is never itself a Runtime command).
  assert.ok(!isCommandRef(intent));
  assert.ok(!isDomainIntentRef(command));
  // command != outcome.
  assert.ok(!isOutcomeRef(command));
  assert.ok(!isCommandRef(outcome));
  assert.throws(() => expectCommandRef(outcome), DacBridgeError);
  assert.throws(() => expectOutcomeRef(command), DacBridgeError);
  // view != snapshot != watch.
  assert.ok(!isSnapshotRef(view));
  assert.ok(!isViewRef(snapshotRef));
  assert.ok(!isWatchRef(snapshotRef));
  assert.ok(!isSnapshotRef(watch));

  // Structurally identical forged objects never pass (private registry).
  const forged = { ...command };
  assert.ok(!isCommandRef(forged));
  const forgedOutcome = { ...outcome };
  assert.ok(!isOutcomeRef(forgedOutcome));
  assert.ok(!isDomainCommandCorrelation({ command: forged }));
  assert.ok(!isDomainOutcomeCorrelation({ outcome: forgedOutcome }));

  // I-002 lifecycle refs and bridge refs are distinct authority categories.
  assert.ok(!isDacReference(command));
  assert.ok(!isDacReference(outcome));
});
