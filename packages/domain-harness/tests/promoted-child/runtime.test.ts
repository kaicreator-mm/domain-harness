import assert from 'node:assert/strict';
import test from 'node:test';
import type { JsonValue } from '../../src/contracts/json.js';
import { VolatileHarnessExecutionJournalStore } from '../../src/harness/execution-journal.js';
import { PromotedArtifactContractError } from '../../src/promoted-artifact/index.js';
import {
  assertPromotedChildCompatible,
  compilePromotedChild,
  dynamicChildSlotKey,
  DynamicChildExecutionError,
  PromotedChildRuntime,
  requireDynamicChildOperationGate,
  type PromotedChildQueryExecutorPort,
} from '../../src/promoted-child/index.js';
import {
  allAvailableArtifacts,
  exactSelector,
  invokingContext,
  makeSlot,
  promotedFixture,
  ref,
  sha256,
  type PromotedFixture,
} from './helpers.js';

function executor(calls: { count: number }, result: JsonValue = { price: 42, quote: { amount: 42, currency: 'USD' } }): PromotedChildQueryExecutorPort {
  return {
    async executeQuery() {
      calls.count += 1;
      return result;
    },
  };
}

async function semanticContractDigest(): Promise<string> {
  return sha256.digestUtf8('decision-contract:quote:v1');
}

async function beginFresh(fixture: PromotedFixture, slot = makeSlot(), invoking = invokingContext()) {
  return fixture.runtime.beginFreshExecution({
    selector: exactSelector(fixture),
    slot,
    invoking,
    pinnedAt: '2026-09-21T05:00:00.000Z',
  });
}

test('runtime: fresh selection pins BEFORE any journaled work, then runs to a terminal result', async () => {
  const fixture = await promotedFixture();
  const slot = makeSlot();
  const session = await beginFresh(fixture, slot);
  const pin = await fixture.pinStore.get(dynamicChildSlotKey(slot));
  assert.ok(pin !== undefined, 'pin must be durably committed before journaled work');
  assert.equal(pin?.artifact.contentDigest, fixture.body.identity.contentDigest);

  const calls = { count: 0 };
  const journal = new VolatileHarnessExecutionJournalStore();
  const result = await session.run({
    input: { sku: 'P-1' },
    journal,
    executor: executor(calls),
    durableControlTurnId: 'turn:1',
    semanticContractDigest: await semanticContractDigest(),
  });
  assert.equal(calls.count, 1);
  assert.deepEqual(result.output, { amount: 42, currency: 'USD' });
  assert.deepEqual(result.emittedEvents, [{ eventType: 'QUOTE_PREPARED', payload: 42 }]);
  assert.deepEqual(result.effectIntents, []);
  assert.equal(result.pin.artifact.contentDigest, fixture.body.identity.contentDigest);
});

test('runtime: every journaled operation inside the child carries the exact child content digest', async () => {
  const fixture = await promotedFixture();
  const session = await beginFresh(fixture);
  const context = session.operationIdentityContext({
    durableControlTurnId: 'turn:1',
    semanticContractDigest: await semanticContractDigest(),
  });
  assert.equal(context.promotedChildContentDigest, fixture.body.identity.contentDigest);
});

test('runtime: replayed control turn replays committed work without re-executing', async () => {
  const fixture = await promotedFixture();
  const calls = { count: 0 };
  const journal = new VolatileHarnessExecutionJournalStore();
  const options = {
    input: { sku: 'P-1' },
    journal,
    executor: executor(calls),
    durableControlTurnId: 'turn:1',
    semanticContractDigest: await semanticContractDigest(),
  };
  const first = await (await beginFresh(fixture)).run(options);
  const recovered = await fixture.runtime.recoverExecution({ slot: makeSlot(), invoking: invokingContext() });
  const second = await recovered.run(options);
  assert.equal(calls.count, 1, 'committed work must replay from the journal, never re-execute');
  assert.deepEqual(second.output, first.output);
});

