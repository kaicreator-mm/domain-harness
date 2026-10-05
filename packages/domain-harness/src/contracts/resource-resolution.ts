/**
 * v0.7 Runtime Resource injection/resolution port (issue #608, fine-grained
 * DAG T005B; planning authority #589 PACK-A T005B section).
 *
 * HOST_INTEGRATION behind a generic `ResourceProvider` port. This module owns
 * exactly the T005B concerns and nothing else:
 *
 * - `resolveToolResources` resolves ONLY the logical requirements contained in
 *   the exact sealed Runtime Assembly (T002B canonical #568 material) for one
 *   affected Tool Component (optionally narrowed to one exact invocation
 *   operation). Requirements not in the Assembly are never requested from a
 *   provider, and nothing outside the Assembly material can add requirements;
 * - required missing/incompatible fails closed (typed) BEFORE any affected
 *   Tool invocation/effect authority can be granted — resolution either
 *   returns a complete result or throws; there is no partial success;
 * - optional missing/incompatible is an EXPLICIT absence entry — never an
 *   ambient, default, or fallback value. No caller-visible default handle
 *   exists anywhere in this module;
 * - the `ResourceProvider` is INJECTED per call. This module imports no
 *   SQLite/HTTP/filesystem/cloud (or any other concrete) resource
 *   implementation and exposes no registry, catalog, or lookup of its own;
 * - live values/secrets/tokens/handles/connections never enter any diagnostic
 *   this module produces: error messages carry only exact identity strings
 *   (resourceKey / contractId / version) from the sealed Assembly material.
 *   A provider's thrown error message, returned handle, and any unknown
 *   provider-response values are NEVER propagated into messages. Handles are
 *   runtime-only references inside the result map and are never serialized;
 * - torn-snapshot discipline (same as #587 §E): every authority-bearing input
 *   (options, Assembly record requirement material) is descriptor-safe
 *   validated and snapshotted SYNCHRONOUSLY before the first provider
 *   suspension; each provider response is synchronously snapshotted
 *   immediately after its await. The caller's objects are never re-read after
 *   an await, and the caller's objects are never frozen or mutated;
 * - no provider downgrade/latest/default/order fallback: exactly one injected
 *   provider is consulted, exactly once per requirement, in canonical
 *   (componentId, resourceKey) order. A failure is terminal — never retried,
 *   never substituted.
 *
 * Deliberately absent (successor-owned):
 * - resource instance identity, currentness pins and stable non-secret
 *   behaviorally relevant identity (T005C) — a resolved handle here is an
 *   OPAQUE runtime value, not authority or currentness evidence;
 * - invocation request/admission and exposure authority (T004A) — resolution
 *   grants nothing; the caller decides, after resolution, whether to proceed;
 * - Assembly sealing/anti-forgery minting (T002B) — this module structurally
 *   validates and snapshots the requirement material it consumes, but the
 *   sealed-Assembly brand/mint registry remains the T002B authority boundary
 *   upstream. Callers in real flows hold an Assembly minted by
 *   `sealRuntimeAssembly`;
 * - any public barrel exposure (T001E/#570) — this module is internal, like
 *   its T005A/T002B siblings.
 *
 * Boundary discipline: validation consumes the shared descriptor-safe record
 * primitive and unified exact-reference authority of `record-safety.ts`
 * (#557 + #578), imported never reimplemented. The canonical requirement
 * material types are consumed from `runtime-assembly.ts` (T002B), the
 * declaration contract from `resource-requirements.ts` (T005A).
 */
