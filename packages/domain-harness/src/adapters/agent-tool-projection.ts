/**
 * v0.7 Agent Tool projection / mutation refusal adapter (issue #886,
 * fine-grained DAG #534 T004D; authority #589 PACK-C T004D section;
 * readiness #702 VERDICT=READY_AFTER_DEPENDENCIES).
 *
 * ADAPTER, not Microkernel semantics: the Agent is a projection/caller plane,
 * NEVER an authority owner. This module owns exactly the concerns PACK-C
 * assigns to T004D — and nothing else:
 *
 * - PROJECTION: `projectAgentToolSurface` derives the Agent plane's exposed
 *   Tool menu from the EXACT current Definition graph. An operation is
 *   projected only when its exact admitted exposure permits Agent/query use —
 *   the declarative `declaredExposure` material of the current contract
 *   carries an `audiences` list containing the exact `agent` audience. The
 *   projection is derived metadata only: deeply frozen, canonicalized,
 *   non-aliasing snapshots of the exact current contract, bound to the exact
 *   current Definition graph digest. It mints no evidence and authorizes
 *   nothing — stale projection can never authorize current execution;
 * - QUERY SEAM: `queryAgentTool` is the Agent/Harness query-only seam. It
 *   invokes ONLY operations whose frozen effect class is exactly `none`,
 *   through the generic T004A exposure/request admission and the T004B
 *   effect=none path. Model output enters as `proposal` material — provenance
 *   only, never invocation or transition authority. Any mutation-capable
 *   (effectful) operation submitted through this seam is refused typed
 *   (AGENT_MUTATION_REFUSED) BEFORE any implementation dispatch — never
 *   rerouted, never fallen back; an operation absent from the projected
 *   surface refuses AGENT_OPERATION_NOT_PROJECTED, and a projection that no
 *   longer matches the exact current state refuses AGENT_PROJECTION_STALE —
 *   both before any admission or dispatch;
 * - MUTATION ROUTE: `admitAgentMutationIntent` is the ONLY mutation-capable
 *   entry, and it is NOT a mutation shortcut: it enters the GENERIC T004A
 *   request (exposure admission + request admission, callerKind `agent`
 *   provenance only) and returns the admitted request. The host MUST route
 *   that request through the T004C effectful seam against an
 *   already-authoritative occurrence / Central Admission; this module exposes
 *   NO effectful dispatch, NO occurrence material, NO journal access and NO
 *   admission ports — the Agent plane can never supply or forge occurrence,
 *   pin, verdict or effect authority;
 * - FRESHNESS: both seams re-verify projection freshness against the exact
 *   current graph (identity + authoritatively recomputed digest) before any
 *   generic admission, and the consumed T004A/T004B seams independently
 *   re-prove Definition/Assembly/exposure currentness on every call. The
 *   projection never substitutes for admission evidence.
 *
 * Authority rules enforced here without exception (PACK-C T004D):
 * - the module makes ZERO authority decisions: exposure admission is the
 *   T004A-owned policy seam over exact current state; effect classification
 *   and the effect=none gate are T004B/T004C-owned; occurrence/effect
 *   authority is Central-Admission-owned. This adapter adds no Tool-registry
 *   authority, no second runtime and no second admission path;
 * - the caller is provenance only: `agentId` becomes the generic
 *   `{ callerId, callerKind: 'agent' }` caller context and the kernel never
 *   branches on it (no Agent branch exists in the Microkernel — proven by the
 *   test matrix);
 * - the frozen v0.2 DomainQueryDispatcher/read seam is NOT widened: this
 *   module is a SIBLING adapter and mutation stays structurally absent from
 *   the Agent query path.
 *
 * Boundary discipline: this module consumes the T004A request/exposure seam,
 * the T004B non-effectful invocation seam, the T003A Tool declaration
 * validator, the #555 Definition graph validation/digest seam and the shared
 * descriptor-safe record primitive of `record-safety.ts` (all typed failures
 * propagate unchanged). No effectful-invocation/admission/governance/
 * Workflow/journal/AI/HTTP/Search/Storage/node import is permitted in this
 * file, and no public barrel exposes it.
 */
import type { ComponentId } from '../contracts/component.js';
import {
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
} from '../contracts/definition-graph.js';
import {
  canonicalJsonStringify,
  type ContentDigest,
  type Sha256Port,
} from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../contracts/invocation-request.js';
import {
  invokeNonEffectfulTool,
  type NonEffectfulToolDispatchPort,
  type NonEffectfulToolInvocationResult,
} from '../contracts/non-effectful-invocation.js';
import type { ResourceProvider } from '../contracts/resource-resolution.js';
import type { SealedRuntimeAssembly } from '../contracts/runtime-assembly.js';
import type { SealedToolImplementationBinding } from '../contracts/tool-implementation-binding.js';
import {
  validateToolComponent,
  type ToolOperationEffect,
} from '../contracts/tool-component.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeArraySnapshot,
  safeRecordSnapshot,
} from '../contracts/record-safety.js';

