/**
 * V08 T-F WEB-ORACLE-2 — FR05 / FR08 full Resolver/Projection differential.
 *
 * Authority: #1005@6118653040, claim #1005@6118730336.
 * Base prepared against v0.8@557e8ba53f90309c9d370d32b77d2dff070b8a5b.
 *
 * This is a source-prepared executable oracle only. It directly exercises the
 * physically selected v0.8 K/H implementation surfaces which, at the JIT base,
 * are byte-identical to the accepted v0.7 FR05/FR08 sources. It deliberately
 * does NOT call the D02 Standard-SDK proposal-only projectRetainedRead or
 * resolveRetainedDecision helpers and does NOT claim production ModelPort,
 * Linux, SQLite, cross-process, or measured evidence.
 *
 * After #1013 lands, the local executor must rerun this exact oracle against
 * the then-current v0.8 H/K/S tree. A pin failure is evidence to inspect an
 * intentional successor implementation, not permission to restore old API
 * shape blindly.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { JsonObject, JsonSchema, JsonValue } from '../../domain-harness/src/contracts/json.js';
import {
  AuthoritativeRevalidationError,
  revalidateAuthoritativeSnapshot,
} from '../../domain-harness/src/projection/authoritative-revalidation.js';
import {
  ProjectionError,
  ProjectionService,
} from '../../domain-harness/src/projection/projection-service.js';
import type { ExpressionExecutorPort, Sha256Port } from '../../domain-harness/src/v2/contracts/host.js';
import type {
  PackageRegistry,
  TargetCompiledDomainPackage,
} from '../../domain-harness/src/v2/contracts/package.js';
import type {
  BusinessSnapshot,
  BusinessSnapshotPort,
} from '../../domain-harness/src/v2/contracts/projection.js';
import type {
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '../../domain-harness/src/v2/contracts/workflow.js';
import {
  DecisionResolverError,
  resolveDecision,
  type DecisionResolverPorts,
} from '../../domain-harness/src/decision-resolver/index.js';
import { VolatileHarnessExecutionJournalStore } from '../../domain-harness/src/harness/execution-journal.js';
import {
  exactSelector,
  promotedFixture,
  sha256,
} from '../../domain-harness/tests/promoted-child/helpers.js';
import {
  ScriptedModel,
  ScriptedRule,
  assertJsonEqual,
  finalResponse,
  harnessConfig,
  makeFixture,
  makeInvocation,
  makePorts,
  quoteResult,
  type InvocationOptions,
  type QuoteDecisionResult,
} from '../../domain-harness/tests/decision-resolver/helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOMAIN_HARNESS_ROOT = join(HERE, '..', '..', 'domain-harness');

const PINNED_V07 = {
  projectionSource: '52b3127da2e62d772a66abcb75a7f5c625a1ae9d',
  projectionTest: '314c495baa618a5cb6258118b40edf4046196fd5',
  resolverSource: '25e8a62181fa8ae21f7b30835849060603349115',
  resolverTest: 'b8a73bf31de69d5de0d0a5a983ab589f3ca8b2a2',
} as const;

function gitBlobSha(relativePath: string): string {
  const bytes = readFileSync(join(DOMAIN_HARNESS_ROOT, relativePath));
  return createHash('sha1')
    .update('blob ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex');
}

test('WEB-ORACLE-2/PIN: physically selected FR05/FR08 source and accepted tests match pinned v0.7 at the JIT base', () => {
  assert.equal(
    gitBlobSha('src/projection/projection-service.ts'),
    PINNED_V07.projectionSource,
  );
  assert.equal(
    gitBlobSha('tests/projection/query-projection.test.ts'),
    PINNED_V07.projectionTest,
  );
  assert.equal(
    gitBlobSha('src/decision-resolver/resolver.ts'),
    PINNED_V07.resolverSource,
  );
  assert.equal(
    gitBlobSha('tests/decision-resolver/resolver.test.ts'),
    PINNED_V07.resolverTest,
  );
});

/* ------------------------------------------------------------------------- *
 * FR05 — real ProjectionService + authoritative mutation revalidation
 * ------------------------------------------------------------------------- */

function address(workflowId: string, instanceKey = 'case-1'): WorkflowAddress {
  return { workflowId, instanceKey };
}

function instance(
  workflowId: string,
  stateRevision: number,
  state: JsonValue,
): WorkflowInstanceSnapshot {
  return {
    address: address(workflowId),
    correlationId: 'corr-oracle-fr05',
    packageId: 'pkg-oracle-fr05',
    lifecycle: 'active',
    stateRevision,
    state,
    createdAt: '2026-10-12T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:01.000Z',
  };
}

