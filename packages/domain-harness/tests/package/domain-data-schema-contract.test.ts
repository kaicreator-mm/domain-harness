import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeCanonicalJsonDigest,
  type JsonValue,
  type PackageDataBounds,
} from '../../src/v2/index.js';
import {
  DomainDataIntegrityError,
  validateCompiledDomainDataSection,
} from '../../src/package/index.js';
import { createSha256Fake } from './fixture.js';

const BOUNDS: PackageDataBounds = {
  maxDomainDataEntries: 1,
  maxDomainDataEntryCanonicalBytes: 256,
  maxTotalDomainDataCanonicalBytes: 256,
  maxBusinessSources: 0,
  maxSchemaCanonicalBytes: 512,
};

async function section(value: JsonValue, valueSchema: Record<string, JsonValue>, bounds = BOUNDS) {
  return {
    descriptors: [{
      key: 'catalog',
      contentDigest: await computeCanonicalJsonDigest(value, createSha256Fake()),
      valueSchema,
    }],
    values: { catalog: value },
    packageDataBounds: bounds,
  };
}

test('I-BIZ-SRC: Domain Data valueSchema is revalidated at admission', async () => {
  const schema = {
    type: 'object',
    required: ['count'],
    properties: { count: { type: 'integer', minimum: 0 } },
  } satisfies Record<string, JsonValue>;

  await validateCompiledDomainDataSection(
    await section({ count: 3 }, schema),
    createSha256Fake(),
  );

  await assert.rejects(
    validateCompiledDomainDataSection(
      await section({ count: -1 }, schema),
      createSha256Fake(),
    ),
    (error: unknown) => error instanceof DomainDataIntegrityError
      && error.code === 'DOMAIN_DATA_SCHEMA_VIOLATION',
  );
});

test('I-BIZ-SRC: invalid schema contract and over-bound schema fail admission', async () => {
  await assert.rejects(
    validateCompiledDomainDataSection(
      await section('x', { type: 'string', customKeyword: true }),
      createSha256Fake(),
    ),
    (error: unknown) => error instanceof DomainDataIntegrityError
      && error.code === 'DOMAIN_DATA_SCHEMA_VIOLATION',
  );

  await assert.rejects(
    validateCompiledDomainDataSection(
      await section('x', { type: 'string' }, { ...BOUNDS, maxSchemaCanonicalBytes: 2 }),
      createSha256Fake(),
    ),
    (error: unknown) => error instanceof DomainDataIntegrityError
      && error.code === 'DOMAIN_DATA_BOUNDS_EXCEEDED',
  );
});
