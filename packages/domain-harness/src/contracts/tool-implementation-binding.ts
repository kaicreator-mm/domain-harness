/**
 * v0.7 Assembly-plane Tool implementation binding (issue #607, fine-grained
 * DAG T003C; authority #589 PACK-A).
 *
 * The Microkernel seam that binds the ALREADY-SELECTED exact Tool Component
 * (T003B Definition-plane evidence, consumed here, never re-selected) to
 * exactly one compatible exact Tool implementation. The Microkernel owns
 * exact binding evidence/currentness through this module — never concrete
 * Tool semantics: no provider selection, no invocation, no resource
 * resolution, no ToolRegistry authority and no concrete Tool implementation
 * import exists here.
 *
 * Normative rules owned here, without exception (#589 PACK-A T003C):
 * - the exact pin contains the exact Tool Component identity plus
 *   implementationId + implementationVersion + implementation content digest
 *   plus the exact supported operation identities where required;
 *   function/module path, process handle, registry order and mutable provider
 *   objects are NEVER identity;
 * - zero compatible implementations => typed `MISSING_TOOL_IMPLEMENTATION`;
 *   multiple compatible implementations without an exact authoritative pin =>
 *   `AMBIGUOUS_TOOL_IMPLEMENTATION`; never first/latest/default/ordering;
 * - an exact authoritative pin (all three identity fields) resolves
 *   ambiguity; a pin that matches no offered candidate exactly (id, version
 *   AND digest) fails `MISSING_TOOL_IMPLEMENTATION`; a pin whose candidate is
 *   incompatible fails `INCOMPATIBLE_TOOL_IMPLEMENTATION`;
 * - compatibility is exact operation-support containment of the bound
 *   operation set — every bound operation must be an operation the candidate
 *   declares support for. When `requiredOperations` is omitted, the bound set
 *   is exactly every operation the Tool Component declares (canonical whole
 *   Tool binding); narrowing is caller-explicit, never inferred;
 * - the runtime implementation handle is paired with the exact pin on the
 *   sealed binding, OUTSIDE every digest material: two candidates with
 *   identical pin identity but different handles bind to byte-identical
 *   evidence;
 * - evidence is fresh/frozen/non-aliasing and binds the DefinitionGraphDigest
 *   + the exact Tool provider (component id + provided capability ref) + the
 *   exact implementation pin + the successor Assembly digest it was minted
 *   into. Replacing the implementation changes the successor assemblyDigest
 *   while the Definition identity (Definition graph digest) is unchanged;
 * - a sealed Assembly is NEVER mutated. The binding is materialized as §G
 *   generic binding evidence through the T002B generic container: the
 *   successor Assembly is created by resealing over the same exact
 *   KindImplementation pins with the new/replaced subject slot. Pre-existing
 *   slots for other subjects are preserved.
 *
 * Authority closure (PACK-A): this module consumes the T003B
 * `CurrentCapabilityProviderSelection` (Definition-plane) and the T002B
 * `SealedRuntimeAssembly` as caller-supplied assembly-plane material. It
 * proves currentness by authoritatively recomputing the Definition graph
 * digest through the #555 seam and requiring it to equal BOTH the digest
 * recorded in the sealed Assembly and the digest bound in the selection —
 * a stale or foreign graph, selection or assembly fails closed with
 * `DEFINITION_GRAPH_DIGEST_MISMATCH` before any evidence is minted. The
 * sealed-Assembly mint (WeakSet) verification remains owned by the T002B
 * admission consumption path; this module never re-derives or bypasses it.
 *
 * Torn-snapshot discipline (#587 §E, same as #555): every authority-bearing
 * caller input is descriptor-safe validated and synchronously snapshotted
 * before the first `await`; after any suspension only module-owned snapshot
 * material is read, so a caller mutating its own graph, selection,
 * candidates or pin while a digest promise is pending can never mint torn
 * or hybrid binding evidence.
 *
 * Boundary: validation consumes the shared descriptor-safe record primitive
 * and unified exact-reference authority of `record-safety.ts` (#557 +
 * #578), the T002B generic container (`sealRuntimeAssembly`), the #555
 * Definition graph digest seam, and the T003A Tool declaration validator
 * (`validateToolComponent`) — all imported, never reimplemented. No
 * Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/Storage import
 * is permitted in this file.
 */
import type {
  CapabilityContractRef,
  ComponentId,
  ComponentEnvelope,
} from './component.js';
import {
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
} from './definition-graph.js';
import {
  computeCanonicalJsonDigest,
  isContentDigest,
  type ContentDigest,
  type Sha256Port,
} from './identity.js';
import type { CurrentCapabilityProviderSelection } from './capability-provision.js';
import {
  isSealedRuntimeAssembly,
  sealRuntimeAssembly,
  type AssemblyImplementationBindingEvidence,
  type AssemblyResourceRequirementsMaterial,
  type KindImplementationBindingInput,
  type RuntimeAssemblyResourceRequirementBinding,
  type SealedRuntimeAssembly,
} from './runtime-assembly.js';
import { validateToolComponent } from './tool-component.js';
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
 * Versioned binding-evidence digest domain tag, owned exclusively by this
 * file. Sibling to, and never borrowed by, the T001B/T001C/T002B digest
 * domains: any future change to the evidence material shape is a NEW domain
 * tag; historical binding identities never change retroactively.
 */
const TOOL_IMPLEMENTATION_BINDING_EVIDENCE_DOMAIN =
  'kaicreator.tool-implementation-binding.evidence.v1';

/**
 * Fail-closed Tool implementation binding failure taxonomy (#589 PACK-A).
 * Every failure is typed and terminal — none carries or suggests a
 * substitute/default/latest resolution, and no diagnostic ever serializes
 * implementation handles, secret values or live objects (only exact identity
 * strings participate).
 *
 * Consumer-verifier additions (#640; #589 §A A1–A4) — the five frozen
 * deterministic failures downstream consumers (T003E/T004B) rely on:
 * - `UNMINTED_TOOL_IMPLEMENTATION_BINDING`: an authority use over an object
 *   that is not a member of the module-private mint registry;
 * - `TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH`: the verified evidence
 *   material is malformed, not canonical, or its recomputed v1 bindingDigest
 *   does not equal `evidence.bindingDigest`;
 * - `MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING`: no final-Assembly slot for
 *   the exact subject exists (never repaired by another slot/alias);
 * - `STALE_TOOL_IMPLEMENTATION_BINDING`: the subject slot was replaced by a
 *   different bindingDigest, or the final Assembly's Definition identity no
 *   longer matches the evidence;
 * - `TOOL_IMPLEMENTATION_PIN_MISMATCH`: a consumer-supplied expected exact
 *   implementation pin does not equal the verified evidence pin.
 */
export type ToolImplementationBindingErrorCode =
  | 'INVALID_BINDING_INPUT'
  | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'
  | 'MISSING_TOOL_IMPLEMENTATION'
  | 'AMBIGUOUS_TOOL_IMPLEMENTATION'
  | 'INCOMPATIBLE_TOOL_IMPLEMENTATION'
  | 'DEFINITION_GRAPH_DIGEST_MISMATCH'
  | 'UNMINTED_TOOL_IMPLEMENTATION_BINDING'
  | 'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH'
  | 'MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING'
  | 'STALE_TOOL_IMPLEMENTATION_BINDING'
  | 'TOOL_IMPLEMENTATION_PIN_MISMATCH';

export class ToolImplementationBindingError extends Error {
  readonly code: ToolImplementationBindingErrorCode;
  /**
   * AMBIGUOUS only: the conflicting implementationIds, sorted
   * lexicographically, so the failure diagnostics are deterministic under
   * every candidate ordering. Empty for every other code.
   */
  readonly conflictingImplementationIds: readonly string[];

  constructor(
    code: ToolImplementationBindingErrorCode,
    message: string,
    conflictingImplementationIds: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ToolImplementationBindingError';
    this.code = code;
    this.conflictingImplementationIds = Object.freeze([...conflictingImplementationIds]);
  }
}

/**
 * Exact, immutable identity of one Tool implementation. All three fields are
 * exact opaque identities — never ranges/floating selectors — and the
 * content digest pins the exact implementation content/artifact. Module
 * paths, provider objects, function source text and live handles are NOT
 * authority identity.
 */
export interface ToolImplementationIdentity {
  /** Exact opaque implementation identity — never a range/floating selector. */
  readonly implementationId: string;
  /** Exact opaque implementation version — never a range/floating/x-range selector. */
  readonly implementationVersion: string;
  /** Valid content digest of the exact implementation content/artifact. */
  readonly implementationDigest: ContentDigest;
}

/**
 * One offered Tool implementation candidate. The candidate envelope is
 * whitelisted to exactly {implementation, supportedOperations, handle?}:
 * module paths, provider objects, registry entries and invoke functions are
 * structurally unrepresentable. `handle` is an opaque runtime value paired
 * with the pin OUTSIDE digest material — it never participates in identity,
 * compatibility, evidence or diagnostics.
 */
export interface ToolImplementationCandidate {
  /** The exact implementation pin identity. */
  readonly implementation: ToolImplementationIdentity;
  /** Exact operation identities this candidate declares support for. */
  readonly supportedOperations: readonly string[];
  /** Opaque runtime handle; paired outside digest material, never identity. */
  readonly handle?: unknown;
}

/** Complete binding input. All authority-bearing material is synchronously
 * snapshot at call time; the caller's objects are never frozen or mutated. */
