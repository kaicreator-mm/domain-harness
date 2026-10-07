/**
 * v0.7 renderer-neutral UX Tool request adapter (issue #907 successor repair;
 * gate for the frozen #703 T004E packet; fine-grained DAG #534 T004E;
 * controller #537 LOCAL_FIRST_MAX_SAFE_PARALLELISM).
 *
 * ADAPTER, not Microkernel semantics: the UX plane is a caller/provenance
 * plane, NEVER an authority owner. This module owns exactly the concern the
 * #703 frozen packet assigns to T004E — and nothing else:
 *
 * - TWO-PLANE SEAM: `queryUxTool(intent, host)` /
 *   `invokeUxToolEffectfully(intent, host)` structurally separate the
 *   closed-world PORTABLE UX INTENT (`UxToolRequestIntent`: exact Tool
 *   Component + operation + portable JSON input + caller provenance + the two
 *   UX-claimed exact-current digest claims) from the TRUSTED HOST
 *   COMPOSITION (the exact current Definition graph, the INDEPENDENTLY
 *   supplied current sealed Assembly + current T003C sealed binding, the
 *   injected dispatch/resource ports and — effectful only — the
 *   already-authoritative occurrence/Central Admission material). No
 *   authority-bearing host object is representable on the portable intent
 *   plane: any such field (or hostile accessor/prototype substitute) fails
 *   closed typed (INVALID_UX_REQUEST_INPUT) before any admission or dispatch;
 *
 * - INDEPENDENT CURRENTNESS ANCHORS: the host composition supplies
 *   `currentAssembly` and `currentBinding` as INDEPENDENT anchors. The
 *   adapter never derives the consumed Assembly from the binding's
 *   `successorAssembly`. Before any generic admission it re-proves, in exact
 *   order: (A1/A2) the authoritative recomputed Definition graph digest
 *   equals the UX-claimed digest; (A3) the captured current Assembly digest
 *   equals the UX-claimed expected assembly digest — so a byte-stable
 *   Definition V1 -> V2 implementation/binding/Assembly replacement refuses
 *   the stale V1 intent UX_REQUEST_STALE even though the graph digest is
 *   unchanged; (A4) the captured current binding's successor assembly digest
 *   equals the captured current Assembly digest — a torn/stale host
 *   composition refuses. The consumed T004A/T004B/T004C seams still
 *   independently re-prove Definition AND Assembly AND exposure currentness
 *   on every call;
 * - PURE ROUTE: `queryUxTool` invokes ONLY operations whose frozen effect
 *   class (derived from the EXACT current graph, never from UX material) is
 *   exactly `none`, through the generic T004A exposure/request admission and
 *   the T004B effect=none path. The returned result is the T004B OBSERVED-only
 *   outcome, verbatim — UX may project it, never rewrite or upgrade it into
 *   business/runtime truth. A mutation-capable operation presented to this
 *   seam refuses UX_MUTATION_REFUSED BEFORE any admission or dispatch —
 *   never rerouted, never fallen back;
 * - EFFECTFUL ROUTE: `invokeUxToolEffectfully` is the ONLY mutation-capable
 *   entry. It re-derives the frozen effect class from the exact current graph,
 *   refuses effect=none intent typed (UX_EFFECTLESS_OPERATION_REFUSED) before
 *   any admission, then admits the GENERIC T004A request and routes it through
 *   the accepted T004C seam exactly once, against the already-authoritative
 *   occurrence / Central Admission material supplied by TRUSTED HOST
 *   COMPOSITION (`activator`, `admissionRequest`, `admissionPorts`) — yielding
 *   exactly one existing Central Admission record. This module exposes NO
 *   occurrence material, NO journal access, NO admission ports of its own and
 *   NO UX-supplied exposure policy: the exposure admission policy is
 *   module-internal and fixed (declarative `declaredExposure.audiences`
 *   containing the exact `ux` audience is input to the T004A-owned decision,
 *   never a substitute for it, and can never be selected or minted by UX);
 * - FRESHNESS: both seams verify BOTH UX-claimed digest claims against the
 *   authoritatively recomputed/captured current state BEFORE any generic
 *   admission, and refuse UX_REQUEST_STALE on any drift — no latest/default/
 *   order/alias fallback exists anywhere in this module. All caller-owned
 *   material is snapshotted synchronously before the first `await`: later
 *   mutations of the caller's intent object or top-level host replacements
 *   cannot swap captured material (no torn authority read).
 *
 * Authority rules enforced here without exception (#703 frozen packet):
 * - UX owns NO Runtime/journal/admission/currentness authority: the closed-
 *   world two-plane shapes admit no occurrence, activation/pin,
 *   admitted-exposure evidence or policy, implementation binding/handle,
 *   resource authority, journal/effect/idempotency, or governance material on
 *   the UX intent — any such field (or hostile accessor/prototype substitute)
 *   fails closed typed (INVALID_UX_REQUEST_INPUT) before any admission or
 *   dispatch; trusted host composition may legally carry exactly its own
 *   field set and nothing else;
 * - the caller is provenance only: `uxSessionId` becomes the generic
 *   `{ callerId, callerKind: 'ux' }` caller context and the kernel never
 *   branches on it (no UX branch exists in the Microkernel — proven by the
 *   test matrix over the consumed kernel seams);
 * - renderer neutrality: only exact identities + portable JSON material cross
 *   this boundary — no React/React Native/DOM/native renderer type and no
 *   concrete domain-ux/DAC type enters this module;
 * - T004D coexistence: this is a SIBLING caller adapter to
 *   `agent-tool-projection.ts`; it reuses the same generic T004A/B/C seams and
 *   introduces no second Runtime, journal, occurrence registry, exposure
 *   authority or Central Admission path.
 *
 * Boundary discipline: this module consumes the T004A request/exposure seam,
 * the T004B non-effectful invocation seam, the T004C effectful invocation
 * seam, the T003A Tool declaration validator, the #555 Definition graph
 * validation/digest seam and the shared descriptor-safe record primitive of
 * `record-safety.ts` (all typed failures propagate unchanged). Type-only
 * imports reference the T002D/T005C activator and the Central Admission
 * request shape; no journal/governance/Workflow/AI/HTTP/Search/Storage/node
 * import is permitted in this file, and no public barrel exposes it.
 */
