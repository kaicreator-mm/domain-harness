/**
 * v0.7 Tool logical resource requirement declaration contract (issue #554,
 * fine-grained DAG T005A).
 *
 * The Definition-plane contract material by which a Tool Component declares
 * the Runtime Resources it needs — logical identities only. A resource
 * requirement declaration is a SEPARATE declaration keyed to exactly one Tool
 * Component by exact `componentId` (L2 A6/A11); it is never a field inside the
 * frozen `ToolOperationsDeclaration` (T003A) and never part of any digest.
 *
 * Structural secrets fence (fail-closed): logical requirements cannot carry
 * live values, secrets, credentials, endpoints, handles, or provider/model
 * identities. Enforcement is structural — field whitelist only, no free-form
 * JSON material anywhere in the contract, unknown fields fail closed with
 * typed errors, and the module exports no resolver, reader, or accessor that
 * could bind a requirement to a live resource.
 *
 * Validation consumes the shared descriptor-safe record primitive and
 * unified exact-reference authority of `record-safety.ts` (#557 + #578): the
 * declaration and every requirement are validated on descriptor-safe
 * snapshots, so accessor-backed declaration fields are rejected before any
 * authority use, and no hidden getter can execute during validation or
 * diagnostics.
 *
 * Boundaries owned by successor tasks — intentionally absent here:
 * - runtime resource resolution, injection, binding, materialization (T005B);
 * - resource instance identity, currentness, and non-secret pins (T005C);
 * - content/graph digests and digest composition of requirements (T001B/T001C);
 * - must-understand admission (T001D);
 * - graph/relation attachment of declarations to Components (T001C).
 */
import type { ComponentEnvelope, ComponentId } from './component.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  carriesXRangeVersionSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeArraySnapshot,
  safeRecordSnapshot,
} from './record-safety.js';
import { validateToolComponent } from './tool-component.js';

/**
 * Exact, versioned resource semantic-contract reference. Optional on a
 * requirement: some resources are keyed values with no material contract.
 * Conventions are identical to `SemanticContractRef`/`CapabilityContractRef`.
 */
export interface ResourceContractRef {
  /** Exact resource semantic-contract identity. */
  readonly contractId: string;
  /** Exact version. */
  readonly version: string;
}

/**
 * One logical Runtime Resource requirement: a stable exact logical identity
 * (the resolution key T005B resolves — a logical name, not a location), an
 * optional exact/versioned contract reference, optional exact narrowing to one
 * existing operation of the owner, and a mandatory explicit criticality
 * boolean (L2: "Missing required resource fails closed before the affected
 * invocation/effect"). Nothing else is representable.
 */
export interface ToolResourceRequirement {
  /** Stable exact logical Runtime Resource identity. */
  readonly resourceKey: string;
  /** Optional exact/versioned resource semantic contract. */
  readonly contract?: ResourceContractRef;
  /** Absent = requirement applies at Tool Component scope. */
  readonly operationId?: string;
  /** Mandatory explicit boolean — no default, no coercion. */
  readonly required: boolean;
}

/**
 * The logical resource requirement declaration of exactly one Tool Component.
 * `requirements` may be empty (= declares no requirements).
 */
export interface ToolResourceRequirementsDeclaration {
  /** Exact owner Tool Component logical identity. */
  readonly componentId: ComponentId;
  readonly requirements: readonly ToolResourceRequirement[];
}

export type ResourceRequirementContractErrorCode =
  | 'INVALID_RESOURCE_REQUIREMENTS_DECLARATION'
  | 'INVALID_RESOURCE_REQUIREMENT_OWNER'
  | 'INVALID_RESOURCE_REQUIREMENT'
  | 'INVALID_RESOURCE_KEY'
  | 'INVALID_RESOURCE_CONTRACT_REF'
  | 'INVALID_RESOURCE_REQUIREMENT_OPERATION'
  | 'INVALID_RESOURCE_REQUIREMENT_DUPLICATE'
  | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN';

export class ResourceRequirementContractError extends Error {
  readonly code: ResourceRequirementContractErrorCode;

  constructor(code: ResourceRequirementContractErrorCode, message: string) {
    super(message);
    this.name = 'ResourceRequirementContractError';
    this.code = code;
  }
}

const DECLARATION_FIELDS = new Set<string>(['componentId', 'requirements']);

