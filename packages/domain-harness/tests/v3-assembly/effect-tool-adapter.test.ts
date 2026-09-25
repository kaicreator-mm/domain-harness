import assert from 'node:assert/strict';
import test from 'node:test';
import type { JsonValue } from '../../src/contracts/json.js';
import type { CompiledToolDescriptor } from '../../src/v2/contracts/package.js';
import type { ToolExecutionRequest, ToolExecutorPort } from '../../src/v2/contracts/effect.js';
import type { AdmissionEffectToolRequest } from '../../src/admission/index.js';
import {
  HOST_LOCAL_DOMAIN_TOOL_BINDING_KIND,
  HostLocalDomainToolBindingError,
  createHostLocalDomainToolExecutor,
} from '../../src/tool/host-local-contract/index.js';
import { admissionEffectToolPort } from '../../src/runtime/admission-effect-tool-adapter.js';
import { STANDARD_CAPABILITIES } from '../../src/v2/index.js';
import { target } from '../admission/helpers.js';

const RESERVE_DESCRIPTOR: CompiledToolDescriptor = {
  toolId: 'reserve-tool',
  outputSchema: { type: 'object' },
  effect: 'non-idempotent',
  execution: {
    kind: HOST_LOCAL_DOMAIN_TOOL_BINDING_KIND,
    bindingId: 'reserve-binding',
    digest: 'digest-reserve-1',
  },
  requiredCapabilities: [STANDARD_CAPABILITIES.cryptoHashSha256],
};

const TOOL_ARTIFACT = {
  kind: 'tool' as const,
  artifactId: 'reserve-tool',
  contentDigest: 'sha256:tool-reserve-1',
};

function effectRequest(overrides: Partial<AdmissionEffectToolRequest> = {}): AdmissionEffectToolRequest {
  return {
    effectId: 'turn:1/effect/0',
    target,
    durableControlTurnId: 'turn:1',
    operationOrdinal: 0,
    binding: { effectType: 'effect:reserve', effectSemantics: 'non-idempotent' },
    input: { amount: 42 },
    logicalTime: '2026-09-21T09:00:00.000Z',
    ...overrides,
  };
}

test('adapter: resolve derives binding semantics from the compiled descriptor, never a side map', () => {
  const executor: ToolExecutorPort = { execute: async () => null };
  const port = admissionEffectToolPort({
    executor,
    descriptors: { 'effect:reserve': RESERVE_DESCRIPTOR },
    toolArtifacts: { 'effect:reserve': TOOL_ARTIFACT },
  });

  assert.deepEqual(port.resolve('effect:reserve'), {
    effectType: 'effect:reserve',
    effectSemantics: 'non-idempotent',
    toolArtifact: TOOL_ARTIFACT,
  });
  assert.equal(port.resolve('effect:unknown'), undefined, 'unbound effect types stay fail-closed');
});

test('adapter: execute maps the admission request into a truthful ToolExecutionRequest', async () => {
  const seen: ToolExecutionRequest[] = [];
  const executor: ToolExecutorPort = {
    execute: async (request) => {
      seen.push(request);
      return { ok: true };
    },
  };
  const port = admissionEffectToolPort({
    executor,
    descriptors: { 'effect:reserve': RESERVE_DESCRIPTOR },
  });

  const output = await port.execute(effectRequest());
  assert.deepEqual(output, { ok: true });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.descriptor, RESERVE_DESCRIPTOR);
  assert.deepEqual(seen[0]!.input, { amount: 42 });
  assert.deepEqual(seen[0]!.context, {
    effectId: 'turn:1/effect/0',
    target,
    sourceMessageId: 'turn:1',
    logicalTime: '2026-09-21T09:00:00.000Z',
    attempt: 1,
    idempotencyKey: 'turn:1/effect/0',
  });

  await port.execute(effectRequest());
  assert.equal(seen[1]!.context.attempt, 2, 'repeat execution of the same effect id is a new attempt');
  const third = await port.execute(effectRequest({ idempotencyKey: 'reserve:quote:1' }));
  assert.deepEqual(third, { ok: true });
  assert.equal(seen[2]!.context.idempotencyKey, 'reserve:quote:1', 'declared idempotency keys pass through');
});

test('adapter: execute on an unbound effect type fails closed', async () => {
  const port = admissionEffectToolPort({
    executor: { execute: async () => null },
    descriptors: {},
  });
  await assert.rejects(
    () => port.execute(effectRequest()),
    (error: unknown) =>
      error instanceof HostLocalDomainToolBindingError &&
      error.code === 'HOST_LOCAL_BINDING_MISSING',
  );
});

test('adapter: execute rejects a binding whose semantics do not match the compiled descriptor', async () => {
  const port = admissionEffectToolPort({
    executor: { execute: async () => null },
    descriptors: { 'effect:reserve': RESERVE_DESCRIPTOR },
  });
  await assert.rejects(
    () =>
      port.execute(
        effectRequest({
          binding: { effectType: 'effect:reserve', effectSemantics: 'idempotent' },
        }),
      ),
    (error: unknown) =>
      error instanceof HostLocalDomainToolBindingError &&
      error.code === 'HOST_LOCAL_BINDING_SEMANTICS_MISMATCH',
    'descriptor truth is structural, not conventional',
  );
});

test('adapter: drives a real T-008 host/local executor end to end', async () => {
  const calls: JsonValue[] = [];
  const executor = createHostLocalDomainToolExecutor({
    capabilities: [STANDARD_CAPABILITIES.cryptoHashSha256],
    bindings: {
      'reserve-binding': {
        capability: STANDARD_CAPABILITIES.cryptoHashSha256,
        digest: 'digest-reserve-1',
        execute: async (request) => {
          calls.push(request.input);
          return { reserved: true };
        },
      },
    },
  });
  const port = admissionEffectToolPort({
    executor,
    descriptors: { 'effect:reserve': RESERVE_DESCRIPTOR },
  });

  const output = await port.execute(effectRequest());
  assert.deepEqual(output, { reserved: true });
  assert.deepEqual(calls, [{ amount: 42 }]);
});
