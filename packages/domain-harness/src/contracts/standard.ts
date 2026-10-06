/**
 * v0.7 Standard Component descriptor / Standard Set boundary contract
 * (issue #618, fine-grained DAG #534 T006A; authority #589 PACK-C).
 *
 * Standard is a publishing/support/compatibility classification — NOT a
 * privileged Kind, Component family or runtime authority path. This module
 * owns exactly the concerns #589 assigns to T006A:
 *
 * Definition plane:
 * - `StandardComponentDescriptor`: a published Standard descriptor refers to
 *   an ordinary exact Component contract/version (family + componentId +
 *   exact KindRef) and carries its own semantic `descriptorVersion`;
 *   descriptor/version changes participate in ordinary Definition identity
 *   through this file's own versioned descriptor digest domain — exactly as
 *   an app Component would, with no privileged coupling into graph identity;
 * - fail-closed, descriptor-safe validation (composition of the shared
 *   record-safety primitives, never reimplemented) with typed errors and no
 *   normalization.
 *
 * Assembly plane:
 * - `StandardSet`: a curated exact set of implementation/binding pins for
 *   published Standard descriptors. Concrete Standard implementation identity
 *   stays in Assembly through the SAME generic binding mechanisms as
 *   non-Standard Components: entries reuse the exact T002B KindImplementation
 *   pin shape (type-only import — this module never mutates or bypasses the
 *   Microkernel) and the §G generic implementation-binding evidence slot.
 *   Replacing a Standard implementation changes Set identity/currentness
 *   only, never the Definition contract identity of the descriptor or the
 *   referenced Component;
 * - `sealStandardSet` synchronously snapshots every authority-bearing input
 *   before the first `await` (same torn-snapshot discipline as #587 §E),
 *   order-normalizes the record, and mints an opaque frozen sealed Set via a
 *   module-private WeakSet registry (same anti-forgery pattern as T002B);
 * - `verifyStandardSetCurrentness` proves descriptor currentness by
 *   authoritative recomputation — never a blind trust of caller claims.
 *
 * Bootstrap-candidate eligibility (consumed by T006B/T006C):
 * - deterministic: published/supported exact descriptor + accepted reference
 *   implementation bound to the exact component Kind, classified by the
 *   ordinary Component family; the lexicographically smallest canonical exact
 *   ComponentRef is selected for FIXTURE CONSTRUCTION ONLY — never runtime
 *   provider-selection semantics (the selector is pure);
 * - no eligible candidate is a typed `STANDARD_*_CANDIDATE_ABSENT` failure —
 *   a candidate is never invented locally.
 *
 * #653 P2 hardening (bootstrap candidate safety + permutation determinism):
 * - R1: any malformed or unsafe candidate structure — the candidate record
 *   itself or authority-bearing nested descriptor/pin material (accessor/
 *   exotic/hidden/symbol-keyed material, malformed shapes) — is a
 *   deterministic typed invalid-input failure with no silent-skip path;
 * - D4: the selected candidate is returned fresh, frozen and non-aliased;
 *   caller mutation after selection cannot change the material consumed by
 *   T006B/T006C;
 * - D5/G1: selection is invariant under candidate-pool permutation — the
 *   PACK-C canonical exact ComponentRef primary key is preserved, with the
 *   exact reference-implementation identity as the deterministic
 *   tie-breaker only, and exact duplicate semantic candidates deduplicate
 *   by exact identity.
 *
 * #652 P1 repair (authority/currentness closure, T006A):
 * - D1: `sealStandardSet` resolves every entry against a REQUIRED
 *   verification-only descriptor context (never `StandardSetRecord`/setDigest
 *   material; `STANDARD_SET_DIGEST_DOMAIN` is unchanged for otherwise
 *   identical legitimate Sets), recomputes the exact descriptor digest,
 *   requires the exact descriptor `component.kind` to equal the entry pin
 *   Kind (`STANDARD_SET_DESCRIPTOR_PIN_KIND_MISMATCH` otherwise), and fails
 *   closed on missing/duplicate/ambiguous bodies — no closest/latest/default
 *   lookup;
 * - D2: `verifyStandardSetCurrentness` proves implementation currentness for
 *   real: it locates the exact referenced Component in the exact current
 *   Definition graph and admits it through the generic T002B authority
 *   (`admitComponentWithAssembly`) against the SAME current final sealed
 *   Assembly, requiring the admitted KindImplementation pin to equal the Set
 *   entry pin exactly (`STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH`
 *   otherwise). T002B typed failures propagate unchanged when owned there;
 * - D3: Tool-family entries consume the accepted #640 T003C consumer
 *   verifier (`verifyToolImplementationBinding`) against the SAME final
 *   Assembly; Standard owns only the exact-subject §G slot requirement at
 *   mint (`STANDARD_SET_TOOL_BINDING_REQUIRED`, orphan slots fail closed) and
 *   the Set↔verified-binding linkage
 *   (`STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH`). It never reproduces
 *   the T003C digest algorithm, and Semantic-family descriptors require no
 *   Tool binding.
 *
 * Deliberately ABSENT (no Standard bypass, per #589): must-understand
 * admission, exposure, capability closure, resources, activation, effects,
 * replay, and any provider/registry/dispatch surface. The Microkernel
 * (`runtime-assembly.ts`) imports nothing from this module, and this module
 * mints no admission/activation/effect evidence — classification can never
 * shortcut authority.
 */
import {
  COMPONENT_FAMILIES,
  type ComponentEnvelope,
  type ComponentFamily,
  type ComponentId,
  type KindRef,
} from './component.js';
import {
  canonicalizeJson,
  canonicalJsonStringify,
  computeCanonicalJsonDigest,
  isContentDigest,
  type ContentDigest,
  type Sha256Port,
} from './identity.js';
import { decideKindCompatibility, KindCompatibilityError } from './kind-compatibility.js';
import {
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
  type DefinitionRelation,
} from './definition-graph.js';
import {
  admitComponentWithAssembly,
  isSealedRuntimeAssembly,
} from './runtime-assembly.js';
import type {
  AssemblyImplementationBindingEvidence,
  KindImplementationPin,
  SealedRuntimeAssembly,
} from './runtime-assembly.js';
import { verifyToolImplementationBinding } from './tool-implementation-binding.js';
import type { SealedToolImplementationBinding } from './tool-implementation-binding.js';
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
 * Versioned Standard descriptor digest domain tag, owned exclusively by this
 * file. Sibling to the T001B/T001C/T002B digest domains; any future change
 * to the material shape is a NEW domain tag — historical descriptor
 * identities never change retroactively.
 */
export const STANDARD_DESCRIPTOR_DIGEST_DOMAIN = 'kaicreator.standard-descriptor.digest.v1';

/**
 * Versioned Standard Set digest domain tag, owned exclusively by this file
 * (Assembly plane). Same freezing discipline as every sibling domain tag.
 */
export const STANDARD_SET_DIGEST_DOMAIN = 'kaicreator.standard-set.digest.v1';

/**
 * The closed publishing/support classification vocabulary of a Standard
 * descriptor. A Standard descriptor is exactly this classification over an
 * ordinary exact Component reference — it grants no authority of any kind.
 */
export const STANDARD_CLASSIFICATIONS = Object.freeze(['published', 'supported'] as const);

export type StandardClassification = (typeof STANDARD_CLASSIFICATIONS)[number];

/**
 * Fail-closed Standard descriptor/Set failure taxonomy (#589 PACK-C). Every
 * failure is typed and terminal — none carries or suggests a substitute/
 * default/latest resolution, and no diagnostic serializes live handles.
 */
export type StandardContractErrorCode =
  | 'INVALID_STANDARD_DESCRIPTOR'
  | 'INVALID_STANDARD_ID'
  | 'INVALID_STANDARD_CLASSIFICATION'
  | 'INVALID_DESCRIPTOR_VERSION'
  | 'INVALID_COMPONENT_REF'
  | 'INVALID_STANDARD_SET_INPUT'
  | 'INVALID_STANDARD_DESCRIPTOR_REF'
  | 'INVALID_IMPLEMENTATION_PIN'
  | 'DUPLICATE_STANDARD_DESCRIPTOR'
  | 'DUPLICATE_BINDING_EVIDENCE'
  | 'STANDARD_SET_CURRENTNESS_MISMATCH'
  | 'STANDARD_DESCRIPTOR_CURRENTNESS_MISMATCH'
  // #652 P1 repair taxonomy additions:
  | 'STANDARD_SET_DESCRIPTOR_PIN_KIND_MISMATCH'
  | 'STANDARD_SET_TOOL_BINDING_REQUIRED'
  | 'STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH'
  | 'STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH'
  | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN';

export class StandardContractError extends Error {
  readonly code: StandardContractErrorCode;

  constructor(code: StandardContractErrorCode, message: string) {
    super(message);
    this.name = 'StandardContractError';
    this.code = code;
  }
}