function projectionOutputSchema(): JsonSchema {
  return {
    type: 'object',
    required: ['ready'],
    properties: {
      ready: { type: 'boolean' },
    },
    additionalProperties: false,
  };
}

function projectionPackage(): TargetCompiledDomainPackage {
  return {
    manifest: {
      formatVersion: '2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      domainId: 'oracle-fr05',
      domainVersion: '0.7-oracle',
      packageId: 'pkg-oracle-fr05',
      targetProfileId: 'oracle',
      requiredCapabilities: [],
      workflows: {},
      tools: {},
      projections: {
        dashboard: {
          projectionId: 'dashboard',
          expression: 'oracle-fr05-projection',
          dependencies: [
            { kind: 'workflow', selector: { workflowId: 'design' } },
            { kind: 'workflow', selector: { workflowId: 'quality' } },
            { kind: 'business', source: 'orders', selector: {} },
          ],
          outputSchema: projectionOutputSchema(),
        },
      },
      schemas: {},
      bindingDigests: {},
    },
    bindings: {},
  };
}

function registry(pkg = projectionPackage()): PackageRegistry {
  return {
    defaultPackageId: pkg.manifest.packageId,
    get: (packageId) => (packageId === pkg.manifest.packageId ? pkg : undefined),
    has: (packageId) => packageId === pkg.manifest.packageId,
    listPackageIds: () => [pkg.manifest.packageId],
  };
}

const projectionSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

class MutableBusinessSnapshots implements BusinessSnapshotPort {
  reads = 0;
  current: BusinessSnapshot = {
    source: 'orders',
    key: 'case-1',
    revision: 'orders-r1',
    value: { approved: true },
  };

  async read(): Promise<BusinessSnapshot> {
    this.reads += 1;
    return this.current;
  }
}

test('FR05-P-MS: real ProjectionService composes two workflow sources plus business revision and changes currentness digest when a source advances', async () => {
  const workflows = new Map<string, WorkflowInstanceSnapshot>([
    ['design:case-1', instance('design', 4, { phase: 'draft' })],
    ['quality:case-1', instance('quality', 9, { score: 92 })],
  ]);
  const business = new MutableBusinessSnapshots();
  const observedInputs: JsonObject[] = [];
  const expression: ExpressionExecutorPort = {
    async evaluate(request) {
      observedInputs.push(request.input as JsonObject);
      return { ready: true };
    },
  };
  const service = new ProjectionService({
    packageRegistry: registry(),
    store: {
      async getInstance(target) {
        return workflows.get(target.workflowId + ':' + target.instanceKey) ?? null;
      },
    },
    businessSnapshots: business,
    expression,
    sha256: projectionSha256,
  });

  const first = await service.read({ projectionId: 'dashboard', key: 'case-1' });
  assert.deepEqual(
    first.workflowSources.map((source) => [source.address.workflowId, source.stateRevision]),
    [['design', 4], ['quality', 9]],
  );
  assert.deepEqual(first.businessSources, [
    { source: 'orders', key: 'case-1', revision: 'orders-r1' },
  ]);
  assert.equal((observedInputs[0]?.workflows as JsonValue[]).length, 2);
  assert.equal((observedInputs[0]?.business as JsonValue[]).length, 1);
  assert.equal('tools' in (observedInputs[0] ?? {}), false);
  assert.equal('resources' in (observedInputs[0] ?? {}), false);

  workflows.set('quality:case-1', instance('quality', 10, { score: 93 }));
  business.current = {
    source: 'orders',
    key: 'case-1',
    revision: 'orders-r2',
    value: { approved: true },
  };
  const advanced = await service.read({ projectionId: 'dashboard', key: 'case-1' });
  assert.notEqual(
    advanced.revision,
    first.revision,
    'projection revision must move when authoritative source revisions move',
  );
  assert.deepEqual(advanced.businessSources, [
    { source: 'orders', key: 'case-1', revision: 'orders-r2' },
  ]);
});