import type { CentralAdmissionRequest } from '../admission/contracts.js';
import type { ComponentId } from '../contracts/component.js';
import {
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
} from '../contracts/definition-graph.js';
import {
  canonicalJsonStringify,
  isContentDigest,
  type ContentDigest,
  type Sha256Port,
} from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../contracts/invocation-request.js';
import {
  invokeNonEffectfulTool,
  type NonEffectfulToolDispatchPort,
  type NonEffectfulToolInvocationResult,
} from '../contracts/non-effectful-invocation.js';
import {
  invokeEffectfulTool,
  type EffectfulAdmissionPorts,
  type EffectfulToolDispatchPort,
  type EffectfulToolInvocationResult,
} from '../contracts/effectful-invocation.js';
import type { ResourceProvider } from '../contracts/resource-resolution.js';
import type { SealedRuntimeAssembly } from '../contracts/runtime-assembly.js';
import type { SealedToolImplementationBinding } from '../contracts/tool-implementation-binding.js';
import {
  validateToolComponent,
  type ToolOperationEffect,
} from '../contracts/tool-component.js';
import type { AssemblyExecutionActivator } from '../governance/assembly-activation.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeArraySnapshot,
  safeRecordSnapshot,
} from '../contracts/record-safety.js';

/**
 * Fail-closed UX request refusal taxonomy (#703 frozen packet). Every owner
 * seam failure (T004A exposure/request admission, T003A Tool validation,
 * #555 graph validation, T004B/T004C invocation) propagates UNCHANGED and is
 * deliberately absent. No diagnostic ever serializes policy internals,
 * secret values or live handles (only exact identity strings participate).
 */
export type UxToolRequestErrorCode =
  | 'INVALID_UX_REQUEST_INPUT'
  | 'UX_OPERATION_NOT_EXPOSED'
  | 'UX_MUTATION_REFUSED'
  | 'UX_EFFECTLESS_OPERATION_REFUSED'
  | 'UX_REQUEST_STALE';

export class UxToolRequestError extends Error {
  readonly code: UxToolRequestErrorCode;

  constructor(code: UxToolRequestErrorCode, message: string) {
    super(message);
    this.name = 'UxToolRequestError';
    this.code = code;
  }
}

/** The fixed caller-plane provenance kind this adapter stamps on its generic
 * caller contexts. Provenance only — the kernel never branches on it. */
export const UX_CALLER_KIND = 'ux';

// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------

function fail(code: UxToolRequestErrorCode, message: string): never {
  throw new UxToolRequestError(code, message);
}

/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(
  value: unknown,
  description: string,
): Record<string, unknown> {
  const result = safeRecordSnapshot(value, description);
  if (!result.ok) {
    fail('INVALID_UX_REQUEST_INPUT', `${description} ${describeRecordSafetyIssue(result.issue)}`);
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
    fail('INVALID_UX_REQUEST_INPUT', `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

function requireSha256Port(value: unknown, path: string): Sha256Port {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as Sha256Port).digestUtf8 !== 'function'
  ) {
    fail('INVALID_UX_REQUEST_INPUT', `${path} must be a Sha256Port ({ digestUtf8(value): Promise<string> })`);
  }
  return value as Sha256Port;
}

/**
 * Exact identity string: non-empty and free of floating tokens, range
 * operators and embedded `id@selector` forms — never normalized.
 */
function requireExactIdentity(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    fail('INVALID_UX_REQUEST_INPUT', `${path} must be a string`);
  }
  if (!isNonEmptyIdentityString(value)) {
    fail('INVALID_UX_REQUEST_INPUT', `${path} must be a non-empty exact identity`);
  }
  if (carriesEmbeddedSelector(value) || carriesFloatingOrRangeSemantics(value)) {
    fail(
      'INVALID_UX_REQUEST_INPUT',
      `${path} must be an exact identity, not a floating/range selector or embedded \`id@version\` form (latest/current/active/default/*/x/range)`,
    );
  }
  return value;
}

/** Consume the existing content-digest convention (no new digest semantics). */
function requireContentDigest(value: unknown, path: string): ContentDigest {
  if (!isContentDigest(value)) {
    fail('INVALID_UX_REQUEST_INPUT', `${path} must be a non-empty content digest string`);
  }
  return value;
}

