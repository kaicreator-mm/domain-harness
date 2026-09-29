import assert from 'node:assert/strict';
import test from 'node:test';

import type { PackageDataBounds } from '@kaicreator/domain-harness/v2';
import {
  buildCompiledDomainDataSection,
  DomainDataCompileError,
} from '../src/package/domain-data.js';

const BOUNDS: PackageDataBounds = {
  maxDomainDataEntries: 2,
  maxDomainDataEntryCanonicalBytes: 256,
  maxTotalDomainDataCanonicalBytes: 512,
  maxBusinessSources: 0,
  maxSchemaCanonicalBytes: 512,
};

test('I-BIZ-SRC: Domain Data valueSchema validates exact compiled value at compile time', () => {
  const section = buildCompiledDomainDataSection([
    {
      key: 'catalog',
      value: { count: 3 },
      valueSchema: {
        type: 'object',
        required: ['count'],
        properties: { count: { type: 'integer', minimum: 0 } },
        additionalProperties: false,
      },
    },
  ], BOUNDS, []);
  assert.equal(section.descriptors.length, 1);

  assert.throws(
    () => buildCompiledDomainDataSection([
      {
        key: 'catalog',
        value: { count: -1 },
        valueSchema: {
          type: 'object',
          required: ['count'],
          properties: { count: { type: 'integer', minimum: 0 } },
        },
      },
    ], BOUNDS, []),
    (error: unknown) => error instanceof DomainDataCompileError
      && error.issues.some((issue) => issue.includes('INSTANCE_VALIDATION_FAILED')),
  );
});

test('I-BIZ-SRC: Domain Data schema contract and byte bounds fail compile', () => {
  assert.throws(
    () => buildCompiledDomainDataSection([
      { key: 'a', value: 'x', valueSchema: { type: 'string', customKeyword: true } },
    ], BOUNDS, []),
    DomainDataCompileError,
  );

  assert.throws(
    () => buildCompiledDomainDataSection([
      { key: 'a', value: 'x', valueSchema: { type: 'string' } },
    ], { ...BOUNDS, maxSchemaCanonicalBytes: 2 }, []),
    (error: unknown) => error instanceof DomainDataCompileError
      && error.issues.some((issue) => issue.includes('maxSchemaCanonicalBytes')),
  );
});