test('runtime: committed work from digest D1 cannot be consumed by a D2 child on the same slot', async () => {
  const d1 = await promotedFixture();
  const d2 = await promotedFixture({ events: ['QUOTE_PREPARED', 'QUOTE_NOTIFIED'] });
  assert.notEqual(d1.body.identity.contentDigest, d2.body.identity.contentDigest);
  const journal = new VolatileHarnessExecutionJournalStore();
  const calls = { count: 0 };
  const sharedOptions = {
    input: { sku: 'P-1' },
    journal,
    executor: executor(calls),
    durableControlTurnId: 'turn:1',
    semanticContractDigest: await semanticContractDigest(),
  };
  await (await beginFresh(d1)).run(sharedOptions);
  const foreign = await d2.runtime.beginFreshExecution({
    selector: exactSelector(d2),
    slot: makeSlot(2),
    invoking: invokingContext(),
    pinnedAt: '2026-09-21T05:00:00.000Z',
  });
  await assert.rejects(
    () => foreign.run(sharedOptions),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_JOURNAL_FAILURE',
  );
});

test('runtime: no journaled work may exist before the exact pin is durable', async () => {
  const fixture = await promotedFixture();
  await assert.rejects(
    () => requireDynamicChildOperationGate(fixture.pinStore, makeSlot(7)),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_WORK_BEFORE_PIN',
  );
});

test('runtime: revoked artifact is blocked for fresh selection but stays exactly recoverable', async () => {
  const fixture = await promotedFixture();
  const session = await beginFresh(fixture);
  await fixture.registry.revoke(fixture.body.identity, {
    recordId: 'revocation:1',
    authorityRef: 'audit://revocation/1',
    recordedAt: '2026-09-21T05:30:00.000Z',
    reason: 'policy rotation',
  });
  await assert.rejects(
    () => fixture.runtime.beginFreshExecution({
      selector: exactSelector(fixture),
      slot: makeSlot(2),
      invoking: invokingContext(),
      pinnedAt: '2026-09-21T05:31:00.000Z',
    }),
    (error: unknown) => error instanceof PromotedArtifactContractError && error.code === 'PROMOTED_ARTIFACT_REVOKED',
  );
  const recovered = await fixture.runtime.recoverExecution({ slot: makeSlot(), invoking: invokingContext() });
  assert.deepEqual(recovered.compiled.definition, session.compiled.definition, 'exact pinned recovery restores the same child');
});

test('runtime: recovery recompiles deterministically and never re-resolves a selector', async () => {
  const fixture = await promotedFixture();
  const fresh = await beginFresh(fixture);
  // Alias movement after pinning must not affect the in-flight/recovered child.
  await fixture.registry.bindAlias({
    artifactId: 'subworkflow:quote-review',
    alias: 'quote-review-prod',
    artifact: fixture.body.identity,
    expectedRevision: 0,
  });
  const other = await promotedFixture({ events: ['QUOTE_PREPARED', 'OTHER'] });
  await other.registry.bindAlias({
    artifactId: 'subworkflow:quote-review',
    alias: 'quote-review-prod',
    artifact: other.body.identity,
    expectedRevision: 0,
  });
  const recovered = await fixture.runtime.recoverExecution({ slot: makeSlot(), invoking: invokingContext() });
  assert.equal(recovered.pin.artifact.contentDigest, fixture.body.identity.contentDigest);
  assert.deepEqual(recovered.compiled.definition, fresh.compiled.definition);
});

test('runtime: missing exact body during recovery fails closed', async () => {
  const fixture = await promotedFixture();
  await beginFresh(fixture);
  // A runtime over a registry that never held the pinned body, sharing the pin store.
  const foreign = await promotedFixture({ events: ['QUOTE_PREPARED', 'X'] });
  const orphanRuntime = new PromotedChildRuntime(foreign.port, fixture.pinStore, sha256);
  await assert.rejects(
    () => orphanRuntime.recoverExecution({ slot: makeSlot(), invoking: invokingContext() }),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_BODY_MISSING',
  );
});

