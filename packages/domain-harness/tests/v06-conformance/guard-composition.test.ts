// v0.6 T007 (issue #585, frozen L2 C5): guard composition conformance —
// scenarios 2, 3, 4 and 9 of the 14 mandatory #585 scenarios. The T002 A8
// accepted-message collision boundary and the T003 A9 processed-command
// revision guard are composed INTO the end-to-end seam journey (A8 accept →
// processing mark → resolveAndAdmitTurn → T006 receipt → A9-guarded commit),
// plus the A7 unsupported-capability fail-closed composition at BOTH
// activation and seam binding. Every guard runs through the EXISTING portable
// product contracts — no guard is weakened and no second authority exists.
//
//  #585-2  A8 composed: compatible duplicate replay replays without
//          duplicate effect/decision (existing durable facts applied)
//  #585-3  A8 composed: incompatible same-messageId collision fails closed
//          before durable mutation through the journey
//  #585-4  A9 composed: invalid revision pair rejected without partial commit
//  #585-9  unsupported semantic-decision capability fails closed at BOTH
//          activation and seam binding (A7) — never ignored
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProcessedCommandTurnCommit } from '../../src/contracts/process-command.js';
import { ProcessCommandContractError } from '../../src/contracts/process-command.js';
import {
  AcceptedMessageIdentityCollisionError,
} from '../../src/v2/index.js';
import { DomainRuntimeV3Error } from '../../src/runtime/runtime-v3-errors.js';
import { PackageActivationError } from '../../src/package/errors.js';
import { VolatileHarnessExecutionJournalStore } from '../../src/harness/execution-journal.js';
import {
  createXStateHarnessMachineRunner,
} from '../../src/decision-resolver/index.js';
import { ScriptedModel, finalResponse } from '../decision-resolver/helpers.js';
import {
  CapturingRule,
  NON_SEMANTIC_HOST_CAPABILITIES,
  conformanceFixture,
  commandMessage,
  harnessMaterial,
  openAndPinInstance,
  processCommandTurn,
  quoteDecisionDescriptor,
  readReceiptRecords,
  resolverFixture,
  target,
  turnRequest,
} from './fixtures.js';

/* ------------------------------------------------------------------------ */
/* #585-2 — A8 composed: compatible duplicate replay                         */
/* ------------------------------------------------------------------------ */

test('#585-2: a compatible duplicate replay across the seam journey replays without duplicate effect or decision — existing durable facts applied', async () => {
  const fixture = await conformanceFixture([await quoteDecisionDescriptor()]);
  await openAndPinInstance(fixture);
  const harness = resolverFixture();
  const rule = new CapturingRule({ status: 'no-match' });
  const journeyOverrides = {
    rule,
    resolver: { harnessRunner: harness.runner },
    harness: harnessMaterial(harness.model),
    dependencies: { artifacts: [{
      kind: 'harness-config',
      artifactId: 'harness:quote',
      contentDigest: 'digest-harness:quote',
    }] },
  } as const;

  // First journey: accept → seam → admit → A9 commit (applied).
  const first = await processCommandTurn(fixture, commandMessage('msg:2-dup'), journeyOverrides);
  assert.equal(first.kind, 'processed');
  if (first.kind !== 'processed' || first.outcome.status !== 'admitted') assert.fail('expected admitted journey');
  assert.equal(first.ack.status, 'accepted');
  assert.ok(first.commit !== null, 'the processed turn committed through the A9 boundary');
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords().length, 1);
  assert.equal(fixture.store.commandMessageDisposition(target, 'msg:2-dup'), 'processed');
  const appliedOutcome = await fixture.store.getCommandOutcome(target, 'msg:2-dup');
  assert.equal(appliedOutcome?.status, 'applied', 'the durable command outcome fact exists');
  const stateAfterFirst = await fixture.store.getInstance(target);
  assert.equal(stateAfterFirst?.stateRevision, 1);

  // Compatible duplicate replay: same whole AcceptedMessageIdentity tuple.
  const replay = await processCommandTurn(fixture, commandMessage('msg:2-dup'), journeyOverrides);
  assert.equal(replay.kind, 'duplicate-ack');
  if (replay.kind !== 'duplicate-ack') assert.fail('expected duplicate ack');
  assert.equal(replay.ack.status, 'duplicate');
  assert.equal(replay.ack.targetSequence, first.ack.targetSequence, 'no new acceptance sequence');
  assert.equal(replay.existingOutcome?.status, 'applied', 'the existing durable outcome is applied');

  // No duplicate decision, no duplicate model work, no duplicate effect, no
  // duplicate receipt.
  assert.equal(harness.model.calls, 1, 'the model never ran again');
  assert.equal(rule.calls, 1, 'the resolver never ran again');
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords().length, 1);
  const receipts = await readReceiptRecords(fixture);
  assert.equal(receipts.length, 1, 'no duplicate decision receipt');
  const instanceAfterReplay = await fixture.store.getInstance(target);
  assert.equal(instanceAfterReplay?.stateRevision, 1, 'no duplicate state advance');

  // Contrast: a DIFFERENT messageId (new turn identity) legitimately processes
  // — the A8 boundary collapses only exact replays.
  const second = await processCommandTurn(fixture, commandMessage('msg:2-next'), {
    rule,
    resolver: { harnessRunner: createXStateHarnessMachineRunner() },
    harness: harnessMaterial(new ScriptedModel([finalResponse('approve', { via: 'harness' })])),
    dependencies: { artifacts: [{
      kind: 'harness-config',
      artifactId: 'harness:quote',
      contentDigest: 'digest-harness:quote',
    }] },
  });
  assert.equal(second.kind, 'processed');
  if (second.kind !== 'processed') assert.fail('expected processed second turn');
  assert.equal(second.ack.status, 'accepted');
  assert.equal(second.ack.targetSequence, 2, 'the new turn received the next sequence');
  assert.equal(fixture.tools.calls.length, 2);
});

