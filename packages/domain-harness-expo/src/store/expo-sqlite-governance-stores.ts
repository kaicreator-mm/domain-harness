import {
  GovernanceContractError,
  PromotionActivationAuthorityError,
  governanceBaselineKey,
} from '@kaicreator/domain-harness';
import type {
  DomainActivationAuthority,
  DomainActivationBinding,
  ExactPackageCdiAuthority,
  GovernanceBaselineBody,
  GovernanceBaselineIdentity,
  GovernanceBaselineRetentionReference,
  GovernanceBaselineStore,
  GovernancePackageCdiBinding,
  PromotionActivationAuditRecord,
  PromotionActivationAuditStore,
} from '@kaicreator/domain-harness';
import type { JsonValue as CanonicalJsonValue } from '@kaicreator/domain-harness/v2';
import type { ExclusiveTransactionQueue } from './exclusive-transaction.js';
import type { ExpoSqliteBindParams, ExpoSqliteExecutorLike } from './expo-sqlite-types.js';
import { canonicalText, cloneCanonical, decodeJson } from './authority-shared.js';

interface GovernanceBaselineRow {
  body_json: string;
}

interface RetentionReferenceRow {
  identity_key: string;
  live: number;
  reference_json: string;
}

interface DomainActivationBindingRow {
  binding_json: string;
}

interface ExactPackageCdiRow {
  binding_json: string;
}

interface AuthorityAuditRow {
  audit_id: string;
  record_json: string;
}

function params(values: readonly (string | number | null)[]): ExpoSqliteBindParams {
  return values;
}

/**
 * T-023 Expo SQLite adapter for the persistent logical Governance Baseline
 * store contract. Semantics mirror the volatile reference model and the T-022
 * Node adapter exactly: bodies are immutable by digest; a retention
 * referenceId is bound once and its first binding survives release as a
 * tombstone (live=0 row) so a released ID can never be rebound or reactivated;
 * collection deletes the body only when no live reference targets the exact
 * identity.
 */
export class ExpoSqliteGovernanceBaselineStore implements GovernanceBaselineStore {
  readonly #database: ExpoSqliteExecutorLike;
  readonly #writes: ExclusiveTransactionQueue;

  public constructor(database: ExpoSqliteExecutorLike, writes: ExclusiveTransactionQueue) {
    this.#database = database;
    this.#writes = writes;
  }

