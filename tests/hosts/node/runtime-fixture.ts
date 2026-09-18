import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

import { StaticPackageRegistry } from '../../../packages/domain-harness/src/package/registry.js';
import type {
  CompiledPackageManifest,
  DomainRuntime,
  JsonSchema,
  JsonValue,
  RuntimeHostBindings,
  RuntimeStore,
  ScriptExecutorPort,
  TargetCompiledDomainPackage,
} from '../../../packages/domain-harness/src/v2/index.js';

import type {
  ConformanceFixture,
  ToolInvocationObservation,
} from '../../conformance/contracts.js';
import { PORTABLE_RUNTIME_FIXTURE } from '../../conformance/fixtures.js';

export const NODE_CONFORMANCE_TARGET_PROFILE = 'node-g30@1' as const;
export const NODE_QUOTE_TOOL_ID = 'quote-total';
export const NODE_FAILURE_TOOL_ID = 'fixture-failure';
const QUOTE_BINDING_ID = 'node.fixture.quote-total.v1';
const FAILURE_BINDING_ID = 'node.fixture.failure.v1';
const QUOTE_DIGEST = sha256Sync('node-static-script:quote-total:v1');
const FAILURE_DIGEST = sha256Sync('node-static-script:fixture-failure:v1');

/**
 * Deterministic identity of the T-018 Node conformance fixture package,
 * computed from the same canonical manifest identity the registry validates,
 * so `openInstance` can pin this exact package.
 */
export const NODE_CONFORMANCE_PACKAGE_ID: string = sha256Sync(
  canonicalJson(identityMaterial(manifestFor(PORTABLE_RUNTIME_FIXTURE, 'pending'))),
);

export interface NodeFixtureRuntimeOptions {
  store: RuntimeStore;
  fixture: ConformanceFixture;
  /** JSONL file receiving one record per real Tool executor invocation. */
  toolTraceFile?: string;
  /** In-memory Tool invocation observations (used by the G30 adapter). */
  toolTrace?: ToolInvocationObservation[];
}

/**
 * Binds the shared `tests/conformance` fixture semantics onto the integrated
 * real Node host (`createNodeDomainRuntime`) with a target-compiled static
 * Script Tool binding. Quote arithmetic, the deterministic failure code and
 * the audit emission come only from the fixture declaration.
 */
export async function createNodeFixtureRuntime(
  options: NodeFixtureRuntimeOptions,
): Promise<DomainRuntime> {
  assertFrozenFixture(options.fixture);
  const artifacts = createNodeFixtureArtifacts(options);
  return createRealNodeRuntime({
    packageRegistry: artifacts.packageRegistry,
    store: options.store,
    bindings: artifacts.bindings,
  });
}

/**
 * Activates the integrated real Node host. The dynamic import keeps the
 * CJS-transformed root test context away from the Node package's ESM-only
 * entry while still executing the built `@kaicreator/domain-harness-node`.
 */
export async function createRealNodeRuntime(options: {
  packageRegistry: StaticPackageRegistry;
  store: RuntimeStore;
  bindings: RuntimeHostBindings;
}): Promise<DomainRuntime> {
  const { createNodeDomainRuntime } = await import('@kaicreator/domain-harness-node');
  return createNodeDomainRuntime(options);
}

export function createNodeFixtureArtifacts(options: NodeFixtureRuntimeOptions) {
  const toolTrace: ToolInvocationObservation[] = options.toolTrace ?? [];
  const bindings: RuntimeHostBindings = {
    capabilities: [],
    sha256: { digestUtf8: sha256Hex },
    secureRandom: { randomId: randomId },
    expression: {
      evaluate: (request) => evaluateFixtureExpression(options.fixture, request),
    },
    script: tracingScriptExecutor(options.fixture, toolTrace, options.toolTraceFile),
  };

  return {
    packageRegistry: new StaticPackageRegistry(
      [compiledFixturePackage(options.fixture)],
      NODE_CONFORMANCE_PACKAGE_ID,
    ),
    bindings,
    toolTrace,
  };
}

