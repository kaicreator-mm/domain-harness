import {
  computeCanonicalJsonDigest,
  isContentDigest,
  type ContentDigest,
  type Sha256Port,
} from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import type { ResourceCurrentnessEvidence } from '../contracts/resource-resolution.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  carriesXRangeVersionSemantics,
  isNonEmptyIdentityString,
} from '../contracts/record-safety.js';
import type {
  GovernanceBaselineAuthorityBinding,
  GovernanceBaselineBody,
  GovernanceBaselineIdentity,
  GovernanceBaselineStore,
  GovernancePackageCdiBinding,
} from './contracts.js';
import {
  assertGovernanceBaselineIdentity,
  assertGovernancePackageCdiBinding,
  sameGovernanceBaselineIdentity,
  verifyGovernanceBaselineBody,
} from './identity.js';

const FLOATING_AUTHORITY_TOKENS = new Set(['current', 'latest', 'active']);

/**
 * T002D (#655): runtime authority class of an activation/execution occurrence.
 * Belongs to the Assembly/activation/runtime authority plane, NOT Domain
 * Definition identity: the same Definition may back production and simulation
 * assemblies/activations, and no equal Definition identity or similar
 * implementation contents ever imply equal authority class. The class is
 * captured in the exact activation/currentness evidence (the pin digest) and
 * is immutable once pinned.
 */
export type RuntimeAuthorityClass = 'PRODUCTION' | 'SIMULATION';

export const PRODUCTION_AUTHORITY_CLASS: RuntimeAuthorityClass = 'PRODUCTION';
export const SIMULATION_AUTHORITY_CLASS: RuntimeAuthorityClass = 'SIMULATION';

export type DomainActivationBinding = GovernanceBaselineAuthorityBinding;

export interface GovernanceExecutionPin extends DomainActivationBinding {
  readonly workflowTarget: string;
  readonly workflowInstanceId: string;
  readonly bindingDigest: string;
  /**
   * T002C (#617): the exact sealed Runtime Assembly digest this occurrence was
   * activated under. Optional at the type level so pre-T002C (legacy v0.3)
   * pins remain representable, but the v0.7 assembly-activation gate
   * (#617 `AssemblyExecutionActivator`) requires it and fails closed when it
   * is absent, stale, replaced or aliased. When present it is woven into
   * `bindingDigest`, so any Assembly change changes the pin currentness.
   * Never a Tool/Workflow-specific value - generic Assembly identity only.
   */
  readonly assemblyDigest?: ContentDigest;
  /**
   * T002D (#655): the runtime authority class this occurrence was activated
   * under. Optional at the type level so pre-T002D (legacy) pins remain
   * representable and keep their byte-identical legacy digests; when present
   * it is woven into `bindingDigest`, so the class is part of the exact
   * activation/currentness evidence and can never be mutated or substituted
   * after pinning. A SIMULATION-class pin can never satisfy production
   * authoritative occurrence, durable business effect/publication or
   * production journal authority.
   */
  readonly authorityClass?: RuntimeAuthorityClass;
  /**
   * T005C (#656): the exact stable NON-SECRET resource-instance/currentness
   * evidence this occurrence was activated under — one frozen, order-
   * normalized entry per resource occurrence whose exact runtime revision is
   * behaviorally relevant. Optional at the type level so pre-T005C (legacy)
   * pins remain representable and keep their byte-identical legacy digests;
   * when present every entry is woven into `bindingDigest`, so any resource
   * revision/provider replacement changes the occurrence's activation/
   * execution currentness. Entries carry exact identity/digest material only
   * (produced/validated by the T005B resource seam) — secret values,
   * credentials, live handles, connection objects, functions/module paths and
   * provider objects are structurally unrepresentable, and no second resource
   * registry/currentness hierarchy exists: this field IS the resource
   * currentness authority, on the ONE existing pin.
   */
  readonly resourceCurrentness?: readonly ResourceCurrentnessEvidence[];
}

export interface GovernanceBoundSnapshot {
  readonly workflowInstanceId: string;
  readonly governanceBindingDigest: string;
  readonly snapshot: JsonValue;
}

export type BindGovernanceExecutionPinResult = 'inserted' | 'existing' | 'conflict';

/**
 * Atomic activation authority for new-instance bindings. Implementations MUST
 * publish and read the complete immutable tuple as one record. Field-wise
 * package/CDI/governance updates are forbidden because they can expose torn
 * authority. This port reuses the existing activation authority; it does not
 * create a second runtime or execution store.
 */
export interface DomainActivationAuthority {
  readDomainActivationBinding(domainId: string): Promise<unknown>;
  publishDomainActivationBinding(binding: DomainActivationBinding): Promise<void>;
}

/**
 * Narrow T-014 surface of the existing per-instance DurableExecutionStore.
 * The same concrete durability/ordering authority that owns package pins and
 * control snapshots MUST implement these methods. Host persistence is validated
 * by T-022/T-023, not by portable deterministic tests.
 */
