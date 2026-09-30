import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonObject, JsonSchema, JsonValue } from '../../src/contracts/json.js';
import type { CompiledBusinessSourceContractPort } from '../../src/projection/compiled-business-source.js';
import { ProjectionError, ProjectionService } from '../../src/projection/projection-service.js';
import { DOMAIN_HARNESS_JSON_SCHEMA_V1 } from '../../src/schema/domainharness-json-schema-v1.js';
import type { ExpressionExecutorPort, Sha256Port } from '../../src/v2/contracts/host.js';
import type {
  PackageRegistry,
  ProjectionDependencyDescriptor,
  TargetCompiledDomainPackage,
} from '../../src/v2/contracts/package.js';
import type { BusinessSnapshot, BusinessSnapshotPort } from '../../src/v2/contracts/projection.js';

function outputSchema(): JsonSchema {
  return {
    type: 'object',
    required: ['ready'],
    properties: { ready: { type: 'boolean' } },
    additionalProperties: false,
  };
}

function compiledPackage(
  dependencies: readonly ProjectionDependencyDescriptor[],
  profile: 'successor' | 'legacy' = 'successor',
): TargetCompiledDomainPackage {
  return {
    manifest: {
      formatVersion: profile === 'successor' ? '0.3' : '0.2',
      runtimeContractMajor: 2,
      executionEngineMajor: profile === 'successor' ? 3 : 2,
      domainId: 'fixture-domain',
      domainVersion: '0.2.0',
      packageId: 'pkg-business',
      targetProfileId: 'portable-test',
      requiredCapabilities: [],
      workflows: {},
      tools: {},
      projections: {
        dashboard: {
          projectionId: 'dashboard',
          expression: '$',
          dependencies,
          outputSchema: outputSchema(),
        },
      },
      schemas: {},
      bindingDigests: {},
    },
    bindings: {},
  };
}

function registry(pkg: TargetCompiledDomainPackage): PackageRegistry {
  return {
    defaultPackageId: pkg.manifest.packageId,
    get: (packageId) => (packageId === pkg.manifest.packageId ? pkg : undefined),
    has: (packageId) => packageId === pkg.manifest.packageId,
    listPackageIds: () => [pkg.manifest.packageId],
  };
}

function sha256(): Sha256Port {
  return { async digestUtf8(value) { return `fixture:${value}`; } };
}

function businessContract(
  schema: JsonSchema,
  source = 'orders',
): CompiledBusinessSourceContractPort {
  return {
    get(packageId, requestedSource) {
      if (packageId !== 'pkg-business' || requestedSource !== source) return undefined;
      return {
        schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
        descriptor: { source, valueSchema: schema },
      };
    },
  };
}

function businessDependency(source = 'orders'): ProjectionDependencyDescriptor {
  return { kind: 'business', source, selector: {} };
}

function expression(onInput?: (input: JsonObject) => void): ExpressionExecutorPort {
  return {
    async evaluate(request) {
      const input = request.input as JsonObject;
      onInput?.(input);
      return { ready: true };
    },
  };
}

test('I-BIZ-SRC: successor package-pinned schema validates and detaches Business Snapshot before evaluation', async () => {
  const pkg = compiledPackage([businessDependency()]);
  const sourceValue = { approved: true };
  let observed: JsonValue | undefined;
  const service = new ProjectionService({
    packageRegistry: registry(pkg),
    store: { async getInstance() { return null; } },
    businessSnapshots: {
      async read() {
        return { source: 'orders', key: 'case-1', revision: 'r1', value: sourceValue };
      },
    },
    businessSourceContracts: businessContract({
      type: 'object',
      required: ['approved'],
      properties: { approved: { type: 'boolean' } },
      additionalProperties: false,
    }),
    expression: expression((input) => {
      const business = input.business as JsonValue[];
      observed = (business[0] as JsonObject).value;
      sourceValue.approved = false;
    }),
    sha256: sha256(),
  });

  await service.read({ projectionId: 'dashboard', key: 'case-1' });
  assert.deepEqual(observed, { approved: true });
  assert.equal(sourceValue.approved, false);
});