/** Validate one portable-JSON material field, returning a canonical deep copy. */
function requireJsonMaterial(value: unknown, path: string): JsonValue {
  try {
    return JSON.parse(canonicalJsonStringify(value)) as JsonValue;
  } catch {
    fail('INVALID_UX_REQUEST_INPUT', `${path} must be portable JSON material`);
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
    fail('INVALID_UX_REQUEST_INPUT', `${description}.${key} is required`);
  }
  if (descriptor.get !== undefined || descriptor.set !== undefined) {
    fail('INVALID_UX_REQUEST_INPUT', `${description}.${key} must be a data property, not accessor-backed`);
  }
  return descriptor.value;
}

/**
 * The UX-plane exposure rule: the operation's exact current declarative
 * `declaredExposure` material is a record whose `audiences` list contains the
 * exact `ux` audience. Declarative-only input to the admission decision —
 * never a substitute for it (the T004A-owned policy seam decides over exact
 * current state on every admission).
 */
function operationExposedToUx(operation: { readonly declaredExposure?: JsonValue }): boolean {
  const exposure = operation.declaredExposure;
  if (typeof exposure !== 'object' || exposure === null || Array.isArray(exposure)) {
    return false;
  }
  const audiences = (exposure as Record<string, unknown>)['audiences'];
  return Array.isArray(audiences) && audiences.includes(UX_CALLER_KIND);
}

/**
 * The FIXED UX-plane exposure admission policy consumed by the T004A seam.
 * Module-internal by construction (#703: T004E MUST NOT expose a UX-supplied
 * ToolExposureAdmissionPolicy): no input field of either seam can select,
 * replace or mint it. Stateless: every decision runs over the descriptor-safe
 * operation snapshot of the exact current graph supplied by
 * `admitToolExposure`.
 */
const UX_PLANE_EXPOSURE_POLICY: ToolExposureAdmissionPolicy = Object.freeze({
  decideAdmission(query: { readonly operation: { readonly declaredExposure?: JsonValue } }) {
    if (operationExposedToUx(query.operation)) {
      return { admitted: true as const };
    }
    return {
      admitted: false as const,
      reason: 'the operation exposure material of the exact current contract does not admit the ux audience',
    };
  },
});

// ---------------------------------------------------------------------------
// Two-plane seam snapshots: portable intent vs trusted host composition
// ---------------------------------------------------------------------------

/**
 * The closed-world PORTABLE UX intent plane: exactly six UX-owned fields.
 * Everything else — every authority-bearing host object, occurrence,
 * journal, admission-evidence, policy, pin, handle or idempotency lookalike —
 * is structurally unrepresentable here.
 */
const UX_INTENT_FIELDS = new Set([
  'uxSessionId',
  'toolComponentId',
  'operationId',
  'input',
  'expectedDefinitionGraphDigest',
  'expectedAssemblyDigest',
]);

/** The closed-world trusted host composition for the pure query seam. */
const QUERY_HOST_FIELDS = new Set([
  'currentDefinitionGraph',
  'currentAssembly',
  'currentBinding',
  'dispatch',
  'resourceProvider',
  'sha256',
]);

/** The closed-world trusted host composition for the effectful seam. */
const EFFECTFUL_HOST_FIELDS = new Set([
  'currentDefinitionGraph',
  'currentAssembly',
  'currentBinding',
  'activator',
  'admissionRequest',
  'admissionPorts',
  'effectType',
  'dispatch',
  'resourceProvider',
  'sha256',
]);

/** The synchronously validated, module-owned portable intent snapshot. */
interface UxToolRequestIntentSnapshot {
  readonly uxSessionId: string;
  readonly toolComponentId: string;
  readonly operationId: string;
  readonly input: JsonValue;
  readonly expectedDefinitionGraphDigest: ContentDigest;
  readonly expectedAssemblyDigest: ContentDigest;
  readonly caller: InvocationCallerContext;
}

/**
 * Synchronously snapshot and validate the PORTABLE UX intent against its
 * closed-world field set: any unexpected field — any authority-bearing host
 * object (current/binding/graph/dispatch/resource/sha256/activator/
 * admission/effect-routing material), occurrence, journal, admission
 * evidence, pin, handle or idempotency lookalike — refuses typed
 * INVALID_UX_REQUEST_INPUT BEFORE any admission or dispatch, and hostile
 * accessors/prototypes are rejected by the descriptor-safe snapshot itself.
 */
