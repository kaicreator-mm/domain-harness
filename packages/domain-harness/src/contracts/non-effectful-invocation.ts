/**
 * v0.7 non-effectful Tool invocation path (issue #632, fine-grained DAG #534
 * T004B; authority #589 PACK-C T004B section).
 *
 * This module is the Microkernel seam that executes ONE admitted Tool
 * invocation request (T004A) against the exact runtime implementation handle
 * paired by the T003C sealed binding — for operations whose frozen L2 effect
 * class is exactly `none`. It owns exactly the concerns PACK-C assigns to
 * T004B:
 *
 * - ONLY an operation explicitly classified `effect=none` may use this path.
 *  The effect class is never taken from the caller's request object: the
 *  request is RE-ADMITTED through the exported T004A seam over the exact
 *  current state, and the freshly re-derived classification gates dispatch.
 *  Any other effect class fails closed with EFFECTFUL_OPERATION_REJECTED
 *  BEFORE the dispatch port runs — never rerouted, never fallen back to an
 *  effectful path (T004C owns effectful Central Admission);
 * - dispatch ONLY the runtime handle paired with the exact current
 *  implementation pin: the T003C-owned consumer verifier proves the binding's
 *  mint authenticity, evidence digest and exact subject slot/currentness
 *  against the SAME final sealed Assembly before the opaque handle is paired
 *  and exposed, and the verified evidence must agree with the re-admitted
 *  request on Tool Component, bound operation set, Definition graph digest
 *  AND Assembly digest. Stale, mismatched or non-mint bindings fail before
 *  call;
 * - the result is OBSERVATIONAL/COMPUTATIONAL output only: it cannot mutate
 *  authoritative Domain state, append the durable effect journal, mint an
 *  occurrence, or become business truth merely because a Tool returned it.
 *  The module imports nothing transition/journal/occurrence-related, exposes
 *  no such option on its closed input shape and mints a frozen result binding
 *  only identity + portable output material;
 * - required resources go through the T005B resolution boundary before
 *  dispatch (T005C resource identity/currentness evidence is not landed; this
 *  module consumes T005B resolution results only and never invents T005C
 *  semantics). An Assembly that carries applicable requirements without an
 *  injected provider fails closed — no ambient, default or fallback resource;
 * - snapshot discipline: every authority-bearing input (request material,
 *  binding evidence, successor-Assembly identity, paired handle, applicable
 *  requirement material) is descriptor-safe validated and synchronously
 *  snapshotted BEFORE the first `await`; after any suspension only
 *  module-owned snapshot material is read. No caller-owned reread after
 *  await;
 * - Tool thrown/typed failures remain failures: a thrown dispatch error
 *  propagates unchanged and no authoritative outcome is ever synthesized; a
 *  non-portable Tool return fails closed typed.
 *
 * ---------------------------------------------------------------------------
 * GENUINE PROVENANCE CONSUMPTION (#691 post-merge bounded repair; #589
 * issuecomment-5993726738 §A2–A4/§C, executable #640, Fresh Review #685 P1-1
 * and P1-2, Fresh Planning Review #671)
 *
 * The final Assembly's provenance is decided by the accepted T002B-owned
 * `isSealedRuntimeAssembly` mint verifier consumed DIRECTLY over the exact
 * final Assembly — the binding's own successor Assembly, which is the one and
 * only dispatch anchor (exact contextual Assembly pin, #646/#658 posture: no
 * host-held mint record, caller trust callback, latest/default/global current
 * Assembly owner or content-consistency-only substitute exists, and no
 * injected host decision can affirm a forgery). A self-consistent forged
 * Assembly passes every T004A content check yet fails here with
 * ASSEMBLY_PROVENANCE_UNVERIFIED before any dispatch.
 *
 * The T003C binding authenticity/currentness semantics are CONSUMED, never
 * re-derived: `verifyToolImplementationBinding` proves module-private mint
 * membership, re-verifies the accepted v1 bindingDigest over the evidence
 * material, and decides exact subject slot/currentness against the SAME
 * final sealed Assembly BEFORE the opaque implementation handle is paired and
 * exposed. Its typed failures (UNMINTED_TOOL_IMPLEMENTATION_BINDING,
 * TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH,
 * MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING, STALE_TOOL_IMPLEMENTATION_BINDING,
 * TOOL_IMPLEMENTATION_PIN_MISMATCH) propagate unchanged — this module never
 * re-owns those semantics. Only the verifier-returned handle is ever
 * dispatched; a field-perfect lookalike of a genuine binding can never carry
 * the mint registry membership and fails closed before any dispatch.
 *
 * Boundary discipline: validation consumes the shared descriptor-safe record
 * primitive and unified exact-reference authority of `record-safety.ts`
 * (#557 + #578), the T004A request-admission seam (re-admission; its typed
 * failures propagate unchanged), the T002B mint verifier and the T003C
 * binding verification seam (both consumed directly; their typed failures
 * propagate unchanged), and the T005B resource-resolution seam (its typed
 * failures propagate unchanged). No
 * Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/Storage/node
 * import is permitted in this file, and no public barrel exposes it.
 */
