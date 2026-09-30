import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeToolExecutor, RuntimeToolBindingError } from '../../src/runtime/tool-executor.js';
import {
  HOST_LOCAL_DOMAIN_TOOL_BINDING_KIND,
  HostLocalDomainToolBindingError,
} from '../../src/tool/host-local-contract/index.js';
import type { EffectExecutionContext } from '../../src/v2/contracts/effect.js';
import type { RuntimeHostBindings } from '../../src/v2/contracts/host.js';
import type { CompiledToolDescriptor } from '../../src/v2/contracts/package.js';
import { createRuntimeHostFake } from '../helpers/runtime-host-fake.js';

const CAPABILITY = 'inventory-native@1' as const;
const BINDING_ID = 'inventory-native-v1';
const BINDING_DIGEST = 'sha256:inventory-native-v1';

function effectContext(): EffectExecutionContext {
  return {
    effectId: 'effect-runtime-1',
    target: { workflowId: 'order', instanceKey: 'order-1' },
    sourceMessageId: 'message-runtime-1',
    logicalTime: '2026-09-30T00:00:00.000Z',
    attempt: 2,
    idempotencyKey: 'idem-runtime-1',
  };
}

function hostLocalDescriptor(
  overrides: Partial<CompiledToolDescriptor> = {},
): CompiledToolDescriptor {
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

function runtimeHost(
  overrides: Partial<RuntimeHostBindings> = {},
): RuntimeHostBindings {
  return createRuntimeHostFake({
    capabilities: [CAPABILITY],
    ...overrides,
  });
}

test('#177 central Runtime executor reaches the exact T-008 host-local binding with durable effect identity', async () => {
  let seen: unknown;
  const context = effectContext();
  const executor = createRuntimeToolExecutor(runtimeHost({
    hostLocalDomainTools: {
      [BINDING_ID]: {
        capability: CAPABILITY,
        digest: BINDING_DIGEST,
        async execute(request) {
          seen = request;
          return { reserved: true };
        },
      },
    },
  }));

  const output = await executor.execute({
    descriptor: hostLocalDescriptor(),
    input: { sku: 'SKU-1' },
    context,
  });

  assert.deepEqual(output, { reserved: true });
  assert.deepEqual(seen, {
    toolId: 'inventory.reserve',
    bindingId: BINDING_ID,
    input: { sku: 'SKU-1' },
    context,
  });
  assert.deepEqual(
    Object.keys(seen as Record<string, unknown>).sort(),
    ['bindingId', 'context', 'input', 'toolId'],
    'host-local callback receives no RuntimeStore, registry, or Runtime internals',
  );
});

test('#177 missing host-local registry fails closed through T-008 and never falls back', async () => {
  const executor = createRuntimeToolExecutor(runtimeHost());

  await assert.rejects(
    executor.execute({
      descriptor: hostLocalDescriptor(),
      input: { sku: 'SKU-1' },
      context: effectContext(),
    }),
    (error: unknown) =>
      error instanceof HostLocalDomainToolBindingError
      && error.code === 'HOST_LOCAL_BINDING_MISSING',
  );
});

test('#177 central dispatch preserves T-008 capability and digest fail-closed checks', async () => {
  const wrongDigest = createRuntimeToolExecutor(runtimeHost({
    hostLocalDomainTools: {
      [BINDING_ID]: {
        capability: CAPABILITY,
        digest: 'sha256:wrong',
        async execute() {
          return { reserved: true };
        },
      },
    },
  }));

  await assert.rejects(
    wrongDigest.execute({
      descriptor: hostLocalDescriptor(),
      input: { sku: 'SKU-1' },
      context: effectContext(),
    }),
    (error: unknown) =>
      error instanceof HostLocalDomainToolBindingError
      && error.code === 'HOST_LOCAL_BINDING_DIGEST_MISMATCH',
  );

  const missingCapability = createRuntimeToolExecutor(runtimeHost({
    capabilities: [],
    hostLocalDomainTools: {
      [BINDING_ID]: {
        capability: CAPABILITY,
        digest: BINDING_DIGEST,
        async execute() {
          return { reserved: true };
        },
      },
    },
  }));

  await assert.rejects(
    missingCapability.execute({
      descriptor: hostLocalDescriptor(),
      input: { sku: 'SKU-1' },
      context: effectContext(),
    }),
    (error: unknown) =>
      error instanceof HostLocalDomainToolBindingError
      && error.code === 'HOST_LOCAL_CAPABILITY_MISSING',
  );
});

test('#177 retained script dispatch remains unchanged and unsupported kinds still fail centrally', async () => {
  let seenContext: EffectExecutionContext | undefined;
  const executor = createRuntimeToolExecutor(runtimeHost({
    script: {
      async execute(request) {
        seenContext = request.context;
        return { reserved: true };
      },
    },
  }));
  const context = effectContext();
  const scriptDescriptor = hostLocalDescriptor({
    execution: { kind: 'script@1', bindingId: 'script-binding-v1' },
    requiredCapabilities: [],
  });

  assert.deepEqual(
    await executor.execute({
      descriptor: scriptDescriptor,
      input: { sku: 'SKU-1' },
      context,
    }),
    { reserved: true },
  );
  assert.deepEqual(seenContext, context);

  await assert.rejects(
    executor.execute({
      descriptor: hostLocalDescriptor({
        execution: { kind: 'unknown-tool-kind@1', bindingId: 'unknown' },
        requiredCapabilities: [],
      }),
      input: { sku: 'SKU-1' },
      context,
    }),
    (error: unknown) =>
      error instanceof RuntimeToolBindingError
      && /Unsupported Tool binding kind/.test(error.message),
  );
});