function snapshotUxToolRequestIntent(
  intent: unknown,
  label: string,
): UxToolRequestIntentSnapshot {
  const view = requireSafeRecord(intent, `${label} intent`);
  const unexpectedField = Object.keys(view).find((key) => !UX_INTENT_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_UX_REQUEST_INPUT',
      `${label} intent must contain exactly {${[...UX_INTENT_FIELDS].join(', ')}}; unexpected field "${unexpectedField}" — no host authority object (current/binding assembly, graph, dispatch, resource, sha256, activator, admission, effect routing), occurrence, journal, admission-evidence, pin, handle or idempotency material is representable on the portable UX plane`,
    );
  }
  for (const required of UX_INTENT_FIELDS) {
    if (!(required in view) || view[required] === undefined) {
      fail('INVALID_UX_REQUEST_INPUT', `${label} intent.${required} is required`);
    }
  }
  const uxSessionId = requireExactIdentity(view['uxSessionId'], `${label} intent.uxSessionId`);
  const toolComponentId = requireExactIdentity(
    view['toolComponentId'],
    `${label} intent.toolComponentId`,
  );
  const operationId = requireExactIdentity(view['operationId'], `${label} intent.operationId`);
  const input = requireJsonMaterial(view['input'], `${label} intent.input`);
  const expectedDefinitionGraphDigest = requireExactIdentity(
    view['expectedDefinitionGraphDigest'],
    `${label} intent.expectedDefinitionGraphDigest`,
  );
  requireContentDigest(
    expectedDefinitionGraphDigest,
    `${label} intent.expectedDefinitionGraphDigest`,
  );
  const expectedAssemblyDigest = requireExactIdentity(
    view['expectedAssemblyDigest'],
    `${label} intent.expectedAssemblyDigest`,
  );
  requireContentDigest(expectedAssemblyDigest, `${label} intent.expectedAssemblyDigest`);

  const caller: InvocationCallerContext = deepFreezeValue({
    callerId: uxSessionId,
    callerKind: UX_CALLER_KIND,
  });
  return deepFreezeValue({
    uxSessionId,
    toolComponentId,
    operationId,
    input,
    expectedDefinitionGraphDigest,
    expectedAssemblyDigest,
    caller,
  });
}

/**
 * Synchronously snapshot the TRUSTED HOST COMPOSITION against its own exact
 * closed-world field set: the host plane may legally carry exactly its own
 * trusted authority composition and nothing else — UX intent material or any
 * other unexpected field refuses typed INVALID_UX_REQUEST_INPUT before any
 * admission or dispatch.
 */
function snapshotUxHostComposition(
  host: unknown,
  fields: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  const view = requireSafeRecord(host, `${label} host composition`);
  const unexpectedField = Object.keys(view).find((key) => !fields.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_UX_REQUEST_INPUT',
      `${label} host composition must contain exactly {${[...fields].join(', ')}}; unexpected field "${unexpectedField}" (trusted host composition may carry exactly its own field set — UX intent material and every other authority lookalike refuse)`,
    );
  }
  return view;
}

/** The synchronously captured, independently trusted current-host anchors. */
interface UxCurrentHostAnchors {
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  readonly sha256: Sha256Port;
  readonly currentAssembly: SealedRuntimeAssembly;
  readonly currentAssemblyDigest: ContentDigest;
  readonly currentBinding: SealedToolImplementationBinding;
  readonly currentBindingSuccessorAssembly: SealedRuntimeAssembly;
  readonly currentBindingSuccessorAssemblyDigest: ContentDigest;
}

/**
 * Synchronously capture the INDEPENDENT current-host anchors BEFORE the first
 * await: the exact current Definition graph reference, the sha256 port, the
 * independently supplied current sealed Assembly reference plus its exact
 * assemblyDigest value, and the current T003C sealed binding reference plus
 * its successor Assembly reference and exact digest value. The adapter does
 * not reimplement T002B/T003C mint verification — the consumed
 * T004A/T004B/T004C owners still perform their accepted provenance/
 * currentness verification; this capture only establishes the independently
 * supplied current-Assembly/current-binding relation frozen by #907 and
 * guarantees no torn read can swap any anchor after the seam has entered.
 */
function snapshotUxCurrentHostAnchors(
  hostView: Record<string, unknown>,
  label: string,
): UxCurrentHostAnchors {
  const currentDefinitionGraph = hostView['currentDefinitionGraph'];
  if (typeof currentDefinitionGraph !== 'object' || currentDefinitionGraph === null) {
    fail('INVALID_UX_REQUEST_INPUT', `${label}.currentDefinitionGraph must be the exact current Definition graph envelope (trusted host composition input)`);
  }
  const sha256 = requireSha256Port(hostView['sha256'], `${label}.sha256`);

  const currentAssembly = hostView['currentAssembly'];
  if (typeof currentAssembly !== 'object' || currentAssembly === null) {
    fail('INVALID_UX_REQUEST_INPUT', `${label}.currentAssembly must be the sealed current Runtime Assembly object (trusted host composition input)`);
  }
  const currentAssemblyDigest = requireContentDigest(
    readOwnDataProperty(currentAssembly, 'assemblyDigest', `${label}.currentAssembly`),
    `${label}.currentAssembly.assemblyDigest`,
  );

  const currentBinding = hostView['currentBinding'];
  if (typeof currentBinding !== 'object' || currentBinding === null) {
    fail('INVALID_UX_REQUEST_INPUT', `${label}.currentBinding must be the T003C sealed Tool implementation binding object (trusted host composition input)`);
  }
  const currentBindingSuccessorAssembly = readOwnDataProperty(
    currentBinding,
    'successorAssembly',
    `${label}.currentBinding`,
  );
  if (typeof currentBindingSuccessorAssembly !== 'object' || currentBindingSuccessorAssembly === null) {
    fail('INVALID_UX_REQUEST_INPUT', `${label}.currentBinding.successorAssembly must be the sealed successor Runtime Assembly object`);
  }
  const currentBindingSuccessorAssemblyDigest = requireContentDigest(
    readOwnDataProperty(
      currentBindingSuccessorAssembly,
      'assemblyDigest',
      `${label}.currentBinding.successorAssembly`,
    ),
    `${label}.currentBinding.successorAssembly.assemblyDigest`,
  );

  return {
    currentDefinitionGraph: currentDefinitionGraph as DefinitionGraphEnvelope,
    sha256,
    currentAssembly: currentAssembly as SealedRuntimeAssembly,
    currentAssemblyDigest,
    currentBinding: currentBinding as SealedToolImplementationBinding,
    currentBindingSuccessorAssembly: currentBindingSuccessorAssembly as SealedRuntimeAssembly,
    currentBindingSuccessorAssemblyDigest,
  };
}

