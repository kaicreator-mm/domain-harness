import {
  computeCanonicalJsonDigest,
  type Sha256Port,
} from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
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

export type DomainActivationBinding = GovernanceBaselineAuthorityBinding;

export interface GovernanceExecutionPin extends DomainActivationBinding {
  readonly workflowTarget: string;
  readonly workflowInstanceId: string;
  readonly bindingDigest: string;
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
  | 'GOVERNANCE_BASELINE_RECOVERY_MISMATCH';

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

function cloneActivationBinding(binding: DomainActivationBinding): DomainActivationBinding {
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

async function requireExactPackageCdi(
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

async function requireExactGovernanceBody(
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

function bindingDigestMaterial(binding: DomainActivationBinding): object {
  return {
    packageId: binding.packageId,
    domainIntelligenceContentDigest: binding.domainIntelligenceContentDigest,
    governanceBaseline: {
      domainId: binding.governanceBaseline.domainId,
      governanceId: binding.governanceBaseline.governanceId,
      schemaVersion: binding.governanceBaseline.schemaVersion,
      contentDigest: binding.governanceBaseline.contentDigest,
    },
  };
}

export async function computeGovernanceExecutionBindingDigest(
  binding: DomainActivationBinding,
  sha256: Sha256Port,
): Promise<string> {
  assertDomainActivationBinding(binding);
  return computeCanonicalJsonDigest(bindingDigestMaterial(binding), sha256);
}

export async function createGovernanceExecutionPin(
  request: {
    readonly workflowTarget: string;
    readonly workflowInstanceId: string;
    readonly binding: DomainActivationBinding;
  },
  sha256: Sha256Port,
): Promise<GovernanceExecutionPin> {
  const workflowTarget = requireNonEmptyString(request.workflowTarget, 'workflowTarget');
  const workflowInstanceId = requireNonEmptyString(
    request.workflowInstanceId,
    'workflowInstanceId',
  );
  assertDomainActivationBinding(request.binding);
  const binding = cloneActivationBinding(request.binding);
  return Object.freeze({
    ...binding,
    workflowTarget,
    workflowInstanceId,
    bindingDigest: await computeGovernanceExecutionBindingDigest(binding, sha256),
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
  return Object.freeze({
    ...binding,
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
  const expectedDigest = await computeGovernanceExecutionBindingDigest(pin, sha256);
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
