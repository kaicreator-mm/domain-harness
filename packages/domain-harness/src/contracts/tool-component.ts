/**
 * v0.7 Tool Component operation contract (issue #544, fine-grained DAG
 * T003A).
 *
 * The definition-plane envelope material for a Tool as an executable
 * functional module. A Tool Component is the existing `ComponentEnvelope`
 * with `family: 'tool'` whose `semanticBody` is exactly one
 * `ToolOperationsDeclaration` — a Tool carries operations; no second envelope
 * family and no Tool-specific envelope type exist here.
 *
 * Boundaries owned by successor tasks — intentionally absent here:
 * - tool invocation runtime, authoritative-occurrence anchoring (T004);
 * - Domain Tool provider selection/catalogs (T003B);
 * - implementation binding/registries/pins (T003C/T002);
 * - runtime resource resolution and resource-requirement declarations (T005A);
 * - content digests (T001B), graph relations (T001C), admission (T001D);
 * - exposure authority: `declaredExposure` is declarative-only material and
 *   grants no authorization anywhere in this module (T004A/T004D).
 */
import { canonicalizeJson } from './identity.js';
import type { JsonValue } from './json.js';
import {
  validateComponentEnvelope,
  type CapabilityContractRef,
  type ComponentEnvelope,
} from './component.js';

/**
 * Frozen L2 minimal effect classification for one operation. Exact lowercase
 * literals — no default, no case normalization. Type-level identical to the
 * legacy `ToolEffect` union in `contracts/tool.ts` (proven by fixtures, not
 * by re-exporting legacy symbols).
 */
export type ToolOperationEffect = 'none' | 'idempotent' | 'non-idempotent';

/** The frozen lowercase effect literals; effect is required, never defaulted. */
const TOOL_OPERATION_EFFECTS = Object.freeze([
  'none',
  'idempotent',
  'non-idempotent',
] as const);

/**
 * One Tool operation: exact stable identity, required portable JSON
 * input/output material (`{}` = explicitly unconstrained), a required exact
 * effect class, optional exact failure-code identities, and optional
 * declarative-only exposure material. No implementation/binding/provider/
 * resource/secret identity is representable.
 */
export interface ToolOperationContract {
  /** Exact stable operation identity; unique within the owning Tool. */
  readonly operationId: string;
  /** Required portable JSON material; `{}` is the explicit unconstrained declaration. */
  readonly inputSchema: JsonValue;
  /** Required portable JSON material; `{}` is the explicit unconstrained declaration. */
  readonly outputSchema: JsonValue;
  /** Required exact effect class — no default, no normalization. */
  readonly effect: ToolOperationEffect;
  /** Optional exact failure-code identities; unique within the operation. */
  readonly declaredFailures?: readonly string[];
  /** Declarative-only caller-audience material; structurally grants no authority. */
  readonly declaredExposure?: JsonValue;
}

/**
 * The single semantic body of a Tool Component: one or more uniquely
 * identified operations plus the exact/versioned Capability contracts this
 * Tool provides (may be empty = provides nothing). Requires stay on the
 * envelope (`requiredCapabilities`, unchanged T001A rules).
 */
export interface ToolOperationsDeclaration {
  readonly operations: readonly [ToolOperationContract, ...ToolOperationContract[]];
  readonly providesCapabilities: readonly CapabilityContractRef[];
}

export type ToolComponentContractErrorCode =
  | 'INVALID_TOOL_COMPONENT_ENVELOPE'
  | 'INVALID_TOOL_COMPONENT_FAMILY'
  | 'INVALID_TOOL_OPERATIONS'
  | 'INVALID_TOOL_OPERATION'
  | 'INVALID_TOOL_OPERATION_ID'
  | 'INVALID_TOOL_OPERATION_INPUT'
  | 'INVALID_TOOL_OPERATION_OUTPUT'
  | 'INVALID_TOOL_OPERATION_EFFECT'
  | 'INVALID_TOOL_OPERATION_FAILURE'
  | 'INVALID_TOOL_OPERATION_EXPOSURE'
  | 'INVALID_TOOL_CAPABILITY_PROVIDES'
  | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN';