/**
 * Resolve one UX-targeted operation against the EXACT current Definition
 * graph: the Tool Component must be bound, the operation must be declared,
 * its exact current declarative exposure must admit the `ux` audience, and
 * its frozen effect class is returned for the seam's routing gate. Every
 * classification is derived from exact current state — never from UX
 * material.
 */
function resolveCurrentUxOperation(
  graph: DefinitionGraphEnvelope,
  toolComponentId: string,
  operationId: string,
): { readonly effect: ToolOperationEffect } {
  const component = graph.components.find(
    (entry) => entry.family === 'tool' && entry.componentId === toolComponentId,
  );
  if (component === undefined) {
    fail(
      'UX_OPERATION_NOT_EXPOSED',
      `Tool Component "${toolComponentId}" is not bound in the exact current Definition graph; operations without an exact bound target are invisible to the UX plane and refuse before any admission or dispatch`,
    );
  }
  // Tool declaration failures propagate the original ToolComponentContractError.
  validateToolComponent(component);
  const body = requireSafeRecord(
    component.semanticBody,
    `Tool Component "${component.componentId}" semanticBody`,
  );
  const declared = requireSafeArray(body['operations'], `Tool Component "${component.componentId}" operations`);
  const match = declared.find((candidate) => {
    const view = requireSafeRecord(candidate, `Tool Component "${component.componentId}" operation`);
    return view['operationId'] === operationId;
  });
  if (match === undefined) {
    fail(
      'UX_OPERATION_NOT_EXPOSED',
      `operation "${operationId}" is not declared by Tool Component "${toolComponentId}" in the exact current Definition graph; unknown operations refuse before any admission or dispatch`,
    );
  }
  const operation = requireSafeRecord(match, `Tool Component "${component.componentId}" operation "${operationId}"`);
  if (!operationExposedToUx({ declaredExposure: operation['declaredExposure'] as JsonValue })) {
    fail(
      'UX_OPERATION_NOT_EXPOSED',
      `operation "${operationId}" of Tool Component "${toolComponentId}" is not exposed to the ux audience by the exact current contract; non-exposed operations are invisible to the UX plane and refuse before any admission or dispatch`,
    );
  }
  return { effect: operation['effect'] as ToolOperationEffect };
}

/**
 * The seam routing gate over the effect class derived from the EXACT current
 * host graph (`requireEffectNone` routes the pure seam; its inverse routes
 * the effectful seam). Refusal happens BEFORE any admission or dispatch.
 */
function requireUxOperationRoute(
  intentSnapshot: UxToolRequestIntentSnapshot,
  currentDefinitionGraph: DefinitionGraphEnvelope,
  requireEffectNone: boolean,
): void {
  const { effect } = resolveCurrentUxOperation(
    currentDefinitionGraph,
    intentSnapshot.toolComponentId,
    intentSnapshot.operationId,
  );
  if (requireEffectNone && effect !== 'none') {
    fail(
      'UX_MUTATION_REFUSED',
      `operation "${intentSnapshot.operationId}" of Tool Component "${intentSnapshot.toolComponentId}" is classified "${effect}" and is mutation-capable; the UX query seam invokes only effect=none operations and refuses mutation before any admission or dispatch — mutation-capable intent must enter the generic T004A request and route through the T004C authoritative occurrence / Central Admission path (no UX mutation shortcut exists)`,
    );
  }
  if (!requireEffectNone && effect === 'none') {
    fail(
      'UX_EFFECTLESS_OPERATION_REFUSED',
      `operation "${intentSnapshot.operationId}" of Tool Component "${intentSnapshot.toolComponentId}" is classified "none" and is not mutation-capable; the UX effectful seam accepts only mutation-capable intent and refuses effectless operations before any admission — observational use belongs to the UX query seam`,
    );
  }
}

/**
 * Authoritatively verify the UX-claimed currentness BEFORE any generic
 * admission, in exact order over the synchronously captured anchors:
 *  A1 recompute the exact current Definition graph digest;
 *  A2 it must equal the digest claimed by the UX intent;
 *  A3 the independently supplied current Assembly digest must equal the
 *     assembly digest claimed by the UX intent (a byte-stable Definition
 *     V1 -> V2 implementation/binding/Assembly replacement therefore refuses
 *     the stale V1 intent even though the graph digest is unchanged);
 *  A4 the current binding's successor assembly digest must equal the current
 *     Assembly digest (a torn/stale host composition refuses).
 * Any drift means the UX intent was shaped against older state and can never
 * authorize or route current execution — fail closed, no rebind, no
 * latest/default fallback.
 */
