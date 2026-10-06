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
 *   provider-response values are NEVER propagated into messages. Provider-
 *   controlled own-key names and symbol descriptions are not echoed either
 *   (#643): they may themselves be secret-shaped (`sk-…`), prototype-pollution
 *   (`__proto__`), or control-character material, so diagnostics carry only a
 *   bounded, non-secret, deterministic classification of them. Handles are
 *   runtime-only references inside the result map and are never serialized;
 * - torn-snapshot discipline (same as #587 §E): every authority-bearing input
 *   (options, Assembly record requirement material) is descriptor-safe
 *   validated and snapshotted SYNCHRONOUSLY before the first provider
 *   suspension; each provider response is synchronously snapshotted
 *   immediately after its await. The caller's objects are never re-read after
 *   an await, and the caller's objects are never frozen or mutated;
 * - provider-response inspection is contained (#794): a hostile response
 *   object — e.g. a Proxy whose descriptor/ownKeys/get traps throw, or an
 *   engine Proxy-invariant TypeError — cannot escape the synchronous response
 *   snapshot as an untyped provider-controlled exception. Every such escape
 *   fails closed as a deterministic typed INVALID_RESOURCE_PROVIDER_RESPONSE
 *   whose fixed message never echoes the caught value's text;
 * - no provider downgrade/latest/default/order fallback: exactly one injected
 *   provider is consulted, exactly once per requirement, in canonical
 *   (componentId, resourceKey) order. A failure is terminal — never retried,
 *   never substituted.
 *
 * T005C resource-currentness capture (issue #656): a `resolved` provider
 * response MAY carry a stable NON-SECRET resource-instance/currentness pin
 * (`currentnessPin`: exact provider identity + exact resource identity +
 * exact revision/currentness digest; field names are implementation detail).
 * This module is the structural fence for that material: a closed field
 * whitelist, exact non-floating identity strings and an exact resourceKey
 * match are enforced synchronously right after the provider await, the
 * captured snapshot is frozen/non-aliased, and no secret value, credential,
 * live handle, connection object, function or provider object can ever be
 * represented in it or in any diagnostic. Capture is ADDITIVE and
 * capture-only: a required resource resolved without a pin still resolves
 * (an invented/default/fallback pin would be a lie) — whether pinned evidence
 * is mandatory for an occurrence is owned by the T005C activation gate, which
 * consumes ONLY material produced/validated here.
 *
 * Deliberately absent (successor-owned):
 * - activation/execution-currentness integration of the captured evidence and
 *   the required/optional currentness posture gate (T005C governance seam,
 *   `governance/execution-binding.ts` + `governance/assembly-activation.ts`)
 *   — resolution still grants nothing; a resolved handle remains an OPAQUE
 *   runtime value and never becomes authority by itself;
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
import type { ContentDigest } from './identity.js';
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
  type RecordSafetyIssue,
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
 * T005C (#656): stable NON-SECRET resource-instance/currentness pin material
 * for one resolved resource, supplied by the provider on a `resolved`
 * response. Exactly the three closed fields — the exact provider identity,
 * the exact resource identity (which must equal the requirement's
 * `resourceKey`) and one exact revision/content/currentness digest. Secret
 * values, credentials, live handles, connection objects, functions/module
 * paths and provider objects are structurally unrepresentable (closed
 * whitelist of exact identity strings only; unknown fields fail closed).
 */
export interface ResourceCurrentnessPin {
  /** Exact non-secret provider identity that attests the instance revision. */
  readonly providerId: string;
  /** Exact resource identity — must equal the requirement's `resourceKey`. */
  readonly resourceKey: string;
  /** Exact non-floating revision/content/currentness digest. */
  readonly revisionDigest: ContentDigest;
}

/**
 * T005C (#656): occurrence-level resource-currentness evidence consumed by
 * the governance activation/execution-currentness seam: the exact owner
 * component plus the stable non-secret instance pin resolved for it. This is
 * the ONLY shape the T002C execution pin ever carries for resources — plain
 * exact identity/digest material, never a live value, handle or provider
 * object.
 */
export interface ResourceCurrentnessEvidence {
  /** Exact owner component logical identity. */
  readonly componentId: ComponentId;
  /** Exact non-secret provider identity that attests the instance revision. */
  readonly providerId: string;
  /** Exact resource identity. */
  readonly resourceKey: string;
  /** Exact non-floating revision/content/currentness digest. */
  readonly revisionDigest: ContentDigest;
}

/**
 * One provider response. The `handle` is an OPAQUE runtime value: this
 * module never inspects, serializes, or diagnoses it. `contract` on a
 * `resolved` response is the exact contract the provider claims to satisfy —
 * the kernel verifies the exact match against the Assembly requirement, it
 * never trusts the status string alone. `supportedContracts` on an
 * `incompatible` response is diagnostic-only identity material. The optional
 * T005C `currentnessPin` is stable non-secret instance/currentness evidence
 * only (closed whitelist, exact identities/digest, structural secret/handle
 * fence); it is capture-only here and carries no authority by itself.
 */
export type ResourceProviderResponse =
  | {
      readonly status: 'resolved';
      readonly handle: unknown;
      readonly contract?: ResourceContractRef;
      readonly currentnessPin?: ResourceCurrentnessPin;
    }
  | { readonly status: 'absent' }
  | { readonly status: 'incompatible'; readonly supportedContracts?: readonly ResourceContractRef[] };

/**
 * The generic injected HOST_INTEGRATION port. One implementation is supplied
 * per resolution call by the host; the core never selects, ranks, caches, or
 * fallbacks between providers. `resolve` may be async; a synchronous throw
 * or a rejection surfaces as `RESOURCE_PROVIDER_FAILURE` (typed) — the
 * provider's own error text is never propagated (redaction discipline). A
 * hostile response object that throws during the response snapshot/inspection
 * fails closed the same way as typed `INVALID_RESOURCE_PROVIDER_RESPONSE`
 * (#794) — its trap/error text is never propagated either.
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
 * One resolved entry. `resolved` carries the opaque runtime handle and, when
 * the provider supplied one, the T005C stable non-secret currentness pin as
 * a frozen, non-aliased snapshot (T005C activation owns the posture gate);
 * `absent` is the explicit, first-class representation of an unmet OPTIONAL
 * requirement — never a default/ambient stand-in.
 */
export type ResolvedResourceEntry =
  | {
      readonly resourceKey: string;
      readonly status: 'resolved';
      readonly handle: unknown;
      readonly currentnessPin?: ResourceCurrentnessPin;
    }
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
 * the sealed Assembly material participate). Provider-controlled own-key
 * names and symbol descriptions participate only as bounded, non-secret,
 * deterministic classifications (#643) — never verbatim.
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

// ---------------------------------------------------------------------------
// Provider-controlled key/symbol diagnostic redaction (issue #643)
// ---------------------------------------------------------------------------

/**
 * Own-key names that are identifier-shaped but never echoed: they are
 * prototype-pollution / confused-deputy names, not debugging material.
 */
const NON_ECHOABLE_KEY_NAMES: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

/**
 * Hard pre-scan length cap (#837 P1_02): a provider-controlled key longer
 * than this is classified from its LENGTH alone — before any Set lookup,
 * regex, or per-character scan touches its content. The cap stays above
 * realistic secret-shaped key material, so bounded keys still receive their
 * full shape classification.
 */
const DIAGNOSTIC_KEY_MAX_LENGTH = 128;

/** Identifier-shaped own-key shape class (classified, never echoed; #837). */
const IDENTIFIER_KEY_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** Small numeric array-index own-key shape class (classified, never echoed). */
const NUMERIC_INDEX_KEY_PATTERN = /^[0-9]{1,6}$/;
/** Control characters (C0 range + DEL) never reach a diagnostic. */
function containsControlCharacter(key: string): boolean {
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}
/**
 * Shape-only detection of common secret material in KEY NAMES (never values):
 * `sk-(live|test)-…` API keys, `Bearer …` tokens, and JWT forms (`eyJ…` or
 * `<header>.eyJ<payload>`). Detection runs on the key name only; the matched
 * material itself is never copied into a diagnostic.
 */
const SECRET_SHAPED_KEY_PATTERN = /(?:sk-(?:live|test)-|bearer[ _-]|eyJ[A-Za-z0-9_-]{6,}|[A-Za-z0-9_-]{2,}\.eyJ)/i;

/**
 * Bounded, non-secret, deterministic classification of one provider-controlled
 * own-key name for failure diagnostics (#643, #837). Provider-controlled key
 * names may themselves BE the secret (`sk-…` keys), prototype-pollution
 * material (`__proto__`/`constructor`), control-character payloads, or plain
 * identifier/credential material (`accessToken`, `password`, unrecognized
 * token forms) — none of it is debugging material, so NOTHING is echoed
 * verbatim: every key is reduced to a fixed shape-class label plus its length.
 * The hard length cap runs FIRST (#837 P1_02): an overlong key is classified
 * from its length alone, before any Set lookup, regex, or per-character scan
 * touches its content; only bounded-size input undergoes shape
 * classification. The same input always classifies identically, and no
 * character of the key beyond its length ever reaches a diagnostic.
 */
function classifyDiagnosticKey(key: string): string {
  if (key.length > DIAGNOSTIC_KEY_MAX_LENGTH) {
    return `<redacted:overlong,len=${key.length}>`;
  }
  if (NON_ECHOABLE_KEY_NAMES.has(key)) {
    return `<redacted:prototype-name,len=${key.length}>`;
  }
  if (SECRET_SHAPED_KEY_PATTERN.test(key)) {
    return `<redacted:secret-shaped,len=${key.length}>`;
  }
  if (containsControlCharacter(key)) {
    return `<redacted:control-character,len=${key.length}>`;
  }
  if (IDENTIFIER_KEY_PATTERN.test(key)) {
    return `<redacted:identifier,len=${key.length}>`;
  }
  if (NUMERIC_INDEX_KEY_PATTERN.test(key)) {
    return `<redacted:index,len=${key.length}>`;
  }
  return `<redacted:non-identifier,len=${key.length}>`;
}

/**
 * Consumer-local rendering of one descriptor-safety issue for THIS module's
 * diagnostics (#643). `safeRecordSnapshot`/`safeArraySnapshot` issues may carry
 * provider-controlled material: a SYMBOL_KEYED_PROPERTY issue names the symbol
 * via `String(symbol)` (embedding the provider-controlled description), and
 * the string issue keys are provider-controlled key names. Here that material
 * is classified, never echoed: only the violation kind, fixed phrasing, and a
 * bounded deterministic classification participate.
 */
function describeResolutionSafetyIssue(issue: RecordSafetyIssue): string {
  if (issue.violation === 'SYMBOL_KEYED_PROPERTY') {
    return 'must not carry symbol-keyed properties (hidden properties are not contract input; symbol descriptions are provider-controlled and never diagnosed)';
  }
  if (issue.key === undefined) {
    return describeRecordSafetyIssue(issue);
  }
  return describeRecordSafetyIssue({
    violation: issue.violation,
    key: classifyDiagnosticKey(issue.key),
  });
}

/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(
  value: unknown,
  description: string,
  code: ResourceResolutionErrorCode,
): Record<string, unknown> {
  const result = safeRecordSnapshot(value, description);
  if (!result.ok) {
    fail(code, `${description} ${describeResolutionSafetyIssue(result.issue)}`);
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
    fail(code, `${description} ${describeResolutionSafetyIssue(result.issue)}`);
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
  | {
      readonly status: 'resolved';
      readonly handle: unknown;
      readonly contract?: ResourceContractRef;
      readonly currentnessPin?: ResourceCurrentnessPin;
    }
  | { readonly status: 'absent' }
  | { readonly status: 'incompatible'; readonly supportedContracts?: readonly ResourceContractRef[] };

const RESOLVED_RESPONSE_FIELDS = new Set<string>(['status', 'handle', 'contract', 'currentnessPin']);
const INCOMPATIBLE_RESPONSE_FIELDS = new Set<string>(['status', 'supportedContracts']);
const ABSENT_RESPONSE_FIELDS = new Set<string>(['status']);

const CURRENTNESS_PIN_FIELDS = new Set<string>(['providerId', 'resourceKey', 'revisionDigest']);

/**
 * Synchronously validate and snapshot one T005C stable non-secret resource
 * currentness pin immediately after its await. Closed three-field whitelist
 * (`providerId`, `resourceKey`, `revisionDigest`) — a secret value,
 * credential, live handle, connection object, function or provider object has
 * NO representable field, and an unknown field (which is where such material
 * would have to ride) fails closed with only a bounded, non-secret,
 * deterministic CLASSIFICATION of the offending key name in the message —
 * the key name itself may be the secret material and is never echoed (#643).
 * Identities must be exact (no floating/range/selector semantics, no
 * embedded `id@selector` form) and the pin's `resourceKey` must exactly equal
 * the requirement's key — a pin for a different resource is never evidence.
 */
function snapshotCurrentnessPin(
  value: unknown,
  path: string,
  expectedResourceKey: string,
): ResourceCurrentnessPin {
  const view = requireSafeRecord(value, path, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
  const unexpectedField = Object.keys(view).find((key) => !CURRENTNESS_PIN_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_RESOURCE_PROVIDER_RESPONSE',
      `${path} must contain exactly {providerId, resourceKey, revisionDigest}; unexpected field "${classifyDiagnosticKey(unexpectedField)}" (secret values, credentials, live handles, connection objects, functions/module paths and provider objects are structurally unrepresentable in currentness evidence)`,
    );
  }
  const providerId = requireExactIdentity(view.providerId, `${path}.providerId`, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
  const resourceKey = requireExactIdentity(view.resourceKey, `${path}.resourceKey`, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
  if (resourceKey !== expectedResourceKey) {
    fail(
      'INVALID_RESOURCE_PROVIDER_RESPONSE',
      `${path}.resourceKey must exactly equal the requirement's resource identity "${expectedResourceKey}"; a pin for a different resource is never currentness evidence`,
    );
  }
  const revisionDigest = requireExactIdentityString(
    view.revisionDigest,
    `${path}.revisionDigest`,
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  requireExactVersion(revisionDigest, `${path}.revisionDigest`, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
  return Object.freeze({ providerId, resourceKey, revisionDigest });
}

/**
 * Synchronously validate and snapshot one provider response immediately after
 * its await. Closed-world whitelists per status; exact refs only; handles are
 * kept as opaque references and never diagnosed. A provider cannot smuggle
 * secret-bearing fields into authority — unknown fields fail closed and only
 * a bounded, non-secret, deterministic classification of the offending key
 * name (never the name itself, never a value) participates in the message
 * (#643).
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
        `${at} must contain exactly {status, handle, contract?, currentnessPin?}; unexpected field "${classifyDiagnosticKey(unexpectedField)}" (provider responses cannot smuggle secret-bearing material into authority)`,
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
    let currentnessPin: ResourceCurrentnessPin | undefined;
    if ('currentnessPin' in view && view.currentnessPin !== undefined) {
      currentnessPin = snapshotCurrentnessPin(
        view.currentnessPin,
        `${at}.currentnessPin`,
        resourceKey,
      );
    }
    const response: {
      status: 'resolved';
      handle: unknown;
      contract?: ResourceContractRef;
      currentnessPin?: ResourceCurrentnessPin;
    } = { status, handle: view.handle };
    if (contract !== undefined) {
      response.contract = contract;
    }
    if (currentnessPin !== undefined) {
      response.currentnessPin = currentnessPin;
    }
    return Object.freeze(response);
  }

  if (status === 'incompatible') {
    const unexpectedField = Object.keys(view).find((key) => !INCOMPATIBLE_RESPONSE_FIELDS.has(key));
    if (unexpectedField !== undefined) {
      fail(
        'INVALID_RESOURCE_PROVIDER_RESPONSE',
        `${at} must contain exactly {status, supportedContracts?}; unexpected field "${classifyDiagnosticKey(unexpectedField)}"`,
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
      `${at} must contain exactly {status}; unexpected field "${classifyDiagnosticKey(unexpectedField)}"`,
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
 * - resolved handles are opaque runtime values; when the provider supplies a
 *   T005C stable non-secret currentness pin it is validated (closed
 *   whitelist, exact identities, exact resourceKey match) and captured as a
 *   frozen/non-aliased snapshot on the entry — capture only, never authority
 *   (the T005C activation/currentness gate consumes and owns the posture);
 * - torn-snapshot discipline: all Assembly material and options are
 *   snapshotted synchronously before the first provider suspension, and every
 *   provider response is snapshotted synchronously right after its await. The
 *   caller mutating its own objects mid-resolution cannot affect the result;
 * - redaction: no error message ever contains a provider handle, a provider
 *   thrown-message, or any provider-supplied value — only exact identity
 *   strings from the Assembly material; provider-controlled own-key names and
 *   symbol descriptions appear only as bounded, non-secret, deterministic
 *   classifications (#643).
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

    // Proxy-trap containment (#794): the resolve() catch above contains the
    // provider CALL, but the response OBJECT is inspected here, outside that
    // catch. A hostile Proxy response can throw from its descriptor/ownKeys/
    // get traps (or trip an engine Proxy-invariant TypeError) during
    // `snapshotProviderResponse`. Every escape from that inspection path is
    // provider-controlled: our own typed fail-closed paths (including #643's
    // and #837's redacted classifications) pass through unchanged as
    // ResourceResolutionError, and anything else fails closed as a
    // deterministic typed error whose fixed message never echoes the caught
    // value's text, name, or properties.
    let response: SnapshotProviderResponse;
    try {
      response = snapshotProviderResponse(raw, request.resourceKey);
    } catch (error) {
      if (error instanceof ResourceResolutionError) {
        throw error;
      }
      fail(
        'INVALID_RESOURCE_PROVIDER_RESPONSE',
        `resource provider response for "${request.resourceKey}" could not be safely inspected (hostile response object); failing closed: provider-controlled trap/error material is never propagated`,
      );
    }

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
          ...(response.currentnessPin === undefined
            ? {}
            : { currentnessPin: response.currentnessPin }),
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
