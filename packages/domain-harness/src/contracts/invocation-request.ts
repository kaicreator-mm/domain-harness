/**
 * v0.7 caller-neutral Tool invocation request + caller exposure contract
 * (issue #609, fine-grained DAG #534 T004A; authority #589 PACK-A T004A
 * section).
 *
 * This module is the Microkernel seam between the sealed Runtime Assembly
 * (T002B), the Tool Component operation contract (T003A) and the successor
 * invocation paths (T004B non-effectful execution, T004C effectful Central
 * Admission). It owns exactly the concerns PACK-A assigns to T004A:
 *
 * - ONE generic caller-neutral request shape: exact Tool Component id +
 *   operationId + portable JSON input + caller context + claimed exact
 *   Definition/Assembly currentness + admitted exposure evidence. Workflow /
 *   Agent / UX / internal callers and every future caller plane share this
 *   single model — caller context is provenance material only and the kernel
 *   never branches on it (adapters live outside the kernel).
 * - `admitToolExposure`: the exposure-authority boundary. Given the exact
 *   current Definition graph, a sealed Runtime Assembly, one bound Tool
 *   Component + operation and one generic injected `ToolExposureAdmissionPolicy`
 *   port, it authoritatively recomputes Definition currentness, lets the
 *   trusted policy decide over descriptor-safe operation/caller snapshots,
 *   and mints frozen, non-aliasing `AdmittedToolExposure` evidence carrying
 *   the exact graph/assembly digests and an exposure digest binding the
 *   declared exposure material + caller snapshot.
 * - `admitToolInvocationRequest`: the request-admission boundary. It
 *   re-verifies the sealed Assembly's content digest, recomputes Definition
 *   currentness, validates the exposure evidence's minting authority, binding
 *   consistency and caller equality, resolves the operation's frozen L2
 *   effect classification from the current graph binding, and mints a frozen
 *   `AdmittedToolInvocationRequest` — request-admission evidence only.
 *
 * Authority rules enforced here without exception (PACK-A):
 * - the caller is provenance/context, NEVER execution authority; a caller
 *   cannot mint exposure evidence (module-private WeakSet mint registry +
 *   own-property brand, the #601 repair applied from the start) and cannot
 *   ride on evidence minted for a different caller (full caller-context
 *   equality, not just the caller id);
 * - the Tool's declarative `declaredExposure` material is NOT runtime
 *   authorization: admission is always a policy decision over the exact
 *   current state, and an operation with no declared exposure at all remains
 *   admissible;
 * - stale Definition / stale Assembly / stale exposure fail closed BEFORE
 *   any dispatch: currentness is authoritatively recomputed at every
 *   admission, never claimed-and-trusted;
 * - request/evidence are immutable and non-aliasing: every authority-bearing
 *   input is descriptor-safe validated and synchronously snapshotted before
 *   the first `await` (torn-snapshot discipline, #587 §E same posture); after
 *   any suspension only module-owned snapshot material and the trusted #555
 *   digest seam (which snapshot the graph synchronously) are read;
 * - no Agent/UX branches exist in the Microkernel; no dispatch, execution,
 *   occurrence anchoring or effect authority is implemented — T004A mints
 *   request-admission evidence only (T004B owns `effect=none` execution,
 *   T004C owns effectful Central Admission anchoring).
 *
 * Boundary discipline: validation consumes the shared descriptor-safe record
 * primitive and unified exact-reference authority of `record-safety.ts`
 * (#557 + #578), the T003A Tool declaration validator (imported, failures
 * propagated unchanged), the #555 Definition graph validation/digest seam
 * (graph failures propagated unchanged) and the T002B sealed Assembly shape
 * (only its serializable record identity is consumed — Assembly authenticity
 * for validator-handle provenance remains T002B-owned, #601). No Workflow/
 * XState/ToolRegistry/Agent/UX/AI/HTTP/Search/Storage/node import is
 * permitted in this file, and no public barrel exposes it.
 */
import type { ComponentEnvelope, ComponentId } from './component.js';
import {
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
} from './definition-graph.js';
import {
  canonicalJsonStringify,
  computeCanonicalJsonDigest,
  isContentDigest,
  type ContentDigest,
  type Sha256Port,
} from './identity.js';
import type { JsonValue } from './json.js';
import {
  RUNTIME_ASSEMBLY_DIGEST_DOMAIN,
  type SealedRuntimeAssembly,
} from './runtime-assembly.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeRecordSnapshot,
} from './record-safety.js';
import {
  validateToolComponent,
  type ToolOperationContract,
  type ToolOperationEffect,
} from './tool-component.js';

/**
 * Versioned Tool exposure digest domain tag, owned exclusively by this file.
 * Any future change to the admitted-exposure material shape is a NEW domain
 * tag; historical exposure evidence identities never change retroactively.
 */