function compiledFixturePackage(fixture: ConformanceFixture): TargetCompiledDomainPackage {
  return {
    manifest: manifestFor(fixture, NODE_CONFORMANCE_PACKAGE_ID),
    bindings: {
      [QUOTE_BINDING_ID]: { kind: 'static-module' },
      [FAILURE_BINDING_ID]: { kind: 'static-module' },
    },
  };
}

function manifestFor(fixture: ConformanceFixture, packageId: string): CompiledPackageManifest {
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
    domainId: 'domain-harness-t018-node-conformance',
    domainVersion: '0.2.0-t018',
    packageId,
    targetProfileId: NODE_CONFORMANCE_TARGET_PROFILE,
    requiredCapabilities: [],
    workflows: {
      order: {
        workflowId: 'order',
        messageContracts: {
          quote: { type: 'quote', version: fixture.messageContractVersion, payloadSchema: objectSchema },
          approve: { type: 'approve', version: fixture.messageContractVersion, payloadSchema: objectSchema },
          fail: { type: 'fail', version: fixture.messageContractVersion, payloadSchema: objectSchema },
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
              invoke: { kind: 'tool', ref: NODE_QUOTE_TOOL_ID, input: 'fixture.message-input' },
              done: [{ target: 'quoted' }],
              error: [],
              events: {},
            },
            quoted: {
              final: false,
              done: [],
              error: [],
              events: { approve: { routes: [{ target: 'approve-value' }] } },
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
                },
              ],
            },
            'failure-tool': {
              final: false,
              invoke: { kind: 'tool', ref: NODE_FAILURE_TOOL_ID, input: 'fixture.message-input' },
              done: [{ target: 'draft' }],
              error: [],
              events: {},
            },
          },
          limits: { maxSteps: 16 },
        },
      },
      audit: {
        workflowId: 'audit',
        messageContracts: {
          completed: { type: 'order.completed', payloadSchema: objectSchema },
        },
        definition: {
          initial: 'waiting',
          states: {
            waiting: {
              final: false,
              done: [],
              error: [],
              events: { 'order.completed': { routes: [{ target: 'received' }] } },
            },
            received: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 8 },
        },
      },
    },
    tools: {
      [NODE_QUOTE_TOOL_ID]: {
        toolId: NODE_QUOTE_TOOL_ID,
        inputSchema: objectSchema,
        outputSchema: quoteOutputSchema,
        effect: 'none',
        execution: { kind: 'script', bindingId: QUOTE_BINDING_ID, digest: QUOTE_DIGEST },
        requiredCapabilities: [],
      },
      [NODE_FAILURE_TOOL_ID]: {
        toolId: NODE_FAILURE_TOOL_ID,
        inputSchema: objectSchema,
        outputSchema: objectSchema,
        effect: 'idempotent',
        execution: { kind: 'script', bindingId: FAILURE_BINDING_ID, digest: FAILURE_DIGEST },
        requiredCapabilities: [],
      },
    },
    projections: {
      'order-summary': {
        projectionId: 'order-summary',
        expression: 'fixture.order-summary',
        dependencies: [{ kind: 'workflow', selector: { workflowId: 'order' } }],
        outputSchema: objectSchema,
      },
    },
    schemas: {},
    bindingDigests: {
      [QUOTE_BINDING_ID]: QUOTE_DIGEST,
      [FAILURE_BINDING_ID]: FAILURE_DIGEST,
    },
  };
}

