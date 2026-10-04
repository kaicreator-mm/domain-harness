/**
 * v0.7 must-understand Component admission contract (issue #543, fine-grained
 * DAG T001D).
 *
 * A pure, deterministic, fail-closed admission function deciding whether one
 * already-validated `ComponentEnvelope` is understandable by a caller that
 * declares exactly which Kinds (exact KindRef = kindId + exact version), which
 * exact semantic contracts, and which behaviorally material `semanticBody`
 * fields it understands. The caller supplies the complete understood set;
 * admission fails closed on anything outside it. This is the frozen L2 rule
 * "Must-understand validation occurs at Definition admission for the exact
 * KindRef/version" and "unknown/incompatible required semantics fail closed".
 *
 * There is deliberately no global Kind catalog and no Kind implementation
 * registry here; no compatibility ranges, ordering, `latest`/`current`/
 * nearest-version selection (T002A); no Runtime Assembly/pins (T002B); no Tool
 * operation contracts or capability resolution (T003A/T003B); no digests
 * (T001B/T001C); no public barrel exposure (T001E). This is definition-plane
 * must-understand admission only and is not coupled to the v0.3 governance
 * admission (`src/admission/`).
 */
import type { ComponentEnvelope, ComponentId, KindRef, SemanticContractRef } from './component.js';
import type { JsonValue } from './json.js';

/**
 * One caller declaration of complete must-understand knowledge for one exact
 * Kind version: the exact KindRef plus the exact semantic contracts and the
 * behaviorally material `semanticBody` top-level fields understood for it.
 */
export interface UnderstoodKindDeclaration {
  /** Exact KindRef: kindId + exact version, same exactness rules as `component.ts`. */
  readonly kind: KindRef;
  /** Exact semantic contract refs this caller understands for this exact Kind version; duplicates forbidden. */
  readonly understoodSemanticContracts: readonly SemanticContractRef[];
  /**
   * The complete set of `semanticBody` TOP-LEVEL field names this caller
   * understands as behaviorally material for this exact Kind version;
   * non-empty strings; duplicates forbidden. A comprehension set, not a
   * presence requirement — comparison is exact string equality on top-level
   * keys only (no prefixes, globs, dot-paths, nesting traversal, defaults, or
   * normalization).
   */
  readonly materialSemanticBodyFields: readonly string[];
}

/**
 * The complete understood-Kind set supplied by the caller. Each exact KindRef
 * (kindId+version) appears at most once; multiple exact versions of one kindId
 * may coexist (each exact, no ordering/range meaning). An empty set is
 * structurally valid and admits nothing.
 */
export type UnderstoodKindSet = readonly UnderstoodKindDeclaration[];

/** Deterministic, fail-closed admission failure codes. */
export type ComponentAdmissionErrorCode =
  | 'UNKNOWN_KIND'
  | 'KIND_VERSION_MISMATCH'
  | 'UNKNOWN_SEMANTIC_CONTRACT'
  | 'UNKNOWN_MATERIAL_FIELD'
  | 'INVALID_UNDERSTOOD_KIND_SET'
  | 'ADMISSION_INPUT_INVALID';

/** The failure taxonomy discriminator: each failure code maps to exactly one class. */
export type ComponentAdmissionFailureClass = 'KIND' | 'CONTRACT' | 'FIELD' | 'INPUT';

const FAILURE_CLASS_BY_CODE: Record<ComponentAdmissionErrorCode, ComponentAdmissionFailureClass> = {
  UNKNOWN_KIND: 'KIND',
  KIND_VERSION_MISMATCH: 'KIND',
  UNKNOWN_SEMANTIC_CONTRACT: 'CONTRACT',
  UNKNOWN_MATERIAL_FIELD: 'FIELD',
  INVALID_UNDERSTOOD_KIND_SET: 'INPUT',
  ADMISSION_INPUT_INVALID: 'INPUT',
};

/**
 * Typed admission failure mirroring the `ComponentContractError` pattern of
 * `src/contracts/component.ts`: a dedicated error class carrying a `code`
 * plus exactly one failure-class discriminator.
 */
export class ComponentAdmissionError extends Error {
  readonly code: ComponentAdmissionErrorCode;
  readonly failureClass: ComponentAdmissionFailureClass;

