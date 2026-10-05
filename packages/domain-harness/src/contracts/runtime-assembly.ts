/**
 * v0.7 sealed Runtime Assembly core contract (issue #587, fine-grained DAG
 * T002B; closes #568 and #575 by implementation + review).
 *
 * This module is the Microkernel seam between the frozen Definition plane
 * (Component/Definition identity, T001A-T001C) and trusted closed-world Kind
 * implementation handles. It owns exactly the concerns #587 assigns to T002B:
 *
 * - a content-addressed, serializable RuntimeAssemblyRecord: the exact
 *   Definition graph digest, the exact KindImplementation pins, the canonical
 *   #568 logical resource requirement material, and generic §G
 *   implementation-binding evidence slots;
 * - the exact KindImplementationPin identity (kind + implementation
 *   id/version/digest). Module paths, provider paths, function source text
 *   and live handles are NEVER digest material;
 * - `sealRuntimeAssembly`, the authority boundary that validates and
 *   synchronously snapshots every authority-bearing input, derives the
 *   low-level admission declarations from the SEALED bindings, and mints
 *   opaque/frozen sealed bindings paired with their exact pins;
 * - `admitComponentWithAssembly`, the Assembly-bound admission path that
 *   consumes the sealed binding (never a caller-supplied validator), proves
 *   Definition currentness by authoritative recomputation, and mints frozen,
 *   non-aliasing AssemblyBoundComponentAdmission evidence.
 *
 * Deliberately absent (successor-owned, per #587): activation/execution pins
 * (T002C), PRODUCTION|SIMULATION authority class enforcement (T002D), Tool
 * provider selection/implementation binding semantics (T003C — this module
 * provides only the generic content-addressed evidence container), resource
 * resolution (T005B), resource instance pins (T005C), and any public barrel
 * exposure (T001E/#570). A sealed Assembly carries identity and admission
 * provenance only — ASSEMBLY_SEALED=YES, ACTIVATION_AUTHORITY=NO,
 * DURABLE_EFFECT_AUTHORITY=NO.
 *
 * Boundary discipline: validation consumes the shared descriptor-safe record
 * primitive and unified exact-reference authority of `record-safety.ts`
 * (#557 + #578), the #573 frozen Kind-compatibility decision, the #556
 * low-level `admitComponent` decision helper, the T005A declaration
 * validator, and the #555 repaired Definition graph digest — all imported,
 * never reimplemented. No global Kind catalog or registry exists here, and
 * no concrete Workflow/XState/ToolRegistry/storage/provider import is
 * permitted in this file.
 *
 * Torn-snapshot discipline (#587 §E, same as #555): every authority-bearing
 * caller input is descriptor-safe validated and snapshotted synchronously
 * before the first `await`; after any suspension only module-owned snapshot
 * material is read, so a caller mutating its own graph, pins or declarations
 * while a digest promise is pending can never produce torn or hybrid
 * Assembly evidence.
 */
import {
  validateComponentEnvelope,
  type CapabilityContractRef,
  type ComponentEnvelope,
  type ComponentId,
  type KindRef,
  type SemanticContractRef,
} from './component.js';
import {
  admitComponent,
  type ComponentKindValidator,
  type UnderstoodKindDeclaration,
} from './component-admission.js';
import {
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
} from './definition-graph.js';
import {
  decideKindCompatibility,
  KindCompatibilityError,
} from './kind-compatibility.js';
import {
  computeCanonicalJsonDigest,
  isContentDigest,
  type ContentDigest,
  type Sha256Port,
} from './identity.js';
import {
  validateToolResourceRequirements,
  type ResourceContractRef,
  type ToolResourceRequirementsDeclaration,
} from './resource-requirements.js';
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
 * Versioned Runtime Assembly digest domain tag, owned exclusively by this
 * file. Sibling to, and never borrowed by, the T001B/T001C digest domains:
 * any future change to the material shape is a NEW domain tag; historical
 * Assembly identities never change retroactively.
 */
export const RUNTIME_ASSEMBLY_DIGEST_DOMAIN = 'kaicreator.runtime-assembly.digest.v1';

/**
 * Fail-closed Runtime Assembly failure taxonomy (#587). Every failure is
 * typed and terminal — none carries or suggests a substitute/default/latest
 * resolution, and no diagnostic ever serializes validator functions, secret
 * values or live handles (only exact identity strings participate).
 */
export type RuntimeAssemblyErrorCode =
  | 'INVALID_ASSEMBLY_INPUT'
  | 'DEFINITION_CURRENTNESS_MISMATCH'
  | 'MISSING_KIND_IMPLEMENTATION'
  | 'AMBIGUOUS_KIND_IMPLEMENTATION'
  | 'INCOMPATIBLE_KIND_IMPLEMENTATION'
  | 'INVALID_IMPLEMENTATION_PIN'
  | 'INVALID_RESOURCE_REQUIREMENT_IDENTITY'
  | 'DUPLICATE_BINDING_EVIDENCE'
  | 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND'
  | 'ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH';

export class RuntimeAssemblyError extends Error {
  readonly code: RuntimeAssemblyErrorCode;

