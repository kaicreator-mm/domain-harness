import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  APP_CONTRACT_SOURCE_FORMAT,
  AppContractGenerationError,
  generateTypedAppContracts,
  type CompiledAppContractSource,
} from '../../src/compiler/app-contracts.js';
import {
  orderAppContracts,
  orderManifest,
} from '../fixtures/app-contracts/order-app-source.js';

const GOLDEN_URL = new URL('../fixtures/app-contracts/order-app.generated.ts', import.meta.url);

test('generation matches the checked-in golden and excludes engine/runtime internals', () => {
  const generated = generateTypedAppContracts(orderManifest, orderAppContracts);
  assert.equal(generated, readFileSync(GOLDEN_URL, 'utf8'));
  assert.doesNotMatch(generated, /xstate/i);
  assert.doesNotMatch(generated, /actor/i);
  assert.doesNotMatch(generated, /snapshot/i);
  assert.doesNotMatch(generated, /workflowId|messageType|projectionId|packageId/);
  assert.doesNotMatch(generated, /Schema_XStateInternalOnly|privateActorRef/);
  assert.doesNotMatch(generated, /internal-a|internal_a/);
  assert.match(generated, /readonly "submitOrder"/);
  assert.match(generated, /export type AppCommand/);
  assert.match(generated, /AppWatchRequest/);
  assert.match(generated, /AppDomainEvent/);
});

test('generation is deterministic for compiled schema insertion order', () => {
  const reorderedManifest = {
    ...orderManifest,
    schemas: Object.fromEntries(Object.entries(orderManifest.schemas).reverse()),
  };
  assert.equal(
    generateTypedAppContracts(reorderedManifest, orderAppContracts),
    generateTypedAppContracts(orderManifest, orderAppContracts),
  );
});

test('public contract ordering is locale-independent code-unit order', () => {
  const source = {
    ...orderAppContracts,
    commands: [
      {
        commandId: 'a-command',
        workflowId: 'orderLifecycle',
        messageType: 'submitOrder',
        outcomeSchemaId: 'SubmitOrderOutcome',
      },
      {
        commandId: 'Z-command',
        workflowId: 'orderLifecycle',
        messageType: 'submitOrder',
        outcomeSchemaId: 'SubmitOrderOutcome',
      },
    ],
  } satisfies CompiledAppContractSource;
  const generated = generateTypedAppContracts(orderManifest, source);
  assert.ok(generated.indexOf('readonly "Z-command"') < generated.indexOf('readonly "a-command"'));
});

test('source format, exact package binding and compiled schema references fail closed', () => {
  assert.throws(
    () =>
      generateTypedAppContracts(orderManifest, {
        ...orderAppContracts,
        format: 'domain-harness.app-contracts.invalid',
      } as unknown as CompiledAppContractSource),
    (error) =>
      error instanceof AppContractGenerationError && error.code === 'SOURCE_FORMAT_MISMATCH',
  );

  assert.throws(
    () => generateTypedAppContracts(orderManifest, { ...orderAppContracts, packageId: 'wrong' }),
    (error) => error instanceof AppContractGenerationError && error.code === 'PACKAGE_MISMATCH',
  );

  assert.throws(
    () =>
      generateTypedAppContracts(orderManifest, {
        ...orderAppContracts,
        commands: [
          {
            commandId: 'missing',
            workflowId: 'orderLifecycle',
            messageType: 'missing',
            outcomeSchemaId: 'SubmitOrderOutcome',
          },
        ],
      }),
    (error) =>
      error instanceof AppContractGenerationError && error.code === 'MISSING_MESSAGE_CONTRACT',
  );

  assert.throws(
    () =>
      generateTypedAppContracts(orderManifest, {
        ...orderAppContracts,
        views: [
          {
            viewId: 'bad',
            projectionId: 'orderSummary',
            inputSchemaId: 'MissingSchema',
          },
        ],
      }),
    (error) => error instanceof AppContractGenerationError && error.code === 'MISSING_SCHEMA',
  );
});

test('compatible type plus enum remains representable', () => {
  const manifest = {
    ...orderManifest,
    schemas: {
      ...orderManifest.schemas,
      TypedEnumOutcome: {
        type: 'string',
        enum: ['accepted', 'rejected'],
      },
    },
  };
  const source = {
    ...orderAppContracts,
    commands: [
      {
        commandId: 'submitOrder',
        workflowId: 'orderLifecycle',
        messageType: 'submitOrder',
        outcomeSchemaId: 'TypedEnumOutcome',
      },
    ],
  } satisfies CompiledAppContractSource;

  assert.match(
    generateTypedAppContracts(manifest, source),
    /Schema_TypedEnumOutcome = "accepted" \| "rejected"/,
  );
});

