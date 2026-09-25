import assert from 'node:assert/strict';
import test from 'node:test';

import type { EffectExecutionContext } from '../src/v2/contracts/effect.js';
import type { CompiledToolDescriptor } from '../src/v2/contracts/package.js';
import {
  HOST_LOCAL_DOMAIN_TOOL_BINDING_KIND,
  HostLocalDomainToolBindingError,
  createHostLocalDomainToolExecutor,
} from '../src/tool/host-local-contract/index.js';

const CAPABILITY = 'inventory-native@1' as const;
const BINDING_ID = 'inventory-native-v1';
const BINDING_DIGEST = 'sha256:inventory-native-v1';

function descriptor(overrides: Partial<CompiledToolDescriptor> = {}): CompiledToolDescriptor {
  return {
    toolId: 'inventory.reserve',
    inputSchema: {
      type: 'object',
      required: ['sku'],
      additionalProperties: false,
      properties: { sku: { type: 'string' } },
    },
    outputSchema: {
      type: 'object',
      required: ['reserved'],
      additionalProperties: false,
      properties: { reserved: { type: 'boolean' } },
    },
    effect: 'idempotent',
    execution: {
      kind: HOST_LOCAL_DOMAIN_TOOL_BINDING_KIND,
      bindingId: BINDING_ID,
      digest: BINDING_DIGEST,
    },
    requiredCapabilities: [CAPABILITY],
    ...overrides,
  };
}

function context(overrides: Partial<EffectExecutionContext> = {}): EffectExecutionContext {
  return {
    effectId: 'effect-1',
    target: { workflowId: 'order', instanceKey: 'order-1' },
    sourceMessageId: 'message-1',
    logicalTime: '2026-09-21T00:00:00.000Z',
    attempt: 1,
    idempotencyKey: 'idem-1',
    ...overrides,
  };
}

test('binds a compiled logical Tool to an allowlisted host-local capability without exposing runtime internals', async () => {
  let seen: unknown;
  const executor = createHostLocalDomainToolExecutor({
    capabilities: [CAPABILITY],
    bindings: {
      [BINDING_ID]: {
        capability: CAPABILITY,
        digest: BINDING_DIGEST,
        async execute(request) {
          seen = request;
          return { reserved: true };
        },
      },
    },
  });

  const effectContext = context();
  const output = await executor.execute({
    descriptor: descriptor(),
    input: { sku: 'SKU-1' },
    context: effectContext,
  });

  assert.deepEqual(output, { reserved: true });
  assert.deepEqual(seen, {
    toolId: 'inventory.reserve',
    bindingId: BINDING_ID,
    input: { sku: 'SKU-1' },
    context: effectContext,
  });
});

test('fails closed when a required compiled capability is absent from the runtime allowlist', async () => {
  const executor = createHostLocalDomainToolExecutor({
    capabilities: [],
    bindings: {
      [BINDING_ID]: {
        capability: CAPABILITY,
        digest: BINDING_DIGEST,
        async execute() {
          return { reserved: true };
        },
      },
    },
  });

  await assert.rejects(
    executor.execute({ descriptor: descriptor(), input: { sku: 'SKU-1' }, context: context() }),
    (error: unknown) => error instanceof HostLocalDomainToolBindingError && error.code === 'HOST_LOCAL_CAPABILITY_MISSING',
  );
});

test('fails closed for missing, wrong-capability, or digest-mismatched host bindings', async () => {
  const request = { descriptor: descriptor(), input: { sku: 'SKU-1' }, context: context() } as const;

  const missing = createHostLocalDomainToolExecutor({ capabilities: [CAPABILITY], bindings: {} });
  await assert.rejects(
    missing.execute(request),
    (error: unknown) => error instanceof HostLocalDomainToolBindingError && error.code === 'HOST_LOCAL_BINDING_MISSING',
  );

  const wrongCapability = createHostLocalDomainToolExecutor({
    capabilities: [CAPABILITY, 'other-native@1'],
    bindings: {
      [BINDING_ID]: {
        capability: 'other-native@1',
        digest: BINDING_DIGEST,
        async execute() {
          return { reserved: true };
        },
      },
    },
  });
  await assert.rejects(
    wrongCapability.execute(request),
    (error: unknown) => error instanceof HostLocalDomainToolBindingError && error.code === 'HOST_LOCAL_BINDING_NOT_ALLOWED',
  );

  const wrongDigest = createHostLocalDomainToolExecutor({
    capabilities: [CAPABILITY],
    bindings: {
      [BINDING_ID]: {
        capability: CAPABILITY,
        digest: 'sha256:different-binding',
        async execute() {
          return { reserved: true };
        },
      },
    },
  });
  await assert.rejects(
    wrongDigest.execute(request),
    (error: unknown) => error instanceof HostLocalDomainToolBindingError && error.code === 'HOST_LOCAL_BINDING_DIGEST_MISMATCH',
  );
});

test('keeps package schemas authoritative for host-local input and output', async () => {
  let calls = 0;
  const executor = createHostLocalDomainToolExecutor({
    capabilities: [CAPABILITY],
    bindings: {
      [BINDING_ID]: {
        capability: CAPABILITY,
        digest: BINDING_DIGEST,
        async execute() {
          calls += 1;
          return { reserved: 'yes' } as never;
        },
      },
    },
  });

  await assert.rejects(
    executor.execute({ descriptor: descriptor(), input: { sku: 42 } as never, context: context() }),
  );
  assert.equal(calls, 0, 'invalid input must be rejected before the host binding runs');

  await assert.rejects(
    executor.execute({ descriptor: descriptor(), input: { sku: 'SKU-1' }, context: context() }),
  );
  assert.equal(calls, 1, 'invalid output is rejected after exactly one host invocation');
});

test('mutation-capable bindings require a valid durable-effect execution context', async () => {
  let calls = 0;
  const executor = createHostLocalDomainToolExecutor({
    capabilities: [CAPABILITY],
    bindings: {
      [BINDING_ID]: {
        capability: CAPABILITY,
        digest: BINDING_DIGEST,
        async execute() {
          calls += 1;
          return { reserved: true };
        },
      },
    },
  });

  await assert.rejects(
    executor.execute({
      descriptor: descriptor(),
      input: { sku: 'SKU-1' },
      context: context({ idempotencyKey: '' }),
    }),
    (error: unknown) => error instanceof HostLocalDomainToolBindingError && error.code === 'HOST_LOCAL_EFFECT_AUTHORITY_REQUIRED',
  );
  assert.equal(calls, 0);
});

test('rejects non host-local compiled binding kinds', async () => {
  const executor = createHostLocalDomainToolExecutor({ capabilities: [CAPABILITY], bindings: {} });
  await assert.rejects(
    executor.execute({
      descriptor: descriptor({ execution: { kind: 'remote-http-json@1', bindingId: BINDING_ID, digest: BINDING_DIGEST } }),
      input: { sku: 'SKU-1' },
      context: context(),
    }),
    (error: unknown) => error instanceof HostLocalDomainToolBindingError && error.code === 'HOST_LOCAL_BINDING_KIND_INVALID',
  );
});