function tracingScriptExecutor(
  fixture: ConformanceFixture,
  toolTrace: ToolInvocationObservation[],
  toolTraceFile?: string,
): ScriptExecutorPort {
  return {
    async execute(request) {
      const toolId = request.binding.bindingId === QUOTE_BINDING_ID
        ? NODE_QUOTE_TOOL_ID
        : NODE_FAILURE_TOOL_ID;
      const input = clone(request.input);

      let observation: ToolInvocationObservation;
      let output: JsonValue | undefined;
      if (toolId === NODE_QUOTE_TOOL_ID) {
        const quantity = numberField(input, 'quantity');
        const unitPrice = numberField(input, 'unitPrice');
        output = { total: quantity * unitPrice + fixture.deterministicQuoteAdjustment };
        observation = { toolId, effect: 'none', input, output: clone(output) };
      } else {
        observation = {
          toolId,
          effect: 'idempotent',
          input,
          failureCode: fixture.deterministicFailureCode,
        };
      }

      toolTrace.push(clone(observation));
      if (toolTraceFile !== undefined) appendFileSync(toolTraceFile, `${JSON.stringify(observation)}\n`, 'utf8');

      if (output === undefined) {
        throw new Error(fixture.deterministicFailureCode);
      }
      return output;
    },
  };
}

async function evaluateFixtureExpression(
  fixture: ConformanceFixture,
  request: { expression: string; input: JsonValue },
): Promise<JsonValue> {
  switch (request.expression) {
    case 'fixture.message-input':
      return clone(workflowState(request.input).lastMessage);
    case 'fixture.approve-total':
      return { total: fixture.deterministicQuoteAdjustment + 40 };
    case 'fixture.final-output':
      return { total: readTotal(workflowState(request.input).lastResult) };
    case 'fixture.audit-target':
      return { workflowId: fixture.auditWorkflowId, instanceKey: 'audit-001' };
    case 'fixture.audit-payload': {
      const scope = record(request.input, 'workflow expression input');
      const address = record(scope.address, 'workflow address');
      return {
        orderId: stringField(address, 'instanceKey'),
        total: readTotal(workflowState(request.input).lastResult),
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
      const semantic = semanticState(source.state as JsonValue);
      return {
        orderId: stringField(address, 'instanceKey'),
        phase: semantic.phase,
        total: semantic.total,
      };
    }
    default:
      throw new Error(`Unsupported T-018 fixture expression: ${request.expression}`);
  }
}

/**
 * Reduces the portable v0.2 workflow state envelope to the G30 semantic state.
 * The mapping belongs to the fixture's compiled definition (state ids are the
 * domain phases); it is not a per-scenario branch.
 */
export function semanticState(
  rawState: JsonValue,
): { phase: 'draft' | 'quoted' | 'completed'; total: number | null } {
  const state = record(rawState, 'portable workflow state');
  const stateId = stringField(state, 'stateId');
  const total = readTotal((state.lastResult ?? null) as JsonValue);
  if (stateId === 'quoted' || stateId === 'quote-tool') {
    return { phase: 'quoted', total };
  }
  if (stateId === 'approve-value' || stateId === 'completed') {
    return { phase: 'completed', total };
  }
  return { phase: 'draft', total: null };
}

function workflowState(value: JsonValue): { lastMessage: JsonValue; lastResult: JsonValue } {
  const input = record(value, 'workflow expression input');
  const state = record(input.state, 'workflow state');
  return {
    lastMessage: (state.lastMessage ?? null) as JsonValue,
    lastResult: (state.lastResult ?? null) as JsonValue,
  };
}

function readTotal(value: JsonValue): number | null {
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
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new Error(`Expected string ${key}`);
  }
  return candidate;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function identityMaterial(manifest: CompiledPackageManifest): Record<string, unknown> {
  const { packageId: _ignored, ...identity } = manifest;
  return identity as Record<string, unknown>;
}

/**
 * The fixture runtime's compiled semantics (audit instance key, quote
 * arithmetic shape) are bound to the frozen shared fixture; fail closed if a
 * caller tries to bind it to anything else.
 */
function assertFrozenFixture(fixture: ConformanceFixture): void {
  if (fixture.id !== PORTABLE_RUNTIME_FIXTURE.id) {
    throw new Error(`T-018 Node fixture runtime supports only fixture ${PORTABLE_RUNTIME_FIXTURE.id}`);
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
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

function sha256Sync(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function sha256Hex(value: string): Promise<string> {
  return sha256Sync(value);
}

let randomCounter = 0;
function randomId(): string {
  randomCounter += 1;
  return `t018-${sha256Sync(String(randomCounter)).slice(0, 24)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