/**
 * Fail-closed Agent projection refusal taxonomy (PACK-C T004D). Every owner
 * seam failure (T004A exposure/request admission, T003A Tool validation,
 * #555 graph validation, T004B invocation) propagates UNCHANGED and is
 * deliberately absent. No diagnostic ever serializes policy internals,
 * secret values or live handles (only exact identity strings participate).
 */
export type AgentToolProjectionErrorCode =
  | 'INVALID_PROJECTION_INPUT'
  | 'AGENT_OPERATION_NOT_PROJECTED'
  | 'AGENT_MUTATION_REFUSED'
  | 'AGENT_PROJECTION_STALE';

export class AgentToolProjectionError extends Error {
  readonly code: AgentToolProjectionErrorCode;

  constructor(code: AgentToolProjectionErrorCode, message: string) {
    super(message);
    this.name = 'AgentToolProjectionError';
    this.code = code;
  }
}

/** The fixed caller-plane provenance kind this adapter stamps on its generic
 * caller contexts. Provenance only — the kernel never branches on it. */
export const AGENT_CALLER_KIND = 'agent';

// ---------------------------------------------------------------------------
// Projected surface shapes (derived metadata only — no authority material)
// ---------------------------------------------------------------------------

/** One projected operation: exact identity + frozen L2 effect class + the
 * exact current input/output schema snapshots. No handle, exposure evidence
 * or admission material is representable. */
export interface AgentProjectedOperation {
  /** Exact operation identity declared by the owning Tool Component. */
  readonly operationId: string;
  /** The frozen L2 effect class of the exact current contract. */
  readonly effect: ToolOperationEffect;
  /** Canonicalized snapshot of the exact current input schema material. */
  readonly inputSchema: JsonValue;
  /** Canonicalized snapshot of the exact current output schema material. */
  readonly outputSchema: JsonValue;
}

/** One projected Tool Component: exact identity + its agent-exposed
 * operations in declaration order. */
export interface AgentProjectedTool {
  /** Exact Tool Component id bound in the projected Definition graph. */
  readonly toolComponentId: ComponentId;
  /** The agent-exposed operations of this Tool (declaration order). */
  readonly operations: readonly AgentProjectedOperation[];
}

/**
 * The Agent Tool surface projection: derived metadata minted only by
 * `projectAgentToolSurface`. Binds the exact agent identity, the exact graph
 * identity + digest current at projection time, and frozen non-aliasing
 * schema snapshots of exactly the agent-exposed operations. PROJECTION ≠
 * AUTHORITY: this object mints no evidence and can never substitute for
 * admission evidence — every seam re-proves exact currentness on use.
 */
export interface AgentToolSurfaceProjection {
  readonly status: 'PROJECTED';
  /** The exact Agent identity this surface was projected for. */
  readonly agentId: string;
  /** The exact Definition graph identity the projection was derived from. */
  readonly graphId: string;
  /** The exact Definition graph digest current at projection time. */
  readonly definitionGraphDigest: ContentDigest;
  /** Agent-exposed Tools of the projected graph (graph component order). */
  readonly tools: readonly AgentProjectedTool[];
}

// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------

function fail(code: AgentToolProjectionErrorCode, message: string): never {
  throw new AgentToolProjectionError(code, message);
}