test('FR05-N-STALE: a previously ready projection cannot authorize mutation after the authoritative business source advances', async () => {
  const business = new MutableBusinessSnapshots();
  const service = new ProjectionService({
    packageRegistry: registry(),
    store: {
      async getInstance(target) {
        return instance(target.workflowId, 1, {});
      },
    },
    businessSnapshots: business,
    expression: {
      async evaluate(request) {
        const input = request.input as JsonObject;
        const sources = input.business as JsonValue[];
        const first = sources[0] as JsonObject;
        const value = first.value as JsonObject;
        return { ready: value.approved === true };
      },
    },
    sha256: projectionSha256,
  });

  const staleCandidate = await service.read({ projectionId: 'dashboard', key: 'case-1' });
  assert.deepEqual(staleCandidate.value, { ready: true });
  assert.deepEqual(staleCandidate.businessSources, [
    { source: 'orders', key: 'case-1', revision: 'orders-r1' },
  ]);

  business.current = {
    source: 'orders',
    key: 'case-1',
    revision: 'orders-r2',
    value: { approved: false },
  };

  await assert.rejects(
    revalidateAuthoritativeSnapshot(
      business,
      { source: 'orders', key: 'case-1' },
      (snapshot) => (snapshot.value as JsonObject).approved === true,
    ),
    (error: unknown) => error instanceof AuthoritativeRevalidationError
      && error.revision === 'orders-r2',
  );
  assert.equal(
    business.reads,
    2,
    'mutation boundary must perform a fresh authoritative read instead of trusting the projection',
  );
});

test('FR05-N-AUTH: mismatched business source identity is refused before projection exposure', async () => {
  const unauthorized: BusinessSnapshotPort = {
    async read() {
      return {
        source: 'private-orders',
        key: 'case-1',
        revision: 'private-r1',
        value: { approved: true },
      };
    },
  };
  const service = new ProjectionService({
    packageRegistry: registry(),
    store: {
      async getInstance(target) {
        return instance(target.workflowId, 1, {});
      },
    },
    businessSnapshots: unauthorized,
    expression: { async evaluate() { return { ready: true }; } },
    sha256: projectionSha256,
  });

  await assert.rejects(
    service.read({ projectionId: 'dashboard', key: 'case-1' }),
    (error: unknown) => error instanceof ProjectionError
      && error.code === 'business_snapshot_mismatch',
  );
});

/* ------------------------------------------------------------------------- *
 * FR08 — real DecisionResolver source precedence/currentness/denials
 * ------------------------------------------------------------------------- */

const noMatchRule = () => new ScriptedRule({ status: 'no-match' });

async function makePromotedSetup() {
  const promoted = await promotedFixture();
  const executorCalls = { count: 0 };
  const config: NonNullable<InvocationOptions['promoted']> = {
    selector: exactSelector(promoted),
    executor: {
      async executeQuery(): Promise<JsonValue> {
        executorCalls.count += 1;
        return {
          quote: quoteResult('approve', { amount: 42 }),
          price: 42,
        };
      },
    },
    journal: new VolatileHarnessExecutionJournalStore(),
  };
  const ports: NonNullable<DecisionResolverPorts<QuoteDecisionResult>['promoted']> = {
    runtime: promoted.runtime,
    artifactPort: promoted.port,
    revocation: {
      readRevocation: (artifact) => promoted.registry.readRevocation(artifact),
    },
  };
  return { promoted, executorCalls, config, ports };
}

test('FR08-P-RULE: Rule wins before cache/promoted/Harness execution', async () => {
  const fixture = makeFixture();
  const promoted = await makePromotedSetup();
  const rule = new ScriptedRule({
    status: 'match',
    result: quoteResult('approve', { via: 'rule' }),
  });
  const fixtureModel = new ScriptedModel([finalResponse('reject', { via: 'fixture-harness' })]);

  const decision = await resolveDecision(
    await makeInvocation({
      promoted: promoted.config,
      harness: harnessConfig(fixtureModel, fixture.journal),
    }),
    makePorts(fixture, { rule, promoted: promoted.ports }),
    sha256,
  );

  assert.equal(decision.source, 'rule');
  assertJsonEqual(decision.structuredDecision, quoteResult('approve', { via: 'rule' }));
  assert.equal(promoted.executorCalls.count, 0, 'rule resolution must not execute promoted work');
  assert.equal(fixtureModel.calls, 0, 'rule resolution must not invoke the Harness fixture model');
});

test('FR08-P-CACHE: exact cache produced by current promoted identity wins the next invocation before second promoted work', async () => {
  const fixture = makeFixture();
  const promoted = await makePromotedSetup();

  const first = await resolveDecision(
    await makeInvocation({ promoted: promoted.config }),
    makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
    sha256,
  );
  assert.equal(first.source, 'promoted-subworkflow');
  assert.equal(first.cacheDisposition.write, 'inserted');
  assert.equal(promoted.executorCalls.count, 1);

  const second = await resolveDecision(
    await makeInvocation({
      durableControlTurnId: 'turn:2',
      promoted: promoted.config,
    }),
    makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
    sha256,
  );
  assert.equal(second.source, 'exact-cache');
  assertJsonEqual(second.structuredDecision, first.structuredDecision);
  assert.equal(
    promoted.executorCalls.count,
    1,
    'exact cache hit must not execute the promoted child again',
  );
});