/** Typed terminal failure codes of the deterministic bootstrap-candidate
 * eligibility rule (consumed by T006B/T006C). Never substituted, never
 * retried with an invented candidate. */
export const STANDARD_SEMANTIC_CANDIDATE_ABSENT = 'STANDARD_SEMANTIC_CANDIDATE_ABSENT' as const;
export const STANDARD_TOOL_CANDIDATE_ABSENT = 'STANDARD_TOOL_CANDIDATE_ABSENT' as const;

export type StandardCandidateAbsentCode =
  | typeof STANDARD_SEMANTIC_CANDIDATE_ABSENT
  | typeof STANDARD_TOOL_CANDIDATE_ABSENT;

/**
 * Terminal typed failure of the bootstrap-candidate eligibility rule: no
 * eligible published/supported Standard descriptor exists for the requested
 * ordinary Component family. The caller must return to ChatGPT Web — Local
 * Agent must never invent a candidate or contract locally.
 */
export class StandardCandidateAbsentError extends Error {
  readonly code: StandardCandidateAbsentCode;
  readonly family: ComponentFamily;

  constructor(family: ComponentFamily) {
    const code: StandardCandidateAbsentCode =
      family === 'semantic' ? STANDARD_SEMANTIC_CANDIDATE_ABSENT : STANDARD_TOOL_CANDIDATE_ABSENT;
    super(
      `no eligible ${family} Standard bootstrap candidate exists (published/supported exact descriptor with an accepted reference implementation); ${code} — return to ChatGPT Web instead of inventing a candidate`,
    );
    this.name = 'StandardCandidateAbsentError';
    this.code = code;
    this.family = family;
  }
}

// ---------------------------------------------------------------------------
// Definition plane — Standard Component descriptor
// ---------------------------------------------------------------------------

/**
 * Canonical exact Component reference: the ordinary identity of the exact
 * Component contract/version a published Standard descriptor refers to. No
 * implementation/module/provider/assembly identity is representable here.
 */
export interface ExactComponentRef {
  /** The ordinary Component family (semantic | tool) — classification is by
   * family, never by a Standard-specific family. */
  readonly family: ComponentFamily;
  /** Stable logical identity of the referenced Component within its Domain. */
  readonly componentId: ComponentId;
  /** Exact, versioned semantic Kind contract identity of the Component. */
  readonly kind: KindRef;
}

/**
 * Published Standard Component descriptor (Definition plane). Refers to an
 * ordinary exact Component contract/version and carries the descriptor's own
 * semantic version: `descriptorVersion` bumps are ordinary Definition
 * identity changes, exactly as an app Component version bump would be. The
 * descriptor never carries implementation, pin, validator, capability
 * closure, resource or runtime identity of any kind.
 */
export interface StandardComponentDescriptor {
  /** Stable logical identity of the Standard concern; exact, non-empty. */
  readonly standardId: string;
  /** Closed publishing/support classification — a label, never authority. */
  readonly classification: StandardClassification;
  /** Exact semantic descriptor version — Definition-plane identity material. */
  readonly descriptorVersion: string;
  /** Ordinary exact Component contract/version reference. */
  readonly component: ExactComponentRef;
}

const DESCRIPTOR_FIELDS = new Set<string>([
  'standardId',
  'classification',
  'descriptorVersion',
  'component',
]);

const COMPONENT_REF_FIELDS = new Set<string>(['family', 'componentId', 'kind']);

function fail(code: StandardContractErrorCode, path: string, reason: string): never {
  throw new StandardContractError(code, `${path} ${reason}`);
}

/** Code-unit comparison only; `localeCompare` is forbidden in this module. */
function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(
  value: unknown,
  path: string,
  code: StandardContractErrorCode,
): Record<string, unknown> {
  const result = safeRecordSnapshot(value, path);
  if (!result.ok) {
    fail(code, path, describeRecordSafetyIssue(result.issue));
  }
  return result.snapshot;
}

/**
 * Exact identity string: non-empty, no embedded `id@selector` form, no
 * floating/range token — invalid-shape defects map to `invalidCode`, while
 * selector semantics always map to FLOATING_AUTHORITY_REFERENCE_FORBIDDEN.
 */
function requireExactIdentityString(
  value: unknown,
  path: string,
  invalidCode: StandardContractErrorCode,
): string {
  if (typeof value !== 'string') {
    fail(invalidCode, path, 'must be a string');
  }
  if (!isNonEmptyIdentityString(value)) {
    fail(invalidCode, path, 'must be a non-empty exact identity');
  }
  if (carriesEmbeddedSelector(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      path,
      'must not embed a version selector (`id@version`); use the exact version field',
    );
  }
  if (carriesFloatingOrRangeSemantics(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      path,
      'must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)',
    );
  }
  return value;
}

/** Exact version string: additionally rejects x-range/partial forms. */
function requireExactVersion(value: unknown, path: string, invalidCode: StandardContractErrorCode): string {
  const version = requireExactIdentityString(value, path, invalidCode);
  if (carriesXRangeVersionSemantics(version)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      path,
      'must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)',
    );
  }
  return version;
}

/** Module-owned validated descriptor snapshot (fully synchronous). */
interface SnapshotDescriptor {
  readonly standardId: string;
  readonly classification: StandardClassification;
  readonly descriptorVersion: string;
  readonly component: {
    readonly family: ComponentFamily;
    readonly componentId: ComponentId;
    readonly kind: KindRef;
  };
}

/**
 * Synchronously validate and snapshot one Standard descriptor. Composition,
 * not re-implementation: KindRef exactness is proven by consuming the #573
 * frozen compatibility decision, and record safety by the shared #557/#578
 * primitives — both imported. The caller's object is never frozen or mutated
 * and never re-read after this snapshot.
 */
function snapshotDescriptor(value: unknown): SnapshotDescriptor {
  const view = requireSafeRecord(value, 'standard component descriptor', 'INVALID_STANDARD_DESCRIPTOR');
  const unexpectedField = Object.keys(view).find((key) => !DESCRIPTOR_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_STANDARD_DESCRIPTOR',
      'standard component descriptor',
      `must not carry unknown field "${unexpectedField}" (implementation/assembly/runtime identity belongs to the Assembly plane and is unrepresentable on a descriptor)`,
    );
  }

  const standardId = requireExactIdentityString(
    view.standardId,
    'standard component descriptor.standardId',
    'INVALID_STANDARD_ID',
  );

  if (
    typeof view.classification !== 'string' ||
    !(STANDARD_CLASSIFICATIONS as readonly string[]).includes(view.classification)
  ) {
    fail(
      'INVALID_STANDARD_CLASSIFICATION',
      'standard component descriptor.classification',
      `must be one of ${STANDARD_CLASSIFICATIONS.join(' | ')} (a publishing/support classification, never an authority flag)`,
    );
  }

  const descriptorVersion = requireExactVersion(
    view.descriptorVersion,
    'standard component descriptor.descriptorVersion',
    'INVALID_DESCRIPTOR_VERSION',
  );

  const componentView = requireSafeRecord(
    view.component,
    'standard component descriptor.component',
    'INVALID_COMPONENT_REF',
  );
  const unexpectedComponentField = Object.keys(componentView).find(
    (key) => !COMPONENT_REF_FIELDS.has(key),
  );
  if (unexpectedComponentField !== undefined) {
    fail(
      'INVALID_COMPONENT_REF',
      'standard component descriptor.component',
      `must contain exactly {family, componentId, kind}; unexpected field "${unexpectedComponentField}" (implementation/assembly/runtime identity is unrepresentable on a Component reference)`,
    );
  }
  if (
    typeof componentView.family !== 'string' ||
    !COMPONENT_FAMILIES.includes(componentView.family as ComponentFamily)
  ) {
    fail(
      'INVALID_COMPONENT_REF',
      'standard component descriptor.component.family',
      `must be one of ${COMPONENT_FAMILIES.join(' | ')} (the ordinary Component families; no Standard-specific family exists)`,
    );
  }
  const componentId = requireExactIdentityString(
    componentView.componentId,
    'standard component descriptor.component.componentId',
    'INVALID_COMPONENT_REF',
  );

  // Kind-side exactness decision — consumed from kind-compatibility.ts (#573).
  let kind: KindRef;
  try {
    const decision = decideKindCompatibility(componentView.kind as KindRef, [
      componentView.kind as KindRef,
    ]);
    kind = { kindId: decision.supportedKind.kindId, version: decision.supportedKind.version };
  } catch (error) {
    const reason = error instanceof KindCompatibilityError ? error.message : String(error);
    fail(
      'INVALID_COMPONENT_REF',
      'standard component descriptor.component.kind',
      `is not an exact, decidable KindRef: ${reason}`,
    );
  }

  return {
    standardId,
    classification: view.classification as StandardClassification,
    descriptorVersion,
    component: { family: componentView.family as ComponentFamily, componentId, kind },
  };
}