  constructor(code: ComponentAdmissionErrorCode, message: string) {
    super(message);
    this.name = 'ComponentAdmissionError';
    this.code = code;
    this.failureClass = FAILURE_CLASS_BY_CODE[code];
  }
}

/** The deterministic admitted result of must-understand Component admission. */
export interface ComponentAdmissionResult {
  readonly status: 'ADMITTED';
  /** Echoed from the envelope. */
  readonly componentId: ComponentId;
  /** The exact matched KindRef. */
  readonly admittedKind: KindRef;
  /** The envelope's exact semantic contract refs that were admitted (envelope order). */
  readonly admittedSemanticContracts: readonly SemanticContractRef[];
  /** The admitted top-level semanticBody fields, sorted lexicographically (deterministic). */
  readonly admittedMaterialFields: readonly string[];
  /** Verbatim opaque pass-through; never validated, merged, dropped, or promoted. */
  readonly nonMaterialExtensions?: JsonValue;
}

const FLOATING_SELECTOR_TOKENS = new Set(['latest', 'current', 'active', 'default', '*', 'x']);
/** Range/wildcard operators never occur in an exact identity string. */
const FLOATING_SELECTOR_PATTERN = /[\^~<>|*]/;

function fail(code: ComponentAdmissionErrorCode, message: string): never {
  throw new ComponentAdmissionError(code, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ownKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  );
}

/** Exact identity string: non-empty, not an embedded `id@selector`, not a floating token. */
function isExactIdentity(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('@')) {
    return false;
  }
  return (
    !FLOATING_SELECTOR_TOKENS.has(value.trim().toLowerCase()) && !FLOATING_SELECTOR_PATTERN.test(value)
  );
}

/** Exact version: an exact identity that additionally carries no semver x-range/partial parts (`1.x`, `1.`, `x`). */
function isExactVersion(value: unknown): value is string {
  if (!isExactIdentity(value)) {
    return false;
  }
  return !value
    .trim()
    .split('.')
    .some((part) => part.length === 0 || part.toLowerCase() === 'x');
}

function requireExactUnderstoodRef(
  ref: unknown,
  description: string,
  idField: 'kindId' | 'contractId',
): void {
  if (!isPlainObject(ref)) {
    fail('INVALID_UNDERSTOOD_KIND_SET', `${description} must be an exact reference object`);
  }
  const keys = ownKeys(ref).sort();
  if (keys.length !== 2 || !keys.includes(idField) || !keys.includes('version')) {
    fail(
      'INVALID_UNDERSTOOD_KIND_SET',
      `${description} must contain exactly {${idField}, version} (exact references only)`,
    );
  }
  if (!isExactIdentity(ref[idField])) {
    fail(
      'INVALID_UNDERSTOOD_KIND_SET',
      `${description}.${idField} must be a non-empty exact identity, not a floating/range selector`,
    );
  }
  if (!isExactVersion(ref.version)) {
    fail(
      'INVALID_UNDERSTOOD_KIND_SET',
      `${description}.version must be an exact version, not a floating/range selector (latest/current/*/range/x-range)`,
    );
  }
}

/**
 * Full fail-closed validation of the caller-supplied understood set. Floating
 * and range selectors are rejected outright — they can never admit an
 * exact-version component. Returns an index keyed by the unambiguous
 * `kindId@version` composite (`@` never occurs inside exact identity strings).
 */