async function requireUxRequestFresh(
  intentSnapshot: UxToolRequestIntentSnapshot,
  anchors: UxCurrentHostAnchors,
): Promise<void> {
  const currentDigest = await computeDefinitionGraphDigest(
    anchors.currentDefinitionGraph,
    anchors.sha256,
  );
  if (currentDigest !== intentSnapshot.expectedDefinitionGraphDigest) {
    fail(
      'UX_REQUEST_STALE',
      'the exact current Definition graph digest no longer matches the digest claimed by the UX request; the UX intent describes older state and can never authorize current execution — re-shape the intent against the exact current graph',
    );
  }
  if (anchors.currentAssemblyDigest !== intentSnapshot.expectedAssemblyDigest) {
    fail(
      'UX_REQUEST_STALE',
      'the exact current Runtime Assembly digest no longer matches the assembly digest claimed by the UX request; the UX intent was shaped against a superseded implementation/binding of the same Definition and can never authorize current execution (a byte-stable Definition implementation replacement refuses the stale intent) — re-shape the intent against the exact current assembly',
    );
  }
  if (anchors.currentBindingSuccessorAssemblyDigest !== anchors.currentAssemblyDigest) {
    fail(
      'UX_REQUEST_STALE',
      'the current Tool implementation binding no longer resolves to the independently supplied current Runtime Assembly; the trusted host composition is torn or stale and refuses before any admission or dispatch',
    );
  }
}

/** Validate one injected dispatch port (T004B or T004C calling convention). */
function requireDispatchPort(
  value: unknown,
  path: string,
): { readonly dispatch: (query: unknown) => Promise<unknown> } {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as { dispatch?: unknown }).dispatch !== 'function'
  ) {
    fail('INVALID_UX_REQUEST_INPUT', `${path} must be a Tool dispatch port ({ dispatch(query): Promise<unknown> })`);
  }
  return value as { readonly dispatch: (query: unknown) => Promise<unknown> };
}

/** Validate the optional injected T005B resource provider (host plane view). */
function requireResourceProviderField(
  view: Record<string, unknown>,
  label: string,
): ResourceProvider | undefined {
  const candidate = view['resourceProvider'];
  if (candidate === undefined) {
    return undefined;
  }
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    typeof (candidate as ResourceProvider).resolve !== 'function'
  ) {
    fail('INVALID_UX_REQUEST_INPUT', `${label}.resourceProvider must be a ResourceProvider ({ resolve(request): Promise<ResourceProviderResponse> })`);
  }
  return candidate as ResourceProvider;
}

// ---------------------------------------------------------------------------
// queryUxTool — the renderer-neutral UX QUERY-ONLY seam (T004A -> T004B)
// ---------------------------------------------------------------------------

/**
 * The closed-world PORTABLE UX intent. UX-owned material only — exact
 * identities, portable JSON input and the two exact-current digest claims.
 * No authority-bearing host object is representable on this plane; trusted
 * host composition travels exclusively through the separate host parameter.
 */
export interface UxToolRequestIntent {
  /** Exact UX session identity (provenance only, never authority). */
  readonly uxSessionId: string;
  /** Exact Tool Component id bound in the current graph. */
  readonly toolComponentId: ComponentId;
  /** Exact operation identity declared by that Tool Component. */
  readonly operationId: string;
  /** Portable JSON input material — intent only, never authority. */
  readonly input: JsonValue;
  /** The exact current Definition graph digest the UX intent was shaped
   *  against; verified by authoritative recomputation before admission. */
  readonly expectedDefinitionGraphDigest: ContentDigest;
  /** The exact current Runtime Assembly digest the UX intent was shaped
   *  against; verified against the independently supplied host
   *  `currentAssembly` before admission, so a byte-stable Definition
   *  implementation/binding replacement refuses the stale intent. */
  readonly expectedAssemblyDigest: ContentDigest;
}

/** The trusted host composition consumed by the pure query seam. */
export interface QueryUxToolHostComposition {
  /** The live current Definition graph (trusted host composition input). */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /** The independently supplied current sealed Runtime Assembly — the ONLY
   *  Assembly anchor the T004A admission consumes; never derived from the
   *  binding's successor assembly. */
  readonly currentAssembly: SealedRuntimeAssembly;
  /** The current T003C sealed binding (its successor assembly digest must
   *  equal the current Assembly digest, or the composition refuses stale). */
  readonly currentBinding: SealedToolImplementationBinding;
  /** Injected Tool calling-convention port (the effect=none dispatch). */
  readonly dispatch: NonEffectfulToolDispatchPort;
  /** Optional injected T005B resource provider. */
  readonly resourceProvider?: ResourceProvider;
  /** The Sha256Port used for every authoritative digest recomputation. */
  readonly sha256: Sha256Port;
}

/**
 * Invoke ONE ux-exposed, effect=none operation through the generic
 * T004A -> T004B path.
 *
 * Deterministic fail-closed precedence, every refusal BEFORE any dispatch:
 * closed-world portable-intent shape (no host authority object is
 * representable on the UX plane), closed-world host shape, exact identities,
 * digest claims, portable-JSON input snapshot and the synchronous capture of
 * the independent currentAssembly/currentBinding anchors + ports (all before
 * the first await), then Definition envelope validation, membership +
 * exposure gate (UX_OPERATION_NOT_EXPOSED) and the query-only effect gate
 * (UX_MUTATION_REFUSED) — all synchronous, all derived from the EXACT current
 * host graph — then the UX currentness gates A1-A4 (UX_REQUEST_STALE), then
 * the generic T004A exposure admission over the exact current state (policy
 * decision over the exact current contract; typed failures propagate
 * unchanged), the T004A request admission anchored on the host
 * currentAssembly, and finally the T004B effect=none invocation, which
 * independently re-admits the request, re-derives the effect class, verifies
 * the T003C binding and dispatches only the verified handle. The returned
 * result is the T004B OBSERVED-only outcome: UX may project it but can never
 * rewrite, upgrade or substitute it as business/runtime truth.
 */