export interface BindToolImplementationInput {
  /** The sealed Runtime Assembly to bind into (never mutated). */
  readonly assembly: SealedRuntimeAssembly;
  /** The T003B Definition-plane selection evidence (consumed, not owned). */
  readonly selection: CurrentCapabilityProviderSelection;
  /** The live Definition graph; its digest is authoritatively recomputed. */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /** The offered Tool implementation candidates (the caller's exact set). */
  readonly implementations: readonly ToolImplementationCandidate[];
  /**
   * Optional exact narrowing of the bound operation set. Each entry must be
   * an operation the Tool Component declares. Omitted = the canonical whole
   * Tool binding (every declared operation).
   */
  readonly requiredOperations?: readonly string[];
  /**
   * Optional exact authoritative pin resolving ambiguity: all three identity
   * fields must equal one offered candidate exactly. Never first/latest.
   */
  readonly exactPin?: ToolImplementationIdentity;
  /** The Sha256Port used for every authoritative digest recomputation. */
  readonly sha256: Sha256Port;
}

/**
 * Serializable, content-addressed Tool implementation binding evidence.
 * Fresh, frozen, non-aliasing; binds the DefinitionGraphDigest + the exact
 * Tool provider + the exact implementation pin + the successor Assembly
 * digest. No handle, secret, endpoint, provider object or invocation field
 * is representable.
 */
export interface ToolImplementationBindingEvidence {
  readonly status: 'BOUND';
  /** Exact Definition graph content digest, authoritatively recomputed. */
  readonly definitionGraphDigest: ContentDigest;
  /** Digest of the successor Assembly this evidence was minted into. */
  readonly assemblyDigest: ContentDigest;
  /** Exact identity of the already-selected Domain Tool Component. */
  readonly toolComponentId: ComponentId;
  /** The exact capability ref the Tool provider was selected for. */
  readonly providesCapability: CapabilityContractRef;
  /** The exact implementation pin (id/version/content digest). */
  readonly implementation: ToolImplementationIdentity;
  /** The exact bound operation identities, order-normalized. */
  readonly supportedOperations: readonly string[];
  /** Content digest of the exact binding evidence material. */
  readonly bindingDigest: ContentDigest;
}

/**
 * Private anti-forgery brand. The `unique symbol` computed key is not
 * exported, so no external code can construct a value satisfying
 * `SealedToolImplementationBinding`; future consumers verify mint through the
 * module-private registry pattern of T002B.
 */
const SEALED_TOOL_BINDING_BRAND: unique symbol = Symbol(
  'kaicreator.tool-implementation-binding.sealed',
);

/**
 * Module-private mint registry for `SealedToolImplementationBinding` (#640;
 * #589 §A A1 — the T002B sealed-Assembly precedent). A property-style brand
 * alone is bypassable: it is readable through the prototype chain
 * (Object.create forgery) and the symbol is reflectively extractable from any
 * genuine binding (getOwnPropertySymbols theft). WeakSet membership is
 * neither inheritable, reflectively extractable, nor reproducible from public
 * material: only `bindToolImplementation` can mint a member, so only a
 * genuine binding can ever authorize a consumer's authority use. The brand is
 * retained as a secondary, own-property-only (`Object.hasOwn`) defense in
 * depth.
 */
const SEALED_TOOL_BINDING_MINTS = new WeakSet<object>();

/**
 * The sealed Tool implementation binding: the serializable evidence, the
 * successor sealed Assembly (carrying the §G evidence slot), and the runtime
 * implementation handle paired with the exact pin outside digest material.
 * Minted only by `bindToolImplementation`; freezing is deep on identity
 * material, the handle is paired by reference as an opaque runtime value.
 */
export interface SealedToolImplementationBinding {
  /** Serializable content-addressed binding evidence. */
  readonly evidence: ToolImplementationBindingEvidence;
  /** The successor sealed Assembly created through the T002B container. */
  readonly successorAssembly: SealedRuntimeAssembly;
  /** Opaque runtime handle paired with the exact pin (never digest material). */
  readonly implementationHandle: unknown;
  readonly [SEALED_TOOL_BINDING_BRAND]: true;
}

// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------

function fail(code: ToolImplementationBindingErrorCode, message: string): never {
  throw new ToolImplementationBindingError(code, message);
}

/** Code-unit comparison only; `localeCompare` is forbidden in this module. */
function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(value: unknown, description: string): Record<string, unknown> {
  const result = safeRecordSnapshot(value, description);
  if (!result.ok) {
    fail('INVALID_BINDING_INPUT', `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

/** Snapshot one authority-bearing array, mapping descriptor issues to a typed failure. */
function requireSafeArray(value: unknown, description: string): unknown[] {
  const result = safeArraySnapshot(value, description);
  if (!result.ok) {
    fail('INVALID_BINDING_INPUT', `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function requireExactIdentityString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    fail('INVALID_BINDING_INPUT', `${path} must be a string`);
  }
  if (!isNonEmptyIdentityString(value)) {
    fail('INVALID_BINDING_INPUT', `${path} must be a non-empty exact identity`);
  }
  if (carriesEmbeddedSelector(value)) {
    fail('INVALID_BINDING_INPUT', `${path} must not embed a version selector (\`id@version\`); use the exact version field`);
  }
  return value;
}

/** Rejects mutable selection tokens and range operators; never normalizes. */
function requireNonFloatingIdentity(value: string, path: string): void {
  if (carriesFloatingOrRangeSemantics(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      `${path} must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)`,
    );
  }
}

/** Rejects floating/range/x-range version forms (`1.x`, `x`, `1.`). */
function requireExactVersion(value: string, path: string): void {
  if (carriesFloatingOrRangeSemantics(value) || carriesXRangeVersionSemantics(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      `${path} must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)`,
    );
  }
}

/** Snapshot one exact `{capabilityId, version}` ref as a fresh frozen object. */
function snapshotCapabilityRef(value: unknown, path: string): CapabilityContractRef {
  const candidate = requireSafeRecord(value, path);
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || !keys.includes('capabilityId') || !keys.includes('version')) {
    fail('INVALID_BINDING_INPUT', `${path} must contain exactly {capabilityId, version}`);
  }
  const capabilityId = requireExactIdentityString(candidate.capabilityId, `${path}.capabilityId`);
  requireNonFloatingIdentity(capabilityId, `${path}.capabilityId`);
  const version = requireExactIdentityString(candidate.version, `${path}.version`);
  requireNonFloatingIdentity(version, `${path}.version`);
  requireExactVersion(version, `${path}.version`);
  return Object.freeze({ capabilityId, version });
}

/** Snapshot one exact implementation identity as a fresh frozen object. */
function snapshotImplementationIdentity(
  value: unknown,
  path: string,
): ToolImplementationIdentity {
  const candidate = requireSafeRecord(value, path);
  const keys = Object.keys(candidate).sort();
  if (
    keys.length !== 3 ||
    !keys.includes('implementationId') ||
    !keys.includes('implementationVersion') ||
    !keys.includes('implementationDigest')
  ) {
    fail(
      'INVALID_BINDING_INPUT',
      `${path} must contain exactly {implementationId, implementationVersion, implementationDigest}; unexpected or missing field (module paths, provider objects and function identity are never part of a Tool implementation pin)`,
    );
  }
  const implementationId = requireExactIdentityString(
    candidate.implementationId,
    `${path}.implementationId`,
  );
  requireNonFloatingIdentity(implementationId, `${path}.implementationId`);
  const implementationVersion = requireExactIdentityString(
    candidate.implementationVersion,
    `${path}.implementationVersion`,
  );
  requireNonFloatingIdentity(implementationVersion, `${path}.implementationVersion`);
  requireExactVersion(implementationVersion, `${path}.implementationVersion`);
  if (!isContentDigest(candidate.implementationDigest)) {
    fail('INVALID_BINDING_INPUT', `${path}.implementationDigest must be a non-empty content digest string`);
  }
  return Object.freeze({
    implementationId,
    implementationVersion,
    implementationDigest: candidate.implementationDigest,
  });
}

/** Snapshot one exact operation-identity collection: duplicates fail closed. */
function snapshotOperationSet(
  value: unknown,
  description: string,
): readonly string[] {
  const entries = requireSafeArray(value, description);
  const seen = new Set<string>();
  const operations = entries.map((entry, index) => {
    const operation = requireExactIdentityString(entry, `${description}[${index}]`);
    requireNonFloatingIdentity(operation, `${description}[${index}]`);
    if (seen.has(operation)) {
      fail(
        'INVALID_BINDING_INPUT',
        `${description}[${index}] declares ${operation} more than once (exact operation identities only)`,
      );
    }
    seen.add(operation);
    return operation;
  });
  return Object.freeze([...operations].sort(lexicalCompare));
}

// ---------------------------------------------------------------------------
// Input snapshots
// ---------------------------------------------------------------------------

const INPUT_FIELDS = new Set<string>([
  'assembly',
  'selection',
  'currentDefinitionGraph',
  'implementations',
  'requiredOperations',
  'exactPin',
  'sha256',
]);

const SELECTION_FIELDS = new Set<string>([
  'graphId',
  'definitionGraphDigest',
  'requiredCapability',
  'consumer',
  'provider',
]);

const PROVIDER_FIELDS = new Set<string>(['componentId', 'family', 'providesCapability']);

const CANDIDATE_FIELDS = new Set<string>(['implementation', 'supportedOperations', 'handle']);