/* ------------------------------------------------------------------------ */
/* #585-3 — A8 composed: incompatible collision fails closed                 */
/* ------------------------------------------------------------------------ */

test('#585-3: an incompatible same-messageId collision fails closed before durable mutation through the journey', async () => {
  const fixture = await conformanceFixture([await quoteDecisionDescriptor()]);
  await openAndPinInstance(fixture);
  const harness = resolverFixture();

  // First journey is fully processed (durable acceptance + applied outcome).
  const first = await processCommandTurn(fixture, commandMessage('msg:3-collide'), {
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { harnessRunner: harness.runner },
    harness: harnessMaterial(harness.model),
    dependencies: { artifacts: [{
      kind: 'harness-config',
      artifactId: 'harness:quote',
      contentDigest: 'digest-harness:quote',
    }] },
  });
  assert.equal(first.kind, 'processed');
  const effectsAfterFirst = fixture.tools.calls.length;
  const journalAfterFirst = fixture.journal.getRecords().length;

  // Incompatible replay with the SAME messageId: different payload.
  await assert.rejects(
    () => fixture.store.acceptMessage(commandMessage('msg:3-collide', { payload: { amount: 43 } })),
    (error: unknown) => error instanceof AcceptedMessageIdentityCollisionError
      && error.code === 'MESSAGE_IDENTITY_COLLISION'
      && error.message.includes('payload'),
  );

  // Incompatible type, and incompatible correlationId: same fail-closed rule.
  await assert.rejects(
    () => fixture.store.acceptMessage(commandMessage('msg:3-collide', { type: 'QUOTE_REJECTED' })),
    (error: unknown) => error instanceof AcceptedMessageIdentityCollisionError,
  );
  await assert.rejects(
    () => fixture.store.acceptMessage(commandMessage('msg:3-collide', { correlationId: 'other-correlation' })),
    (error: unknown) => error instanceof AcceptedMessageIdentityCollisionError,
  );

  // The collision happened BEFORE any durable mutation: no new acceptance
  // sequence, no new disposition, no duplicate effect/journal/receipt.
  assert.equal(fixture.store.commandMessageCount(target), 1);
  assert.equal(fixture.store.commandMessageDisposition(target, 'msg:3-collide'), 'processed');
  assert.equal(fixture.tools.calls.length, effectsAfterFirst);
  assert.equal(fixture.journal.getRecords().length, journalAfterFirst);
  const receipts = await readReceiptRecords(fixture);
  assert.equal(receipts.length, 1);
  const instance = await fixture.store.getInstance(target);
  assert.equal(instance?.stateRevision, 1);
});

/* ------------------------------------------------------------------------ */
/* #585-4 — A9 composed: invalid revision pair rejected, no partial commit   */
/* ------------------------------------------------------------------------ */