const REQUIREMENT_FIELDS = new Set<string>([
  'resourceKey',
  'contract',
  'operationId',
  'required',
]);

function fail(code: ResourceRequirementContractErrorCode, path: string, reason: string): never {
  throw new ResourceRequirementContractError(code, `${path} ${reason}`);
}

/** Snapshot an authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(
  value: unknown,
  path: string,
  invalidCode: ResourceRequirementContractErrorCode,
): Record<string, unknown> {
  const result = safeRecordSnapshot(value, path);
  if (!result.ok) {
    fail(invalidCode, path, describeRecordSafetyIssue(result.issue));
  }
  return result.snapshot;
}

/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function requireExactIdentityString(
  value: unknown,
  path: string,
  invalidCode: ResourceRequirementContractErrorCode,
): void {
  if (typeof value !== 'string') {
    fail(invalidCode, path, 'must be a string');
  }
  if (!isNonEmptyIdentityString(value)) {
    fail(invalidCode, path, 'must be a non-empty exact identity');
  }
  if (carriesEmbeddedSelector(value)) {
    fail(
      invalidCode,
      path,
      'must not embed a version selector (`id@version`); use the exact version field',
    );
  }
}

/** Rejects mutable selection tokens and range operators; never normalizes. */
function requireNonFloatingIdentity(value: string, path: string): void {
  if (carriesFloatingOrRangeSemantics(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      path,
      'must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)',
    );
  }
}

/** Rejects floating/range/x-range version forms (`1.x`, `x`, `1.`); never normalizes. */
function requireExactVersion(value: string, path: string): void {
  if (carriesFloatingOrRangeSemantics(value) || carriesXRangeVersionSemantics(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      path,
      'must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)',
    );
  }
}

function requireExactIdentity(
  value: unknown,
  path: string,
  invalidCode: ResourceRequirementContractErrorCode,
): void {
  requireExactIdentityString(value, path, invalidCode);
  requireNonFloatingIdentity(value as string, path);
}

function requireExactResourceContractRef(ref: unknown, path: string): void {
  const candidate = requireSafeRecord(ref, path, 'INVALID_RESOURCE_CONTRACT_REF');
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || !keys.includes('contractId') || !keys.includes('version')) {
    fail(
      'INVALID_RESOURCE_CONTRACT_REF',
      path,
      'must contain exactly {contractId, version} (live values, endpoints, and provider identities are not part of a resource contract reference)',
    );
  }
  requireExactIdentity(candidate.contractId, `${path}.contractId`, 'INVALID_RESOURCE_CONTRACT_REF');
  requireExactIdentityString(candidate.version, `${path}.version`, 'INVALID_RESOURCE_CONTRACT_REF');
  requireExactVersion(candidate.version as string, `${path}.version`);
}

/**
 * The owner's operation identities, read from the descriptor-safe snapshot
 * of its already-validated `ToolOperationsDeclaration`. Composition, not
 * re-implemented operation parsing: `validateToolComponent(owner)` has
 * guaranteed the shape before this runs.
 */
function ownerOperationIds(ownerView: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  const body = ownerView.semanticBody;
  if (body !== null && typeof body === 'object' && Array.isArray(body)) {
    return ids;
  }
  if (body !== null && typeof body === 'object') {
    const operations = (body as Record<string, unknown>).operations;
    if (Array.isArray(operations)) {
      for (const operation of operations) {
        if (
          operation !== null &&
          typeof operation === 'object' &&
          typeof (operation as { operationId?: unknown }).operationId === 'string'
        ) {
          ids.add((operation as { operationId: string }).operationId);
        }
      }
    }
  }
  return ids;
}