interface SnapshotSelection {
  readonly definitionGraphDigest: ContentDigest;
  readonly requiredCapability: CapabilityContractRef;
  readonly providerComponentId: ComponentId;
  readonly providesCapability: CapabilityContractRef;
}

interface SnapshotCandidate {
  readonly implementation: ToolImplementationIdentity;
  readonly supportedOperations: readonly string[];
  readonly handle: unknown;
  readonly hasHandle: boolean;
}

/** A fully snapshotted bind request: fresh frozen identity plus the sealed
 * Assembly handles needed to reseal through the T002B container. */
interface SnapshotBindRequest {
  readonly assemblyDefinitionDigest: ContentDigest;
  readonly assemblyBindings: readonly KindImplementationBindingInput[];
  readonly assemblyResourceRequirements: readonly AssemblyResourceRequirementsMaterial[];
  readonly priorEvidenceSlots: readonly AssemblyImplementationBindingEvidence[];
  readonly selection: SnapshotSelection;
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  readonly candidates: readonly SnapshotCandidate[];
  readonly boundOperations: readonly string[];
  readonly exactPin: ToolImplementationIdentity | undefined;
  readonly sha256: Sha256Port;
}

function requireSha256Port(value: unknown, path: string): Sha256Port {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as Sha256Port).digestUtf8 !== 'function'
  ) {
    fail('INVALID_BINDING_INPUT', `${path} must be a Sha256Port ({ digestUtf8(value): Promise<string> })`);
  }
  return value as Sha256Port;
}

/**
 * Synchronously validate and snapshot the sealed Assembly input. The record
 * and the prior §G evidence slots are copied as fresh frozen identity
 * material; the KindImplementation bindings are rebuilt as fresh input
 * records carrying the sealed validator handles (reseal input). The T002B
 * WeakSet mint is module-private and deliberately not re-derived here — the
 * successor Assembly is minted by the genuine `sealRuntimeAssembly`, and the
 * mint verification remains owned by the T002B admission consumption path.
 *
 * Fresh Review P1 (#607): the sealed record's canonical #568/§F
 * `resourceRequirements` material is snapshotted here too and carried through
 * the successor reseal — an input Assembly sealed with T005A
 * resource-requirement material must never silently lose it. A record not
 * carrying the field is not a genuine T002B seal and fails closed typed.
 */
/**
 * Read one own DATA property of the sealed Assembly without invoking hidden
 * getters. The descriptor-safe record snapshot cannot be used on the assembly
 * object itself: a genuine sealed Assembly legitimately carries the
 * module-private brand symbol, which the #557/#578 primitive rejects for
 * contract input records. Own data-descriptor reads are equally safe: an
 * accessor-backed or inherited property is rejected before any authority use,
 * and no hidden getter ever executes.
 */
function readAssemblyOwnDataProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    fail('INVALID_BINDING_INPUT', `bind input.assembly.${key} is required`);
  }
  if (descriptor.get !== undefined || descriptor.set !== undefined) {
    fail(
      'INVALID_BINDING_INPUT',
      `bind input.assembly.${key} must be a data property, not accessor-backed`,
    );
  }
  return descriptor.value;
}

function snapshotAssembly(value: unknown): {
  definitionGraphDigest: ContentDigest;
  bindings: readonly KindImplementationBindingInput[];
  resourceRequirements: readonly AssemblyResourceRequirementsMaterial[];
  priorSlots: readonly AssemblyImplementationBindingEvidence[];
} {
  const at = 'bind input.assembly';
  if (typeof value !== 'object' || value === null) {
    fail('INVALID_BINDING_INPUT', `${at} must be a SealedRuntimeAssembly ({ record, bindings, ... })`);
  }
  const assemblyObject = value;
  const recordValue = readAssemblyOwnDataProperty(assemblyObject, 'record');
  const assemblyDigest = readAssemblyOwnDataProperty(assemblyObject, 'assemblyDigest');
  const bindingsValue = readAssemblyOwnDataProperty(assemblyObject, 'bindings');

  const recordView = requireSafeRecord(recordValue, `${at}.record`);
  if (
    !('definitionGraphDigest' in recordView) ||
    !('resourceRequirements' in recordView) ||
    !('implementationBindingEvidence' in recordView)
  ) {
    fail('INVALID_BINDING_INPUT', `${at}.record must carry definitionGraphDigest, resourceRequirements and implementationBindingEvidence`);
  }
  if (typeof assemblyDigest !== 'string' || !isContentDigest(assemblyDigest)) {
    fail('INVALID_BINDING_INPUT', `${at}.assemblyDigest must be a non-empty content digest string`);
  }
  const definitionGraphDigest = recordView.definitionGraphDigest;
  if (typeof definitionGraphDigest !== 'string' || !isContentDigest(definitionGraphDigest)) {
    fail('INVALID_BINDING_INPUT', `${at}.record.definitionGraphDigest must be a non-empty content digest string`);
  }

  const priorSlots = snapshotEvidenceSlots(recordView.implementationBindingEvidence, `${at}.record.implementationBindingEvidence`);
  const resourceRequirements = snapshotAssemblyResourceRequirements(
    recordView.resourceRequirements,
    `${at}.record.resourceRequirements`,
  );

  const bindingViews = requireSafeArray(bindingsValue, `${at}.bindings`);
  const bindings = bindingViews.map((entry, index) => {
    const bindingAt = `${at}.bindings[${index}]`;
    const bindingView = requireSafeRecord(entry, bindingAt);
    const pin = requireSafeRecord(bindingView.pin, `${bindingAt}.pin`);
    const implementation = requireSafeRecord(
      pin.implementation,
      `${bindingAt}.pin.implementation`,
    );
    if (typeof bindingView.validateComponent !== 'function') {
      fail('INVALID_BINDING_INPUT', `${bindingAt}.validateComponent must be a function`);
    }
    const understoodSemanticContracts = requireSafeArray(
      bindingView.understoodSemanticContracts,
      `${bindingAt}.understoodSemanticContracts`,
    ).map((ref, refIndex) => {
      const refView = requireSafeRecord(ref, `${bindingAt}.understoodSemanticContracts[${refIndex}]`);
      if (
        Object.keys(refView).sort().join(',') !== 'contractId,version' ||
        typeof refView.contractId !== 'string' ||
        typeof refView.version !== 'string'
      ) {
        fail('INVALID_BINDING_INPUT', `${bindingAt}.understoodSemanticContracts[${refIndex}] must be { contractId, version }`);
      }
      return Object.freeze({ contractId: refView.contractId, version: refView.version });
    });
    const understoodCapabilities = requireSafeArray(
      bindingView.understoodCapabilities,
      `${bindingAt}.understoodCapabilities`,
    ).map((ref, refIndex) => {
      const refView = requireSafeRecord(ref, `${bindingAt}.understoodCapabilities[${refIndex}]`);
      if (
        Object.keys(refView).sort().join(',') !== 'capabilityId,version' ||
        typeof refView.capabilityId !== 'string' ||
        typeof refView.version !== 'string'
      ) {
        fail('INVALID_BINDING_INPUT', `${bindingAt}.understoodCapabilities[${refIndex}] must be { capabilityId, version }`);
      }
      return Object.freeze({ capabilityId: refView.capabilityId, version: refView.version });
    });
    return {
      pin: {
        kind: (pin.kind ?? fail('INVALID_BINDING_INPUT', `${bindingAt}.pin.kind is required`)) as KindImplementationBindingInput['pin']['kind'],
        implementation: implementation as KindImplementationBindingInput['pin']['implementation'],
      },
      understoodSemanticContracts,
      understoodCapabilities,
      validateComponent: bindingView.validateComponent as KindImplementationBindingInput['validateComponent'],
    } satisfies KindImplementationBindingInput;
  });

  return { definitionGraphDigest: definitionGraphDigest, bindings, resourceRequirements, priorSlots };
}

/** Snapshot the prior §G evidence slots as fresh frozen identity material. */
function snapshotEvidenceSlots(
  value: unknown,
  description: string,
): readonly AssemblyImplementationBindingEvidence[] {
  const entries = requireSafeArray(value, description);
  return Object.freeze(
    entries.map((entry, index) => {
      const view = requireSafeRecord(entry, `${description}[${index}]`);
      if (Object.keys(view).sort().join(',') !== 'bindingDigest,subject') {
        fail('INVALID_BINDING_INPUT', `${description}[${index}] must contain exactly { subject, bindingDigest }`);
      }
      const subject = requireExactIdentityString(view.subject, `${description}[${index}].subject`);
      requireNonFloatingIdentity(subject, `${description}[${index}].subject`);
      if (!isContentDigest(view.bindingDigest)) {
        fail('INVALID_BINDING_INPUT', `${description}[${index}].bindingDigest must be a non-empty content digest string`);
      }
      return Object.freeze({ subject, bindingDigest: view.bindingDigest });
    }),
  );
}

/** Snapshot one exact `{contractId, version}` resource contract ref as a fresh frozen object. */
function snapshotResourceContractRef(
  value: unknown,
  path: string,
): { readonly contractId: string; readonly version: string } {
  const candidate = requireSafeRecord(value, path);
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || !keys.includes('contractId') || !keys.includes('version')) {
    fail('INVALID_BINDING_INPUT', `${path} must contain exactly { contractId, version }`);
  }
  const contractId = requireExactIdentityString(candidate.contractId, `${path}.contractId`);
  requireNonFloatingIdentity(contractId, `${path}.contractId`);
  const version = requireExactIdentityString(candidate.version, `${path}.version`);
  requireNonFloatingIdentity(version, `${path}.version`);
  requireExactVersion(version, `${path}.version`);
  return Object.freeze({ contractId, version });
}

