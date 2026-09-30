import assert from 'node:assert/strict';
import test from 'node:test';

import { DOMAIN_HARNESS_JSON_SCHEMA_V1, type PackageDataBounds } from '../../src/v2/index.js';
import {
  BusinessSourceIntegrityError,
  validateCompiledBusinessSourceSection,
} from '../../src/package/index.js';

const BOUNDS: PackageDataBounds = {
  maxDomainDataEntries: 0,
  maxDomainDataEntryCanonicalBytes: 0,
  maxTotalDomainDataCanonicalBytes: 0,
  maxBusinessSources: 2,
  maxSchemaCanonicalBytes: 512,
};

test('I-BIZ-SRC: activation validates exact schema contract and sorted declarations', () => {
  const validated = validateCompiledBusinessSourceSection({
    schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
    descriptors: [
      { source: 'a', valueSchema: { type: 'number' } },
      { source: 'z', valueSchema: { type: 'string' } },
    ],
  }, BOUNDS);
  assert.deepEqual(validated.descriptors.map((descriptor) => descriptor.source), ['a', 'z']);
});

test('I-BIZ-SRC: activation rejects duplicate, unsorted and over-count declarations', () => {
  for (const value of [
    {
      schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
      descriptors: [
        { source: 'a', valueSchema: { type: 'number' } },
        { source: 'a', valueSchema: { type: 'number' } },
      ],
    },
    {
      schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
      descriptors: [
        { source: 'z', valueSchema: { type: 'string' } },
        { source: 'a', valueSchema: { type: 'number' } },
      ],
    },
  ]) {
    assert.throws(() => validateCompiledBusinessSourceSection(value, BOUNDS), BusinessSourceIntegrityError);
  }

  assert.throws(
    () => validateCompiledBusinessSourceSection({
      schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
      descriptors: [
        { source: 'a', valueSchema: {} },
        { source: 'b', valueSchema: {} },
        { source: 'c', valueSchema: {} },
      ],
    }, BOUNDS),
    (error: unknown) => error instanceof BusinessSourceIntegrityError
      && error.code === 'BUSINESS_SOURCE_BOUNDS_EXCEEDED',
  );
});

test('I-BIZ-SRC: activation rejects wrong schema contract, invalid/over-bound schema', () => {
  assert.throws(
    () => validateCompiledBusinessSourceSection({
      schemaContractVersion: 'other',
      descriptors: [],
    }, BOUNDS),
    BusinessSourceIntegrityError,
  );

  assert.throws(
    () => validateCompiledBusinessSourceSection({
      schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
      descriptors: [{ source: 'a', valueSchema: { type: 'string', customKeyword: true } }],
    }, BOUNDS),
    (error: unknown) => error instanceof BusinessSourceIntegrityError
      && error.code === 'BUSINESS_SOURCE_SCHEMA_INVALID',
  );

  assert.throws(
    () => validateCompiledBusinessSourceSection({
      schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
      descriptors: [{ source: 'a', valueSchema: { type: 'string' } }],
    }, { ...BOUNDS, maxSchemaCanonicalBytes: 2 }),
    (error: unknown) => error instanceof BusinessSourceIntegrityError
      && error.code === 'BUSINESS_SOURCE_BOUNDS_EXCEEDED',
  );
});

test('I-BIZ-SRC: validatorBindingDigest fails closed while Mode-B bytes are unavailable', () => {
  assert.throws(
    () => validateCompiledBusinessSourceSection({
      schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
      descriptors: [{
        source: 'a',
        valueSchema: { type: 'string' },
        validatorBindingDigest: 'sha256:placeholder',
      }],
    }, BOUNDS),
    (error: unknown) => error instanceof BusinessSourceIntegrityError
      && error.code === 'VALIDATOR_BINDING_UNAVAILABLE',
  );
});
