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
  maxDomainDataEntryCanonicalBytes: 128,
  maxTotalDomainDataCanonicalBytes: 128,
  maxBusinessSources: 0,
  maxSchemaCanonicalBytes: 128,
};

test('I-PKG-DATA: Runtime integrity rejects non-object valueSchema shapes', async () => {
  const value: JsonValue = { ok: true };
  const contentDigest = await computeCanonicalJsonDigest(value, createSha256Fake());

  for (const valueSchema of ['string-schema', 1, true, [], null] as const) {
    await assert.rejects(
      validateCompiledDomainDataSection({
        descriptors: [{ key: 'a', contentDigest, valueSchema }],
        values: { a: value },
        packageDataBounds: BOUNDS,
      }, createSha256Fake()),
      (error: unknown) => error instanceof DomainDataIntegrityError
        && error.code === 'INVALID_DOMAIN_DATA_SECTION'
        && error.message.includes('valueSchema must be a JSON object'),
    );
  }
});
