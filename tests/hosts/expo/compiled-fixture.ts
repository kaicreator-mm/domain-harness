import * as Crypto from 'expo-crypto';
import {
  StaticPackageRegistry,
  type CompiledPackageManifest,
  type ExpressionExecutionRequest,
  type JsonSchema,
  type JsonValue,
  type RuntimeHostBindings,
  type ScriptExecutorPort,
  type TargetCompiledDomainPackage,
} from '@kaicreator/domain-harness/v2';
import {
  EXPO_SCRIPT_EXECUTION_CAPABILITY,
  ExpoScriptExecutor,
  type ExpoCompiledScriptFunction,
} from '@kaicreator/domain-harness-expo';

import type { ConformanceFixture, ToolInvocationObservation } from '../../conformance/contracts.ts';
import { AUDIT_ADDRESS } from '../../conformance/fixtures.ts';

export const EXPO_CONFORMANCE_TARGET_PROFILE = 'expo-android-hermes@1' as const;
export const EXPO_QUOTE_TOOL_ID = 'quote-total';
export const EXPO_FAILURE_TOOL_ID = 'fixture-failure';
const QUOTE_BINDING_ID = 'expo.fixture.quote-total.v1';
const FAILURE_BINDING_ID = 'expo.fixture.failure.v1';

interface HostArtifacts {
  packageRegistry: StaticPackageRegistry;
  bindings: RuntimeHostBindings;
  toolTrace: ToolInvocationObservation[];
}

export async function createExpoConformanceHostArtifacts(
  fixture: ConformanceFixture,
): Promise<HostArtifacts> {
  const quoteDigest = await sha256('static-expo-script:quote-total:v1');
  const failureDigest = await sha256('static-expo-script:fixture-failure:v1');
  const unsignedManifest = manifestFor(fixture, 'pending', quoteDigest, failureDigest);
  const packageId = await sha256(canonicalIdentityMaterial(unsignedManifest));
  const compiledPackage: TargetCompiledDomainPackage = {
    manifest: manifestFor(fixture, packageId, quoteDigest, failureDigest),
    bindings: {
      [QUOTE_BINDING_ID]: { target: 'expo-hermes-static-module' },
      [FAILURE_BINDING_ID]: { target: 'expo-hermes-static-module' },
    },
  };

  const toolTrace: ToolInvocationObservation[] = [];
  const script = tracingScriptExecutor(fixture, toolTrace);
  return {
    packageRegistry: new StaticPackageRegistry([compiledPackage], packageId),
    bindings: {
      capabilities: [EXPO_SCRIPT_EXECUTION_CAPABILITY],
      sha256: { digestUtf8: sha256 },
      secureRandom: { randomId: () => Crypto.randomUUID() },
      expression: { evaluate: (request) => evaluateFixtureExpression(fixture, request) },
      script,
    },
    toolTrace,
  };
}

