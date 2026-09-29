import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DomainHarnessJsonSchemaV1Error,
  DomainHarnessJsonSchemaV1Validator,
  JSON_SCHEMA_DRAFT_2020_12_URI,
} from '../../src/schema/domainharness-json-schema-v1.js';

function invalidSchema(error: unknown): boolean {
  return error instanceof DomainHarnessJsonSchemaV1Error
    && error.code === 'INVALID_SCHEMA_CONTRACT';
}

test('I-BIZ-SRC schema v1 accepts Draft 2020-12 local $defs/$ref and validates instances', () => {
  const validator = new DomainHarnessJsonSchemaV1Validator();
  const schema = validator.normalizeSchema({
    $schema: JSON_SCHEMA_DRAFT_2020_12_URI,
    $defs: {
      amount: { type: 'number', minimum: 0 },
    },
    type: 'object',
    required: ['amount'],
    properties: {
      amount: { $ref: '#/$defs/amount' },
    },
    additionalProperties: false,
  });

  assert.deepEqual(validator.validate(schema, { amount: 3 }, 'fixture'), { amount: 3 });
  assert.throws(
    () => validator.validate(schema, { amount: -1 }, 'fixture'),
    (error: unknown) => error instanceof DomainHarnessJsonSchemaV1Error
      && error.code === 'INSTANCE_VALIDATION_FAILED',
  );
});

test('I-BIZ-SRC schema v1 rejects wrong dialect, external refs and vocabulary negotiation', () => {
  const validator = new DomainHarnessJsonSchemaV1Validator();
  for (const schema of [
    { $schema: 'https://json-schema.org/draft/2019-09/schema', type: 'string' },
    { $ref: 'https://example.com/schema.json' },
    { $dynamicRef: 'https://example.com/schema.json#node' },
    { $vocabulary: { 'https://example.com/vocab': true }, type: 'string' },
  ]) {
    assert.throws(() => validator.normalizeSchema(schema), invalidSchema);
  }
});

test('I-BIZ-SRC schema v1 rejects unknown/custom keywords under strict compilation', () => {
  const validator = new DomainHarnessJsonSchemaV1Validator();
  for (const schema of [
    { type: 'string', domainHarnessMagic: true },
    { type: 'string', 'x-domain-harness-magic': true },
  ]) {
    assert.throws(() => validator.normalizeSchema(schema), invalidSchema);
  }
});

test('I-BIZ-SRC schema v1 treats format as annotation-only', () => {
  const validator = new DomainHarnessJsonSchemaV1Validator();
  const schema = validator.normalizeSchema({ type: 'string', format: 'email' });
  assert.equal(validator.validate(schema, 'not-an-email', 'fixture'), 'not-an-email');
});

test('I-BIZ-SRC schema v1 rejects non-object schemas and detaches validated values', () => {
  const validator = new DomainHarnessJsonSchemaV1Validator();
  assert.throws(() => validator.normalizeSchema([]), invalidSchema);

  const source = { nested: { value: 1 } };
  const validated = validator.validate({ type: 'object' }, source, 'fixture');
  source.nested.value = 99;
  assert.deepEqual(validated, { nested: { value: 1 } });
});

test('I-BIZ-SRC schema v1 does not interpret literal instance objects as schema nodes', () => {
  const validator = new DomainHarnessJsonSchemaV1Validator();
  const literal = {
    $ref: 'https://example.com/literal-not-a-schema',
    $schema: 'literal-value',
    domainHarnessMagic: true,
  };
  const schema = validator.normalizeSchema({ const: literal });
  assert.deepEqual(validator.validate(schema, literal, 'literal'), literal);
  assert.throws(
    () => validator.validate(schema, { ...literal, domainHarnessMagic: false }, 'literal'),
    (error: unknown) => error instanceof DomainHarnessJsonSchemaV1Error
      && error.code === 'INSTANCE_VALIDATION_FAILED',
  );
});

test('I-BIZ-SRC schema v1 preserves local Draft 2020-12 dynamic-reference semantics', () => {
  const validator = new DomainHarnessJsonSchemaV1Validator();
  const schema = validator.normalizeSchema({
    $defs: {
      node: {
        $dynamicAnchor: 'node',
        type: 'object',
        required: ['value'],
        properties: {
          value: { type: 'string' },
          next: { $dynamicRef: '#node' },
        },
        additionalProperties: false,
      },
    },
    $ref: '#/$defs/node',
  });

  assert.deepEqual(
    validator.validate(schema, { value: 'a', next: { value: 'b' } }, 'node'),
    { value: 'a', next: { value: 'b' } },
  );
  assert.throws(
    () => validator.validate(schema, { value: 'a', next: { value: 2 } }, 'node'),
    (error: unknown) => error instanceof DomainHarnessJsonSchemaV1Error
      && error.code === 'INSTANCE_VALIDATION_FAILED',
  );
});