export const TOOL_EXPOSURE_DIGEST_DOMAIN = 'kaicreator.tool-exposure.digest.v1';

/**
 * Fail-closed invocation request/exposure failure taxonomy (T004A). Every
 * failure is typed and terminal — none carries or suggests a substitute/
 * default/latest resolution, and no diagnostic ever serializes policy
 * internals, secret values or live handles (only exact identity strings
 * participate).
 */
export type InvocationRequestErrorCode =
  | 'INVALID_INVOCATION_INPUT'
  | 'INVALID_INVOCATION_CALLER'
  | 'INVALID_INVOCATION_REQUEST'
  | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'
  | 'INVALID_EXPOSURE_POLICY'
  | 'INVALID_ASSEMBLY_EVIDENCE'
  | 'ASSEMBLY_DIGEST_MISMATCH'
  | 'DEFINITION_CURRENTNESS_MISMATCH'
  | 'ASSEMBLY_CURRENTNESS_MISMATCH'
  | 'EXPOSURE_CURRENTNESS_MISMATCH'
  | 'FORGED_EXPOSURE_EVIDENCE'
  | 'INVOCATION_BINDING_MISMATCH'
  | 'INVOCATION_CALLER_MISMATCH'
  | 'TOOL_COMPONENT_NOT_BOUND'
  | 'INVALID_TOOL_INVOCATION_TARGET'
  | 'EXPOSURE_NOT_ADMITTED';

export class InvocationRequestError extends Error {
  readonly code: InvocationRequestErrorCode;