test('unrepresented schema semantics fail closed instead of widening silently', () => {
  const manifest = {
    ...orderManifest,
    schemas: {
      ...orderManifest.schemas,
      UnsupportedOutcome: {
        type: 'object',
        properties: {
          code: { type: 'string', pattern: '^ORD-[0-9]+$' },
        },
        required: ['code'],
        additionalProperties: false,
      },
    },
  };
  const source = {
    ...orderAppContracts,
    format: APP_CONTRACT_SOURCE_FORMAT,
    commands: [
      {
        commandId: 'submitOrder',
        workflowId: 'orderLifecycle',
        messageType: 'submitOrder',
        outcomeSchemaId: 'UnsupportedOutcome',
      },
    ],
  } satisfies CompiledAppContractSource;

  assert.throws(
    () => generateTypedAppContracts(manifest, source),
    (error) => error instanceof AppContractGenerationError && error.code === 'UNSUPPORTED_SCHEMA',
  );
});

test('ambiguous supported-keyword combinations fail closed', () => {
  const manifest = {
    ...orderManifest,
    schemas: {
      ...orderManifest.schemas,
      UnsupportedOutcome: {
        type: 'object',
        oneOf: [
          {
            type: 'object',
            properties: { status: { const: 'accepted' } },
            required: ['status'],
            additionalProperties: false,
          },
        ],
      },
    },
  };
  const source = {
    ...orderAppContracts,
    commands: [
      {
        commandId: 'submitOrder',
        workflowId: 'orderLifecycle',
        messageType: 'submitOrder',
        outcomeSchemaId: 'UnsupportedOutcome',
      },
    ],
  } satisfies CompiledAppContractSource;

  assert.throws(
    () => generateTypedAppContracts(manifest, source),
    (error) => error instanceof AppContractGenerationError && error.code === 'UNSUPPORTED_SCHEMA',
  );
});

test('overlapping oneOf branches fail closed unless a discriminator proves exclusivity', () => {
  const manifest = {
    ...orderManifest,
    schemas: {
      ...orderManifest.schemas,
      UnsupportedOutcome: {
        oneOf: [
          {
            type: 'object',
            properties: { kind: { const: 'same' }, left: { type: 'string' } },
            required: ['kind'],
            additionalProperties: true,
          },
          {
            type: 'object',
            properties: { kind: { const: 'same' }, right: { type: 'string' } },
            required: ['kind'],
            additionalProperties: true,
          },
        ],
      },
    },
  };
  const source = {
    ...orderAppContracts,
    commands: [
      {
        commandId: 'submitOrder',
        workflowId: 'orderLifecycle',
        messageType: 'submitOrder',
        outcomeSchemaId: 'UnsupportedOutcome',
      },
    ],
  } satisfies CompiledAppContractSource;

  assert.throws(
    () => generateTypedAppContracts(manifest, source),
    (error) => error instanceof AppContractGenerationError && error.code === 'UNSUPPORTED_SCHEMA',
  );
});

test('required properties without explicit schemas fail closed', () => {
  const manifest = {
    ...orderManifest,
    schemas: {
      ...orderManifest.schemas,
      UnsupportedOutcome: {
        type: 'object',
        required: ['status'],
        additionalProperties: true,
      },
    },
  };
  const source = {
    ...orderAppContracts,
    commands: [
      {
        commandId: 'submitOrder',
        workflowId: 'orderLifecycle',
        messageType: 'submitOrder',
        outcomeSchemaId: 'UnsupportedOutcome',
      },
    ],
  } satisfies CompiledAppContractSource;

  assert.throws(
    () => generateTypedAppContracts(manifest, source),
    (error) => error instanceof AppContractGenerationError && error.code === 'UNSUPPORTED_SCHEMA',
  );
});

test('typed additionalProperties with named properties fails closed', () => {
  const manifest = {
    ...orderManifest,
    schemas: {
      ...orderManifest.schemas,
      UnsupportedOutcome: {
        type: 'object',
        properties: { status: { type: 'string' } },
        required: ['status'],
        additionalProperties: { type: 'number' },
      },
    },
  };
  const source = {
    ...orderAppContracts,
    commands: [
      {
        commandId: 'submitOrder',
        workflowId: 'orderLifecycle',
        messageType: 'submitOrder',
        outcomeSchemaId: 'UnsupportedOutcome',
      },
    ],
  } satisfies CompiledAppContractSource;

  assert.throws(
    () => generateTypedAppContracts(manifest, source),
    (error) => error instanceof AppContractGenerationError && error.code === 'UNSUPPORTED_SCHEMA',
  );
});
