import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DomainHarnessJsonSchemaV1Error,
  DomainHarnessJsonSchemaV1Validator,
} from '../../src/schema/domainharness-json-schema-v1.js';
import { DOMAIN_HARNESS_JSON_SCHEMA_V1_CORPUS } from './domainharness-json-schema-v1-corpus.js';

function invalidSchema(error: unknown): boolean {
  return error instanceof DomainHarnessJsonSchemaV1Error
    && error.code === 'INVALID_SCHEMA_CONTRACT';
}

for (const fixture of DOMAIN_HARNESS_JSON_SCHEMA_V1_CORPUS.acceptReject) {
  test(`I-BIZ-SRC schema v1 shared corpus accept/reject: ${fixture.id}`, () => {
    const validator = new DomainHarnessJsonSchemaV1Validator();
    const schema = validator.normalizeSchema(fixture.schema);

    for (const value of fixture.accepted) {
      assert.deepEqual(validator.validate(schema, value, fixture.id), value);
    }
    for (const value of fixture.rejected) {
      assert.throws(
        () => validator.validate(schema, value, fixture.id),
        (error: unknown) => error instanceof DomainHarnessJsonSchemaV1Error
          && error.code === 'INSTANCE_VALIDATION_FAILED',
      );
    }
  });
}

for (const fixture of DOMAIN_HARNESS_JSON_SCHEMA_V1_CORPUS.invalidSchemas) {
  test(`I-BIZ-SRC schema v1 shared corpus rejects invalid schema: ${fixture.id}`, () => {
    const validator = new DomainHarnessJsonSchemaV1Validator();
    assert.throws(() => validator.normalizeSchema(fixture.schema), invalidSchema);
  });
}

test('I-BIZ-SRC schema v1 rejects non-object schemas and detaches validated values', () => {
  const validator = new DomainHarnessJsonSchemaV1Validator();
  assert.throws(() => validator.normalizeSchema([]), invalidSchema);

  const source = { nested: { value: 1 } };
  const validated = validator.validate({ type: 'object' }, source, 'fixture');
  source.nested.value = 99;
  assert.deepEqual(validated, { nested: { value: 1 } });
});