  constructor(code: InvocationRequestErrorCode, message: string) {
    super(message);
    this.name = 'InvocationRequestError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Generic caller-neutral context and exposure policy port
// ---------------------------------------------------------------------------

/**
 * ONE generic caller context shared by every caller plane. `callerId` is a
 * required exact identity; `callerKind` is an OPEN provenance string (never
 * a closed union — no adapter plane can require a kernel branch) and
 * `attributes` is optional portable JSON provenance. None of these fields
 * carries, implies or mints authority of any kind.
 */
export interface InvocationCallerContext {
  /** Required exact caller identity — provenance only, never authority. */
  readonly callerId: string;
  /** Optional open caller-plane provenance string; never a closed union. */
  readonly callerKind?: string;
  /** Optional portable JSON provenance material; no authority content. */
  readonly attributes?: JsonValue;
}

/**
 * The decision of one exposure-admission policy evaluation. Denial is an
 * expected outcome (not an exception path) and may carry a human-readable
 * reason that is propagated into the typed failure diagnostic.
 */
export type ToolExposureAdmissionDecision =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly reason?: string };

/**
 * Generic injected exposure-admission policy port, one interface for all
 * caller planes. The kernel supplies descriptor-safe snapshots of the exact
 * current operation contract and the caller context; the trusted policy
 * implementation (an adapter/host concern) returns an admit/deny decision.
 * The declarative `declaredExposure` material on the operation is input to
 * this decision, never a substitute for it.
 */
export interface ToolExposureAdmissionPolicy {
  decideAdmission(query: {
    readonly operation: ToolOperationContract;
    readonly caller: InvocationCallerContext;
  }): ToolExposureAdmissionDecision;
}

// ---------------------------------------------------------------------------
// Exposure admission input and evidence
// ---------------------------------------------------------------------------

/** Complete exposure-admission input; all authority-bearing material is
 * synchronously snapshotted before the first `await`. */
export interface AdmitToolExposureInput {
  /** Exact Tool Component id bound in the current Definition graph. */
  readonly toolComponentId: ComponentId;
  /** Exact operation identity declared by that Tool Component. */
  readonly operationId: string;
  /** Generic caller-neutral context; provenance only. */
  readonly caller: InvocationCallerContext;
  /** Sealed Runtime Assembly the exact current graph digest is bound to. */
  readonly assembly: SealedRuntimeAssembly;
  /** The live current Definition graph; currentness is authoritatively proven. */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /** Trusted generic exposure-admission policy port. */
  readonly policy: ToolExposureAdmissionPolicy;
}

/**
 * Authoritative admitted-exposure evidence, minted only by
 * `admitToolExposure`. Binds the exact Tool Component + operation, the full
 * frozen caller snapshot, the exact Definition/Assembly digests current at
 * mint time, and an exposure digest over the declared exposure material +
 * caller snapshot. The caller can never mint or mutate it: the module-private
 * WeakSet mint registry is the authoritative anti-forgery test and the
 * unique-symbol brand is retained as own-property defense in depth (#601
 * lesson applied from the start — neither prototype-chain inheritance nor
 * symbol theft can satisfy the registry).
 */
export interface AdmittedToolExposure {
  readonly status: 'ADMITTED';
  readonly toolComponentId: ComponentId;
  readonly operationId: string;
  readonly caller: InvocationCallerContext;
  readonly definitionGraphDigest: ContentDigest;
  readonly assemblyDigest: ContentDigest;
  readonly exposureDigest: ContentDigest;
  readonly [ADMITTED_EXPOSURE_BRAND]: true;
}

/**
 * Private anti-forgery brand + module-private minting registry (authoritative
 * test). The brand property alone is bypassable (prototype-chain inheritance,
 * reflective symbol theft — see #601), so registry membership decided here is
 * what actually authorizes evidence.
 */
const ADMITTED_EXPOSURE_BRAND: unique symbol = Symbol('kaicreator.invocation.exposure.admitted');
const ADMITTED_EXPOSURE_MINTS = new WeakSet<object>();

// ---------------------------------------------------------------------------
// Invocation request and admitted request evidence
// ---------------------------------------------------------------------------

/**
 * ONE generic caller-neutral invocation request shape (PACK-A). Binds the
 * exact Tool Component id, the exact operationId, portable JSON input, the
 * generic caller context, the claimed exact Definition/Assembly currentness
 * and the admitted exposure evidence. Every field is verified against exact
 * current state at admission — nothing is claimed-and-trusted.
 */
export interface ToolInvocationRequest {
  /** Exact Tool Component id; must be bound in the current graph. */
  readonly toolComponentId: ComponentId;
  /** Exact operation identity declared by that Tool Component. */
  readonly operationId: string;
  /** Portable JSON input material. */
  readonly input: JsonValue;
  /** Generic caller-neutral context; provenance only, never authority. */
  readonly caller: InvocationCallerContext;
  /** Claimed exact Definition graph digest — verified by recomputation. */
  readonly definitionGraphDigest: ContentDigest;
  /** Claimed exact Assembly digest — verified by recomputation. */
  readonly assemblyDigest: ContentDigest;
  /** Admitted exposure evidence minted by `admitToolExposure`. */
  readonly exposure: AdmittedToolExposure;
}

/** Admission options: the sealed Assembly and the current Definition graph. */
export interface AdmitToolInvocationRequestOptions {
  /** The sealed Runtime Assembly the request is admitted against. */
  readonly assembly: SealedRuntimeAssembly;
  /**
   * The current Definition graph. Its digest is authoritatively recomputed
   * and must equal the Assembly-bound digest, the request claim and the
   * exposure-bound digest; any stale or mismatching state fails closed.
   */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
}

/**
 * Authoritative admitted-invocation-request evidence, minted only by
 * `admitToolInvocationRequest`. REQUEST_ADMITTED=YES, DISPATCH_AUTHORITY=NO,
 * EFFECT_AUTHORITY=NO: this object binds identity, currentness, the frozen
 * caller provenance snapshot and the operation's frozen L2 effect
 * CLASSIFICATION (carried forward for T004B/T004C gating) — it never grants
 * execution, occurrence anchoring or durable-effect authority, and the
 * module exports no dispatch/execute entry point at all.
 */
export interface AdmittedToolInvocationRequest {
  readonly status: 'ADMITTED';
  readonly toolComponentId: ComponentId;
  readonly operationId: string;
  readonly input: JsonValue;
  readonly caller: InvocationCallerContext;
  readonly operationEffect: ToolOperationEffect;
  readonly definitionGraphDigest: ContentDigest;
  readonly assemblyDigest: ContentDigest;
  readonly exposure: AdmittedToolExposure;
}

// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------

function fail(code: InvocationRequestErrorCode, message: string): never {
  throw new InvocationRequestError(code, message);
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

/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(
  value: unknown,
  description: string,
  code: InvocationRequestErrorCode,
): Record<string, unknown> {
  const result = safeRecordSnapshot(value, description);
  if (!result.ok) {
    fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

/**
 * Exact identity string: non-empty and free of floating tokens, range
 * operators and embedded `id@selector` forms — never normalized. Identity and
 * embedded-selector violations are one authority class here: both mean the
 * value is not an exact identity.
 */
function requireExactIdentity(value: unknown, path: string, code: InvocationRequestErrorCode): string {
  if (typeof value !== 'string') {
    fail(code, `${path} must be a string`);
  }
  if (!isNonEmptyIdentityString(value)) {
    fail(code, `${path} must be a non-empty exact identity`);
  }
  if (carriesEmbeddedSelector(value) || carriesFloatingOrRangeSemantics(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      `${path} must be an exact identity, not a floating/range selector or embedded \`id@version\` form (latest/current/active/default/*/x/range)`,
    );
  }
  return value;
}

/**
 * Validate one portable-JSON material field, returning a plain-object deep
 * copy in canonical form (null-prototype canonical intermediates are
 * reified, so stored snapshots deep-compare and serialize like ordinary
 * JSON values).
 */
function requireJsonMaterial(
  value: unknown,
  path: string,
  code: InvocationRequestErrorCode,
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

const CALLER_FIELDS = new Set<string>(['callerId', 'callerKind', 'attributes']);

interface SnapshotCaller {
  readonly caller: InvocationCallerContext;
  /** Canonical JSON text of the caller snapshot — the equality authority. */
  readonly canonical: string;
}

/**
 * Synchronously validate and snapshot one caller context into fresh frozen
 * module-owned value objects with canonicalized attributes. The canonical
 * text is the caller-equality authority used to prove a request caller is
 * exactly the caller the exposure evidence was minted for.
 */
function snapshotCaller(
  value: unknown,
  path: string,
  code: InvocationRequestErrorCode,
): SnapshotCaller {
  const view = requireSafeRecord(value, path, code);
  const unexpectedField = Object.keys(view).find((key) => !CALLER_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      code,
      `${path} must contain exactly {callerId, callerKind?, attributes?}; unexpected field "${unexpectedField}" (caller context is provenance only — no authority material is representable)`,
    );
  }
  if (!('callerId' in view)) {
    fail(code, `${path}.callerId is required`);
  }
  const callerId = requireExactIdentity(view.callerId, `${path}.callerId`, code);

  const snapshot: Record<string, unknown> = { callerId };
  if ('callerKind' in view && view.callerKind !== undefined) {
    snapshot.callerKind = requireExactIdentity(view.callerKind, `${path}.callerKind`, code);
  }
  if ('attributes' in view && view.attributes !== undefined) {
    snapshot.attributes = deepFreezeValue(requireJsonMaterial(view.attributes, `${path}.attributes`, code));
  }

  const canonical = canonicalJsonStringify(snapshot);
  deepFreezeValue(snapshot);
  return { caller: snapshot as unknown as InvocationCallerContext, canonical };
}

/** Trusted-policy shape check (the DECISION runs later, over snapshots). */
function requirePolicy(value: unknown): ToolExposureAdmissionPolicy {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as ToolExposureAdmissionPolicy).decideAdmission !== 'function'
  ) {
    fail(
      'INVALID_EXPOSURE_POLICY',
      'policy must be a ToolExposureAdmissionPolicy ({ decideAdmission({ operation, caller }): { admitted: boolean, reason? } })',
    );
  }
  return value as ToolExposureAdmissionPolicy;
}

// ---------------------------------------------------------------------------
// Sealed Assembly serializable-identity consumption (T002B-owned mint stays
// the sole authority over validator-handle provenance; here only the public
// record identity is consumed and authoritatively re-derived)
// ---------------------------------------------------------------------------

const ASSEMBLY_RECORD_FIELDS = new Set<string>([
  'digestDomain',
  'definitionGraphDigest',
  'kindImplementations',
  'resourceRequirements',
  'implementationBindingEvidence',
]);

interface AssemblyIdentityView {
  readonly record: SealedRuntimeAssembly['record'];
  readonly definitionGraphDigest: ContentDigest;
  readonly assemblyDigest: ContentDigest;
}

/**
 * Synchronously validate the serializable identity shape of a sealed-Assembly-
 * like value. The sealed Assembly is a BRANDED object (its anti-forgery brand
 * is symbol-keyed by design, #601), so the closed-world record snapshot cannot
 * be applied to the object itself: own string-keyed properties are inspected
 * through property descriptors only (never executing accessors), symbol-keyed
 * material is ignored by design, and the nested serializable record is then
 * snapshot through the descriptor-safe primitive. Authenticity of the sealed
 * Assembly object itself (and of any validator handles on its bindings)
 * remains T002B's mint-registry authority — this module never invokes
 * validators; it consumes only public record identity, which it re-derives
 * authoritatively through the digest port.
 */
function requireAssemblyIdentity(value: unknown, path: string): AssemblyIdentityView {
  if (typeof value !== 'object' || value === null) {
    fail('INVALID_ASSEMBLY_EVIDENCE', `${path} must be a sealed Runtime Assembly object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowedStringKeys = new Set(['record', 'assemblyDigest', 'bindings']);
  for (const key of Object.getOwnPropertyNames(descriptors)) {
    if (!allowedStringKeys.has(key)) {
      fail(
        'INVALID_ASSEMBLY_EVIDENCE',
        `${path} must not carry unexpected property "${key}" (a sealed Runtime Assembly carries exactly {record, assemblyDigest, bindings} plus its symbol brand)`,
      );
    }
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable) {
      fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.${key} must be an enumerable data property (hidden properties are not contract input)`);
    }
    if (typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
      fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.${key} must be a data property, not an accessor`);
    }
  }
  if (!('record' in descriptors)) {
    fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.record is required (a sealed Runtime Assembly carries its serializable record)`);
  }
  if (!('assemblyDigest' in descriptors)) {
    fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.assemblyDigest is required`);
  }
  if (!isContentDigest(descriptors.assemblyDigest.value)) {
    fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.assemblyDigest must be a non-empty content digest string`);
  }