function manifestFor(
  fixture: ConformanceFixture,
  packageId: string,
  quoteDigest: string,
  failureDigest: string,
): CompiledPackageManifest {
  const objectSchema: JsonSchema = { type: 'object' };
  const quoteOutputSchema: JsonSchema = {
    type: 'object',
    properties: { total: { type: 'number' } },
    required: ['total'],
    additionalProperties: false,
  };

  return {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'domain-harness-t019-conformance',
    domainVersion: '0.2.0-t019',
    packageId,
    targetProfileId: EXPO_CONFORMANCE_TARGET_PROFILE,
    requiredCapabilities: [EXPO_SCRIPT_EXECUTION_CAPABILITY],
    workflows: {
      [fixture.workflowId]: {
        workflowId: fixture.workflowId,
        messageContracts: {
          quote: {
            type: 'quote',
            version: fixture.messageContractVersion,
            payloadSchema: objectSchema,
          },
          approve: {
            type: 'approve',
            version: fixture.messageContractVersion,
            payloadSchema: objectSchema,
          },
          fail: {
            type: 'fail',
            version: fixture.messageContractVersion,
            payloadSchema: objectSchema,
          },
        },
        definition: {
          initial: 'draft',
          output: 'fixture.final-output',
          states: {
            draft: {
              final: false,
              done: [],
              error: [],
              events: {
                quote: { routes: [{ target: 'quote-tool' }] },
                fail: { routes: [{ target: 'failure-tool' }] },
              },
            },
            'quote-tool': {
              final: false,
              invoke: { kind: 'tool', ref: EXPO_QUOTE_TOOL_ID, input: 'fixture.message-input' },
              done: [{ target: 'quoted' }],
              error: [],
              events: {},
            },
            quoted: {
              final: false,
              done: [],
              error: [],
              events: {
                approve: { routes: [{ target: 'approve-value' }] },
              },
            },
            'approve-value': {
              final: false,
              invoke: { kind: 'expr', expression: 'fixture.approve-total' },
              done: [{ target: 'completed' }],
              error: [],
              events: {},
            },
            completed: {
              final: true,
              done: [],
              error: [],
              events: {},
              effects: [
                {
                  kind: 'domain-message',
                  targetExpression: 'fixture.audit-target',
                  messageType: 'order.completed',
                  payloadExpression: 'fixture.audit-payload',
                  contractVersion: fixture.messageContractVersion,
                },
              ],
            },
            'failure-tool': {
              final: false,
              invoke: { kind: 'tool', ref: EXPO_FAILURE_TOOL_ID, input: 'fixture.message-input' },
              done: [{ target: 'draft' }],
              error: [],
              events: {},
            },
          },
          limits: { maxSteps: 16 },
        },
      },
      [fixture.auditWorkflowId]: {
        workflowId: fixture.auditWorkflowId,
        messageContracts: {
          completed: {
            type: 'order.completed',
            version: fixture.messageContractVersion,
            payloadSchema: objectSchema,
          },
        },
        definition: {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              done: [],
              error: [],
              events: {
                'order.completed': { routes: [{ target: 'received' }] },
              },
            },
            received: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 8 },
        },
      },
    },
    tools: {
      [EXPO_QUOTE_TOOL_ID]: {
        toolId: EXPO_QUOTE_TOOL_ID,
        inputSchema: objectSchema,
        outputSchema: quoteOutputSchema,
        effect: 'none',
        execution: {
          kind: 'script',
          bindingId: QUOTE_BINDING_ID,
          digest: quoteDigest,
        },
        requiredCapabilities: [EXPO_SCRIPT_EXECUTION_CAPABILITY],
      },
      [EXPO_FAILURE_TOOL_ID]: {
        toolId: EXPO_FAILURE_TOOL_ID,
        inputSchema: objectSchema,
        outputSchema: objectSchema,
        effect: 'idempotent',
        execution: {
          kind: 'script',
          bindingId: FAILURE_BINDING_ID,
          digest: failureDigest,
        },
        requiredCapabilities: [EXPO_SCRIPT_EXECUTION_CAPABILITY],
      },
    },
    projections: {
      [fixture.projectionId]: {
        projectionId: fixture.projectionId,
        expression: 'fixture.order-summary',
        dependencies: [
          { kind: 'workflow', selector: { workflowId: fixture.workflowId } },
        ],
        outputSchema: objectSchema,
      },
    },
    schemas: {},
    bindingDigests: {
      [QUOTE_BINDING_ID]: quoteDigest,
      [FAILURE_BINDING_ID]: failureDigest,
    },
  };
}

function tracingScriptExecutor(
  fixture: ConformanceFixture,
  trace: ToolInvocationObservation[],
): ScriptExecutorPort {
  const modules: Record<string, ExpoCompiledScriptFunction> = {
    [QUOTE_BINDING_ID]: async (input) => {
      const quantity = numberField(input, 'quantity');
      const unitPrice = numberField(input, 'unitPrice');
      return { total: quantity * unitPrice + fixture.deterministicQuoteAdjustment };
    },
    [FAILURE_BINDING_ID]: async () => {
      throw new Error(fixture.deterministicFailureCode);
    },
  };
  const executor = new ExpoScriptExecutor(modules);

  return {
    async execute(request) {
      const toolId = request.binding.bindingId === QUOTE_BINDING_ID
        ? EXPO_QUOTE_TOOL_ID
        : EXPO_FAILURE_TOOL_ID;
      const effect = toolId === EXPO_QUOTE_TOOL_ID ? 'none' : 'idempotent';
      try {
        const output = await executor.execute(request);
        trace.push({ toolId, effect, input: clone(request.input), output: clone(output) });
        return output;
      } catch (error) {
        trace.push({
          toolId,
          effect,
          input: clone(request.input),
          failureCode: fixture.deterministicFailureCode,
        });
        throw error;
      }
    },
  };
}