test('FR08-P-PROMOTED: current exact promoted artifact resolves after Rule miss and cache miss', async () => {
  const fixture = makeFixture();
  const promoted = await makePromotedSetup();

  const decision = await resolveDecision(
    await makeInvocation({ promoted: promoted.config }),
    makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
    sha256,
  );

  assert.equal(decision.source, 'promoted-subworkflow');
  assert.equal(promoted.executorCalls.count, 1);
  assert.deepEqual(decision.selectedArtifactIdentity, promoted.promoted.body.identity);
});

test('FR08-P-HARNESS-FIXTURE: true unknown reaches the HarnessMachine fallback; this is fixture behavior, not production ModelPort measurement', async () => {
  const fixture = makeFixture();
  const fixtureModel = new ScriptedModel([
    finalResponse('reject', { reason: 'fixture-unknown' }),
  ]);

  const decision = await resolveDecision(
    await makeInvocation({
      harness: harnessConfig(fixtureModel, fixture.journal),
    }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );

  assert.equal(decision.source, 'harness-machine');
  assertJsonEqual(
    decision.structuredDecision,
    quoteResult('reject', { reason: 'fixture-unknown' }),
  );
  assert.equal(
    fixtureModel.calls,
    1,
    'this assertion concerns the scripted fixture only; it is not production ModelPort evidence',
  );
  assert.ok(decision.provenance.harness !== undefined);
});

test('FR08-N-CURRENTNESS: cache row invalid under the current schema is quarantined and cannot become authority', async () => {
  const fixture = makeFixture();
  await resolveDecision(
    await makeInvocation({
      harness: harnessConfig(
        new ScriptedModel([finalResponse('approve', { revision: 1 })]),
        fixture.journal,
      ),
    }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(fixture.cacheStore.size, 1);

  const rejectOnlySchema = {
    isValid: (value: JsonValue): value is QuoteDecisionResult =>
      typeof value === 'object'
      && value !== null
      && !Array.isArray(value)
      && typeof (value as { decision?: { outcome?: unknown } }).decision?.outcome === 'string'
      && (value as { decision: { outcome: string } }).decision.outcome === 'reject',
  };
  const fixtureModel = new ScriptedModel([
    finalResponse('reject', { revision: 2 }),
  ]);
  const decision = await resolveDecision(
    await makeInvocation({
      durableControlTurnId: 'turn:2',
      schema: rejectOnlySchema,
      harness: harnessConfig(fixtureModel, fixture.journal),
    }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );

  assert.equal(decision.source, 'harness-machine');
  assert.equal(decision.cacheDisposition.reason, 'quarantined');
  assert.equal(fixture.cacheStore.getQuarantineRecords().length, 1);
  assertJsonEqual(
    decision.structuredDecision,
    quoteResult('reject', { revision: 2 }),
  );
});

test('FR08-N-REVOKED-DENY: deny-revoked promoted artifact fails closed and never falls through to Harness', async () => {
  const fixture = makeFixture();
  const promoted = await makePromotedSetup();
  await promoted.promoted.registry.revoke(promoted.promoted.body.identity, {
    recordId: 'revocation:web-oracle-2',
    authorityRef: 'audit://web-oracle-2/revocation',
    recordedAt: '2026-10-12T00:00:02.000Z',
    reason: 'oracle security revocation',
    revocationPolicy: 'deny',
  });
  const fixtureModel = new ScriptedModel([
    finalResponse('approve', { unsafe: 'must-not-run' }),
  ]);

  await assert.rejects(
    () => makeInvocation({
      promoted: promoted.config,
      harness: harnessConfig(fixtureModel, fixture.journal),
    }).then((invocation) => resolveDecision(
      invocation,
      makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
      sha256,
    )),
    (error: unknown) => error instanceof DecisionResolverError
      && error.code === 'DECISION_RESOLVER_PROMOTED_REVOKED_DENY',
  );
  assert.equal(promoted.executorCalls.count, 0);
  assert.equal(
    fixtureModel.calls,
    0,
    'deny revocation is final and must not be hidden by a later Harness fallback',
  );
});