/**
 * Structural fail-closed validation of a Standard Component descriptor.
 * Invalid exact identities are always rejected — never silently normalized.
 * Validation runs descriptor-safe on a snapshot of the caller descriptor
 * (#578): accessor/symbol-keyed/non-enumerable material and exotic
 * prototypes are typed rejections before any authority use. The caller input
 * is never frozen or mutated.
 */
export function validateStandardComponentDescriptor(descriptor: StandardComponentDescriptor): void {
  snapshotDescriptor(descriptor);
}

/**
 * Canonical Definition-plane identity material of one validated Standard
 * descriptor: exactly the versioned domain tag, the exact standardId, the
 * classification, the exact semantic descriptorVersion and the ordinary
 * exact Component reference. This object IS the descriptor digest material.
 */
export function standardDescriptorIdentityMaterial(descriptor: StandardComponentDescriptor): {
  readonly domain: typeof STANDARD_DESCRIPTOR_DIGEST_DOMAIN;
  readonly standardId: string;
  readonly classification: StandardClassification;
  readonly descriptorVersion: string;
  readonly component: ExactComponentRef;
} {
  const snapshot = snapshotDescriptor(descriptor);
  return Object.freeze({
    domain: STANDARD_DESCRIPTOR_DIGEST_DOMAIN,
    standardId: snapshot.standardId,
    classification: snapshot.classification,
    descriptorVersion: snapshot.descriptorVersion,
    component: Object.freeze({
      family: snapshot.component.family,
      componentId: snapshot.component.componentId,
      kind: Object.freeze({
        kindId: snapshot.component.kind.kindId,
        version: snapshot.component.kind.version,
      }),
    }),
  });
}

/**
 * Canonical descriptor digest material built from a module-owned
 * `SnapshotDescriptor` — byte-identical to `standardDescriptorIdentityMaterial`
 * output, used by the async recomputation phases of sealing/currentness where
 * the caller's descriptor must never be re-read after the first `await`.
 */
function descriptorDigestMaterial(snapshot: SnapshotDescriptor): {
  readonly domain: typeof STANDARD_DESCRIPTOR_DIGEST_DOMAIN;
  readonly standardId: string;
  readonly classification: StandardClassification;
  readonly descriptorVersion: string;
  readonly component: {
    readonly family: ComponentFamily;
    readonly componentId: ComponentId;
    readonly kind: { readonly kindId: string; readonly version: string };
  };
} {
  return {
    domain: STANDARD_DESCRIPTOR_DIGEST_DOMAIN,
    standardId: snapshot.standardId,
    classification: snapshot.classification,
    descriptorVersion: snapshot.descriptorVersion,
    component: {
      family: snapshot.component.family,
      componentId: snapshot.component.componentId,
      kind: { kindId: snapshot.component.kind.kindId, version: snapshot.component.kind.version },
    },
  };
}

function requireSha256Port(value: unknown, path: string, code: StandardContractErrorCode): Sha256Port {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as Sha256Port).digestUtf8 !== 'function'
  ) {
    fail(code, path, 'must be a Sha256Port ({ digestUtf8(value): Promise<string> })');
  }
  return value as Sha256Port;
}

/**
 * Descriptor semantic digest through the existing canonical-JSON + Sha256Port
 * seam. Validation and material snapshot run synchronously before the first
 * `await` (torn-snapshot discipline, same as #587 §E): the caller's
 * descriptor is never re-read after the digest suspension, so a caller
 * mutating its own descriptor while the promise is pending can never produce
 * torn descriptor evidence.
 */
export async function computeStandardDescriptorDigest(
  descriptor: StandardComponentDescriptor,
  sha256: Sha256Port,
): Promise<ContentDigest> {
  requireSha256Port(sha256, 'sha256', 'INVALID_STANDARD_DESCRIPTOR');
  const material = standardDescriptorIdentityMaterial(descriptor);
  return computeCanonicalJsonDigest(material, sha256);
}

// ---------------------------------------------------------------------------
// Assembly plane — Standard Set (curated exact pins for published descriptors)
// ---------------------------------------------------------------------------

/**
 * Exact reference to one published Standard descriptor as pinned inside a
 * Standard Set: exact standardId + exact descriptorVersion + the exact
 * descriptor content digest. Only identity material — never descriptor body
 * content, never implementation content.
 */
export interface StandardDescriptorRef {
  readonly standardId: string;
  readonly descriptorVersion: string;
  readonly descriptorDigest: ContentDigest;
}

/**
 * One curated Standard Set entry: an exact published-descriptor reference
 * paired with the exact KindImplementation pin bound to it. The pin is the
 * SAME generic T002B KindImplementation pin shape used for non-Standard
 * Components — no Standard-specific pin/registry/provider type exists.
 */
export interface StandardSetEntry {
  readonly descriptor: StandardDescriptorRef;
  readonly pin: KindImplementationPin;
}

/** Complete Standard Set sealing input. Authority-bearing material is
 * synchronously snapshotted at sealing; the caller's objects are never
 * frozen or mutated. */
export interface SealStandardSetInput {
  /** Curated descriptor->pin entries; one per exact published descriptor. */
  readonly entries: readonly StandardSetEntry[];
  /**
   * #652 D1 — REQUIRED verification-only descriptor context: the exact
   * current `StandardComponentDescriptor` bodies used to resolve each entry's
   * `StandardDescriptorRef`. This context is NOT new `StandardSetRecord`/
   * `setDigest` material and never changes `STANDARD_SET_DIGEST_DOMAIN` for
   * otherwise byte/semantically identical legitimate Sets; it exists solely
   * so sealing can prove descriptor/pin compatibility before minting. Each
   * entry's exact descriptor digest must recompute against its resolution
   * body and the exact descriptor `component.kind` must equal the entry pin
   * Kind; a missing/duplicate/ambiguous body fails closed — no
   * closest/latest/default lookup.
   */
  readonly currentDescriptors: readonly StandardComponentDescriptor[];
  /** Optional §G generic implementation-binding evidence slots (SAME opaque
   * slot type as the T002B Assembly record — e.g. future T003C Tool bindings).
   * #652 D3: a slot is legitimate only as the exact-subject slot of a
   * Tool-family descriptor entry; orphan slots fail closed, and every
   * Tool-family entry requires exactly one exact-subject slot. */
  readonly implementationBindingEvidence?: readonly AssemblyImplementationBindingEvidence[];
  /** Optional caller-claimed Set digest; verified against authoritative
   * recomputation, never trusted blindly. */
  readonly claimedSetDigest?: ContentDigest;
}

/**
 * Serializable, content-addressed Standard Set identity. This object IS the
 * setDigest material: the versioned domain tag, the exact entries
 * (order-normalized by exact descriptor key) and the §G evidence slots
 * (order-normalized by subject). No function, handle, secret or runtime
 * identity is representable here.
 */
export interface StandardSetRecord {
  readonly digestDomain: typeof STANDARD_SET_DIGEST_DOMAIN;
  /** Exact entries, sorted by `${standardId}@${descriptorVersion}`. */
  readonly entries: readonly StandardSetEntry[];
  /** Generic implementation-binding evidence slots, sorted by subject. */
  readonly implementationBindingEvidence: readonly AssemblyImplementationBindingEvidence[];
}

/** Unambiguous composite key over an exact descriptor reference (`@` never
 * occurs inside exact identity strings — embedded selectors are rejected). */
function descriptorKey(ref: StandardDescriptorRef): string {
  return `${ref.standardId}@${ref.descriptorVersion}`;
}

const SET_INPUT_FIELDS = new Set<string>([
  'entries',
  'currentDescriptors',
  'implementationBindingEvidence',
  'claimedSetDigest',
]);

const ENTRY_FIELDS = new Set<string>(['descriptor', 'pin']);

const DESCRIPTOR_REF_FIELDS = new Set<string>([
  'standardId',
  'descriptorVersion',
  'descriptorDigest',
]);

const PIN_FIELDS = new Set<string>(['kind', 'implementation']);

const IMPLEMENTATION_FIELDS = new Set<string>([
  'implementationId',
  'implementationVersion',
  'implementationDigest',
]);

const EVIDENCE_FIELDS = new Set<string>(['subject', 'bindingDigest']);