/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(
  value: unknown,
  description: string,
  code: AgentToolProjectionErrorCode = 'INVALID_PROJECTION_INPUT',
): Record<string, unknown> {
  const result = safeRecordSnapshot(value, description);
  if (!result.ok) {
    fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

/** Snapshot one authority-bearing array, mapping descriptor issues to a typed failure. */
function requireSafeArray(
  value: unknown,
  description: string,
): unknown[] {
  const result = safeArraySnapshot(value, description);
  if (!result.ok) {
    fail('INVALID_PROJECTION_INPUT', `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

function requireSha256Port(value: unknown, path: string): Sha256Port {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as Sha256Port).digestUtf8 !== 'function'
  ) {
    fail('INVALID_PROJECTION_INPUT', `${path} must be a Sha256Port ({ digestUtf8(value): Promise<string> })`);
  }
  return value as Sha256Port;
}

/**
 * Exact identity string: non-empty and free of floating tokens, range
 * operators and embedded `id@selector` forms — never normalized.
 */
function requireExactIdentity(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    fail('INVALID_PROJECTION_INPUT', `${path} must be a string`);
  }
  if (!isNonEmptyIdentityString(value)) {
    fail('INVALID_PROJECTION_INPUT', `${path} must be a non-empty exact identity`);
  }
  if (carriesEmbeddedSelector(value) || carriesFloatingOrRangeSemantics(value)) {
    fail(
      'INVALID_PROJECTION_INPUT',
      `${path} must be an exact identity, not a floating/range selector or embedded \`id@version\` form (latest/current/active/default/*/x/range)`,
    );
  }
  return value;
}

/** Validate one portable-JSON material field, returning a canonical deep copy. */
function requireJsonMaterial(value: unknown, path: string): JsonValue {
  try {
    return JSON.parse(canonicalJsonStringify(value)) as JsonValue;
  } catch {
    fail('INVALID_PROJECTION_INPUT', `${path} must be portable JSON material`);
  }
}

/** Deep-freeze a module-owned value object (callers' objects are never frozen). */
function deepFreezeValue<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreezeValue((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Read one own DATA property without invoking hidden getters (branded/frozen
 * contract objects the descriptor-safe record snapshot cannot consume
 * directly).
 */
function readOwnDataProperty(value: object, key: string, description: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    fail('INVALID_PROJECTION_INPUT', `${description}.${key} is required`);
  }
  if (descriptor.get !== undefined || descriptor.set !== undefined) {
    fail('INVALID_PROJECTION_INPUT', `${description}.${key} must be a data property, not accessor-backed`);
  }
  return descriptor.value;
}

/**
 * The Agent-plane exposure rule: the operation's exact current declarative
 * `declaredExposure` material is a record whose `audiences` list contains the
 * exact `agent` audience. Declarative-only input to the admission decision —
 * never a substitute for it (the T004A-owned policy seam decides over exact
 * current state on every admission).
 */
function operationExposedToAgent(operation: { readonly declaredExposure?: JsonValue }): boolean {
  const exposure = operation.declaredExposure;
  if (typeof exposure !== 'object' || exposure === null || Array.isArray(exposure)) {
    return false;
  }
  const audiences = (exposure as Record<string, unknown>)['audiences'];
  return Array.isArray(audiences) && audiences.includes(AGENT_CALLER_KIND);
}

/**
 * The fixed Agent-plane exposure admission policy consumed by the T004A seam.
 * Stateless: every decision runs over the descriptor-safe operation snapshot
 * of the exact current graph supplied by `admitToolExposure`.
 */
const AGENT_PLANE_EXPOSURE_POLICY: ToolExposureAdmissionPolicy = Object.freeze({
  decideAdmission(query: { readonly operation: { readonly declaredExposure?: JsonValue } }) {
    if (operationExposedToAgent(query.operation)) {
      return { admitted: true as const };
    }
    return {
      admitted: false as const,
      reason: 'the operation exposure material of the exact current contract does not admit the agent audience',
    };
  },
});

// ---------------------------------------------------------------------------
// Projection input + projection scan
// ---------------------------------------------------------------------------

const PROJECT_INPUT_FIELDS = new Set(['agentId', 'currentDefinitionGraph', 'sha256']);

/** Complete projection input; all material is synchronously snapshotted
 * before the first `await`. */
export interface ProjectAgentToolSurfaceInput {
  /** Exact Agent identity the surface is projected for (provenance only). */
  readonly agentId: string;
  /** The live current Definition graph; currentness is digest-bound. */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /** The Sha256Port used for the authoritative graph digest. */
  readonly sha256: Sha256Port;
}

const PROJECTED_OPERATION_FIELDS = new Set(['operationId', 'effect', 'inputSchema', 'outputSchema']);
const PROJECTION_FIELDS = new Set(['status', 'agentId', 'graphId', 'definitionGraphDigest', 'tools']);
const PROJECTED_TOOL_FIELDS = new Set(['toolComponentId', 'operations']);

/**
 * Synchronously validate a presented projection (any seam input) on a
 * descriptor-safe snapshot and return the snapshot view. The projection is
 * derived metadata: shape validation only, no mint registry — authority
 * never rides on it.
 */
function snapshotProjectionView(value: unknown): {
  readonly agentId: string;
  readonly graphId: string;
  readonly definitionGraphDigest: string;
  readonly tools: ReadonlyArray<{
    readonly toolComponentId: string;
    readonly operations: ReadonlyArray<{ readonly operationId: string; readonly effect: string }>;
  }>;
} {
  const at = 'agent tool projection';
  const view = requireSafeRecord(value, at);
  const unexpectedField = Object.keys(view).find((key) => !PROJECTION_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_PROJECTION_INPUT',
      `${at} must contain exactly {status, agentId, graphId, definitionGraphDigest, tools}; unexpected field "${unexpectedField}" (no authority material is representable on a projection)`,
    );
  }
  for (const required of ['status', 'agentId', 'graphId', 'definitionGraphDigest', 'tools'] as const) {
    if (!(required in view)) {
      fail('INVALID_PROJECTION_INPUT', `${at}.${required} is required`);
    }
  }
  if (view.status !== 'PROJECTED') {
    fail('INVALID_PROJECTION_INPUT', `${at}.status must be exactly "PROJECTED"`);
  }
  const agentId = requireExactIdentity(view.agentId, `${at}.agentId`);
  const graphId = requireExactIdentity(view.graphId, `${at}.graphId`);
  if (typeof view.definitionGraphDigest !== 'string' || view.definitionGraphDigest.length === 0) {
    fail('INVALID_PROJECTION_INPUT', `${at}.definitionGraphDigest must be a non-empty content digest string`);
  }
  const toolEntries = requireSafeArray(view.tools, `${at}.tools`);
  const tools = toolEntries.map((entry, index) => {
    const toolView = requireSafeRecord(entry, `${at}.tools[${index}]`);
    const unexpectedToolField = Object.keys(toolView).find((key) => !PROJECTED_TOOL_FIELDS.has(key));
    if (unexpectedToolField !== undefined) {
      fail('INVALID_PROJECTION_INPUT', `${at}.tools[${index}] must contain exactly {toolComponentId, operations}; unexpected field "${unexpectedToolField}"`);
    }
    const toolComponentId = requireExactIdentity(toolView.toolComponentId, `${at}.tools[${index}].toolComponentId`);
    const operationEntries = requireSafeArray(toolView.operations, `${at}.tools[${index}].operations`);
    const operations = operationEntries.map((operationEntry, operationIndex) => {
      const operationView = requireSafeRecord(operationEntry, `${at}.tools[${index}].operations[${operationIndex}]`);
      const unexpectedOperationField = Object.keys(operationView).find((key) => !PROJECTED_OPERATION_FIELDS.has(key));
      if (unexpectedOperationField !== undefined) {
        fail('INVALID_PROJECTION_INPUT', `${at}.tools[${index}].operations[${operationIndex}] must contain exactly {operationId, effect, inputSchema, outputSchema}; unexpected field "${unexpectedOperationField}"`);
      }
      const operationId = requireExactIdentity(operationView.operationId, `${at}.tools[${index}].operations[${operationIndex}].operationId`);
      if (typeof operationView.effect !== 'string') {
        fail('INVALID_PROJECTION_INPUT', `${at}.tools[${index}].operations[${operationIndex}].effect must be a string`);
      }
      return { operationId, effect: operationView.effect };
    });
    return { toolComponentId, operations };
  });
  return { agentId, graphId, definitionGraphDigest: view.definitionGraphDigest, tools };
}

/**
 * Resolve one projected operation entry from a validated projection view.
 * The projection is per-agent: a projection minted for another agent exposes
 * nothing to this caller.
 */
function findProjectedOperation(
  projection: ReturnType<typeof snapshotProjectionView>,
  agentId: string,
  toolComponentId: string,
  operationId: string,
): { readonly operationId: string; readonly effect: string } | undefined {
  if (projection.agentId !== agentId) {
    return undefined;
  }
  const tool = projection.tools.find((entry) => entry.toolComponentId === toolComponentId);
  if (tool === undefined) {
    return undefined;
  }
  return tool.operations.find((operation) => operation.operationId === operationId);
}

/**
 * Authoritatively verify projection freshness against the exact current
 * graph: identity AND recomputed digest must both match. Any drift means the
 * derived metadata describes older state and can never authorize (or even
 * route) current execution.
 */
async function requireProjectionFresh(
  projection: ReturnType<typeof snapshotProjectionView>,
  graph: DefinitionGraphEnvelope,
  sha256: Sha256Port,
): Promise<void> {
  if (graph.graphId !== projection.graphId) {
    fail(
      'AGENT_PROJECTION_STALE',
      `the Agent Tool projection was minted over Definition graph "${projection.graphId}" but the exact current graph is "${graph.graphId}"; a projection can never authorize or route a different graph identity`,
    );
  }
  const currentDigest = await computeDefinitionGraphDigest(graph, sha256);
  if (currentDigest !== projection.definitionGraphDigest) {
    fail(
      'AGENT_PROJECTION_STALE',
      'the exact current Definition graph digest no longer matches the digest bound in the Agent Tool projection; the projection describes older state and can never authorize current execution — re-project against the exact current graph',
    );
  }
}

// ---------------------------------------------------------------------------
// projectAgentToolSurface — the Agent plane projection boundary
// ---------------------------------------------------------------------------

/**
 * Project the Agent Tool surface from the EXACT current Definition graph.
 *
 * Deterministic fail-closed precedence: input shape, exact identity, graph
 * envelope validation (propagated unchanged), then per-Tool declaration
 * validation (T003A failures propagated unchanged) and synchronous canonical
 * operation snapshots, and finally the authoritative graph digest bind.
 *
 * Only operations whose exact current declarative exposure admits the
 * `agent` audience are projected. The minted projection is deeply frozen,
 * non-aliasing and digest-bound — derived metadata only.
 */
export async function projectAgentToolSurface(
  input: ProjectAgentToolSurfaceInput,
): Promise<AgentToolSurfaceProjection> {
  // ---- PHASE 1 (synchronous): validate and snapshot all input material.
  const view = requireSafeRecord(input, 'agent tool projection input');
  const unexpectedInputField = Object.keys(view).find((key) => !PROJECT_INPUT_FIELDS.has(key));
  if (unexpectedInputField !== undefined) {
    fail(
      'INVALID_PROJECTION_INPUT',
      `agent tool projection input must contain exactly {agentId, currentDefinitionGraph, sha256}; unexpected field "${unexpectedInputField}" (no authority material is representable)`,
    );
  }
  for (const required of ['agentId', 'currentDefinitionGraph', 'sha256'] as const) {
    if (!(required in view) || view[required] === undefined) {
      fail('INVALID_PROJECTION_INPUT', `agent tool projection input.${required} is required`);
    }
  }
  const agentId = requireExactIdentity(view.agentId, 'agent tool projection input.agentId');
  const sha256 = requireSha256Port(view.sha256, 'agent tool projection input.sha256');

  const graph = view.currentDefinitionGraph as DefinitionGraphEnvelope;
  // Graph envelope failures propagate the original DefinitionGraphContractError.
  validateDefinitionGraphEnvelope(graph);

  const tools: AgentProjectedTool[] = [];
  for (const component of graph.components) {
    if (component.family !== 'tool') {
      continue;
    }
    // Tool declaration failures propagate the original ToolComponentContractError.
    validateToolComponent(component);
    const body = requireSafeRecord(
      component.semanticBody,
      `Tool Component "${component.componentId}" semanticBody`,
    );
    const declared = requireSafeArray(body['operations'], `Tool Component "${component.componentId}" operations`);
    const operations: AgentProjectedOperation[] = [];
    for (const [index, candidate] of declared.entries()) {
      const operation = requireSafeRecord(
        candidate,
        `Tool Component "${component.componentId}" operation`,
      );
      const snapshot: Record<string, unknown> = {
        operationId: requireExactIdentity(operation['operationId'], `operation[${index}].operationId`),
        effect: operation['effect'],
        inputSchema: requireJsonMaterial(operation['inputSchema'], `operation[${index}].inputSchema`),
        outputSchema: requireJsonMaterial(operation['outputSchema'], `operation[${index}].outputSchema`),
      };
      if ('declaredExposure' in operation && operation['declaredExposure'] !== undefined) {
        snapshot['declaredExposure'] = requireJsonMaterial(
          operation['declaredExposure'],
          `operation[${index}].declaredExposure`,
        );
      }
      if (!operationExposedToAgent(snapshot)) {
        continue;
      }
      operations.push(
        deepFreezeValue({
          operationId: snapshot['operationId'],
          effect: snapshot['effect'],
          inputSchema: snapshot['inputSchema'],
          outputSchema: snapshot['outputSchema'],
        }) as unknown as AgentProjectedOperation,
      );
    }
    tools.push(
      deepFreezeValue({
        toolComponentId: component.componentId,
        operations,
      }),
    );
  }

  // ---- PHASE 2 (async): bind the exact current graph digest.
  const definitionGraphDigest = await computeDefinitionGraphDigest(graph, sha256);

  const projection: AgentToolSurfaceProjection = deepFreezeValue({
    status: 'PROJECTED' as const,
    agentId,
    graphId: graph.graphId,
    definitionGraphDigest,
    tools,
  });
  return projection;
}

// ---------------------------------------------------------------------------
// Shared seam snapshot helpers
// ---------------------------------------------------------------------------

const QUERY_INPUT_FIELDS = new Set([
  'agentId',
  'toolComponentId',
  'operationId',
  'proposal',
  'projection',
  'binding',
  'currentDefinitionGraph',
  'dispatch',
  'resourceProvider',
  'sha256',
]);

const MUTATION_INTENT_FIELDS = new Set([
  'agentId',
  'toolComponentId',
  'operationId',
  'proposal',
  'projection',
  'assembly',
  'currentDefinitionGraph',
  'sha256',
]);

interface SeamSnapshot {
  readonly agentId: string;
  readonly toolComponentId: ComponentId;
  readonly operationId: string;
  readonly proposal: JsonValue;
  readonly projection: ReturnType<typeof snapshotProjectionView>;
  readonly caller: InvocationCallerContext;
  readonly graph: DefinitionGraphEnvelope;
  readonly sha256: Sha256Port;
}

/**
 * Synchronously validate the shared seam material: exact identities, proposal
 * JSON snapshot, projection view (per-agent membership resolved by the
 * caller), live graph and digest port. `fields` is the seam's closed-world
 * input field set; `entries` the required field names.
 */
function snapshotSeamInput(
  input: unknown,
  fields: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  const view = requireSafeRecord(input, `${label} input`);
  const unexpectedField = Object.keys(view).find((key) => !fields.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_PROJECTION_INPUT',
      `${label} input must contain exactly {${[...fields].join(', ')}}; unexpected field "${unexpectedField}" (no occurrence, journal, verdict, pin or effect-routing material is representable)`,
    );
  }
  return view;
}

/** Snapshot the dispatch binding's successor Assembly reference (read-only). */
function snapshotBindingAnchor(binding: unknown): SealedRuntimeAssembly {
  if (typeof binding !== 'object' || binding === null) {
    fail('INVALID_PROJECTION_INPUT', 'seam input.binding must be the T003C sealed Tool implementation binding object');
  }
  const successorAssembly = readOwnDataProperty(
    binding,
    'successorAssembly',
    'seam input.binding',
  );
  if (typeof successorAssembly !== 'object' || successorAssembly === null) {
    fail('INVALID_PROJECTION_INPUT', 'seam input.binding.successorAssembly must be the sealed successor Runtime Assembly object');
  }
  // Provenance of the sealed Assembly object itself is re-proved downstream by
  // the consumed T004B seam (T002B mint verifier) before any dispatch.
  return successorAssembly as SealedRuntimeAssembly;
}

/** Snapshot the explicit sealed Assembly input of the mutation-intent seam. */
function snapshotAssemblyInput(assembly: unknown): SealedRuntimeAssembly {
  if (typeof assembly !== 'object' || assembly === null) {
    fail('INVALID_PROJECTION_INPUT', 'seam input.assembly must be the sealed Runtime Assembly object');
  }
  return assembly as SealedRuntimeAssembly;
}

/** Resolve + gate one projected operation for a seam (membership + query-only
 * effect gate). `queryOnly` enforces the mutation refusal on the query seam. */
function requireProjectedSeamOperation(
  view: Record<string, unknown>,
  requiredFields: readonly string[],
  label: string,
  queryOnly: boolean,
): SeamSnapshot {
  for (const required of requiredFields) {
    if (!(required in view) || view[required] === undefined) {
      fail('INVALID_PROJECTION_INPUT', `${label} input.${required} is required`);
    }
  }
  const agentId = requireExactIdentity(view['agentId'], `${label} input.agentId`);
  const toolComponentId = requireExactIdentity(
    view['toolComponentId'],
    `${label} input.toolComponentId`,
  );
  const operationId = requireExactIdentity(view['operationId'], `${label} input.operationId`);
  const proposal = requireJsonMaterial(view['proposal'], `${label} input.proposal`);
  const projection = snapshotProjectionView(view['projection']);
  const graph = view['currentDefinitionGraph'] as DefinitionGraphEnvelope;
  const sha256 = requireSha256Port(view['sha256'], `${label} input.sha256`);

  const projected = findProjectedOperation(projection, agentId, toolComponentId, operationId);
  if (projected === undefined) {
    fail(
      'AGENT_OPERATION_NOT_PROJECTED',
      `operation "${operationId}" of Tool Component "${toolComponentId}" is not on the Agent-projected surface for agent "${agentId}"; operations without exact admitted agent exposure are invisible to the Agent plane and refuse before any admission or dispatch`,
    );
  }
  if (queryOnly && projected.effect !== 'none') {
    fail(
      'AGENT_MUTATION_REFUSED',
      `operation "${operationId}" of Tool Component "${toolComponentId}" is classified "${projected.effect}" and is mutation-capable; the Agent query seam invokes only effect=none operations and refuses mutation before any implementation dispatch — mutation-capable intent must enter the generic T004A request and route through the T004C authoritative occurrence / Central Admission path (no Agent mutation shortcut exists)`,
    );
  }

  const caller: InvocationCallerContext = deepFreezeValue({
    callerId: agentId,
    callerKind: AGENT_CALLER_KIND,
  });
  return { agentId, toolComponentId, operationId, proposal, projection, caller, graph, sha256 };
}

// ---------------------------------------------------------------------------
// queryAgentTool — the Agent/Harness QUERY-ONLY seam
// ---------------------------------------------------------------------------

/** Complete query-seam input. All authority-bearing material is synchronously
 * snapshotted before the first `await`; the seam is structurally read-only —
 * no effectful routing option exists. */
export interface AgentToolQueryInput {
  /** Exact Agent identity (provenance only). */
  readonly agentId: string;
  /** Exact Tool Component id bound in the current graph. */
  readonly toolComponentId: ComponentId;
  /** Exact operation identity declared by that Tool Component. */
  readonly operationId: string;
  /** Model output/proposal material — provenance only, never authority. */
  readonly proposal: JsonValue;
  /** The Agent Tool surface projection (derived metadata; freshness-gated). */
  readonly projection: AgentToolSurfaceProjection;
  /** T003C sealed binding pairing the exact implementation pin + handle. */
  readonly binding: SealedToolImplementationBinding;
  /** The live current Definition graph. */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /** Injected Tool calling-convention port (the effect=none dispatch). */
  readonly dispatch: NonEffectfulToolDispatchPort;
  /** Optional injected T005B resource provider. */
  readonly resourceProvider?: ResourceProvider;
  /** The Sha256Port used for every authoritative digest recomputation. */
  readonly sha256: Sha256Port;
}

/**
 * Invoke ONE agent-exposed, effect=none operation through the generic
 * T004A -> T004B path.
 *
 * Deterministic fail-closed precedence, every refusal BEFORE any dispatch:
 * closed-world input shape, exact identities, projection view, membership
 * (AGENT_OPERATION_NOT_PROJECTED), the query-only effect gate
 * (AGENT_MUTATION_REFUSED) — all synchronous — then projection freshness
 * (AGENT_PROJECTION_STALE), then the generic T004A exposure admission over
 * the exact current state (policy decision over the exact current contract;
 * typed failures propagate unchanged), the T004A request admission, and
 * finally the T004B effect=none invocation, which independently re-admits
 * the request, re-derives the effect class, verifies the T003C binding and
 * dispatches only the verified handle. Model proposal material is provenance
 * only; the returned observational result can never mutate authoritative
 * Domain state.
 */
export async function queryAgentTool(
  input: AgentToolQueryInput,
): Promise<NonEffectfulToolInvocationResult> {
  // ---- PHASE 1 (synchronous): validate, snapshot and gate all material.
  const view = snapshotSeamInput(input, QUERY_INPUT_FIELDS, 'agent tool query');
  const seam = requireProjectedSeamOperation(
    view,
    ['agentId', 'toolComponentId', 'operationId', 'proposal', 'projection', 'binding', 'currentDefinitionGraph', 'dispatch', 'sha256'],
    'agent tool query',
    true,
  );
  const anchor = snapshotBindingAnchor(view['binding']);
  let resourceProvider: ResourceProvider | undefined;
  if (view['resourceProvider'] !== undefined) {
    const candidate = view['resourceProvider'];
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      typeof (candidate as ResourceProvider).resolve !== 'function'
    ) {
      fail('INVALID_PROJECTION_INPUT', 'agent tool query input.resourceProvider must be a ResourceProvider ({ resolve(request): Promise<ResourceProviderResponse> })');
    }
    resourceProvider = candidate as ResourceProvider;
  }
  const dispatch = view['dispatch'];
  if (
    typeof dispatch !== 'object' ||
    dispatch === null ||
    typeof (dispatch as NonEffectfulToolDispatchPort).dispatch !== 'function'
  ) {
    fail('INVALID_PROJECTION_INPUT', 'agent tool query input.dispatch must be a NonEffectfulToolDispatchPort ({ dispatch(query): Promise<unknown> })');
  }

  // Graph envelope failures propagate the original DefinitionGraphContractError.
  validateDefinitionGraphEnvelope(seam.graph);

  // ---- PHASE 2 (async): projection freshness, then the generic T004A seam.
  await requireProjectionFresh(seam.projection, seam.graph, seam.sha256);

  const exposure = await admitToolExposure(
    {
      toolComponentId: seam.toolComponentId,
      operationId: seam.operationId,
      caller: seam.caller,
      assembly: anchor,
      currentDefinitionGraph: seam.graph,
      policy: AGENT_PLANE_EXPOSURE_POLICY,
    },
    seam.sha256,
  );
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: seam.toolComponentId,
      operationId: seam.operationId,
      input: seam.proposal,
      caller: seam.caller,
      definitionGraphDigest: exposure.definitionGraphDigest,
      assemblyDigest: exposure.assemblyDigest,
      exposure,
    },
    { assembly: anchor, currentDefinitionGraph: seam.graph },
    seam.sha256,
  );

  // ---- PHASE 3: the generic T004B effect=none path — the only dispatch this
  // seam can ever reach, and only for the exact verified binding handle.
  return await invokeNonEffectfulTool({
    request: admitted,
    binding: view['binding'] as SealedToolImplementationBinding,
    currentDefinitionGraph: seam.graph,
    dispatch: dispatch as NonEffectfulToolDispatchPort,
    ...(resourceProvider === undefined ? {} : { resourceProvider }),
    sha256: seam.sha256,
  });
}