const ASSEMBLY_RESOURCE_MATERIAL_FIELDS = new Set<string>(['componentId', 'requirements']);

const ASSEMBLY_RESOURCE_REQUIREMENT_FIELDS = new Set<string>([
  'resourceKey',
  'contract',
  'operationId',
  'required',
]);

/**
 * Synchronously validate and snapshot the sealed record's canonical #568/§F
 * resource requirement material as fresh frozen identity, for carry-through
 * into the successor reseal. The canonical material already has exactly the
 * T005A declaration shape (five normative requirement fields, order
 * normalized by the T002B seal), so this is a faithful descriptor-safe copy,
 * not a reinterpretation: unexpected fields, non-exact identities and
 * non-boolean criticality fail closed typed instead of being silently
 * dropped or normalized.
 */
function snapshotAssemblyResourceRequirements(
  value: unknown,
  description: string,
): readonly AssemblyResourceRequirementsMaterial[] {
  const entries = requireSafeArray(value, description);
  return Object.freeze(
    entries.map((entry, index) => {
      const at = `${description}[${index}]`;
      const view = requireSafeRecord(entry, at);
      const unexpectedField = Object.keys(view).find((key) => !ASSEMBLY_RESOURCE_MATERIAL_FIELDS.has(key));
      if (unexpectedField !== undefined) {
        fail('INVALID_BINDING_INPUT', `${at} must contain exactly { componentId, requirements }; unexpected field "${unexpectedField}"`);
      }
      const componentId = requireExactIdentityString(view.componentId, `${at}.componentId`);
      requireNonFloatingIdentity(componentId, `${at}.componentId`);
      const requirements = requireSafeArray(view.requirements, `${at}.requirements`).map(
        (candidate, requirementIndex) => {
          const path = `${at}.requirements[${requirementIndex}]`;
          const requirement = requireSafeRecord(candidate, path);
          const unexpectedRequirementField = Object.keys(requirement).find(
            (key) => !ASSEMBLY_RESOURCE_REQUIREMENT_FIELDS.has(key),
          );
          if (unexpectedRequirementField !== undefined) {
            fail('INVALID_BINDING_INPUT', `${path} must not carry unknown field "${unexpectedRequirementField}" (live values, secrets, endpoints and handles are structurally unrepresentable)`);
          }
          const resourceKey = requireExactIdentityString(requirement.resourceKey, `${path}.resourceKey`);
          requireNonFloatingIdentity(resourceKey, `${path}.resourceKey`);
          if (typeof requirement.required !== 'boolean') {
            fail('INVALID_BINDING_INPUT', `${path}.required must be a boolean (explicit criticality; no default, no coercion)`);
          }
          const material: {
            resourceKey: string;
            required: boolean;
            contract?: { readonly contractId: string; readonly version: string };
            operationId?: string;
          } = { resourceKey, required: requirement.required };
          if ('contract' in requirement && requirement.contract !== undefined) {
            material.contract = snapshotResourceContractRef(requirement.contract, `${path}.contract`);
          }
          if ('operationId' in requirement && requirement.operationId !== undefined) {
            const operationId = requireExactIdentityString(requirement.operationId, `${path}.operationId`);
            requireNonFloatingIdentity(operationId, `${path}.operationId`);
            material.operationId = operationId;
          }
          return Object.freeze(material);
        },
      );
      return Object.freeze({ componentId, requirements: Object.freeze(requirements) });
    }),
  );
}

/**
 * Synchronously validate and snapshot the T003B selection evidence. The
 * selection is CONSUMED, never re-run: this module checks only that it is
 * structurally exact and internally consistent (exact refs, Tool provider),
 * and binds its identities into the new evidence. Provider candidacy and
 * capability matching remain T003B-owned.
 */
function snapshotSelection(value: unknown): SnapshotSelection {
  const at = 'bind input.selection';
  const view = requireSafeRecord(value, at);
  const unexpectedField = Object.keys(view).find((key) => !SELECTION_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_BINDING_INPUT',
      `${at} must contain exactly { graphId, definitionGraphDigest, requiredCapability, consumer, provider }; unexpected field "${unexpectedField}"`,
    );
  }
  const definitionGraphDigest = view.definitionGraphDigest;
  if (typeof definitionGraphDigest !== 'string' || !isContentDigest(definitionGraphDigest)) {
    fail('INVALID_BINDING_INPUT', `${at}.definitionGraphDigest must be a non-empty content digest string`);
  }
  const requiredCapability = snapshotCapabilityRef(view.requiredCapability, `${at}.requiredCapability`);
  const provider = requireSafeRecord(view.provider, `${at}.provider`);
  const unexpectedProviderField = Object.keys(provider).find((key) => !PROVIDER_FIELDS.has(key));
  if (unexpectedProviderField !== undefined) {
    fail(
      'INVALID_BINDING_INPUT',
      `${at}.provider must contain exactly { componentId, family, providesCapability }; unexpected field "${unexpectedProviderField}" (implementation/module identity is not part of provider selection evidence)`,
    );
  }
  if (provider.family !== 'tool') {
    fail('INVALID_BINDING_INPUT', `${at}.provider.family must be 'tool' — semantic components are never Tool implementation subjects`);
  }
  const providerComponentId = requireExactIdentityString(
    provider.componentId,
    `${at}.provider.componentId`,
  );
  requireNonFloatingIdentity(providerComponentId, `${at}.provider.componentId`);
  const providesCapability = snapshotCapabilityRef(
    provider.providesCapability,
    `${at}.provider.providesCapability`,
  );
  return {
    definitionGraphDigest: definitionGraphDigest,
    requiredCapability,
    providerComponentId,
    providesCapability,
  };
}

/** Synchronously validate and snapshot one offered implementation candidate. */
function snapshotCandidate(value: unknown, index: number): SnapshotCandidate {
  const at = `bind input.implementations[${index}]`;
  const view = requireSafeRecord(value, at);
  const unexpectedField = Object.keys(view).find((key) => !CANDIDATE_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_BINDING_INPUT',
      `${at} must contain exactly { implementation, supportedOperations, handle? }; unexpected field "${unexpectedField}" (module paths, provider objects and invoke functions are never part of a Tool implementation candidate)`,
    );
  }
  const implementation = snapshotImplementationIdentity(view.implementation, `${at}.implementation`);
  const supportedOperations = snapshotOperationSet(view.supportedOperations, `${at}.supportedOperations`);
  return {
    implementation,
    supportedOperations,
    handle: 'handle' in view ? view.handle : undefined,
    hasHandle: 'handle' in view,
  };
}

/**
 * Synchronously validate and snapshot the whole bind request (descriptor
 * safe, fail-closed, no caller-owned re-read after return). The current
 * Definition graph envelope is validated through the existing contract; the
 * selected Tool Component is validated through the T003A declaration
 * validator (its errors propagate unchanged). The bound operation set is
 * derived here: caller-narrowed when `requiredOperations` is present, else
 * exactly every operation the Tool Component declares.
 */
