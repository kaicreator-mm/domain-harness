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
 *  implementation pin: the T003C binding evidence must agree with the
 *  re-admitted request on Tool Component, operation, Definition graph digest
 *  AND Assembly digest, and the admitted operation must be in the evidence's
 *  exact bound operation set. Stale or mismatched bindings fail before call;
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
 * P1-1 BINDING CONSTRAINT — explicit fail-closed provenance seam (T004A Fresh
 * Review issuecomment-5989725847, routed via #632)
 *
 * `AdmittedToolInvocationRequest.assemblyDigest` (and `exposure.assemblyDigest`)
 * are CONTENT-CONSISTENCY proofs only: a self-consistent forged Assembly —
 * never passed through `sealRuntimeAssembly`, digest correctly self-computed —
 * passes every T004A content check (empirically demonstrated in the review).
 * The T002B mint registry (`SEALED_ASSEMBLY_MINTS`) and its
 * `isSealedAssembly` guard are MODULE-PRIVATE to runtime-assembly.ts, and no
 * currently exported T002B seam re-establishes object provenance
 * (`admitComponentWithAssembly` is a Kind-admission operation over one bound
 * component — not a general Assembly-authenticity check — and resealing proves
 * content consistency only, never mint provenance). Option (a) of the P1-1
 * constraint is therefore impossible without a T002B sibling export, which is
 * a SEPARATE bounded concern requiring controller authorization; nothing is
 * exported from runtime-assembly.ts here.
 *
 * This module implements option (b): the missing mint-guard is EXPLICIT. The
 * dispatch boundary requires an injected `SealedAssemblyProvenanceGuard`
 * decision over the exact successor-Assembly object + digests before any Tool
 * call:
 * - a missing/ malformed guard or decision fails closed typed
 *   (INVALID_INVOCATION_INPUT);
 * - a denial, or a guard that throws, fails closed typed
 *   ASSEMBLY_PROVENANCE_UNVERIFIED — the kernel NEVER silently trusts the
 *   digest and never passes content-consistency off as mint proof;
 * - the composition layer (host) MUST wire this port to genuine mint
 *   authority — e.g. a future exported T002B mint-guard or host-held mint
 *   records. Until the T002B sibling export lands, every real dispatch
 *   carries this documented dependency; the boundary test pins that a
 *   content-consistent forgery with a denying guard never dispatches.
 *
 * Related explicit dependency (same shape, bounded here): the T003C sealed
 * binding's handle↔pin PAIRING is consumed as minted by `bindToolImplementation`;
 * the T003C sealing brand is module-private with no exported verifier, so this
 * module re-derives every identity dimension of the binding evidence and
 * trusts only the opaque handle reference itself. Because the effect=none
 * result is observational-only and grants no authority, a hypothetical forged
 * pairing cannot mint transition/effect authority through this path; the
 * exact pin that was dispatched is bound into the result for audit either way.
 *
 * Boundary discipline: validation consumes the shared descriptor-safe record
 * primitive and unified exact-reference authority of `record-safety.ts`
 * (#557 + #578), the T004A request-admission seam (re-admission; its typed
 * failures propagate unchanged), the T005B resource-resolution seam (its
 * typed failures propagate unchanged) and the T003C binding evidence shape
 * (identity re-derived here; the sealed-binding brand stays T003C-owned). No
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
import type { SealedRuntimeAssembly } from './runtime-assembly.js';
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
import type {
  SealedToolImplementationBinding,
  ToolImplementationIdentity,
} from './tool-implementation-binding.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  carriesXRangeVersionSemantics,
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
 * The decision of one sealed-Assembly provenance verification. A denial is an
 * expected outcome (not an exception path) and may carry a human-readable
 * reason that is propagated into the typed failure diagnostic.
 */
export type AssemblyProvenanceDecision =
  | { readonly verified: true }
  | { readonly verified: false; readonly reason?: string };

/**
 * Generic injected HOST_INTEGRATION port — the explicit fail-closed
 * replacement for the not-yet-exported T002B mint guard (see the module
 * docstring, P1-1 section). The kernel supplies the exact successor-Assembly
 * object presented for dispatch plus its exact digests; the trusted host
 * implementation (backed by genuine mint authority — a future T002B
 * mint-guard export or host-held mint records) returns a verified/denied
 * decision. The kernel never inspects the mint itself and never proceeds
 * without an affirmative, well-formed decision.
 */
export interface SealedAssemblyProvenanceGuard {
  verifyProvenance(query: {
    readonly assembly: SealedRuntimeAssembly;
    readonly assemblyDigest: ContentDigest;
    readonly definitionGraphDigest: ContentDigest;
  }): AssemblyProvenanceDecision;
}

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
   *  runtime handle; its successor Assembly is the dispatch anchor. */
  readonly binding: SealedToolImplementationBinding;
  /** The live current Definition graph; currentness is authoritatively
   *  recomputed at re-admission. */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /** Injected sealed-Assembly provenance guard (the P1-1 fail-closed seam). */
  readonly assemblyProvenance: SealedAssemblyProvenanceGuard;
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

/** Rejects floating/range/x-range version forms (`1.x`, `x`, `1.`). */
function requireExactVersion(
  value: string,
  path: string,
  code: NonEffectfulInvocationErrorCode,
): void {
  if (carriesFloatingOrRangeSemantics(value) || carriesXRangeVersionSemantics(value)) {
    fail(
      code,
      `${path} must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Request snapshot (dispatch intent; re-admitted authoritatively later)
// ---------------------------------------------------------------------------

const INPUT_FIELDS = new Set<string>([
  'request',
  'binding',
  'currentDefinitionGraph',
  'assemblyProvenance',
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
// Sealed binding snapshot (identity re-derived; handle captured by reference)
// ---------------------------------------------------------------------------

const BINDING_FIELDS = new Set<string>(['evidence', 'successorAssembly', 'implementationHandle']);

const EVIDENCE_FIELDS = new Set<string>([
  'status',
  'definitionGraphDigest',
  'assemblyDigest',
  'toolComponentId',
  'providesCapability',
  'implementation',
  'supportedOperations',
  'bindingDigest',
]);

interface SnapshotEvidence {
  readonly definitionGraphDigest: ContentDigest;
  readonly assemblyDigest: ContentDigest;
  readonly toolComponentId: ComponentId;
  readonly providesCapability: { readonly capabilityId: string; readonly version: string };
  readonly implementation: ToolImplementationIdentity;
  readonly supportedOperations: readonly string[];
  readonly bindingDigest: ContentDigest;
}

interface SnapshotBinding {
  readonly evidence: SnapshotEvidence;
  /** The exact successor-Assembly object — the dispatch anchor (reference). */
  readonly successorAssembly: SealedRuntimeAssembly;
  /** Phase-1 own-data read of the successor Assembly digest (never re-read). */
  readonly successorAssemblyDigest: ContentDigest;
  /** Phase-1 own-data read of the paired handle (opaque, never re-read). */
  readonly implementationHandle: unknown;
  /** Phase-1 count of Assembly requirements applicable to this operation. */
  readonly applicableRequirementCount: number;
}

/** Snapshot one exact `{capabilityId, version}` reference as a fresh frozen object. */
function snapshotCapabilityRef(
  value: unknown,
  path: string,
): { readonly capabilityId: string; readonly version: string } {
  const candidate = requireSafeRecord(value, path, 'INVALID_BINDING_EVIDENCE');
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || !keys.includes('capabilityId') || !keys.includes('version')) {
    fail('INVALID_BINDING_EVIDENCE', `${path} must contain exactly {capabilityId, version}`);
  }
  const capabilityId = requireExactIdentity(candidate.capabilityId, `${path}.capabilityId`, 'INVALID_BINDING_EVIDENCE');
  const version = requireExactIdentity(candidate.version, `${path}.version`, 'INVALID_BINDING_EVIDENCE');
  requireExactVersion(version, `${path}.version`, 'INVALID_BINDING_EVIDENCE');
  return Object.freeze({ capabilityId, version });
}

/** Snapshot the exact implementation pin as a fresh frozen object. */
function snapshotImplementationPin(value: unknown, path: string): ToolImplementationIdentity {
  const candidate = requireSafeRecord(value, path, 'INVALID_BINDING_EVIDENCE');
  const keys = Object.keys(candidate).sort();
  if (
    keys.length !== 3 ||
    !keys.includes('implementationId') ||
    !keys.includes('implementationVersion') ||
    !keys.includes('implementationDigest')
  ) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      `${path} must contain exactly {implementationId, implementationVersion, implementationDigest}`,
    );
  }
  const implementationId = requireExactIdentity(candidate.implementationId, `${path}.implementationId`, 'INVALID_BINDING_EVIDENCE');
  const implementationVersion = requireExactIdentity(
    candidate.implementationVersion,
    `${path}.implementationVersion`,
    'INVALID_BINDING_EVIDENCE',
  );
  requireExactVersion(implementationVersion, `${path}.implementationVersion`, 'INVALID_BINDING_EVIDENCE');
  if (!isContentDigest(candidate.implementationDigest)) {
    fail('INVALID_BINDING_EVIDENCE', `${path}.implementationDigest must be a non-empty content digest string`);
  }
  return Object.freeze({
    implementationId,
    implementationVersion,
    implementationDigest: candidate.implementationDigest,
  });
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

/**
 * Synchronously validate and snapshot the sealed binding. The T003C sealing
 * brand is module-private and deliberately not re-derived here (see the
 * module docstring, P1-1 section): every identity dimension of the evidence
 * IS re-derived and cross-checked against the re-admitted request before
 * dispatch; only the opaque handle reference and the successor-Assembly
 * object are consumed as presented, both captured once in this synchronous
 * phase and never re-read after any suspension.
 */
function snapshotBinding(value: unknown, request: SnapshotRequest): SnapshotBinding {
  const at = 'invocation input.binding';
  if (typeof value !== 'object' || value === null) {
    fail('INVALID_BINDING_EVIDENCE', `${at} must be the T003C sealed Tool implementation binding`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.getOwnPropertyNames(descriptors)) {
    if (!BINDING_FIELDS.has(key)) {
      fail(
        'INVALID_BINDING_EVIDENCE',
        `${at} must carry exactly {evidence, successorAssembly, implementationHandle} plus its symbol brand; unexpected property "${key}"`,
      );
    }
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable || descriptor.get !== undefined || descriptor.set !== undefined) {
      fail('INVALID_BINDING_EVIDENCE', `${at}.${key} must be an enumerable data property (hidden or accessor-backed properties are not contract input)`);
    }
  }
  for (const required of BINDING_FIELDS) {
    if (!(required in descriptors)) {
      fail('INVALID_BINDING_EVIDENCE', `${at}.${required} is required (a sealed Tool implementation binding carries exactly { evidence, successorAssembly, implementationHandle })`);
    }
  }

  const evidenceView = requireSafeRecord(descriptors.evidence!.value, `${at}.evidence`, 'INVALID_BINDING_EVIDENCE');
  const unexpectedEvidenceField = Object.keys(evidenceView).find((key) => !EVIDENCE_FIELDS.has(key));
  if (unexpectedEvidenceField !== undefined) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      `${at}.evidence must contain exactly the T003C binding evidence fields; unexpected field "${unexpectedEvidenceField}"`,
    );
  }
  if (evidenceView.status !== 'BOUND') {
    fail('INVALID_BINDING_EVIDENCE', `${at}.evidence.status must be exactly "BOUND"`);
  }
  if (!isContentDigest(evidenceView.definitionGraphDigest)) {
    fail('INVALID_BINDING_EVIDENCE', `${at}.evidence.definitionGraphDigest must be a non-empty content digest string`);
  }
  if (!isContentDigest(evidenceView.assemblyDigest)) {
    fail('INVALID_BINDING_EVIDENCE', `${at}.evidence.assemblyDigest must be a non-empty content digest string`);
  }
  const toolComponentId = requireExactIdentity(
    evidenceView.toolComponentId,
    `${at}.evidence.toolComponentId`,
    'INVALID_BINDING_EVIDENCE',
  );
  const providesCapability = snapshotCapabilityRef(evidenceView.providesCapability, `${at}.evidence.providesCapability`);
  const implementation = snapshotImplementationPin(evidenceView.implementation, `${at}.evidence.implementation`);
  const supportedOperations = requireSafeArray(
    evidenceView.supportedOperations,
    `${at}.evidence.supportedOperations`,
    'INVALID_BINDING_EVIDENCE',
  ).map((operation, index) =>
    requireExactIdentity(operation, `${at}.evidence.supportedOperations[${index}]`, 'INVALID_BINDING_EVIDENCE'),
  );
  if (!isContentDigest(evidenceView.bindingDigest)) {
    fail('INVALID_BINDING_EVIDENCE', `${at}.evidence.bindingDigest must be a non-empty content digest string`);
  }

  const successorAssembly: unknown = descriptors.successorAssembly!.value;
  if (typeof successorAssembly !== 'object' || successorAssembly === null) {
    fail('INVALID_BINDING_EVIDENCE', `${at}.successorAssembly must be the sealed successor Runtime Assembly object`);
  }
  const successorAssemblyDigest = readOwnDataProperty(
    successorAssembly,
    'assemblyDigest',
    'INVALID_BINDING_EVIDENCE',
    `${at}.successorAssembly`,
  );
  if (typeof successorAssemblyDigest !== 'string' || !isContentDigest(successorAssemblyDigest)) {
    fail('INVALID_BINDING_EVIDENCE', `${at}.successorAssembly.assemblyDigest must be a non-empty content digest string`);
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

  const evidence: SnapshotEvidence = Object.freeze({
    definitionGraphDigest: evidenceView.definitionGraphDigest,
    assemblyDigest: evidenceView.assemblyDigest,
    toolComponentId,
    providesCapability,
    implementation,
    supportedOperations: Object.freeze([...supportedOperations]),
    bindingDigest: evidenceView.bindingDigest,
  });
  return {
    evidence,
    successorAssembly: successorAssembly as SealedRuntimeAssembly,
    successorAssemblyDigest,
    implementationHandle: descriptors.implementationHandle!.value,
    applicableRequirementCount,
  };
}

// ---------------------------------------------------------------------------
// invokeNonEffectfulTool — the non-effectful dispatch boundary (PACK-C T004B)
// ---------------------------------------------------------------------------

/**
 * Execute ONE admitted Tool invocation request through the `effect=none`
 * path.
 *
 * Deterministic fail-closed precedence: input shape, port shapes, request
 * snapshot, binding snapshot, then — after the single re-admission
 * suspension — the freshly derived effect gate (EFFECTFUL_OPERATION_REJECTED),
 * binding/request consistency (INVALID_BINDING_EVIDENCE), the injected
 * assembly-provenance decision (ASSEMBLY_PROVENANCE_UNVERIFIED), T005B
 * resource resolution (failures propagated unchanged) and finally the
 * dispatch. The Tool's own thrown failures propagate unchanged; only a
 * portable-JSON Tool return is snapshotted into the frozen observational
 * result.
 *
 * Torn-snapshot discipline: every authority-bearing input is descriptor-safe
 * validated and synchronously snapshotted before the first `await` (the T004A
 * re-admission's own synchronous phase runs in the same tick, over the same
 * caller-owned graph object, before its first suspension); after any
 * suspension only module-owned snapshot material is read.
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
      `non-effectful invocation input must contain exactly {request, binding, currentDefinitionGraph, assemblyProvenance, dispatch, resourceProvider?, sha256}; unexpected field "${unexpectedInputField}" (no transition, occurrence or journal material is representable)`,
    );
  }
  for (const required of ['request', 'binding', 'currentDefinitionGraph', 'assemblyProvenance', 'dispatch', 'sha256'] as const) {
    if (!(required in view) || view[required] === undefined) {
      fail('INVALID_INVOCATION_INPUT', `non-effectful invocation input.${required} is required`);
    }
  }

  const sha256 = requireSha256Port(view.sha256, 'non-effectful invocation input.sha256');

  const provenanceGuard = view.assemblyProvenance;
  if (
    typeof provenanceGuard !== 'object' ||
    provenanceGuard === null ||
    typeof (provenanceGuard as SealedAssemblyProvenanceGuard).verifyProvenance !== 'function'
  ) {
    fail(
      'INVALID_INVOCATION_INPUT',
      'non-effectful invocation input.assemblyProvenance must be a SealedAssemblyProvenanceGuard ({ verifyProvenance({ assembly, assemblyDigest, definitionGraphDigest }): { verified: boolean, reason? } }) — the explicit fail-closed seam for the T002B mint guard',
    );
  }

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
  const binding = snapshotBinding(view.binding, request);

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
    { assembly: binding.successorAssembly, currentDefinitionGraph: graph },
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

  // Binding/request consistency: the exact handle pairs only with the exact
  // current pin under the exact current identities.
  const evidence = binding.evidence;
  if (evidence.toolComponentId !== admitted.toolComponentId) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      `the sealed binding evidence binds Tool Component "${evidence.toolComponentId}" but the admitted request targets "${admitted.toolComponentId}"; a binding can never dispatch another target's handle`,
    );
  }
  if (evidence.definitionGraphDigest !== admitted.definitionGraphDigest) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      'the sealed binding evidence is bound to a different Definition graph digest than the authoritatively recomputed current digest; a stale binding fails closed before any Tool call',
    );
  }
  if (evidence.assemblyDigest !== admitted.assemblyDigest) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      'the sealed binding evidence carries an assemblyDigest different from the admitted request; a binding minted into another successor Assembly fails closed before any Tool call',
    );
  }
  if (evidence.assemblyDigest !== binding.successorAssemblyDigest) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      'the sealed binding evidence is not minted into its own successor Assembly; inconsistent binding evidence fails closed before any Tool call',
    );
  }
  if (!evidence.supportedOperations.includes(admitted.operationId)) {
    fail(
      'INVALID_BINDING_EVIDENCE',
      `the sealed binding evidence binds only operations (${evidence.supportedOperations.join(', ')}) and does not include the admitted operation "${admitted.operationId}"; the paired handle never dispatches outside the exact bound set`,
    );
  }

  // P1-1 explicit fail-closed provenance seam (see module docstring): an
  // affirmative, well-formed host decision over the exact assembly object is
  // required before any Tool call. The kernel never silently trusts the
  // digest.
  const provenanceQuery = Object.freeze({
    assembly: binding.successorAssembly,
    assemblyDigest: admitted.assemblyDigest,
    definitionGraphDigest: admitted.definitionGraphDigest,
  });
  let provenanceDecision: unknown;
  try {
    provenanceDecision = (provenanceGuard as SealedAssemblyProvenanceGuard).verifyProvenance(provenanceQuery);
  } catch {
    fail(
      'ASSEMBLY_PROVENANCE_UNVERIFIED',
      'the sealed-Assembly provenance guard threw; assembly provenance is unverifiable and the dispatch boundary fails closed (the T002B mint-guard export remains a separate bounded dependency)',
    );
  }
  if (
    typeof provenanceDecision !== 'object' ||
    provenanceDecision === null ||
    typeof (provenanceDecision as AssemblyProvenanceDecision).verified !== 'boolean'
  ) {
    fail(
      'INVALID_INVOCATION_INPUT',
      'assemblyProvenance.verifyProvenance must return { verified: boolean, reason?: string }',
    );
  }
  if (!(provenanceDecision as AssemblyProvenanceDecision).verified) {
    const reason = (provenanceDecision as { reason?: unknown }).reason;
    fail(
      'ASSEMBLY_PROVENANCE_UNVERIFIED',
      `the sealed-Assembly provenance guard did not verify the assembly presented for dispatch${typeof reason === 'string' && reason.length > 0 ? `: ${reason}` : ''}; a content-consistent assemblyDigest is never silently trusted as T002B mint proof (P1-1 boundary)`,
    );
  }

  // Resources: only sealed-Assembly requirements are resolved, through the
  // T005B boundary, before dispatch. T005B typed failures propagate unchanged.
  let resources: ReadonlyMap<string, ResolvedResourceEntry>;
  if (resourceProvider !== undefined) {
    const resolved = await resolveToolResources(
      {
        assembly: binding.successorAssembly,
        componentId: admitted.toolComponentId,
        operationId: admitted.operationId,
        provider: resourceProvider,
      },
    );
    resources = resolved.resources;
  } else if (binding.applicableRequirementCount > 0) {
    fail(
      'MISSING_RESOURCE_PROVIDER',
      `the sealed Assembly carries ${binding.applicableRequirementCount} applicable resource requirement(s) for operation "${admitted.operationId}" of Tool Component "${admitted.toolComponentId}", but no ResourceProvider was injected; requirements fail closed before dispatch — no ambient, default, or fallback resource exists`,
    );
  } else {
    resources = new Map<string, ResolvedResourceEntry>();
  }

  // ---- Dispatch: the paired handle, the frozen input snapshot, the resolved
  // resources. Tool thrown failures propagate unchanged — never caught,
  // wrapped or converted into an outcome.
  const dispatchQuery: NonEffectfulToolDispatchQuery = Object.freeze({
    handle: binding.implementationHandle,
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