function validateRequirement(
  candidate: unknown,
  path: string,
  operationIds: Set<string>,
): string {
  const requirement = requireSafeRecord(candidate, path, 'INVALID_RESOURCE_REQUIREMENT');
  const unexpectedField = Object.keys(requirement).find((key) => !REQUIREMENT_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_RESOURCE_REQUIREMENT',
      path,
      `must not carry unknown field "${unexpectedField}" (live values, secrets, endpoints, handles, and provider identities are structurally unrepresentable)`,
    );
  }

  requireExactIdentity(requirement.resourceKey, `${path}.resourceKey`, 'INVALID_RESOURCE_KEY');

  if ('contract' in requirement) {
    requireExactResourceContractRef(requirement.contract, `${path}.contract`);
  }

  if ('operationId' in requirement) {
    requireExactIdentity(
      requirement.operationId,
      `${path}.operationId`,
      'INVALID_RESOURCE_REQUIREMENT_OPERATION',
    );
    if (!operationIds.has(requirement.operationId as string)) {
      fail(
        'INVALID_RESOURCE_REQUIREMENT_OPERATION',
        `${path}.operationId`,
        `must reference an operation that exists on the owner Tool Component (${(requirement.operationId as string).trim()} is not one)`,
      );
    }
  }

  if (typeof requirement.required !== 'boolean') {
    fail(
      'INVALID_RESOURCE_REQUIREMENT',
      `${path}.required`,
      'must be an explicit boolean (no default, no coercion)',
    );
  }

  return requirement.resourceKey as string;
}

/**
 * Structural fail-closed validation of one Tool Component's logical resource
 * requirement declaration. Synchronous, pure, and total: it reads its two
 * arguments, performs no I/O, no environment access, no lookup, and no
 * mutation, and either returns `void` or throws a typed
 * `ResourceRequirementContractError`. Validation runs on descriptor-safe
 * snapshots (#578); the caller input is never frozen or mutated.
 *
 * Composition: `validateToolComponent(owner)` runs first — its failures
 * surface unchanged as the existing `ComponentContractError` /
 * `ToolComponentContractError`. The declaration is then validated as keyed to
 * exactly that owner: exact `componentId` match (never silently rebound),
 * exact identities with no floating selectors, exact `{contractId, version}`
 * contract references, operation narrowing against the owner's actual
 * operations, and resource keys unique across component and operation scopes.
 *
 * No resource is resolved, injected, bound, or materialized here (T005B), and
 * no resource instance identity or currentness pin is taken (T005C).
 */
export function validateToolResourceRequirements(
  owner: ComponentEnvelope,
  declaration: ToolResourceRequirementsDeclaration,
): void {
  validateToolComponent(owner);

  const ownerView = requireSafeRecord(owner, 'component envelope', 'INVALID_RESOURCE_REQUIREMENT_OWNER');
  const view = requireSafeRecord(
    declaration,
    'tool resource requirements declaration',
    'INVALID_RESOURCE_REQUIREMENTS_DECLARATION',
  );
  const unexpectedField = Object.keys(view).find((key) => !DECLARATION_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_RESOURCE_REQUIREMENTS_DECLARATION',
      'tool resource requirements declaration',
      `must not carry unknown field "${unexpectedField}" (live values, secrets, endpoints, handles, and provider identities are structurally unrepresentable)`,
    );
  }

  requireExactIdentity(
    view.componentId,
    'tool resource requirements declaration.componentId',
    'INVALID_RESOURCE_REQUIREMENT_OWNER',
  );
  if (view.componentId !== ownerView.componentId) {
    fail(
      'INVALID_RESOURCE_REQUIREMENT_OWNER',
      'tool resource requirements declaration.componentId',
      `must exactly match the owner Tool Component identity ${ownerView.componentId as string} (declarations are never silently rebound)`,
    );
  }

  const requirementsResult = safeArraySnapshot(
    view.requirements,
    'tool resource requirements declaration.requirements',
  );
  if (!requirementsResult.ok) {
    fail(
      'INVALID_RESOURCE_REQUIREMENTS_DECLARATION',
      'tool resource requirements declaration.requirements',
      requirementsResult.issue.violation === 'NOT_AN_ARRAY'
        ? 'must be an array of logical resource requirements (empty array = declares no requirements)'
        : describeRecordSafetyIssue(requirementsResult.issue),
    );
  }

  const operationIds = ownerOperationIds(ownerView);
  const seenResourceKeys = new Set<string>();
  for (const [index, candidate] of requirementsResult.snapshot.entries()) {
    const requirementPath = `tool resource requirements declaration.requirements[${index}]`;
    const resourceKey = validateRequirement(candidate, requirementPath, operationIds);
    if (seenResourceKeys.has(resourceKey)) {
      fail(
        'INVALID_RESOURCE_REQUIREMENT_DUPLICATE',
        `${requirementPath}.resourceKey`,
        `declares ${resourceKey} more than once (resource keys are unique across component and operation scopes for one owner)`,
      );
    }
    seenResourceKeys.add(resourceKey);
  }
}
