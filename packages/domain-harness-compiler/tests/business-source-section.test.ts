import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DOMAIN_HARNESS_JSON_SCHEMA_V1,
  canonicalJsonStringify,
  compiledBusinessSourceIdentityMaterial,
  type PackageDataBounds,
} from '@kaicreator/domain-harness/v2';
import type { RawProjectionDefinition } from '../src/raw/types.js';
import {
  buildCompiledBusinessSourceSection,
  BusinessSourceCompileError,
} from '../src/package/business-sources.js';

const BOUNDS: PackageDataBounds = {
  maxDomainDataEntries: 0,
  maxDomainDataEntryCanonicalBytes: 0,
  maxTotalDomainDataCanonicalBytes: 0,
  maxBusinessSources: 4,
  maxSchemaCanonicalBytes: 1024,
};

function projection(source: string): RawProjectionDefinition {
  return {
    projectionId: 'dashboard',
    expression: '$',
    dependencies: [{ kind: 'business', source, selector: {} }],
    outputSchema: {},
  };
}

test('I-BIZ-SRC: declarations normalize by exact source ordering and bind schema contract identity', () => {
  const left = buildCompiledBusinessSourceSection([
    { source: 'z', valueSchema: { type: 'string' } },
    { source: 'a', valueSchema: { type: 'number' } },
  ], BOUNDS, [projection('a'), projection('z')]);
  const right = buildCompiledBusinessSourceSection([
    { source: 'a', valueSchema: { type: 'number' } },
    { source: 'z', valueSchema: { type: 'string' } },
  ], BOUNDS, [projection('z'), projection('a')]);

  assert.equal(left.schemaContractVersion, DOMAIN_HARNESS_JSON_SCHEMA_V1);
  assert.deepEqual(left.descriptors.map((descriptor) => descriptor.source), ['a', 'z']);
  assert.equal(
    canonicalJsonStringify(compiledBusinessSourceIdentityMaterial(left)),
    canonicalJsonStringify(compiledBusinessSourceIdentityMaterial(right)),
  );
  assert.equal(left.descriptors.some((descriptor) => descriptor.validatorBindingDigest !== undefined), false);
});

test('I-BIZ-SRC: duplicate/empty declarations and undeclared projection source fail compile', () => {
  assert.throws(
    () => buildCompiledBusinessSourceSection([
      { source: 'orders', valueSchema: { type: 'object' } },
      { source: 'orders', valueSchema: { type: 'object' } },
      { source: '', valueSchema: { type: 'object' } },
    ], BOUNDS, [projection('missing')]),
    (error: unknown) => error instanceof BusinessSourceCompileError
      && error.issues.some((issue) => issue.includes("duplicate Business Source 'orders'"))
      && error.issues.some((issue) => issue.includes('non-empty string'))
      && error.issues.some((issue) => issue.includes("undeclared Business Source 'missing'")),
  );
});

test('I-BIZ-SRC: orphan Business Source declarations fail compile', () => {
  assert.throws(
    () => buildCompiledBusinessSourceSection([
      { source: 'orders', valueSchema: { type: 'object' } },
      { source: 'unused', valueSchema: { type: 'object' } },
    ], BOUNDS, [projection('orders')]),
    (error: unknown) => error instanceof BusinessSourceCompileError
      && error.issues.some((issue) => issue.includes("orphan Business Source 'unused'")),
  );
});

test('I-BIZ-SRC: exact schema profile and schema byte bounds fail closed', () => {
  assert.throws(
    () => buildCompiledBusinessSourceSection([
      { source: 'orders', valueSchema: { type: 'object', customKeyword: true } },
    ], BOUNDS, [projection('orders')]),
    BusinessSourceCompileError,
  );

  assert.throws(
    () => buildCompiledBusinessSourceSection([
      { source: 'orders', valueSchema: { type: 'object', properties: { long: { type: 'string' } } } },
    ], { ...BOUNDS, maxSchemaCanonicalBytes: 4 }, [projection('orders')]),
    (error: unknown) => error instanceof BusinessSourceCompileError
      && error.issues.some((issue) => issue.includes('maxSchemaCanonicalBytes')),
  );
});

test('I-BIZ-SRC: source-count bound is exact and zero capacity is meaningful', () => {
  assert.deepEqual(
    buildCompiledBusinessSourceSection([], { ...BOUNDS, maxBusinessSources: 0 }, []).descriptors,
    [],
  );
  assert.throws(
    () => buildCompiledBusinessSourceSection([
      { source: 'orders', valueSchema: { type: 'object' } },
    ], { ...BOUNDS, maxBusinessSources: 0 }, [projection('orders')]),
    BusinessSourceCompileError,
  );
});
