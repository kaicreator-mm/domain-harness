/**
 * v0.7 effectful Tool invocation path — authoritative occurrence / Central
 * Admission composition (issue #874, fine-grained DAG T004C; authority #589
 * PACK-C T004C section + #672 readiness VERDICT=READY_CURRENT).
 *
 * This module is the Microkernel seam that routes ONE effectful Tool
 * invocation (an operation whose frozen L2 effect class is `idempotent` or
 * `non-idempotent`) onto an ALREADY-AUTHORITATIVE Domain/Workflow occurrence
 * through the EXISTING Central Admission effect path. It owns exactly the
 * composition concerns PACK-C assigns to T004C — and nothing else:
 *
 * - OCCURRENCE ANCHOR: every effectful Tool invocation binds to an
 *   already-authoritative occurrence. The occurrence identity is carried by
 *   the admission turn material itself (`admissionRequest.target` +
 *   `.workflowInstanceId` + `.turn`); this module never mints an occurrence,
 *   a turn id, an effect id or a pin. The identity material is descriptor-
 *   safely snapshotted synchronously before the first `await` and the
 *   admission request is reconstructed over the module-owned snapshot, so a
 *   caller mutating its own turn material mid-flight can never redirect the
 *   effect to a fresh occurrence/effect namespace;
 * - ONE EFFECT AUTHORITY: the existing Central Admission
 *   (`admitCentralDecision` + the existing `AdmissionDurableEffectJournal`
 *   port) is the ONLY public effect-admission and durable-effect/journal
 *   path. This module introduces no second runtime, journal, idempotency
 *   namespace, retry authority, effect registry or caller-supplied
 *   authorization verdict: the caller cannot even express an effect-tools
 *   port — the module installs the ONLY adapter, and that adapter dispatches
 *   ONLY the already-verified exact T003C binding handle (no independent
 *   implementation selection exists anywhere in this file);
 * - RE-PROOF, NEVER TRUST: the exact request/currentness is re-proven
 *   against the SAME genuine final sealed Assembly and current Definition
 *   through the accepted T004A seam (`admitToolInvocationRequest` — its typed
 *   failures propagate unchanged), whose dispatch anchor is the binding's own
 *   successor Assembly proven by the directly consumed T002B mint verifier
 *   (`isSealedRuntimeAssembly` — a self-consistent forgery fails
 *   ASSEMBLY_PROVENANCE_UNVERIFIED before any admission work). Caller claims
 *   are provenance only;
 * - EXACT BINDING: the accepted shared T003C consumer verifier
 *   (`verifyToolImplementationBinding`) is consumed against that SAME final
 *   Assembly BEFORE the opaque implementation handle is paired and exposed.
 *   No latest/default/range/registry-order/first-wins implementation
 *   selection exists. The verified material must agree with the re-admitted
 *   request on Tool Component, bound operation set, Definition graph digest
 *   AND final Assembly digest, else the invocation fails closed
 *   (INVALID_BINDING_EVIDENCE) before any effect;
 * - OCCURRENCE PIN GATES: the SAME occurrence must satisfy the accepted
 *   T002C/T002D/T005C gates on the injected `AssemblyExecutionActivator`:
 *   `requireProductionEffectAuthority` proves the durable, assembly-bearing,
 *   exact-`PRODUCTION`-class pin (SIMULATION, legacy class-less, unknown or
 *   malformed authority can never be upgraded — typed failures propagate
 *   unchanged), and this module additionally proves that the pinned
 *   occurrence is bound to the SAME final sealed Assembly as the admitted
 *   invocation (`OCCURRENCE_ASSEMBLY_MISMATCH` — a replaced Assembly never
 *   rides a pin bound to its predecessor; activation stays bind-once);
 * - RESOURCES/CURRENTNESS: required resources resolve ONLY through the
 *   accepted T005B seam (`resolveToolResources`) before dispatch; the fresh
 *   T005C resource-currentness pins are re-proven against the SAME occurrence
 *   pin through `requireResourceCurrentness`, so a missing/stale/replaced/
 *   ambiguous required currentness fails closed BEFORE the side effect;
 * - EFFECT CLASS GATE: an operation classified `none` never enters this path
 *   (T004B owns the effect=none path) — it fails
 *   EFFECTLESS_OPERATION_REJECTED before any dispatch and before any journal
 *   record;
 * - INTENT CLOSURE: the effect executed by Central Admission must realize
 *   exactly the admitted invocation: the adapter dispatches the admitted
 *   operation with the journaled intent input ONLY when it is exactly the
 *   re-admitted request input on the snapshotted occurrence target, else the
 *   typed EFFECT_INTENT_MISMATCH fails closed (the existing admission owner
 *   semantics then handle the begun record — never this module);
 * - PRESERVED OWNER SEMANTICS: durable effect identity, begin/complete,
 *   duplicate/idempotency, replay and recovery behavior stay ENTIRELY with
 *   the existing Central Admission effect execution (`executeEffectIntents`)
 *   and journal. This module never touches a journal record directly; when an
 *   effect may have happened and the durable outcome is unknown, the existing
 *   ambiguous/unknown-outcome posture stands — uncertainty is never converted
 *   into an unsafe automatic retry;
 * - AUDIT WITHOUT SECRETS: exact implementation/currentness auditability is
 *   derived from the exact pinned Assembly + the accepted T003C binding
 *   verification and returned as identity material only; live handles,
 *   functions and secrets never enter durable identity, evidence or
 *   diagnostics.
 *
 * Boundary discipline: validation consumes the shared descriptor-safe record
 * primitive of `record-safety.ts` (#557 + #578), the T004A request-admission
 * seam, the T002B mint verifier, the T003C binding verification seam, the
 * T005B resource-resolution seam, the T002C/T002D/T005C activation gates and
 * the Central Admission seam (all consumed directly; their typed failures
 * propagate unchanged). No concrete Workflow/XState/ToolRegistry/SQLite/
 * Agent/UX/AI/HTTP/Search/Storage/node import is permitted in this file, and
 * no public barrel exposes it.
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
  type ResourceCurrentnessEvidence,
  type ResolvedResourceEntry,
  type ResourceProvider,
} from './resource-resolution.js';
import {
  verifyToolImplementationBinding,
  type SealedToolImplementationBinding,
  type ToolImplementationIdentity,
} from './tool-implementation-binding.js';
import type { ToolOperationEffect } from './tool-component.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeArraySnapshot,
  safeRecordSnapshot,
} from './record-safety.js';
import { admitCentralDecision } from '../admission/admission.js';
import type {
  AdmissionDurableEffectJournal,
  AdmissionEffectToolBinding,
  AdmissionEffectToolPort,
  AdmissionEffectToolRequest,
  AdmissionTurnSource,
  CentralAdmissionOutcome,
  CentralAdmissionRequest,
} from '../admission/contracts.js';
import type { GovernanceBaselineStore } from '../governance/contracts.js';
import type { GovernanceExecutionCoordinator, RuntimeAuthorityClass } from '../governance/execution-binding.js';
import type { AssemblyExecutionActivator } from '../governance/assembly-activation.js';
import type { ToolEffectSemantics } from '../v2/contracts/package.js';

/**
 * Fail-closed effectful invocation failure taxonomy (PACK-C T004C). Only the
 * composition concerns THIS module owns appear here: every owner-seam failure
 * (T004A request admission, T003C binding verification, T005B resolution, the
 * T002C/T002D/T005C occurrence gates and Central Admission itself) propagates
 * UNCHANGED and is deliberately absent. No diagnostic ever serializes
 * implementation handles, secret values or live objects (only exact identity
 * strings participate).
 */
