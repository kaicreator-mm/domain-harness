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
  maxBusinessSources: 1,
  maxSchemaCanonicalBytes: 256,
};

test('I-BIZ-SRC: activation rejects accessor-backed section without invoking getter', () => {
  let invoked = false;
  const descriptor: Record<string, unknown> = {
    source: 'orders',
  };
  Object.defineProperty(descriptor, 'valueSchema', {
    enumerable: true,
    get() {
      invoked = true;
      return { type: 'object' };
    },
  });

  assert.throws(
    () => validateCompiledBusinessSourceSection({
      schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
      descriptors: [descriptor],
    }, BOUNDS),
    (error: unknown) => error instanceof BusinessSourceIntegrityError
      && error.code === 'INVALID_BUSINESS_SOURCE_SECTION',
  );
  assert.equal(invoked, false);
});
