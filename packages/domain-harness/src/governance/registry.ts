import { canonicalJsonStringify } from '../contracts/identity.js';
import type { Sha256Port } from '../contracts/identity.js';
import {
  GovernanceContractError,
  type GovernanceBaselineAuthorityBinding,
  type GovernanceBaselineBody,
  type GovernanceBaselineIdentity,
  type GovernanceBaselineRetentionReference,
  type GovernanceBaselineStore,
} from './contracts.js';
import {
  assertGovernanceBaselineIdentity,
  createGovernanceBaselineAuthorityBinding,
  governanceBaselineKey,
  sameGovernanceBaselineIdentity,
  verifyGovernanceBaselineBody,
} from './identity.js';

function cloneCanonical<T>(value: T): T {
  return JSON.parse(canonicalJsonStringify(value)) as T;
}

function validateReference(reference: GovernanceBaselineRetentionReference): void {
  if (typeof reference.referenceId !== 'string' || reference.referenceId.trim().length === 0) {
    throw new GovernanceContractError(
      'INVALID_RETENTION_REFERENCE',
      'retention referenceId must be non-empty',
    );
  }
  assertGovernanceBaselineIdentity(reference.baseline);
  const validReasons = new Set([
    'active-execution',
    'recoverable-execution',
    'audit',
    'validation',
    'promotion',
  ]);
  if (!validReasons.has(reference.reason)) {
    throw new GovernanceContractError(
      'INVALID_RETENTION_REFERENCE',
      `unknown retention reason ${String(reference.reason)}`,
    );
  }

  const executionReference =
    reference.reason === 'active-execution' || reference.reason === 'recoverable-execution';
  if (executionReference && reference.authorityBinding === undefined) {
    throw new GovernanceContractError(
      'INVALID_RETENTION_REFERENCE',
      `${reference.reason} requires exact package/CDI authority binding`,
    );
  }

  if (reference.authorityBinding !== undefined) {
    const checked = createGovernanceBaselineAuthorityBinding(
      reference.authorityBinding,
      reference.authorityBinding.governanceBaseline,
    );
    if (!sameGovernanceBaselineIdentity(reference.baseline, checked.governanceBaseline)) {
      throw new GovernanceContractError(
        'INVALID_RETENTION_REFERENCE',
        'retention reference baseline does not match its package/CDI authority binding',
      );
    }
  }
}

function referencesEquivalent(
  left: GovernanceBaselineRetentionReference,
  right: GovernanceBaselineRetentionReference,
): boolean {
  return canonicalJsonStringify(left) === canonicalJsonStringify(right);
}

/** Portable registry/retention core over a persistent logical store contract. */
export class GovernanceBaselineRegistry {
  readonly #store: GovernanceBaselineStore;
  readonly #sha256: Sha256Port;

  constructor(store: GovernanceBaselineStore, sha256: Sha256Port) {
    this.#store = store;
    this.#sha256 = sha256;
  }