export class ToolComponentContractError extends Error {
  readonly code: ToolComponentContractErrorCode;

  constructor(code: ToolComponentContractErrorCode, message: string) {
    super(message);
    this.name = 'ToolComponentContractError';
    this.code = code;
  }
}

const DECLARATION_FIELDS = new Set<string>(['operations', 'providesCapabilities']);

const OPERATION_FIELDS = new Set<string>([
  'operationId',
  'inputSchema',
  'outputSchema',
  'effect',
  'declaredFailures',
  'declaredExposure',
]);

const FLOATING_SELECTOR_TOKENS = new Set(['latest', 'current', 'active', 'default', '*']);
/** Range/wildcard operators never occur in an exact identity string. */
const FLOATING_SELECTOR_PATTERN = /[\^~<>|*]/;

function fail(code: ToolComponentContractErrorCode, path: string, reason: string): never {
  throw new ToolComponentContractError(code, `${path} ${reason}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ownKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  );
}

/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function requireExactIdentityString(value: unknown, path: string, invalidCode: ToolComponentContractErrorCode): void {
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

function requireExactIdentity(
  value: unknown,
  path: string,
  invalidCode: ToolComponentContractErrorCode,
): void {
  requireExactIdentityString(value, path, invalidCode);
  requireNonFloating(value as string, path);
}

function requireJsonMaterial(
  value: unknown,
  path: string,
  invalidCode: ToolComponentContractErrorCode,
): void {
  try {
    canonicalizeJson(value);
  } catch {
    fail(invalidCode, path, 'must be portable JSON material');
  }
}

function requireExactCapabilityRef(ref: unknown, path: string): void {
  if (!isPlainObject(ref)) {
    fail('INVALID_TOOL_CAPABILITY_PROVIDES', path, 'must be an exact reference object');
  }
  const keys = ownKeys(ref).sort();
  if (keys.length !== 2 || !keys.includes('capabilityId') || !keys.includes('version')) {
    fail(
      'INVALID_TOOL_CAPABILITY_PROVIDES',
      path,
      'must contain exactly {capabilityId, version} (implementation/module identity is not part of a capability reference)',
    );
  }
  requireExactIdentity(ref.capabilityId, `${path}.capabilityId`, 'INVALID_TOOL_CAPABILITY_PROVIDES');
  requireExactIdentityString(ref.version, `${path}.version`, 'INVALID_TOOL_CAPABILITY_PROVIDES');
  requireNonFloating(ref.version as string, `${path}.version`);
}

function requireExactEffect(value: unknown, path: string): void {
  if (typeof value !== 'string' || !TOOL_OPERATION_EFFECTS.includes(value as ToolOperationEffect)) {
    fail(
      'INVALID_TOOL_OPERATION_EFFECT',
      path,
      `must be exactly one of ${TOOL_OPERATION_EFFECTS.join(' | ')} (no default, no case normalization)`,
    );
  }
}

function validateOperation(candidate: unknown, path: string): void {
  if (!isPlainObject(candidate)) {
    fail('INVALID_TOOL_OPERATION', path, 'must be a plain operation object');
  }
  const unexpectedField = ownKeys(candidate).find((key) => !OPERATION_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_TOOL_OPERATION',
      path,
      `must not carry unknown field "${unexpectedField}" (implementation/binding/provider/resource/secret identity belongs to later concerns)`,
    );
  }

  const { operationId, inputSchema, outputSchema, effect } = candidate;

  requireExactIdentity(operationId, `${path}.operationId`, 'INVALID_TOOL_OPERATION_ID');
  requireJsonMaterial(inputSchema, `${path}.inputSchema`, 'INVALID_TOOL_OPERATION_INPUT');
  requireJsonMaterial(outputSchema, `${path}.outputSchema`, 'INVALID_TOOL_OPERATION_OUTPUT');
  requireExactEffect(effect, `${path}.effect`);

  const seenFailures = new Set<string>();
  if ('declaredFailures' in candidate) {
    if (!Array.isArray(candidate.declaredFailures)) {
      fail('INVALID_TOOL_OPERATION_FAILURE', `${path}.declaredFailures`, 'must be an array of exact failure-code identities');
    }
    for (const [index, code] of candidate.declaredFailures.entries()) {
      const failurePath = `${path}.declaredFailures[${index}]`;
      requireExactIdentityString(code, failurePath, 'INVALID_TOOL_OPERATION_FAILURE');
      requireNonFloating(code as string, failurePath);
      if (seenFailures.has(code as string)) {
        fail(
          'INVALID_TOOL_OPERATION_FAILURE',
          failurePath,
          `declares ${(code as string).trim()} more than once (exact failure identities only)`,
        );
      }
      seenFailures.add(code as string);
    }
  }

  if ('declaredExposure' in candidate) {
    requireJsonMaterial(
      candidate.declaredExposure,
      `${path}.declaredExposure`,
      'INVALID_TOOL_OPERATION_EXPOSURE',
    );
  }
}

function validateDeclaration(body: unknown): void {
  if (!isPlainObject(body)) {
    fail(
      'INVALID_TOOL_COMPONENT_ENVELOPE',
      'component envelope.semanticBody',
      'must be exactly one Tool operations declaration object',
    );
  }
  const unexpectedField = ownKeys(body).find((key) => !DECLARATION_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_TOOL_OPERATIONS',
      'tool operations declaration',
      `must not carry unknown field "${unexpectedField}" (implementation/binding/provider/resource identity belongs to later concerns)`,
    );
  }

  const { operations, providesCapabilities } = body;

  if (!Array.isArray(operations) || operations.length < 1) {
    fail(
      'INVALID_TOOL_OPERATIONS',
      'tool operations declaration.operations',
      'must be a non-empty array of operations ([1..*])',
    );
  }
  const seenOperationIds = new Set<string>();
  for (const [index, candidate] of operations.entries()) {
    const operationPath = `tool operations declaration.operations[${index}]`;
    validateOperation(candidate, operationPath);
    const operationId = (candidate as { operationId: unknown }).operationId as string;
    if (seenOperationIds.has(operationId)) {
      fail(
        'INVALID_TOOL_OPERATION_ID',
        `${operationPath}.operationId`,
        `declares ${operationId} more than once (operation ids are unique within one Tool Component)`,
      );
    }
    seenOperationIds.add(operationId);
  }

  if (!Array.isArray(providesCapabilities)) {
    fail(
      'INVALID_TOOL_CAPABILITY_PROVIDES',
      'tool operations declaration.providesCapabilities',
      'must be an array of exact capability references (empty array = provides nothing)',
    );
  }
  const seenCapabilityIds = new Set<string>();
  for (const [index, ref] of providesCapabilities.entries()) {
    const refPath = `tool operations declaration.providesCapabilities[${index}]`;
    requireExactCapabilityRef(ref, refPath);
    const capabilityId = (ref as { capabilityId: unknown }).capabilityId as string;
    if (seenCapabilityIds.has(capabilityId)) {
      fail(
        'INVALID_TOOL_CAPABILITY_PROVIDES',
        refPath,
        `declares ${capabilityId} more than once (exact refs only)`,
      );
    }
    seenCapabilityIds.add(capabilityId);
  }
}

/**
 * Structural fail-closed validation of one Tool Component. Runs the existing
 * `validateComponentEnvelope` first — its failures surface unchanged as
 * `ComponentContractError` — then applies Tool-specific structural validation
 * to `semanticBody` as exactly one `ToolOperationsDeclaration`. Invalid exact
 * identities are always rejected, never silently normalized.
 */
export function validateToolComponent(envelope: ComponentEnvelope): void {
  validateComponentEnvelope(envelope);

  if (envelope.family !== 'tool') {
    fail(
      'INVALID_TOOL_COMPONENT_FAMILY',
      'component envelope.family',
      "must be 'tool' for the Tool Component operation contract",
    );
  }

  validateDeclaration(envelope.semanticBody);
}
