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
 * Deliberately ABSENT (no Standard bypass, per #589): must-understand
 * admission, exposure, capability closure, resources, activation, effects,
 * replay, and any provider/registry/dispatch surface. The Microkernel
 * (`runtime-assembly.ts`) imports nothing from this module, and this module
 * mints no admission/activation/effect evidence — classification can never
 * shortcut authority.
 */
import {
  COMPONENT_FAMILIES,
  type ComponentFamily,
  type ComponentId,
  type KindRef,
} from './component.js';
import {
  canonicalJsonStringify,
  computeCanonicalJsonDigest,
  isContentDigest,
  type ContentDigest,
  type Sha256Port,
} from './identity.js';
import { decideKindCompatibility, KindCompatibilityError } from './kind-compatibility.js';
import type {
  AssemblyImplementationBindingEvidence,
  KindImplementationPin,
} from './runtime-assembly.js';
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
  /** Optional §G generic implementation-binding evidence slots (SAME opaque
   * slot type as the T002B Assembly record — e.g. future T003C Tool bindings). */
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
  const entries: StandardSetEntry[] = entriesArray.snapshot.map((candidate, index) => {
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
    return Object.freeze({
      descriptor,
      pin: snapshotPin(view.pin, `${at}.pin`),
    });
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

  const claimed = inputView.claimedSetDigest;
  if (claimed !== undefined && !isContentDigest(claimed)) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'standard set seal input.claimedSetDigest',
      'must be a non-empty content digest string when present',
    );
  }

  // ---- PHASE 2 (async): digest work only; no caller-owned re-read after this point.
  const record: StandardSetRecord = Object.freeze({
    digestDomain: STANDARD_SET_DIGEST_DOMAIN,
    entries: Object.freeze(
      [...entries].sort((a, b) => lexicalCompare(descriptorKey(a.descriptor), descriptorKey(b.descriptor))),
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
  readonly sha256: Sha256Port;
}

/** Frozen currentness evidence: identity material only, never authority. */
export interface StandardSetCurrentnessResult {
  readonly status: 'CURRENT';
  readonly setDigest: ContentDigest;
  readonly checkedDescriptors: number;
}

/**
 * Prove a sealed Standard Set current against the current published
 * Standard descriptors by authoritative recomputation.
 *
 * The caller's descriptors are validated and snapshotted synchronously
 * before the first `await`; after the currentness suspension only
 * module-owned snapshot material is read (torn-snapshot discipline, same as
 * #587 §E). Every sealed entry must resolve to exactly one current
 * descriptor (missing OR recomputed-digest-mismatch fails closed with
 * STANDARD_DESCRIPTOR_CURRENTNESS_MISMATCH) and duplicate current
 * descriptors under one exact key fail closed as well.
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
    (key) => key !== 'currentDescriptors' && key !== 'sha256',
  );
  if (unexpectedOptionField !== undefined) {
    fail(
      'INVALID_STANDARD_SET_INPUT',
      'currentness options',
      `must contain exactly {currentDescriptors, sha256}; unexpected field "${unexpectedOptionField}"`,
    );
  }
  const sha256 = requireSha256Port(optionsView.sha256, 'currentness options.sha256', 'INVALID_STANDARD_SET_INPUT');

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

  // Async phase: authoritative descriptor digest recomputation per entry.
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
      {
        domain: STANDARD_DESCRIPTOR_DIGEST_DOMAIN,
        standardId: current.standardId,
        classification: current.classification,
        descriptorVersion: current.descriptorVersion,
        component: {
          family: current.component.family,
          componentId: current.component.componentId,
          kind: {
            kindId: current.component.kind.kindId,
            version: current.component.kind.version,
          },
        },
      },
      sha256,
    );
    if (recomputed !== entry.descriptor.descriptorDigest) {
      fail(
        'STANDARD_DESCRIPTOR_CURRENTNESS_MISMATCH',
        `standard set entry ${key}`,
        'the current descriptor content digest does not match the exact digest pinned in the sealed Set; semantics changed without a descriptor version bump (or the pinned digest is stale) and fails closed',
      );
    }
  }

  return Object.freeze({
    status: 'CURRENT' as const,
    setDigest: set.setDigest,
    checkedDescriptors: set.record.entries.length,
  });
}

// ---------------------------------------------------------------------------
// Deterministic bootstrap-candidate eligibility (consumed by T006B/T006C)
// ---------------------------------------------------------------------------

/**
 * One bootstrap-candidate input: a Standard descriptor plus, when one has
 * been accepted on the integration HEAD, its reference implementation pin.
 * The selector never invents missing pins or descriptors.
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
 * lexicographically smallest canonical exact ComponentRef wins (ties break
 * by classification, standardId, descriptorVersion — full determinism under
 * input permutation); the returned object is the caller's own candidate,
 * untouched. This selection is for FIXTURE CONSTRUCTION ONLY — the function
 * is pure and never performs runtime provider selection, binding or
 * dispatch. When nothing is eligible the family-specific typed
 * STANDARD_*_CANDIDATE_ABSENT failure is thrown and the caller must return
 * to ChatGPT Web — a candidate is NEVER invented locally.
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
    readonly candidate: StandardBootstrapCandidate;
    readonly sortKey: string;
  }
  const eligible: EligibleEntry[] = [];
  for (const candidate of list.snapshot) {
    // Defense in depth: an invalid descriptor is ineligible, never fatal to
    // the whole pool (eligibility is a filter, and the terminal state is
    // decided only after the whole pool is examined).
    let snapshot: SnapshotDescriptor;
    try {
      snapshot = snapshotDescriptor(
        (candidate as StandardBootstrapCandidate | null | undefined)?.descriptor,
      );
    } catch {
      continue;
    }
    if (!(STANDARD_CLASSIFICATIONS as readonly string[]).includes(snapshot.classification)) {
      continue;
    }
    if (snapshot.component.family !== family) {
      continue;
    }
    const pin = (candidate as StandardBootstrapCandidate).referenceImplementation;
    if (pin === undefined || pin === null) {
      continue;
    }
    let pinSnapshot: KindImplementationPin;
    try {
      pinSnapshot = snapshotPin(pin, 'candidate.referenceImplementation');
    } catch {
      continue;
    }
    if (
      pinSnapshot.kind.kindId !== snapshot.component.kind.kindId ||
      pinSnapshot.kind.version !== snapshot.component.kind.version
    ) {
      continue;
    }
    const ref = { family: snapshot.component.family, componentId: snapshot.component.componentId, kind: snapshot.component.kind };
    eligible.push({
      candidate: candidate as StandardBootstrapCandidate,
      sortKey:
        `${canonicalComponentRef(ref)}|${snapshot.classification}|${snapshot.standardId}|${snapshot.descriptorVersion}`,
    });
  }

  if (eligible.length === 0) {
    throw new StandardCandidateAbsentError(family);
  }
  // Code-unit total order; Array.prototype.sort is stable (ECMAScript 2019+),
  // so full key ties resolve deterministically in input order.
  eligible.sort((a, b) => lexicalCompare(a.sortKey, b.sortKey));
  return eligible[0]!.candidate;
}