async function evaluateFixtureExpression(
  fixture: ConformanceFixture,
  request: ExpressionExecutionRequest,
): Promise<JsonValue> {
  switch (request.expression) {
    case 'fixture.message-input':
      return clone(readWorkflowState(request.input).lastMessage);
    case 'fixture.approve-total':
      return { total: 2 * 20 + fixture.deterministicQuoteAdjustment };
    case 'fixture.final-output':
      return { total: totalFromState(request.input, fixture) };
    case 'fixture.audit-target':
      return { ...AUDIT_ADDRESS };
    case 'fixture.audit-payload': {
      const input = record(request.input, 'workflow expression input');
      const address = record(input.address, 'workflow address');
      return {
        orderId: stringField(address, 'instanceKey'),
        total: totalFromState(request.input, fixture),
      };
    }
    case 'fixture.order-summary': {
      const input = record(request.input, 'projection input');
      const workflows = input.workflows;
      if (!Array.isArray(workflows) || workflows.length !== 1) {
        throw new Error('fixture.order-summary requires exactly one workflow source');
      }
      const source = record(workflows[0], 'projection workflow source');
      const address = record(source.address, 'projection workflow address');
      const state = semanticState(source.state as JsonValue, fixture);
      return {
        orderId: stringField(address, 'instanceKey'),
        phase: state.phase,
        total: state.total,
      };
    }
    default:
      throw new Error(`Unsupported T-019 fixture expression: ${request.expression}`);
  }
}

export function semanticState(
  rawState: JsonValue,
  fixture: ConformanceFixture,
): { phase: 'draft' | 'quoted' | 'completed'; total: number | null } {
  const state = readPortableState(rawState);
  if (state.stateId === 'quoted' || state.stateId === 'quote-tool') {
    return { phase: 'quoted', total: readOptionalTotal(state.lastResult) };
  }
  if (state.stateId === 'approve-value' || state.stateId === 'completed') {
    return { phase: 'completed', total: readOptionalTotal(state.lastResult) ?? fixture.deterministicQuoteAdjustment + 40 };
  }
  return { phase: 'draft', total: null };
}

function totalFromState(input: JsonValue, fixture: ConformanceFixture): number {
  const state = readWorkflowState(input);
  return readOptionalTotal(state.lastResult) ?? 40 + fixture.deterministicQuoteAdjustment;
}

function readWorkflowState(value: JsonValue): { lastMessage: JsonValue; lastResult: JsonValue } {
  const input = record(value, 'workflow expression input');
  const state = record(input.state, 'workflow state');
  return {
    lastMessage: (state.lastMessage ?? null) as JsonValue,
    lastResult: (state.lastResult ?? null) as JsonValue,
  };
}

function readPortableState(value: JsonValue): { stateId: string; lastResult: JsonValue } {
  const state = record(value, 'portable workflow state');
  return {
    stateId: stringField(state, 'stateId'),
    lastResult: (state.lastResult ?? null) as JsonValue,
  };
}

function readOptionalTotal(value: JsonValue): number | null {
  if (value === null || Array.isArray(value) || typeof value !== 'object') return null;
  const total = (value as Record<string, JsonValue>).total;
  return typeof total === 'number' ? total : null;
}

function numberField(value: JsonValue, key: string): number {
  const source = record(value, 'script input');
  const candidate = source[key];
  if (typeof candidate !== 'number') throw new Error(`Expected numeric ${key}`);
  return candidate;
}

function stringField(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];
  if (typeof candidate !== 'string' || candidate.length === 0) throw new Error(`Expected string ${key}`);
  return candidate;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function canonicalIdentityMaterial(manifest: CompiledPackageManifest): string {
  const { packageId: _ignored, ...identity } = manifest;
  return JSON.stringify(canonicalize(identity));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

async function sha256(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