export async function queryUxTool(
  intent: UxToolRequestIntent,
  host: QueryUxToolHostComposition,
): Promise<NonEffectfulToolInvocationResult> {
  // ---- S0 (synchronous): snapshot + validate the portable intent ONLY.
  const intentSnapshot = snapshotUxToolRequestIntent(intent, 'ux tool query');
  // ---- S1 (synchronous): snapshot the trusted host composition ONLY.
  const hostView = snapshotUxHostComposition(host, QUERY_HOST_FIELDS, 'ux tool query');
  // ---- S2 (synchronous): capture the independent anchors + ports pre-await.
  const anchors = snapshotUxCurrentHostAnchors(hostView, 'ux tool query host');
  const resourceProvider = requireResourceProviderField(hostView, 'ux tool query host');
  const dispatch = requireDispatchPort(hostView['dispatch'], 'ux tool query host.dispatch');

  // ---- S3 (synchronous): envelope + routing gate over the exact host graph.
  // Graph envelope failures propagate the original DefinitionGraphContractError.
  validateDefinitionGraphEnvelope(anchors.currentDefinitionGraph);
  requireUxOperationRoute(intentSnapshot, anchors.currentDefinitionGraph, true);

  // ---- A1-A4 (async): the UX currentness gates, then the generic T004A seam.
  await requireUxRequestFresh(intentSnapshot, anchors);

  const exposure = await admitToolExposure(
    {
      toolComponentId: intentSnapshot.toolComponentId,
      operationId: intentSnapshot.operationId,
      caller: intentSnapshot.caller,
      assembly: anchors.currentAssembly,
      currentDefinitionGraph: anchors.currentDefinitionGraph,
      policy: UX_PLANE_EXPOSURE_POLICY,
    },
    anchors.sha256,
  );
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: intentSnapshot.toolComponentId,
      operationId: intentSnapshot.operationId,
      input: intentSnapshot.input,
      caller: intentSnapshot.caller,
      definitionGraphDigest: exposure.definitionGraphDigest,
      assemblyDigest: exposure.assemblyDigest,
      exposure,
    },
    { assembly: anchors.currentAssembly, currentDefinitionGraph: anchors.currentDefinitionGraph },
    anchors.sha256,
  );

  // ---- The generic T004B effect=none path — the only dispatch this seam can
  // ever reach, and only for the exact verified binding handle.
  return await invokeNonEffectfulTool({
    request: admitted,
    binding: anchors.currentBinding,
    currentDefinitionGraph: anchors.currentDefinitionGraph,
    dispatch: dispatch,
    ...(resourceProvider === undefined ? {} : { resourceProvider }),
    sha256: anchors.sha256,
  });
}

// ---------------------------------------------------------------------------
// invokeUxToolEffectfully — the renderer-neutral UX EFFECTFUL seam
// (T004A -> T004C + existing authoritative occurrence / Central Admission)
// ---------------------------------------------------------------------------

/**
 * The trusted host composition consumed by the effectful seam: the current
 * graph/Assembly/binding anchors plus the already-authoritative occurrence
 * authority (`activator` + `admissionRequest` + `admissionPorts`). The
 * adapter neither supplies, mints, copies from UX material, nor re-owns any
 * of it, and it exposes NO journal access of its own.
 */
export interface EffectfulUxToolHostComposition {
  /** The live current Definition graph (trusted host composition input). */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /** The independently supplied current sealed Runtime Assembly — the ONLY
   *  Assembly anchor the T004A admission consumes; never derived from the
   *  binding's successor assembly. */
  readonly currentAssembly: SealedRuntimeAssembly;
  /** The current T003C sealed binding (its successor assembly digest must
   *  equal the current Assembly digest, or the composition refuses stale). */
  readonly currentBinding: SealedToolImplementationBinding;
  /** The accepted T002C/T002D/T005C activation authority (host composition
   *  input; consumed by T004C for its existing occurrence/pin gates, never
   *  re-owned and never used to mint or overwrite an occurrence). */
  readonly activator: AssemblyExecutionActivator;
  /** The turn material of the already-authoritative occurrence (host
   *  composition input to the ONE existing Central Admission path). */
  readonly admissionRequest: CentralAdmissionRequest;
  /** Central Admission ports without the effect-tools port (host
   *  composition input; the effect-tools adapter is installed only inside
   *  the T004C owner). */
  readonly admissionPorts: EffectfulAdmissionPorts;
  /** The exact admission effect type this invocation realizes. */
  readonly effectType: string;
  /** Injected Tool calling-convention port for the verified handle. */
  readonly dispatch: EffectfulToolDispatchPort;
  /** Optional injected T005B resource provider. */
  readonly resourceProvider?: ResourceProvider;
  /** The Sha256Port used for every authoritative digest recomputation. */
  readonly sha256: Sha256Port;
}