  const record = requireSafeRecord(descriptors.record.value, `${path}.record`, 'INVALID_ASSEMBLY_EVIDENCE');
  const unexpectedField = Object.keys(record).find((key) => !ASSEMBLY_RECORD_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_ASSEMBLY_EVIDENCE',
      `${path}.record must contain exactly the T002B record fields; unexpected field "${unexpectedField}"`,
    );
  }
  if (record.digestDomain !== RUNTIME_ASSEMBLY_DIGEST_DOMAIN) {
    fail(
      'INVALID_ASSEMBLY_EVIDENCE',
      `${path}.record.digestDomain must be exactly "${RUNTIME_ASSEMBLY_DIGEST_DOMAIN}"`,
    );
  }
  if (!isContentDigest(record.definitionGraphDigest)) {
    fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.record.definitionGraphDigest must be a non-empty content digest string`);
  }
  for (const arrayField of ['kindImplementations', 'resourceRequirements', 'implementationBindingEvidence'] as const) {
    if (!Array.isArray(record[arrayField])) {
      fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.record.${arrayField} must be an array`);
    }
  }
  return {
    record: descriptors.record.value as SealedRuntimeAssembly['record'],
    definitionGraphDigest: record.definitionGraphDigest,
    assemblyDigest: descriptors.assemblyDigest.value,
  };
}