export interface DurableExecutionStore {
  getGovernanceExecutionPin(workflowInstanceId: string): Promise<unknown>;
  /** Atomic bind-once operation. Same exact pin is idempotent; conflicts never overwrite. */
  bindGovernanceExecutionPin(pin: GovernanceExecutionPin): Promise<BindGovernanceExecutionPinResult>;
  getGovernanceBoundSnapshot(workflowInstanceId: string): Promise<unknown>;
  putGovernanceBoundSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void>;
}

/** Resolve only an exact package/CDI authority tuple. No floating selectors are accepted. */
export interface ExactPackageCdiAuthority {
  resolveExactPackageCdi(
    binding: GovernancePackageCdiBinding,
  ): Promise<GovernancePackageCdiBinding | undefined>;
}

export type GovernanceExecutionBindingErrorCode =
  | 'INVALID_DOMAIN_ACTIVATION_BINDING'
  | 'MISSING_DOMAIN_ACTIVATION_BINDING'
  | 'FLOATING_EXECUTION_AUTHORITY_FORBIDDEN'
  | 'INVALID_GOVERNANCE_EXECUTION_PIN'
  | 'GOVERNANCE_EXECUTION_PIN_MISSING'
  | 'GOVERNANCE_EXECUTION_PIN_CONFLICT'
  | 'GOVERNANCE_EXECUTION_PIN_MISMATCH'
  | 'SNAPSHOT_BEFORE_GOVERNANCE_PIN'
  | 'SNAPSHOT_GOVERNANCE_BINDING_MISMATCH'
  | 'PACKAGE_CDI_BINDING_MISMATCH'
  | 'PACKAGE_CDI_RECOVERY_MISMATCH'
  | 'GOVERNANCE_BASELINE_BINDING_MISMATCH'
  | 'GOVERNANCE_BASELINE_RECOVERY_MISMATCH'
  | 'ASSEMBLY_DIGEST_FORBIDDEN'
  | 'ASSEMBLY_NOT_SEALED'
  | 'MISSING_ASSEMBLY_DIGEST'
  | 'ASSEMBLY_DEFINITION_CURRENTNESS_MISMATCH'
  | 'ASSEMBLY_REPLAY_MISMATCH'
  | 'AUTHORITY_CLASS_FORBIDDEN'
  | 'AUTHORITY_CLASS_MISMATCH'
  | 'INVALID_RESOURCE_CURRENTNESS'
  | 'RESOURCE_CURRENTNESS_PIN_REQUIRED'
  | 'RESOURCE_CURRENTNESS_MISMATCH';

export class GovernanceExecutionBindingError extends Error {
  readonly code: GovernanceExecutionBindingErrorCode;

