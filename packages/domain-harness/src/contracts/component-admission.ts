/**
 * v0.7 must-understand Component admission contract (T001D, repaired by #556).
 *
 * Authoritative admission is fail-closed and open-Kind: the caller supplies
 * the complete set of exact Kind declarations it understands. Each declaration
 * carries the exact semantic/capability contracts understood for that Kind and
 * the closed-world validator belonging to that exact Kind implementation.
 *
 * There is deliberately no global Kind catalog or implementation registry in
 * this module. Runtime Assembly/dispatch successors own how the exact validator
 * implementation is selected and pinned; this seam only requires that the
 * validator matched to the exact KindRef is invoked before ADMITTED is returned.
 *
 * Validation consumes the shared descriptor-safe record primitive and
 * unified exact-reference authority of `record-safety.ts` (#557 + #578). The
 * understood-set index is built from descriptor-safe snapshots: exact refs
 * indexed for admission decisions are fresh `{id, version}` value objects, so
 * a caller mutating its own declarations after validation can never change
 * an admission conclusion. The canonical exact-ref matrix rejects floating
 * tokens (`latest`/`current`/`active`/`default`/`*`/`x`), range operators
 * (`^ ~ < > | *`), x-range/partial versions (`1.x`, `x`, `1.`) and embedded
 * `id@version` selectors.
 */
import {
  validateComponentEnvelope,
  type CapabilityContractRef,
  type ComponentEnvelope,
  type ComponentId,
  type KindRef,
  type SemanticContractRef,
} from './component.js';
import type { JsonValue } from './json.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  carriesXRangeVersionSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeArraySnapshot,
  safeRecordSnapshot,
} from './record-safety.js';

/** Closed-world validator for one exact admitted Kind implementation. */
export type ComponentKindValidator = (envelope: ComponentEnvelope) => void;

/**
 * Complete must-understand declaration for one exact KindRef.
 *
 * `validateComponent` must validate the complete behaviorally material
 * `semanticBody` for this exact Kind/version. It may reuse a Kind-specific
 * public validator such as `validateToolComponent`; failures propagate
 * unchanged so the Kind contract remains the single source of truth.
 */
export interface UnderstoodKindDeclaration {
  readonly kind: KindRef;
  readonly understoodSemanticContracts: readonly SemanticContractRef[];
  readonly understoodCapabilities: readonly CapabilityContractRef[];
  readonly validateComponent: ComponentKindValidator;
}

/** Complete caller-supplied exact Kind support set. */
export type UnderstoodKindSet = readonly UnderstoodKindDeclaration[];

export type ComponentAdmissionErrorCode =
  | 'UNKNOWN_KIND'
  | 'KIND_VERSION_MISMATCH'
  | 'UNKNOWN_SEMANTIC_CONTRACT'
  | 'UNKNOWN_CAPABILITY'
  | 'INVALID_UNDERSTOOD_KIND_SET';

export type ComponentAdmissionFailureClass = 'KIND' | 'CONTRACT' | 'CAPABILITY' | 'INPUT';

const FAILURE_CLASS_BY_CODE: Record<ComponentAdmissionErrorCode, ComponentAdmissionFailureClass> = {
  UNKNOWN_KIND: 'KIND',
  KIND_VERSION_MISMATCH: 'KIND',
  UNKNOWN_SEMANTIC_CONTRACT: 'CONTRACT',
  UNKNOWN_CAPABILITY: 'CAPABILITY',
  INVALID_UNDERSTOOD_KIND_SET: 'INPUT',
};

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

export interface ComponentAdmissionResult {
  readonly status: 'ADMITTED';
  readonly componentId: ComponentId;
  readonly admittedKind: KindRef;
  readonly admittedSemanticContracts: readonly SemanticContractRef[];
  readonly admittedCapabilities: readonly CapabilityContractRef[];
  /** Opaque non-behavioral pass-through; never sent to the Kind validator as semantics. */
  readonly nonMaterialExtensions?: JsonValue;
}

function fail(code: ComponentAdmissionErrorCode, message: string): never {
  throw new ComponentAdmissionError(code, message);
}