/** Snapshot one exact KindImplementation pin (SAME shape/rules as T002B §B). */
function snapshotPin(value: unknown, path: string): KindImplementationPin {
  const pinView = requireSafeRecord(value, path, 'INVALID_IMPLEMENTATION_PIN');
  const unexpectedPinField = Object.keys(pinView).find((key) => !PIN_FIELDS.has(key));
  if (unexpectedPinField !== undefined) {
    fail(
      'INVALID_IMPLEMENTATION_PIN',
      path,
      `must contain exactly {kind, implementation}; unexpected field "${unexpectedPinField}"`,
    );
  }

  // Kind-side exactness decision — consumed from kind-compatibility.ts (#573).
  let kind: KindRef;
  try {
    const decision = decideKindCompatibility(pinView.kind as KindRef, [pinView.kind as KindRef]);
    kind = { kindId: decision.supportedKind.kindId, version: decision.supportedKind.version };
  } catch (error) {
    const reason = error instanceof KindCompatibilityError ? error.message : String(error);
    fail(
      'INVALID_IMPLEMENTATION_PIN',
      `${path}.kind`,
      `is not an exact, decidable KindRef: ${reason}`,
    );
  }

  const implementationView = requireSafeRecord(
    pinView.implementation,
    `${path}.implementation`,
    'INVALID_IMPLEMENTATION_PIN',
  );
  const unexpectedImplField = Object.keys(implementationView).find(
    (key) => !IMPLEMENTATION_FIELDS.has(key),
  );
  if (unexpectedImplField !== undefined) {
    fail(
      'INVALID_IMPLEMENTATION_PIN',
      `${path}.implementation`,
      `must contain exactly {implementationId, implementationVersion, implementationDigest}; unexpected field "${unexpectedImplField}"`,
    );
  }
  const implementationId = requireExactIdentityString(
    implementationView.implementationId,
    `${path}.implementation.implementationId`,
    'INVALID_IMPLEMENTATION_PIN',
  );
  const implementationVersion = requireExactVersion(
    implementationView.implementationVersion,
    `${path}.implementation.implementationVersion`,
    'INVALID_IMPLEMENTATION_PIN',
  );
  if (!isContentDigest(implementationView.implementationDigest)) {
    fail(
      'INVALID_IMPLEMENTATION_PIN',
      `${path}.implementation.implementationDigest`,
      'must be a non-empty content digest string',
    );
  }

  return Object.freeze({
    kind: Object.freeze(kind),
    implementation: Object.freeze({
      implementationId,
      implementationVersion,
      implementationDigest: implementationView.implementationDigest,
    }),
  });
}

/** Snapshot one exact descriptor reference of a Set entry. */
function snapshotDescriptorRef(value: unknown, path: string): StandardDescriptorRef {
  const view = requireSafeRecord(value, path, 'INVALID_STANDARD_DESCRIPTOR_REF');
  const unexpectedField = Object.keys(view).find((key) => !DESCRIPTOR_REF_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_STANDARD_DESCRIPTOR_REF',
      path,
      `must contain exactly {standardId, descriptorVersion, descriptorDigest}; unexpected field "${unexpectedField}"`,
    );
  }
  const standardId = requireExactIdentityString(
    view.standardId,
    `${path}.standardId`,
    'INVALID_STANDARD_DESCRIPTOR_REF',
  );
  const descriptorVersion = requireExactVersion(
    view.descriptorVersion,
    `${path}.descriptorVersion`,
    'INVALID_STANDARD_DESCRIPTOR_REF',
  );
  if (!isContentDigest(view.descriptorDigest)) {
    fail(
      'INVALID_STANDARD_DESCRIPTOR_REF',
      `${path}.descriptorDigest`,
      'must be a non-empty content digest string',
    );
  }
  return Object.freeze({ standardId, descriptorVersion, descriptorDigest: view.descriptorDigest });
}

/**
 * Private anti-forgery brand + module-private mint registry for sealed
 * Standard Sets — the identical pattern as T002B: a property-style brand is
 * bypassable (prototype inheritance, reflective symbol extraction), so
 * WeakSet membership is the authoritative mint test; only `sealStandardSet`
 * can mint a member, so only a sealed Set can ever satisfy currentness
 * verification. The brand property is retained as own-property-only
 * defense in depth.
 */
const SEALED_STANDARD_SET_BRAND: unique symbol = Symbol('kaicreator.standard-set.sealed');
const SEALED_STANDARD_SET_MINTS = new WeakSet<object>();

/**
 * The sealed Standard Set: the serializable record plus the Set digest.
 * Sealing grants identity and currentness provenance ONLY — never
 * activation, occurrence or effect authority (#589: no Standard bypass).
 */
export interface SealedStandardSet {
  /** Serializable content-addressed identity (setDigest material). */
  readonly record: StandardSetRecord;
  /** Content digest of the record — changes with any identity-material change. */
  readonly setDigest: ContentDigest;
  readonly [SEALED_STANDARD_SET_BRAND]: true;
}

/**
 * Seal a Standard Set over a curated exact set of descriptor->pin entries.
 *
 * Authority boundary: every authority-bearing input is descriptor-safe
 * validated and synchronously snapshotted BEFORE the first `await`
 * (torn-snapshot discipline, same as #587 §E); after any suspension only
 * module-owned snapshot material is read. Duplicate exact descriptors and
 * duplicate evidence subjects fail closed (never first-wins). A
 * caller-claimed Set digest is verified against authoritative recomputation
 * and any mismatch fails closed.
 *
 * #652 D1 — descriptor ↔ KindImplementation compatibility at mint: each
 * entry is resolved against its exact body in the required verification-only
 * descriptor context; the pinned descriptorDigest must recompute from that
 * body and the exact descriptor `component.kind` must equal the exact pin
 * Kind (`STANDARD_SET_DESCRIPTOR_PIN_KIND_MISMATCH` otherwise). A
 * missing/duplicate/ambiguous descriptor body fails closed — never resolved
 * by a closest/latest/default lookup. #652 D3 — a §G evidence slot is
 * legitimate only as the exact-subject slot of a Tool-family descriptor
 * entry (orphan slots fail closed) and every Tool-family entry requires
 * exactly one such slot (`STANDARD_SET_TOOL_BINDING_REQUIRED`). The context
 * is verification input only and never enters `StandardSetRecord`/
 * `STANDARD_SET_DIGEST_DOMAIN` identity material.
 */