import type { ComponentId } from './component.js';
import type { DefinitionGraphEnvelope } from './definition-graph.js';
import {
  canonicalJsonStringify,
  isContentDigest,
  type ContentDigest,
  type Sha256Port,
} from './identity.js';
import type { JsonValue } from './json.js';
import {
  isSealedRuntimeAssembly,
  type SealedRuntimeAssembly,
} from './runtime-assembly.js';
import {
  admitToolInvocationRequest,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolInvocationRequest,
} from './invocation-request.js';
import {
  resolveToolResources,
  type ResolvedResourceEntry,
  type ResourceProvider,
} from './resource-resolution.js';
import {
  verifyToolImplementationBinding,
  type SealedToolImplementationBinding,
  type ToolImplementationIdentity,
} from './tool-implementation-binding.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeArraySnapshot,
  safeRecordSnapshot,
} from './record-safety.js';

/**
 * Fail-closed non-effectful invocation failure taxonomy (PACK-C T004B). Every
 * failure is typed and terminal — none carries or suggests a
 * substitute/default/latest resolution, and no diagnostic ever serializes
 * implementation handles, secret values or live objects (only exact identity
 * strings participate).
 */
export type NonEffectfulInvocationErrorCode =
  | 'INVALID_INVOCATION_INPUT'
  | 'INVALID_BINDING_EVIDENCE'
  | 'ASSEMBLY_PROVENANCE_UNVERIFIED'
  | 'MISSING_RESOURCE_PROVIDER'
  | 'INVALID_TOOL_DISPATCH_PORT'
  | 'EFFECTFUL_OPERATION_REJECTED'
  | 'INVALID_TOOL_OUTPUT';

export class NonEffectfulInvocationError extends Error {
  readonly code: NonEffectfulInvocationErrorCode;