/** Snapshot an understood-set record, mapping descriptor issues to the typed input failure. */
function requireSafeRecord(value: unknown, description: string): Record<string, unknown> {
  const result = safeRecordSnapshot(value, description);
  if (!result.ok) {
    fail('INVALID_UNDERSTOOD_KIND_SET', `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

/**
 * Snapshot one exact `{idField, version}` reference of the understood set.
 * Structural defects (non-record, hidden properties, wrong keys, empty or
 * `id@version`-embedding strings) are `INVALID_UNDERSTOOD_KIND_SET`.
 */
function requireExactUnderstoodRef(
  ref: unknown,
  description: string,
  idField: 'kindId' | 'contractId' | 'capabilityId',
): Record<string, unknown> {
  const candidate = requireSafeRecord(ref, description);
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || !keys.includes(idField) || !keys.includes('version')) {
    fail(
      'INVALID_UNDERSTOOD_KIND_SET',
      `${description} must contain exactly {${idField}, version}`,
    );
  }
  const id = candidate[idField];
  const version = candidate.version;
  if (
    typeof id !== 'string' ||
    !isNonEmptyIdentityString(id) ||
    carriesEmbeddedSelector(id) ||
    carriesFloatingOrRangeSemantics(id)
  ) {
    fail(
      'INVALID_UNDERSTOOD_KIND_SET',
      `${description}.${idField} must be a non-empty exact identity without floating/range selection`,
    );
  }
  if (
    typeof version !== 'string' ||
    !isNonEmptyIdentityString(version) ||
    carriesEmbeddedSelector(version) ||
    carriesFloatingOrRangeSemantics(version) ||
    carriesXRangeVersionSemantics(version)
  ) {
    fail(
      'INVALID_UNDERSTOOD_KIND_SET',
      `${description}.version must be an exact version without floating/range/x-range selection`,
    );
  }
  return candidate;
}

function validateExactRefCollection(
  values: unknown,
  description: string,
  idField: 'contractId' | 'capabilityId',
): void {
  const result = safeArraySnapshot(values, description);
  if (!result.ok) {
    fail(
      'INVALID_UNDERSTOOD_KIND_SET',
      result.issue.violation === 'NOT_AN_ARRAY'
        ? `${description} must be an array of exact references`
        : `${description} ${describeRecordSafetyIssue(result.issue)}`,
    );
  }
  const seen = new Set<string>();
  for (const [index, ref] of result.snapshot.entries()) {
    const at = `${description}[${index}]`;
    const candidate = requireExactUnderstoodRef(ref, at, idField);
    const id = candidate[idField] as string;
    if (seen.has(id)) {
      fail('INVALID_UNDERSTOOD_KIND_SET', `${at} declares ${id} more than once`);
    }
    seen.add(id);
  }
}

function validateAndIndexUnderstoodSet(
  understoodKinds: UnderstoodKindSet,
): Map<string, UnderstoodKindDeclaration> {
  const setResult = safeArraySnapshot(understoodKinds, 'understood Kind set');
  if (!setResult.ok) {
    fail(
      'INVALID_UNDERSTOOD_KIND_SET',
      setResult.issue.violation === 'NOT_AN_ARRAY'
        ? 'understood Kind set must be an array'
        : `understood Kind set ${describeRecordSafetyIssue(setResult.issue)}`,
    );
  }

  const index = new Map<string, UnderstoodKindDeclaration>();
  for (const [entryIndex, entry] of setResult.snapshot.entries()) {
    const at = `understood Kind set entry [${entryIndex}]`;
    const candidate = requireSafeRecord(entry, at);
    const keys = Object.keys(candidate).sort();
    if (
      keys.length !== 4 ||
      !keys.includes('kind') ||
      !keys.includes('understoodSemanticContracts') ||
      !keys.includes('understoodCapabilities') ||
      !keys.includes('validateComponent')
    ) {
      fail(
        'INVALID_UNDERSTOOD_KIND_SET',
        `${at} must contain exactly {kind, understoodSemanticContracts, understoodCapabilities, validateComponent}`,
      );
    }

    const kindSnapshot = requireExactUnderstoodRef(candidate.kind, `${at}.kind`, 'kindId');
    validateExactRefCollection(
      candidate.understoodSemanticContracts,
      `${at}.understoodSemanticContracts`,
      'contractId',
    );
    validateExactRefCollection(
      candidate.understoodCapabilities,
      `${at}.understoodCapabilities`,
      'capabilityId',
    );
    if (typeof candidate.validateComponent !== 'function') {
      fail('INVALID_UNDERSTOOD_KIND_SET', `${at}.validateComponent must be a function`);
    }

    // The admission index is built from fresh `{id, version}` value objects
    // (descriptor-safe snapshots), never aliases of caller-owned refs.
    const kind: KindRef = {
      kindId: kindSnapshot.kindId as string,
      version: kindSnapshot.version as string,
    };
    const key = `${kind.kindId}@${kind.version}`;
    if (index.has(key)) {
      fail('INVALID_UNDERSTOOD_KIND_SET', `${at} declares exact Kind "${key}" more than once`);
    }

    index.set(key, {
      kind,
      understoodSemanticContracts: (
        candidate.understoodSemanticContracts as readonly SemanticContractRef[]
      ).map((ref) => ({ contractId: ref.contractId, version: ref.version })),
      understoodCapabilities: (
        candidate.understoodCapabilities as readonly CapabilityContractRef[]
      ).map((ref) => ({ capabilityId: ref.capabilityId, version: ref.version })),
      validateComponent: candidate.validateComponent as ComponentKindValidator,
    });
  }
  return index;
}

function hasExactSemanticContract(
  refs: readonly SemanticContractRef[],
  required: SemanticContractRef,
): boolean {
  return refs.some(
    (ref) => ref.contractId === required.contractId && ref.version === required.version,
  );
}

function hasExactCapability(
  refs: readonly CapabilityContractRef[],
  required: CapabilityContractRef,
): boolean {
  return refs.some(
    (ref) => ref.capabilityId === required.capabilityId && ref.version === required.version,
  );
}

/**
 * Fail-closed must-understand admission for one Component.
 *
 * Order is deliberate:
 * 1. base Component envelope validation;
 * 2. exact Kind support;
 * 3. exact required semantic/capability contract understanding;
 * 4. exact Kind implementation's closed-world Component validator;
 * 5. ADMITTED result.
 *
 * Base/Kind-validator errors propagate unchanged. This module never invents a
 * fallback, global registry, compatibility range, or generic top-level-field
 * substitute for the Kind's own semantic validation. The ADMITTED result
 * carries fresh `{id, version}` ref copies (the caller's envelope and
 * declarations are never aliased into admission evidence); the opaque
 * `nonMaterialExtensions` pass-through keeps its original reference.
 */
export function admitComponent(
  envelope: ComponentEnvelope,
  understoodKinds: UnderstoodKindSet,
): ComponentAdmissionResult {
  validateComponentEnvelope(envelope);
  const understood = validateAndIndexUnderstoodSet(understoodKinds);

  const { kind, componentId, requiredSemanticContracts, requiredCapabilities } = envelope;
  const kindKey = `${kind.kindId}@${kind.version}`;
  const matched = understood.get(kindKey);
  if (matched === undefined) {
    const kindIdKnown = [...understood.values()].some(
      (declaration) => declaration.kind.kindId === kind.kindId,
    );
    fail(
      kindIdKnown ? 'KIND_VERSION_MISMATCH' : 'UNKNOWN_KIND',
      kindIdKnown
        ? `exact Kind "${kindKey}" is not declared; admission never falls back to another version`
        : `kindId "${kind.kindId}" is not declared by any understood Kind entry`,
    );
  }

  for (const required of requiredSemanticContracts) {
    if (!hasExactSemanticContract(matched.understoodSemanticContracts, required)) {
      fail(
        'UNKNOWN_SEMANTIC_CONTRACT',
        `semantic contract "${required.contractId}@${required.version}" required by component "${componentId}" is not understood for exact Kind "${kindKey}"`,
      );
    }
  }

  for (const required of requiredCapabilities) {
    if (!hasExactCapability(matched.understoodCapabilities, required)) {
      fail(
        'UNKNOWN_CAPABILITY',
        `capability "${required.capabilityId}@${required.version}" required by component "${componentId}" is not understood for exact Kind "${kindKey}"`,
      );
    }
  }

  // Constitutional must-understand gate: validate the complete behaviorally
  // material Component semantics using the exact Kind implementation's
  // closed-world validator. Any typed Kind failure propagates unchanged.
  matched.validateComponent(envelope);

  return {
    status: 'ADMITTED',
    componentId,
    admittedKind: { kindId: kind.kindId, version: kind.version },
    admittedSemanticContracts: requiredSemanticContracts.map((ref) => ({
      contractId: ref.contractId,
      version: ref.version,
    })),
    admittedCapabilities: requiredCapabilities.map((ref) => ({
      capabilityId: ref.capabilityId,
      version: ref.version,
    })),
    ...('nonMaterialExtensions' in envelope && envelope.nonMaterialExtensions !== undefined
      ? { nonMaterialExtensions: envelope.nonMaterialExtensions }
      : {}),
  };
}
