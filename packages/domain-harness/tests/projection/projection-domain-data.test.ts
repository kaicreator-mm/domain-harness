import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonObject, JsonSchema, JsonValue } from '../../src/contracts/json.js';
import type { CompiledDomainDataPort } from '../../src/projection/compiled-domain-data.js';
import { ProjectionError, ProjectionService, type ProjectionServiceOptions } from '../../src/projection/projection-service.js';
import type { ExpressionExecutionRequest, ExpressionExecutorPort } from '../../src/v2/contracts/host.js';
import type { PackageRegistry, TargetCompiledDomainPackage } from '../../src/v2/contracts/package.js';
import type { BusinessSnapshot, BusinessSnapshotPort } from '../../src/v2/contracts/projection.js';
import type { WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';

const outputSchema: JsonSchema = {
  type: 'object',
  required: ['ready'],
  properties: { ready: { type: 'boolean' } },
  additionalProperties: false,
};

function compiledPackageWithDomainData(packageId: string): TargetCompiledDomainPackage {
  return {
    manifest: {
      formatVersion: '2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      domainId: 'domain-data-fixture',
      domainVersion: '0.2.0',
      packageId,
      targetProfileId: 'portable-test',
      requiredCapabilities: [],
      workflows: {},
      tools: {},
      projections: {
        dashboard: {
          projectionId: 'dashboard',
          expression: 'fixture-expression',
          dependencies: [
            { kind: 'workflow', selector: { workflowId: 'design' } },
            { kind: 'workflow', selector: { workflowId: 'quality' } },
            { kind: 'business', source: 'orders', selector: {} },
            { kind: 'domain-data', key: 'catalog' },
          ],
          outputSchema,
        },
      },
      schemas: {},
      bindingDigests: {},
    },
    bindings: {},
  };
}

const packageV1 = compiledPackageWithDomainData('pkg-a');
const packageV2 = compiledPackageWithDomainData('pkg-a-r2');

function registry(pkg: TargetCompiledDomainPackage): PackageRegistry {
  return {
    defaultPackageId: pkg.manifest.packageId,
    get: (packageId) => (packageId === pkg.manifest.packageId ? pkg : undefined),
    has: (packageId) => packageId === pkg.manifest.packageId,
    listPackageIds: () => [pkg.manifest.packageId],
  };
}

class FixtureCompiledDomainData implements CompiledDomainDataPort {
  readonly lookups: Array<{ packageId: string; key: string }> = [];

  constructor(
    private readonly entries: Readonly<Record<string, Readonly<Record<string, JsonValue>>>>,
  ) {}

  get(packageId: string, key: string): JsonValue | undefined {
    this.lookups.push({ packageId, key });
    return this.entries[packageId]?.[key];
  }
}

function domainDataV1(): FixtureCompiledDomainData {
  return new FixtureCompiledDomainData({
    'pkg-a': { catalog: { minScore: 90, enabled: true } },
  });
}

function domainDataV2(): FixtureCompiledDomainData {
  return new FixtureCompiledDomainData({
    'pkg-a-r2': { catalog: { minScore: 60, enabled: true } },
  });
}

function workflow(workflowId: string, state: JsonValue): WorkflowInstanceSnapshot {
  return {
    address: { workflowId, instanceKey: 'case-1' },
    correlationId: 'corr-1',
    packageId: 'pkg-a',
    lifecycle: 'active',
    stateRevision: workflowId === 'design' ? 4 : 9,
    state,
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:01.000Z',
  };
}

function storeWithFixedSnapshots() {
  const snapshots = new Map<string, WorkflowInstanceSnapshot>([
    ['design:case-1', workflow('design', { phase: 'review' })],
    ['quality:case-1', workflow('quality', { score: 92 })],
  ]);
  return {
    async getInstance(target: { workflowId: string; instanceKey: string }) {
      return snapshots.get(`${target.workflowId}:${target.instanceKey}`) ?? null;
    },
  };
}

class FixedBusinessSource implements BusinessSnapshotPort {
  readonly reads = 0;
  readonly current: BusinessSnapshot = {
    source: 'orders',
    key: 'case-1',
    revision: 'business-r1',
    value: { approved: true },
  };

  async read(): Promise<BusinessSnapshot> {
    return this.current;
  }
}

/** Composes every declared source: two workflows + business + compiled domain data. */
function composingExpression(): ExpressionExecutorPort & { requests: ExpressionExecutionRequest[] } {
  const requests: ExpressionExecutionRequest[] = [];
  return {
    requests,
    async evaluate(request) {
      requests.push(request);
      const input = request.input as JsonObject;
      const workflows = input.workflows as JsonObject[];
      const business = input.business as JsonObject[];
      const domainData = input.domainData as JsonObject[];
      const design = workflows[0]!.state as JsonObject;
      const quality = workflows[1]!.state as JsonObject;
      const order = (business[0]!.value as JsonObject);
      const catalog = (domainData[0]!.value as JsonObject);
      return {
        ready:
          design.phase === 'review'
          && (quality.score as number) >= (catalog.minScore as number)
          && order.approved === true,
      };
    },
  };
}

function sha256Identity() {
  return {
    async digestUtf8(value: string) {
      return value;
    },
  };
}

function buildService(overrides: {
  pkg?: TargetCompiledDomainPackage;
  domainData?: CompiledDomainDataPort;
  expression?: ExpressionExecutorPort;
}) {
  const expression = overrides.expression ?? { async evaluate() { return { ready: true }; } };
  const options: ProjectionServiceOptions = {
    packageRegistry: registry(overrides.pkg ?? packageV1),
    store: storeWithFixedSnapshots(),
    businessSnapshots: new FixedBusinessSource(),
    expression,
    sha256: sha256Identity(),
  };
  if (overrides.domainData) {
    options.domainData = overrides.domainData;
  }
  return new ProjectionService(options);
}

test('G24/S15: projection composes two workflows + business + compiled domain data', async () => {
  const expression = composingExpression();
  const domainData = domainDataV1();
  const service = buildService({ domainData, expression });

  const snapshot = await service.read({ projectionId: 'dashboard', key: 'case-1' });

  assert.deepEqual(snapshot.value, { ready: true });
  assert.deepEqual(domainData.lookups, [{ packageId: 'pkg-a', key: 'catalog' }]);

  const input = expression.requests[0]?.input as JsonObject;
  assert.deepEqual(input.domainData, [{ key: 'catalog', value: { minScore: 90, enabled: true } }]);
});

test('G25: same package/workflow/business/domain-data inputs produce the same projection revision', async () => {
  const service = buildService({ domainData: domainDataV1(), expression: composingExpression() });

  const first = await service.read({ projectionId: 'dashboard', key: 'case-1' });
  const second = await service.read({ projectionId: 'dashboard', key: 'case-1' });

  assert.equal(second.revision, first.revision);
  assert.deepEqual(second.value, first.value);
});

test('G25: recompiled domain data changes the pinned packageId and the projection revision', async () => {
  const v1 = buildService({ domainData: domainDataV1(), expression: composingExpression() });
  const v2 = buildService({ pkg: packageV2, domainData: domainDataV2(), expression: composingExpression() });

  const first = await v1.read({ projectionId: 'dashboard', key: 'case-1' });
  const second = await v2.read({ projectionId: 'dashboard', key: 'case-1' });

  assert.notEqual(second.revision, first.revision);
  assert.match(first.revision, /"packageId":"pkg-a"/);
  assert.match(second.revision, /"packageId":"pkg-a-r2"/);
});

test('G25: missing compiled domain data fails closed before evaluation', async () => {
  const expression = composingExpression();
  const missingKey = new FixtureCompiledDomainData({ 'pkg-a': { other: {} } });
  await assert.rejects(
    buildService({ domainData: missingKey, expression }).read({ projectionId: 'dashboard', key: 'case-1' }),
    (error: unknown) => error instanceof ProjectionError && error.code === 'domain_data_not_found',
  );

  await assert.rejects(
    buildService({ expression }).read({ projectionId: 'dashboard', key: 'case-1' }),
    (error: unknown) => error instanceof ProjectionError && error.code === 'domain_data_port_missing',
  );

  assert.equal(expression.requests.length, 0, 'fail-closed rejection must happen before expression evaluation');
});

test('G25: domain data reaches the evaluator only as declared JSON with no runtime authority', async () => {
  const expression = composingExpression();
  await buildService({ domainData: domainDataV1(), expression }).read({
    projectionId: 'dashboard',
    key: 'case-1',
  });

  const request = expression.requests[0]!;
  assert.deepEqual(Object.keys(request).sort(), ['expression', 'input', 'logicalTime']);

  const input = request.input as JsonObject;
  assert.deepEqual(Object.keys(input).sort(), ['business', 'domainData', 'input', 'key', 'workflows']);
  assert.deepEqual(input.domainData, [
    { key: 'catalog', value: { minScore: 90, enabled: true } },
  ]);
  assert.equal('tools' in input, false);
  assert.equal('skills' in input, false);
  assert.equal('resources' in input, false);
});