  async getBody(identity: GovernanceBaselineIdentity): Promise<GovernanceBaselineBody | undefined> {
    const row = await this.#database.getFirstAsync<GovernanceBaselineRow>(
      `
      SELECT body_json FROM dh_v3_governance_baselines WHERE identity_key = ?
    `,
      params([governanceBaselineKey(identity)]),
    );
    if (row === null) return undefined;
    return cloneCanonical(
      decodeJson<GovernanceBaselineBody>(row.body_json, 'governance baseline body'),
      'governance baseline body',
    );
  }

  async putBody(body: GovernanceBaselineBody): Promise<void> {
    const identityKey = governanceBaselineKey(body.identity);
    const encoded = canonicalText(body as unknown as CanonicalJsonValue, 'governance baseline body');
    await this.#writes.run(async (transaction) => {
      const existing = await transaction.getFirstAsync<GovernanceBaselineRow>(
        `
        SELECT body_json FROM dh_v3_governance_baselines WHERE identity_key = ?
      `,
        params([identityKey]),
      );
      if (existing !== null) {
        if (existing.body_json !== encoded) {
          throw new GovernanceContractError(
            'GOVERNANCE_BODY_CONFLICT',
            'logical store rejected mutation under an existing Governance Baseline digest',
          );
        }
        return;
      }
      await transaction.runAsync(
        `
        INSERT INTO dh_v3_governance_baselines (identity_key, body_json) VALUES (?, ?)
      `,
        params([identityKey, encoded]),
      );
    });
  }

  async collectBodyIfUnreferenced(identity: GovernanceBaselineIdentity): Promise<boolean> {
    const identityKey = governanceBaselineKey(identity);
    return this.#writes.run(async (transaction): Promise<boolean> => {
      const live = await transaction.getFirstAsync<unknown>(
        `
        SELECT 1 FROM dh_v3_governance_retention_references
        WHERE identity_key = ? AND live = 1
        LIMIT 1
      `,
        params([identityKey]),
      );
      if (live !== null) return false;
      await transaction.runAsync(
        `
        DELETE FROM dh_v3_governance_baselines WHERE identity_key = ?
      `,
        params([identityKey]),
      );
      return true;
    });
  }

  /** Live references only; released IDs read back as undefined. */
  async getReference(
    referenceId: string,
  ): Promise<GovernanceBaselineRetentionReference | undefined> {
    const row = await this.#database.getFirstAsync<{ reference_json: string }>(
      `
      SELECT reference_json FROM dh_v3_governance_retention_references
      WHERE reference_id = ? AND live = 1
    `,
      params([referenceId]),
    );
    if (row === null) return undefined;
    return cloneCanonical(
      decodeJson<GovernanceBaselineRetentionReference>(row.reference_json, 'governance retention reference'),
      'governance retention reference',
    );
  }

  async putReference(reference: GovernanceBaselineRetentionReference): Promise<void> {
    const encoded = canonicalText(reference as unknown as CanonicalJsonValue, 'governance retention reference');
    await this.#writes.run(async (transaction) => {
      const binding = await transaction.getFirstAsync<RetentionReferenceRow>(
        `
        SELECT live, reference_json FROM dh_v3_governance_retention_references
        WHERE reference_id = ?
      `,
        params([reference.referenceId]),
      );
      if (binding !== null) {
        if (binding.reference_json !== encoded) {
          throw new GovernanceContractError(
            'RETENTION_REFERENCE_CONFLICT',
            `logical store rejected retention reference rebinding for ${reference.referenceId}`,
          );
        }
        if (binding.live === 0) {
          throw new GovernanceContractError(
            'RETENTION_REFERENCE_CONFLICT',
            `released retention reference ${reference.referenceId} cannot be reactivated`,
          );
        }
        return;
      }

      const identityKey = governanceBaselineKey(reference.baseline);
      const body = await transaction.getFirstAsync<unknown>(
        `
        SELECT 1 FROM dh_v3_governance_baselines WHERE identity_key = ?
      `,
        params([identityKey]),
      );
      if (body === null) {
        throw new GovernanceContractError(
          'MISSING_RETAINED_GOVERNANCE_BASELINE',
          'logical store cannot retain a reference after the exact baseline body was collected',
        );
      }

      await transaction.runAsync(
        `
        INSERT INTO dh_v3_governance_retention_references
          (reference_id, identity_key, live, reference_json)
        VALUES (?, ?, 1, ?)
      `,
        params([reference.referenceId, identityKey, encoded]),
      );
    });
  }

  async releaseReference(
    expected: GovernanceBaselineRetentionReference,
  ): Promise<'released' | 'absent'> {
    const encoded = canonicalText(expected as unknown as CanonicalJsonValue, 'governance retention reference');
    return this.#writes.run(async (transaction): Promise<'released' | 'absent'> => {
      const binding = await transaction.getFirstAsync<RetentionReferenceRow>(
        `
        SELECT live, reference_json FROM dh_v3_governance_retention_references
        WHERE reference_id = ?
      `,
        params([expected.referenceId]),
      );
      if (binding !== null && binding.reference_json !== encoded) {
        throw new GovernanceContractError(
          'RETENTION_REFERENCE_CONFLICT',
          `retention reference ${expected.referenceId} is bound to different authority`,
        );
      }

      if (binding === null || binding.live === 0) return 'absent';
      if (binding.reference_json !== encoded) {
        throw new GovernanceContractError(
          'RETENTION_REFERENCE_CONFLICT',
          `conditional release rejected stale authority for ${expected.referenceId}`,
        );
      }

      // The row is kept with live=0 as the immutable referenceId tombstone.
      await transaction.runAsync(
        `
        UPDATE dh_v3_governance_retention_references SET live = 0 WHERE reference_id = ?
      `,
        params([expected.referenceId]),
      );
      return 'released';
    });
  }

  async listReferences(
    identity: GovernanceBaselineIdentity,
  ): Promise<readonly GovernanceBaselineRetentionReference[]> {
    const identityKey = governanceBaselineKey(identity);
    const rows = await this.#database.getAllAsync<{ reference_id: string; reference_json: string }>(
      `
      SELECT reference_id, reference_json FROM dh_v3_governance_retention_references
      WHERE identity_key = ? AND live = 1
    `,
      params([identityKey]),
    );
    return rows
      .map((row) => ({
        referenceId: row.reference_id,
        reference: cloneCanonical(
          decodeJson<GovernanceBaselineRetentionReference>(row.reference_json, 'governance retention reference'),
          'governance retention reference',
        ),
      }))
      .sort((left, right) => left.referenceId.localeCompare(right.referenceId))
      .map((entry) => entry.reference);
  }
}

/**
 * T-023 Expo SQLite adapter for the atomic DomainActivationAuthority seam.
 * Publication is a non-torn single-record upsert: the COMPLETE binding is
 * written as one canonical record per domain (never field-wise updates), so a
 * reader observes either the previous or the new complete tuple.
 */
export class ExpoSqliteDomainActivationAuthority implements DomainActivationAuthority {
  readonly #database: ExpoSqliteExecutorLike;
  readonly #writes: ExclusiveTransactionQueue;

  public constructor(database: ExpoSqliteExecutorLike, writes: ExclusiveTransactionQueue) {
    this.#database = database;
    this.#writes = writes;
  }

