import {
  APP_CONTRACT_SOURCE_FORMAT,
  type CompiledAppContractSource,
} from '../../../src/compiler/app-contracts.js';
import type { CompiledPackageManifest } from '../../../src/v2/contracts/package.js';

export const orderManifest = {
  formatVersion: '2',
  runtimeContractMajor: 2,
  executionEngineMajor: 2,
  domainId: 'orders',
  domainVersion: '3.0.0',
  packageId: 'pkg_orders_exact_001',
  targetProfileId: 'portable',
  requiredCapabilities: [],
  workflows: {
    orderLifecycle: {
      workflowId: 'orderLifecycle',
      definition: {
        privateXstateIdentity: 'xstate://actor/orderLifecycle#awaiting_review',
        snapshotBytes: 'PRIVATE_SNAPSHOT_BYTES',
      },
      messageContracts: {
        submitOrder: {
          type: 'order.submit',
          payloadSchema: { $ref: '#/schemas/SubmitOrderPayload' },
        },
        orderChanged: {
          type: 'order.changed',
          payloadSchema: { $ref: '#/schemas/OrderChangedEvent' },
        },
      },
    },
  },
  tools: {},
  projections: {
    orderSummary: {
      projectionId: 'orderSummary',
      expression: '$',
      dependencies: [],
      outputSchema: { $ref: '#/schemas/OrderSummary' },
    },
  },
  schemas: {
    XStateInternalOnly: {
      type: 'object',
      properties: {
        privateActorRef: { type: 'string' },
      },
      required: ['privateActorRef'],
      additionalProperties: false,
    },
    'internal-a': { type: 'string' },
    internal_a: { type: 'number' },
    SubmitOrderPayload: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        amount: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['orderId', 'amount'],
      additionalProperties: false,
    },
    SubmitOrderOutcome: {
      oneOf: [
        {
          type: 'object',
          properties: {
            status: { const: 'accepted' },
            sequence: { type: 'integer' },
          },
          required: ['status', 'sequence'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            status: { const: 'rejected' },
            reason: { type: 'string' },
          },
          required: ['status', 'reason'],
          additionalProperties: false,
        },
      ],
    },
    OrderViewInput: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
      },
      required: ['orderId'],
      additionalProperties: false,
    },
    OrderSummary: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        status: { enum: ['pending', 'accepted', 'rejected'] },
        amount: { type: 'number' },
      },
      required: ['orderId', 'status', 'amount'],
      additionalProperties: false,
    },
    OrderChangedEvent: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        status: { enum: ['pending', 'accepted', 'rejected'] },
      },
      required: ['orderId', 'status'],
      additionalProperties: false,
    },
  },
  bindingDigests: {},
} satisfies CompiledPackageManifest;

export const orderAppContracts = {
  format: APP_CONTRACT_SOURCE_FORMAT,
  packageId: orderManifest.packageId,
  commands: [
    {
      commandId: 'submitOrder',
      workflowId: 'orderLifecycle',
      messageType: 'submitOrder',
      outcomeSchemaId: 'SubmitOrderOutcome',
    },
  ],
  views: [
    {
      viewId: 'orderSummary',
      projectionId: 'orderSummary',
      inputSchemaId: 'OrderViewInput',
    },
  ],
  watches: [
    {
      watchId: 'watchOrderSummary',
      viewId: 'orderSummary',
    },
  ],
  domainEvents: [
    {
      eventId: 'orderChanged',
      workflowId: 'orderLifecycle',
      messageType: 'orderChanged',
    },
  ],
} satisfies CompiledAppContractSource;