test('runtime: recovery against a moved package/governance authority fails closed', async () => {
  const fixture = await promotedFixture();
  await beginFresh(fixture);
  await assert.rejects(
    () => fixture.runtime.recoverExecution({ slot: makeSlot(), invoking: invokingContext({ packageId: 'pkg-orders-b2' }) }),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_PACKAGE_MISMATCH',
  );
  await assert.rejects(
    () => fixture.runtime.recoverExecution({ slot: makeSlot(), invoking: invokingContext({ domainIntelligenceContentDigest: 'cdi-orders-b2' }) }),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_PACKAGE_MISMATCH',
  );
  await assert.rejects(
    () => fixture.runtime.recoverExecution({
      slot: makeSlot(),
      invoking: invokingContext({
        governanceBaseline: {
          domainId: 'orders',
          governanceId: 'orders-governance',
          schemaVersion: 'governance-v1',
          contentDigest: 'governance-content-b2',
        },
      }),
    }),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_GOVERNANCE_MISMATCH',
  );
});

test('runtime: recovery against missing referenced artifacts fails closed (never fallthrough)', async () => {
  const fixture = await promotedFixture();
  await beginFresh(fixture);
  await assert.rejects(
    () => fixture.runtime.recoverExecution({ slot: makeSlot(), invoking: invokingContext({ availableArtifacts: [] }) }),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_INCOMPATIBLE',
  );
});

test('runtime: recovery against moved applicability facts fails closed (no fallthrough on recovery)', async () => {
  const fixture = await promotedFixture();
  await beginFresh(fixture);
  await assert.rejects(
    () => fixture.runtime.recoverExecution({ slot: makeSlot(), invoking: invokingContext({ applicabilityFacts: [] }) }),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_NOT_APPLICABLE',
  );
});

test('runtime: incompatible references fall through as a typed outcome on fresh selection only', async () => {
  const fixture = await promotedFixture();
  await assert.rejects(
    () => beginFresh(fixture, makeSlot(), invokingContext({ availableArtifacts: [] })),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_INCOMPATIBLE',
  );
  await assert.rejects(
    () => beginFresh(fixture, makeSlot(), invokingContext({ applicabilityFacts: [] })),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_NOT_APPLICABLE',
  );
});

test('runtime: alias drift between resolution and selection fails closed', async () => {
  const fixture = await promotedFixture();
  await fixture.registry.bindAlias({
    artifactId: 'subworkflow:quote-review',
    alias: 'quote-review-prod',
    artifact: fixture.body.identity,
    expectedRevision: 0,
  });
  await assert.rejects(
    () => fixture.runtime.beginFreshExecution({
      selector: { kind: 'alias', artifactId: 'subworkflow:quote-review', alias: 'quote-review-prod', expectedRevision: 5 },
      slot: makeSlot(),
      invoking: invokingContext(),
      pinnedAt: '2026-09-21T05:00:00.000Z',
    }),
    (error: unknown) => error instanceof PromotedArtifactContractError && error.code === 'PROMOTED_ARTIFACT_STALE_SELECTION',
  );
  const viaAlias = await fixture.runtime.beginFreshExecution({
    selector: { kind: 'alias', artifactId: 'subworkflow:quote-review', alias: 'quote-review-prod', expectedRevision: 1 },
    slot: makeSlot(),
    invoking: invokingContext(),
    pinnedAt: '2026-09-21T05:00:00.000Z',
  });
  assert.equal(viaAlias.pin.artifact.contentDigest, fixture.body.identity.contentDigest);
  const viaVersion = await fixture.runtime.beginFreshExecution({
    selector: { kind: 'version', artifactId: 'subworkflow:quote-review', version: '1.0.0' },
    slot: makeSlot(3),
    invoking: invokingContext(),
    pinnedAt: '2026-09-21T05:00:00.000Z',
  });
  assert.equal(viaVersion.pin.artifact.contentDigest, fixture.body.identity.contentDigest);
});