// ---------------------------------------------------------------------------
// admitAgentMutationIntent — the generic T004A mutation-intent admission
// ---------------------------------------------------------------------------

/**
 * Complete mutation-intent input: proposal material + freshness anchors only.
 * NO dispatch port, NO occurrence material, NO admission ports — this seam
 * cannot execute anything. */
export interface AdmitAgentMutationIntentInput {
  /** Exact Agent identity (provenance only). */
  readonly agentId: string;
  /** Exact Tool Component id bound in the current graph. */
  readonly toolComponentId: ComponentId;
  /** Exact mutation-capable operation identity. */
  readonly operationId: string;
  /** Model output/proposal material — provenance only, never authority. */
  readonly proposal: JsonValue;
  /** The Agent Tool surface projection (derived metadata; freshness-gated). */
  readonly projection: AgentToolSurfaceProjection;
  /** The sealed Runtime Assembly the generic request is admitted against. */
  readonly assembly: SealedRuntimeAssembly;
  /** The live current Definition graph. */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /** The Sha256Port used for every authoritative digest recomputation. */
  readonly sha256: Sha256Port;
}

/**
 * Admit ONE mutation-capable Agent intent into the GENERIC T004A request.
 *
 * Deterministic fail-closed precedence: closed-world input shape, exact
 * identities, projection view, membership (AGENT_OPERATION_NOT_PROJECTED) —
 * all synchronous — then projection freshness (AGENT_PROJECTION_STALE), then
 * the generic T004A exposure admission (policy decision over the exact
 * current contract) and request admission (typed failures propagate
 * unchanged). The admitted request is returned for the HOST to route through
 * the T004C effectful seam against an already-authoritative occurrence —
 * this module exposes no mutation dispatch and performs no effect
 * classification of its own (the T004C-owned gate derives the frozen effect
 * class from the exact current graph at re-admission).
 */