/** Authoritative admitted-exposure guard: mint registry + own-property brand. */
function isAdmittedExposure(value: unknown): value is AdmittedToolExposure {
  return (
    typeof value === 'object' &&
    value !== null &&
    ADMITTED_EXPOSURE_MINTS.has(value) &&
    Object.hasOwn(value, ADMITTED_EXPOSURE_BRAND) &&
    (value as Record<typeof ADMITTED_EXPOSURE_BRAND, unknown>)[ADMITTED_EXPOSURE_BRAND] === true
  );
}

/** Resolve one exact Tool Component binding from an already-validated graph. */
function requireToolComponentBinding(
  graph: DefinitionGraphEnvelope,
  toolComponentId: string,
): ComponentEnvelope {
  const bound = graph.components.find((component) => component.componentId === toolComponentId);
  if (bound === undefined) {
    fail(
      'TOOL_COMPONENT_NOT_BOUND',
      `Tool Component "${toolComponentId}" is not bound in the current Definition graph; unbound invocation targets fail closed (no ambient/default Tool exists)`,
    );
  }
  return bound;
}

/**
 * Synchronously snapshot the declared operation contract for one operationId
 * from an already Tool-validated component binding. Runs in the same
 * synchronous phase as `validateToolComponent`, so the snapshot can never
 * observe post-validation caller mutation.
 */
function snapshotOperation(
  bound: ComponentEnvelope,
  toolComponentId: string,
  operationId: string,
): ToolOperationContract {
  const body = requireSafeRecord(
    bound.semanticBody,
    `Tool Component "${toolComponentId}" semanticBody`,
    'INVALID_TOOL_INVOCATION_TARGET',
  );
  if (!Array.isArray(body.operations)) {
    fail(
      'INVALID_TOOL_INVOCATION_TARGET',
      `Tool Component "${toolComponentId}" does not carry a valid operations declaration`,
    );
  }
  for (const candidate of body.operations) {
    const operation = requireSafeRecord(
      candidate,
      `Tool Component "${toolComponentId}" operation`,
      'INVALID_TOOL_INVOCATION_TARGET',
    );
    if (operation.operationId !== operationId) {
      continue;
    }
    const snapshot: Record<string, unknown> = {
      operationId: operation.operationId,
      inputSchema: requireJsonMaterial(operation.inputSchema, 'operation.inputSchema', 'INVALID_TOOL_INVOCATION_TARGET'),
      outputSchema: requireJsonMaterial(operation.outputSchema, 'operation.outputSchema', 'INVALID_TOOL_INVOCATION_TARGET'),
      effect: operation.effect,
    };
    if ('declaredFailures' in operation && operation.declaredFailures !== undefined) {
      snapshot.declaredFailures = requireJsonMaterial(operation.declaredFailures, 'operation.declaredFailures', 'INVALID_TOOL_INVOCATION_TARGET');
    }
    if ('declaredExposure' in operation && operation.declaredExposure !== undefined) {
      snapshot.declaredExposure = requireJsonMaterial(operation.declaredExposure, 'operation.declaredExposure', 'INVALID_TOOL_INVOCATION_TARGET');
    }
    return deepFreezeValue(snapshot) as unknown as ToolOperationContract;
  }
  fail(
    'INVALID_TOOL_INVOCATION_TARGET',
    `operation "${operationId}" is not declared by Tool Component "${toolComponentId}"; unknown operations fail closed (never first/default)`,
  );
}

