import assert from 'node:assert/strict';
import test from 'node:test';
import type { PackageDataBounds } from '@kaicreator/domain-harness/v2';
import {
  buildCompiledDomainDataSection,
  DomainDataCompileError,
} from '../src/package/domain-data.js';

const BOUNDS: PackageDataBounds = {
  maxDomainDataEntries: 1,
  maxDomainDataEntryCanonicalBytes: 128,
  maxTotalDomainDataCanonicalBytes: 128,
  maxBusinessSources: 0,
  maxSchemaCanonicalBytes: 128,
};

test('I-PKG-DATA: compiler rejects non-object valueSchema shapes', () => {
  for (const valueSchema of ['string-schema', 1, true, [], null] as const) {
    assert.throws(
      () => buildCompiledDomainDataSection([
        { key: 'a', value: { ok: true }, valueSchema: valueSchema as never },
      ], BOUNDS, []),
      (error: unknown) => error instanceof DomainDataCompileError
        && error.issues.some((issue) => issue.includes('valueSchema must be a canonical JSON object')),
    );
  }
});