  constructor(code: RuntimeAssemblyErrorCode, message: string) {
    super(message);
    this.name = 'RuntimeAssemblyError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Exact KindImplementation pin identity (#587 §B)
// ---------------------------------------------------------------------------

/**
 * Exact, immutable identity of one bound Kind implementation. `kind` is the
 * exact required/admitted KindRef; implementation id/version are exact opaque
 * identities (never ranges/floating selectors); `implementationDigest` is a
 * valid content digest of the exact implementation content/artifact. Module
 * paths, provider paths and function source text are NOT authority identity.
 */
export interface KindImplementationPin {
  /** The exact required/admitted KindRef this implementation is bound to. */
  readonly kind: KindRef;
  /** Exact opaque implementation identity — never a range/floating selector. */
  readonly implementation: {
    readonly implementationId: string;
    readonly implementationVersion: string;
    readonly implementationDigest: ContentDigest;
  };
}

/**
 * Sealing input for one exact KindImplementation: the exact pin, the exact
 * semantic/capability contracts understood for that Kind, and the trusted
 * closed-world validator handle. The raw caller-provided declaration is
 * validated and snapshotted at sealing; only the SEALED binding derived from
 * it can ever authorize an admission (#575 closure).
 */
export interface KindImplementationBindingInput {
  readonly pin: KindImplementationPin;
  readonly understoodSemanticContracts: readonly SemanticContractRef[];
  readonly understoodCapabilities: readonly CapabilityContractRef[];
  readonly validateComponent: ComponentKindValidator;
}

// ---------------------------------------------------------------------------
// #568 canonical logical resource requirement material (§F)
// ---------------------------------------------------------------------------

/**
 * Canonical Assembly identity material of one logical resource requirement:
 * exactly the five normative #568/#587§F fields. Secret values, credentials,
 * live handles, connection objects, host lookups and provider objects are
 * structurally unrepresentable.
 */
export interface AssemblyResourceRequirement {
  /** Stable exact logical Runtime Resource identity. */
  readonly resourceKey: string;
  /** Optional exact/versioned resource semantic contract. */
  readonly contract?: ResourceContractRef;
  /** Optional exact narrowing to one operation of the owner. */
  readonly operationId?: string;
  /** Mandatory explicit criticality boolean — no default, no coercion. */
  readonly required: boolean;
}

/** Canonical identity material of one owner's logical resource requirements. */
export interface AssemblyResourceRequirementsMaterial {
  /** Exact owner Tool Component logical identity. */
  readonly componentId: ComponentId;
  /** Order-normalized requirements (sorted by exact resourceKey). */
  readonly requirements: readonly AssemblyResourceRequirement[];
}

/** Binding of a T005A declaration to its exact owner for sealing. */
export interface RuntimeAssemblyResourceRequirementBinding {
  /** The owner Tool Component (validated compositionally by T005A). */
  readonly owner: ComponentEnvelope;
  /** The T005A logical resource requirements declaration of that owner. */
  readonly declaration: ToolResourceRequirementsDeclaration;
}

// ---------------------------------------------------------------------------
// §G generic implementation-binding evidence slot
// ---------------------------------------------------------------------------

/**
 * Generic immutable content-addressed implementation-binding evidence slot
 * (#587 §G). Exact-identity-only and opaque to the kernel: T002B never
 * selects a Tool provider, chooses a Tool implementation, inspects Tool
 * operation semantics or queries a registry — T003C is the sole owner of
 * minting Tool-specific authoritative binding evidence and populating these
 * slots.
 */
export interface AssemblyImplementationBindingEvidence {
  /** Exact opaque binding-subject identity; unique within one Assembly. */
  readonly subject: string;
  /** Content digest of the exact binding evidence material. */
  readonly bindingDigest: ContentDigest;
}

// ---------------------------------------------------------------------------
// Sealing input, record and sealed assembly (§A separation)
// ---------------------------------------------------------------------------

/** Complete sealing input. All authority-bearing material is synchronously
 * snapshot at sealing; the caller's objects are never frozen or mutated. */
export interface SealRuntimeAssemblyInput {
  /** The live Definition graph the Assembly is sealed over. */
  readonly definitionGraph: DefinitionGraphEnvelope;
  /** Exact KindImplementation bindings; one per exact required/admitted Kind. */
  readonly kindImplementations: readonly KindImplementationBindingInput[];
  /** Optional T005A logical resource requirement bindings (#568 closure). */
  readonly resourceRequirements?: readonly RuntimeAssemblyResourceRequirementBinding[];
  /** Optional §G generic implementation-binding evidence slots. */
  readonly implementationBindingEvidence?: readonly AssemblyImplementationBindingEvidence[];
  /**
   * Optional caller-claimed Definition graph digest. Never trusted blindly:
   * the authoritative path recomputes the digest from the supplied graph and
   * any mismatch fails closed with DEFINITION_CURRENTNESS_MISMATCH.
   */
  readonly claimedDefinitionGraphDigest?: ContentDigest;
}

/**
 * Serializable, content-addressed Runtime Assembly authority identity. This
 * object IS the assemblyDigest material: exactly the versioned domain tag,
 * the exact Definition graph digest, the exact KindImplementation pins
 * (order-normalized), the canonical #568 resource requirement material
 * (order-normalized), and the §G evidence slots (order-normalized). No
 * function, handle, secret or runtime identity is representable here.
 */
export interface RuntimeAssemblyRecord {
  readonly digestDomain: typeof RUNTIME_ASSEMBLY_DIGEST_DOMAIN;
  /** Exact Definition graph semantic digest this Assembly is bound to. */
  readonly definitionGraphDigest: ContentDigest;
  /** Exact KindImplementation pins, sorted by exact Kind identity. */
  readonly kindImplementations: readonly KindImplementationPin[];
  /** Canonical logical resource requirement material, sorted by componentId. */
  readonly resourceRequirements: readonly AssemblyResourceRequirementsMaterial[];
  /** Generic implementation-binding evidence slots, sorted by subject. */
  readonly implementationBindingEvidence: readonly AssemblyImplementationBindingEvidence[];
}

/**
 * Opaque frozen binding of one exact KindImplementation pin to its trusted
 * closed-world validator handle. Minted only by `sealRuntimeAssembly`; the
 * validator is runtime authority ONLY through the Assembly-bound admission
 * path, never as raw caller input.
 */
export interface SealedKindImplementationBinding {
  readonly pin: KindImplementationPin;
  readonly understoodSemanticContracts: readonly SemanticContractRef[];
  readonly understoodCapabilities: readonly CapabilityContractRef[];
  readonly validateComponent: ComponentKindValidator;
}

/**
 * Private anti-forgery brand. The `unique symbol` computed key is not
 * exported, so no external code can construct a value satisfying
 * `SealedRuntimeAssembly`; `admitComponentWithAssembly` verifies the brand
 * before any authority use, closing the #575 raw-validator minting path.
 */
const SEALED_ASSEMBLY_BRAND: unique symbol = Symbol('kaicreator.runtime-assembly.sealed');

/**
 * Module-private minting registry: the authoritative anti-forgery check. A
 * property-style brand alone is bypassable — it is readable through the
 * prototype chain (Object.create forgery) and the symbol is reflectively
 * extractable from any self-sealed assembly (getOwnPropertySymbols theft),
 * and the record/digest an attacker pairs with it are public serializable
 * identity material by design (#587 §A). WeakSet membership is neither
 * inheritable, reflectively extractable, nor reproducible from public
 * material: only `sealRuntimeAssembly` can mint a member, so only a sealed
 * Assembly can ever authorize an admission. The brand property is retained
 * as a secondary, own-property-only (Object.hasOwn) defense in depth.
 */
const SEALED_ASSEMBLY_MINTS = new WeakSet<object>();

/**
 * The sealed Runtime Assembly: the serializable record plus the assembly
 * digest and the trusted runtime binding handles associated with the exact
 * pins (#587 §A). Sealing grants identity and admission provenance only —
 * never activation, occurrence or effect authority (#587 §H).
 */
export interface SealedRuntimeAssembly {
  /** Serializable content-addressed authority identity (digest material). */
  readonly record: RuntimeAssemblyRecord;
  /** Content digest of the record — changes with any identity-material change. */
  readonly assemblyDigest: ContentDigest;
  /** Frozen sealed bindings, one per exact KindImplementation pin. */
  readonly bindings: readonly SealedKindImplementationBinding[];
  readonly [SEALED_ASSEMBLY_BRAND]: true;
}

// ---------------------------------------------------------------------------
// Assembly-bound admission evidence (#587 §D)
// ---------------------------------------------------------------------------

/**
 * Authoritative Assembly-bound Component admission evidence, minted only by
 * `admitComponentWithAssembly`. Binds the componentId, the exact
 * DefinitionGraphDigest/currentness, the assemblyDigest, the exact admitted
 * KindRef, the exact KindImplementationPin, and fresh immutable admitted
 * semantic/capability refs. Never retains caller-owned nested references and
 * is never confused with the lower-level ComponentAdmissionResult.
 */
export interface AssemblyBoundComponentAdmission {
  readonly status: 'ADMITTED';
  readonly componentId: ComponentId;
  readonly definitionGraphDigest: ContentDigest;
  readonly assemblyDigest: ContentDigest;
  readonly admittedKind: KindRef;
  readonly admittedKindImplementation: KindImplementationPin;
  readonly admittedSemanticContracts: readonly SemanticContractRef[];
  readonly admittedCapabilities: readonly CapabilityContractRef[];
}

/** Admission options: the current Definition graph and the Sha256Port. */
export interface AdmitComponentWithAssemblyOptions {
  /**
   * The current Definition graph. Its digest is authoritatively recomputed
   * and must equal the digest recorded in the sealed Assembly; any stale or
   * mismatching graph fails closed.
   */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  readonly sha256: Sha256Port;
}

// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------

/** Code-unit comparison only; `localeCompare` is forbidden in this module. */
function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Unambiguous composite key over an exact KindRef (`@` never occurs inside
 * exact identity strings — embedded selectors are rejected). */
function kindKey(ref: KindRef): string {
  return `${ref.kindId}@${ref.version}`;
}

/** Sort key making pins/declarations/evidence order-insensitive. */
function pinSortKey(pin: KindImplementationPin): string {
  return JSON.stringify([pin.kind.kindId, pin.kind.version]);
}

function fail(code: RuntimeAssemblyErrorCode, message: string): never {
  throw new RuntimeAssemblyError(code, message);
}

/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(
  value: unknown,
  description: string,
  code: RuntimeAssemblyErrorCode,
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
  code: RuntimeAssemblyErrorCode,
): unknown[] {
  const result = safeArraySnapshot(value, description);
  if (!result.ok) {
    fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function requireExactIdentityString(
  value: unknown,
  path: string,
  code: RuntimeAssemblyErrorCode,
): string {
  if (typeof value !== 'string') {
    fail(code, `${path} must be a string`);
  }
  if (!isNonEmptyIdentityString(value)) {
    fail(code, `${path} must be a non-empty exact identity`);
  }
  if (carriesEmbeddedSelector(value)) {
    fail(code, `${path} must not embed a version selector (\`id@version\`); use the exact version field`);
  }
  return value;
}

/** Rejects mutable selection tokens and range operators; never normalizes. */
function requireNonFloatingIdentity(value: string, path: string, code: RuntimeAssemblyErrorCode): void {
  if (carriesFloatingOrRangeSemantics(value)) {
    fail(
      code,
      `${path} must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)`,
    );
  }
}

/** Rejects floating/range/x-range version forms (`1.x`, `x`, `1.`). */
function requireExactVersion(value: string, path: string, code: RuntimeAssemblyErrorCode): void {
  if (carriesFloatingOrRangeSemantics(value) || carriesXRangeVersionSemantics(value)) {
    fail(
      code,
      `${path} must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)`,
    );
  }
}

/** Snapshot one exact `{idField, version}` reference as a fresh frozen object. */
function snapshotExactRef(
  value: unknown,
  path: string,
  idField: 'kindId' | 'contractId' | 'capabilityId',
  code: RuntimeAssemblyErrorCode,
): { id: string; version: string } {
  const candidate = requireSafeRecord(value, path, code);
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || !keys.includes(idField) || !keys.includes('version')) {
    fail(code, `${path} must contain exactly {${idField}, version}`);
  }
  const id = requireExactIdentityString(candidate[idField], `${path}.${idField}`, code);
  requireNonFloatingIdentity(id, `${path}.${idField}`, code);
  const version = requireExactIdentityString(candidate.version, `${path}.version`, code);
  requireNonFloatingIdentity(version, `${path}.version`, code);
  requireExactVersion(version, `${path}.version`, code);
  return { id, version };
}

/** Snapshot one exact ref collection: duplicates by id fail closed (never deduplicated). */
function snapshotExactRefCollection(
  value: unknown,
  description: string,
  idField: 'contractId' | 'capabilityId',
  code: RuntimeAssemblyErrorCode,
): ReadonlyArray<{ id: string; version: string }> {
  const entries = requireSafeArray(value, description, code);
  const seen = new Set<string>();
  const refs = entries.map((entry, index) => {
    const ref = snapshotExactRef(entry, `${description}[${index}]`, idField, code);
    if (seen.has(ref.id)) {
      fail(code, `${description}[${index}] declares ${ref.id} more than once (exact refs only)`);
    }
    seen.add(ref.id);
    return Object.freeze(ref);
  });
  return Object.freeze(refs);
}

/** A fully snapshotted binding: fresh frozen pins/refs plus the trusted handle. */
interface SnapshotBinding {
  readonly pin: KindImplementationPin;
  readonly understoodSemanticContracts: ReadonlyArray<{ id: string; version: string }>;
  readonly understoodCapabilities: ReadonlyArray<{ id: string; version: string }>;
  readonly validateComponent: ComponentKindValidator;
}

const BINDING_INPUT_FIELDS = new Set<string>([
  'pin',
  'understoodSemanticContracts',
  'understoodCapabilities',
  'validateComponent',
]);

const PIN_FIELDS = new Set<string>(['kind', 'implementation']);

const IMPLEMENTATION_FIELDS = new Set<string>([
  'implementationId',
  'implementationVersion',
  'implementationDigest',
]);

/**
 * Synchronously validate and snapshot one KindImplementation binding input.
 * The pin kind's exactness is proven by consuming the #573 frozen
 * compatibility decision (never reimplemented here): a structurally invalid
 * or floating/range/x-range KindRef surfaces as INCOMPATIBLE_KIND_IMPLEMENTATION.
 * Implementation-side defects surface as INVALID_IMPLEMENTATION_PIN.
 */
function snapshotBindingEntry(value: unknown, index: number): SnapshotBinding {
  const at = `kind implementation binding [${index}]`;
  const view = requireSafeRecord(value, at, 'INVALID_ASSEMBLY_INPUT');
  const unexpectedField = Object.keys(view).find((key) => !BINDING_INPUT_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_ASSEMBLY_INPUT',
      `${at} must contain exactly {pin, understoodSemanticContracts, understoodCapabilities, validateComponent}; unexpected field "${unexpectedField}"`,
    );
  }
  if (typeof view.validateComponent !== 'function') {
    fail('INVALID_ASSEMBLY_INPUT', `${at}.validateComponent must be a function`);
  }

  const pinView = requireSafeRecord(view.pin, `${at}.pin`, 'INVALID_IMPLEMENTATION_PIN');
  const unexpectedPinField = Object.keys(pinView).find((key) => !PIN_FIELDS.has(key));
  if (unexpectedPinField !== undefined) {
    fail(
      'INVALID_IMPLEMENTATION_PIN',
      `${at}.pin must contain exactly {kind, implementation}; unexpected field "${unexpectedPinField}"`,
    );
  }

  // Kind-side exactness decision — consumed from kind-compatibility.ts (#573).
  let kind: KindRef;
  try {
    const decision = decideKindCompatibility(pinView.kind as KindRef, [pinView.kind as KindRef]);
    kind = { kindId: decision.supportedKind.kindId, version: decision.supportedKind.version };
  } catch (error) {
    const reason = error instanceof KindCompatibilityError ? error.message : String(error);
    fail('INCOMPATIBLE_KIND_IMPLEMENTATION', `${at}.pin.kind is not an exact, decidable KindRef: ${reason}`);
  }

  const implementationView = requireSafeRecord(
    pinView.implementation,
    `${at}.pin.implementation`,
    'INVALID_IMPLEMENTATION_PIN',
  );
  const unexpectedImplField = Object.keys(implementationView).find(
    (key) => !IMPLEMENTATION_FIELDS.has(key),
  );
  if (unexpectedImplField !== undefined) {
    fail(
      'INVALID_IMPLEMENTATION_PIN',
      `${at}.pin.implementation must contain exactly {implementationId, implementationVersion, implementationDigest}; unexpected field "${unexpectedImplField}"`,
    );
  }
  const implementationId = requireExactIdentityString(
    implementationView.implementationId,
    `${at}.pin.implementation.implementationId`,
    'INVALID_IMPLEMENTATION_PIN',
  );
  requireNonFloatingIdentity(
    implementationId,
    `${at}.pin.implementation.implementationId`,
    'INVALID_IMPLEMENTATION_PIN',
  );
  const implementationVersion = requireExactIdentityString(
    implementationView.implementationVersion,
    `${at}.pin.implementation.implementationVersion`,
    'INVALID_IMPLEMENTATION_PIN',
  );
  requireNonFloatingIdentity(
    implementationVersion,
    `${at}.pin.implementation.implementationVersion`,
    'INVALID_IMPLEMENTATION_PIN',
  );
  requireExactVersion(
    implementationVersion,
    `${at}.pin.implementation.implementationVersion`,
    'INVALID_IMPLEMENTATION_PIN',
  );
  if (!isContentDigest(implementationView.implementationDigest)) {
    fail(
      'INVALID_IMPLEMENTATION_PIN',
      `${at}.pin.implementation.implementationDigest must be a non-empty content digest string`,
    );
  }

  const pin: KindImplementationPin = Object.freeze({
    kind: Object.freeze(kind),
    implementation: Object.freeze({
      implementationId,
      implementationVersion,
      implementationDigest: implementationView.implementationDigest,
    }),
  });

  return {
    pin,
    understoodSemanticContracts: snapshotExactRefCollection(
      view.understoodSemanticContracts,
      `${at}.understoodSemanticContracts`,
      'contractId',
      'INVALID_ASSEMBLY_INPUT',
    ),
    understoodCapabilities: snapshotExactRefCollection(
      view.understoodCapabilities,
      `${at}.understoodCapabilities`,
      'capabilityId',
      'INVALID_ASSEMBLY_INPUT',
    ),
    validateComponent: view.validateComponent as ComponentKindValidator,
  };
}

const RESOURCE_BINDING_FIELDS = new Set<string>(['owner', 'declaration']);

const REQUIREMENT_FIELDS = new Set<string>(['resourceKey', 'contract', 'operationId', 'required']);

/**
 * Synchronously validate and snapshot T005A resource requirement bindings
 * into the canonical #568 five-field material. Composition, not
 * re-implementation: `validateToolResourceRequirements` owns declaration
 * semantics (whitelisted fields, exact refs, operation existence, key
 * uniqueness) and its typed failures propagate unchanged; this layer adds
 * only the binding-entry envelope, the exact owner key check and the
 * duplicate-owner fail-closed rule.
 */
function snapshotResourceBindings(
  value: unknown,
): readonly AssemblyResourceRequirementsMaterial[] {
  const entries = requireSafeArray(
    value,
    'resource requirement bindings',
    'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
  );
  const seenOwners = new Set<string>();
  const materials = entries.map((entry, index) => {
    const at = `resource requirement binding [${index}]`;
    const view = requireSafeRecord(entry, at, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
    const unexpectedField = Object.keys(view).find((key) => !RESOURCE_BINDING_FIELDS.has(key));
    if (unexpectedField !== undefined) {
      fail(
        'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
        `${at} must contain exactly {owner, declaration}; unexpected field "${unexpectedField}" (live values, secrets, endpoints and handles are structurally unrepresentable)`,
      );
    }

    const owner = view.owner as ComponentEnvelope;
    const declaration = view.declaration as ToolResourceRequirementsDeclaration;
    validateToolResourceRequirements(owner, declaration);

    const declarationView = requireSafeRecord(
      declaration,
      `${at}.declaration`,
      'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
    );
    const componentId = requireExactIdentityString(
      declarationView.componentId,
      `${at}.declaration.componentId`,
      'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
    );
    requireNonFloatingIdentity(
      componentId,
      `${at}.declaration.componentId`,
      'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
    );
    if (seenOwners.has(componentId)) {
      fail(
        'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
        `${at}.declaration.componentId declares ${componentId} more than once across resource requirement bindings (one canonical declaration set per owner)`,
      );
    }
    seenOwners.add(componentId);

    const requirementsView = requireSafeArray(
      declarationView.requirements,
      `${at}.declaration.requirements`,
      'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
    );
    const requirements = requirementsView.map((candidate, requirementIndex) => {
      const path = `${at}.declaration.requirements[${requirementIndex}]`;
      const requirement = requireSafeRecord(candidate, path, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
      const unexpectedRequirementField = Object.keys(requirement).find(
        (key) => !REQUIREMENT_FIELDS.has(key),
      );
      if (unexpectedRequirementField !== undefined) {
        fail(
          'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
          `${path} must not carry unknown field "${unexpectedRequirementField}" (live values, secrets, endpoints and handles are structurally unrepresentable)`,
        );
      }
      const resourceKey = requireExactIdentityString(
        requirement.resourceKey,
        `${path}.resourceKey`,
        'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
      );
      requireNonFloatingIdentity(
        resourceKey,
        `${path}.resourceKey`,
        'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
      );
      const material: AssemblyResourceRequirement = { resourceKey, required: requirement.required as boolean };
      if ('contract' in requirement && requirement.contract !== undefined) {
        const contract = snapshotExactRef(
          requirement.contract,
          `${path}.contract`,
          'contractId',
          'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
        );
        (material as { contract?: ResourceContractRef }).contract = Object.freeze({
          contractId: contract.id,
          version: contract.version,
        });
      }
      if ('operationId' in requirement && requirement.operationId !== undefined) {
        const operationId = requireExactIdentityString(
          requirement.operationId,
          `${path}.operationId`,
          'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
        );
        requireNonFloatingIdentity(
          operationId,
          `${path}.operationId`,
          'INVALID_RESOURCE_REQUIREMENT_IDENTITY',
        );
        (material as { operationId?: string }).operationId = operationId;
      }
      return Object.freeze(material);
    });

    // Order normalization: semantically unordered declaration permutations
    // MUST NOT change Assembly identity.
    const sortedRequirements = Object.freeze(
      [...requirements].sort((a, b) => lexicalCompare(a.resourceKey, b.resourceKey)),
    );
    return Object.freeze({ componentId, requirements: sortedRequirements });
  });

  return Object.freeze(
    [...materials].sort((a, b) => lexicalCompare(a.componentId, b.componentId)),
  );
}

const EVIDENCE_FIELDS = new Set<string>(['subject', 'bindingDigest']);

/**
 * Synchronously validate and snapshot §G generic implementation-binding
 * evidence slots. Exact-identity-only and opaque: the kernel records the
 * subject/digest pair without selecting, ranking or inspecting anything.
 */
function snapshotEvidence(
  value: unknown,
): readonly AssemblyImplementationBindingEvidence[] {
  const entries = requireSafeArray(value, 'implementation binding evidence', 'INVALID_ASSEMBLY_INPUT');
  const seenSubjects = new Set<string>();
  const slots = entries.map((entry, index) => {
    const at = `implementation binding evidence [${index}]`;
    const view = requireSafeRecord(entry, at, 'INVALID_ASSEMBLY_INPUT');
    const unexpectedField = Object.keys(view).find((key) => !EVIDENCE_FIELDS.has(key));
    if (unexpectedField !== undefined) {
      fail(
        'INVALID_ASSEMBLY_INPUT',
        `${at} must contain exactly {subject, bindingDigest}; unexpected field "${unexpectedField}" (Tool-specific binding semantics are T003C-owned and never enter the generic slot)`,
      );
    }
    const subject = requireExactIdentityString(view.subject, `${at}.subject`, 'INVALID_ASSEMBLY_INPUT');
    requireNonFloatingIdentity(view.subject as string, `${at}.subject`, 'INVALID_ASSEMBLY_INPUT');
    if (!isContentDigest(view.bindingDigest)) {
      fail('INVALID_ASSEMBLY_INPUT', `${at}.bindingDigest must be a non-empty content digest string`);
    }
    if (seenSubjects.has(subject)) {
      fail(
        'DUPLICATE_BINDING_EVIDENCE',
        `${at}.subject declares ${subject} more than once (binding evidence slots are unique per subject; duplicates are never first-wins)`,
      );
    }
    seenSubjects.add(subject);
    return Object.freeze({
      subject,
      bindingDigest: view.bindingDigest,
    });
  });
  return Object.freeze([...slots].sort((a, b) => lexicalCompare(a.subject, b.subject)));
}

const SEAL_INPUT_FIELDS = new Set<string>([
  'definitionGraph',
  'kindImplementations',
  'resourceRequirements',
  'implementationBindingEvidence',
  'claimedDefinitionGraphDigest',
]);

function requireSha256Port(value: unknown, path: string): Sha256Port {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as Sha256Port).digestUtf8 !== 'function'
  ) {
    fail('INVALID_ASSEMBLY_INPUT', `${path} must be a Sha256Port ({ digestUtf8(value): Promise<string> })`);
  }
  return value as Sha256Port;
}

// ---------------------------------------------------------------------------
// sealRuntimeAssembly — the authority boundary (#587 §C, §E)
// ---------------------------------------------------------------------------

/**
 * Seal a Runtime Assembly over an exact Definition graph.
 *
 * Authority boundary: raw caller-provided declarations/validators never
 * become runtime authority. Every authority-bearing input is descriptor-safe
 * validated and synchronously snapshotted BEFORE the first `await` (#587 §E
 * torn-snapshot discipline, same as #555); after any suspension only
 * module-owned snapshot material is read. The Definition graph digest is
 * authoritatively recomputed through the accepted #555 seam — a
 * caller-supplied claim is verified against it, never trusted blindly — and
 * any stale/mismatching claim fails closed.
 *
 * Deterministic fail-closed precedence: seal-input shape, graph validation
 * (propagated unchanged), binding snapshots, ambiguity, missing
 * implementations, resource identity, evidence identity, then async digest
 * work (currentness claim, Assembly digest). Never downgrades a failure.
 */
export async function sealRuntimeAssembly(
  input: SealRuntimeAssemblyInput,
  sha256: Sha256Port,
): Promise<SealedRuntimeAssembly> {
  requireSha256Port(sha256, 'sha256');

  // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
  const inputView = requireSafeRecord(input, 'runtime assembly seal input', 'INVALID_ASSEMBLY_INPUT');
  const unexpectedInputField = Object.keys(inputView).find((key) => !SEAL_INPUT_FIELDS.has(key));
  if (unexpectedInputField !== undefined) {
    fail(
      'INVALID_ASSEMBLY_INPUT',
      `runtime assembly seal input must not carry unknown field "${unexpectedInputField}"`,
    );
  }
  if (!('definitionGraph' in inputView)) {
    fail('INVALID_ASSEMBLY_INPUT', 'runtime assembly seal input.definitionGraph is required');
  }
  if (!('kindImplementations' in inputView)) {
    fail('INVALID_ASSEMBLY_INPUT', 'runtime assembly seal input.kindImplementations is required');
  }

  const definitionGraph = inputView.definitionGraph as DefinitionGraphEnvelope;
  // Graph validation is synchronous; typed DefinitionGraphContractError (and
  // the ComponentContractError it composes) propagate unchanged.
  validateDefinitionGraphEnvelope(definitionGraph);
  // Required/admitted exact Kinds, snapshotted synchronously before any await.
  const requiredKindKeys = new Set<string>();
  for (const component of definitionGraph.components) {
    requiredKindKeys.add(kindKey(component.kind));
  }

  const bindings = requireSafeArray(
    inputView.kindImplementations,
    'kind implementation bindings',
    'INVALID_ASSEMBLY_INPUT',
  ).map((entry, index) => snapshotBindingEntry(entry, index));

  // Ambiguity fails closed — never first-wins.
  const bindingsByKind = new Map<string, SnapshotBinding>();
  for (const [index, binding] of bindings.entries()) {
    const key = kindKey(binding.pin.kind);
    if (bindingsByKind.has(key)) {
      fail(
        'AMBIGUOUS_KIND_IMPLEMENTATION',
        `kind implementation bindings [${index}] declares exact Kind "${key}" more than once (one exact KindImplementation per exact KindRef; never first-wins)`,
      );
    }
    bindingsByKind.set(key, binding);
  }
  // Every required/admitted graph Kind must have exactly one implementation.
  for (const key of [...requiredKindKeys].sort()) {
    if (!bindingsByKind.has(key)) {
      fail(
        'MISSING_KIND_IMPLEMENTATION',
        `no KindImplementation binding is sealed for required/admitted exact Kind "${key}" of the Definition graph (missing implementations fail closed; no default/latest/fallback exists)`,
      );
    }
  }

  const resourceRequirements = snapshotResourceBindings(
    'resourceRequirements' in inputView ? inputView.resourceRequirements : [],
  );
  const evidence = snapshotEvidence(
    'implementationBindingEvidence' in inputView ? inputView.implementationBindingEvidence : [],
  );

  const claimed = inputView.claimedDefinitionGraphDigest;
  if (claimed !== undefined && !isContentDigest(claimed)) {
    fail(
      'INVALID_ASSEMBLY_INPUT',
      'runtime assembly seal input.claimedDefinitionGraphDigest must be a non-empty content digest string when present',
    );
  }

  // ---- PHASE 2 (async): digest work only; no caller-owned re-read after this point.
  const definitionGraphDigest = await computeDefinitionGraphDigest(definitionGraph, sha256);
  if (claimed !== undefined && claimed !== definitionGraphDigest) {
    fail(
      'DEFINITION_CURRENTNESS_MISMATCH',
      'the supplied/current Definition graph does not correspond to the claimed exact digest; Assembly sealing is bound to the authoritatively recomputed graph digest and stale/mismatching claims fail closed',
    );
  }

  // Order normalization: binding input permutation MUST NOT change identity.
  const pins: readonly KindImplementationPin[] = Object.freeze(
    [...bindings]
      .map((binding) => binding.pin)
      .sort((a, b) => lexicalCompare(pinSortKey(a), pinSortKey(b))),
  );

  const record: RuntimeAssemblyRecord = Object.freeze({
    digestDomain: RUNTIME_ASSEMBLY_DIGEST_DOMAIN,
    definitionGraphDigest,
    kindImplementations: pins,
    resourceRequirements,
    implementationBindingEvidence: evidence,
  });
  const assemblyDigest = await computeCanonicalJsonDigest(record, sha256);

  const sealedBindings: readonly SealedKindImplementationBinding[] = Object.freeze(
    bindings.map((binding) =>
      Object.freeze({
        pin: binding.pin,
        understoodSemanticContracts: binding.understoodSemanticContracts.map((ref) =>
          Object.freeze({ contractId: ref.id, version: ref.version }),
        ),
        understoodCapabilities: binding.understoodCapabilities.map((ref) =>
          Object.freeze({ capabilityId: ref.id, version: ref.version }),
        ),
        validateComponent: binding.validateComponent,
      }),
    ),
  );

  const sealed = Object.freeze({
    record,
    assemblyDigest,
    bindings: sealedBindings,
    [SEALED_ASSEMBLY_BRAND]: true as const,
  });
  SEALED_ASSEMBLY_MINTS.add(sealed);
  return sealed;
}

// ---------------------------------------------------------------------------
// admitComponentWithAssembly — Assembly-bound admission (#587 §C, §D, §E)
// ---------------------------------------------------------------------------

/** Deep-copy validated portable JSON material into module-owned snapshot state. */
function snapshotJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Synchronously snapshot a validated Component envelope into fresh
 * module-owned value objects (identity refs fresh; JSON bodies deep-copied)
 * so no caller-owned state is read after the first async suspension.
 */
function snapshotEnvelope(envelope: ComponentEnvelope): ComponentEnvelope {
  const snapshot: ComponentEnvelope = {
    family: envelope.family,
    componentId: envelope.componentId,
    kind: Object.freeze({ kindId: envelope.kind.kindId, version: envelope.kind.version }),
    requiredSemanticContracts: Object.freeze(
      envelope.requiredSemanticContracts.map((ref) =>
        Object.freeze({ contractId: ref.contractId, version: ref.version }),
      ),
    ),
    requiredCapabilities: Object.freeze(
      envelope.requiredCapabilities.map((ref) =>
        Object.freeze({ capabilityId: ref.capabilityId, version: ref.version }),
      ),
    ),
    semanticBody: snapshotJson(envelope.semanticBody),
  };
  if ('nonMaterialExtensions' in envelope && envelope.nonMaterialExtensions !== undefined) {
    (snapshot as { nonMaterialExtensions?: unknown }).nonMaterialExtensions = snapshotJson(
      envelope.nonMaterialExtensions,
    );
  }
  return snapshot;
}

/**
 * Authoritative sealed-Assembly guard (#575, fresh-review P1 repair). The
 * module-private WeakSet mint registry is the authoritative test — it cannot
 * be satisfied by prototype inheritance or symbol reflection, since only
 * `sealRuntimeAssembly` ever adds a member. The unique-symbol brand is kept
 * as defense in depth, but consulted as an OWN property only
 * (`Object.hasOwn`), so a brand value inherited through a forged prototype
 * chain contributes nothing.
 */
function isSealedAssembly(value: unknown): value is SealedRuntimeAssembly {
  return (
    typeof value === 'object' &&
    value !== null &&
    SEALED_ASSEMBLY_MINTS.has(value) &&
    Object.hasOwn(value, SEALED_ASSEMBLY_BRAND) &&
    (value as Record<typeof SEALED_ASSEMBLY_BRAND, unknown>)[SEALED_ASSEMBLY_BRAND] === true
  );
}

/**
 * Authoritative Assembly-bound Component admission.
 *
 * The exact Kind support decision is consumed from the #573 frozen decision
 * over the SEALED bindings' pins (never a caller validator): an unbound or
 * inexact Kind fails closed with ASSEMBLY_ADMISSION_KIND_NOT_BOUND. The
 * current Definition graph digest is authoritatively recomputed and must
 * equal the digest recorded in the sealed Assembly, else
 * ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH fails closed. Only then is the
 * low-level `admitComponent` invoked with a declaration derived from the
 * sealed binding, and its result is re-emitted as frozen, non-aliasing
 * Assembly-bound evidence binding componentId, currentness, assemblyDigest,
 * exact admitted KindRef and exact KindImplementationPin.
 *
 * Torn-snapshot discipline: the envelope is validated and snapshotted
 * synchronously before the first `await`; the caller's envelope is never
 * re-read after the currentness suspension, so post-admission caller mutation
 * cannot alter admitted evidence.
 */
export async function admitComponentWithAssembly(
  envelope: ComponentEnvelope,
  assembly: SealedRuntimeAssembly,
  options: AdmitComponentWithAssemblyOptions,
): Promise<AssemblyBoundComponentAdmission> {
  // Anti-forgery boundary (#575): a raw/no-op validator supplied outside the
  // sealed Assembly path can never mint Assembly-bound admission — a
  // caller-constructed object does not carry the module-private brand.
  if (!isSealedAssembly(assembly)) {
    fail(
      'INVALID_ASSEMBLY_INPUT',
      'admission requires a SealedRuntimeAssembly minted by sealRuntimeAssembly; a caller-constructed assembly can never carry the sealed-Assembly brand',
    );
  }

  // Defense-in-depth consistency re-derivation (fresh-review P1 repair): the
  // sealed bindings' pin set must be exactly the record's serialized pin
  // set. Every registry member minted by sealRuntimeAssembly satisfies this
  // by construction (both derive from the same synchronous snapshot), so a
  // mismatch indicates tampered module state and fails closed before any
  // authority use.
  const bindingPinKeys = assembly.bindings.map((binding) => pinSortKey(binding.pin)).sort();
  const recordPinKeys = assembly.record.kindImplementations.map(pinSortKey).sort();
  if (
    bindingPinKeys.length !== recordPinKeys.length ||
    bindingPinKeys.some((key, index) => key !== recordPinKeys[index])
  ) {
    fail(
      'INVALID_ASSEMBLY_INPUT',
      'the sealed Assembly\'s bindings do not correspond exactly to its serialized record pins; Assembly evidence is inconsistent and fails closed',
    );
  }

  const optionsView = requireSafeRecord(options, 'admission options', 'INVALID_ASSEMBLY_INPUT');
  const unexpectedOptionField = Object.keys(optionsView).find(
    (key) => key !== 'currentDefinitionGraph' && key !== 'sha256',
  );
  if (unexpectedOptionField !== undefined) {
    fail(
      'INVALID_ASSEMBLY_INPUT',
      `admission options must contain exactly {currentDefinitionGraph, sha256}; unexpected field "${unexpectedOptionField}"`,
    );
  }
  const sha256 = requireSha256Port(optionsView.sha256, 'admission options.sha256');
  const currentDefinitionGraph = optionsView.currentDefinitionGraph as DefinitionGraphEnvelope;

  // Synchronous envelope validation + snapshot, before the first await.
  validateComponentEnvelope(envelope);
  const envelopeSnapshot = snapshotEnvelope(envelope);

  // Exact Kind support decision over the sealed bindings (#573 consumed).
  const supportedKinds: readonly KindRef[] = assembly.bindings.map((binding) => binding.pin.kind);
  let admittedKind: KindRef;
  try {
    const decision = decideKindCompatibility(envelopeSnapshot.kind, supportedKinds);
    admittedKind = { kindId: decision.supportedKind.kindId, version: decision.supportedKind.version };
  } catch (error) {
    const reason = error instanceof KindCompatibilityError ? error.message : String(error);
    fail(
      'ASSEMBLY_ADMISSION_KIND_NOT_BOUND',
      `the sealed Assembly has no KindImplementation binding for the component's exact Kind: ${reason}`,
    );
  }
  const binding = assembly.bindings.find(
    (candidate) => kindKey(candidate.pin.kind) === kindKey(admittedKind),
  );

  // Definition currentness: authoritative recomputation, never a blind trust.
  const currentDigest = await computeDefinitionGraphDigest(currentDefinitionGraph, sha256);
  if (currentDigest !== assembly.record.definitionGraphDigest) {
    fail(
      'ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH',
      'the current Definition graph digest does not match the exact digest bound in the sealed Assembly; stale graphs fail closed before any validator runs',
    );
  }

  // The declaration is derived from the SEALED binding only (#587 §C).
  const declaration: UnderstoodKindDeclaration = {
    kind: Object.freeze({ kindId: admittedKind.kindId, version: admittedKind.version }),
    understoodSemanticContracts: binding!.understoodSemanticContracts,
    understoodCapabilities: binding!.understoodCapabilities,
    validateComponent: binding!.validateComponent,
  };
  const result = admitComponent(envelopeSnapshot, [declaration]);

  // Mint frozen, non-aliasing Assembly-bound authority evidence (#587 §D).
  const pin = binding!.pin;
  return Object.freeze({
    status: 'ADMITTED' as const,
    componentId: result.componentId,
    definitionGraphDigest: assembly.record.definitionGraphDigest,
    assemblyDigest: assembly.assemblyDigest,
    admittedKind: Object.freeze({ kindId: result.admittedKind.kindId, version: result.admittedKind.version }),
    admittedKindImplementation: Object.freeze({
      kind: Object.freeze({ kindId: pin.kind.kindId, version: pin.kind.version }),
      implementation: Object.freeze({
        implementationId: pin.implementation.implementationId,
        implementationVersion: pin.implementation.implementationVersion,
        implementationDigest: pin.implementation.implementationDigest,
      }),
    }),
    admittedSemanticContracts: Object.freeze(
      result.admittedSemanticContracts.map((ref) =>
        Object.freeze({ contractId: ref.contractId, version: ref.version }),
      ),
    ),
    admittedCapabilities: Object.freeze(
      result.admittedCapabilities.map((ref) =>
        Object.freeze({ capabilityId: ref.capabilityId, version: ref.version }),
      ),
    ),
  });
}