export async function sealStandardSet(
  input: SealStandardSetInput,
  sha256: Sha256Port,
): Promise<SealedStandardSet> {
  requireSha256Port(sha256, 'sha256', 'INVALID_STANDARD_SET_INPUT');

  // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
  const inputView = requireSafeRecord(input, 'standard set seal input', 'INVALID_STANDARD_SET_INPUT');
  const unexpectedInputField = Object.keys(inputView).find((key) => !SET_INPUT_FIELDS.has(key));
  if (unexpectedInputField !== undefined) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'standard set seal input',
      `must not carry unknown field "${unexpectedInputField}"`,
    );
  }
  if (!('entries' in inputView)) {
    fail('INVALID_STANDARD_SET_INPUT', 'standard set seal input.entries', 'is required');
  }
  if (!('currentDescriptors' in inputView)) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'standard set seal input.currentDescriptors',
      'is required (the verification-only descriptor context used to resolve every entry against its exact body; it is never Set identity material)',
    );
  }

  // #652 D1 — verification-only descriptor context: every body is
  // descriptor-safely validated and snapshotted in the synchronous phase.
  // Duplicate bodies under one exact key are ambiguous and fail closed.
  const contextArray = safeArraySnapshot(
    inputView.currentDescriptors,
    'standard set seal input.currentDescriptors',
  );
  if (!contextArray.ok) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'standard set seal input.currentDescriptors',
      contextArray.issue.violation === 'NOT_AN_ARRAY'
        ? 'must be an array of current Standard descriptor bodies'
        : describeRecordSafetyIssue(contextArray.issue),
    );
  }
  const descriptorBodiesByKey = new Map<string, SnapshotDescriptor>();
  for (const candidate of contextArray.snapshot) {
    const body = snapshotDescriptor(candidate);
    const bodyKey = `${body.standardId}@${body.descriptorVersion}`;
    if (descriptorBodiesByKey.has(bodyKey)) {
      fail(
        'DUPLICATE_STANDARD_DESCRIPTOR',
        'standard set seal input.currentDescriptors',
        `declares ${bodyKey} more than once (ambiguous descriptor resolution fails closed; never first-wins, no closest/latest/default lookup)`,
      );
    }
    descriptorBodiesByKey.set(bodyKey, body);
  }

  const entriesArray = safeArraySnapshot(inputView.entries, 'standard set seal input.entries');
  if (!entriesArray.ok) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'standard set seal input.entries',
      entriesArray.issue.violation === 'NOT_AN_ARRAY'
        ? 'must be an array of descriptor->pin entries'
        : describeRecordSafetyIssue(entriesArray.issue),
    );
  }
  const seenDescriptors = new Set<string>();
  interface ResolvedSealEntry {
    readonly entry: StandardSetEntry;
    readonly body: SnapshotDescriptor;
  }
  const resolvedEntries: ResolvedSealEntry[] = entriesArray.snapshot.map((candidate, index) => {
    const at = `standard set entry [${index}]`;
    const view = requireSafeRecord(candidate, at, 'INVALID_STANDARD_SET_INPUT');
    const unexpectedEntryField = Object.keys(view).find((key) => !ENTRY_FIELDS.has(key));
    if (unexpectedEntryField !== undefined) {
      fail(
        'INVALID_STANDARD_SET_INPUT',
        at,
        `must contain exactly {descriptor, pin}; unexpected field "${unexpectedEntryField}"`,
      );
    }
    const descriptor = snapshotDescriptorRef(view.descriptor, `${at}.descriptor`);
    if (seenDescriptors.has(descriptorKey(descriptor))) {
      fail(
        'DUPLICATE_STANDARD_DESCRIPTOR',
        `${at}.descriptor`,
        `declares ${descriptorKey(descriptor)} more than once (one exact pin per published descriptor; never first-wins)`,
      );
    }
    seenDescriptors.add(descriptorKey(descriptor));
    // #652 D1 — the entry must resolve to exactly one context body.
    const body = descriptorBodiesByKey.get(descriptorKey(descriptor));
    if (body === undefined) {
      fail(
        'INVALID_STANDARD_SET_INPUT',
        `${at}.descriptor`,
        `declares ${descriptorKey(descriptor)} but the verification-only descriptor context contains no descriptor body for it (missing resolution fails closed; no closest/latest/default lookup)`,
      );
    }
    return {
      entry: Object.freeze({
        descriptor,
        pin: snapshotPin(view.pin, `${at}.pin`),
      }),
      body,
    };
  });

  const evidenceArray = safeArraySnapshot(
    'implementationBindingEvidence' in inputView ? inputView.implementationBindingEvidence : [],
    'standard set seal input.implementationBindingEvidence',
  );
  if (!evidenceArray.ok) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'standard set seal input.implementationBindingEvidence',
      describeRecordSafetyIssue(evidenceArray.issue),
    );
  }
  const seenSubjects = new Set<string>();
  const evidence: AssemblyImplementationBindingEvidence[] = evidenceArray.snapshot.map(
    (candidate, index) => {
      const at = `implementation binding evidence [${index}]`;
      const view = requireSafeRecord(candidate, at, 'INVALID_STANDARD_SET_INPUT');
      const unexpectedField = Object.keys(view).find((key) => !EVIDENCE_FIELDS.has(key));
      if (unexpectedField !== undefined) {
        fail(
          'INVALID_STANDARD_SET_INPUT',
          at,
          `must contain exactly {subject, bindingDigest}; unexpected field "${unexpectedField}" (Tool-specific binding semantics are T003C-owned and never enter the generic slot)`,
        );
      }
      const subject = requireExactIdentityString(view.subject, `${at}.subject`, 'INVALID_STANDARD_SET_INPUT');
      if (!isContentDigest(view.bindingDigest)) {
        fail('INVALID_STANDARD_SET_INPUT', `${at}.bindingDigest`, 'must be a non-empty content digest string');
      }
      if (seenSubjects.has(subject)) {
        fail(
          'DUPLICATE_BINDING_EVIDENCE',
          `${at}.subject`,
          `declares ${subject} more than once (binding evidence slots are unique per subject; duplicates are never first-wins)`,
        );
      }
      seenSubjects.add(subject);
      return Object.freeze({ subject, bindingDigest: view.bindingDigest });
    },
  );

  // #652 D3 — curated-set evidence discipline: a §G slot exists only as the
  // exact-subject slot of a Tool-family descriptor entry of this Set; orphan
  // slots fail closed. Symmetrically, every Tool-family entry requires
  // exactly one exact-subject slot at mint.
  const toolSubjects = new Set<string>();
  for (const resolved of resolvedEntries) {
    if (resolved.body.component.family === 'tool') {
      toolSubjects.add(resolved.body.component.componentId);
    }
  }
  for (const [index, slot] of evidence.entries()) {
    if (!toolSubjects.has(slot.subject)) {
      fail(
        'INVALID_STANDARD_SET_INPUT',
        `implementation binding evidence [${index}].subject`,
        `declares ${slot.subject}, which maps to no Tool-family descriptor entry of this Set (orphan evidence fails closed; no opaque slots in a curated Standard Set)`,
      );
    }
  }
  for (const resolved of resolvedEntries) {
    if (resolved.body.component.family !== 'tool') {
      continue;
    }
    const subject = resolved.body.component.componentId;
    if (!seenSubjects.has(subject)) {
      fail(
        'STANDARD_SET_TOOL_BINDING_REQUIRED',
        `standard set entry ${descriptorKey(resolved.entry.descriptor)}`,
        `classifies Tool-family component ${subject} but the Set carries no implementation-binding evidence slot with that exact subject (every Tool-family entry requires exactly one §G slot at mint; missing slots fail closed)`,
      );
    }
  }

  const claimed = inputView.claimedSetDigest;
  if (claimed !== undefined && !isContentDigest(claimed)) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'standard set seal input.claimedSetDigest',
      'must be a non-empty content digest string when present',
    );
  }

  // ---- PHASE 2 (async): authoritative recomputation only; no caller-owned
  // re-read after this point.
  // #652 D1 — resolve each entry against its exact body: the pinned
  // descriptorDigest must recompute from the resolution body, and the exact
  // descriptor Kind must equal the exact pin Kind; any mismatch fails closed
  // BEFORE Set mint.
  for (const resolved of resolvedEntries) {
    const key = descriptorKey(resolved.entry.descriptor);
    const recomputed = await computeCanonicalJsonDigest(
      descriptorDigestMaterial(resolved.body),
      sha256,
    );
    if (recomputed !== resolved.entry.descriptor.descriptorDigest) {
      fail(
        'INVALID_STANDARD_SET_INPUT',
        `standard set entry ${key}.descriptor.descriptorDigest`,
        'does not equal the authoritative recomputation of the resolution descriptor body supplied in the verification-only context (the entry is not pinned to the exact body that resolves it; fail closed)',
      );
    }
    if (
      resolved.body.component.kind.kindId !== resolved.entry.pin.kind.kindId ||
      resolved.body.component.kind.version !== resolved.entry.pin.kind.version
    ) {
      fail(
        'STANDARD_SET_DESCRIPTOR_PIN_KIND_MISMATCH',
        `standard set entry ${key}`,
        `pins exact Kind ${resolved.entry.pin.kind.kindId}@${resolved.entry.pin.kind.version} but its resolution descriptor classifies component ${resolved.body.component.componentId} at exact Kind ${resolved.body.component.kind.kindId}@${resolved.body.component.kind.version} — a descriptor ref may never be minted against an unrelated exact Kind pin (fails closed before Set mint)`,
      );
    }
  }

  const record: StandardSetRecord = Object.freeze({
    digestDomain: STANDARD_SET_DIGEST_DOMAIN,
    entries: Object.freeze(
      resolvedEntries
        .map((resolved) => resolved.entry)
        .sort((a, b) => lexicalCompare(descriptorKey(a.descriptor), descriptorKey(b.descriptor))),
    ),
    implementationBindingEvidence: Object.freeze(
      [...evidence].sort((a, b) => lexicalCompare(a.subject, b.subject)),
    ),
  });
  const setDigest = await computeCanonicalJsonDigest(record, sha256);
  if (claimed !== undefined && claimed !== setDigest) {
    fail(
      'STANDARD_SET_CURRENTNESS_MISMATCH',
      'standard set seal input.claimedSetDigest',
      'the supplied Set entries do not correspond to the claimed exact Set digest; sealing is bound to the authoritatively recomputed Set digest and stale/mismatching claims fail closed',
    );
  }

  const sealed = Object.freeze({
    record,
    setDigest,
    [SEALED_STANDARD_SET_BRAND]: true as const,
  });
  SEALED_STANDARD_SET_MINTS.add(sealed);
  return sealed;
}

// ---------------------------------------------------------------------------
// Descriptor currentness for a sealed Standard Set
// ---------------------------------------------------------------------------

/** Authoritative mint test for sealed Standard Sets (see the brand docs). */
function isSealedStandardSet(value: unknown): value is SealedStandardSet {
  return (
    typeof value === 'object' &&
    value !== null &&
    SEALED_STANDARD_SET_MINTS.has(value) &&
    Object.hasOwn(value, SEALED_STANDARD_SET_BRAND) &&
    (value as Record<typeof SEALED_STANDARD_SET_BRAND, unknown>)[SEALED_STANDARD_SET_BRAND] === true
  );
}

export interface StandardSetCurrentnessOptions {
  /** The current published Standard descriptors of the Domain. Each sealed
   * entry's descriptor reference must match one exactly (same standardId +
   * descriptorVersion) and its content digest is authoritatively recomputed
   * from the supplied descriptor — never trusted from the caller. */
  readonly currentDescriptors: readonly StandardComponentDescriptor[];
  /**
   * #652 D2 — the exact current Definition graph. Every referenced Component
   * is located in it (exact componentId/family/Kind must match the descriptor)
   * and admitted through the generic T002B authority against the SAME final
   * Assembly; a stale or foreign graph fails closed through the owning T002B
   * typed failure.
   */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /**
   * #652 D2 — the exact current final sealed Runtime Assembly (genuine T002B
   * mint). Every entry's implementation currentness is proven against it; a
   * caller-constructed lookalike can never supply currentness authority.
   */
  readonly finalAssembly: SealedRuntimeAssembly;
  /**
   * #652 D3 — the exact caller-supplied set of already-minted T003C sealed
   * Tool implementation bindings (supply an empty array when the Set has no
   * Tool-family entries). Matched only by exact verified Tool component
   * identity — never registry order, latest or default — and re-proven
   * through the accepted #640 consumer verifier against the SAME final
   * Assembly.
   */
  readonly sealedToolBindings: readonly SealedToolImplementationBinding[];
  readonly sha256: Sha256Port;
}