function snapshotBindRequest(input: unknown): SnapshotBindRequest {
  const inputView = requireSafeRecord(input, 'bind input');
  const unexpectedInputField = Object.keys(inputView).find((key) => !INPUT_FIELDS.has(key));
  if (unexpectedInputField !== undefined) {
    fail(
      'INVALID_BINDING_INPUT',
      `bind input must not carry unknown field "${unexpectedInputField}"`,
    );
  }
  if (!('assembly' in inputView)) {
    fail('INVALID_BINDING_INPUT', 'bind input.assembly is required');
  }
  if (!('selection' in inputView)) {
    fail('INVALID_BINDING_INPUT', 'bind input.selection is required');
  }
  if (!('currentDefinitionGraph' in inputView)) {
    fail('INVALID_BINDING_INPUT', 'bind input.currentDefinitionGraph is required');
  }
  if (!('implementations' in inputView)) {
    fail('INVALID_BINDING_INPUT', 'bind input.implementations is required');
  }

  const assembly = snapshotAssembly(inputView.assembly);
  const selection = snapshotSelection(inputView.selection);
  const currentDefinitionGraph = inputView.currentDefinitionGraph as DefinitionGraphEnvelope;
  // Graph envelope validation is synchronous; the original
  // DefinitionGraphContractError (and the ComponentContractError it
  // composes) propagate unchanged.
  validateDefinitionGraphEnvelope(currentDefinitionGraph);
  // Deep-copy the validated graph into module-owned snapshot state (the same
  // snapshotJson discipline as T002B admission): the digest recomputation and
  // the successor reseal both run after async suspensions and must never
  // re-read caller-owned graph material.
  const graphSnapshot = JSON.parse(JSON.stringify(currentDefinitionGraph)) as DefinitionGraphEnvelope;

  // Selection/graph consistency: the selected provider must be the exact
  // Tool Component of THIS graph, declaring the selected capability.
  const providerComponent = graphSnapshot.components.find(
    (component) => component.componentId === selection.providerComponentId,
  );
  if (providerComponent === undefined) {
    fail(
      'INVALID_BINDING_INPUT',
      `bind input.selection.provider.componentId "${selection.providerComponentId}" is not a component of the current Definition graph "${graphSnapshot.graphId}" — the selection must name the already-selected Tool Component of this exact graph`,
    );
  }
  if (providerComponent.family !== 'tool') {
    fail(
      'INVALID_BINDING_INPUT',
      `bind input.selection.provider.componentId "${selection.providerComponentId}" is family "${providerComponent.family}" — only Tool Components can be bound to a Tool implementation`,
    );
  }
  // Tool declaration validation propagates the unchanged T003A error.
  validateToolComponent(providerComponent);
  const declaration = providerComponent.semanticBody as unknown as {
    operations: ReadonlyArray<{ operationId: string }>;
    providesCapabilities: readonly CapabilityContractRef[];
  };
  const declaredCapability = declaration.providesCapabilities.find(
    (ref) =>
      ref.capabilityId === selection.requiredCapability.capabilityId &&
      ref.version === selection.requiredCapability.version,
  );
  if (declaredCapability === undefined) {
    fail(
      'INVALID_BINDING_INPUT',
      `the selected Tool Component "${selection.providerComponentId}" does not provide the selected capability ref (capabilityId=${selection.requiredCapability.capabilityId} version=${selection.requiredCapability.version}) — the selection must be consistent with the current graph`,
    );
  }
  const declaredOperationIds = declaration.operations.map((operation) => operation.operationId);

  const candidates = requireSafeArray(inputView.implementations, 'bind input.implementations').map(
    (entry, index) => snapshotCandidate(entry, index),
  );

  // Bound operation set: caller-narrowed, else the canonical whole Tool.
  let boundOperations: readonly string[];
  if (inputView.requiredOperations !== undefined) {
    const narrowed = snapshotOperationSet(inputView.requiredOperations, 'bind input.requiredOperations');
    for (const operation of narrowed) {
      if (!declaredOperationIds.includes(operation)) {
        fail(
          'INVALID_BINDING_INPUT',
          `bind input.requiredOperations declares "${operation}", which is not an operation of the selected Tool Component "${selection.providerComponentId}" — required operations must be declared by the exact Tool Component`,
        );
      }
    }
    boundOperations = narrowed;
  } else {
    boundOperations = Object.freeze([...declaredOperationIds].sort(lexicalCompare));
  }

  const exactPin =
    inputView.exactPin === undefined
      ? undefined
      : snapshotImplementationIdentity(inputView.exactPin, 'bind input.exactPin');

  const sha256 = requireSha256Port(inputView.sha256, 'bind input.sha256');

  return {
    assemblyDefinitionDigest: assembly.definitionGraphDigest,
    assemblyBindings: assembly.bindings,
    assemblyResourceRequirements: assembly.resourceRequirements,
    priorEvidenceSlots: assembly.priorSlots,
    selection,
    currentDefinitionGraph: graphSnapshot,
    candidates,
    boundOperations,
    exactPin,
    sha256,
  };
}

// ---------------------------------------------------------------------------
// The deterministic binding decision (synchronous, fail-closed)
// ---------------------------------------------------------------------------

/**
 * Decide exactly one compatible implementation, or fail closed. Runs
 * entirely on the synchronous snapshot: candidate order can never influence
 * the outcome, and the decision is complete before the first `await`.
 *
 * Selection semantics (never first/latest/default/ordering):
 * - exact pin present: the unique candidate whose implementationId equals
 *   the pin id is the only candidate considered; it must also equal the pin
 *   version and digest exactly (else MISSING — the exact implementation is
 *   not offered) and must support every bound operation (else INCOMPATIBLE);
 * - no exact pin: zero compatible => MISSING; exactly one compatible =>
 *   bind it; more than one => AMBIGUOUS with sorted conflicting ids.
 * Compatibility is exact operation-support containment of the bound set.
 */
function decideBinding(
  candidates: readonly SnapshotCandidate[],
  boundOperations: readonly string[],
  exactPin: ToolImplementationIdentity | undefined,
): SnapshotCandidate {
  const isCompatible = (candidate: SnapshotCandidate): boolean =>
    boundOperations.every((operation) => candidate.supportedOperations.includes(operation));

  if (exactPin !== undefined) {
    const sameId = candidates.filter(
      (candidate) => candidate.implementation.implementationId === exactPin.implementationId,
    );
    const exact = sameId.find(
      (candidate) =>
        candidate.implementation.implementationVersion === exactPin.implementationVersion &&
        candidate.implementation.implementationDigest === exactPin.implementationDigest,
    );
    if (exact === undefined) {
      fail(
        'MISSING_TOOL_IMPLEMENTATION',
        `the exact authoritative pin (implementationId=${exactPin.implementationId} version=${exactPin.implementationVersion}) does not correspond to any offered implementation candidate exactly (id, version AND content digest must all match) — an exact pin is never resolved against a different version/digest`,
      );
    }
    if (!isCompatible(exact)) {
      const missing = boundOperations.filter(
        (operation) => !exact.supportedOperations.includes(operation),
      );
      fail(
        'INCOMPATIBLE_TOOL_IMPLEMENTATION',
        `the exactly pinned implementation "${exactPin.implementationId}" does not support every bound operation (${missing.join(', ')}) — an exact pin never overrides incompatibility`,
      );
    }
    return exact;
  }

  // Duplicate candidate identities are ambiguity, never first-wins.
  const byId = new Map<string, SnapshotCandidate[]>();
  for (const candidate of candidates) {
    const id = candidate.implementation.implementationId;
    const group = byId.get(id) ?? [];
    group.push(candidate);
    byId.set(id, group);
  }
  for (const [id, group] of byId) {
    if (group.length > 1) {
      fail(
        'AMBIGUOUS_TOOL_IMPLEMENTATION',
        `implementationId "${id}" is offered by ${group.length} candidates — duplicate candidate identities are ambiguity, never first-wins`,
      );
    }
  }

  const compatible = candidates.filter(isCompatible);
  if (compatible.length === 0) {
    fail(
      'MISSING_TOOL_IMPLEMENTATION',
      `no offered Tool implementation supports the bound operations (${boundOperations.join(', ')}) — missing implementations fail closed; no default/latest/fallback exists`,
    );
  }
  if (compatible.length > 1) {
    const conflictingImplementationIds = compatible
      .map((candidate) => candidate.implementation.implementationId)
      .sort(lexicalCompare);
    throw new ToolImplementationBindingError(
      'AMBIGUOUS_TOOL_IMPLEMENTATION',
      `${compatible.length} offered Tool implementations are compatible with the bound operations (${boundOperations.join(', ')}) — an exact authoritative pin is required; never first-wins, never ordering, never latest/default`,
      conflictingImplementationIds,
    );
  }
  return compatible[0] as SnapshotCandidate;
}

// ---------------------------------------------------------------------------
// bindToolImplementation — the authority boundary
// ---------------------------------------------------------------------------

/**
 * Bind the already-selected exact Tool Component to exactly one compatible
 * exact Tool implementation.
 *
 * Authority boundary: the sealed input Assembly is never mutated. Binding
 * evidence is minted fresh/frozen/non-aliasing, then a SUCCESSOR Assembly is
 * created through the T002B generic container by resealing over the same
 * exact KindImplementation pins with the new (or replacement) §G evidence
 * slot for the exact Tool Component subject; prior slots for other subjects
 * are preserved.
 *
 * Fail-closed precedence: input shape, assembly/selection snapshot, graph +
 * Tool declaration validation (propagated unchanged), selection/graph
 * consistency, operation exactness, candidate snapshot, the synchronous
 * binding decision (missing/ambiguous/incompatible), then the async
 * currentness recomputation (DEFINITION_GRAPH_DIGEST_MISMATCH) and the
 * evidence/successor digest work. Never downgrades a failure.
 *
 * Torn-snapshot discipline: everything authority-bearing is synchronously
 * snapshotted before the first `await`; after the currentness suspension
 * only module-owned snapshot material is read and resealed.
 */