test('I-BIZ-SRC: successor schema violation fails before expression evaluation', async () => {
  const pkg = compiledPackage([businessDependency()]);
  let evaluated = false;
  const service = new ProjectionService({
    packageRegistry: registry(pkg),
    store: { async getInstance() { return null; } },
    businessSnapshots: {
      async read() {
        return { source: 'orders', key: 'case-1', revision: 'r1', value: { approved: 'yes' } as never };
      },
    },
    businessSourceContracts: businessContract({
      type: 'object',
      required: ['approved'],
      properties: { approved: { type: 'boolean' } },
    }),
    expression: expression(() => { evaluated = true; }),
    sha256: sha256(),
  });

  await assert.rejects(
    service.read({ projectionId: 'dashboard', key: 'case-1' }),
    (error: unknown) => error instanceof ProjectionError
      && error.code === 'business_snapshot_schema_violation',
  );
  assert.equal(evaluated, false);
});

test('I-BIZ-SRC: successor contract lookup fails closed before SoR read when source is undeclared', async () => {
  const pkg = compiledPackage([businessDependency('missing')]);
  let reads = 0;
  const service = new ProjectionService({
    packageRegistry: registry(pkg),
    store: { async getInstance() { return null; } },
    businessSnapshots: {
      async read() {
        reads += 1;
        return { source: 'missing', key: 'case-1', revision: 'r1', value: null };
      },
    },
    businessSourceContracts: businessContract({ type: 'null' }),
    expression: expression(),
    sha256: sha256(),
  });

  await assert.rejects(
    service.read({ projectionId: 'dashboard', key: 'case-1' }),
    (error: unknown) => error instanceof ProjectionError
      && error.code === 'business_source_contract_missing',
  );
  assert.equal(reads, 0);
});

test('I-BIZ-SRC: successor package cannot bypass schema validation by omitting contract port', async () => {
  const pkg = compiledPackage([businessDependency()]);
  let reads = 0;
  let evaluated = false;
  const service = new ProjectionService({
    packageRegistry: registry(pkg),
    store: { async getInstance() { return null; } },
    businessSnapshots: {
      async read() {
        reads += 1;
        return { source: 'orders', key: 'case-1', revision: 'r1', value: { approved: true } };
      },
    },
    expression: expression(() => { evaluated = true; }),
    sha256: sha256(),
  });

  await assert.rejects(
    service.read({ projectionId: 'dashboard', key: 'case-1' }),
    (error: unknown) => error instanceof ProjectionError
      && error.code === 'business_source_contract_missing',
  );
  assert.equal(reads, 0);
  assert.equal(evaluated, false);
});

test('I-BIZ-SRC: conflicting values for one exact successor source/key/revision fail closed', async () => {
  const pkg = compiledPackage([businessDependency(), businessDependency()]);
  let call = 0;
  const snapshots: BusinessSnapshotPort = {
    async read(): Promise<BusinessSnapshot> {
      call += 1;
      return {
        source: 'orders',
        key: 'case-1',
        revision: 'same-r1',
        value: { amount: call },
      };
    },
  };
  const service = new ProjectionService({
    packageRegistry: registry(pkg),
    store: { async getInstance() { return null; } },
    businessSnapshots: snapshots,
    businessSourceContracts: businessContract({
      type: 'object',
      required: ['amount'],
      properties: { amount: { type: 'number' } },
    }),
    expression: expression(),
    sha256: sha256(),
  });

  await assert.rejects(
    service.read({ projectionId: 'dashboard', key: 'case-1' }),
    (error: unknown) => error instanceof ProjectionError
      && error.code === 'business_snapshot_revision_conflict',
  );
});

test('I-BIZ-SRC: retained 0.2 ignores successor contract port and preserves legacy projection behavior', async () => {
  const pkg = compiledPackage([businessDependency()], 'legacy');
  let evaluated = false;
  const service = new ProjectionService({
    packageRegistry: registry(pkg),
    store: { async getInstance() { return null; } },
    businessSnapshots: {
      async read() {
        return { source: 'orders', key: 'case-1', revision: 'r1', value: 'legacy-untyped' };
      },
    },
    businessSourceContracts: businessContract({ type: 'number' }),
    expression: expression(() => { evaluated = true; }),
    sha256: sha256(),
  });

  await service.read({ projectionId: 'dashboard', key: 'case-1' });
  assert.equal(evaluated, true);
});