/** Frozen currentness evidence: identity material only, never authority. */
export interface StandardSetCurrentnessResult {
  readonly status: 'CURRENT';
  readonly setDigest: ContentDigest;
  readonly checkedDescriptors: number;
  /**
   * #652 D2 — exact content digest of the current final Assembly currentness
   * was decided against. Fresh, frozen, non-aliased evidence — never an
   * authority registry.
   */
  readonly finalAssemblyDigest: ContentDigest;
}

/**
 * Fresh deep snapshot of an already-validated Definition graph envelope:
 * canonicalized per-component/per-relation plain frozen copies under the
 * exact graphId. Graph identity excludes non-behavioral extensions and is
 * order-normalized, so the snapshot preserves digest semantics exactly while
 * carrying no caller alias into the async phase (#652 D2 torn-snapshot
 * discipline: caller mutation while a digest is pending can never produce
 * torn currentness).
 */
function snapshotDefinitionGraph(envelope: DefinitionGraphEnvelope): DefinitionGraphEnvelope {
  return Object.freeze({
    graphId: envelope.graphId,
    components: Object.freeze(
      envelope.components.map(
        (component) =>
          Object.freeze({
            ...(canonicalizeJson(component) as Record<string, unknown>),
          }) as unknown as ComponentEnvelope,
      ),
    ),
    relations: Object.freeze(
      envelope.relations.map(
        (relation) =>
          Object.freeze({
            ...(canonicalizeJson(relation) as Record<string, unknown>),
          }) as unknown as DefinitionRelation,
      ),
    ),
  });
}

/**
 * Prove a sealed Standard Set current against the exact current published
 * Standard descriptors, the exact current Definition graph and the exact
 * current final sealed Runtime Assembly by authoritative recomputation
 * (#652 D2/D3).
 *
 * The caller's inputs are validated and snapshotted synchronously before the
 * first `await`; after any suspension only module-owned snapshot material is
 * read (torn-snapshot discipline, same as #587 §E). Every sealed entry must
 * resolve to exactly one current descriptor (missing OR recomputed-digest-
 * mismatch fails closed with STANDARD_DESCRIPTOR_CURRENTNESS_MISMATCH;
 * duplicate current descriptors under one exact key fail closed as well).
 *
 * #652 D2 — implementation currentness is real: the referenced Component is
 * located in the exact current Definition graph (exact componentId/family/
 * Kind must match the descriptor) and admitted through the generic T002B
 * authority (`admitComponentWithAssembly`) against the SAME current graph and
 * final Assembly; the admitted KindImplementation pin must equal the entry
 * pin byte/semantic-exactly or the Set is stale
 * (STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH). T002B typed failures
 * propagate unchanged when owned there.
 *
 * #652 D3 — Tool-family entries are proven through the accepted #640 T003C
 * consumer verifier (`verifyToolImplementationBinding`) against the SAME
 * final Assembly, with exactly one caller-supplied sealed binding per exact
 * Tool component identity; the verified toolComponentId and bindingDigest
 * must equal the Set's exact subject slot
 * (STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH for the Set↔binding
 * linkage; owning #640 typed failures propagate unchanged). Semantic-family
 * descriptors require no Tool binding.
 */