export async function bindToolImplementation(
  input: BindToolImplementationInput,
): Promise<SealedToolImplementationBinding> {
  const request = snapshotBindRequest(input);

  // Synchronous, order-independent binding decision on the snapshot.
  const chosen = decideBinding(request.candidates, request.boundOperations, request.exactPin);

  // ---- Async phase: currentness first, then evidence/successor digests.
  const definitionGraphDigest = await computeDefinitionGraphDigest(
    request.currentDefinitionGraph,
    request.sha256,
  );
  if (definitionGraphDigest !== request.assemblyDefinitionDigest) {
    fail(
      'DEFINITION_GRAPH_DIGEST_MISMATCH',
      'the current Definition graph digest does not match the exact digest bound in the sealed Assembly; stale or foreign graphs fail closed before any binding evidence is minted',
    );
  }
  if (definitionGraphDigest !== request.selection.definitionGraphDigest) {
    fail(
      'DEFINITION_GRAPH_DIGEST_MISMATCH',
      'the current Definition graph digest does not match the exact digest bound in the T003B selection evidence; a selection minted over a different graph can never authorize a binding',
    );
  }

  // Mint the serializable binding evidence material (identity only).
  const evidenceMaterial = Object.freeze({
    digestDomain: TOOL_IMPLEMENTATION_BINDING_EVIDENCE_DOMAIN,
    definitionGraphDigest,
    toolComponentId: request.selection.providerComponentId,
    providesCapability: request.selection.requiredCapability,
    implementation: chosen.implementation,
    supportedOperations: request.boundOperations,
  });
  const bindingDigest = await computeCanonicalJsonDigest(evidenceMaterial, request.sha256);

  // Create the successor Assembly through the T002B generic container: same
  // exact KindImplementation pins, prior §G slots preserved, this subject's
  // slot added or REPLACED (a replacement changes the assemblyDigest while
  // the Definition identity stays unchanged). The input Assembly is never
  // mutated — the successor is a new sealed Assembly.
  //
  // Fresh Review P1: the sealed record's canonical §F resource requirement
  // material is carried through the reseal. Each canonical entry maps 1:1
  // onto the T005A declaration shape, so it is rebuilt as a
  // { owner, declaration } binding over the exact owner component of the
  // digest-verified graph snapshot; `sealRuntimeAssembly` re-validates and
  // re-canonicalizes, yielding byte-identical record material. An owner
  // absent from the verified graph snapshot is impossible for a genuine seal
  // and fails closed typed rather than dropping the material.
  const resourceRequirements: readonly RuntimeAssemblyResourceRequirementBinding[] =
    request.assemblyResourceRequirements.map((material) => {
      const owner: ComponentEnvelope | undefined = request.currentDefinitionGraph.components.find(
        (component) => component.componentId === material.componentId,
      );
      if (owner === undefined) {
        fail(
          'INVALID_BINDING_INPUT',
          `the sealed Assembly binds resource requirements to component "${material.componentId}", which is not a component of the current Definition graph snapshot — the successor reseal cannot faithfully carry §F material through a foreign graph`,
        );
      }
      return Object.freeze({
        owner,
        declaration: Object.freeze({
          componentId: material.componentId,
          requirements: material.requirements,
        }),
      });
    });
  const successorSlots: AssemblyImplementationBindingEvidence[] = [
    ...request.priorEvidenceSlots.filter(
      (slot) => slot.subject !== request.selection.providerComponentId,
    ),
    Object.freeze({
      subject: request.selection.providerComponentId,
      bindingDigest,
    }) satisfies AssemblyImplementationBindingEvidence,
  ];
  const successorAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: request.currentDefinitionGraph,
      kindImplementations: request.assemblyBindings,
      resourceRequirements,
      implementationBindingEvidence: successorSlots,
      claimedDefinitionGraphDigest: definitionGraphDigest,
    },
    request.sha256,
  );

  const evidence: ToolImplementationBindingEvidence = Object.freeze({
    status: 'BOUND' as const,
    definitionGraphDigest,
    assemblyDigest: successorAssembly.assemblyDigest,
    toolComponentId: request.selection.providerComponentId,
    providesCapability: request.selection.requiredCapability,
    implementation: chosen.implementation,
    supportedOperations: request.boundOperations,
    bindingDigest,
  });

  const sealed = Object.freeze({
    evidence,
    successorAssembly,
    implementationHandle: chosen.hasHandle ? chosen.handle : undefined,
    [SEALED_TOOL_BINDING_BRAND]: true as const,
  });
  // #640 A1: `bindToolImplementation` remains the ONLY mint path and
  // registers the final frozen sealed binding exactly once before return.
  SEALED_TOOL_BINDING_MINTS.add(sealed);
  return sealed;
}

// ---------------------------------------------------------------------------
// Consumer-verifiable authenticity/currentness seam (#640; #589 §A A1–A5)
// ---------------------------------------------------------------------------

/**
 * Read-only synchronous mint-membership verifier/type guard (#589 §A A1 —
 * the T002B `isSealedRuntimeAssembly` precedent). The module-private WeakSet
 * mint registry is the authoritative test — it cannot be satisfied by
 * prototype inheritance or symbol reflection, since only
 * `bindToolImplementation` ever adds a member. The unique-symbol brand is
 * kept as defense in depth, but consulted as an OWN property only
 * (`Object.hasOwn`), so a brand value inherited through a forged prototype
 * chain or stolen by symbol reflection contributes nothing: brand, property
 * shape and copied field values alone are never sufficient.
 *
 * The guard can never be used to mint or forge a member; consumers (T003E
 * closure, T004B admission) rely on it to prove a caller-supplied binding is
 * a genuine `bindToolImplementation` mint before any authority use.
 */
export function isSealedToolImplementationBinding(
  value: unknown,
): value is SealedToolImplementationBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    SEALED_TOOL_BINDING_MINTS.has(value) &&
    Object.hasOwn(value, SEALED_TOOL_BINDING_BRAND) &&
    (value as Record<typeof SEALED_TOOL_BINDING_BRAND, unknown>)[SEALED_TOOL_BINDING_BRAND] === true
  );
}

/**
 * Fresh frozen, non-aliased verified currentness material (#589 §A A3.5):
 * carries the exact Definition identity, the CURRENT final Assembly digest,
 * the exact T003C subject and the exact verified bindingDigest. No handle,
 * provider object or invocation field is representable.
 */
export interface VerifiedToolImplementationCurrentness {
  readonly status: 'CURRENT';
  /** Exact Definition identity, equal to the verified evidence's graph digest. */
  readonly definitionGraphDigest: ContentDigest;
  /** Content digest of the exact current final Assembly currentness was decided against. */
  readonly finalAssemblyDigest: ContentDigest;
  /** The exact T003C subject (`evidence.toolComponentId`). */
  readonly subject: ComponentId;
  /** The exact verified bindingDigest matched in the final Assembly slot. */
  readonly bindingDigest: ContentDigest;
}

/**
 * Fresh frozen, non-aliased verified evidence: the descriptor-safe snapshot
 * of the verified evidence material plus the final-Assembly currentness
 * decided against the exact current final Assembly (#589 §A A2/A3). Never
 * carries a runtime handle.
 */
export interface VerifiedToolImplementationBindingEvidence {
  readonly status: 'VERIFIED';
  /** The verified evidence snapshot (v1 digest material + provenance fields). */
  readonly evidence: ToolImplementationBindingEvidence;
  /** The verified final-Assembly currentness. */
  readonly currentness: VerifiedToolImplementationCurrentness;
}

/** Input of the T003C-owned evidence verifier (#589 §A A2). */
export interface VerifyToolImplementationBindingEvidenceInput {
  /**
   * The authority-bearing evidence material to verify. Descriptor-safely
   * snapshotted synchronously before the first `await`; unsafe hidden or
   * accessor structure fails the deterministic invalid-input taxonomy before
   * evidence verification, and malformed/non-canonical/digest-mismatching
   * material fails `TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH`.
   */
  readonly evidence: unknown;
  /** The exact current final sealed Assembly (genuine T002B mint). */
  readonly finalAssembly: SealedRuntimeAssembly;
  /** The Sha256Port used for the authoritative v1 digest recomputation. */
  readonly sha256: Sha256Port;
}

/** Input of the binding verification path (#589 §A A4). */
export interface VerifyToolImplementationBindingInput {
  /** The exact sealed binding to verify — must be a module-private mint. */
  readonly binding: SealedToolImplementationBinding;
  /** The exact current final sealed Assembly (genuine T002B mint). */
  readonly finalAssembly: SealedRuntimeAssembly;
  /**
   * Optional consumer-supplied exact implementation pin (all three identity
   * fields) that must equal the verified evidence pin exactly; a mismatch
   * fails `TOOL_IMPLEMENTATION_PIN_MISMATCH`. Never resolved against
   * candidates, ordering, latest or any other lookup.
   */
  readonly expectedImplementationPin?: ToolImplementationIdentity;
  /** The Sha256Port used for the authoritative v1 digest recomputation. */
  readonly sha256: Sha256Port;
}

/**
 * Fresh frozen, non-aliased verified binding (#589 §A A4): the verified
 * evidence and currentness material, plus the ORIGINAL opaque runtime
 * implementation handle reference — exposed/paired only after mint, evidence,
 * final-slot and exact-pin verification all succeeded. The handle remains
 * outside every semantic digest and never supplies authority/currentness.
 */
export interface VerifiedToolImplementationBinding {
  readonly status: 'VERIFIED_CURRENT';
  /** The verified evidence snapshot (never carries the handle). */
  readonly evidence: ToolImplementationBindingEvidence;
  /** The verified final-Assembly currentness. */
  readonly currentness: VerifiedToolImplementationCurrentness;
  /** The original opaque handle reference, paired after full verification. */
  readonly implementationHandle: unknown;
}

/** Deep descriptor-safe structure capture: presence/type stay data, unsafe structure fails. */
function captureDescriptorSafeStructure(value: unknown, description: string): unknown {
  if (Array.isArray(value)) {
    const entries = requireSafeArray(value, description);
    return Object.freeze(entries.map((entry, index) => captureDescriptorSafeStructure(entry, `${description}[${index}]`)));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const view = requireSafeRecord(value, description);
  const captured: Record<string, unknown> = {};
  for (const key of Object.keys(view)) {
    captured[key] = captureDescriptorSafeStructure(view[key], `${description}.${key}`);
  }
  return Object.freeze(captured);
}

/** Evidence material content check: non-empty content digest or typed mismatch. */
function requireEvidenceDigest(value: unknown, path: string): ContentDigest {
  if (typeof value !== 'string' || !isContentDigest(value)) {
    fail(
      'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
      `${path} must be a non-empty content digest string (malformed evidence material fails closed)`,
    );
  }
  return value;
}

/** Evidence material content check: exact non-floating identity or typed mismatch. */
function requireEvidenceIdentity(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    fail('TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH', `${path} must be a string`);
  }
  if (!isNonEmptyIdentityString(value)) {
    fail('TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH', `${path} must be a non-empty exact identity`);
  }
  if (carriesEmbeddedSelector(value) || carriesFloatingOrRangeSemantics(value)) {
    fail(
      'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
      `${path} must be an exact identity, never an embedded selector or floating/range form`,
    );
  }
  return value;
}