function validateAndIndexUnderstoodSet(
  understoodKinds: UnderstoodKindSet,
): Map<string, UnderstoodKindDeclaration> {
  if (!Array.isArray(understoodKinds)) {
    fail(
      'INVALID_UNDERSTOOD_KIND_SET',
      'understood Kind set must be an array of UnderstoodKindDeclaration entries',
    );
  }
  const index = new Map<string, UnderstoodKindDeclaration>();
  for (const [entryIndex, entry] of understoodKinds.entries()) {
    const at = `understood Kind set entry [${entryIndex}]`;
    if (!isPlainObject(entry)) {
      fail('INVALID_UNDERSTOOD_KIND_SET', `${at} must be a plain object`);
    }
    const keys = ownKeys(entry).sort();
    if (
      keys.length !== 3 ||
      !keys.includes('kind') ||
      !keys.includes('understoodSemanticContracts') ||
      !keys.includes('materialSemanticBodyFields')
    ) {
      fail(
        'INVALID_UNDERSTOOD_KIND_SET',
        `${at} must contain exactly {kind, understoodSemanticContracts, materialSemanticBodyFields}`,
      );
    }

    requireExactUnderstoodRef(entry.kind, `${at}.kind`, 'kindId');

    const contracts = entry.understoodSemanticContracts;
    if (!Array.isArray(contracts)) {
      fail(
        'INVALID_UNDERSTOOD_KIND_SET',
        `${at}.understoodSemanticContracts must be an array of exact references`,
      );
    }
    const contractIds = new Set<string>();
    for (const [refIndex, ref] of (contracts as readonly unknown[]).entries()) {
      const refAt = `${at}.understoodSemanticContracts[${refIndex}]`;
      requireExactUnderstoodRef(ref, refAt, 'contractId');
      const contractId = (ref as { contractId: string }).contractId;
      if (contractIds.has(contractId)) {
        fail(
          'INVALID_UNDERSTOOD_KIND_SET',
          `${refAt} declares contract "${contractId}" more than once (exact refs only)`,
        );
      }
      contractIds.add(contractId);
    }

    const fields = entry.materialSemanticBodyFields;
    if (!Array.isArray(fields)) {
      fail(
        'INVALID_UNDERSTOOD_KIND_SET',
        `${at}.materialSemanticBodyFields must be an array of non-empty field names`,
      );
    }
    const seenFields = new Set<string>();
    for (const [fieldIndex, field] of fields.entries()) {
      if (typeof field !== 'string' || field.length === 0) {
        fail(
          'INVALID_UNDERSTOOD_KIND_SET',
          `${at}.materialSemanticBodyFields[${fieldIndex}] must be a non-empty field name`,
        );
      }
      if (seenFields.has(field)) {
        fail(
          'INVALID_UNDERSTOOD_KIND_SET',
          `${at}.materialSemanticBodyFields[${fieldIndex}] declares field "${field}" more than once`,
        );
      }
      seenFields.add(field);
    }

    const kind = entry.kind as KindRef;
    const key = `${kind.kindId}@${kind.version}`;
    if (index.has(key)) {
      fail(
        'INVALID_UNDERSTOOD_KIND_SET',
        `${at} declares exact Kind "${key}" more than once (each exact KindRef appears at most once)`,
      );
    }
    index.set(key, {
      kind,
      understoodSemanticContracts: contracts as readonly SemanticContractRef[],
      materialSemanticBodyFields: fields as readonly string[],
    });
  }
  return index;
}

/**
 * Cheap structural preconditions on the already-validated envelope
 * (per `validateComponentEnvelope`). This is not a re-implementation of
 * T001A envelope validation; it only rejects input that is structurally
 * unusable for admission, deterministically and without throwing a TypeError.
 */
function requireAdmissibleEnvelopeShape(envelope: unknown): void {
  if (!isPlainObject(envelope)) {
    fail('ADMISSION_INPUT_INVALID', 'component envelope must be a plain object');
  }
  const { kind, componentId, requiredSemanticContracts, semanticBody } = envelope;
  if (!isPlainObject(kind)) {
    fail('ADMISSION_INPUT_INVALID', 'component envelope.kind must be a plain object');
  }
  if (typeof kind.kindId !== 'string' || kind.kindId.length === 0) {
    fail('ADMISSION_INPUT_INVALID', 'component envelope.kind.kindId must be a non-empty string');
  }
  if (typeof kind.version !== 'string' || kind.version.length === 0) {
    fail('ADMISSION_INPUT_INVALID', 'component envelope.kind.version must be a non-empty string');
  }
  if (typeof componentId !== 'string' || componentId.length === 0) {
    fail('ADMISSION_INPUT_INVALID', 'component envelope.componentId must be a non-empty string');
  }
  if (!Array.isArray(requiredSemanticContracts)) {
    fail(
      'ADMISSION_INPUT_INVALID',
      'component envelope.requiredSemanticContracts must be an array of exact references',
    );
  }
  for (const [index, ref] of requiredSemanticContracts.entries()) {
    const at = `component envelope.requiredSemanticContracts[${index}]`;
    if (!isPlainObject(ref)) {
      fail('ADMISSION_INPUT_INVALID', `${at} must be an exact reference object`);
    }
    if (typeof ref.contractId !== 'string' || ref.contractId.length === 0) {
      fail('ADMISSION_INPUT_INVALID', `${at}.contractId must be a non-empty string`);
    }
    if (typeof ref.version !== 'string' || ref.version.length === 0) {
      fail('ADMISSION_INPUT_INVALID', `${at}.version must be a non-empty string`);
    }
  }
  if (semanticBody === undefined) {
    fail('ADMISSION_INPUT_INVALID', 'component envelope.semanticBody must be present');
  }
}

