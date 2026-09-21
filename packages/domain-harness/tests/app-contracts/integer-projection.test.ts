import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonSchema } from '../../src/contracts/json.js';
import {
  AppContractGenerationError,
  generateTypedAppContracts,
  type CompiledAppContractSource,
} from '../../src/compiler/app-contracts.js';
import {
  orderAppContracts,
  orderManifest,
} from '../fixtures/app-contracts/order-app-source.js';

const PROJECTION_SCHEMA_ID = 'ProjectionUnderTest';

function generateOutcome(schema: JsonSchema): string {
  const manifest = {
    ...orderManifest,
    schemas: {
      ...orderManifest.schemas,
      [PROJECTION_SCHEMA_ID]: schema,
    },
  };
  const source: CompiledAppContractSource = {
    ...orderAppContracts,
    commands: [
      {
        commandId: 'submitOrder',
        workflowId: 'orderLifecycle',
        messageType: 'submitOrder',
        outcomeSchemaId: PROJECTION_SCHEMA_ID,
      },
    ],
  };
  return generateTypedAppContracts(manifest, source);
}

function captureUnsupported(schema: JsonSchema): AppContractGenerationError {
  try {
    generateOutcome(schema);
  } catch (error) {
    assert.ok(error instanceof AppContractGenerationError);
    assert.equal(error.code, 'UNSUPPORTED_SCHEMA');
    return error;
  }
  assert.fail('expected deterministic unsupported-schema rejection');
}

test('arbitrary JSON Schema integer projection fails closed instead of widening to TypeScript number', () => {
  const first = captureUnsupported({ type: 'integer' });
  const second = captureUnsupported({ type: 'integer' });

  assert.equal(first.path, `schemas.${PROJECTION_SCHEMA_ID}.type`);
  assert.equal(second.message, first.message);
  assert.match(first.message, /integer cannot be represented exactly/i);
});

test('fractional numbers cannot pass through a generated contract that claims arbitrary integer semantics', () => {
  const error = captureUnsupported({ type: 'integer' });
  assert.match(error.message, /unbranded TypeScript contract/i);

  const exactIntegerEnum = generateOutcome({ type: 'integer', enum: [1, 2] });
  assert.match(exactIntegerEnum, /Schema_ProjectionUnderTest = 1 \| 2;/);
  assert.doesNotMatch(exactIntegerEnum, /Schema_ProjectionUnderTest = number;/);
});

test('nested integer projection fails closed', () => {
  const error = captureUnsupported({
    type: 'object',
    properties: {
      outer: {
        type: 'object',
        properties: { count: { type: 'integer' } },
        required: ['count'],
        additionalProperties: false,
      },
    },
    required: ['outer'],
    additionalProperties: false,
  });

  assert.equal(
    error.path,
    `schemas.${PROJECTION_SCHEMA_ID}.properties.outer.properties.count.type`,
  );
});

test('integer array items fail closed', () => {
  const error = captureUnsupported({
    type: 'array',
    items: { type: 'integer' },
  });

  assert.equal(error.path, `schemas.${PROJECTION_SCHEMA_ID}.items.type`);
});

test('integer object properties fail closed', () => {
  const error = captureUnsupported({
    type: 'object',
    properties: { count: { type: 'integer' } },
    required: ['count'],
    additionalProperties: false,
  });

  assert.equal(error.path, `schemas.${PROJECTION_SCHEMA_ID}.properties.count.type`);
});

test('integer cannot be silently widened through type arrays or composition members', () => {
  const oneOfError = captureUnsupported({
    oneOf: [
      {
        type: 'object',
        properties: {
          kind: { const: 'count' },
          value: { type: 'integer' },
        },
        required: ['kind', 'value'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          kind: { const: 'text' },
          value: { type: 'string' },
        },
        required: ['kind', 'value'],
        additionalProperties: false,
      },
    ],
  });
  assert.equal(
    oneOfError.path,
    `schemas.${PROJECTION_SCHEMA_ID}.oneOf[0].properties.value.type`,
  );

  const anyOfError = captureUnsupported({
    anyOf: [{ type: 'string' }, { type: 'integer' }],
  });
  assert.equal(anyOfError.path, `schemas.${PROJECTION_SCHEMA_ID}.anyOf[1].type`);

  const allOfError = captureUnsupported({
    allOf: [{ type: 'integer' }, { const: 1 }],
  });
  assert.equal(allOfError.path, `schemas.${PROJECTION_SCHEMA_ID}.allOf[0].type`);

  const typeArrayError = captureUnsupported({ type: ['string', 'integer'] });
  assert.equal(typeArrayError.path, `schemas.${PROJECTION_SCHEMA_ID}.type`);
});

test('representable number schema still generates ordinary TypeScript number', () => {
  const generated = generateOutcome({ type: 'number' });
  assert.match(generated, /Schema_ProjectionUnderTest = number;/);
});

test('string boolean null and exact-enum projections remain representable', () => {
  assert.match(generateOutcome({ type: 'string' }), /Schema_ProjectionUnderTest = string;/);
  assert.match(generateOutcome({ type: 'boolean' }), /Schema_ProjectionUnderTest = boolean;/);
  assert.match(generateOutcome({ type: 'null' }), /Schema_ProjectionUnderTest = null;/);
  assert.match(
    generateOutcome({ type: 'string', enum: ['accepted', 'rejected'] }),
    /Schema_ProjectionUnderTest = "accepted" \| "rejected";/,
  );
});