  async readDomainActivationBinding(domainId: string): Promise<unknown> {
    const row = await this.#database.getFirstAsync<DomainActivationBindingRow>(
      `
      SELECT binding_json FROM dh_v3_domain_activation_bindings WHERE domain_id = ?
    `,
      params([domainId]),
    );
    if (row === null) return undefined;
    return decodeJson<unknown>(row.binding_json, 'domain activation binding');
  }

  async publishDomainActivationBinding(binding: DomainActivationBinding): Promise<void> {
    const encoded = canonicalText(binding as unknown as CanonicalJsonValue, 'domain activation binding');
    await this.#writes.run(async (transaction) => {
      await transaction.runAsync(
        `
        INSERT INTO dh_v3_domain_activation_bindings (domain_id, binding_json) VALUES (?, ?)
        ON CONFLICT(domain_id) DO UPDATE SET binding_json = excluded.binding_json
      `,
        params([binding.domainId, encoded]),
      );
    });
  }
}

/**
 * T-023 Expo SQLite adapter for the exact package/CDI authority seam. Only the
 * exact (domainId, packageId, domainIntelligenceContentDigest) tuple resolves;
 * no floating selectors exist. Registration is idempotent per exact tuple.
 */
export class ExpoSqliteExactPackageCdiAuthority implements ExactPackageCdiAuthority {
  readonly #database: ExpoSqliteExecutorLike;
  readonly #writes: ExclusiveTransactionQueue;

  public constructor(database: ExpoSqliteExecutorLike, writes: ExclusiveTransactionQueue) {
    this.#database = database;
    this.#writes = writes;
  }

  /**
   * Host-side registration; the tuple IS the content, so re-register is a
   * no-op. Unlike the sync Node adapter method, the write serializes through
   * the shared exclusive transaction queue and therefore returns a Promise.
   */
  async registerExactPackageCdi(binding: GovernancePackageCdiBinding): Promise<void> {
    const encoded = canonicalText(binding as unknown as CanonicalJsonValue, 'exact package/CDI authority binding');
    await this.#writes.run(async (transaction) => {
      await transaction.runAsync(
        `
        INSERT OR IGNORE INTO dh_v3_exact_package_cdi_authority
          (domain_id, package_id, cdi_digest, binding_json)
        VALUES (?, ?, ?, ?)
      `,
        params([binding.domainId, binding.packageId, binding.domainIntelligenceContentDigest, encoded]),
      );
    });
  }

  async resolveExactPackageCdi(
    binding: GovernancePackageCdiBinding,
  ): Promise<GovernancePackageCdiBinding | undefined> {
    const row = await this.#database.getFirstAsync<ExactPackageCdiRow>(
      `
      SELECT binding_json FROM dh_v3_exact_package_cdi_authority
      WHERE domain_id = ? AND package_id = ? AND cdi_digest = ?
    `,
      params([binding.domainId, binding.packageId, binding.domainIntelligenceContentDigest]),
    );
    if (row === null) return undefined;
    return cloneCanonical(
      decodeJson<GovernancePackageCdiBinding>(row.binding_json, 'exact package/CDI authority binding'),
      'exact package/CDI authority binding',
    );
  }
}

/**
 * T-023 Expo SQLite adapter for the portable promotion/activation audit
 * contract. actionId is bound once: any replay/rebind of an existing actionId
 * fails closed with AUDIT_IDENTITY_CONFLICT, mirroring the volatile reference.
 */
export class ExpoSqliteAuthorityAuditStore implements PromotionActivationAuditStore {
  readonly #database: ExpoSqliteExecutorLike;
  readonly #writes: ExclusiveTransactionQueue;

  public constructor(database: ExpoSqliteExecutorLike, writes: ExclusiveTransactionQueue) {
    this.#database = database;
    this.#writes = writes;
  }

  async getByActionId(actionId: string): Promise<PromotionActivationAuditRecord | undefined> {
    const row = await this.#database.getFirstAsync<{ record_json: string }>(
      `
      SELECT record_json FROM dh_v3_authority_audit WHERE action_id = ?
    `,
      params([actionId]),
    );
    if (row === null) return undefined;
    return cloneCanonical(
      decodeJson<PromotionActivationAuditRecord>(row.record_json, 'authority audit record'),
      'authority audit record',
    );
  }

  async put(record: PromotionActivationAuditRecord): Promise<void> {
    const encoded = canonicalText(record as unknown as CanonicalJsonValue, 'authority audit record');
    await this.#writes.run(async (transaction) => {
      const existing = await transaction.getFirstAsync<AuthorityAuditRow>(
        `
        SELECT audit_id FROM dh_v3_authority_audit WHERE action_id = ?
      `,
        params([record.actionId]),
      );
      if (existing !== null) {
        throw new PromotionActivationAuthorityError(
          'AUDIT_IDENTITY_CONFLICT',
          `authority action ${record.actionId} is already bound to audit ${existing.audit_id}`,
        );
      }
      await transaction.runAsync(
        `
        INSERT INTO dh_v3_authority_audit (action_id, audit_id, record_json) VALUES (?, ?, ?)
      `,
        params([record.actionId, record.auditId, encoded]),
      );
    });
  }
}