  constructor(code: NonEffectfulInvocationErrorCode, message: string) {
    super(message);
    this.name = 'NonEffectfulInvocationError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Injected host ports
// ---------------------------------------------------------------------------

/**
 * ONE generic dispatch query: the opaque implementation handle paired by the
 * T003C sealed binding, the admitted exact operation, the frozen input
 * snapshot and the T005B-resolved resource entries. No caller context and no
 * authority material is representable here.
 */
export interface NonEffectfulToolDispatchQuery {
  /** Opaque runtime handle paired with the exact pin OUTSIDE digest material. */
  readonly handle: unknown;
  /** The admitted exact operation identity. */
  readonly operationId: string;
  /** Frozen, canonicalized, non-aliasing portable JSON input snapshot. */
  readonly input: JsonValue;
  /** T005B-resolved entries keyed by exact resourceKey (empty when none apply). */
  readonly resources: ReadonlyMap<string, ResolvedResourceEntry>;
}

/**
 * Generic injected HOST_INTEGRATION port for the Tool calling convention:
 * the host knows how to invoke its own opaque handles. `dispatch` may be
 * async; a throw/rejection is the Tool's own failure and propagates
 * UNCHANGED — this module never catches, wraps or converts it into an
 * outcome.
 */
export interface NonEffectfulToolDispatchPort {
  readonly dispatch: (query: NonEffectfulToolDispatchQuery) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Invocation input and observational result
// ---------------------------------------------------------------------------

/** Complete invocation input. All authority-bearing material is snapshotted
 * synchronously before the first `await`. */
export interface InvokeNonEffectfulToolInput {
  /** T004A admitted request — consumed as dispatch intent, re-admitted
   *  internally over the exact current state before any dispatch. */
  readonly request: AdmittedToolInvocationRequest;
  /** T003C sealed binding pairing the exact implementation pin with the
   *  runtime handle; its successor Assembly is the dispatch anchor whose
   *  provenance is proven by the directly consumed T002B mint verifier. */
  readonly binding: SealedToolImplementationBinding;
  /** The live current Definition graph; currentness is authoritatively
   *  recomputed at re-admission. */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /** Injected Tool calling-convention port. */
  readonly dispatch: NonEffectfulToolDispatchPort;
  /** Optional injected T005B resource provider — REQUIRED when the sealed
   *  Assembly carries applicable requirements for this operation. */
  readonly resourceProvider?: ResourceProvider;
  /** The Sha256Port used for every authoritative digest recomputation. */
  readonly sha256: Sha256Port;
}

/**
 * The observational result of one non-effectful invocation: identity
 * material for audit (what exact pin was dispatched, under which exact
 * binding/Definition/Assembly identities) plus the frozen portable output.
 * OBSERVED ≠ authoritative: this object can never mutate Domain state,
 * append a durable effect journal, mint an occurrence or become business
 * truth.
 */
export interface NonEffectfulToolInvocationResult {
  readonly status: 'OBSERVED';
  readonly toolComponentId: ComponentId;
  readonly operationId: string;
  readonly output: JsonValue;
  /** The exact implementation pin whose paired handle was dispatched. */
  readonly implementation: ToolImplementationIdentity;
  /** The T003C binding evidence digest dispatched under. */
  readonly bindingDigest: ContentDigest;
  readonly definitionGraphDigest: ContentDigest;
  readonly assemblyDigest: ContentDigest;
}

// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------

function fail(code: NonEffectfulInvocationErrorCode, message: string): never {
  throw new NonEffectfulInvocationError(code, message);
}

/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(
  value: unknown,
  description: string,
  code: NonEffectfulInvocationErrorCode,
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
  code: NonEffectfulInvocationErrorCode,
): unknown[] {
  const result = safeArraySnapshot(value, description);
  if (!result.ok) {
    fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

function requireSha256Port(value: unknown, path: string): Sha256Port {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as Sha256Port).digestUtf8 !== 'function'
  ) {
    fail('INVALID_INVOCATION_INPUT', `${path} must be a Sha256Port ({ digestUtf8(value): Promise<string> })`);
  }
  return value as Sha256Port;
}

/**
 * Exact identity string: non-empty and free of floating tokens, range
 * operators and embedded `id@selector` forms — never normalized.
 */
function requireExactIdentity(
  value: unknown,
  path: string,
  code: NonEffectfulInvocationErrorCode,
): string {
  if (typeof value !== 'string') {
    fail(code, `${path} must be a string`);
  }
  if (!isNonEmptyIdentityString(value)) {
    fail(code, `${path} must be a non-empty exact identity`);
  }
  if (carriesEmbeddedSelector(value) || carriesFloatingOrRangeSemantics(value)) {
    fail(
      code,
      `${path} must be an exact identity, not a floating/range selector or embedded \`id@version\` form (latest/current/active/default/*/x/range)`,
    );
  }
  return value;
}

/** Validate one portable-JSON material field, returning a canonical deep copy. */
function requireJsonMaterial(
  value: unknown,
  path: string,
  code: NonEffectfulInvocationErrorCode,
): JsonValue {
  try {
    return JSON.parse(canonicalJsonStringify(value)) as JsonValue;
  } catch {
    fail(code, `${path} must be portable JSON material`);
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
 * Read one own DATA property without invoking hidden getters. Applies to
 * branded/frozen contract objects the descriptor-safe record snapshot cannot
 * consume directly (they legitimately carry symbol-keyed material).
 */
function readOwnDataProperty(
  value: object,
  key: string,
  code: NonEffectfulInvocationErrorCode,
  description: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    fail(code, `${description}.${key} is required`);
  }
  if (descriptor.get !== undefined || descriptor.set !== undefined) {
    fail(code, `${description}.${key} must be a data property, not accessor-backed`);
  }
  return descriptor.value;
}

// ---------------------------------------------------------------------------
// Request snapshot (dispatch intent; re-admitted authoritatively later)
// ---------------------------------------------------------------------------

const INPUT_FIELDS = new Set<string>([
  'request',
  'binding',
  'currentDefinitionGraph',
  'dispatch',
  'resourceProvider',
  'sha256',
]);

const REQUEST_FIELDS = new Set<string>([
  'status',
  'toolComponentId',
  'operationId',
  'input',
  'caller',
  'operationEffect',
  'definitionGraphDigest',
  'assemblyDigest',
  'exposure',
]);

interface SnapshotRequest {
  readonly toolComponentId: ComponentId;
  readonly operationId: string;
  readonly input: JsonValue;
  readonly caller: InvocationCallerContext;
  readonly definitionGraphDigest: ContentDigest;
  readonly assemblyDigest: ContentDigest;
  readonly exposure: ToolInvocationRequest['exposure'];
}

/**
 * Synchronously validate and snapshot the admitted-request material. The
 * presented object is dispatch INTENT, never trusted authority: its claimed
 * effect classification is ignored (re-derived from the current graph at
 * re-admission) and its exposure mint is re-verified by the T004A seam. The
 * reconstructed generic request is therefore built only from descriptor-safe
 * module-owned snapshot material.
 */
function snapshotRequest(value: unknown): SnapshotRequest {
  const at = 'invocation input.request';
  const view = requireSafeRecord(value, at, 'INVALID_INVOCATION_INPUT');
  const unexpectedField = Object.keys(view).find((key) => !REQUEST_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_INVOCATION_INPUT',
      `${at} must contain exactly the T004A admitted-request fields; unexpected field "${unexpectedField}"`,
    );
  }
  for (const required of REQUEST_FIELDS) {
    if (!(required in view)) {
      fail('INVALID_INVOCATION_INPUT', `${at}.${required} is required`);
    }
  }
  if (view.status !== 'ADMITTED') {
    fail('INVALID_INVOCATION_INPUT', `${at}.status must be exactly "ADMITTED"`);
  }
  if (typeof view.operationEffect !== 'string') {
    fail('INVALID_INVOCATION_INPUT', `${at}.operationEffect must be a string (the classification is re-derived, never trusted)`);
  }
  const toolComponentId = requireExactIdentity(
    view.toolComponentId,
    `${at}.toolComponentId`,
    'INVALID_INVOCATION_INPUT',
  );
  const operationId = requireExactIdentity(
    view.operationId,
    `${at}.operationId`,
    'INVALID_INVOCATION_INPUT',
  );
  const input = requireJsonMaterial(view.input, `${at}.input`, 'INVALID_INVOCATION_INPUT');
  const caller = requireJsonMaterial(view.caller, `${at}.caller`, 'INVALID_INVOCATION_INPUT');
  if (!isContentDigest(view.definitionGraphDigest)) {
    fail('INVALID_INVOCATION_INPUT', `${at}.definitionGraphDigest must be a non-empty content digest string`);
  }
  if (!isContentDigest(view.assemblyDigest)) {
    fail('INVALID_INVOCATION_INPUT', `${at}.assemblyDigest must be a non-empty content digest string`);
  }
  if (typeof view.exposure !== 'object' || view.exposure === null) {
    fail('INVALID_INVOCATION_INPUT', `${at}.exposure must be the admitted exposure evidence object`);
  }
  return {
    toolComponentId,
    operationId,
    input,
    caller: caller as unknown as InvocationCallerContext,
    definitionGraphDigest: view.definitionGraphDigest,
    assemblyDigest: view.assemblyDigest,
    exposure: view.exposure as ToolInvocationRequest['exposure'],
  };
}

// ---------------------------------------------------------------------------
// Dispatch-anchor snapshot (assembly provenance decided here; binding
// authenticity delegated to the T003C consumer verifier)
// ---------------------------------------------------------------------------

interface SnapshotDispatchAnchor {
  /** The exact successor-Assembly object — the dispatch anchor (reference). */
  readonly successorAssembly: SealedRuntimeAssembly;
  /** Phase-1 count of Assembly requirements applicable to this operation. */
  readonly applicableRequirementCount: number;
}

/**
 * Synchronously snapshot the dispatch anchor and prove its provenance. The
 * dispatch anchor is the binding's OWN successor Assembly — the exact
 * contextual Assembly pin (#646/#658 posture); there is no separate assembly
 * input, no global current/latest Assembly owner and no other repair.
 *
 * #691 P1-1 repair: the anchor's provenance is decided by the accepted
 * T002B-owned `isSealedRuntimeAssembly` mint verifier consumed DIRECTLY over
 * this exact object. A self-consistent content forgery — never passed through
 * `sealRuntimeAssembly` — fails ASSEMBLY_PROVENANCE_UNVERIFIED here, before
 * the T004A re-admission that would otherwise accept its content checks. No
 * host-held mint record, caller trust callback or content-consistency-only
 * substitute can authorize the anchor.
 *
 * Binding AUTHENTICITY (module-private mint membership, v1 evidence digest,
 * exact subject slot/currentness) is deliberately NOT re-derived here: it is
 * consumed from the T003C-owned verifier in the async phase, before the
 * opaque implementation handle is paired and exposed.
 */
function snapshotDispatchAnchor(value: unknown, request: SnapshotRequest): SnapshotDispatchAnchor {
  const at = 'invocation input.binding';
  if (typeof value !== 'object' || value === null) {
    fail('INVALID_BINDING_EVIDENCE', `${at} must be the T003C sealed Tool implementation binding object`);
  }
  const successorAssembly = readOwnDataProperty(
    value,
    'successorAssembly',
    'INVALID_BINDING_EVIDENCE',
    at,
  );
  if (typeof successorAssembly !== 'object' || successorAssembly === null) {
    fail('INVALID_BINDING_EVIDENCE', `${at}.successorAssembly must be the sealed successor Runtime Assembly object`);
  }
  if (!isSealedRuntimeAssembly(successorAssembly)) {
    fail(
      'ASSEMBLY_PROVENANCE_UNVERIFIED',
      `the dispatch anchor (${at}.successorAssembly) is not a SealedRuntimeAssembly minted by sealRuntimeAssembly — the accepted T002B mint verifier is consumed directly over the exact final Assembly and a self-consistent content forgery can never supply the dispatch anchor`,
    );
  }
  const successorRecord = readOwnDataProperty(
    successorAssembly,
    'record',
    'INVALID_BINDING_EVIDENCE',
    `${at}.successorAssembly`,
  );
  const applicableRequirementCount = countApplicableRequirements(
    successorRecord,
    request.toolComponentId,
    request.operationId,
  );
  return {
    successorAssembly,
    applicableRequirementCount,
  };
}

/**
 * Count the sealed-Assembly requirements applicable to one invocation
 * operation: component-scope requirements always apply; operation-scoped
 * requirements apply only to their exact operation. Tolerant structural read
 * (the authoritative requirement-material validation lives in the T005B
 * seam); structural surprises fail closed typed.
 */
function countApplicableRequirements(
  record: unknown,
  toolComponentId: string,
  operationId: string,
): number {
  if (typeof record !== 'object' || record === null) {
    fail('INVALID_BINDING_EVIDENCE', 'sealed binding successorAssembly.record must be an object');
  }
  const requirements = readOwnDataProperty(
    record,
    'resourceRequirements',
    'INVALID_BINDING_EVIDENCE',
    'sealed binding successorAssembly.record',
  );
  const entries = requireSafeArray(
    requirements,
    'sealed binding successorAssembly.record.resourceRequirements',
    'INVALID_BINDING_EVIDENCE',
  );
  let count = 0;
  for (const entry of entries) {
    const material = requireSafeRecord(
      entry,
      'sealed binding successorAssembly.record.resourceRequirements entry',
      'INVALID_BINDING_EVIDENCE',
    );
    if (material.componentId !== toolComponentId || !Array.isArray(material.requirements)) {
      continue;
    }
    for (const requirement of material.requirements) {
      if (typeof requirement !== 'object' || requirement === null) {
        fail('INVALID_BINDING_EVIDENCE', 'sealed Assembly requirement material must be records');
      }
      const scoped = (requirement as { operationId?: unknown }).operationId;
      if (scoped === undefined || scoped === operationId) {
        count += 1;
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// invokeNonEffectfulTool — the non-effectful dispatch boundary (PACK-C T004B)
// ---------------------------------------------------------------------------

/**
 * Execute ONE admitted Tool invocation request through the `effect=none`
 * path.
 *
 * Deterministic fail-closed precedence: input shape, port shapes, request
 * snapshot and the dispatch-anchor snapshot (where the directly consumed
 * T002B mint verifier decides the final Assembly's provenance,
 * ASSEMBLY_PROVENANCE_UNVERIFIED) — all synchronous — then, after the single
 * re-admission suspension, the freshly derived effect gate
 * (EFFECTFUL_OPERATION_REJECTED), the T003C-owned binding verification whose
 * typed failures propagate unchanged
 * (UNMINTED_TOOL_IMPLEMENTATION_BINDING, TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH,
 * MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING, STALE_TOOL_IMPLEMENTATION_BINDING),
 * T004B-owned dispatch consistency over the VERIFIED binding
 * (INVALID_BINDING_EVIDENCE), T005B resource resolution (failures propagated
 * unchanged) and finally the dispatch. The Tool's own thrown failures
 * propagate unchanged; only a portable-JSON Tool return is snapshotted into
 * the frozen observational result.
 *
 * Torn-snapshot discipline: every authority-bearing input is descriptor-safe
 * validated and synchronously snapshotted before the first `await` (the T004A
 * re-admission's own synchronous phase runs in the same tick, over the same
 * caller-owned graph object, before its first suspension); after any
 * suspension only module-owned snapshot material, the frozen genuine-mint
 * anchor and the fresh frozen T003C-verified material are read — the
 * dispatched handle is the verifier-paired reference, never a re-read of
 * caller-owned state.
 */
export async function invokeNonEffectfulTool(
  input: InvokeNonEffectfulToolInput,
): Promise<NonEffectfulToolInvocationResult> {
  // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
  const view = requireSafeRecord(input, 'non-effectful invocation input', 'INVALID_INVOCATION_INPUT');
  const unexpectedInputField = Object.keys(view).find((key) => !INPUT_FIELDS.has(key));
  if (unexpectedInputField !== undefined) {
    fail(
      'INVALID_INVOCATION_INPUT',
      `non-effectful invocation input must contain exactly {request, binding, currentDefinitionGraph, dispatch, resourceProvider?, sha256}; unexpected field "${unexpectedInputField}" (no transition, occurrence, journal or injected provenance-decision material is representable)`,
    );
  }
  for (const required of ['request', 'binding', 'currentDefinitionGraph', 'dispatch', 'sha256'] as const) {
    if (!(required in view) || view[required] === undefined) {
      fail('INVALID_INVOCATION_INPUT', `non-effectful invocation input.${required} is required`);
    }
  }

  const sha256 = requireSha256Port(view.sha256, 'non-effectful invocation input.sha256');

  const dispatchPort = view.dispatch;
  if (
    typeof dispatchPort !== 'object' ||
    dispatchPort === null ||
    typeof (dispatchPort as NonEffectfulToolDispatchPort).dispatch !== 'function'
  ) {
    fail(
      'INVALID_TOOL_DISPATCH_PORT',
      'non-effectful invocation input.dispatch must be a NonEffectfulToolDispatchPort ({ dispatch({ handle, operationId, input, resources }): Promise<unknown> })',
    );
  }

  let resourceProvider: ResourceProvider | undefined;
  if (view.resourceProvider !== undefined) {
    const candidate = view.resourceProvider;
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      typeof (candidate as ResourceProvider).resolve !== 'function'
    ) {
      fail(
        'INVALID_INVOCATION_INPUT',
        'non-effectful invocation input.resourceProvider must be a ResourceProvider ({ resolve(request): Promise<ResourceProviderResponse> })',
      );
    }
    resourceProvider = candidate as ResourceProvider;
  }

  const graph = view.currentDefinitionGraph as DefinitionGraphEnvelope;

  const request = snapshotRequest(view.request);
  const anchor = snapshotDispatchAnchor(view.binding, request);

  // ---- PHASE 2 (async): re-admission over the exact current state.
  //
  // The dispatch anchor is the binding's OWN successor Assembly: a request
  // admitted against any other Assembly fails currentness here, before any
  // Tool call. T004A typed failures propagate unchanged.
  const reconstructed: ToolInvocationRequest = Object.freeze({
    toolComponentId: request.toolComponentId,
    operationId: request.operationId,
    input: request.input,
    caller: request.caller,
    definitionGraphDigest: request.definitionGraphDigest,
    assemblyDigest: request.assemblyDigest,
    exposure: request.exposure,
  });
  const admitted = await admitToolInvocationRequest(
    reconstructed,
    { assembly: anchor.successorAssembly, currentDefinitionGraph: graph },
    sha256,
  );

  // The effect gate runs on the FRESHLY DERIVED classification — never on the
  // caller-presented operationEffect.
  if (admitted.operationEffect !== 'none') {
    fail(
      'EFFECTFUL_OPERATION_REJECTED',
      `operation "${admitted.operationId}" of Tool Component "${admitted.toolComponentId}" is classified "${admitted.operationEffect}" and can never use the effect=none path; effectful operations route through the T004C authoritative occurrence / Central Admission path — this module never dispatches them and never falls back`,
    );
  }

  // ---- #691 P1-2 repair: T003C-owned binding verification BEFORE the opaque
  // implementation handle is paired and exposed. The verifier proves
  // module-private mint membership, re-verifies the accepted v1
  // bindingDigest over the evidence material, and decides exact subject
  // slot/currentness against the SAME final sealed Assembly (the anchor). Its
  // typed failures propagate unchanged — this module never re-derives or
  // re-owns those semantics.
  const verified = await verifyToolImplementationBinding({
    binding: view.binding as SealedToolImplementationBinding,
    finalAssembly: anchor.successorAssembly,
    sha256,
  });

  // Binding/request dispatch consistency over the VERIFIED material: the
  // exact verifier-paired handle pairs only with the exact current pin under
  // the exact current identities. (T003C deliberately never compares the
  // historical mint-time evidence.assemblyDigest to the final Assembly; the
  // cross-seam equality checks here consume only VERIFIED/ADMITTED material.)
  const evidence = verified.evidence;
  if (evidence.toolComponentId !== admitted.toolComponentId) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      `the verified binding pairs the handle of Tool Component "${evidence.toolComponentId}" but the admitted request targets "${admitted.toolComponentId}"; a binding can never dispatch another target's handle`,
    );
  }
  if (verified.currentness.definitionGraphDigest !== admitted.definitionGraphDigest) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      'the verified binding currentness is anchored to a different Definition graph digest than the authoritatively recomputed current digest; a stale binding fails closed before any Tool call',
    );
  }
  if (verified.currentness.finalAssemblyDigest !== admitted.assemblyDigest) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      'the verified binding currentness is anchored to a different final Assembly digest than the admitted request; a binding verified against another successor Assembly fails closed before any Tool call',
    );
  }
  if (!evidence.supportedOperations.includes(admitted.operationId)) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      `the verified binding binds only operations (${evidence.supportedOperations.join(', ')}) and does not include the admitted operation "${admitted.operationId}"; the paired handle never dispatches outside the exact bound set`,
    );
  }

  // Resources: only sealed-Assembly requirements are resolved, through the
  // T005B boundary, before dispatch. T005B typed failures propagate unchanged.
  let resources: ReadonlyMap<string, ResolvedResourceEntry>;
  if (resourceProvider !== undefined) {
    const resolved = await resolveToolResources(
      {
        assembly: anchor.successorAssembly,
        componentId: admitted.toolComponentId,
        operationId: admitted.operationId,
        provider: resourceProvider,
      },
    );
    resources = resolved.resources;
  } else if (anchor.applicableRequirementCount > 0) {
    fail(
      'MISSING_RESOURCE_PROVIDER',
      `the sealed Assembly carries ${anchor.applicableRequirementCount} applicable resource requirement(s) for operation "${admitted.operationId}" of Tool Component "${admitted.toolComponentId}", but no ResourceProvider was injected; requirements fail closed before dispatch — no ambient, default, or fallback resource exists`,
    );
  } else {
    resources = new Map<string, ResolvedResourceEntry>();
  }

  // ---- Dispatch: the VERIFIER-PAIRED handle (exposed only after mint,
  // evidence, final-slot and currentness verification succeeded), the frozen
  // input snapshot, the resolved resources. Tool thrown failures propagate
  // unchanged — never caught, wrapped or converted into an outcome.
  const dispatchQuery: NonEffectfulToolDispatchQuery = Object.freeze({
    handle: verified.implementationHandle,
    operationId: admitted.operationId,
    input: admitted.input,
    resources,
  });
  const rawOutput = await (dispatchPort as NonEffectfulToolDispatchPort).dispatch(dispatchQuery);

  // The Tool output is observational material: snapshot it immediately after
  // the suspension into frozen module-owned portable JSON.
  const output = deepFreezeValue(
    requireJsonMaterial(rawOutput, 'tool output', 'INVALID_TOOL_OUTPUT'),
  );

  const result: NonEffectfulToolInvocationResult = Object.freeze({
    status: 'OBSERVED' as const,
    toolComponentId: admitted.toolComponentId,
    operationId: admitted.operationId,
    output,
    implementation: evidence.implementation,
    bindingDigest: evidence.bindingDigest,
    definitionGraphDigest: admitted.definitionGraphDigest,
    assemblyDigest: admitted.assemblyDigest,
  });
  return result;
}
