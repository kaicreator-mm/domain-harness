import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REMOTE_HTTP_JSON_BINDING_KIND,
  REMOTE_HTTP_JSON_TRANSPORT,
  RemoteToolBindingError,
  RemoteToolValidationError,
  createRemoteHttpJsonToolExecutor,
  parseRemoteHttpJsonBinding,
} from '../../../packages/domain-harness/src/tool/remote-contract/index.ts';
import type { ToolExecutionRequest } from '../../../packages/domain-harness/src/v2/contracts/effect.ts';
import type { CompiledToolDescriptor } from '../../../packages/domain-harness/src/v2/contracts/package.ts';
import { createNodeHttpJsonRemoteTransport } from '../../../packages/domain-harness-node/src/remote/http-json-transport.ts';
import { createExpoHttpJsonRemoteTransport } from '../../../packages/domain-harness-expo/src/remote/http-json-transport.ts';

function descriptor(overrides: Partial<CompiledToolDescriptor> = {}): CompiledToolDescriptor {
  return {
    toolId: 'remote.echo',
    inputSchema: {
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      properties: { name: { type: 'string' } },
    },
    outputSchema: {
      type: 'object',
      required: ['greeting'],
      additionalProperties: false,
      properties: { greeting: { type: 'string' } },
    },
    effect: 'idempotent',
    execution: {
      kind: REMOTE_HTTP_JSON_BINDING_KIND,
      bindingId: 'remote.echo.http',
      config: {
        transport: REMOTE_HTTP_JSON_TRANSPORT,
        resourceKey: 'remote.echo.service',
        path: '/v1/echo',
        method: 'POST',
      },
    },
    requiredCapabilities: [REMOTE_HTTP_JSON_TRANSPORT],
    ...overrides,
  };
}

function executionRequest(tool = descriptor(), input = { name: 'Ada' }): ToolExecutionRequest {
  return {
    descriptor: tool,
    input,
    context: {
      effectId: 'effect-1',
      target: { workflowId: 'hello', instanceKey: 'instance-1' },
      sourceMessageId: 'message-1',
      logicalTime: '2026-09-18T00:00:00.000Z',
      attempt: 1,
      idempotencyKey: 'effect-1',
    },
  };
}

test('compiled Remote Tool binding is logical only and rejects runtime values', () => {
  const tool = descriptor();
  const serialized = JSON.stringify(tool.execution);
  assert.equal(serialized.includes('https://'), false);
  assert.equal(serialized.includes('secret-token'), false);
  assert.deepEqual(parseRemoteHttpJsonBinding(tool.execution), {
    transport: REMOTE_HTTP_JSON_TRANSPORT,
    resourceKey: 'remote.echo.service',
    path: '/v1/echo',
    method: 'POST',
  });

  assert.throws(
    () => parseRemoteHttpJsonBinding({
      kind: REMOTE_HTTP_JSON_BINDING_KIND,
      bindingId: 'bad-endpoint',
      config: {
        transport: REMOTE_HTTP_JSON_TRANSPORT,
        resourceKey: 'remote.echo.service',
        path: '/v1/echo',
        endpoint: 'https://forbidden.example',
      },
    }),
    RemoteToolBindingError,
  );

  assert.throws(
    () => parseRemoteHttpJsonBinding({
      kind: REMOTE_HTTP_JSON_BINDING_KIND,
      bindingId: 'bad-secret-alias',
      config: {
        transport: REMOTE_HTTP_JSON_TRANSPORT,
        resourceKey: 'remote.echo.service',
        path: '/v1/echo',
        apiKey: 'secret-token',
      },
    }),
    RemoteToolBindingError,
  );

  assert.throws(
    () => parseRemoteHttpJsonBinding({
      kind: REMOTE_HTTP_JSON_BINDING_KIND,
      bindingId: 'bad-absolute-url',
      config: {
        transport: REMOTE_HTTP_JSON_TRANSPORT,
        resourceKey: 'remote.echo.service',
        path: 'https://forbidden.example/v1/echo',
      },
    }),
    RemoteToolBindingError,
  );
});

