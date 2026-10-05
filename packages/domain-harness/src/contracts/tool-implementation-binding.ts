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
  sealRuntimeAssembly,
  type AssemblyImplementationBindingEvidence,
  type KindImplementationBindingInput,
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
 */
export type ToolImplementationBindingErrorCode =
  | 'INVALID_BINDING_INPUT'
  | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'
  | 'MISSING_TOOL_IMPLEMENTATION'
  | 'AMBIGUOUS_TOOL_IMPLEMENTATION'
  | 'INCOMPATIBLE_TOOL_IMPLEMENTATION'
  | 'DEFINITION_GRAPH_DIGEST_MISMATCH';

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
    implementationDigest: candidate.implementationDigest as ContentDigest,
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
  priorSlots: readonly AssemblyImplementationBindingEvidence[];
} {
  const at = 'bind input.assembly';
  if (typeof value !== 'object' || value === null) {
    fail('INVALID_BINDING_INPUT', `${at} must be a SealedRuntimeAssembly ({ record, bindings, ... })`);
  }
  const assemblyObject = value as object;
  const recordValue = readAssemblyOwnDataProperty(assemblyObject, 'record');
  const assemblyDigest = readAssemblyOwnDataProperty(assemblyObject, 'assemblyDigest');
  const bindingsValue = readAssemblyOwnDataProperty(assemblyObject, 'bindings');

  const recordView = requireSafeRecord(recordValue, `${at}.record`);
  if (!('definitionGraphDigest' in recordView) || !('implementationBindingEvidence' in recordView)) {
    fail('INVALID_BINDING_INPUT', `${at}.record must carry definitionGraphDigest and implementationBindingEvidence`);
  }
  if (typeof assemblyDigest !== 'string' || !isContentDigest(assemblyDigest)) {
    fail('INVALID_BINDING_INPUT', `${at}.assemblyDigest must be a non-empty content digest string`);
  }
  const definitionGraphDigest = recordView.definitionGraphDigest;
  if (typeof definitionGraphDigest !== 'string' || !isContentDigest(definitionGraphDigest)) {
    fail('INVALID_BINDING_INPUT', `${at}.record.definitionGraphDigest must be a non-empty content digest string`);
  }

  const priorSlots = snapshotEvidenceSlots(recordView.implementationBindingEvidence, `${at}.record.implementationBindingEvidence`);

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

  return { definitionGraphDigest: definitionGraphDigest as ContentDigest, bindings, priorSlots };
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
      return Object.freeze({ subject, bindingDigest: view.bindingDigest as ContentDigest });
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
    definitionGraphDigest: definitionGraphDigest as ContentDigest,
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
  return sealed;
}