  async register(body: GovernanceBaselineBody): Promise<GovernanceBaselineBody> {
    await verifyGovernanceBaselineBody(body, this.#sha256);
    const existing = await this.#store.getBody(body.identity);
    if (existing !== undefined) {
      try {
        await verifyGovernanceBaselineBody(existing, this.#sha256);
      } catch (error) {
        throw new GovernanceContractError(
          'CORRUPT_RETAINED_GOVERNANCE_BASELINE',
          `existing retained Governance Baseline is corrupt: ${String(error)}`,
        );
      }
      if (canonicalJsonStringify(existing.semantics) !== canonicalJsonStringify(body.semantics)) {
        throw new GovernanceContractError(
          'GOVERNANCE_BODY_CONFLICT',
          'same exact Governance Baseline digest cannot be rebound to different semantics',
        );
      }
      return cloneCanonical(existing);
    }

    await this.#store.putBody(cloneCanonical(body));
    return cloneCanonical(body);
  }

  async resolveExact(identity: GovernanceBaselineIdentity): Promise<GovernanceBaselineBody> {
    assertGovernanceBaselineIdentity(identity);
    const body = await this.#store.getBody(identity);
    if (body === undefined) {
      throw new GovernanceContractError(
        'MISSING_RETAINED_GOVERNANCE_BASELINE',
        `exact retained Governance Baseline is unavailable for ${governanceBaselineKey(identity)}`,
      );
    }
    if (!sameGovernanceBaselineIdentity(identity, body.identity)) {
      throw new GovernanceContractError(
        'CORRUPT_RETAINED_GOVERNANCE_BASELINE',
        'store returned a Governance Baseline body for the wrong exact identity',
      );
    }
    try {
      await verifyGovernanceBaselineBody(body, this.#sha256);
    } catch (error) {
      throw new GovernanceContractError(
        'CORRUPT_RETAINED_GOVERNANCE_BASELINE',
        `retained Governance Baseline failed exact digest verification: ${String(error)}`,
      );
    }
    return cloneCanonical(body);
  }

  async retain(reference: GovernanceBaselineRetentionReference): Promise<void> {
    validateReference(reference);
    await this.resolveExact(reference.baseline);

    const existing = await this.#store.getReference(reference.referenceId);
    if (existing !== undefined) {
      if (!referencesEquivalent(existing, reference)) {
        throw new GovernanceContractError(
          'RETENTION_REFERENCE_CONFLICT',
          `retention reference ${reference.referenceId} is already bound to different authority`,
        );
      }
      return;
    }
    await this.#store.putReference(cloneCanonical(reference));
  }

  async release(
    referenceId: string,
    expectedBaseline: GovernanceBaselineIdentity,
  ): Promise<void> {
    if (referenceId.trim().length === 0) {
      throw new GovernanceContractError(
        'INVALID_RETENTION_REFERENCE',
        'retention referenceId must be non-empty',
      );
    }
    assertGovernanceBaselineIdentity(expectedBaseline);
    const existing = await this.#store.getReference(referenceId);
    if (existing === undefined) return;
    if (!sameGovernanceBaselineIdentity(existing.baseline, expectedBaseline)) {
      throw new GovernanceContractError(
        'RETENTION_REFERENCE_CONFLICT',
        `retention reference ${referenceId} does not belong to the expected baseline`,
      );
    }
    await this.#store.deleteReference(referenceId);
  }

  async referenceCount(identity: GovernanceBaselineIdentity): Promise<number> {
    assertGovernanceBaselineIdentity(identity);
    return (await this.#store.listReferences(identity)).length;
  }

  async collect(identity: GovernanceBaselineIdentity): Promise<void> {
    await this.resolveExact(identity);
    const references = await this.#store.listReferences(identity);
    if (references.length > 0) {
      throw new GovernanceContractError(
        'GOVERNANCE_BASELINE_RETAINED',
        `Governance Baseline remains required by ${references.length} retained reference(s)`,
      );
    }
    await this.#store.deleteBody(identity);
  }
}

/**
 * Deterministic portable store-contract model. It is not host persistence truth.
 */
export class MemoryGovernanceBaselineStore implements GovernanceBaselineStore {
  readonly #bodies = new Map<string, GovernanceBaselineBody>();
  readonly #references = new Map<string, GovernanceBaselineRetentionReference>();

  async getBody(identity: GovernanceBaselineIdentity): Promise<GovernanceBaselineBody | undefined> {
    const body = this.#bodies.get(governanceBaselineKey(identity));
    return body === undefined ? undefined : cloneCanonical(body);
  }

  async putBody(body: GovernanceBaselineBody): Promise<void> {
    const key = governanceBaselineKey(body.identity);
    const existing = this.#bodies.get(key);
    if (existing !== undefined && canonicalJsonStringify(existing) !== canonicalJsonStringify(body)) {
      throw new GovernanceContractError(
        'GOVERNANCE_BODY_CONFLICT',
        'logical store rejected mutation under an existing Governance Baseline digest',
      );
    }
    this.#bodies.set(key, cloneCanonical(body));
  }

  async deleteBody(identity: GovernanceBaselineIdentity): Promise<void> {
    this.#bodies.delete(governanceBaselineKey(identity));
  }

  async getReference(
    referenceId: string,
  ): Promise<GovernanceBaselineRetentionReference | undefined> {
    const reference = this.#references.get(referenceId);
    return reference === undefined ? undefined : cloneCanonical(reference);
  }

  async putReference(reference: GovernanceBaselineRetentionReference): Promise<void> {
    const existing = this.#references.get(reference.referenceId);
    if (existing !== undefined && !referencesEquivalent(existing, reference)) {
      throw new GovernanceContractError(
        'RETENTION_REFERENCE_CONFLICT',
        `logical store rejected retention reference rebinding for ${reference.referenceId}`,
      );
    }
    this.#references.set(reference.referenceId, cloneCanonical(reference));
  }

  async deleteReference(referenceId: string): Promise<void> {
    this.#references.delete(referenceId);
  }

  async listReferences(
    identity: GovernanceBaselineIdentity,
  ): Promise<readonly GovernanceBaselineRetentionReference[]> {
    const result: GovernanceBaselineRetentionReference[] = [];
    for (const reference of this.#references.values()) {
      if (sameGovernanceBaselineIdentity(reference.baseline, identity)) {
        result.push(cloneCanonical(reference));
      }
    }
    return result.sort((left, right) => left.referenceId.localeCompare(right.referenceId));
  }
}

export function assertRetentionAuthorityBinding(
  baseline: GovernanceBaselineIdentity,
  binding: GovernanceBaselineAuthorityBinding,
): void {
  const checked = createGovernanceBaselineAuthorityBinding(binding, binding.governanceBaseline);
  if (!sameGovernanceBaselineIdentity(baseline, checked.governanceBaseline)) {
    throw new GovernanceContractError(
      'INVALID_RETENTION_REFERENCE',
      'authority binding does not target the retained Governance Baseline',
    );
  }
}
