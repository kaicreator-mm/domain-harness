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

const FLOATING_SELECTOR_TOKENS = new Set(['latest', 'current', 'active', 'default', '*', 'x']);
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

function isExactIdentity(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('@')) {
    return false;
  }
  return (
    !FLOATING_SELECTOR_TOKENS.has(value.trim().toLowerCase()) &&
    !FLOATING_SELECTOR_PATTERN.test(value)
  );
}

function isExactVersion(value: unknown): value is string {
  if (!isExactIdentity(value)) return false;
  return !value
    .trim()
    .split('.')
    .some((part) => part.length === 0 || part.toLowerCase() === 'x');
}

function requireExactUnderstoodRef(
  ref: unknown,
  description: string,
  idField: 'kindId' | 'contractId' | 'capabilityId',
): void {
  if (!isPlainObject(ref)) {
    fail('INVALID_UNDERSTOOD_KIND_SET', `${description} must be an exact reference object`);
  }
  const keys = ownKeys(ref).sort();
  if (keys.length !== 2 || !keys.includes(idField) || !keys.includes('version')) {
    fail(
      'INVALID_UNDERSTOOD_KIND_SET',
      `${description} must contain exactly {${idField}, version}`,
    );
  }
  if (!isExactIdentity(ref[idField])) {
    fail(
      'INVALID_UNDERSTOOD_KIND_SET',
      `${description}.${idField} must be a non-empty exact identity without floating/range selection`,
    );
  }
  if (!isExactVersion(ref.version)) {
    fail(
      'INVALID_UNDERSTOOD_KIND_SET',
      `${description}.version must be an exact version without floating/range/x-range selection`,
    );
  }
}

function validateExactRefCollection(
  values: unknown,
  description: string,
  idField: 'contractId' | 'capabilityId',
): void {
  if (!Array.isArray(values)) {
    fail('INVALID_UNDERSTOOD_KIND_SET', `${description} must be an array of exact references`);
  }
  const seen = new Set<string>();
  for (const [index, ref] of values.entries()) {
    const at = `${description}[${index}]`;
    requireExactUnderstoodRef(ref, at, idField);
    const candidate = ref as Record<string, unknown>;
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
  if (!Array.isArray(understoodKinds)) {
    fail('INVALID_UNDERSTOOD_KIND_SET', 'understood Kind set must be an array');
  }

  const index = new Map<string, UnderstoodKindDeclaration>();
  for (const [entryIndex, entry] of understoodKinds.entries()) {
    const at = `understood Kind set entry [${entryIndex}]`;
    if (!isPlainObject(entry)) {
      fail('INVALID_UNDERSTOOD_KIND_SET', `${at} must be a plain object`);
    }
    const keys = ownKeys(entry).sort();
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

    requireExactUnderstoodRef(entry.kind, `${at}.kind`, 'kindId');
    validateExactRefCollection(
      entry.understoodSemanticContracts,
      `${at}.understoodSemanticContracts`,
      'contractId',
    );
    validateExactRefCollection(
      entry.understoodCapabilities,
      `${at}.understoodCapabilities`,
      'capabilityId',
    );
    if (typeof entry.validateComponent !== 'function') {
      fail('INVALID_UNDERSTOOD_KIND_SET', `${at}.validateComponent must be a function`);
    }

    const kind = entry.kind as KindRef;
    const key = `${kind.kindId}@${kind.version}`;
    if (index.has(key)) {
      fail('INVALID_UNDERSTOOD_KIND_SET', `${at} declares exact Kind "${key}" more than once`);
    }

    index.set(key, {
      kind,
      understoodSemanticContracts:
        entry.understoodSemanticContracts as readonly SemanticContractRef[],
      understoodCapabilities:
        entry.understoodCapabilities as readonly CapabilityContractRef[],
      validateComponent: entry.validateComponent as ComponentKindValidator,
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
 * substitute for the Kind's own semantic validation.
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
    admittedSemanticContracts: [...requiredSemanticContracts],
    admittedCapabilities: [...requiredCapabilities],
    ...('nonMaterialExtensions' in envelope && envelope.nonMaterialExtensions !== undefined
      ? { nonMaterialExtensions: envelope.nonMaterialExtensions }
      : {}),
  };
}