export type EffectfulInvocationErrorCode =
  | 'INVALID_INVOCATION_INPUT'
  | 'INVALID_TOOL_DISPATCH_PORT'
  | 'INVALID_BINDING_EVIDENCE'
  | 'ASSEMBLY_PROVENANCE_UNVERIFIED'
  | 'EFFECTLESS_OPERATION_REJECTED'
  | 'OCCURRENCE_ASSEMBLY_MISMATCH'
  | 'MISSING_RESOURCE_PROVIDER'
  | 'EFFECT_INTENT_MISMATCH';

export class EffectfulInvocationError extends Error {
  readonly code: EffectfulInvocationErrorCode;

  constructor(code: EffectfulInvocationErrorCode, message: string) {
    super(message);
    this.name = 'EffectfulInvocationError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Injected host ports and composition input
// ---------------------------------------------------------------------------

/**
 * The Central Admission ports the caller supplies — WITHOUT the effect-tools
 * port. The effect-tools port is not caller-expressible: this module installs
 * the only adapter, and that adapter dispatches only the already-verified
 * exact T003C binding (no independent implementation selection can be
 * injected by any caller plane).
 */
export interface EffectfulAdmissionPorts {
  /** T-014 gate; the exact durable pin is required for EVERY admission. */
  readonly governance: GovernanceExecutionCoordinator;
  readonly baselines: GovernanceBaselineStore;
  /** The existing durable effect journal — the ONE effect authority. */
  readonly effectJournal: AdmissionDurableEffectJournal;
}

/**
 * ONE generic dispatch query: the opaque implementation handle paired by the
 * T003C sealed binding (exposed only after full verification), the admitted
 * exact operation, the journaled input snapshot, the T005B-resolved resource
 * entries and the durable effect identity context derived by the existing
 * Central Admission path. No caller context and no authority material is
 * representable here.
 */
export interface EffectfulToolDispatchQuery {
  /** Opaque runtime handle paired with the exact pin OUTSIDE digest material. */
  readonly handle: unknown;
  /** The admitted exact operation identity. */
  readonly operationId: string;
  /** The journaled effect input (exactly the admitted invocation input). */
  readonly input: JsonValue;
  /** T005B-resolved entries keyed by exact resourceKey (empty when none apply). */
  readonly resources: ReadonlyMap<string, ResolvedResourceEntry>;
  /** The durable effect identity derived by Central Admission. */
  readonly effectId: string;
  readonly durableControlTurnId: string;
  readonly operationOrdinal: number;
  readonly effectType: string;
  readonly idempotencyKey?: string;
  readonly logicalTime: string;
}

/**
 * Generic injected HOST_INTEGRATION port for the effectful Tool calling
 * convention: the host knows how to invoke its own opaque handles. `dispatch`
 * may be async; a throw/rejection is the Tool's own failure and propagates
 * through the existing admission owner semantics — this module never catches,
 * wraps or converts it into an outcome.
 */
export interface EffectfulToolDispatchPort {
  readonly dispatch: (query: EffectfulToolDispatchQuery) => Promise<unknown>;
}

/** Complete invocation input. All authority-bearing material is snapshotted
 * synchronously before the first `await`. */
export interface InvokeEffectfulToolInput {
  /** T004A admitted request — consumed as dispatch intent, re-admitted
   *  internally over the exact current state before any effect. */
  readonly request: AdmittedToolInvocationRequest;
  /** T003C sealed binding pairing the exact implementation pin with the
   *  runtime handle; its successor Assembly is the dispatch anchor whose
   *  provenance is proven by the directly consumed T002B mint verifier. */
  readonly binding: SealedToolImplementationBinding;
  /** The live current Definition graph; currentness is authoritatively
   *  recomputed at re-admission. */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /**
   * The accepted T002C/T002D/T005C activation authority — CONSUMED for its
   * existing occurrence/pin gates (`requireProductionEffectAuthority`,
   * `requireResourceCurrentness`), never re-owned and never used to mint,
   * activate or overwrite an occurrence.
   */
  readonly activator: AssemblyExecutionActivator;
  /**
   * The turn material of the already-authoritative occurrence for the ONE
   * existing Central Admission path. The occurrence identity (target +
   * workflowInstanceId + turn + now) is snapshotted synchronously and the
   * request is reconstructed over the module-owned snapshot before admission.
   */
  readonly admissionRequest: CentralAdmissionRequest;
  /** Central Admission ports without the effect-tools port (see above). */
  readonly admissionPorts: EffectfulAdmissionPorts;
  /** The exact admission effect type this invocation realizes. */
  readonly effectType: string;
  /** Injected Tool calling-convention port for the verified handle. */
  readonly dispatch: EffectfulToolDispatchPort;
  /** Optional injected T005B resource provider — REQUIRED when the sealed
   *  Assembly carries applicable requirements for this operation. */
  readonly resourceProvider?: ResourceProvider;
  /** The Sha256Port used for every authoritative digest recomputation. */
  readonly sha256: Sha256Port;
}

/**
 * The result of one effectful invocation: the existing Central Admission
 * outcome (admitted plan or typed denial — owner semantics) plus exact
 * identity material for audit (the proven PRODUCTION occurrence pin identity
 * and the exact verified implementation pin). OBSERVED identity only: no live
 * handle, secret or journal record is representable, and this object never
 * mints occurrence, transition or effect authority by itself.
 */
export interface EffectfulToolInvocationResult {
  /** The existing Central Admission outcome — owner semantics, verbatim. */
  readonly outcome: CentralAdmissionOutcome;
  /** The exact occurrence pin identity the effect executed under. */
  readonly occurrence: {
    readonly workflowTarget: string;
    readonly workflowInstanceId: string;
    /** Exactly `PRODUCTION` — proven by the consumed T002D gate. */
    readonly authorityClass: RuntimeAuthorityClass;
    /** The exact durable pin digest (the occurrence currentness evidence). */
    readonly pinBindingDigest: string;
    /** The exact final sealed Assembly digest (pin-equal, proven). */
    readonly assemblyDigest: ContentDigest;
  };
  /** The exact verified invocation identity dispatched under. */
  readonly invocation: {
    readonly toolComponentId: ComponentId;
    readonly operationId: string;
    readonly effectType: string;
    readonly effectSemantics: ToolEffectSemantics;
    readonly implementation: ToolImplementationIdentity;
    readonly bindingDigest: ContentDigest;
    readonly definitionGraphDigest: ContentDigest;
  };
}

// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------

function fail(code: EffectfulInvocationErrorCode, message: string): never {
  throw new EffectfulInvocationError(code, message);
}

/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(
  value: unknown,
  description: string,
  code: EffectfulInvocationErrorCode,
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
  code: EffectfulInvocationErrorCode,
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
  code: EffectfulInvocationErrorCode,
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
  code: EffectfulInvocationErrorCode,
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
  'activator',
  'admissionRequest',
  'admissionPorts',
  'effectType',
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

const ADMISSION_REQUEST_FIELDS = new Set<string>([
  'target',
  'turn',
  'trigger',
  'workflowInstanceId',
  'definition',
  'currentStateKey',
  'context',
  'event',
  'resolved',
  'decisionSchema',
  'now',
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

/** Validate one portable-JSON material field, returning a canonical deep copy. */
function requireJsonMaterial(
  value: unknown,
  path: string,
  code: EffectfulInvocationErrorCode,
): JsonValue {
  try {
    return JSON.parse(canonicalJsonStringify(value)) as JsonValue;
  } catch {
    fail(code, `${path} must be portable JSON material`);
  }
}

// ---------------------------------------------------------------------------
// Occurrence identity snapshot (torn-safe occurrence/effect namespace anchor)
// ---------------------------------------------------------------------------

interface SnapshotOccurrenceIdentity {
  readonly target: { readonly workflowId: string; readonly instanceKey: string };
  readonly turn: AdmissionTurnSource;
  readonly workflowInstanceId: string;
  readonly now: string;
}

/**
 * Synchronously validate and snapshot the occurrence identity carried by the
 * admission turn material. The occurrence is CONSUMED, never minted: these
 * exact identity fields are the only occurrence material this module relies
 * on, so they are snapshotted before the first `await` and the admission
 * request is reconstructed over the snapshot — a caller mutating its own turn
 * material mid-flight can never redirect the effect to a fresh occurrence or
 * effect namespace.
 */
function snapshotOccurrenceIdentity(value: unknown): SnapshotOccurrenceIdentity {
  const at = 'invocation input.admissionRequest';
  const view = requireSafeRecord(value, at, 'INVALID_INVOCATION_INPUT');
  const unexpectedField = Object.keys(view).find((key) => !ADMISSION_REQUEST_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_INVOCATION_INPUT',
      `${at} must contain exactly the CentralAdmissionRequest fields; unexpected field "${unexpectedField}"`,
    );
  }
  for (const required of ADMISSION_REQUEST_FIELDS) {
    if (!(required in view)) {
      fail('INVALID_INVOCATION_INPUT', `${at}.${required} is required`);
    }
  }
  const targetView = requireSafeRecord(view.target, `${at}.target`, 'INVALID_INVOCATION_INPUT');
  const targetKeys = Object.keys(targetView).sort();
  if (targetKeys.length !== 2 || targetKeys[0] !== 'instanceKey' || targetKeys[1] !== 'workflowId') {
    fail('INVALID_INVOCATION_INPUT', `${at}.target must contain exactly {workflowId, instanceKey}`);
  }
  const workflowId = requireExactIdentity(targetView.workflowId, `${at}.target.workflowId`, 'INVALID_INVOCATION_INPUT');
  const instanceKey = requireExactIdentity(targetView.instanceKey, `${at}.target.instanceKey`, 'INVALID_INVOCATION_INPUT');
  const turn = deepFreezeValue(
    requireJsonMaterial(view.turn, `${at}.turn`, 'INVALID_INVOCATION_INPUT'),
  ) as unknown as AdmissionTurnSource;
  const workflowInstanceId = requireExactIdentity(
    view.workflowInstanceId,
    `${at}.workflowInstanceId`,
    'INVALID_INVOCATION_INPUT',
  );
  const now = requireExactIdentity(view.now, `${at}.now`, 'INVALID_INVOCATION_INPUT');
  return {
    target: Object.freeze({ workflowId, instanceKey }),
    turn,
    workflowInstanceId,
    now,
  };
}

// ---------------------------------------------------------------------------
// Dispatch-anchor snapshot (assembly provenance decided here; binding
// authenticity delegated to the T003C consumer verifier)
// ---------------------------------------------------------------------------

interface SnapshotDispatchAnchor {
  /** The exact successor-Assembly object — the dispatch anchor (reference). */
  readonly successorAssembly: SealedRuntimeAssembly;
  /** Count of Assembly requirements applicable to this operation. */
  readonly applicableRequirementCount: number;
}

/**
 * Synchronously snapshot the dispatch anchor and prove its provenance. The
 * dispatch anchor is the binding's OWN successor Assembly — the exact
 * contextual Assembly pin; there is no separate assembly input, no global
 * current Assembly owner and no other repair.
 *
 * The anchor's provenance is decided by the accepted T002B-owned
 * `isSealedRuntimeAssembly` mint verifier consumed DIRECTLY over this exact
 * object. A self-consistent content forgery — never passed through
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
// Port shape checks (fail closed before any owner seam runs)
// ---------------------------------------------------------------------------

function requireDispatchPort(value: unknown): EffectfulToolDispatchPort {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as EffectfulToolDispatchPort).dispatch !== 'function'
  ) {
    fail(
      'INVALID_TOOL_DISPATCH_PORT',
      'effectful invocation input.dispatch must be an EffectfulToolDispatchPort ({ dispatch({ handle, operationId, input, resources, effectId, durableControlTurnId, operationOrdinal, effectType, idempotencyKey?, logicalTime }): Promise<unknown> })',
    );
  }
  return value as EffectfulToolDispatchPort;
}

function requireActivator(value: unknown): AssemblyExecutionActivator {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as AssemblyExecutionActivator).requireProductionEffectAuthority !== 'function' ||
    typeof (value as AssemblyExecutionActivator).requireResourceCurrentness !== 'function'
  ) {
    fail(
      'INVALID_INVOCATION_INPUT',
      'effectful invocation input.activator must be the accepted AssemblyExecutionActivator (the T002C/T002D/T005C occurrence-pin gates are consumed, never re-owned)',
    );
  }
  return value as AssemblyExecutionActivator;
}

function requireAdmissionPorts(value: unknown): EffectfulAdmissionPorts {
  const view = requireSafeRecord(value, 'invocation input.admissionPorts', 'INVALID_INVOCATION_INPUT');
  const unexpectedField = Object.keys(view).find(
    (key) => key !== 'governance' && key !== 'baselines' && key !== 'effectJournal',
  );
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_INVOCATION_INPUT',
      `invocation input.admissionPorts must contain exactly {governance, baselines, effectJournal}; unexpected field "${unexpectedField}" (the effect-tools port is not caller-expressible — this module installs the only verified-binding adapter)`,
    );
  }
  const governance = view.governance;
  if (
    typeof governance !== 'object' ||
    governance === null ||
    typeof (governance as { requirePinnedExecution?: unknown }).requirePinnedExecution !== 'function'
  ) {
    fail('INVALID_INVOCATION_INPUT', 'invocation input.admissionPorts.governance must be the GovernanceExecutionCoordinator port');
  }
  const baselines = view.baselines;
  if (
    typeof baselines !== 'object' ||
    baselines === null ||
    typeof (baselines as { getBody?: unknown }).getBody !== 'function'
  ) {
    fail('INVALID_INVOCATION_INPUT', 'invocation input.admissionPorts.baselines must be the GovernanceBaselineStore port');
  }
  const effectJournal = view.effectJournal;
  if (typeof effectJournal !== 'object' || effectJournal === null) {
    fail('INVALID_INVOCATION_INPUT', 'invocation input.admissionPorts.effectJournal must be the existing AdmissionDurableEffectJournal port');
  }
  return {
    governance: governance as GovernanceExecutionCoordinator,
    baselines: baselines as GovernanceBaselineStore,
    effectJournal: effectJournal as AdmissionDurableEffectJournal,
  };
}

// ---------------------------------------------------------------------------
// invokeEffectfulTool — the effectful dispatch boundary (PACK-C T004C)
// ---------------------------------------------------------------------------

/**
 * Route ONE admitted effectful Tool invocation onto an already-authoritative
 * occurrence through the ONE existing Central Admission effect path.
 *
 * Deterministic fail-closed precedence, every gate BEFORE any side effect:
 * input shape + port shapes + request/occurrence-identity snapshots and the
 * dispatch-anchor snapshot (where the directly consumed T002B mint verifier
 * decides the final Assembly's provenance, ASSEMBLY_PROVENANCE_UNVERIFIED) —
 * all synchronous; then the T004A re-admission over the exact current state
 * (typed failures propagate unchanged), the freshly derived effect-class gate
 * (EFFECTLESS_OPERATION_REJECTED), the T003C-owned binding verification whose
 * typed failures propagate unchanged, T004C-owned dispatch consistency over
 * the VERIFIED binding (INVALID_BINDING_EVIDENCE), the occurrence-pin gates on
 * the SAME activator (`requireProductionEffectAuthority` — exact PRODUCTION
 * class only — plus the module-owned occurrence/Assembly match), T005B
 * resource resolution + the T005C occurrence-currentness re-proof, and only
 * then the ONE existing Central Admission effect path with the only
 * verified-binding adapter. The Tool's own thrown failures flow through the
 * existing admission owner semantics — never caught, wrapped or converted
 * into an outcome by this module.
 *
 * Torn-snapshot discipline: every authority-bearing input is descriptor-safe
 * validated and synchronously snapshotted before the first `await`; after any
 * suspension only module-owned snapshot material, the frozen genuine-mint
 * anchor and the fresh frozen T003C-verified material are read — the
 * dispatched handle is the verifier-paired reference, never a re-read of
 * caller-owned state.
 */
export async function invokeEffectfulTool(
  input: InvokeEffectfulToolInput,
): Promise<EffectfulToolInvocationResult> {
  // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
  const view = requireSafeRecord(input, 'effectful invocation input', 'INVALID_INVOCATION_INPUT');
  const unexpectedInputField = Object.keys(view).find((key) => !INPUT_FIELDS.has(key));
  if (unexpectedInputField !== undefined) {
    fail(
      'INVALID_INVOCATION_INPUT',
      `effectful invocation input must contain exactly {request, binding, currentDefinitionGraph, activator, admissionRequest, admissionPorts, effectType, dispatch, resourceProvider?, sha256}; unexpected field "${unexpectedInputField}" (no journal, occurrence-verdict, effect-authority or caller-minted pin material is representable)`,
    );
  }
  for (const required of [
    'request',
    'binding',
    'currentDefinitionGraph',
    'activator',
    'admissionRequest',
    'admissionPorts',
    'effectType',
    'dispatch',
    'sha256',
  ] as const) {
    if (!(required in view) || view[required] === undefined) {
      fail('INVALID_INVOCATION_INPUT', `effectful invocation input.${required} is required`);
    }
  }

  const sha256 = requireSha256Port(view.sha256, 'effectful invocation input.sha256');
  const dispatchPort = requireDispatchPort(view.dispatch);
  const activator = requireActivator(view.activator);
  const ports = requireAdmissionPorts(view.admissionPorts);
  const effectType = requireExactIdentity(
    view.effectType,
    'effectful invocation input.effectType',
    'INVALID_INVOCATION_INPUT',
  );

  const graph = view.currentDefinitionGraph as DefinitionGraphEnvelope;
  const request = snapshotRequest(view.request);
  const identity = snapshotOccurrenceIdentity(view.admissionRequest);
  const anchor = snapshotDispatchAnchor(view.binding, request);

  // ---- PHASE 2 (async): re-admission over the exact current state.
  //
  // The dispatch anchor is the binding's OWN successor Assembly: a request
  // admitted against any other Assembly fails currentness here, before any
  // effect. T004A typed failures propagate unchanged.
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

  // The effect-class gate runs on the FRESHLY DERIVED classification — never
  // on the caller-presented operationEffect. An effect=none operation belongs
  // to the T004B path and can never enter the effectful authority path.
  if (admitted.operationEffect === 'none') {
    fail(
      'EFFECTLESS_OPERATION_REJECTED',
      `operation "${admitted.operationId}" of Tool Component "${admitted.toolComponentId}" is classified "none" and can never use the effectful path; effect=none operations route through the T004B non-effectful path — this module never dispatches them and never records a journal effect for them`,
    );
  }

  // ---- T003C-owned binding verification BEFORE the opaque implementation
  // handle is paired and exposed. The verifier proves module-private mint
  // membership, re-verifies the accepted v1 bindingDigest over the evidence
  // material, and decides exact subject slot/currentness against the SAME
  // final sealed Assembly (the anchor). Its typed failures propagate
  // unchanged — this module never re-derives or re-owns those semantics.
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
      'the verified binding currentness is anchored to a different Definition graph digest than the authoritatively recomputed current digest; a stale binding fails closed before any effect',
    );
  }
  if (verified.currentness.finalAssemblyDigest !== admitted.assemblyDigest) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      'the verified binding currentness is anchored to a different final Assembly digest than the admitted request; a binding verified against another successor Assembly fails closed before any effect',
    );
  }
  if (!evidence.supportedOperations.includes(admitted.operationId)) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      `the verified binding binds only operations (${evidence.supportedOperations.join(', ')}) and does not include the admitted operation "${admitted.operationId}"; the paired handle never dispatches outside the exact bound set`,
    );
  }

  // ---- Occurrence pin gates (T002C/T002D/T005C) on the SAME activator: the
  // durable occurrence must carry an exact PRODUCTION authority class (a
  // SIMULATION, legacy class-less, unknown or malformed authority can never
  // satisfy production durable-effect authority — typed failures propagate
  // unchanged), and the pinned occurrence must be bound to the SAME final
  // sealed Assembly the invocation was re-proven against (bind-once: a
  // replaced Assembly never rides a pin bound to its predecessor).
  const pin = await activator.requireProductionEffectAuthority(identity.workflowInstanceId);
  if (pin.assemblyDigest !== admitted.assemblyDigest) {
    fail(
      'OCCURRENCE_ASSEMBLY_MISMATCH',
      `the occurrence ${identity.workflowInstanceId} is pinned to Assembly ${String(pin.assemblyDigest)} but the admitted invocation was proven against final Assembly ${admitted.assemblyDigest}; a replaced Assembly can never ride a pinned occurrence — re-activation under the exact current Assembly is the only path (no overwrite, no alias)`,
    );
  }

  // ---- Resources: only sealed-Assembly requirements are resolved, through
  // the T005B boundary, before dispatch (typed failures propagate unchanged).
  // The fresh T005C currentness pins are then re-proven against the SAME
  // occurrence pin through the accepted T005C gate — a stale, replaced or
  // missing exact resource revision fails closed BEFORE the effect.
  let resources: ReadonlyMap<string, ResolvedResourceEntry>;
  if (view.resourceProvider !== undefined) {
    const provider = view.resourceProvider;
    if (
      typeof provider !== 'object' ||
      provider === null ||
      typeof (provider as ResourceProvider).resolve !== 'function'
    ) {
      fail(
        'INVALID_INVOCATION_INPUT',
        'effectful invocation input.resourceProvider must be a ResourceProvider ({ resolve(request): Promise<ResourceProviderResponse> })',
      );
    }
    const resolved = await resolveToolResources(
      {
        assembly: anchor.successorAssembly,
        componentId: admitted.toolComponentId,
        operationId: admitted.operationId,
        provider: provider as ResourceProvider,
      },
    );
    resources = resolved.resources;
  } else if (anchor.applicableRequirementCount > 0) {
    fail(
      'MISSING_RESOURCE_PROVIDER',
      `the sealed Assembly carries ${anchor.applicableRequirementCount} applicable resource requirement(s) for operation "${admitted.operationId}" of Tool Component "${admitted.toolComponentId}", but no ResourceProvider was injected; requirements fail closed before the effect — no ambient, default, or fallback resource exists`,
    );
  } else {
    resources = new Map<string, ResolvedResourceEntry>();
  }
  const freshEvidence: ResourceCurrentnessEvidence[] = [];
  for (const entry of resources.values()) {
    if (entry.status === 'resolved' && entry.currentnessPin !== undefined) {
      freshEvidence.push({
        componentId: admitted.toolComponentId,
        providerId: entry.currentnessPin.providerId,
        resourceKey: entry.currentnessPin.resourceKey,
        revisionDigest: entry.currentnessPin.revisionDigest,
      });
    }
  }
  const pinnedEvidence = pin.resourceCurrentness;
  if (freshEvidence.length > 0 || (pinnedEvidence !== undefined && pinnedEvidence.length > 0)) {
    await activator.requireResourceCurrentness(identity.workflowInstanceId, freshEvidence);
  }

  // ---- PHASE 3: the ONE public effect-admission path (existing Central
  // Admission) with the ONLY verified-binding effect adapter. The caller
  // cannot express an effect-tools port, and the adapter performs no
  // independent implementation selection: it resolves ONLY the exact declared
  // effect type with the graph-derived effect semantics, and dispatches ONLY
  // the verified exact T003C handle.
  const operationEffect: ToolOperationEffect = admitted.operationEffect;
  const invocationEffectType = effectType;
  const verifiedHandle = verified.implementationHandle;
  const admittedInput = admitted.input;
  const admittedOperationId = admitted.operationId;
  const snapshottedTarget = identity.target;
  const snapshottedTargetCanonical = canonicalJsonStringify(snapshottedTarget);
  const admittedInputCanonical = canonicalJsonStringify(admittedInput);

  const effectTools: AdmissionEffectToolPort = {
    resolve(candidateEffectType: string): AdmissionEffectToolBinding | undefined {
      if (candidateEffectType !== invocationEffectType) {
        return undefined;
      }
      return { effectType: candidateEffectType, effectSemantics: operationEffect };
    },
    async execute(request: AdmissionEffectToolRequest): Promise<JsonValue> {
      // Intent-closure gate: the executed intent must realize exactly the
      // admitted invocation on the snapshotted occurrence. Any divergence
      // fails closed typed BEFORE the Tool dispatch runs.
      if (request.binding.effectType !== invocationEffectType) {
        fail(
          'EFFECT_INTENT_MISMATCH',
          `the admission effect path executed effect type "${request.binding.effectType}" but this invocation admitted exactly "${invocationEffectType}"; an effect intent can never be silently substituted`,
        );
      }
      if (canonicalJsonStringify(request.target) !== snapshottedTargetCanonical) {
        fail(
          'EFFECT_INTENT_MISMATCH',
          'the admission effect path executed on an occurrence target other than the snapshotted occurrence identity; an effect can never be redirected to a fresh occurrence namespace',
        );
      }
      if (canonicalJsonStringify(request.input) !== admittedInputCanonical) {
        fail(
          'EFFECT_INTENT_MISMATCH',
          `the admitted transition executes effect "${invocationEffectType}" with different input material than the re-admitted invocation request; the journaled durable effect must be exactly the admitted invocation, and a divergent intent fails closed before the Tool dispatch`,
        );
      }
      // Dispatch ONLY the verified exact T003C handle. The Tool's own thrown
      // failures propagate through the existing admission owner semantics.
      return (await dispatchPort.dispatch({
        handle: verifiedHandle,
        operationId: admittedOperationId,
        input: request.input,
        resources,
        effectId: request.effectId,
        durableControlTurnId: request.durableControlTurnId,
        operationOrdinal: request.operationOrdinal,
        effectType: request.binding.effectType,
        ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
        logicalTime: request.logicalTime,
      })) as JsonValue;
    },
  };

  // The admission request is reconstructed over the module-owned occurrence
  // identity snapshot; the remaining turn material is consumed by the
  // existing Central Admission owner under its own accepted posture.
  const admissionRequest: CentralAdmissionRequest = Object.freeze({
    ...(view.admissionRequest as CentralAdmissionRequest),
    target: snapshottedTarget,
    turn: identity.turn,
    workflowInstanceId: identity.workflowInstanceId,
    now: identity.now,
  });
  const outcome = await admitCentralDecision(admissionRequest, {
    governance: ports.governance,
    baselines: ports.baselines,
    sha256,
    effectJournal: ports.effectJournal,
    effectTools,
  });

  return Object.freeze({
    outcome,
    occurrence: Object.freeze({
      workflowTarget: pin.workflowTarget,
      workflowInstanceId: pin.workflowInstanceId,
      // The consumed T002D gate guarantees the exact PRODUCTION class here.
      authorityClass: pin.authorityClass as RuntimeAuthorityClass,
      pinBindingDigest: pin.bindingDigest,
      assemblyDigest: admitted.assemblyDigest,
    }),
    invocation: Object.freeze({
      toolComponentId: admitted.toolComponentId,
      operationId: admitted.operationId,
      effectType: invocationEffectType,
      effectSemantics: operationEffect,
      implementation: evidence.implementation,
      bindingDigest: evidence.bindingDigest,
      definitionGraphDigest: admitted.definitionGraphDigest,
    }),
  });
}
