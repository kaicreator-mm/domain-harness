/**
 * v0.7 Domain Component envelope and exact semantic reference contracts
 * (issue #535, fine-grained DAG T001A).
 *
 * The frozen L2 (v0.7 freeze + R2) defines `Domain Definition = Domain
 * Component Graph` with exactly two Product families, open versioned semantic
 * Kind contracts, and Capability as a stable requires/provides contract
 * identity. This file owns only the smallest additive envelope for those
 * dimensions.
 *
 * Boundaries owned by successor tasks — intentionally absent here:
 * - content/graph digests (T001B/T001C);
 * - must-understand admission (T001D);
 * - public barrel exposure and legacy isolation fixtures (T001E);
 * - implementation registries, assembly pins, tool runtime, resources (T002+).
 */
import { canonicalizeJson } from './identity.js';
import type { JsonValue } from './json.js';

/** The two frozen Product families a Domain Component belongs to. */
export const COMPONENT_FAMILIES = Object.freeze(['semantic', 'tool'] as const);

export type ComponentFamily = (typeof COMPONENT_FAMILIES)[number];

/**
 * Stable logical identity of one Component within a Domain Definition.
 * Non-empty, never a floating selector, and never an implementation identity.
 */
export type ComponentId = string;

/**
 * Exact, versioned semantic Kind contract identity. Open by design: any new
 * Kind is representable, so the Component core never grows a closed
 * workflow/rule/skill/tool Kind union. This is contract identity only —
 * implementation/provider/module identity is a later assembly concern.
 */
export interface KindRef {
  readonly kindId: string;
  readonly version: string;
}

/** Exact, versioned behaviorally material semantic contract reference. */
export interface SemanticContractRef {
  readonly contractId: string;
  readonly version: string;
}

/** Exact Capability contract identity (requires/provides semantics). */
export interface CapabilityContractRef {
  readonly capabilityId: string;
  readonly version: string;
}

/**
 * Portable semantic envelope of one Domain Component. `semanticBody` is the
 * only behaviorally material body; `nonMaterialExtensions` is explicitly
 * non-behavioral and can never be mistaken for required semantics. No
 * implementation/module/provider/assembly/runtime-resource identity is
 * representable on this envelope.
 */
export interface ComponentEnvelope {
  readonly family: ComponentFamily;
  readonly componentId: ComponentId;
  readonly kind: KindRef;
  readonly requiredSemanticContracts: readonly SemanticContractRef[];
  readonly requiredCapabilities: readonly CapabilityContractRef[];
  readonly semanticBody: JsonValue;
  readonly nonMaterialExtensions?: JsonValue;
}

export type ComponentContractErrorCode =
  | 'INVALID_COMPONENT_ENVELOPE'
  | 'INVALID_COMPONENT_ID'
  | 'INVALID_COMPONENT_FAMILY'
  | 'INVALID_KIND_REF'
  | 'INVALID_SEMANTIC_CONTRACT_REF'
  | 'INVALID_CAPABILITY_REF'
  | 'INVALID_SEMANTIC_BODY'
  | 'INVALID_NON_MATERIAL_EXTENSIONS'
  | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN';

export class ComponentContractError extends Error {
  readonly code: ComponentContractErrorCode;

  constructor(code: ComponentContractErrorCode, message: string) {
    super(message);
    this.name = 'ComponentContractError';
    this.code = code;
  }
}

const ENVELOPE_FIELDS = new Set<string>([
  'family',
  'componentId',
  'kind',
  'requiredSemanticContracts',
  'requiredCapabilities',
  'semanticBody',
  'nonMaterialExtensions',
]);

const FLOATING_SELECTOR_TOKENS = new Set(['latest', 'current', 'active', 'default', '*']);
/** Range/wildcard operators never occur in an exact identity string. */
const FLOATING_SELECTOR_PATTERN = /[\^~<>|*]/;