/** Evidence material content check: exact closed `{capabilityId, version}` ref or typed mismatch. */
function requireEvidenceCapabilityRef(value: unknown, path: string): CapabilityContractRef {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH', `${path} must contain exactly {capabilityId, version}`);
  }
  const view = value as Record<string, unknown>;
  const keys = Object.keys(view).sort();
  if (keys.length !== 2 || !keys.includes('capabilityId') || !keys.includes('version')) {
    fail('TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH', `${path} must contain exactly {capabilityId, version}`);
  }
  const capabilityId = requireEvidenceIdentity(view.capabilityId, `${path}.capabilityId`);
  const version = requireEvidenceIdentity(view.version, `${path}.version`);
  if (carriesXRangeVersionSemantics(version)) {
    fail(
      'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
      `${path}.version must be an exact version, never an x-range/partial form`,
    );
  }
  return Object.freeze({ capabilityId, version });
}

/** Evidence material content check: exact closed implementation pin or typed mismatch. */
function requireEvidenceImplementation(value: unknown, path: string): ToolImplementationIdentity {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(
      'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
      `${path} must contain exactly {implementationId, implementationVersion, implementationDigest}`,
    );
  }
  const view = value as Record<string, unknown>;
  const keys = Object.keys(view).sort();
  if (
    keys.length !== 3 ||
    !keys.includes('implementationId') ||
    !keys.includes('implementationVersion') ||
    !keys.includes('implementationDigest')
  ) {
    fail(
      'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
      `${path} must contain exactly {implementationId, implementationVersion, implementationDigest}; unexpected or missing field (module paths, provider objects and function identity are never part of a Tool implementation pin)`,
    );
  }
  const implementationId = requireEvidenceIdentity(view.implementationId, `${path}.implementationId`);
  const implementationVersion = requireEvidenceIdentity(
    view.implementationVersion,
    `${path}.implementationVersion`,
  );
  if (carriesXRangeVersionSemantics(implementationVersion)) {
    fail(
      'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
      `${path}.implementationVersion must be an exact version, never an x-range/partial form`,
    );
  }
  const implementationDigest = requireEvidenceDigest(
    view.implementationDigest,
    `${path}.implementationDigest`,
  );
  return Object.freeze({ implementationId, implementationVersion, implementationDigest });
}

/**
 * Evidence material content check: exact operation identities, duplicate-free
 * and ALREADY order-normalized (strictly ascending) — the accepted v1
 * material is canonical, so an unsorted or duplicated set is a typed
 * mismatch, never silently re-normalized.
 */
function requireEvidenceOperations(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    fail('TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH', `${path} must be an order-normalized operation identity array`);
  }
  const seen = new Set<string>();
  const operations = value.map((entry, index) => {
    const operation = requireEvidenceIdentity(entry, `${path}[${index}]`);
    if (seen.has(operation)) {
      fail(
        'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
        `${path}[${index}] declares ${operation} more than once (duplicate operations are malformed evidence material)`,
      );
    }
    seen.add(operation);
    return operation;
  });
  let previous: string | undefined;
  for (const operation of operations) {
    if (previous !== undefined && lexicalCompare(previous, operation) !== -1) {
      fail(
        'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
        `${path} must be order-normalized (strictly ascending); unsorted operation material is never silently re-normalized`,
      );
    }
    previous = operation;
  }
  return Object.freeze([...operations]);
}

/**
 * Validate the captured evidence structure against the exact closed accepted
 * v1 material and freeze it as fresh non-aliased evidence. Every deviation
 * (unknown/missing field, wrong status, non-digest, floating ref, non-sorted
 * operations) fails `TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH`
 * deterministically (#589 §A A2).
 */
function validateAndFreezeEvidenceMaterial(
  captured: unknown,
  at: string,
): ToolImplementationBindingEvidence {
  if (captured === null || typeof captured !== 'object' || Array.isArray(captured)) {
    fail('TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH', `${at} must be a record carrying the exact closed v1 evidence material`);
  }
  const view = captured as Record<string, unknown>;
  const keys = Object.keys(view).sort().join(',');
  if (
    keys !==
    'assemblyDigest,bindingDigest,definitionGraphDigest,implementation,providesCapability,status,supportedOperations,toolComponentId'
  ) {
    fail(
      'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
      `${at} must contain exactly {status, definitionGraphDigest, assemblyDigest, toolComponentId, providesCapability, implementation, supportedOperations, bindingDigest}; unexpected, missing or renamed field`,
    );
  }
  if (view.status !== 'BOUND') {
    fail('TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH', `${at}.status must be exactly 'BOUND'`);
  }
  const definitionGraphDigest = requireEvidenceDigest(view.definitionGraphDigest, `${at}.definitionGraphDigest`);
  const assemblyDigest = requireEvidenceDigest(view.assemblyDigest, `${at}.assemblyDigest`);
  const toolComponentId = requireEvidenceIdentity(view.toolComponentId, `${at}.toolComponentId`);
  const providesCapability = requireEvidenceCapabilityRef(view.providesCapability, `${at}.providesCapability`);
  const implementation = requireEvidenceImplementation(view.implementation, `${at}.implementation`);
  const supportedOperations = requireEvidenceOperations(view.supportedOperations, `${at}.supportedOperations`);
  const bindingDigest = requireEvidenceDigest(view.bindingDigest, `${at}.bindingDigest`);
  return Object.freeze({
    status: 'BOUND' as const,
    definitionGraphDigest,
    assemblyDigest,
    toolComponentId,
    providesCapability,
    implementation,
    supportedOperations,
    bindingDigest,
  });
}

/**
 * Synchronously snapshot the exact current final Assembly material for
 * currentness verification. Final-Assembly authenticity remains T002B-owned:
 * the input must be a genuine `sealRuntimeAssembly` mint, proven through the
 * accepted read-only T002B guard (never re-derived here). The record digest
 * material and the §G evidence slots are descriptor-safe captured as fresh
 * frozen identity material; unsafe structure fails the deterministic
 * invalid-input taxonomy before evidence verification (#589 §A A2/A5).
 */
function snapshotFinalAssemblyMaterial(value: unknown): {
  readonly assemblyDigest: ContentDigest;
  readonly definitionGraphDigest: ContentDigest;
  readonly slots: readonly AssemblyImplementationBindingEvidence[];
} {
  const at = 'verification input.finalAssembly';
  if (typeof value !== 'object' || value === null) {
    fail('INVALID_BINDING_INPUT', `${at} must be a SealedRuntimeAssembly ({ record, assemblyDigest, ... })`);
  }
  if (!isSealedRuntimeAssembly(value)) {
    fail(
      'INVALID_BINDING_INPUT',
      `${at} must be a SealedRuntimeAssembly minted by sealRuntimeAssembly — final-Assembly authenticity remains T002B-owned and a caller-constructed lookalike can never supply currentness authority`,
    );
  }
  const recordValue = readAssemblyOwnDataProperty(value, 'record');
  const assemblyDigest = readAssemblyOwnDataProperty(value, 'assemblyDigest');
  const recordView = requireSafeRecord(recordValue, `${at}.record`);
  if (
    !('definitionGraphDigest' in recordView) ||
    !('implementationBindingEvidence' in recordView)
  ) {
    fail('INVALID_BINDING_INPUT', `${at}.record must carry definitionGraphDigest and implementationBindingEvidence`);
  }
  if (typeof assemblyDigest !== 'string' || !isContentDigest(assemblyDigest)) {
    fail('INVALID_BINDING_INPUT', `${at}.assemblyDigest must be a non-empty content digest string`);
  }
  const definitionGraphDigest = recordView.definitionGraphDigest;
  if (typeof definitionGraphDigest !== 'string' || !isContentDigest(definitionGraphDigest)) {
    fail('INVALID_BINDING_INPUT', `${at}.record.definitionGraphDigest must be a non-empty content digest string`);
  }
  const slots = snapshotEvidenceSlots(
    recordView.implementationBindingEvidence,
    `${at}.record.implementationBindingEvidence`,
  );
  return Object.freeze({ assemblyDigest, definitionGraphDigest, slots });
}

/**
 * Decide final-Assembly currentness (#589 §A A3) — only reached after the
 * evidence digest has been verified. The exact subject slot is located by
 * exact subject identity (`subject === evidence.toolComponentId`) with NO
 * first/latest/default/order/alias fallback; the slot digest and the final
 * Assembly's Definition identity must match the evidence exactly. The
 * historical mint-time `evidence.assemblyDigest` is deliberately never
 * compared to the final Assembly digest: it remains provenance, and a
 * faithful later reseal that preserves the binding slot stays CURRENT.
 */