export async function verifyStandardSetCurrentness(
  set: SealedStandardSet,
  options: StandardSetCurrentnessOptions,
): Promise<StandardSetCurrentnessResult> {
  if (!isSealedStandardSet(set)) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'standard set currentness input',
      'currentness verification requires a SealedStandardSet minted by sealStandardSet; a caller-constructed set can never carry the sealed-Set mint registry membership',
    );
  }

  const optionsView = requireSafeRecord(options, 'currentness options', 'INVALID_STANDARD_SET_INPUT');
  const unexpectedOptionField = Object.keys(optionsView).find(
    (key) =>
      key !== 'currentDescriptors' &&
      key !== 'currentDefinitionGraph' &&
      key !== 'finalAssembly' &&
      key !== 'sealedToolBindings' &&
      key !== 'sha256',
  );
  if (unexpectedOptionField !== undefined) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'currentness options',
      `must contain exactly {currentDescriptors, currentDefinitionGraph, finalAssembly, sealedToolBindings, sha256}; unexpected field "${unexpectedOptionField}"`,
    );
  }
  if (!('currentDefinitionGraph' in optionsView)) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'currentness options.currentDefinitionGraph',
      'is required (implementation currentness is proven against the exact current Definition graph; a Set is never CURRENT on descriptor digests alone)',
    );
  }
  if (!('finalAssembly' in optionsView)) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'currentness options.finalAssembly',
      'is required (implementation currentness is proven against the exact current final sealed Assembly; a Set is never CURRENT on descriptor digests alone)',
    );
  }
  if (!('sealedToolBindings' in optionsView)) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'currentness options.sealedToolBindings',
      'is required (the exact caller-supplied set of already-minted T003C sealed Tool bindings; supply an empty array when the Set has no Tool-family entries)',
    );
  }
  const sha256 = requireSha256Port(optionsView.sha256, 'currentness options.sha256', 'INVALID_STANDARD_SET_INPUT');

  // ---- Synchronous snapshot phase (#587 §E / #652 D2): every
  // authority-bearing input is validated and snapshotted before the first
  // await; after any suspension only module-owned snapshot material is read.

  // (a) Current descriptors — exact-key snapshot map.
  const descriptorsArray = safeArraySnapshot(
    optionsView.currentDescriptors,
    'currentness options.currentDescriptors',
  );
  if (!descriptorsArray.ok) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'currentness options.currentDescriptors',
      descriptorsArray.issue.violation === 'NOT_AN_ARRAY'
        ? 'must be an array of current Standard descriptors'
        : describeRecordSafetyIssue(descriptorsArray.issue),
    );
  }
  const currentByKey = new Map<string, SnapshotDescriptor>();
  for (const candidate of descriptorsArray.snapshot) {
    const snapshot = snapshotDescriptor(candidate);
    const key = `${snapshot.standardId}@${snapshot.descriptorVersion}`;
    if (currentByKey.has(key)) {
      fail(
        'STANDARD_DESCRIPTOR_CURRENTNESS_MISMATCH',
        'currentness options.currentDescriptors',
        `declares ${key} more than once (current descriptors must be unambiguous; duplicates are never first-wins)`,
      );
    }
    currentByKey.set(key, snapshot);
  }

  // (b) Current Definition graph — validated (typed failures owned by the
  // definition-graph contract propagate unchanged), then deep-snapshotted as
  // fresh frozen material so no caller alias survives into the async phase.
  const graphEnvelope = optionsView.currentDefinitionGraph as DefinitionGraphEnvelope;
  validateDefinitionGraphEnvelope(graphEnvelope);
  const currentGraph = snapshotDefinitionGraph(graphEnvelope);
  const componentById = new Map<string, ComponentEnvelope>();
  for (const component of currentGraph.components) {
    componentById.set(component.componentId, component);
  }

  // (c) Final Assembly — authenticity remains T002B-owned: the input must be
  // a genuine sealRuntimeAssembly mint, proven through the accepted read-only
  // T002B guard. The checked digest is read as an own data property.
  const finalAssembly: unknown = optionsView.finalAssembly;
  if (
    typeof finalAssembly !== 'object' ||
    finalAssembly === null ||
    !isSealedRuntimeAssembly(finalAssembly)
  ) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'currentness options.finalAssembly',
      'must be a SealedRuntimeAssembly minted by sealRuntimeAssembly — final-Assembly authenticity remains T002B-owned and a caller-constructed lookalike can never supply currentness authority',
    );
  }
  const assemblyDigestDescriptor = Object.getOwnPropertyDescriptor(finalAssembly, 'assemblyDigest');
  if (
    assemblyDigestDescriptor === undefined ||
    !('value' in assemblyDigestDescriptor) ||
    typeof assemblyDigestDescriptor.value !== 'string' ||
    !isContentDigest(assemblyDigestDescriptor.value)
  ) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'currentness options.finalAssembly.assemblyDigest',
      'must be an own data property carrying a non-empty content digest string',
    );
  }
  const finalAssemblyDigest = assemblyDigestDescriptor.value;

  // (d) Caller-supplied sealed Tool bindings — capture the indexing identity
  // descriptor-safely. AUTHORITY is never trusted from this capture: every
  // selected binding is re-proven through the accepted #640 T003C verifier.
  const bindingsArray = safeArraySnapshot(
    optionsView.sealedToolBindings,
    'currentness options.sealedToolBindings',
  );
  if (!bindingsArray.ok) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'currentness options.sealedToolBindings',
      bindingsArray.issue.violation === 'NOT_AN_ARRAY'
        ? 'must be an array of already-minted sealed Tool implementation bindings'
        : describeRecordSafetyIssue(bindingsArray.issue),
    );
  }
  const bindingsBySubject = new Map<string, SealedToolImplementationBinding[]>();
  for (const [index, candidate] of bindingsArray.snapshot.entries()) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      fail(
        'INVALID_STANDARD_SET_INPUT',
        `currentness options.sealedToolBindings[${index}]`,
        'must be a sealed Tool implementation binding object',
      );
    }
    const evidenceDescriptor = Object.getOwnPropertyDescriptor(candidate, 'evidence');
    if (evidenceDescriptor === undefined || !('value' in evidenceDescriptor)) {
      fail(
        'INVALID_STANDARD_SET_INPUT',
        `currentness options.sealedToolBindings[${index}].evidence`,
        'must be an own data property of a sealed Tool implementation binding',
      );
    }
    const evidenceView = safeRecordSnapshot(
      evidenceDescriptor.value,
      `currentness options.sealedToolBindings[${index}].evidence`,
    );
    if (!evidenceView.ok) {
      fail(
        'INVALID_STANDARD_SET_INPUT',
        `currentness options.sealedToolBindings[${index}].evidence`,
        describeRecordSafetyIssue(evidenceView.issue),
      );
    }
    const toolComponentId = evidenceView.snapshot.toolComponentId;
    if (typeof toolComponentId !== 'string' || !isNonEmptyIdentityString(toolComponentId)) {
      fail(
        'INVALID_STANDARD_SET_INPUT',
        `currentness options.sealedToolBindings[${index}].evidence.toolComponentId`,
        'must be a non-empty exact Tool component identity (the only permitted index of a sealed binding)',
      );
    }
    const bucket = bindingsBySubject.get(toolComponentId);
    if (bucket === undefined) {
      bindingsBySubject.set(toolComponentId, [candidate as SealedToolImplementationBinding]);
    } else {
      bucket.push(candidate as SealedToolImplementationBinding);
    }
  }

  // ---- Async phase 1 (#652 D2): per-entry descriptor resolution and real
  // implementation currentness against the exact current graph + Assembly.
  interface ToolLinkage {
    readonly entryKey: string;
    readonly slot: AssemblyImplementationBindingEvidence;
  }
  const toolLinkages = new Map<string, ToolLinkage>();
  for (const entry of set.record.entries) {
    const key = descriptorKey(entry.descriptor);
    const current = currentByKey.get(key);
    if (current === undefined) {
      fail(
        'STANDARD_DESCRIPTOR_CURRENTNESS_MISMATCH',
        `standard set entry ${key}`,
        'has no current published descriptor with that exact standardId + descriptorVersion (stale or unpublished descriptors fail closed before any authority use)',
      );
    }
    const recomputed = await computeCanonicalJsonDigest(
      descriptorDigestMaterial(current),
      sha256,
    );
    if (recomputed !== entry.descriptor.descriptorDigest) {
      fail(
        'STANDARD_DESCRIPTOR_CURRENTNESS_MISMATCH',
        `standard set entry ${key}`,
        'the current descriptor content digest does not match the exact digest pinned in the sealed Set; semantics changed without a descriptor version bump (or the pinned digest is stale) and fails closed',
      );
    }

    // Locate the exact referenced Component in the current Definition graph.
    const referenced = componentById.get(current.component.componentId);
    if (referenced === undefined) {
      fail(
        'STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH',
        `standard set entry ${key}`,
        `references component ${current.component.componentId}, which the current Definition graph does not bind (implementation currentness cannot be proven against the exact current Definition; fail closed)`,
      );
    }
    if (referenced.family !== current.component.family) {
      fail(
        'STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH',
        `standard set entry ${key}`,
        `references component ${current.component.componentId} as family ${current.component.family}, but the current Definition graph binds it as family ${referenced.family} (exact family must match the descriptor; fail closed)`,
      );
    }
    if (
      referenced.kind.kindId !== current.component.kind.kindId ||
      referenced.kind.version !== current.component.kind.version
    ) {
      fail(
        'STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH',
        `standard set entry ${key}`,
        `references component ${current.component.componentId} at exact Kind ${current.component.kind.kindId}@${current.component.kind.version}, but the current Definition graph binds it at exact Kind ${referenced.kind.kindId}@${referenced.kind.version} (exact Kind must match the descriptor; fail closed)`,
      );
    }

    // Admit the referenced Component through the SAME generic T002B authority
    // (admitComponentWithAssembly) against the SAME current graph snapshot
    // and the SAME final Assembly. T002B typed failures propagate unchanged
    // when owned there.
    const admission = await admitComponentWithAssembly(referenced, finalAssembly, {
      currentDefinitionGraph: currentGraph,
      sha256,
    });
    const admitted = admission.admittedKindImplementation;
    const pin = entry.pin;
    if (
      admitted.kind.kindId !== pin.kind.kindId ||
      admitted.kind.version !== pin.kind.version ||
      admitted.implementation.implementationId !== pin.implementation.implementationId ||
      admitted.implementation.implementationVersion !== pin.implementation.implementationVersion ||
      admitted.implementation.implementationDigest !== pin.implementation.implementationDigest
    ) {
      fail(
        'STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH',
        `standard set entry ${key}`,
        `pins implementation ${pin.implementation.implementationId}@${pin.implementation.implementationVersion} (${pin.implementation.implementationDigest}) for exact Kind ${pin.kind.kindId}@${pin.kind.version}, but the exact current final Assembly admits implementation ${admitted.implementation.implementationId}@${admitted.implementation.implementationVersion} (${admitted.implementation.implementationDigest}) for that exact Kind — any current Assembly Kind-implementation replacement makes the old Set stale (fail closed)`,
      );
    }

    // Collect the Tool-family linkages (#652 D3) on the resolved bodies.
    if (current.component.family === 'tool') {
      const slot = set.record.implementationBindingEvidence.find(
        (candidate) => candidate.subject === current.component.componentId,
      );
      if (slot === undefined) {
        fail(
          'STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH',
          `standard set entry ${key}`,
          `classifies Tool-family component ${current.component.componentId} but the sealed Set carries no exact-subject §G slot for it (stale or foreign Set; fail closed)`,
        );
      }
      toolLinkages.set(current.component.componentId, { entryKey: key, slot });
    }
  }

  // ---- Async phase 2 (#652 D3): Tool-family entries are proven through the
  // accepted #640 T003C consumer verifier against the SAME final Assembly.
  // Matching is by exact verified Tool component identity only — never
  // registry order, latest or default.
  for (const [suppliedSubject] of bindingsBySubject) {
    if (!toolLinkages.has(suppliedSubject)) {
      fail(
        'STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH',
        `sealed Tool binding subject ${suppliedSubject}`,
        'maps to no Tool-family descriptor entry of this Set (orphan bindings fail closed; no opaque linkage in a curated Standard Set)',
      );
    }
  }
  for (const [subject, linkage] of toolLinkages) {
    const candidates = bindingsBySubject.get(subject);
    if (candidates === undefined || candidates.length === 0) {
      fail(
        'STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH',
        `standard set tool subject ${subject} (entry ${linkage.entryKey})`,
        'has no sealed Tool binding in the exact caller-supplied set (missing bindings fail closed; never repaired by registry order, latest or default)',
      );
    }
    if (candidates.length > 1) {
      fail(
        'STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH',
        `standard set tool subject ${subject} (entry ${linkage.entryKey})`,
        `has ${candidates.length} sealed Tool bindings in the exact caller-supplied set (ambiguous linkage fails closed; never first-wins)`,
      );
    }
    // The accepted #640 verifier owns mint authenticity, evidence digest
    // recomputation and final-Assembly currentness; its typed failures
    // propagate unchanged.
    const verified = await verifyToolImplementationBinding({
      binding: candidates[0]!,
      finalAssembly,
      sha256,
    });
    if (verified.evidence.toolComponentId !== subject || verified.currentness.subject !== subject) {
      fail(
        'STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH',
        `standard set tool subject ${subject} (entry ${linkage.entryKey})`,
        'was verified against a binding whose exact Tool component identity differs (the Set↔verified-binding linkage is exact; fail closed)',
      );
    }
    if (verified.currentness.bindingDigest !== linkage.slot.bindingDigest) {
      fail(
        'STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH',
        `standard set tool subject ${subject} (entry ${linkage.entryKey})`,
        `carries Set slot digest ${linkage.slot.bindingDigest} but the verified binding carries ${verified.currentness.bindingDigest} — the Set's exact subject slot must equal the verified binding (replaced/mismatched linkage fails closed)`,
      );
    }
  }

  return Object.freeze({
    status: 'CURRENT' as const,
    setDigest: set.setDigest,
    checkedDescriptors: set.record.entries.length,
    finalAssemblyDigest,
  });
}

// ---------------------------------------------------------------------------
// Deterministic bootstrap-candidate eligibility (consumed by T006B/T006C)
// ---------------------------------------------------------------------------

