import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonSchema } from '../../src/contracts/json.js';
import { ProjectionService } from '../../src/projection/projection-service.js';
import type { TargetCompiledDomainPackage } from '../../src/v2/contracts/package.js';
import type { BusinessSnapshot, BusinessSnapshotPort } from '../../src/v2/contracts/projection.js';
import type { WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';

const outputSchema: JsonSchema = {
  type: 'object',
  required: ['ready'],
  properties: { ready: { type: 'boolean' } },
  additionalProperties: false,
};

const compiledPackage: TargetCompiledDomainPackage = {
  manifest: {
    formatVersion: '2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'revision-fixture',
    domainVersion: '0.2.0',
    packageId: 'pkg-a',
    targetProfileId: 'portable-test',
    requiredCapabilities: [],
    workflows: {},
    tools: {},
    projections: {
      summary: {
        projectionId: 'summary',
        expression: 'fixture-expression',
        dependencies: [
          { kind: 'workflow', selector: { workflowId: 'primary' } },
          { kind: 'business', source: 'orders', selector: {} },
        ],
        outputSchema,
      },
    },
    schemas: {},
    bindingDigests: {},
  },
  bindings: {},
};

function workflow(stateRevision: number): WorkflowInstanceSnapshot {
  return {
    address: { workflowId: 'primary', instanceKey: 'case-1' },
    correlationId: 'corr-1',
    packageId: 'pkg-a',
    lifecycle: 'active',
    stateRevision,
    state: { phase: 'active' },
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:01.000Z',
  };
}

class MutableBusinessSource implements BusinessSnapshotPort {
  current: BusinessSnapshot = {
    source: 'orders',
    key: 'case-1',
    revision: 'orders-r1',
    value: { approved: true },
  };

  async read(): Promise<BusinessSnapshot> {
    return this.current;
  }
}

test('G25: projection revision identity includes package, projection, workflow and business revisions', async () => {
  let workflowSnapshot = workflow(4);
  const business = new MutableBusinessSource();
  const service = new ProjectionService({
    packageRegistry: {
      defaultPackageId: 'pkg-a',
      get: (packageId) => (packageId === 'pkg-a' ? compiledPackage : undefined),
      has: (packageId) => packageId === 'pkg-a',
      listPackageIds: () => ['pkg-a'],
    },
    store: {
      async getInstance() {
        return workflowSnapshot;
      },
    },
    businessSnapshots: business,
    expression: {
      async evaluate() {
        return { ready: true };
      },
    },
    sha256: {
      async digestUtf8(value) {
        return value;
      },
    },
  });

  const first = await service.read({ projectionId: 'summary', key: 'case-1' });
  assert.match(first.revision, /"packageId":"pkg-a"/);
  assert.match(first.revision, /"projectionId":"summary"/);
  assert.match(first.revision, /"stateRevision":4/);
  assert.match(first.revision, /"revision":"orders-r1"/);

  workflowSnapshot = workflow(5);
  const workflowChanged = await service.read({ projectionId: 'summary', key: 'case-1' });
  assert.notEqual(workflowChanged.revision, first.revision);

  business.current = {
    ...business.current,
    revision: 'orders-r2',
  };
  const businessChanged = await service.read({ projectionId: 'summary', key: 'case-1' });
  assert.notEqual(businessChanged.revision, workflowChanged.revision);
  assert.match(businessChanged.revision, /"revision":"orders-r2"/);
});