const ADMIT_EXPOSURE_INPUT_FIELDS = new Set<string>([
  'toolComponentId',
  'operationId',
  'caller',
  'assembly',
  'currentDefinitionGraph',
  'policy',
]);

const REQUEST_FIELDS = new Set<string>([
  'toolComponentId',
  'operationId',
  'input',
  'caller',
  'definitionGraphDigest',
  'assemblyDigest',
  'exposure',
]);

// ---------------------------------------------------------------------------
// admitToolExposure — the exposure-authority boundary (PACK-A)
// ---------------------------------------------------------------------------

/**
 * Admit one caller exposure against the exact current state.
 *
 * Deterministic fail-closed precedence: input shape, exact identities, caller
 * contract, policy shape, Assembly identity shape, graph validation
 * (propagated unchanged), Tool binding resolution, Tool declaration
 * validation (propagated unchanged), operation existence, then async
 * currentness recomputation, exposure digest, policy decision and mint.
 *
 * Torn-snapshot discipline: every authority-bearing input is descriptor-safe
 * validated and snapshotted synchronously before the first `await`; the
 * policy decision consumes only module-owned snapshots; minted evidence is
 * deeply frozen and never aliases caller-owned state.
 */
export async function admitToolExposure(
  input: AdmitToolExposureInput,
  sha256: Sha256Port,
): Promise<AdmittedToolExposure> {
  const port = requireSha256Port(sha256, 'sha256');

  // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
  const view = requireSafeRecord(input, 'tool exposure admission input', 'INVALID_INVOCATION_INPUT');
  const unexpectedInputField = Object.keys(view).find((key) => !ADMIT_EXPOSURE_INPUT_FIELDS.has(key));
  if (unexpectedInputField !== undefined) {
    fail(
      'INVALID_INVOCATION_INPUT',
      `tool exposure admission input must contain exactly {toolComponentId, operationId, caller, assembly, currentDefinitionGraph, policy}; unexpected field "${unexpectedInputField}"`,
    );
  }
  for (const required of ['toolComponentId', 'operationId', 'caller', 'assembly', 'currentDefinitionGraph', 'policy'] as const) {
    if (!(required in view)) {
      fail('INVALID_INVOCATION_INPUT', `tool exposure admission input.${required} is required`);
    }
  }

  const toolComponentId = requireExactIdentity(view.toolComponentId, 'tool exposure admission input.toolComponentId', 'INVALID_INVOCATION_INPUT');
  const operationId = requireExactIdentity(view.operationId, 'tool exposure admission input.operationId', 'INVALID_INVOCATION_INPUT');
  const { caller } = snapshotCaller(
    view.caller,
    'tool exposure admission input.caller',
    'INVALID_INVOCATION_CALLER',
  );
  const policy = requirePolicy(view.policy);
  const assembly = requireAssemblyIdentity(view.assembly, 'tool exposure admission input.assembly');

  const graph = view.currentDefinitionGraph as DefinitionGraphEnvelope;
  // Graph envelope failures propagate the original DefinitionGraphContractError.
  validateDefinitionGraphEnvelope(graph);

  // The graph binding is the authoritative target: the component must be a
  // structurally valid Tool and must declare the exact operation.
  const bound = requireToolComponentBinding(graph, toolComponentId);
  if (bound.family !== 'tool') {
    fail(
      'INVALID_TOOL_INVOCATION_TARGET',
      `Component "${toolComponentId}" is family "${bound.family}" and can never be a Tool invocation target`,
    );
  }
  // Tool declaration failures propagate the original ToolComponentContractError.
  validateToolComponent(bound);
  const operation = snapshotOperation(bound, toolComponentId, operationId);

  // ---- PHASE 2 (async): authoritative digest work only.
  const currentGraphDigest = await computeDefinitionGraphDigest(graph, port);
  if (currentGraphDigest !== assembly.definitionGraphDigest) {
    fail(
      'DEFINITION_CURRENTNESS_MISMATCH',
      'the current Definition graph digest does not match the exact digest bound in the sealed Assembly; stale graphs fail closed before any exposure evidence is minted',
    );
  }
  const exposureDigest = await computeCanonicalJsonDigest(
    {
      digestDomain: TOOL_EXPOSURE_DIGEST_DOMAIN,
      toolComponentId,
      operationId,
      declaredExposure: 'declaredExposure' in operation ? operation.declaredExposure : null,
      caller,
    },
    port,
  );

  // ---- PHASE 3: trusted policy decision over module-owned snapshots, then mint.
  const decision = policy.decideAdmission({ operation, caller });
  if (
    typeof decision !== 'object' ||
    decision === null ||
    typeof (decision as { admitted: unknown }).admitted !== 'boolean'
  ) {
    fail('INVALID_EXPOSURE_POLICY', 'policy.decideAdmission must return { admitted: boolean, reason?: string }');
  }
  if (!(decision as { admitted: boolean }).admitted) {
    const reason = (decision as { reason?: unknown }).reason;
    fail(
      'EXPOSURE_NOT_ADMITTED',
      `exposure admission was denied by the policy${typeof reason === 'string' && reason.length > 0 ? `: ${reason}` : ''}`,
    );
  }

  const evidence: AdmittedToolExposure = Object.freeze({
    status: 'ADMITTED' as const,
    toolComponentId,
    operationId,
    caller,
    definitionGraphDigest: currentGraphDigest,
    assemblyDigest: assembly.assemblyDigest,
    exposureDigest,
    [ADMITTED_EXPOSURE_BRAND]: true as const,
  });
  ADMITTED_EXPOSURE_MINTS.add(evidence);
  return evidence;
}

