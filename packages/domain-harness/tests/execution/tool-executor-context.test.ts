import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeToolExecutor } from '../../src/runtime/tool-executor.js';
import { REMOTE_HTTP_JSON_TRANSPORT } from '../../src/tool/remote-contract/index.js';
import type {
  EffectExecutionContext,
  ToolExecutionRequest,
} from '../../src/v2/contracts/effect.js';
import type {
  CompiledToolDescriptor,
} from '../../src/v2/contracts/package.js';
import type { JsonObject } from '../../src/contracts/json.js';
import type {
  RemoteTransportRequest,
  ScriptExecutionRequest,
} from '../../src/v2/contracts/host.js';

// #181 / [L2-4]: the durable effect context (idempotency key, attempt, effect
// and source identity) must reach every execution edge through the runtime
// tool executor - remote transports and script executors alike.

const CONTEXT: EffectExecutionContext = {
  effectId: 'effect-ctx-1',
  target: { workflowId: 'wf', instanceKey: 'inst-1' },
  sourceMessageId: 'message-ctx-1',
  logicalTime: '2026-09-20T00:00:00.000Z',
  attempt: 2,
  idempotencyKey: 'idem-ctx-1',
};

function toolDescriptor(kind: string, config: JsonObject): CompiledToolDescriptor {
  return {
    toolId: 'ctx.tool',
    outputSchema: { type: 'object' },
    effect: 'idempotent',
    execution: { kind, bindingId: 'binding-ctx', config },
    requiredCapabilities: ['http-transport@1'],
  };
}

test('runtime tool executor forwards the durable effect context to remote and script edges', async () => {
  let remoteRequest: RemoteTransportRequest | undefined;
  let scriptRequest: ScriptExecutionRequest | undefined;

  const executor = createRuntimeToolExecutor({
    capabilities: [],
    sha256: {
      async digestUtf8(value) {
        return `digest-${value.length}`;
      },
    },
    secureRandom: {
      randomId() {
        return 'random-ctx';
      },
    },
    expression: {
      async evaluate(request) {
        return request.input;
      },
    },
    script: {
      async execute(request) {
        scriptRequest = request;
        return { ok: true };
      },
    },
    remoteTransports: {
      [REMOTE_HTTP_JSON_TRANSPORT]: {
        async execute(request) {
          remoteRequest = request;
          return { ok: true };
        },
      },
    },
  });

  const remoteCall: ToolExecutionRequest = {
    descriptor: toolDescriptor('remote-http-json@1', {
      transport: REMOTE_HTTP_JSON_TRANSPORT,
      resourceKey: 'ctx.service',
      path: '/v1/ctx',
      method: 'POST',
    }),
    input: {},
    context: CONTEXT,
  };
  await executor.execute(remoteCall);
  assert.equal(remoteRequest?.context?.idempotencyKey, CONTEXT.idempotencyKey);
  assert.equal(remoteRequest?.context?.attempt, CONTEXT.attempt);
  assert.equal(remoteRequest?.context?.effectId, CONTEXT.effectId);
  assert.equal(remoteRequest?.context?.sourceMessageId, CONTEXT.sourceMessageId);

  const scriptCall: ToolExecutionRequest = {
    descriptor: toolDescriptor('script', {}),
    input: {},
    context: CONTEXT,
  };
  await executor.execute(scriptCall);
  assert.equal(scriptRequest?.context?.idempotencyKey, CONTEXT.idempotencyKey);
  assert.equal(scriptRequest?.context?.attempt, CONTEXT.attempt);
  assert.equal(scriptRequest?.context?.effectId, CONTEXT.effectId);
  assert.equal(scriptRequest?.context?.sourceMessageId, CONTEXT.sourceMessageId);
});