function decideFinalAssemblyCurrentness(
  evidence: ToolImplementationBindingEvidence,
  finalAssembly: ReturnType<typeof snapshotFinalAssemblyMaterial>,
): VerifiedToolImplementationCurrentness {
  const matches = finalAssembly.slots.filter(
    (slot) => slot.subject === evidence.toolComponentId,
  );
  if (matches.length === 0) {
    fail(
      'MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING',
      `the current final Assembly carries no implementation-binding evidence slot for subject "${evidence.toolComponentId}" — a missing slot is never repaired by another subject's slot, an alias, an ordering position or the historical mint-time assemblyDigest`,
    );
  }
  const subjectSlot = matches[0];
  if (
    matches.length > 1 ||
    subjectSlot === undefined ||
    subjectSlot.bindingDigest !== evidence.bindingDigest
  ) {
    fail(
      'STALE_TOOL_IMPLEMENTATION_BINDING',
      `the current final Assembly's slot for subject "${evidence.toolComponentId}" does not carry the verified bindingDigest — a replaced slot fails closed; no historical Assembly lookup or mutable alias repairs it`,
    );
  }
  if (finalAssembly.definitionGraphDigest !== evidence.definitionGraphDigest) {
    fail(
      'STALE_TOOL_IMPLEMENTATION_BINDING',
      "the current final Assembly's Definition identity no longer matches the verified evidence's DefinitionGraphDigest — a binding over a different graph is stale and fails closed",
    );
  }
  return Object.freeze({
    status: 'CURRENT' as const,
    definitionGraphDigest: evidence.definitionGraphDigest,
    finalAssemblyDigest: finalAssembly.assemblyDigest,
    subject: evidence.toolComponentId,
    bindingDigest: evidence.bindingDigest,
  });
}

/**
 * Shared T003C-owned evidence/currentness verification core (#589 §A A2/A3):
 * validates the exact closed v1 material, recomputes the accepted v1
 * `bindingDigest` with T003C-owned semantics (consumers never copy the
 * algorithm), then decides currentness against the exact current final
 * Assembly. Only module-owned snapshot material is read; the single `await`
 * is the digest recomputation.
 */
async function verifyEvidenceAndCurrentness(
  capturedEvidence: unknown,
  finalAssembly: ReturnType<typeof snapshotFinalAssemblyMaterial>,
  sha256: Sha256Port,
): Promise<{ readonly evidence: ToolImplementationBindingEvidence; readonly currentness: VerifiedToolImplementationCurrentness }> {
  const evidence = validateAndFreezeEvidenceMaterial(capturedEvidence, 'verification input.evidence');
  const recomputedBindingDigest = await computeCanonicalJsonDigest(
    {
      digestDomain: TOOL_IMPLEMENTATION_BINDING_EVIDENCE_DOMAIN,
      definitionGraphDigest: evidence.definitionGraphDigest,
      toolComponentId: evidence.toolComponentId,
      providesCapability: evidence.providesCapability,
      implementation: evidence.implementation,
      supportedOperations: evidence.supportedOperations,
    },
    sha256,
  );
  if (recomputedBindingDigest !== evidence.bindingDigest) {
    fail(
      'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
      'the recomputed accepted v1 bindingDigest does not equal evidence.bindingDigest — tampered, non-canonical or foreign evidence material fails closed deterministically',
    );
  }
  return Object.freeze({
    evidence,
    currentness: decideFinalAssemblyCurrentness(evidence, finalAssembly),
  });
}

/**
 * The T003C-owned consumer evidence verifier (#640; #589 §A A2): owns ALL
 * parsing/canonicalization/digest reconstruction for
 * `ToolImplementationBindingEvidence`. T003E/T004B call this seam and never
 * copy the digest algorithm.
 *
 * Pipeline: descriptor-safe structure capture of the evidence and the exact
 * final Assembly material synchronously before the first `await` (unsafe
 * hidden/accessor structure fails INVALID_BINDING_INPUT here, with zero
 * getter executions); exact closed v1 material validation
 * (`TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH`); authoritative v1 digest
 * recomputation and exact-equality check; then final-Assembly currentness by
 * exact Definition identity, exact subject slot and exact bindingDigest match
 * (missing → `MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING`, replaced/foreign
 * → `STALE_TOOL_IMPLEMENTATION_BINDING`). The returned evidence and
 * currentness are fresh frozen and non-aliased; `evidence.assemblyDigest`
 * remains historical provenance and is never compared to the final Assembly.
 */
export async function verifyToolImplementationBindingEvidence(
  input: VerifyToolImplementationBindingEvidenceInput,
): Promise<VerifiedToolImplementationBindingEvidence> {
  const inputView = requireSafeRecord(input, 'verification input');
  const unexpectedField = Object.keys(inputView).find(
    (key) => key !== 'evidence' && key !== 'finalAssembly' && key !== 'sha256',
  );
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_BINDING_INPUT',
      `verification input must not carry unknown field "${unexpectedField}"`,
    );
  }
  if (!('evidence' in inputView)) {
    fail('INVALID_BINDING_INPUT', 'verification input.evidence is required');
  }
  if (!('finalAssembly' in inputView)) {
    fail('INVALID_BINDING_INPUT', 'verification input.finalAssembly is required');
  }
  // Synchronous snapshot phase — nothing caller-owned is read after the
  // digest recomputation suspension (#589 §A A5).
  const capturedEvidence = captureDescriptorSafeStructure(
    inputView.evidence,
    'verification input.evidence',
  );
  const finalAssembly = snapshotFinalAssemblyMaterial(inputView.finalAssembly);
  const sha256 = requireSha256Port(inputView.sha256, 'verification input.sha256');

  const verified = await verifyEvidenceAndCurrentness(capturedEvidence, finalAssembly, sha256);
  return Object.freeze({
    status: 'VERIFIED' as const,
    evidence: verified.evidence,
    currentness: verified.currentness,
  });
}

/**
 * The T003C binding verification path over the exact
 * `SealedToolImplementationBinding` object (#640; #589 §A A4): first proves
 * module-private mint membership (`UNMINTED_TOOL_IMPLEMENTATION_BINDING`),
 * then verifies the embedded evidence with the A2/A3 semantics against the
 * exact current final Assembly, then requires any consumer-supplied expected
 * exact implementation pin to equal the verified evidence pin exactly
 * (`TOOL_IMPLEMENTATION_PIN_MISMATCH`) — only then is the ORIGINAL opaque
 * `implementationHandle` reference paired with the fresh verified evidence.
 *
 * The handle, module path, function identity and registry objects remain
 * outside every semantic digest and never supply authority/currentness; no
 * lookup by implementation id, registry order, latest/default or first match
 * exists. Torn-snapshot discipline (#589 §A A5): all authority material is
 * synchronously snapshotted before the first `await`, and the returned
 * structures are fresh frozen and non-aliased.
 */
export async function verifyToolImplementationBinding(
  input: VerifyToolImplementationBindingInput,
): Promise<VerifiedToolImplementationBinding> {
  const inputView = requireSafeRecord(input, 'verification input');
  const unexpectedField = Object.keys(inputView).find(
    (key) =>
      key !== 'binding' && key !== 'finalAssembly' && key !== 'expectedImplementationPin' && key !== 'sha256',
  );
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_BINDING_INPUT',
      `verification input must not carry unknown field "${unexpectedField}"`,
    );
  }
  if (!('binding' in inputView)) {
    fail('INVALID_BINDING_INPUT', 'verification input.binding is required');
  }
  if (!('finalAssembly' in inputView)) {
    fail('INVALID_BINDING_INPUT', 'verification input.finalAssembly is required');
  }

  // A4 step 1: module-private mint membership is the authoritative
  // authenticity test. Brand/property shape alone is never sufficient.
  const bindingValue: unknown = inputView.binding;
  if (typeof bindingValue !== 'object' || bindingValue === null) {
    fail('INVALID_BINDING_INPUT', 'verification input.binding must be a SealedToolImplementationBinding object');
  }
  if (!isSealedToolImplementationBinding(bindingValue)) {
    fail(
      'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
      'verification input.binding is not a member of the module-private bindToolImplementation mint registry — a hand-built, field-copied, symbol-stolen or deserialized lookalike can never carry binding authority',
    );
  }
  const binding: SealedToolImplementationBinding = bindingValue;

  // Synchronous snapshot phase — everything authority-bearing is captured
  // before the first `await` (#589 §A A5).
  const capturedEvidence = captureDescriptorSafeStructure(
    binding.evidence,
    'verification input.binding.evidence',
  );
  const finalAssembly = snapshotFinalAssemblyMaterial(inputView.finalAssembly);
  const expectedPin =
    inputView.expectedImplementationPin === undefined
      ? undefined
      : snapshotImplementationIdentity(
          inputView.expectedImplementationPin,
          'verification input.expectedImplementationPin',
        );
  const sha256 = requireSha256Port(inputView.sha256, 'verification input.sha256');

  // A4 step 2: embedded evidence verification (A2) + final-Assembly
  // currentness (A3) against the exact current final Assembly.
  const verified = await verifyEvidenceAndCurrentness(capturedEvidence, finalAssembly, sha256);

  // A4 step 3: any consumer-supplied expected exact pin must equal the
  // verified evidence pin exactly — all three identity fields, never resolved
  // against candidates, ordering or latest.
  if (expectedPin !== undefined) {
    const evidencePin = verified.evidence.implementation;
    if (
      expectedPin.implementationId !== evidencePin.implementationId ||
      expectedPin.implementationVersion !== evidencePin.implementationVersion ||
      expectedPin.implementationDigest !== evidencePin.implementationDigest
    ) {
      fail(
        'TOOL_IMPLEMENTATION_PIN_MISMATCH',
        `the consumer-supplied expected exact implementation pin (implementationId=${expectedPin.implementationId} version=${expectedPin.implementationVersion}) does not equal the verified evidence pin (implementationId=${evidencePin.implementationId} version=${evidencePin.implementationVersion}) — the pin is never resolved against candidates, ordering, latest or first match`,
      );
    }
  }

  // A4 step 4: only now is the original opaque handle reference paired.
  return Object.freeze({
    status: 'VERIFIED_CURRENT' as const,
    evidence: verified.evidence,
    currentness: verified.currentness,
    implementationHandle: binding.implementationHandle,
  });
}
