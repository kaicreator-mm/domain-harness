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
import type { JsonValue } from '@kaicreator/domain-harness/v2';
import {
  canonicalText,
  cloneCanonical,
  decodeJson,
  type AuthoritySqliteDatabase,
} from './authority-shared.js';

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

/**
 * T-022 Node SQLite adapter for the persistent logical Governance Baseline
 * store contract. Semantics mirror the volatile reference model exactly:
 * bodies are immutable by digest; a retention referenceId is bound once and
 * its first binding survives release as a tombstone (live=0 row) so a released
 * ID can never be rebound or reactivated; collection deletes the body only
 * when no live reference targets the exact identity.
 */
export class NodeSqliteGovernanceBaselineStore implements GovernanceBaselineStore {
  readonly #db: AuthoritySqliteDatabase;

  constructor(db: AuthoritySqliteDatabase) {
    this.#db = db;
  }

  async getBody(identity: GovernanceBaselineIdentity): Promise<GovernanceBaselineBody | undefined> {
    const row = this.#db.prepare(`
      SELECT body_json FROM dh_v3_governance_baselines WHERE identity_key = ?
    `).get(governanceBaselineKey(identity)) as GovernanceBaselineRow | undefined;
    if (row === undefined) return undefined;
    return cloneCanonical(
      decodeJson<GovernanceBaselineBody>(row.body_json, 'governance baseline body'),
      'governance baseline body',
    );
  }

  async putBody(body: GovernanceBaselineBody): Promise<void> {
    const identityKey = governanceBaselineKey(body.identity);
    const encoded = canonicalText(body as unknown as JsonValue, 'governance baseline body');
    const transaction = this.#db.transaction(() => {
      const existing = this.#db.prepare(`
        SELECT body_json FROM dh_v3_governance_baselines WHERE identity_key = ?
      `).get(identityKey) as GovernanceBaselineRow | undefined;
      if (existing !== undefined) {
        if (existing.body_json !== encoded) {
          throw new GovernanceContractError(
            'GOVERNANCE_BODY_CONFLICT',
            'logical store rejected mutation under an existing Governance Baseline digest',
          );
        }
        return;
      }
      this.#db.prepare(`
        INSERT INTO dh_v3_governance_baselines (identity_key, body_json) VALUES (?, ?)
      `).run(identityKey, encoded);
    });
    transaction.immediate();
  }

  async collectBodyIfUnreferenced(identity: GovernanceBaselineIdentity): Promise<boolean> {
    const identityKey = governanceBaselineKey(identity);
    const transaction = this.#db.transaction((): boolean => {
      const live = this.#db.prepare(`
        SELECT 1 FROM dh_v3_governance_retention_references
        WHERE identity_key = ? AND live = 1
        LIMIT 1
      `).get(identityKey);
      if (live !== undefined) return false;
      this.#db.prepare(`
        DELETE FROM dh_v3_governance_baselines WHERE identity_key = ?
      `).run(identityKey);
      return true;
    });
    return transaction.immediate();
  }

  /** Live references only; released IDs read back as undefined. */
  async getReference(
    referenceId: string,
  ): Promise<GovernanceBaselineRetentionReference | undefined> {
    const row = this.#db.prepare(`
      SELECT reference_json FROM dh_v3_governance_retention_references
      WHERE reference_id = ? AND live = 1
    `).get(referenceId) as { reference_json: string } | undefined;
    if (row === undefined) return undefined;
    return cloneCanonical(
      decodeJson<GovernanceBaselineRetentionReference>(row.reference_json, 'governance retention reference'),
      'governance retention reference',
    );
  }

  async putReference(reference: GovernanceBaselineRetentionReference): Promise<void> {
    const encoded = canonicalText(reference as unknown as JsonValue, 'governance retention reference');
    const transaction = this.#db.transaction(() => {
      const binding = this.#db.prepare(`
        SELECT live, reference_json FROM dh_v3_governance_retention_references
        WHERE reference_id = ?
      `).get(reference.referenceId) as RetentionReferenceRow | undefined;
      if (binding !== undefined) {
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
      const body = this.#db.prepare(`
        SELECT 1 FROM dh_v3_governance_baselines WHERE identity_key = ?
      `).get(identityKey);
      if (body === undefined) {
        throw new GovernanceContractError(
          'MISSING_RETAINED_GOVERNANCE_BASELINE',
          'logical store cannot retain a reference after the exact baseline body was collected',
        );
      }

      this.#db.prepare(`
        INSERT INTO dh_v3_governance_retention_references
          (reference_id, identity_key, live, reference_json)
        VALUES (?, ?, 1, ?)
      `).run(reference.referenceId, identityKey, encoded);
    });
    transaction.immediate();
  }

  async releaseReference(
    expected: GovernanceBaselineRetentionReference,
  ): Promise<'released' | 'absent'> {
    const encoded = canonicalText(expected as unknown as JsonValue, 'governance retention reference');
    const transaction = this.#db.transaction((): 'released' | 'absent' => {
      const binding = this.#db.prepare(`
        SELECT live, reference_json FROM dh_v3_governance_retention_references
        WHERE reference_id = ?
      `).get(expected.referenceId) as RetentionReferenceRow | undefined;
      if (binding !== undefined && binding.reference_json !== encoded) {
        throw new GovernanceContractError(
          'RETENTION_REFERENCE_CONFLICT',
          `retention reference ${expected.referenceId} is bound to different authority`,
        );
      }

      if (binding === undefined || binding.live === 0) return 'absent';
      if (binding.reference_json !== encoded) {
        throw new GovernanceContractError(
          'RETENTION_REFERENCE_CONFLICT',
          `conditional release rejected stale authority for ${expected.referenceId}`,
        );
      }

      // The row is kept with live=0 as the immutable referenceId tombstone.
      this.#db.prepare(`
        UPDATE dh_v3_governance_retention_references SET live = 0 WHERE reference_id = ?
      `).run(expected.referenceId);
      return 'released';
    });
    return transaction.immediate();
  }

  async listReferences(
    identity: GovernanceBaselineIdentity,
  ): Promise<readonly GovernanceBaselineRetentionReference[]> {
    const identityKey = governanceBaselineKey(identity);
    const rows = this.#db.prepare(`
      SELECT reference_id, reference_json FROM dh_v3_governance_retention_references
      WHERE identity_key = ? AND live = 1
    `).all(identityKey) as Array<{ reference_id: string; reference_json: string }>;
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
 * T-022 Node SQLite adapter for the atomic DomainActivationAuthority seam.
 * Publication is a non-torn single-record upsert: the COMPLETE binding is
 * written as one canonical record per domain (never field-wise updates), so a
 * reader observes either the previous or the new complete tuple.
 */
export class NodeSqliteDomainActivationAuthority implements DomainActivationAuthority {
  readonly #db: AuthoritySqliteDatabase;

  constructor(db: AuthoritySqliteDatabase) {
    this.#db = db;
  }

  async readDomainActivationBinding(domainId: string): Promise<unknown> {
    const row = this.#db.prepare(`
      SELECT binding_json FROM dh_v3_domain_activation_bindings WHERE domain_id = ?
    `).get(domainId) as DomainActivationBindingRow | undefined;
    if (row === undefined) return undefined;
    return decodeJson<unknown>(row.binding_json, 'domain activation binding');
  }

  async publishDomainActivationBinding(binding: DomainActivationBinding): Promise<void> {
    const encoded = canonicalText(binding as unknown as JsonValue, 'domain activation binding');
    const transaction = this.#db.transaction(() => {
      this.#db.prepare(`
        INSERT INTO dh_v3_domain_activation_bindings (domain_id, binding_json) VALUES (?, ?)
        ON CONFLICT(domain_id) DO UPDATE SET binding_json = excluded.binding_json
      `).run(binding.domainId, encoded);
    });
    transaction.immediate();
  }
}

/**
 * T-022 Node SQLite adapter for the exact package/CDI authority seam. Only the
 * exact (domainId, packageId, domainIntelligenceContentDigest) tuple resolves;
 * no floating selectors exist. Registration is idempotent per exact tuple.
 */
export class NodeSqliteExactPackageCdiAuthority implements ExactPackageCdiAuthority {
  readonly #db: AuthoritySqliteDatabase;

  constructor(db: AuthoritySqliteDatabase) {
    this.#db = db;
  }

  /** Host-side registration; the tuple IS the content, so re-register is a no-op. */
  registerExactPackageCdi(binding: GovernancePackageCdiBinding): void {
    const encoded = canonicalText(binding as unknown as JsonValue, 'exact package/CDI authority binding');
    const transaction = this.#db.transaction(() => {
      this.#db.prepare(`
        INSERT OR IGNORE INTO dh_v3_exact_package_cdi_authority
          (domain_id, package_id, cdi_digest, binding_json)
        VALUES (?, ?, ?, ?)
      `).run(binding.domainId, binding.packageId, binding.domainIntelligenceContentDigest, encoded);
    });
    transaction.immediate();
  }

  async resolveExactPackageCdi(
    binding: GovernancePackageCdiBinding,
  ): Promise<GovernancePackageCdiBinding | undefined> {
    const row = this.#db.prepare(`
      SELECT binding_json FROM dh_v3_exact_package_cdi_authority
      WHERE domain_id = ? AND package_id = ? AND cdi_digest = ?
    `).get(
      binding.domainId,
      binding.packageId,
      binding.domainIntelligenceContentDigest,
    ) as ExactPackageCdiRow | undefined;
    if (row === undefined) return undefined;
    return cloneCanonical(
      decodeJson<GovernancePackageCdiBinding>(row.binding_json, 'exact package/CDI authority binding'),
      'exact package/CDI authority binding',
    );
  }
}

/**
 * T-022 Node SQLite adapter for the portable promotion/activation audit
 * contract. actionId is bound once: any replay/rebind of an existing actionId
 * fails closed with AUDIT_IDENTITY_CONFLICT, mirroring the volatile reference.
 */
export class NodeSqliteAuthorityAuditStore implements PromotionActivationAuditStore {
  readonly #db: AuthoritySqliteDatabase;

  constructor(db: AuthoritySqliteDatabase) {
    this.#db = db;
  }

  async getByActionId(actionId: string): Promise<PromotionActivationAuditRecord | undefined> {
    const row = this.#db.prepare(`
      SELECT record_json FROM dh_v3_authority_audit WHERE action_id = ?
    `).get(actionId) as { record_json: string } | undefined;
    if (row === undefined) return undefined;
    return cloneCanonical(
      decodeJson<PromotionActivationAuditRecord>(row.record_json, 'authority audit record'),
      'authority audit record',
    );
  }

  async put(record: PromotionActivationAuditRecord): Promise<void> {
    const encoded = canonicalText(record as unknown as JsonValue, 'authority audit record');
    const transaction = this.#db.transaction(() => {
      const existing = this.#db.prepare(`
        SELECT audit_id FROM dh_v3_authority_audit WHERE action_id = ?
      `).get(record.actionId) as AuthorityAuditRow | undefined;
      if (existing !== undefined) {
        throw new PromotionActivationAuthorityError(
          'AUDIT_IDENTITY_CONFLICT',
          `authority action ${record.actionId} is already bound to audit ${existing.audit_id}`,
        );
      }
      this.#db.prepare(`
        INSERT INTO dh_v3_authority_audit (action_id, audit_id, record_json) VALUES (?, ?, ?)
      `).run(record.actionId, record.auditId, encoded);
    });
    transaction.immediate();
  }
}