/**
 * Pure, deterministic, fail-closed must-understand admission of one
 * already-validated Component envelope against the caller-supplied complete
 * understood-Kind set. Throws `ComponentAdmissionError` on failure; never
 * mutates its inputs.
 *
 * Kind matching is exact on both kindId and version — no fallback to another
 * version of a known kindId, no range/`latest`/`current`/`default`/ordering
 * semantics of any kind. Semantic contract matching is exact on both
 * contractId and version. `requiredCapabilities` are not must-understand
 * material at this seam and are neither validated nor carried on the result.
 */
export function admitComponent(
  envelope: ComponentEnvelope,
  understoodKinds: UnderstoodKindSet,
): ComponentAdmissionResult {
  requireAdmissibleEnvelopeShape(envelope);
  const understood = validateAndIndexUnderstoodSet(understoodKinds);

  const { kind, componentId, requiredSemanticContracts, semanticBody } = envelope;
  const kindKey = `${kind.kindId}@${kind.version}`;
  const matched = understood.get(kindKey);
  if (matched === undefined) {
    const kindIdKnown = [...understood.values()].some(
      (declaration) => declaration.kind.kindId === kind.kindId,
    );
    fail(
      kindIdKnown ? 'KIND_VERSION_MISMATCH' : 'UNKNOWN_KIND',
      kindIdKnown
        ? `exact Kind "${kindKey}" is not declared by the understood set, which declares other exact versions of kindId "${kind.kindId}"; admission never falls back to another version`
        : `kindId "${kind.kindId}" is not declared by any understood Kind entry`,
    );
  }

  for (const required of requiredSemanticContracts) {
    const isUnderstood = matched.understoodSemanticContracts.some(
      (ref) => ref.contractId === required.contractId && ref.version === required.version,
    );
    if (!isUnderstood) {
      fail(
        'UNKNOWN_SEMANTIC_CONTRACT',
        `semantic contract "${required.contractId}@${required.version}" required by component "${componentId}" is not understood for exact Kind "${kindKey}" (exact contractId+version match only, no range)`,
      );
    }
  }

  const materialFields = new Set(matched.materialSemanticBodyFields);
  let admittedMaterialFields: string[];
  if (isPlainObject(semanticBody)) {
    const bodyKeys = ownKeys(semanticBody).sort();
    const unknownField = bodyKeys.find((key) => !materialFields.has(key));
    if (unknownField !== undefined) {
      fail(
        'UNKNOWN_MATERIAL_FIELD',
        `semanticBody top-level field "${unknownField}" of component "${componentId}" is outside the declared material-field set for exact Kind "${kindKey}"`,
      );
    }
    admittedMaterialFields = bodyKeys;
  } else {
    // A non-object semanticBody has no field names: it admits only against an
    // empty declared material-field set (whole-body opaque understanding).
    if (matched.materialSemanticBodyFields.length > 0) {
      fail(
        'UNKNOWN_MATERIAL_FIELD',
        `semanticBody of component "${componentId}" is not a JSON object, which is incompatible with the non-empty declared material-field set for exact Kind "${kindKey}"`,
      );
    }
    admittedMaterialFields = [];
  }

  const result: ComponentAdmissionResult = {
    status: 'ADMITTED',
    componentId,
    admittedKind: { kindId: kind.kindId, version: kind.version },
    admittedSemanticContracts: [...requiredSemanticContracts],
    admittedMaterialFields,
    ...('nonMaterialExtensions' in envelope && envelope.nonMaterialExtensions !== undefined
      ? { nonMaterialExtensions: envelope.nonMaterialExtensions }
      : {}),
  };
  return result;
}