/**
 * Route ONE ux-exposed, mutation-capable intent through the generic
 * T004A -> T004C path exactly once.
 *
 * Deterministic fail-closed precedence, every refusal BEFORE any admission
 * or effect: closed-world portable-intent shape (no host authority object is
 * representable on the UX plane), closed-world host shape, exact identities,
 * digest claims, portable-JSON input snapshot, the synchronous capture of the
 * independent currentAssembly/currentBinding anchors + the occurrence/
 * admission ports (all before the first await), then Definition envelope
 * validation, membership + exposure gate (UX_OPERATION_NOT_EXPOSED), the
 * mutation-capable effect gate (UX_EFFECTLESS_OPERATION_REFUSED — effect
 * classification is re-derived from the EXACT current graph, never trusted
 * from UX material) — all synchronous — then the UX currentness gates A1-A4
 * (UX_REQUEST_STALE), then the generic T004A exposure admission (policy
 * decision over the exact current contract) and request admission anchored on
 * the host currentAssembly (typed failures propagate unchanged). The admitted
 * generic request is then routed through the accepted T004C seam exactly
 * once, against the already-authoritative occurrence / Central Admission
 * material supplied by trusted host composition: exactly one existing
 * Central Admission record results. No T004B/query fallback exists, and the
 * returned result reflects the existing authoritative T004C/Central
 * Admission outcome — UX may observe/project it but can never rewrite,
 * upgrade or substitute it as business/runtime truth.
 */
export async function invokeUxToolEffectfully(
  intent: UxToolRequestIntent,
  host: EffectfulUxToolHostComposition,
): Promise<EffectfulToolInvocationResult> {
  // ---- S0 (synchronous): snapshot + validate the portable intent ONLY.
  const intentSnapshot = snapshotUxToolRequestIntent(intent, 'ux tool effectful');
  // ---- S1 (synchronous): snapshot the trusted host composition ONLY.
  const hostView = snapshotUxHostComposition(host, EFFECTFUL_HOST_FIELDS, 'ux tool effectful');
  // ---- S2 (synchronous): capture the independent anchors + ports pre-await.
  const anchors = snapshotUxCurrentHostAnchors(hostView, 'ux tool effectful host');
  const resourceProvider = requireResourceProviderField(hostView, 'ux tool effectful host');
  const dispatch = requireDispatchPort(hostView['dispatch'], 'ux tool effectful host.dispatch');
  const activator = hostView['activator'];
  if (typeof activator !== 'object' || activator === null) {
    fail('INVALID_UX_REQUEST_INPUT', 'ux tool effectful host.activator must be the accepted AssemblyExecutionActivator object (trusted host composition input)');
  }
  const admissionRequest = hostView['admissionRequest'];
  if (typeof admissionRequest !== 'object' || admissionRequest === null) {
    fail('INVALID_UX_REQUEST_INPUT', 'ux tool effectful host.admissionRequest must be the CentralAdmissionRequest turn material of the already-authoritative occurrence (trusted host composition input)');
  }
  const admissionPorts = requireSafeRecord(hostView['admissionPorts'], 'ux tool effectful host.admissionPorts');
  for (const required of ['governance', 'baselines', 'effectJournal'] as const) {
    if (!(required in admissionPorts) || admissionPorts[required] === undefined) {
      fail('INVALID_UX_REQUEST_INPUT', `ux tool effectful host.admissionPorts.${required} is required (Central Admission ports are trusted host composition input; the effect-tools port is installed only inside the T004C owner)`);
    }
  }
  const effectType = requireExactIdentity(hostView['effectType'], 'ux tool effectful host.effectType');

  // ---- S3 (synchronous): envelope + routing gate over the exact host graph.
  // Graph envelope failures propagate the original DefinitionGraphContractError.
  validateDefinitionGraphEnvelope(anchors.currentDefinitionGraph);
  requireUxOperationRoute(intentSnapshot, anchors.currentDefinitionGraph, false);

  // ---- A1-A4 (async): the UX currentness gates, then the generic T004A seam.
  await requireUxRequestFresh(intentSnapshot, anchors);

  const exposure = await admitToolExposure(
    {
      toolComponentId: intentSnapshot.toolComponentId,
      operationId: intentSnapshot.operationId,
      caller: intentSnapshot.caller,
      assembly: anchors.currentAssembly,
      currentDefinitionGraph: anchors.currentDefinitionGraph,
      policy: UX_PLANE_EXPOSURE_POLICY,
    },
    anchors.sha256,
  );
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: intentSnapshot.toolComponentId,
      operationId: intentSnapshot.operationId,
      input: intentSnapshot.input,
      caller: intentSnapshot.caller,
      definitionGraphDigest: exposure.definitionGraphDigest,
      assemblyDigest: exposure.assemblyDigest,
      exposure,
    },
    { assembly: anchors.currentAssembly, currentDefinitionGraph: anchors.currentDefinitionGraph },
    anchors.sha256,
  );

  // ---- The generic T004C effectful path exactly once — the only effect this
  // seam can ever produce, under the host-supplied authoritative occurrence
  // and the ONE existing Central Admission path.
  return await invokeEffectfulTool({
    request: admitted,
    binding: anchors.currentBinding,
    currentDefinitionGraph: anchors.currentDefinitionGraph,
    activator: activator as AssemblyExecutionActivator,
    admissionRequest: admissionRequest as CentralAdmissionRequest,
    admissionPorts: hostView['admissionPorts'] as EffectfulAdmissionPorts,
    effectType,
    dispatch: dispatch,
    ...(resourceProvider === undefined ? {} : { resourceProvider }),
    sha256: anchors.sha256,
  });
}
