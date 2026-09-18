import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonObject, JsonSchema, JsonValue } from '../../src/contracts/json.js';
import { DomainQueryDispatcher } from '../../src/query/domain-query-dispatcher.js';
import {
  AuthoritativeRevalidationError,
  revalidateAuthoritativeSnapshot,
} from '../../src/projection/authoritative-revalidation.js';
import { ProjectionError, ProjectionService } from '../../src/projection/projection-service.js';
import type { ExpressionExecutionRequest, ExpressionExecutorPort, Sha256Port } from '../../src/v2/contracts/host.js';
import type { PackageRegistry, TargetCompiledDomainPackage } from '../../src/v2/contracts/package.js';
import type { BusinessSnapshot, BusinessSnapshotPort } from '../../src/v2/contracts/projection.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';

function address(workflowId: string, instanceKey = 'case-1'): WorkflowAddress {
  return { workflowId, instanceKey };
}

function instance(
  workflowId: string,
  stateRevision: number,
  state: JsonValue,
  failure?: WorkflowInstanceSnapshot['failure'],
): WorkflowInstanceSnapshot {
  const snapshot: WorkflowInstanceSnapshot = {
    address: address(workflowId),
    correlationId: 'corr-1',
    packageId: 'pkg-a',
    lifecycle: failure ? 'recovery_required' : 'active',
    stateRevision,
    state,
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:01.000Z',
  };
  if (failure) snapshot.failure = failure;
  return snapshot;
}

function outputSchema(): JsonSchema {
  return {
    type: 'object',
    required: ['ready'],
    properties: {
      ready: { type: 'boolean' },
    },
    additionalProperties: false,
  };
}

function compiledPackage(expression = 'projection-expression'): TargetCompiledDomainPackage {
  return {
    manifest: {
      formatVersion: '2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      domainId: 'fixture-domain',
      domainVersion: '0.2.0',
      packageId: 'pkg-a',
      targetProfileId: 'portable-test',
      requiredCapabilities: [],
      workflows: {},
      tools: {},
      projections: {
        dashboard: {
          projectionId: 'dashboard',
          expression,
          dependencies: [
            { kind: 'workflow', selector: { workflowId: 'design' } },
            { kind: 'workflow', selector: { workflowId: 'quality' } },
            { kind: 'business', source: 'orders', selector: {} },
          ],
          outputSchema: outputSchema(),
        },
      },
      schemas: {},
      bindingDigests: {},
    },
    bindings: {},
  };
}

function registry(pkg = compiledPackage()): PackageRegistry {
  return {
    defaultPackageId: pkg.manifest.packageId,
    get: (packageId) => (packageId === pkg.manifest.packageId ? pkg : undefined),
    has: (packageId) => packageId === pkg.manifest.packageId,
    listPackageIds: () => [pkg.manifest.packageId],
  };
}

function sha256Port(): Sha256Port {
  return {
    async digestUtf8(value) {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return `fixture-${(hash >>> 0).toString(16).padStart(8, '0')}`;
    },
  };
}

class MutableBusinessSnapshots implements BusinessSnapshotPort {
  reads = 0;
  current: BusinessSnapshot = {
    source: 'orders',
    key: 'case-1',
    revision: 'business-r1',
    value: { approved: true },
  };

  async read(): Promise<BusinessSnapshot> {
    this.reads += 1;
    return this.current;
  }
}

test('G22: DomainQuery dispatches only the frozen read-side query kinds', async () => {
  const design = instance('design', 3, { phase: 'review' }, {
    code: 'needs-review',
    message: 'manual review required',
  });
  const calls: string[] = [];
  const store = {
    async getInstance(target: WorkflowAddress) {
      calls.push(`instance:${target.workflowId}:${target.instanceKey}`);
      return design;
    },
    async getMessageDisposition(target: WorkflowAddress, messageId: string) {
      calls.push(`message:${target.workflowId}:${messageId}`);
      return {
        target,
        messageId,
        targetSequence: 7,
        packageId: 'pkg-a',
        disposition: 'processed' as const,
        correlationId: 'corr-1',
        acceptedAt: '2026-09-18T00:00:00.000Z',
        resolvedAt: '2026-09-18T00:00:01.000Z',
      };
    },
    async listPinnedPackageIds() {
      calls.push('pins');
      return ['pkg-b', 'pkg-a'];
    },
  };
  const projectionReads: string[] = [];
  const projection = {
    async read(request: { projectionId: string; key: string; input?: JsonValue }) {
      projectionReads.push(`${request.projectionId}:${request.key}`);
      return {
        projectionId: request.projectionId,
        key: request.key,
        packageId: 'pkg-a',
        revision: 'projection-r1',
        value: { ready: true },
        workflowSources: [],
        businessSources: [],
      };
    },
  };
  const dispatcher = new DomainQueryDispatcher({ store, projection });

  assert.equal((await dispatcher.query({ kind: 'instance', target: address('design') })).kind, 'instance');
  const disposition = await dispatcher.query({
    kind: 'message-disposition',
    target: address('design'),
    messageId: 'msg-7',
  });
  assert.equal(disposition.kind, 'message-disposition');
  const failure = await dispatcher.query({ kind: 'runtime-failure', target: address('design') });
  assert.deepEqual(failure, { kind: 'runtime-failure', value: design.failure });
  assert.deepEqual(await dispatcher.query({ kind: 'package-pins' }), {
    kind: 'package-pins',
    value: ['pkg-a', 'pkg-b'],
  });
  const projected = await dispatcher.query({
    kind: 'projection',
    projectionId: 'dashboard',
    key: 'case-1',
    input: { locale: 'en' },
  });
  assert.equal(projected.kind, 'projection');

  assert.deepEqual(projectionReads, ['dashboard:case-1']);
  assert.deepEqual(calls, [
    'instance:design:case-1',
    'message:design:msg-7',
    'instance:design:case-1',
    'pins',
  ]);
});