function fail(code: ComponentContractErrorCode, path: string, reason: string): never {
  throw new ComponentContractError(code, `${path} ${reason}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function requireExactIdentityString(
  value: unknown,
  path: string,
  invalidCode: ComponentContractErrorCode,
): void {
  if (typeof value !== 'string') {
    fail(invalidCode, path, 'must be a string');
  }
  if (value.trim().length === 0) {
    fail(invalidCode, path, 'must be a non-empty exact identity');
  }
  if (value.includes('@')) {
    fail(
      invalidCode,
      path,
      'must not embed a version selector (`id@version`); use the exact version field',
    );
  }
}

/** Rejects mutable selection tokens; never normalizes them to a default. */
function requireNonFloating(value: string, path: string): void {
  if (FLOATING_SELECTOR_TOKENS.has(value.trim().toLowerCase()) || FLOATING_SELECTOR_PATTERN.test(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      path,
      'must be an exact identity, not a floating/range selector (latest/current/active/default/*/range)',
    );
  }
}

function requireExactIdentity(value: unknown, path: string, invalidCode: ComponentContractErrorCode): void {
  requireExactIdentityString(value, path, invalidCode);
  requireNonFloating(value as string, path);
}

function ownKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  );
}

function requireExactRef(
  ref: unknown,
  path: string,
  idField: 'kindId' | 'contractId' | 'capabilityId',
  invalidCode: ComponentContractErrorCode,
): string {
  if (!isPlainObject(ref)) {
    fail(invalidCode, path, 'must be an exact reference object');
  }
  const keys = ownKeys(ref).sort();
  if (keys.length !== 2 || !keys.includes(idField) || !keys.includes('version')) {
    fail(
      invalidCode,
      path,
      `must contain exactly {${idField}, version} (implementation/module identity is not part of a contract reference)`,
    );
  }
  requireExactIdentity(ref[idField], `${path}.${idField}`, invalidCode);
  requireExactIdentityString(ref.version, `${path}.version`, invalidCode);
  requireNonFloating(ref.version as string, `${path}.version`);
  return ref[idField] as string;
}

function requireExactRefCollection(
  values: unknown,
  path: string,
  idField: 'contractId' | 'capabilityId',
  invalidCode: ComponentContractErrorCode,
): void {
  if (!Array.isArray(values)) {
    fail(invalidCode, path, 'must be an array of exact references');
  }
  const seen = new Set<string>();
  for (const [index, ref] of values.entries()) {
    const id = requireExactRef(ref, `${path}[${index}]`, idField, invalidCode);
    if (seen.has(id)) {
      fail(invalidCode, `${path}[${index}]`, `declares ${id} more than once (exact refs only)`);
    }
    seen.add(id);
  }
}

function requireJsonMaterial(value: unknown, path: string, invalidCode: ComponentContractErrorCode): void {
  try {
    canonicalizeJson(value);
  } catch {
    fail(invalidCode, path, 'must be portable JSON material');
  }
}

/**
 * Structural fail-closed validation of a Component envelope. Invalid exact
 * identities are always rejected — never silently normalized to a
 * default/current value.
 */
export function validateComponentEnvelope(envelope: ComponentEnvelope): void {
  if (!isPlainObject(envelope)) {
    fail('INVALID_COMPONENT_ENVELOPE', 'component envelope', 'must be a plain object');
  }
  const unexpectedField = ownKeys(envelope).find((key) => !ENVELOPE_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_COMPONENT_ENVELOPE',
      `component envelope`,
      `must not carry unknown field "${unexpectedField}" (implementation/assembly/runtime identity belongs to later concerns)`,
    );
  }

  const { family, componentId, kind } = envelope as Record<string, unknown>;
  const { requiredSemanticContracts, requiredCapabilities, semanticBody, nonMaterialExtensions } =
    envelope as Record<string, unknown>;

  if (typeof family !== 'string' || !COMPONENT_FAMILIES.includes(family as ComponentFamily)) {
    fail(
      'INVALID_COMPONENT_FAMILY',
      'component envelope.family',
      `must be one of ${COMPONENT_FAMILIES.join(' | ')}`,
    );
  }

  requireExactIdentity(componentId, 'component envelope.componentId', 'INVALID_COMPONENT_ID');
  requireExactRef(kind, 'component envelope.kind', 'kindId', 'INVALID_KIND_REF');
  requireExactRefCollection(
    requiredSemanticContracts,
    'component envelope.requiredSemanticContracts',
    'contractId',
    'INVALID_SEMANTIC_CONTRACT_REF',
  );
  requireExactRefCollection(
    requiredCapabilities,
    'component envelope.requiredCapabilities',
    'capabilityId',
    'INVALID_CAPABILITY_REF',
  );
  requireJsonMaterial(semanticBody, 'component envelope.semanticBody', 'INVALID_SEMANTIC_BODY');
  if ('nonMaterialExtensions' in envelope) {
    requireJsonMaterial(
      nonMaterialExtensions,
      'component envelope.nonMaterialExtensions',
      'INVALID_NON_MATERIAL_EXTENSIONS',
    );
  }
}