/**
 * One bootstrap-candidate input: a Standard descriptor plus, when one has
 * been accepted on the integration HEAD, its reference implementation pin.
 * The selector never invents missing pins or descriptors.
 *
 * #653 R1: the candidate record and its authority-bearing nested material
 * (descriptor, reference implementation pin) are fail-closed contract input —
 * a malformed or unsafe structure is a deterministic typed invalid-input
 * failure, never silently skipped and never reinterpreted as mere
 * ineligibility.
 */
export interface StandardBootstrapCandidate {
  readonly descriptor: StandardComponentDescriptor;
  /** Accepted reference implementation, bound to the descriptor's exact
   * Kind. Absent when no implementation has been accepted yet — such a
   * candidate is ineligible. */
  readonly referenceImplementation?: KindImplementationPin;
}

/**
 * Canonical exact ComponentRef text: the deterministic ordering key of the
 * bootstrap-candidate eligibility rule. Code-unit comparison over the
 * canonical JSON material — total, locale-independent, and identical across
 * runs and hosts.
 */
export function canonicalComponentRef(ref: ExactComponentRef): string {
  return canonicalJsonStringify({
    family: ref.family,
    componentId: ref.componentId,
    kind: { kindId: ref.kind.kindId, version: ref.kind.version },
  });
}

/**
 * Deterministically select the bootstrap-candidate fixture for one ordinary
 * Component family (#589 PACK-C eligibility rules 1-4).
 *
 * Eligible = the descriptor validates as an exact published/supported
 * Standard descriptor, its component is of the requested ordinary family,
 * AND an accepted reference implementation is supplied whose exact KindRef
 * matches the descriptor's component Kind. Among eligible candidates the
 * lexicographically smallest canonical exact ComponentRef wins.
 *
 * #653 D4/D5 hardening (BOUNDED PLANNING AMENDMENT #653@6011791871):
 * - R1 — candidate safety is absolute: EVERY candidate record is
 *   descriptor-safely snapshotted before eligibility inspection, and so is
 *   every authority-bearing nested material it carries. Accessor/exotic/
 *   hidden/symbol-keyed material, a malformed descriptor shape, a malformed
 *   pin shape or any other unsafe structural input is a deterministic typed
 *   invalid-input failure (`StandardContractError`) — there is NO
 *   silent-skip path and malformed input is never reinterpreted as merely
 *   "ineligible". Valid but genuinely ineligible candidates (wrong family,
 *   no accepted implementation yet, pin Kind not matching the exact component
 *   Kind) remain an ordinary filter decided only after the whole pool is
 *   examined;
 * - D4 — the returned candidate is fresh, frozen and non-aliased: it is
 *   rebuilt exclusively from module-owned snapshot material, so caller
 *   mutation after selection can never change what T006B/T006C consume, and
 *   the caller input is never frozen or mutated;
 * - D5/G1 — the PACK-C primary key (lexicographically smallest canonical
 *   exact ComponentRef) is preserved and never preceded or altered; the
 *   exact reference-implementation identity participates ONLY as the
 *   deterministic tie-breaker after the descriptor-side keys
 *   (classification, standardId, descriptorVersion), removing
 *   stable-sort/input-position authority when otherwise-equal candidates
 *   share the same canonical exact ComponentRef. Exact duplicate semantic
 *   candidates deduplicate by exact identity — never first/latest/default
 *   selection.
 *
 * This selection is for FIXTURE CONSTRUCTION ONLY — the function is pure and
 * never performs runtime provider selection, binding or dispatch. When
 * nothing is eligible the family-specific typed STANDARD_*_CANDIDATE_ABSENT
 * failure is thrown and the caller must return to ChatGPT Web — a candidate
 * is NEVER invented locally.
 */
export function selectStandardBootstrapCandidate(
  candidates: readonly StandardBootstrapCandidate[],
  family: ComponentFamily,
): StandardBootstrapCandidate {
  const list = safeArraySnapshot(candidates, 'standard bootstrap candidates');
  if (!list.ok) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'standard bootstrap candidates',
      list.issue.violation === 'NOT_AN_ARRAY'
        ? 'must be an array of candidates'
        : describeRecordSafetyIssue(list.issue),
    );
  }

  interface EligibleEntry {
    readonly identityKey: string;
    readonly snapshot: SnapshotDescriptor;
    readonly pinSnapshot: KindImplementationPin;
  }
  const eligible: EligibleEntry[] = [];
  const seenIdentities = new Set<string>();
  for (const [index, entry] of list.snapshot.entries()) {
    const at = `standard bootstrap candidate [${index}]`;
    // #653 R1 — the candidate record itself is authority-bearing input and
    // must be an ordinary descriptor-safe record: accessor/exotic/hidden/
    // symbol-keyed material fails closed typed before any field is read
    // (a hidden getter can never execute as part of validation or failure).
    const view = requireSafeRecord(entry, at, 'INVALID_STANDARD_SET_INPUT');
    const unexpectedCandidateField = Object.keys(view).find(
      (key) => key !== 'descriptor' && key !== 'referenceImplementation',
    );
    if (unexpectedCandidateField !== undefined) {
      fail(
        'INVALID_STANDARD_SET_INPUT',
        at,
        `must contain exactly {descriptor, referenceImplementation?}; unexpected field "${unexpectedCandidateField}"`,
      );
    }
    if (!('descriptor' in view) || view.descriptor === undefined) {
      fail(
        'INVALID_STANDARD_SET_INPUT',
        `${at}.descriptor`,
        'is required (a candidate without descriptor material is malformed authority-bearing input; it fails closed — it is never silently skipped)',
      );
    }
    // #653 R1 — a malformed/unsafe nested descriptor is a deterministic typed
    // invalid-input failure (the descriptor snapshot's own typed codes
    // propagate unchanged); it is never reinterpreted as ineligibility.
    const snapshot = snapshotDescriptor(view.descriptor);

    // Genuinely ineligible: another family's pool never sees this candidate.
    if (snapshot.component.family !== family) {
      continue;
    }

    // Absence of an accepted reference implementation is legitimate
    // ineligibility; a PRESENT pin is authority-bearing nested material —
    // #653 R1: its malformed/unsafe shape fails closed typed (an explicit
    // `null` is malformed structure, not absence).
    if (!('referenceImplementation' in view) || view.referenceImplementation === undefined) {
      continue;
    }
    const pinSnapshot = snapshotPin(view.referenceImplementation, `${at}.referenceImplementation`);

    // Genuinely ineligible: the accepted implementation must be bound to the
    // descriptor's exact component Kind.
    if (
      pinSnapshot.kind.kindId !== snapshot.component.kind.kindId ||
      pinSnapshot.kind.version !== snapshot.component.kind.version
    ) {
      continue;
    }

    // #653 D5/G1 — full deterministic identity key: the PACK-C primary key
    // (canonical exact ComponentRef) first, then the descriptor-side
    // tie-breakers, then the exact reference-implementation identity LAST.
    // The pin identity never replaces, precedes or alters the primary key.
    const ref = {
      family: snapshot.component.family,
      componentId: snapshot.component.componentId,
      kind: snapshot.component.kind,
    };
    const identityKey = [
      canonicalComponentRef(ref),
      snapshot.classification,
      snapshot.standardId,
      snapshot.descriptorVersion,
      pinSnapshot.implementation.implementationId,
      pinSnapshot.implementation.implementationVersion,
      pinSnapshot.implementation.implementationDigest,
    ].join('|');
    // Exact duplicate semantic candidates deduplicate by exact identity —
    // the identity key covers the full descriptor digest material and the
    // full pin identity, so equal keys are indistinguishable candidates and
    // no first/latest/default/input-position selection ever occurs.
    if (seenIdentities.has(identityKey)) {
      continue;
    }
    seenIdentities.add(identityKey);
    eligible.push({ identityKey, snapshot, pinSnapshot });
  }

  if (eligible.length === 0) {
    throw new StandardCandidateAbsentError(family);
  }
  // Code-unit total order over unique semantic identities — the same
  // candidate multiset selects identically under any input permutation.
  eligible.sort((a, b) => lexicalCompare(a.identityKey, b.identityKey));
  const winner = eligible[0]!;
  // #653 D4 — fresh, frozen, non-aliased return rebuilt exclusively from
  // module-owned snapshot material: caller mutation after selection can
  // never change the material consumed by T006B/T006C, and the caller input
  // is never frozen or mutated.
  return Object.freeze({
    descriptor: Object.freeze({
      standardId: winner.snapshot.standardId,
      classification: winner.snapshot.classification,
      descriptorVersion: winner.snapshot.descriptorVersion,
      component: Object.freeze({
        family: winner.snapshot.component.family,
        componentId: winner.snapshot.component.componentId,
        kind: Object.freeze({
          kindId: winner.snapshot.component.kind.kindId,
          version: winner.snapshot.component.kind.version,
        }),
      }),
    }),
    referenceImplementation: winner.pinSnapshot,
  });
}