test('#585-4: an invalid revision pair (not exactly N→N+1) is rejected without partial commit through the journey', async () => {
  const fixture = await conformanceFixture([await quoteDecisionDescriptor()]);
  await openAndPinInstance(fixture);
  const harness = resolverFixture();

  const first = await processCommandTurn(fixture, commandMessage('msg:4-rev'), {
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { harnessRunner: harness.runner },
    harness: harnessMaterial(harness.model),
    dependencies: { artifacts: [{
      kind: 'harness-config',
      artifactId: 'harness:quote',
      contentDigest: 'digest-harness:quote',
    }] },
  });
  assert.equal(first.kind, 'processed');
  if (first.kind !== 'processed' || first.commit === null) assert.fail('expected a committed journey');
  const committed: ProcessedCommandTurnCommit = first.commit;
  assert.equal(committed.expectedStateRevision, 0);
  assert.equal(committed.nextStateRevision, 1, 'the runtime-core derived commit is exactly N→N+1');

  // Durable facts after the valid commit.
  const outcomeBefore = await fixture.store.getCommandOutcome(target, 'msg:4-rev');
  const instanceBefore = await fixture.store.getInstance(target);
  const processDataBefore = await fixture.store.getProcessData(target);

  // (a) advance-by-two pair: structurally nonconforming.
  await assert.rejects(
    () => fixture.store.commitProcessedCommandTurn({
      ...committed,
      messageId: 'msg:4-rev',
      expectedStateRevision: 1,
      nextStateRevision: 3,
    }),
    (error: unknown) => error instanceof ProcessCommandContractError
      && error.code === 'STATE_REVISION_MISMATCH',
  );

  // (b) non-advancing pair.
  await assert.rejects(
    () => fixture.store.commitProcessedCommandTurn({
      ...committed,
      messageId: 'msg:4-rev',
      expectedStateRevision: 1,
      nextStateRevision: 1,
    }),
    (error: unknown) => error instanceof ProcessCommandContractError
      && error.code === 'STATE_REVISION_MISMATCH',
  );

  // (c) negative expected revision.
  await assert.rejects(
    () => fixture.store.commitProcessedCommandTurn({
      ...committed,
      messageId: 'msg:4-rev',
      expectedStateRevision: -1,
      nextStateRevision: 0,
    }),
    (error: unknown) => error instanceof ProcessCommandContractError
      && error.code === 'STATE_REVISION_MISMATCH',
  );

  // No partial commit: every durable fact is unchanged.
  assert.deepEqual(await fixture.store.getCommandOutcome(target, 'msg:4-rev'), outcomeBefore);
  assert.deepEqual(await fixture.store.getInstance(target), instanceBefore);
  assert.deepEqual(await fixture.store.getProcessData(target), processDataBefore);
  assert.equal(fixture.store.commandMessageDisposition(target, 'msg:4-rev'), 'processed');
  assert.equal(fixture.tools.calls.length, 1, 'the rejected persistence commands never re-ran effects');
});

/* ------------------------------------------------------------------------ */
/* #585-9 — unsupported capability fails closed at activation AND seam       */
/* ------------------------------------------------------------------------ */

test('#585-9: an unsupported semantic-decision capability fails closed at BOTH activation and seam binding (A7) — never ignored', async () => {
  const declaration = await quoteDecisionDescriptor();

  // (a) Activation: a host WITHOUT the compiled semantic-decision capability
  // cannot activate a package declaring it — fail closed as incompatible.
  await assert.rejects(
    () => conformanceFixture([declaration], { capabilities: [...NON_SEMANTIC_HOST_CAPABILITIES] }),
    (error: unknown) => error instanceof PackageActivationError
      && error.code === 'INCOMPATIBLE_PACKAGE'
      && error.details.includes('missing host capability semantic-decision@1'),
  );

  // (b) Activation: an unknown semantic-declaration contract version is
  // unsupported compiled material — fail closed, never silently ignored.
  await assert.rejects(
    () => conformanceFixture([declaration], {
      packageOverrides: { semanticDecisionContractVersion: 'semantic-declaration.v0-unknown' },
    }),
    (error: unknown) => error instanceof PackageActivationError,
  );

  // (c) Seam binding: a capability binding OUTSIDE the declaration's
  // query-only identities fails closed before any model work.
  const fixture = await conformanceFixture([declaration]);
  await openAndPinInstance(fixture);
  const rogueModel = new ScriptedModel([]);
  await assert.rejects(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      resolver: { harnessRunner: resolverFixture().runner },
      harness: {
        input: {
          domainFacts: {},
          compiledIntelligence: {},
          workflowContext: {},
          capabilities: [{
            capabilityId: 'effects.mutate',
            description: 'rogue mutation capability',
            kind: 'mutation' as const,
            execute: async () => ({}),
          }],
          model: rogueModel,
        },
        journal: new VolatileHarnessExecutionJournalStore(),
        harnessProducerIdentity: {
          kind: 'harness-config',
          artifactId: 'harness:quote',
          contentDigest: 'digest-harness:quote',
        },
      },
    })),
    (error: unknown) => error instanceof DomainRuntimeV3Error
      && error.code === 'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE',
  );
  assert.equal(rogueModel.calls, 0, 'fail closed happens before any model work');
  assert.equal(fixture.tools.calls.length, 0);
});