export async function admitAgentMutationIntent(
  input: AdmitAgentMutationIntentInput,
): Promise<AdmittedToolInvocationRequest> {
  // ---- PHASE 1 (synchronous): validate and snapshot all input material.
  const view = snapshotSeamInput(input, MUTATION_INTENT_FIELDS, 'agent mutation intent');
  const seam = requireProjectedSeamOperation(
    view,
    ['agentId', 'toolComponentId', 'operationId', 'proposal', 'projection', 'assembly', 'currentDefinitionGraph', 'sha256'],
    'agent mutation intent',
    false,
  );
  const assembly = snapshotAssemblyInput(view['assembly']);

  // Graph envelope failures propagate the original DefinitionGraphContractError.
  validateDefinitionGraphEnvelope(seam.graph);

  // ---- PHASE 2 (async): projection freshness, then the generic T004A seam.
  await requireProjectionFresh(seam.projection, seam.graph, seam.sha256);

  const exposure = await admitToolExposure(
    {
      toolComponentId: seam.toolComponentId,
      operationId: seam.operationId,
      caller: seam.caller,
      assembly,
      currentDefinitionGraph: seam.graph,
      policy: AGENT_PLANE_EXPOSURE_POLICY,
    },
    seam.sha256,
  );
  return await admitToolInvocationRequest(
    {
      toolComponentId: seam.toolComponentId,
      operationId: seam.operationId,
      input: seam.proposal,
      caller: seam.caller,
      definitionGraphDigest: exposure.definitionGraphDigest,
      assemblyDigest: exposure.assemblyDigest,
      exposure,
    },
    { assembly, currentDefinitionGraph: seam.graph },
    seam.sha256,
  );
}