test('runtime: floating selectors are rejected at the authority boundary', async () => {
  const fixture = await promotedFixture();
  await assert.rejects(
    () => fixture.runtime.beginFreshExecution({
      selector: { kind: 'version', artifactId: 'subworkflow:quote-review', version: 'latest' },
      slot: makeSlot(),
      invoking: invokingContext(),
      pinnedAt: '2026-09-21T05:00:00.000Z',
    }),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_SELECTION_INVALID',
  );
});

test('runtime: failing query step fails the child closed', async () => {
  const fixture = await promotedFixture();
  const session = await beginFresh(fixture);
  const contract = await semanticContractDigest();
  await assert.rejects(
    () => session.run({
      input: { sku: 'P-1' },
      journal: new VolatileHarnessExecutionJournalStore(),
      executor: { async executeQuery() { throw new Error('backend unavailable'); } },
      durableControlTurnId: 'turn:1',
      semanticContractDigest: contract,
    }),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_JOURNAL_FAILURE',
  );
});

test('runtime: effect intents are emitted as data only and mutation is never executed in the child', async () => {
  const fixture = await promotedFixture({
    mutation: { kind: 'durable-effect', effects: [ref('tool', 'effect:reserve')] },
    bodyNodes: [
      { node: 'fetch', step: { kind: 'query', tool: { kind: 'tool', artifactId: 'tool:price', contentDigest: 'digest-tool:price' }, input: { kind: 'input', path: 'sku' } } },
      { node: 'reserve', step: { kind: 'effect-intent', effect: { kind: 'tool', artifactId: 'effect:reserve', contentDigest: 'digest-effect:reserve' }, input: { kind: 'step-output', node: 'fetch', path: 'quote' }, idempotencyKey: 'reserve:quote:1' } },
      { node: 'finish', step: { kind: 'terminal-output', output: { kind: 'step-output', node: 'fetch', path: 'quote' } } },
    ],
    control: {
      startNode: 'fetch',
      nodes: ['fetch', 'reserve', 'finish'],
      edges: [
        { from: 'fetch', to: 'reserve' },
        { from: 'reserve', to: 'finish' },
      ],
      maxSteps: 5,
    },
  });
  const calls = { count: 0 };
  const result = await (await fixture.runtime.beginFreshExecution({
    selector: exactSelector(fixture),
    slot: makeSlot(),
    invoking: invokingContext({ availableArtifacts: [...allAvailableArtifacts(), ref('tool', 'effect:reserve')] }),
    pinnedAt: '2026-09-21T05:00:00.000Z',
  })).run({
    input: { sku: 'P-1' },
    journal: new VolatileHarnessExecutionJournalStore(),
    executor: executor(calls),
    durableControlTurnId: 'turn:1',
    semanticContractDigest: await semanticContractDigest(),
  });
  assert.equal(result.effectIntents.length, 1);
  assert.equal(result.effectIntents[0]?.effect.artifactId, 'effect:reserve');
  assert.equal(result.effectIntents[0]?.idempotencyKey, 'reserve:quote:1');
  assert.deepEqual(result.effectIntents[0]?.input, { amount: 42, currency: 'USD' });
  assert.equal(calls.count, 1, 'only the query step executed; the effect intent is data for the parent authority');
});

test('runtime: compatibility is evaluated against the invoking pinned context, not the active package', async () => {
  const fixture = await promotedFixture();
  const compiled = compilePromotedChild(fixture.body);
  const { promotion } = await fixture.port.recoverExact(fixture.body.identity, {
    domainId: 'orders',
    packageId: 'pkg-orders-b1',
    domainIntelligenceContentDigest: 'cdi-orders-b1',
    governanceBaseline: {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: 'governance-v1',
      contentDigest: 'governance-content-b1',
    },
  });
  assert.throws(
    () => assertPromotedChildCompatible(compiled.envelope, promotion.authorityBinding, invokingContext({ packageId: 'pkg-orders-active' })),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_PACKAGE_MISMATCH',
  );
});