  constructor(code: GovernanceExecutionBindingErrorCode, message: string) {
    super(message);
    this.name = 'GovernanceExecutionBindingError';
    this.code = code;
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GovernanceExecutionBindingError(
      'INVALID_DOMAIN_ACTIVATION_BINDING',
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

function assertExactAuthorityToken(value: string, field: string): void {
  const normalized = value.trim().toLowerCase();
  if (
    FLOATING_AUTHORITY_TOKENS.has(normalized)
    || normalized.startsWith('alias:')
    || normalized.startsWith('@current')
    || normalized.startsWith('@latest')
    || normalized.startsWith('@active')
  ) {
    throw new GovernanceExecutionBindingError(
      'FLOATING_EXECUTION_AUTHORITY_FORBIDDEN',
      `${field} must be exact; floating selector ${JSON.stringify(value)} is forbidden`,
    );
  }
}

/**
 * T002C (#617): an Assembly digest bound into the execution pin must be an
 * exact, non-empty content digest - never a floating selector or a mutable
 * provider alias (`latest`/`current`/`active`/`alias:`/`@current`/...). The
 * exact sealed Assembly is content-addressed, so its digest is the only
 * acceptable identity; anything else fails closed.
 */
export function requireExactAssemblyDigest(value: unknown, field: string): ContentDigest {
  if (typeof value !== 'string' || value.trim().length === 0 || !isContentDigest(value)) {
    throw new GovernanceExecutionBindingError(
      'ASSEMBLY_DIGEST_FORBIDDEN',
      `${field} must be a non-empty exact content digest`,
    );
  }
  const normalized = value.trim().toLowerCase();
  if (
    FLOATING_AUTHORITY_TOKENS.has(normalized)
    || normalized.startsWith('alias:')
    || normalized.startsWith('@current')
    || normalized.startsWith('@latest')
    || normalized.startsWith('@active')
  ) {
    throw new GovernanceExecutionBindingError(
      'ASSEMBLY_DIGEST_FORBIDDEN',
      `${field} must be an exact content digest, not a floating selector or mutable alias ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/**
 * T002D (#655): a runtime authority class bound into the execution pin must be
 * exactly `PRODUCTION` or `SIMULATION` - never a floating selector, alias or
 * derived/implicit value. The class is an explicit activation-plane fact, not
 * derivable from Definition identity or implementation contents, and anything
 * else fails closed.
 */
export function requireRuntimeAuthorityClass(value: unknown, field: string): RuntimeAuthorityClass {
  if (value !== PRODUCTION_AUTHORITY_CLASS && value !== SIMULATION_AUTHORITY_CLASS) {
    throw new GovernanceExecutionBindingError(
      'AUTHORITY_CLASS_FORBIDDEN',
      `${field} must be exactly 'PRODUCTION' or 'SIMULATION'; ${JSON.stringify(value)} is forbidden`,
    );
  }
  return value as RuntimeAuthorityClass;
}

/** Code-unit comparison only; `localeCompare` is forbidden in this module. */
function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const RESOURCE_CURRENTNESS_ENTRY_FIELDS = new Set<string>([
  'componentId',
  'providerId',
  'resourceKey',
  'revisionDigest',
]);

/**
 * One exact, non-floating identity string of the T005C resource-currentness
 * evidence. Secrets and live values are excluded STRUCTURALLY: only the four
 * closed whitelist fields exist at all, each restricted to non-empty exact
 * identity strings (no embedded `id@selector` form, no floating/range
 * selector); an object, array, function, symbol-keyed or empty value can
 * never be evidence.
 */
function requireExactResourceCurrentnessIdentity(value: unknown, field: string): string {
  if (typeof value !== 'string' || !isNonEmptyIdentityString(value)) {
    throw new GovernanceExecutionBindingError(
      'INVALID_RESOURCE_CURRENTNESS',
      `${field} must be a non-empty exact identity string`,
    );
  }
  if (carriesEmbeddedSelector(value)) {
    throw new GovernanceExecutionBindingError(
      'INVALID_RESOURCE_CURRENTNESS',
      `${field} must not embed a version selector (\`id@version\`); use the exact digest field`,
    );
  }
  if (carriesFloatingOrRangeSemantics(value) || carriesXRangeVersionSemantics(value)) {
    throw new GovernanceExecutionBindingError(
      'INVALID_RESOURCE_CURRENTNESS',
      `${field} must be an exact identity/digest, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)`,
    );
  }
  return value;
}

/**
 * T005C (#656): validate, order-normalize (componentId, then resourceKey) and
 * deep-freeze one occurrence's resource-currentness evidence. This is the
 * SINGLE normalizer for the material carried on `GovernanceExecutionPin
 * .resourceCurrentness`: the governance seam consumes ONLY stable non-secret
 * evidence produced/validated by the T005B resource seam, re-validates it
 * defensively here (durable pin material is untrusted store data), and never
 * invents, defaults or falls back to any evidence. Duplicate
 * (componentId, resourceKey) entries fail closed — never first-wins.
 */
export function normalizeResourceCurrentnessEvidence(
  value: readonly ResourceCurrentnessEvidence[] | undefined,
  field: string,
): readonly ResourceCurrentnessEvidence[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new GovernanceExecutionBindingError(
      'INVALID_RESOURCE_CURRENTNESS',
      `${field} must be an array of resource-currentness evidence entries`,
    );
  }
  const seen = new Set<string>();
  const entries = value.map((candidate, index) => {
    const at = `${field}[${index}]`;
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new GovernanceExecutionBindingError(
        'INVALID_RESOURCE_CURRENTNESS',
        `${at} must be an object with exactly {componentId, providerId, resourceKey, revisionDigest}`,
      );
    }
    const view = candidate as Record<string, unknown>;
    const unexpectedField = Object.keys(view).find(
      (key) => !RESOURCE_CURRENTNESS_ENTRY_FIELDS.has(key),
    );
    if (unexpectedField !== undefined) {
      throw new GovernanceExecutionBindingError(
        'INVALID_RESOURCE_CURRENTNESS',
        `${at} must contain exactly {componentId, providerId, resourceKey, revisionDigest}; unexpected field "${unexpectedField}" (secret values, credentials, live handles, connection objects, functions/module paths and provider objects are structurally unrepresentable in currentness evidence)`,
      );
    }
    const componentId = requireExactResourceCurrentnessIdentity(view.componentId, `${at}.componentId`);
    const providerId = requireExactResourceCurrentnessIdentity(view.providerId, `${at}.providerId`);
    const resourceKey = requireExactResourceCurrentnessIdentity(view.resourceKey, `${at}.resourceKey`);
    const revisionDigest = requireExactResourceCurrentnessIdentity(view.revisionDigest, `${at}.revisionDigest`);
    const key = `${componentId}\u0000${resourceKey}`;
    if (seen.has(key)) {
      throw new GovernanceExecutionBindingError(
        'INVALID_RESOURCE_CURRENTNESS',
        `${at} declares ${componentId}/${resourceKey} more than once (duplicate resource-currentness evidence is never first-wins)`,
      );
    }
    seen.add(key);
    return Object.freeze({ componentId, providerId, resourceKey, revisionDigest });
  });
  entries.sort(
    (a, b) =>
      lexicalCompare(a.componentId, b.componentId) || lexicalCompare(a.resourceKey, b.resourceKey),
  );
  return Object.freeze(entries);
}

/**
 * T005C (#656): exact equality of two (already order-normalized) resource-
 * currentness evidence sets. `undefined` on both sides is equal; an evidence-
 * less pin can never equal a pin that carries evidence, and any per-entry
 * difference (provider, resource or exact revision digest) is a mismatch —
 * stale, replaced and missing evidence are all typed failures, never a
 * fallback.
 */
export function sameResourceCurrentnessEvidence(
  left: readonly ResourceCurrentnessEvidence[] | undefined,
  right: readonly ResourceCurrentnessEvidence[] | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => {
    const other = right[index] as ResourceCurrentnessEvidence;
    return entry.componentId === other.componentId
      && entry.providerId === other.providerId
      && entry.resourceKey === other.resourceKey
      && entry.revisionDigest === other.revisionDigest;
  });
}

function cloneGovernanceIdentity(
  identity: GovernanceBaselineIdentity,
): GovernanceBaselineIdentity {
  const base = {
    domainId: identity.domainId,
    governanceId: identity.governanceId,
    schemaVersion: identity.schemaVersion,
    contentDigest: identity.contentDigest,
  };
  return Object.freeze(identity.version === undefined
    ? base
    : { ...base, version: identity.version });
}

export function cloneActivationBinding(binding: DomainActivationBinding): DomainActivationBinding {
  return Object.freeze({
    domainId: binding.domainId,
    packageId: binding.packageId,
    domainIntelligenceContentDigest: binding.domainIntelligenceContentDigest,
    governanceBaseline: cloneGovernanceIdentity(binding.governanceBaseline),
  });
}

export function assertDomainActivationBinding(
  binding: DomainActivationBinding,
): void {
  assertGovernancePackageCdiBinding(binding);
  assertGovernanceBaselineIdentity(binding.governanceBaseline);
  if (binding.domainId !== binding.governanceBaseline.domainId) {
    throw new GovernanceExecutionBindingError(
      'INVALID_DOMAIN_ACTIVATION_BINDING',
      `activation domain ${binding.domainId} does not match Governance Baseline domain ${binding.governanceBaseline.domainId}`,
    );
  }
  assertExactAuthorityToken(binding.packageId, 'packageId');
  assertExactAuthorityToken(
    binding.domainIntelligenceContentDigest,
    'domainIntelligenceContentDigest',
  );
  assertExactAuthorityToken(
    binding.governanceBaseline.contentDigest,
    'governanceBaseline.contentDigest',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseGovernanceBaselineIdentity(value: unknown): GovernanceBaselineIdentity {
  if (!isRecord(value)) {
    throw new GovernanceExecutionBindingError(
      'INVALID_DOMAIN_ACTIVATION_BINDING',
      'governanceBaseline must be an object',
    );
  }
  const version = value.version;
  const identity: GovernanceBaselineIdentity = version === undefined
    ? {
        domainId: requireNonEmptyString(value.domainId, 'governanceBaseline.domainId'),
        governanceId: requireNonEmptyString(value.governanceId, 'governanceBaseline.governanceId'),
        schemaVersion: requireNonEmptyString(value.schemaVersion, 'governanceBaseline.schemaVersion'),
        contentDigest: requireNonEmptyString(value.contentDigest, 'governanceBaseline.contentDigest'),
      }
    : {
        domainId: requireNonEmptyString(value.domainId, 'governanceBaseline.domainId'),
        governanceId: requireNonEmptyString(value.governanceId, 'governanceBaseline.governanceId'),
        schemaVersion: requireNonEmptyString(value.schemaVersion, 'governanceBaseline.schemaVersion'),
        version: requireNonEmptyString(version, 'governanceBaseline.version'),
        contentDigest: requireNonEmptyString(value.contentDigest, 'governanceBaseline.contentDigest'),
      };
  assertGovernanceBaselineIdentity(identity);
  return identity;
}

function parseDomainActivationBinding(value: unknown): DomainActivationBinding {
  if (!isRecord(value)) {
    throw new GovernanceExecutionBindingError(
      'INVALID_DOMAIN_ACTIVATION_BINDING',
      'DomainActivationBinding must be an object',
    );
  }
  const binding: DomainActivationBinding = {
    domainId: requireNonEmptyString(value.domainId, 'domainId'),
    packageId: requireNonEmptyString(value.packageId, 'packageId'),
    domainIntelligenceContentDigest: requireNonEmptyString(
      value.domainIntelligenceContentDigest,
      'domainIntelligenceContentDigest',
    ),
    governanceBaseline: parseGovernanceBaselineIdentity(value.governanceBaseline),
  };
  assertDomainActivationBinding(binding);
  return cloneActivationBinding(binding);
}

function samePackageCdi(
  left: GovernancePackageCdiBinding,
  right: GovernancePackageCdiBinding,
): boolean {
  return left.domainId === right.domainId
    && left.packageId === right.packageId
    && left.domainIntelligenceContentDigest === right.domainIntelligenceContentDigest;
}

function asPackageCdi(binding: DomainActivationBinding): GovernancePackageCdiBinding {
  return {
    domainId: binding.domainId,
    packageId: binding.packageId,
    domainIntelligenceContentDigest: binding.domainIntelligenceContentDigest,
  };
}

export async function requireExactPackageCdi(
  binding: DomainActivationBinding,
  authority: ExactPackageCdiAuthority,
  errorCode: Extract<
    GovernanceExecutionBindingErrorCode,
    'PACKAGE_CDI_BINDING_MISMATCH' | 'PACKAGE_CDI_RECOVERY_MISMATCH'
  > = 'PACKAGE_CDI_RECOVERY_MISMATCH',
): Promise<GovernancePackageCdiBinding> {
  const expected = asPackageCdi(binding);
  const resolved = await authority.resolveExactPackageCdi(expected);
  if (resolved === undefined || !samePackageCdi(resolved, expected)) {
    throw new GovernanceExecutionBindingError(
      errorCode,
      'exact package/CDI authority required by the binding is missing or mismatched',
    );
  }
  return resolved;
}

export async function requireExactGovernanceBody(
  binding: DomainActivationBinding,
  baselines: GovernanceBaselineStore,
  sha256: Sha256Port,
  errorCode: Extract<
    GovernanceExecutionBindingErrorCode,
    'GOVERNANCE_BASELINE_BINDING_MISMATCH' | 'GOVERNANCE_BASELINE_RECOVERY_MISMATCH'
  > = 'GOVERNANCE_BASELINE_RECOVERY_MISMATCH',
): Promise<GovernanceBaselineBody> {
  const body = await baselines.getBody(binding.governanceBaseline);
  if (body === undefined) {
    throw new GovernanceExecutionBindingError(
      errorCode,
      'exact Governance Baseline body required by the execution binding is missing',
    );
  }
  try {
    await verifyGovernanceBaselineBody(body, sha256);
  } catch (error) {
    throw new GovernanceExecutionBindingError(
      errorCode,
      `exact Governance Baseline body is corrupt: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!sameGovernanceBaselineIdentity(body.identity, binding.governanceBaseline)) {
    throw new GovernanceExecutionBindingError(
      errorCode,
      'resolved Governance Baseline body does not match the exact execution binding',
    );
  }
  return body;
}

export class DomainActivationBindingCoordinator {
  readonly #authority: DomainActivationAuthority;
  readonly #packageCdiAuthority: ExactPackageCdiAuthority;
  readonly #baselines: GovernanceBaselineStore;
  readonly #sha256: Sha256Port;

  constructor(
    authority: DomainActivationAuthority,
    packageCdiAuthority: ExactPackageCdiAuthority,
    baselines: GovernanceBaselineStore,
    sha256: Sha256Port,
  ) {
    this.#authority = authority;
    this.#packageCdiAuthority = packageCdiAuthority;
    this.#baselines = baselines;
    this.#sha256 = sha256;
  }

  async publish(binding: DomainActivationBinding): Promise<DomainActivationBinding> {
    assertDomainActivationBinding(binding);
    const exact = cloneActivationBinding(binding);
    await requireExactPackageCdi(
      exact,
      this.#packageCdiAuthority,
      'PACKAGE_CDI_BINDING_MISMATCH',
    );
    await requireExactGovernanceBody(
      exact,
      this.#baselines,
      this.#sha256,
      'GOVERNANCE_BASELINE_BINDING_MISMATCH',
    );
    await this.#authority.publishDomainActivationBinding(exact);
    return exact;
  }

  async resolveForNewInstance(domainId: string): Promise<DomainActivationBinding> {
    requireNonEmptyString(domainId, 'domainId');
    const raw = await this.#authority.readDomainActivationBinding(domainId);
    if (raw === undefined || raw === null) {
      throw new GovernanceExecutionBindingError(
        'MISSING_DOMAIN_ACTIVATION_BINDING',
        `no exact DomainActivationBinding exists for domain ${domainId}`,
      );
    }
    const binding = parseDomainActivationBinding(raw);
    if (binding.domainId !== domainId) {
      throw new GovernanceExecutionBindingError(
        'INVALID_DOMAIN_ACTIVATION_BINDING',
        `activation lookup for ${domainId} returned binding for ${binding.domainId}`,
      );
    }
    await requireExactPackageCdi(
      binding,
      this.#packageCdiAuthority,
      'PACKAGE_CDI_BINDING_MISMATCH',
    );
    await requireExactGovernanceBody(
      binding,
      this.#baselines,
      this.#sha256,
      'GOVERNANCE_BASELINE_BINDING_MISMATCH',
    );
    return binding;
  }
}

function bindingDigestMaterial(
  binding: DomainActivationBinding,
  assemblyDigest?: ContentDigest,
  authorityClass?: RuntimeAuthorityClass,
  resourceCurrentness?: readonly ResourceCurrentnessEvidence[],
): object {
  const base = {
    packageId: binding.packageId,
    domainIntelligenceContentDigest: binding.domainIntelligenceContentDigest,
    governanceBaseline: {
      domainId: binding.governanceBaseline.domainId,
      governanceId: binding.governanceBaseline.governanceId,
      schemaVersion: binding.governanceBaseline.schemaVersion,
      contentDigest: binding.governanceBaseline.contentDigest,
    },
  };
  // T002C (#617): when an exact Assembly is bound, its digest becomes part of
  // the pin currentness material, so replacing the Assembly changes the pin.
  // T002D (#655): likewise the runtime authority class becomes part of the pin
  // currentness material when bound, so substituting the class changes the pin.
  // T005C (#656): likewise the exact stable non-secret resource-currentness
  // evidence becomes part of the pin currentness material when bound, so any
  // resource revision/provider replacement changes the occurrence currentness.
  // Legacy pins carrying none of these fields keep their exact pre-T002C/
  // T002D/T005C digest material (byte-identical legacy digests).
  const withAssembly = assemblyDigest === undefined ? base : { ...base, assemblyDigest };
  const withClass = authorityClass === undefined ? withAssembly : { ...withAssembly, authorityClass };
  return resourceCurrentness === undefined
    ? withClass
    : { ...withClass, resourceCurrentness };
}

export async function computeGovernanceExecutionBindingDigest(
  binding: DomainActivationBinding,
  sha256: Sha256Port,
  assemblyDigest?: ContentDigest,
  authorityClass?: RuntimeAuthorityClass,
  resourceCurrentness?: readonly ResourceCurrentnessEvidence[],
): Promise<string> {
  assertDomainActivationBinding(binding);
  if (assemblyDigest !== undefined) {
    requireExactAssemblyDigest(assemblyDigest, 'assemblyDigest');
  }
  if (authorityClass !== undefined) {
    requireRuntimeAuthorityClass(authorityClass, 'authorityClass');
  }
  const currentness =
    resourceCurrentness === undefined
      ? undefined
      : normalizeResourceCurrentnessEvidence(resourceCurrentness, 'resourceCurrentness');
  return computeCanonicalJsonDigest(
    bindingDigestMaterial(binding, assemblyDigest, authorityClass, currentness),
    sha256,
  );
}

export async function createGovernanceExecutionPin(
  request: {
    readonly workflowTarget: string;
    readonly workflowInstanceId: string;
    readonly binding: DomainActivationBinding;
    readonly assemblyDigest?: ContentDigest;
    readonly authorityClass?: RuntimeAuthorityClass;
    readonly resourceCurrentness?: readonly ResourceCurrentnessEvidence[];
  },
  sha256: Sha256Port,
): Promise<GovernanceExecutionPin> {
  const workflowTarget = requireNonEmptyString(request.workflowTarget, 'workflowTarget');
  const workflowInstanceId = requireNonEmptyString(
    request.workflowInstanceId,
    'workflowInstanceId',
  );
  assertDomainActivationBinding(request.binding);
  // Synchronously resolved before the first await: the exact Assembly digest
  // (when supplied) is validated and captured here, never re-read after a
  // suspension (#617 torn-snapshot discipline). T002D extends the same
  // discipline to the authority class; T005C extends it to the exact
  // resource-currentness evidence (validated, order-normalized and frozen
  // synchronously — a caller mutating its own array mid-flight can never mint
  // hybrid evidence).
  const assemblyDigest =
    request.assemblyDigest === undefined
      ? undefined
      : requireExactAssemblyDigest(request.assemblyDigest, 'assemblyDigest');
  const authorityClass =
    request.authorityClass === undefined
      ? undefined
      : requireRuntimeAuthorityClass(request.authorityClass, 'authorityClass');
  const resourceCurrentness =
    request.resourceCurrentness === undefined
      ? undefined
      : normalizeResourceCurrentnessEvidence(request.resourceCurrentness, 'resourceCurrentness');
  const binding = cloneActivationBinding(request.binding);
  return Object.freeze({
    ...binding,
    ...(assemblyDigest === undefined ? {} : { assemblyDigest }),
    ...(authorityClass === undefined ? {} : { authorityClass }),
    ...(resourceCurrentness === undefined ? {} : { resourceCurrentness }),
    workflowTarget,
    workflowInstanceId,
    bindingDigest: await computeGovernanceExecutionBindingDigest(
      binding,
      sha256,
      assemblyDigest,
      authorityClass,
      resourceCurrentness,
    ),
  });
}

function parsePinShape(value: unknown): GovernanceExecutionPin {
  if (!isRecord(value)) {
    throw new GovernanceExecutionBindingError(
      'INVALID_GOVERNANCE_EXECUTION_PIN',
      'GovernanceExecutionPin must be an object',
    );
  }
  const binding = parseDomainActivationBinding(value);
  const assemblyDigest =
    value.assemblyDigest === undefined
      ? undefined
      : requireExactAssemblyDigest(value.assemblyDigest, 'assemblyDigest');
  const authorityClass =
    value.authorityClass === undefined
      ? undefined
      : requireRuntimeAuthorityClass(value.authorityClass, 'authorityClass');
  // T005C (#656): defensively re-validate durably stored evidence (store data
  // is untrusted): closed whitelist, exact identities, order-normalized. A
  // parse failure is wrapped into INVALID_GOVERNANCE_EXECUTION_PIN by the
  // validate wrapper, never interpreted as evidence-less authority.
  const resourceCurrentness =
    value.resourceCurrentness === undefined
      ? undefined
      : normalizeResourceCurrentnessEvidence(
          value.resourceCurrentness as readonly ResourceCurrentnessEvidence[],
          'pin.resourceCurrentness',
        );
  return Object.freeze({
    ...binding,
    ...(assemblyDigest === undefined ? {} : { assemblyDigest }),
    ...(authorityClass === undefined ? {} : { authorityClass }),
    ...(resourceCurrentness === undefined ? {} : { resourceCurrentness }),
    workflowTarget: requireNonEmptyString(value.workflowTarget, 'workflowTarget'),
    workflowInstanceId: requireNonEmptyString(value.workflowInstanceId, 'workflowInstanceId'),
    bindingDigest: requireNonEmptyString(value.bindingDigest, 'bindingDigest'),
  });
}

export async function validateGovernanceExecutionPin(
  value: unknown,
  sha256: Sha256Port,
  expectedWorkflowInstanceId?: string,
): Promise<GovernanceExecutionPin> {
  let pin: GovernanceExecutionPin;
  try {
    pin = parsePinShape(value);
  } catch (error) {
    if (error instanceof GovernanceExecutionBindingError) {
      throw new GovernanceExecutionBindingError(
        'INVALID_GOVERNANCE_EXECUTION_PIN',
        `invalid GovernanceExecutionPin: ${error.message}`,
      );
    }
    throw error;
  }
  if (
    expectedWorkflowInstanceId !== undefined
    && pin.workflowInstanceId !== expectedWorkflowInstanceId
  ) {
    throw new GovernanceExecutionBindingError(
      'GOVERNANCE_EXECUTION_PIN_MISMATCH',
      `pin belongs to workflow instance ${pin.workflowInstanceId}, not ${expectedWorkflowInstanceId}`,
    );
  }
  const expectedDigest = await computeGovernanceExecutionBindingDigest(
    pin,
    sha256,
    pin.assemblyDigest,
    pin.authorityClass,
    pin.resourceCurrentness,
  );
  if (pin.bindingDigest !== expectedDigest) {
    throw new GovernanceExecutionBindingError(
      'INVALID_GOVERNANCE_EXECUTION_PIN',
      'GovernanceExecutionPin bindingDigest does not match its exact authority tuple',
    );
  }
  return pin;
}

function sameExecutionPin(left: GovernanceExecutionPin, right: GovernanceExecutionPin): boolean {
  return left.workflowTarget === right.workflowTarget
    && left.workflowInstanceId === right.workflowInstanceId
    && left.domainId === right.domainId
    && left.packageId === right.packageId
    && left.domainIntelligenceContentDigest === right.domainIntelligenceContentDigest
    && sameGovernanceBaselineIdentity(left.governanceBaseline, right.governanceBaseline)
    && left.assemblyDigest === right.assemblyDigest
    && left.authorityClass === right.authorityClass
    && sameResourceCurrentnessEvidence(left.resourceCurrentness, right.resourceCurrentness)
    && left.bindingDigest === right.bindingDigest;
}

export class GovernanceExecutionCoordinator {
  readonly #store: DurableExecutionStore;
  readonly #sha256: Sha256Port;

  constructor(store: DurableExecutionStore, sha256: Sha256Port) {
    this.#store = store;
    this.#sha256 = sha256;
  }

  async pinExecution(request: {
    readonly workflowTarget: string;
    readonly workflowInstanceId: string;
    readonly binding: DomainActivationBinding;
    readonly assemblyDigest?: ContentDigest;
    readonly authorityClass?: RuntimeAuthorityClass;
    readonly resourceCurrentness?: readonly ResourceCurrentnessEvidence[];
  }): Promise<GovernanceExecutionPin> {
    const pin = await createGovernanceExecutionPin(request, this.#sha256);
    const disposition = await this.#store.bindGovernanceExecutionPin(pin);
    if (disposition === 'conflict') {
      throw new GovernanceExecutionBindingError(
        'GOVERNANCE_EXECUTION_PIN_CONFLICT',
        `workflow instance ${pin.workflowInstanceId} is already bound to different execution authority`,
      );
    }
    const durable = await this.requirePinnedExecution(pin.workflowInstanceId);
    if (!sameExecutionPin(durable, pin)) {
      throw new GovernanceExecutionBindingError(
        'GOVERNANCE_EXECUTION_PIN_CONFLICT',
        `workflow instance ${pin.workflowInstanceId} durable pin differs from requested authority`,
      );
    }
    return durable;
  }

  /**
   * Gate to call immediately before an authoritative state-changing control
   * publication. It returns only after the exact pin is already durable.
   * T-019 owns central Workflow wiring of this gate into control publication.
   */
  async requirePinnedExecution(
    workflowInstanceId: string,
  ): Promise<GovernanceExecutionPin> {
    const raw = await this.#store.getGovernanceExecutionPin(workflowInstanceId);
    if (raw === undefined || raw === null) {
      throw new GovernanceExecutionBindingError(
        'GOVERNANCE_EXECUTION_PIN_MISSING',
        `workflow instance ${workflowInstanceId} has no durable GovernanceExecutionPin`,
      );
    }
    return validateGovernanceExecutionPin(raw, this.#sha256, workflowInstanceId);
  }

  async persistSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void> {
    const pin = await this.requirePinnedExecution(snapshot.workflowInstanceId).catch((error: unknown) => {
      if (
        error instanceof GovernanceExecutionBindingError
        && error.code === 'GOVERNANCE_EXECUTION_PIN_MISSING'
      ) {
        throw new GovernanceExecutionBindingError(
          'SNAPSHOT_BEFORE_GOVERNANCE_PIN',
          `cannot persist snapshot for ${snapshot.workflowInstanceId} before GovernanceExecutionPin`,
        );
      }
      throw error;
    });
    if (snapshot.governanceBindingDigest !== pin.bindingDigest) {
      throw new GovernanceExecutionBindingError(
        'SNAPSHOT_GOVERNANCE_BINDING_MISMATCH',
        `snapshot for ${snapshot.workflowInstanceId} is not bound to its exact GovernanceExecutionPin`,
      );
    }
    await this.#store.putGovernanceBoundSnapshot(Object.freeze({ ...snapshot }));
  }
}

export interface RecoveredGovernanceExecutionAuthority {
  readonly pin: GovernanceExecutionPin;
  readonly governanceBaseline: GovernanceBaselineBody;
  readonly snapshot?: GovernanceBoundSnapshot;
}

function parseSnapshot(value: unknown): GovernanceBoundSnapshot {
  if (!isRecord(value)) {
    throw new GovernanceExecutionBindingError(
      'SNAPSHOT_GOVERNANCE_BINDING_MISMATCH',
      'governance-bound snapshot must be an object',
    );
  }
  const workflowInstanceId = requireNonEmptyString(value.workflowInstanceId, 'workflowInstanceId');
  const governanceBindingDigest = requireNonEmptyString(
    value.governanceBindingDigest,
    'governanceBindingDigest',
  );
  if (!Object.prototype.hasOwnProperty.call(value, 'snapshot')) {
    throw new GovernanceExecutionBindingError(
      'SNAPSHOT_GOVERNANCE_BINDING_MISMATCH',
      'governance-bound snapshot payload is missing',
    );
  }
  return Object.freeze({
    workflowInstanceId,
    governanceBindingDigest,
    snapshot: value.snapshot as JsonValue,
  });
}

export async function recoverGovernanceExecutionAuthority(request: {
  readonly workflowInstanceId: string;
  readonly store: DurableExecutionStore;
  readonly packageCdiAuthority: ExactPackageCdiAuthority;
  readonly baselines: GovernanceBaselineStore;
  readonly sha256: Sha256Port;
}): Promise<RecoveredGovernanceExecutionAuthority> {
  const workflowInstanceId = requireNonEmptyString(
    request.workflowInstanceId,
    'workflowInstanceId',
  );
  const rawPin = await request.store.getGovernanceExecutionPin(workflowInstanceId);
  if (rawPin === undefined || rawPin === null) {
    throw new GovernanceExecutionBindingError(
      'GOVERNANCE_EXECUTION_PIN_MISSING',
      `cannot recover ${workflowInstanceId} without its exact GovernanceExecutionPin`,
    );
  }
  const pin = await validateGovernanceExecutionPin(rawPin, request.sha256, workflowInstanceId);
  await requireExactPackageCdi(pin, request.packageCdiAuthority);
  const governanceBaseline = await requireExactGovernanceBody(
    pin,
    request.baselines,
    request.sha256,
  );

  const rawSnapshot = await request.store.getGovernanceBoundSnapshot(workflowInstanceId);
  if (rawSnapshot === undefined || rawSnapshot === null) {
    return Object.freeze({ pin, governanceBaseline });
  }
  const snapshot = parseSnapshot(rawSnapshot);
  if (
    snapshot.workflowInstanceId !== workflowInstanceId
    || snapshot.governanceBindingDigest !== pin.bindingDigest
  ) {
    throw new GovernanceExecutionBindingError(
      'SNAPSHOT_GOVERNANCE_BINDING_MISMATCH',
      'persisted snapshot does not reference the exact GovernanceExecutionPin',
    );
  }
  return Object.freeze({ pin, governanceBaseline, snapshot });
}