// ---------------------------------------------------------------------------
// admitToolInvocationRequest — the request-admission boundary (PACK-A)
// ---------------------------------------------------------------------------

/**
 * Admit one generic caller-neutral invocation request against the exact
 * current state.
 *
 * Deterministic fail-closed precedence: options/input shape, exact
 * identities, portable JSON input, caller contract, digest formats, Assembly
 * identity shape, exposure minting authority, exposure/request binding and
 * caller consistency, graph validation (propagated unchanged), Tool binding
 * resolution and declaration validation (propagated unchanged), operation
 * existence, then async digest recomputation, then currentness failures —
 * tampered Assembly identity, stale Definition, stale Assembly claim, stale
 * exposure — and finally the mint.
 *
 * Torn-snapshot discipline: the request material is descriptor-safe validated
 * and snapshotted synchronously before the first `await`; only module-owned
 * snapshots and the trusted #555 digest seam are read after any suspension.
 * The minted admitted request is deeply frozen and never aliases caller-owned
 * state. REQUEST_ADMITTED=YES, DISPATCH_AUTHORITY=NO, EFFECT_AUTHORITY=NO.
 */
export async function admitToolInvocationRequest(
  request: ToolInvocationRequest,
  options: AdmitToolInvocationRequestOptions,
  sha256: Sha256Port,
): Promise<AdmittedToolInvocationRequest> {
  const port = requireSha256Port(sha256, 'sha256');

  // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
  const optionsView = requireSafeRecord(options, 'invocation admission options', 'INVALID_INVOCATION_INPUT');
  const unexpectedOptionField = Object.keys(optionsView).find(
    (key) => key !== 'assembly' && key !== 'currentDefinitionGraph',
  );
  if (unexpectedOptionField !== undefined) {
    fail(
      'INVALID_INVOCATION_INPUT',
      `invocation admission options must contain exactly {assembly, currentDefinitionGraph}; unexpected field "${unexpectedOptionField}"`,
    );
  }
  if (!('assembly' in optionsView) || optionsView.assembly === undefined) {
    fail('INVALID_INVOCATION_INPUT', 'invocation admission options.assembly is required');
  }
  if (!('currentDefinitionGraph' in optionsView) || optionsView.currentDefinitionGraph === undefined) {
    fail('INVALID_INVOCATION_INPUT', 'invocation admission options.currentDefinitionGraph is required');
  }

  const view = requireSafeRecord(request, 'tool invocation request', 'INVALID_INVOCATION_REQUEST');
  const unexpectedRequestField = Object.keys(view).find((key) => !REQUEST_FIELDS.has(key));
  if (unexpectedRequestField !== undefined) {
    fail(
      'INVALID_INVOCATION_REQUEST',
      `tool invocation request must contain exactly {toolComponentId, operationId, input, caller, definitionGraphDigest, assemblyDigest, exposure}; unexpected field "${unexpectedRequestField}"`,
    );
  }
  for (const required of ['toolComponentId', 'operationId', 'input', 'caller', 'definitionGraphDigest', 'assemblyDigest', 'exposure'] as const) {
    if (!(required in view)) {
      fail('INVALID_INVOCATION_REQUEST', `tool invocation request.${required} is required`);
    }
  }

  const toolComponentId = requireExactIdentity(view.toolComponentId, 'tool invocation request.toolComponentId', 'INVALID_INVOCATION_REQUEST');
  const operationId = requireExactIdentity(view.operationId, 'tool invocation request.operationId', 'INVALID_INVOCATION_REQUEST');
  const input = requireJsonMaterial(view.input, 'tool invocation request.input', 'INVALID_INVOCATION_REQUEST');
  const { canonical: callerCanonical } = snapshotCaller(
    view.caller,
    'tool invocation request.caller',
    'INVALID_INVOCATION_CALLER',
  );
  if (!isContentDigest(view.definitionGraphDigest)) {
    fail('INVALID_INVOCATION_REQUEST', 'tool invocation request.definitionGraphDigest must be a non-empty content digest string');
  }
  if (!isContentDigest(view.assemblyDigest)) {
    fail('INVALID_INVOCATION_REQUEST', 'tool invocation request.assemblyDigest must be a non-empty content digest string');
  }

  const assembly = requireAssemblyIdentity(optionsView.assembly, 'invocation admission options.assembly');

  // Anti-forgery boundary: a caller-constructed evidence object can never
  // carry the minting registry membership, even with byte-perfect public
  // digest material (#601 posture, applied from the start).
  if (!isAdmittedExposure(view.exposure)) {
    fail(
      'FORGED_EXPOSURE_EVIDENCE',
      'tool invocation request.exposure must be AdmittedToolExposure minted by admitToolExposure; a caller-constructed evidence object can never carry the minting brand and registry membership',
    );
  }
  const exposure = view.exposure;

  // Evidence/request consistency — synchronous shape-level checks: evidence
  // can never be transferred across targets or callers.
  if (exposure.toolComponentId !== toolComponentId || exposure.operationId !== operationId) {
    fail(
      'INVOCATION_BINDING_MISMATCH',
      'the admitted exposure evidence binds a different Tool Component or operation than the request; evidence cannot be transferred across targets',
    );
  }
  if (canonicalJsonStringify(exposure.caller) !== callerCanonical) {
    fail(
      'INVOCATION_CALLER_MISMATCH',
      'tool invocation request.caller does not match the caller context bound in the admitted exposure evidence; a caller cannot ride on evidence minted for a different caller',
    );
  }

  const graph = optionsView.currentDefinitionGraph as DefinitionGraphEnvelope;
  // Graph envelope failures propagate the original DefinitionGraphContractError.
  validateDefinitionGraphEnvelope(graph);

  const bound = requireToolComponentBinding(graph, toolComponentId);
  if (bound.family !== 'tool') {
    fail(
      'INVALID_TOOL_INVOCATION_TARGET',
      `Component "${toolComponentId}" is family "${bound.family}" and can never be a Tool invocation target`,
    );
  }
  // Tool declaration failures propagate the original ToolComponentContractError.
  validateToolComponent(bound);
  const operation = snapshotOperation(bound, toolComponentId, operationId);

  // ---- PHASE 2 (async): authoritative recomputation over trusted seams only.
  const currentGraphDigest = await computeDefinitionGraphDigest(graph, port);
  const recomputedAssemblyDigest = await computeCanonicalJsonDigest(assembly.record, port);

  // ---- PHASE 3: fail-closed currentness and consistency, then mint.
  if (recomputedAssemblyDigest !== assembly.assemblyDigest) {
    fail(
      'ASSEMBLY_DIGEST_MISMATCH',
      'the sealed Assembly record digest authoritatively recomputed from the supplied record does not match its claimed assemblyDigest; tampered or inconsistent Assembly identity fails closed',
    );
  }
  if (currentGraphDigest !== assembly.definitionGraphDigest) {
    fail(
      'DEFINITION_CURRENTNESS_MISMATCH',
      'the current Definition graph digest does not match the exact digest bound in the sealed Assembly; stale Definition fails closed before any dispatch',
    );
  }
  if (view.definitionGraphDigest !== currentGraphDigest) {
    fail(
      'DEFINITION_CURRENTNESS_MISMATCH',
      'tool invocation request.definitionGraphDigest does not match the authoritatively recomputed current Definition graph digest; stale request claims fail closed before any dispatch',
    );
  }
  if (view.assemblyDigest !== assembly.assemblyDigest) {
    fail(
      'ASSEMBLY_CURRENTNESS_MISMATCH',
      'tool invocation request.assemblyDigest does not match the exact sealed Assembly digest; stale Assembly claims fail closed before any dispatch',
    );
  }

  // Exposure currentness: evidence binds the exact digests current at mint
  // time; any drift of Definition or Assembly since then fails closed.
  if (
    exposure.definitionGraphDigest !== currentGraphDigest ||
    exposure.assemblyDigest !== assembly.assemblyDigest
  ) {
    fail(
      'EXPOSURE_CURRENTNESS_MISMATCH',
      'the admitted exposure evidence is bound to older exact state than the current Definition/Assembly; stale exposure fails closed before any dispatch',
    );
  }

  const admitted: AdmittedToolInvocationRequest = Object.freeze({
    status: 'ADMITTED' as const,
    toolComponentId,
    operationId,
    input: deepFreezeValue(input),
    caller: exposure.caller,
    operationEffect: operation.effect,
    definitionGraphDigest: currentGraphDigest,
    assemblyDigest: assembly.assemblyDigest,
    exposure,
  });
  return admitted;
}