test('G24/G25: Projection composes multiple workflow snapshots and business data deterministically without executor I/O authority', async () => {
  const workflows = new Map<string, WorkflowInstanceSnapshot>([
    ['design:case-1', instance('design', 4, { phase: 'draft' })],
    ['quality:case-1', instance('quality', 9, { score: 92 })],
  ]);
  const business = new MutableBusinessSnapshots();
  const expressionCalls: ExpressionExecutionRequest[] = [];
  const expression: ExpressionExecutorPort = {
    async evaluate(request) {
      expressionCalls.push(request);
      return { ready: true };
    },
  };
  const service = new ProjectionService({
    packageRegistry: registry(),
    store: {
      async getInstance(target) {
        return workflows.get(`${target.workflowId}:${target.instanceKey}`) ?? null;
      },
    },
    businessSnapshots: business,
    expression,
    sha256: sha256Port(),
  });

  const first = await service.read({ projectionId: 'dashboard', key: 'case-1', input: { locale: 'en' } });
  const second = await service.read({ projectionId: 'dashboard', key: 'case-1', input: { locale: 'en' } });

  assert.equal(first.workflowSources.length, 2);
  assert.deepEqual(first.workflowSources.map((source) => source.address.workflowId), ['design', 'quality']);
  assert.deepEqual(first.businessSources, [{ source: 'orders', key: 'case-1', revision: 'business-r1' }]);
  assert.deepEqual(first.value, { ready: true });
  assert.equal(first.revision, second.revision);
  assert.equal(expressionCalls.length, 2);
  assert.deepEqual(Object.keys(expressionCalls[0] ?? {}).sort(), ['expression', 'input', 'logicalTime']);
  assert.equal(expressionCalls[0]?.logicalTime, '1970-01-01T00:00:00.000Z');

  const projectionInput = expressionCalls[0]?.input as JsonObject;
  assert.equal(projectionInput.key, 'case-1');
  assert.equal(Array.isArray(projectionInput.workflows), true);
  assert.equal(Array.isArray(projectionInput.business), true);
  assert.equal('resources' in projectionInput, false);
  assert.equal('tools' in projectionInput, false);
  assert.equal('skills' in projectionInput, false);

  workflows.set('quality:case-1', instance('quality', 10, { score: 93 }));
  const changed = await service.read({ projectionId: 'dashboard', key: 'case-1', input: { locale: 'en' } });
  assert.notEqual(changed.revision, first.revision);
});

test('G25: Projection fails closed on undeclared selector/query behavior and invalid output', async () => {
  const basePackage = compiledPackage();
  const baseProjection = basePackage.manifest.projections.dashboard!;
  const malformedPackage: TargetCompiledDomainPackage = {
    ...basePackage,
    manifest: {
      ...basePackage.manifest,
      projections: {
        ...basePackage.manifest.projections,
        dashboard: {
          ...baseProjection,
          dependencies: [{ kind: 'workflow', selector: { workflowId: 'design', filter: 'active' } }],
        },
      },
    },
  };
  const service = new ProjectionService({
    packageRegistry: registry(malformedPackage),
    store: { async getInstance() { return instance('design', 1, {}); } },
    expression: { async evaluate() { return { ready: true }; } },
    sha256: sha256Port(),
  });

  await assert.rejects(
    service.read({ projectionId: 'dashboard', key: 'case-1' }),
    (error: unknown) => error instanceof ProjectionError && error.code === 'invalid_selector',
  );

  const invalidOutput = new ProjectionService({
    packageRegistry: registry(),
    store: {
      async getInstance(target) {
        return instance(target.workflowId, 1, {});
      },
    },
    businessSnapshots: new MutableBusinessSnapshots(),
    expression: { async evaluate() { return { ready: 'not-a-boolean' }; } },
    sha256: sha256Port(),
  });
  await assert.rejects(
    invalidOutput.read({ projectionId: 'dashboard', key: 'case-1' }),
    (error: unknown) => error instanceof ProjectionError && error.code === 'invalid_output',
  );
});

test('G26: stale Projection output cannot authorize a mutation without a fresh authoritative read', async () => {
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
    sha256: sha256Port(),
  });

  const stale = await service.read({ projectionId: 'dashboard', key: 'case-1' });
  assert.deepEqual(stale.value, { ready: true });

  business.current = {
    source: 'orders',
    key: 'case-1',
    revision: 'business-r2',
    value: { approved: false },
  };

  await assert.rejects(
    revalidateAuthoritativeSnapshot(
      business,
      { source: 'orders', key: 'case-1' },
      (snapshot) => {
        const value = snapshot.value as JsonObject;
        return value.approved === true;
      },
    ),
    (error: unknown) => error instanceof AuthoritativeRevalidationError,
  );
  assert.equal(business.reads, 2, 'mutation boundary must perform a second authoritative read');
});