test('Remote Tool executor uses the frozen ToolExecutorPort seam and validates request/response JSON', async () => {
  let calls = 0;
  const executor = createRemoteHttpJsonToolExecutor({
    host: {
      remoteTransports: {
        [REMOTE_HTTP_JSON_TRANSPORT]: {
          async execute(request) {
            calls += 1;
            assert.equal(request.resourceKey, 'remote.echo.service');
            assert.deepEqual(request.input, { name: 'Ada' });
            return { greeting: 'Hello Ada' };
          },
        },
      },
    },
  });

  assert.deepEqual(await executor.execute(executionRequest()), { greeting: 'Hello Ada' });
  assert.equal(calls, 1, 'one effect execution causes exactly one transport call');

  await assert.rejects(
    executor.execute(executionRequest(descriptor(), { name: 42 } as never)),
    (error: unknown) => error instanceof RemoteToolValidationError && error.phase === 'input',
  );
  assert.equal(calls, 1, 'invalid input fails before transport');

  const invalidOutputExecutor = createRemoteHttpJsonToolExecutor({
    host: {
      remoteTransports: {
        [REMOTE_HTTP_JSON_TRANSPORT]: {
          async execute() {
            return { greeting: 42 };
          },
        },
      },
    },
  });
  await assert.rejects(
    invalidOutputExecutor.execute(executionRequest()),
    (error: unknown) => error instanceof RemoteToolValidationError && error.phase === 'output',
  );
});

test('G8 deterministic HTTP stub behaves equivalently for Node and Expo host bindings', async () => {
  const resources = {
    'remote.echo.service': {
      endpoint: 'https://stub.example',
      token: 'secret-token',
      session: 'session-value',
    },
  };

  type Captured = { url: string; init: RequestInit };
  const nodeCaptured: Captured[] = [];
  const expoCaptured: Captured[] = [];

  const makeFetch = (captured: Captured[]): typeof fetch => async (input, init) => {
    captured.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({ greeting: 'Hello Ada' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const nodeTransport = createNodeHttpJsonRemoteTransport({ resources, fetchImpl: makeFetch(nodeCaptured) });
  const expoTransport = createExpoHttpJsonRemoteTransport({ resources, fetchImpl: makeFetch(expoCaptured) });
  const binding = descriptor().execution;
  const request = { binding, input: { name: 'Ada' }, resourceKey: 'remote.echo.service' } as const;

  assert.deepEqual(await nodeTransport.execute(request), { greeting: 'Hello Ada' });
  assert.deepEqual(await expoTransport.execute(request), { greeting: 'Hello Ada' });
  assert.equal(nodeCaptured.length, 1);
  assert.equal(expoCaptured.length, 1);

  for (const captured of [nodeCaptured[0]!, expoCaptured[0]!]) {
    assert.equal(captured.url, 'https://stub.example/v1/echo');
    assert.equal(captured.init.method, 'POST');
    assert.equal(captured.init.body, JSON.stringify({ name: 'Ada' }));
    const headers = captured.init.headers as Record<string, string>;
    assert.equal(headers.authorization, 'Bearer secret-token');
    assert.equal(headers['x-domain-harness-session'], 'session-value');
  }

  assert.equal(JSON.stringify(binding).includes('secret-token'), false);
  assert.equal(JSON.stringify(binding).includes('session-value'), false);
});

test('transport failures are explicit and never retried inside the binding', async () => {
  let calls = 0;
  const resources = { 'remote.echo.service': { endpoint: 'https://stub.example' } };
  const transport = createNodeHttpJsonRemoteTransport({
    resources,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
    },
  });

  await assert.rejects(
    transport.execute({
      binding: descriptor().execution,
      input: { name: 'Ada' },
      resourceKey: 'remote.echo.service',
    }),
    (error: unknown) => error instanceof Error && error.message.includes('503'),
  );
  assert.equal(calls, 1, 'retry/recovery remains owned by the effect layer');
});