import type { ComponentId } from './component.js';
import type { ResourceContractRef } from './resource-requirements.js';
import type {
  AssemblyResourceRequirementsMaterial,
  SealedRuntimeAssembly,
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
 * The exact logical resolution request handed to the injected provider: a
 * synchronous, frozen snapshot of one sealed-Assembly requirement. The
 * provider receives exact identities only — never the caller's live objects.
 */
export interface ResourceResolutionRequest {
  /** Exact owner Tool Component logical identity. */
  readonly componentId: ComponentId;
  /** Stable exact logical Runtime Resource identity (a name, not a location). */
  readonly resourceKey: string;
  /** Optional exact/versioned resource semantic contract from the Assembly. */
  readonly contract?: ResourceContractRef;
  /** Optional exact operation narrowing from the Assembly. */
  readonly operationId?: string;
  /** The requirement's explicit criticality — the provider sees it verbatim. */
  readonly required: boolean;
}

/**
 * One provider response. The `handle` is an OPAQUE runtime value: this
 * module never inspects, serializes, or diagnoses it. `contract` on a
 * `resolved` response is the exact contract the provider claims to satisfy —
 * the kernel verifies the exact match against the Assembly requirement, it
 * never trusts the status string alone. `supportedContracts` on an
 * `incompatible` response is diagnostic-only identity material.
 */
export type ResourceProviderResponse =
  | {
      readonly status: 'resolved';
      readonly handle: unknown;
      readonly contract?: ResourceContractRef;
    }
  | { readonly status: 'absent' }
  | { readonly status: 'incompatible'; readonly supportedContracts?: readonly ResourceContractRef[] };

/**
 * The generic injected HOST_INTEGRATION port. One implementation is supplied
 * per resolution call by the host; the core never selects, ranks, caches, or
 * fallbacks between providers. `resolve` may be async; a synchronous throw
 * or a rejection surfaces as `RESOURCE_PROVIDER_FAILURE` (typed) — the
 * provider's own error text is never propagated (redaction discipline).
 */
export interface ResourceProvider {
  readonly resolve: (request: ResourceResolutionRequest) => Promise<ResourceProviderResponse>;
}

/** Resolution input. All authority-bearing material is snapshotted synchronously. */
export interface ResolveToolResourcesOptions {
  /** The exact sealed Runtime Assembly whose requirements are resolved. */
  readonly assembly: SealedRuntimeAssembly;
  /** Exact affected Tool Component identity (must own requirements in the Assembly). */
  readonly componentId: ComponentId;
  /** Optional exact invocation operation; absent = component-scope resolution. */
  readonly operationId?: string;
  /** The injected provider — the only host-integration surface. */
  readonly provider: ResourceProvider;
}

/**
 * One resolved entry. `resolved` carries the opaque runtime handle;
 * `absent` is the explicit, first-class representation of an unmet OPTIONAL
 * requirement — never a default/ambient stand-in.
 */
export type ResolvedResourceEntry =
  | { readonly resourceKey: string; readonly status: 'resolved'; readonly handle: unknown }
  | { readonly resourceKey: string; readonly status: 'absent' };

/**
 * The complete resolution result for one affected Tool invocation scope.
 * Runtime-only: the map is never digest material, never diagnostics material,
 * and never carries authority/currentness evidence (T005C owns identity).
 */
export interface ResolvedToolResources {
  /** Exact owner Tool Component identity. */
  readonly componentId: ComponentId;
  /** Present only when the resolution was operation-scoped. */
  readonly operationId?: string;
  /** Resolved entries keyed by exact resourceKey (canonical insertion order). */
  readonly resources: ReadonlyMap<string, ResolvedResourceEntry>;
}

/**
 * Fail-closed T005B failure taxonomy (#589 PACK-A). Every failure is typed
 * and terminal — none carries or suggests a substitute/default/latest
 * resolution, and no diagnostic ever serializes provider handles, secret
 * values, or provider-supplied free text (only exact identity strings from
 * the sealed Assembly material participate).
 */
export type ResourceResolutionErrorCode =
  | 'INVALID_RESOLUTION_INPUT'
  | 'INVALID_RESOURCE_PROVIDER_RESPONSE'
  | 'MISSING_REQUIRED_RESOURCE'
  | 'INCOMPATIBLE_RESOURCE'
  | 'RESOURCE_PROVIDER_FAILURE';

export class ResourceResolutionError extends Error {
  readonly code: ResourceResolutionErrorCode;

  constructor(code: ResourceResolutionErrorCode, message: string) {
    super(message);
    this.name = 'ResourceResolutionError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------

function fail(code: ResourceResolutionErrorCode, message: string): never {
  throw new ResourceResolutionError(code, message);
}

/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(
  value: unknown,
  description: string,
  code: ResourceResolutionErrorCode,
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
  code: ResourceResolutionErrorCode,
): unknown[] {
  const result = safeArraySnapshot(value, description);
  if (!result.ok) {
    fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

/** Code-unit comparison only; `localeCompare` is forbidden in this module. */
function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function requireExactIdentityString(
  value: unknown,
  path: string,
  code: ResourceResolutionErrorCode,
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
function requireNonFloatingIdentity(value: string, path: string, code: ResourceResolutionErrorCode): void {
  if (carriesFloatingOrRangeSemantics(value)) {
    fail(
      code,
      `${path} must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)`,
    );
  }
}

/** Rejects floating/range/x-range version forms (`1.x`, `x`, `1.`). */
function requireExactVersion(value: string, path: string, code: ResourceResolutionErrorCode): void {
  if (carriesFloatingOrRangeSemantics(value) || carriesXRangeVersionSemantics(value)) {
    fail(
      code,
      `${path} must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)`,
    );
  }
}

function requireExactIdentity(
  value: unknown,
  path: string,
  code: ResourceResolutionErrorCode,
): string {
  const identity = requireExactIdentityString(value, path, code);
  requireNonFloatingIdentity(identity, path, code);
  return identity;
}

/** Snapshot one exact `{contractId, version}` reference as a fresh frozen object. */
function snapshotExactContractRef(
  value: unknown,
  path: string,
  code: ResourceResolutionErrorCode,
): ResourceContractRef {
  const candidate = requireSafeRecord(value, path, code);
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || !keys.includes('contractId') || !keys.includes('version')) {
    fail(code, `${path} must contain exactly {contractId, version}`);
  }
  const contractId = requireExactIdentity(candidate.contractId, `${path}.contractId`, code);
  const version = requireExactIdentityString(candidate.version, `${path}.version`, code);
  requireExactVersion(version, `${path}.version`, code);
  return Object.freeze({ contractId, version });
}

// ---------------------------------------------------------------------------
// Sealed-Assembly requirement material snapshot
// ---------------------------------------------------------------------------

const MATERIAL_FIELDS = new Set<string>(['componentId', 'requirements']);

const REQUIREMENT_FIELDS = new Set<string>(['resourceKey', 'contract', 'operationId', 'required']);

/**
 * Synchronously validate and snapshot the `record.resourceRequirements`
 * material of the Assembly being consumed. This is defensive re-validation of
 * the exact material T002B already canonicalized at sealing: descriptor-safe
 * snapshots, exact-identity fields only, the five-field #568 whitelist, and
 * duplicate fail-closed rules. The result is order-normalized (componentId,
 * then resourceKey) so provider call order is deterministic and independent
 * of any caller-owned ordering. Live values/secrets/handles remain
 * structurally unrepresentable.
 */
function snapshotRequirementsMaterial(
  value: unknown,
): readonly AssemblyResourceRequirementsMaterial[] {
  const entries = requireSafeArray(
    value,
    'sealed assembly record.resourceRequirements',
    'INVALID_RESOLUTION_INPUT',
  );
  const seenOwners = new Set<string>();
  const materials = entries.map((entry, index) => {
    const at = `sealed assembly record.resourceRequirements[${index}]`;
    const view = requireSafeRecord(entry, at, 'INVALID_RESOLUTION_INPUT');
    const unexpectedField = Object.keys(view).find((key) => !MATERIAL_FIELDS.has(key));
    if (unexpectedField !== undefined) {
      fail(
        'INVALID_RESOLUTION_INPUT',
        `${at} must contain exactly {componentId, requirements}; unexpected field "${unexpectedField}" (live values, secrets, endpoints and handles are structurally unrepresentable)`,
      );
    }
    const componentId = requireExactIdentity(view.componentId, `${at}.componentId`, 'INVALID_RESOLUTION_INPUT');
    if (seenOwners.has(componentId)) {
      fail(
        'INVALID_RESOLUTION_INPUT',
        `${at}.componentId declares ${componentId} more than once across the Assembly requirement material (duplicates are never first-wins)`,
      );
    }
    seenOwners.add(componentId);

    const requirementsView = requireSafeArray(
      view.requirements,
      `${at}.requirements`,
      'INVALID_RESOLUTION_INPUT',
    );
    const seenResourceKeys = new Set<string>();
    const requirements = requirementsView.map((candidate, requirementIndex) => {
      const path = `${at}.requirements[${requirementIndex}]`;
      const requirement = requireSafeRecord(candidate, path, 'INVALID_RESOLUTION_INPUT');
      const unexpectedRequirementField = Object.keys(requirement).find(
        (key) => !REQUIREMENT_FIELDS.has(key),
      );
      if (unexpectedRequirementField !== undefined) {
        fail(
          'INVALID_RESOLUTION_INPUT',
          `${path} must not carry unknown field "${unexpectedRequirementField}" (live values, secrets, endpoints and handles are structurally unrepresentable)`,
        );
      }
      const resourceKey = requireExactIdentity(requirement.resourceKey, `${path}.resourceKey`, 'INVALID_RESOLUTION_INPUT');
      if (seenResourceKeys.has(resourceKey)) {
        fail(
          'INVALID_RESOLUTION_INPUT',
          `${path}.resourceKey declares ${resourceKey} more than once for one owner (resource keys are unique across component and operation scopes)`,
        );
      }
      seenResourceKeys.add(resourceKey);
      if (typeof requirement.required !== 'boolean') {
        fail(
          'INVALID_RESOLUTION_INPUT',
          `${path}.required must be an explicit boolean (no default, no coercion)`,
        );
      }
      const material: {
        resourceKey: string;
        required: boolean;
        contract?: ResourceContractRef;
        operationId?: string;
      } = { resourceKey, required: requirement.required };
      if ('contract' in requirement && requirement.contract !== undefined) {
        material.contract = snapshotExactContractRef(
          requirement.contract,
          `${path}.contract`,
          'INVALID_RESOLUTION_INPUT',
        );
      }
      if ('operationId' in requirement && requirement.operationId !== undefined) {
        material.operationId = requireExactIdentity(
          requirement.operationId,
          `${path}.operationId`,
          'INVALID_RESOLUTION_INPUT',
        );
      }
      return Object.freeze(material);
    });

    // Canonical order: resolution is deterministic and permutation-invariant.
    const sortedRequirements = Object.freeze(
      [...requirements].sort((a, b) => lexicalCompare(a.resourceKey, b.resourceKey)),
    );
    return Object.freeze({ componentId, requirements: sortedRequirements });
  });

  return Object.freeze(
    [...materials].sort((a, b) => lexicalCompare(a.componentId, b.componentId)),
  );
}

// ---------------------------------------------------------------------------
// Provider response snapshot
// ---------------------------------------------------------------------------

type SnapshotProviderResponse =
  | { readonly status: 'resolved'; readonly handle: unknown; readonly contract?: ResourceContractRef }
  | { readonly status: 'absent' }
  | { readonly status: 'incompatible'; readonly supportedContracts?: readonly ResourceContractRef[] };

const RESOLVED_RESPONSE_FIELDS = new Set<string>(['status', 'handle', 'contract']);
const INCOMPATIBLE_RESPONSE_FIELDS = new Set<string>(['status', 'supportedContracts']);
const ABSENT_RESPONSE_FIELDS = new Set<string>(['status']);

/**
 * Synchronously validate and snapshot one provider response immediately after
 * its await. Closed-world whitelists per status; exact refs only; handles are
 * kept as opaque references and never diagnosed. A provider cannot smuggle
 * secret-bearing fields into authority — unknown fields fail closed and only
 * the offending KEY name (never a value) participates in the message.
 */
function snapshotProviderResponse(
  raw: unknown,
  resourceKey: string,
): SnapshotProviderResponse {
  const at = `resource provider response for "${resourceKey}"`;
  const view = requireSafeRecord(raw, at, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
  const status = view.status;
  if (status !== 'resolved' && status !== 'absent' && status !== 'incompatible') {
    fail(
      'INVALID_RESOURCE_PROVIDER_RESPONSE',
      `${at} must carry status "resolved" | "absent" | "incompatible" (never a floating/default token)`,
    );
  }

  if (status === 'resolved') {
    const unexpectedField = Object.keys(view).find((key) => !RESOLVED_RESPONSE_FIELDS.has(key));
    if (unexpectedField !== undefined) {
      fail(
        'INVALID_RESOURCE_PROVIDER_RESPONSE',
        `${at} must contain exactly {status, handle, contract?}; unexpected field "${unexpectedField}" (provider responses cannot smuggle secret-bearing material into authority)`,
      );
    }
    if (!('handle' in view)) {
      fail('INVALID_RESOURCE_PROVIDER_RESPONSE', `${at} resolved status must carry a handle`);
    }
    let contract: ResourceContractRef | undefined;
    if ('contract' in view && view.contract !== undefined) {
      contract = snapshotExactContractRef(
        view.contract,
        `${at}.contract`,
        'INVALID_RESOURCE_PROVIDER_RESPONSE',
      );
    }
    const response: {
      status: 'resolved';
      handle: unknown;
      contract?: ResourceContractRef;
    } = { status, handle: view.handle };
    if (contract !== undefined) {
      response.contract = contract;
    }
    return Object.freeze(response);
  }

  if (status === 'incompatible') {
    const unexpectedField = Object.keys(view).find((key) => !INCOMPATIBLE_RESPONSE_FIELDS.has(key));
    if (unexpectedField !== undefined) {
      fail(
        'INVALID_RESOURCE_PROVIDER_RESPONSE',
        `${at} must contain exactly {status, supportedContracts?}; unexpected field "${unexpectedField}"`,
      );
    }
    if (!('supportedContracts' in view) || view.supportedContracts === undefined) {
      return Object.freeze({ status });
    }
    const contractsView = requireSafeArray(
      view.supportedContracts,
      `${at}.supportedContracts`,
      'INVALID_RESOURCE_PROVIDER_RESPONSE',
    );
    const supportedContracts = Object.freeze(
      contractsView.map((candidate, index) =>
        snapshotExactContractRef(
          candidate,
          `${at}.supportedContracts[${index}]`,
          'INVALID_RESOURCE_PROVIDER_RESPONSE',
        ),
      ),
    );
    return Object.freeze({ status, supportedContracts });
  }

  const unexpectedField = Object.keys(view).find((key) => !ABSENT_RESPONSE_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_RESOURCE_PROVIDER_RESPONSE',
      `${at} must contain exactly {status}; unexpected field "${unexpectedField}"`,
    );
  }
  return Object.freeze({ status });
}

// ---------------------------------------------------------------------------
// resolveToolResources — the T005B resolution boundary
// ---------------------------------------------------------------------------

const RESOLUTION_OPTION_FIELDS = new Set<string>(['assembly', 'componentId', 'operationId', 'provider']);

/**
 * Resolve the exact sealed-Assembly resource requirements for one affected
 * Tool invocation scope, through the single injected `ResourceProvider`.
 *
 * Authority rules (#589 PACK-A T005B):
 *
 * - ONLY requirements contained in the exact sealed Assembly are resolved;
 *   the provider is asked exactly once per applicable requirement, in
 *   canonical (resourceKey) order, and nothing else;
 * - a required resource that is missing (`absent`) or incompatible (provider
 *   `incompatible`, or a `resolved` response whose exact contract does not
 *   exactly equal the Assembly requirement contract) fails closed with a
 *   typed error BEFORE this function returns — i.e. before any affected Tool
 *   invocation/effect authority can be granted by the caller. Failures are
 *   terminal: no retry, no second provider, no downgrade/latest/default;
 * - an optional resource that is missing or incompatible is returned as an
 *   explicit `absent` entry — never an ambient/default fallback value;
 * - resolved handles are opaque runtime values (T005C owns stable non-secret
 *   behaviorally relevant identity). This result carries no authority, no
 *   currentness evidence, and is never digest/diagnostics material;
 * - torn-snapshot discipline: all Assembly material and options are
 *   snapshotted synchronously before the first provider suspension, and every
 *   provider response is snapshotted synchronously right after its await. The
 *   caller mutating its own objects mid-resolution cannot affect the result;
 * - redaction: no error message ever contains a provider handle, a provider
 *   thrown-message, or any provider-supplied value — only exact identity
 *   strings from the Assembly material.
 */
export async function resolveToolResources(
  options: ResolveToolResourcesOptions,
): Promise<ResolvedToolResources> {
  // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
  const view = requireSafeRecord(options, 'resource resolution options', 'INVALID_RESOLUTION_INPUT');
  const unexpectedOptionField = Object.keys(view).find((key) => !RESOLUTION_OPTION_FIELDS.has(key));
  if (unexpectedOptionField !== undefined) {
    fail(
      'INVALID_RESOLUTION_INPUT',
      `resource resolution options must contain exactly {assembly, componentId, operationId?, provider}; unexpected field "${unexpectedOptionField}"`,
    );
  }
  if (!('assembly' in view)) {
    fail('INVALID_RESOLUTION_INPUT', 'resource resolution options.assembly is required');
  }
  if (!('componentId' in view)) {
    fail('INVALID_RESOLUTION_INPUT', 'resource resolution options.componentId is required');
  }
  if (!('provider' in view)) {
    fail('INVALID_RESOLUTION_INPUT', 'resource resolution options.provider is required');
  }

  const componentId = requireExactIdentity(
    view.componentId,
    'resource resolution options.componentId',
    'INVALID_RESOLUTION_INPUT',
  );

  let operationId: string | undefined;
  if ('operationId' in view && view.operationId !== undefined) {
    operationId = requireExactIdentity(
      view.operationId,
      'resource resolution options.operationId',
      'INVALID_RESOLUTION_INPUT',
    );
  }

  // The provider is a host BEHAVIOR port, not data: it is shape-checked, not
  // descriptor-snapshotted (a host class instance is a legitimate provider).
  const provider = view.provider;
  if (
    typeof provider !== 'object' ||
    provider === null ||
    typeof (provider as ResourceProvider).resolve !== 'function'
  ) {
    fail(
      'INVALID_RESOLUTION_INPUT',
      'resource resolution options.provider must be a ResourceProvider ({ resolve(request): Promise<ResourceProviderResponse> })',
    );
  }
  const providerPort = provider as ResourceProvider;

  // NOTE: the sealed Assembly object itself carries the module-private T002B
  // brand symbol, so it is NOT descriptor-snapshotted here; only its
  // symbol-free serializable record material is consumed and snapshotted.
  if (typeof view.assembly !== 'object' || view.assembly === null || Array.isArray(view.assembly)) {
    fail('INVALID_RESOLUTION_INPUT', 'resource resolution options.assembly must be a sealed Runtime Assembly object');
  }
  const assemblyRecordView = requireSafeRecord(
    (view.assembly as { record?: unknown }).record,
    'sealed assembly record',
    'INVALID_RESOLUTION_INPUT',
  );
  if (!('resourceRequirements' in assemblyRecordView)) {
    fail(
      'INVALID_RESOLUTION_INPUT',
      'sealed assembly record.resourceRequirements is required (resolution consumes the exact sealed Assembly material only)',
    );
  }
  const materials = snapshotRequirementsMaterial(assemblyRecordView.resourceRequirements);

  // Select the affected owner's requirements. An operation-scoped requirement
  // applies only to that exact invocation operation; with no operationId,
  // only component-scope requirements are resolved.
  const ownerMaterial = materials.find((material) => material.componentId === componentId);
  const applicable =
    ownerMaterial === undefined
      ? []
      : ownerMaterial.requirements.filter(
          (requirement) =>
            requirement.operationId === undefined ||
            (operationId !== undefined && requirement.operationId === operationId),
        );

  // Frozen per-requirement request snapshots — the only objects the provider
  // ever sees from this module.
  const requests: readonly ResourceResolutionRequest[] = Object.freeze(
    applicable.map((requirement) => {
      const request: {
        componentId: ComponentId;
        resourceKey: string;
        required: boolean;
        contract?: ResourceContractRef;
        operationId?: string;
      } = {
        componentId,
        resourceKey: requirement.resourceKey,
        required: requirement.required,
      };
      if (requirement.contract !== undefined) {
        request.contract = requirement.contract;
      }
      if (requirement.operationId !== undefined) {
        request.operationId = requirement.operationId;
      }
      return Object.freeze(request);
    }),
  );

  // ---- PHASE 2 (async): one provider call per requirement, snapshots only.
  const resources = new Map<string, ResolvedResourceEntry>();
  for (const request of requests) {
    let raw: unknown;
    try {
      raw = await providerPort.resolve(request);
    } catch {
      // Redaction: the provider's own error text (which may embed secrets) is
      // NEVER propagated; only the exact Assembly identity participates.
      fail(
        'RESOURCE_PROVIDER_FAILURE',
        `the injected ResourceProvider failed while resolving resource "${request.resourceKey}" for component "${componentId}" (required=${request.required}); the failure is terminal — no retry, no fallback provider, no downgrade`,
      );
    }

    const response = snapshotProviderResponse(raw, request.resourceKey);

    if (response.status === 'resolved') {
      const requiredContract = request.contract;
      const satisfiedContract = response.contract;
      const contractMatches =
        requiredContract === undefined ||
        (satisfiedContract !== undefined &&
          satisfiedContract.contractId === requiredContract.contractId &&
          satisfiedContract.version === requiredContract.version);
      if (!contractMatches) {
        if (request.required) {
          fail(
            'INCOMPATIBLE_RESOURCE',
            `required resource "${request.resourceKey}" for component "${componentId}" was resolved without the exact contract ${requiredContract.contractId}@${requiredContract.version} pinned in the sealed Assembly; incompatible resources fail closed before the affected invocation/effect`,
          );
        }
        resources.set(
          request.resourceKey,
          Object.freeze({ resourceKey: request.resourceKey, status: 'absent' }),
        );
        continue;
      }
      resources.set(
        request.resourceKey,
        Object.freeze({
          resourceKey: request.resourceKey,
          status: 'resolved',
          handle: response.handle,
        }),
      );
      continue;
    }

    if (response.status === 'incompatible') {
      if (request.required) {
        fail(
          'INCOMPATIBLE_RESOURCE',
          `the injected ResourceProvider reported resource "${request.resourceKey}" for component "${componentId}" as incompatible with the exact sealed-Assembly requirement; incompatible required resources fail closed before the affected invocation/effect`,
        );
      }
      resources.set(
        request.resourceKey,
        Object.freeze({ resourceKey: request.resourceKey, status: 'absent' }),
      );
      continue;
    }

    // Explicit absence: terminal for required resources, first-class for optional.
    if (request.required) {
      fail(
        'MISSING_REQUIRED_RESOURCE',
        `required resource "${request.resourceKey}" for component "${componentId}" is explicitly absent from the injected ResourceProvider; missing required resources fail closed before the affected invocation/effect (no ambient, default, or fallback resource exists)`,
      );
    }
    resources.set(
      request.resourceKey,
      Object.freeze({ resourceKey: request.resourceKey, status: 'absent' }),
    );
  }

  const result: {
    componentId: ComponentId;
    operationId?: string;
    resources: ReadonlyMap<string, ResolvedResourceEntry>;
  } = { componentId, resources };
  if (operationId !== undefined) {
    result.operationId = operationId;
  }
  return Object.freeze(result);
}
