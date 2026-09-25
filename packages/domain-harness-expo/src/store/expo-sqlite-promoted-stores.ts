import {
  PromotedArtifactContractError,
  samePromotedArtifactAuthority,
  samePromotedArtifactIdentity,
} from '@kaicreator/domain-harness';
import type {
  BindPromotedArtifactAliasInput,
  DynamicChildExecutionPin,
  DynamicChildPinStore,
  InsertDynamicChildPinResult,
  PromotedArtifactAliasBinding,
  PromotedArtifactBody,
  PromotedArtifactIdentity,
  PromotedArtifactPromotionRecord,
  PromotedArtifactRetentionReference,
  PromotedArtifactRevocationRecord,
  PromotedArtifactStore,
  PromotedArtifactVersionBinding,
} from '@kaicreator/domain-harness';
import type { JsonValue as CanonicalJsonValue } from '@kaicreator/domain-harness/v2';
import type { ExclusiveTransactionQueue } from './exclusive-transaction.js';
import type { ExpoSqliteExecutorLike } from './expo-sqlite-types.js';
import { canonicalText, decodeJson } from './authority-shared.js';

interface BodyRow {
  body_json: string;
}

interface PromotionRow {
  promotion_json: string;
}

interface BindingRow {
  binding_json: string;
}

interface AliasRow {
  revision: number;
  binding_json: string;
}

interface RevocationRow {
  revocation_json: string;
}

interface RetentionRow {
  reference_json: string;
}

interface PinRow {
  pin_json: string;
}

interface ExistenceRow {
  present: number;
}

function sameRetention(
  left: PromotedArtifactRetentionReference,
  right: PromotedArtifactRetentionReference,
): boolean {
  return left.referenceId === right.referenceId
    && left.reason === right.reason
    && samePromotedArtifactIdentity(left.artifact, right.artifact)
    && samePromotedArtifactAuthority(left.authorityBinding, right.authorityBinding);
}

function samePin(left: DynamicChildExecutionPin, right: DynamicChildExecutionPin): boolean {
  return left.slot.target.workflowId === right.slot.target.workflowId
    && left.slot.target.instanceKey === right.slot.target.instanceKey
    && left.slot.parentActorId === right.slot.parentActorId
    && left.slot.childActorId === right.slot.childActorId
    && left.slot.invocationOrdinal === right.slot.invocationOrdinal
    && left.invokingPackageId === right.invokingPackageId
    && left.invokingAuthority.domainId === right.invokingAuthority.domainId
    && left.invokingAuthority.packageId === right.invokingAuthority.packageId
    && left.invokingAuthority.domainIntelligenceContentDigest === right.invokingAuthority.domainIntelligenceContentDigest
    && left.invokingAuthority.governanceBaseline.domainId === right.invokingAuthority.governanceBaseline.domainId
    && left.invokingAuthority.governanceBaseline.governanceId === right.invokingAuthority.governanceBaseline.governanceId
    && left.invokingAuthority.governanceBaseline.schemaVersion === right.invokingAuthority.governanceBaseline.schemaVersion
    && left.invokingAuthority.governanceBaseline.contentDigest === right.invokingAuthority.governanceBaseline.contentDigest
    && samePromotedArtifactIdentity(left.artifact, right.artifact)
    && left.pinnedAt === right.pinnedAt;
}

/**
 * T-023 Expo SQLite adapter for the T-012 promoted artifact registry store.
 * Semantics mirror the volatile reference store and the T-022 Node adapter
 * exactly (same error classes, codes and messages); every multi-step mutation
 * is one exclusive transaction behind the serialized writer queue and every
 * equality is canonical byte/text comparison, so the durable home fails closed
 * exactly like the in-memory reference.
 */
export class ExpoSqlitePromotedArtifactStore implements PromotedArtifactStore {
  readonly #database: ExpoSqliteExecutorLike;
  readonly #writes: ExclusiveTransactionQueue;

  public constructor(database: ExpoSqliteExecutorLike, writes: ExclusiveTransactionQueue) {
    this.#database = database;
    this.#writes = writes;
  }

  async getBody(identity: PromotedArtifactIdentity): Promise<PromotedArtifactBody | undefined> {
    const row = await this.#database.getFirstAsync<BodyRow>(`
      SELECT body_json FROM dh_v3_promoted_artifact_bodies
      WHERE artifact_id = ? AND content_digest = ?
    `, [identity.artifactId, identity.contentDigest]);
    return row === null
      ? undefined
      : decodeJson<PromotedArtifactBody>(row.body_json, 'promoted artifact body');
  }

  async getPromotionRecords(
    identity: PromotedArtifactIdentity,
  ): Promise<readonly PromotedArtifactPromotionRecord[]> {
    const rows = await this.#database.getAllAsync<PromotionRow>(`
      SELECT promotion_json FROM dh_v3_promoted_artifact_promotions
      WHERE artifact_id = ? AND content_digest = ?
    `, [identity.artifactId, identity.contentDigest]);
    return rows
      .map((row) => decodeJson<PromotedArtifactPromotionRecord>(row.promotion_json, 'promotion record'))
      .sort((left, right) => left.recordId.localeCompare(right.recordId));
  }

  async commitPromotion(
    body: PromotedArtifactBody,
    promotion: PromotedArtifactPromotionRecord,
    versionBinding: PromotedArtifactVersionBinding,
  ): Promise<void> {
    const encodedBody = canonicalText(body as unknown as CanonicalJsonValue, 'promoted artifact body');
    const encodedPromotion = canonicalText(promotion as unknown as CanonicalJsonValue, 'promotion record');
    const encodedVersion = canonicalText(versionBinding as unknown as CanonicalJsonValue, 'promoted version binding');
    await this.#writes.run(async (transaction) => {
      if (
        !samePromotedArtifactIdentity(body.identity, promotion.artifact)
        || !samePromotedArtifactIdentity(body.identity, versionBinding.artifact)
        || versionBinding.artifactId !== body.identity.artifactId
        || promotion.version !== versionBinding.version
      ) {
        throw new PromotedArtifactContractError(
          'INVALID_PROMOTED_ARTIFACT',
          'promotion transaction identities do not agree',
        );
      }

      const existingBody = await transaction.getFirstAsync<BodyRow>(`
        SELECT body_json FROM dh_v3_promoted_artifact_bodies
        WHERE artifact_id = ? AND content_digest = ?
      `, [body.identity.artifactId, body.identity.contentDigest]);
      if (existingBody !== null && existingBody.body_json !== encodedBody) {
        throw new PromotedArtifactContractError(
          'PROMOTED_ARTIFACT_BODY_CONFLICT',
          `immutable promoted body conflict for ${body.identity.artifactId}@${body.identity.contentDigest}`,
        );
      }

      const existingVersion = await transaction.getFirstAsync<BindingRow>(`
        SELECT binding_json FROM dh_v3_promoted_artifact_versions
        WHERE artifact_id = ? AND version = ?
      `, [versionBinding.artifactId, versionBinding.version]);
      if (existingVersion !== null) {
        const existingBinding = decodeJson<PromotedArtifactVersionBinding>(
          existingVersion.binding_json,
          'promoted version binding',
        );
        if (!samePromotedArtifactIdentity(existingBinding.artifact, versionBinding.artifact)) {
          throw new PromotedArtifactContractError(
            'PROMOTED_ARTIFACT_VERSION_REBIND',
            `version ${versionBinding.artifactId}@${versionBinding.version} is already bound to another digest`,
          );
        }
      }

      const recordOwner = await transaction.getFirstAsync<PromotionRow>(`
        SELECT promotion_json FROM dh_v3_promoted_artifact_promotions WHERE record_id = ?
      `, [promotion.recordId]);
      if (recordOwner !== null && recordOwner.promotion_json !== encodedPromotion) {
        throw new PromotedArtifactContractError(
          'PROMOTED_ARTIFACT_BODY_CONFLICT',
          `promotion record ${promotion.recordId} cannot be rebound`,
        );
      }

      // No mutation above this point: commit all three authorities together.
      if (existingBody === null) {
        await transaction.runAsync(`
          INSERT INTO dh_v3_promoted_artifact_bodies (artifact_id, content_digest, body_json)
          VALUES (?, ?, ?)
        `, [body.identity.artifactId, body.identity.contentDigest, encodedBody]);
      }
      if (existingVersion === null) {
        await transaction.runAsync(`
          INSERT INTO dh_v3_promoted_artifact_versions (artifact_id, version, binding_json)
          VALUES (?, ?, ?)
        `, [versionBinding.artifactId, versionBinding.version, encodedVersion]);
      }
      if (recordOwner === null) {
        await transaction.runAsync(`
          INSERT INTO dh_v3_promoted_artifact_promotions
            (record_id, artifact_id, content_digest, promotion_json)
          VALUES (?, ?, ?, ?)
        `, [promotion.recordId, body.identity.artifactId, body.identity.contentDigest, encodedPromotion]);
      }
    });
  }

  async getVersion(
    artifactId: string,
    version: string,
  ): Promise<PromotedArtifactVersionBinding | undefined> {
    const row = await this.#database.getFirstAsync<BindingRow>(`
      SELECT binding_json FROM dh_v3_promoted_artifact_versions
      WHERE artifact_id = ? AND version = ?
    `, [artifactId, version]);
    return row === null
      ? undefined
      : decodeJson<PromotedArtifactVersionBinding>(row.binding_json, 'promoted version binding');
  }

  async getAlias(
    artifactId: string,
    alias: string,
  ): Promise<PromotedArtifactAliasBinding | undefined> {
    const row = await this.#database.getFirstAsync<BindingRow>(`
      SELECT binding_json FROM dh_v3_promoted_artifact_aliases
      WHERE artifact_id = ? AND alias = ?
    `, [artifactId, alias]);
    return row === null
      ? undefined
      : decodeJson<PromotedArtifactAliasBinding>(row.binding_json, 'promoted alias binding');
  }

  async putAlias(input: BindPromotedArtifactAliasInput): Promise<PromotedArtifactAliasBinding> {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new PromotedArtifactContractError(
        'INVALID_PROMOTED_ARTIFACT',
        'alias expectedRevision must be a non-negative integer',
      );
    }
    return this.#writes.run(async (transaction) => {
      const existing = await transaction.getFirstAsync<AliasRow>(`
        SELECT revision, binding_json FROM dh_v3_promoted_artifact_aliases
        WHERE artifact_id = ? AND alias = ?
      `, [input.artifactId, input.alias]);
      const currentRevision = existing?.revision ?? 0;
      if (input.expectedRevision !== currentRevision) {
        throw new PromotedArtifactContractError(
          'PROMOTED_ARTIFACT_STALE_SELECTION',
          `alias ${input.artifactId}:${input.alias} expected revision ${input.expectedRevision}, current ${currentRevision}`,
        );
      }
      const next: PromotedArtifactAliasBinding = {
        artifactId: input.artifactId,
        alias: input.alias,
        artifact: input.artifact,
        revision: currentRevision + 1,
      };
      const encoded = canonicalText(next as unknown as CanonicalJsonValue, 'promoted alias binding');
      await transaction.runAsync(`
        INSERT INTO dh_v3_promoted_artifact_aliases (artifact_id, alias, revision, binding_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (artifact_id, alias) DO UPDATE SET revision = excluded.revision, binding_json = excluded.binding_json
      `, [input.artifactId, input.alias, next.revision, encoded]);
      return decodeJson<PromotedArtifactAliasBinding>(encoded, 'promoted alias binding');
    });
  }

  async getRevocation(
    identity: PromotedArtifactIdentity,
  ): Promise<PromotedArtifactRevocationRecord | undefined> {
    const row = await this.#database.getFirstAsync<RevocationRow>(`
      SELECT revocation_json FROM dh_v3_promoted_artifact_revocations
      WHERE artifact_id = ? AND content_digest = ?
    `, [identity.artifactId, identity.contentDigest]);
    return row === null
      ? undefined
      : decodeJson<PromotedArtifactRevocationRecord>(row.revocation_json, 'promoted revocation record');
  }

  async putRevocation(record: PromotedArtifactRevocationRecord): Promise<void> {
    const encoded = canonicalText(record as unknown as CanonicalJsonValue, 'promoted revocation record');
    await this.#writes.run(async (transaction) => {
      const existing = await transaction.getFirstAsync<RevocationRow>(`
        SELECT revocation_json FROM dh_v3_promoted_artifact_revocations
        WHERE artifact_id = ? AND content_digest = ?
      `, [record.artifact.artifactId, record.artifact.contentDigest]);
      if (existing !== null) {
        if (existing.revocation_json !== encoded) {
          throw new PromotedArtifactContractError(
            'PROMOTED_ARTIFACT_REVOCATION_CONFLICT',
            `artifact ${record.artifact.artifactId}@${record.artifact.contentDigest} already has different revocation evidence`,
          );
        }
        return;
      }
      await transaction.runAsync(`
        INSERT INTO dh_v3_promoted_artifact_revocations (artifact_id, content_digest, revocation_json)
        VALUES (?, ?, ?)
      `, [record.artifact.artifactId, record.artifact.contentDigest, encoded]);
    });
  }

  async getRetention(
    referenceId: string,
  ): Promise<PromotedArtifactRetentionReference | undefined> {
    const row = await this.#database.getFirstAsync<RetentionRow>(`
      SELECT reference_json FROM dh_v3_promoted_artifact_retentions
      WHERE reference_id = ? AND live = 1
    `, [referenceId]);
    return row === null
      ? undefined
      : decodeJson<PromotedArtifactRetentionReference>(row.reference_json, 'promoted retention reference');
  }

  async listRetentions(
    identity: PromotedArtifactIdentity,
  ): Promise<readonly PromotedArtifactRetentionReference[]> {
    const rows = await this.#database.getAllAsync<RetentionRow>(`
      SELECT reference_json FROM dh_v3_promoted_artifact_retentions
      WHERE artifact_id = ? AND content_digest = ? AND live = 1
    `, [identity.artifactId, identity.contentDigest]);
    return rows
      .map((row) => decodeJson<PromotedArtifactRetentionReference>(row.reference_json, 'promoted retention reference'))
      .sort((left, right) => left.referenceId.localeCompare(right.referenceId));
  }

  async putRetention(reference: PromotedArtifactRetentionReference): Promise<void> {
    const encoded = canonicalText(reference as unknown as CanonicalJsonValue, 'promoted retention reference');
    await this.#writes.run(async (transaction) => {
      const tombstone = await transaction.getFirstAsync<RetentionRow>(`
        SELECT reference_json FROM dh_v3_promoted_artifact_retentions
        WHERE reference_id = ? AND live = 0
      `, [reference.referenceId]);
      if (tombstone !== null) {
        throw new PromotedArtifactContractError(
          'PROMOTED_ARTIFACT_RETENTION_REBIND',
          `released retention reference ${reference.referenceId} is tombstoned`,
        );
      }
      const current = await transaction.getFirstAsync<RetentionRow>(`
        SELECT reference_json FROM dh_v3_promoted_artifact_retentions
        WHERE reference_id = ? AND live = 1
      `, [reference.referenceId]);
      if (current !== null) {
        const currentReference = decodeJson<PromotedArtifactRetentionReference>(
          current.reference_json,
          'promoted retention reference',
        );
        if (sameRetention(currentReference, reference)) return;
        throw new PromotedArtifactContractError(
          'PROMOTED_ARTIFACT_RETENTION_REBIND',
          `retention reference ${reference.referenceId} cannot be rebound`,
        );
      }
      const referencedBody = await transaction.getFirstAsync<ExistenceRow>(`
        SELECT 1 AS present FROM dh_v3_promoted_artifact_bodies
        WHERE artifact_id = ? AND content_digest = ?
      `, [reference.artifact.artifactId, reference.artifact.contentDigest]);
      if (referencedBody === null) {
        throw new PromotedArtifactContractError(
          'PROMOTED_ARTIFACT_NOT_FOUND',
          `cannot retain missing artifact ${reference.artifact.artifactId}@${reference.artifact.contentDigest}`,
        );
      }
      await transaction.runAsync(`
        INSERT INTO dh_v3_promoted_artifact_retentions
          (reference_id, artifact_id, content_digest, live, reference_json)
        VALUES (?, ?, ?, 1, ?)
      `, [
        reference.referenceId,
        reference.artifact.artifactId,
        reference.artifact.contentDigest,
        encoded,
      ]);
    });
  }

  async releaseRetention(
    expected: PromotedArtifactRetentionReference,
  ): Promise<'released' | 'absent'> {
    return this.#writes.run(async (transaction) => {
      const current = await transaction.getFirstAsync<RetentionRow>(`
        SELECT reference_json FROM dh_v3_promoted_artifact_retentions
        WHERE reference_id = ? AND live = 1
      `, [expected.referenceId]);
      if (current === null) {
        const tombstone = await transaction.getFirstAsync<RetentionRow>(`
          SELECT reference_json FROM dh_v3_promoted_artifact_retentions
          WHERE reference_id = ? AND live = 0
        `, [expected.referenceId]);
        if (tombstone !== null) {
          const tombstoneReference = decodeJson<PromotedArtifactRetentionReference>(
            tombstone.reference_json,
            'promoted retention reference',
          );
          if (!sameRetention(tombstoneReference, expected)) {
            throw new PromotedArtifactContractError(
              'PROMOTED_ARTIFACT_STALE_RELEASE',
              `released retention reference ${expected.referenceId} does not match stale caller authority`,
            );
          }
        }
        return 'absent';
      }
      const currentReference = decodeJson<PromotedArtifactRetentionReference>(
        current.reference_json,
        'promoted retention reference',
      );
      if (!sameRetention(currentReference, expected)) {
        throw new PromotedArtifactContractError(
          'PROMOTED_ARTIFACT_STALE_RELEASE',
          `retention reference ${expected.referenceId} changed before release`,
        );
      }
      // Keep the row: a released reference is a permanent tombstone, never
      // deleted. T-022 review P3-2: the tombstone retains the originally
      // stored bytes (sameRetention already proved caller equivalence), not
      // the caller's reserialized text.
      await transaction.runAsync(`
        UPDATE dh_v3_promoted_artifact_retentions
        SET live = 0
        WHERE reference_id = ?
      `, [expected.referenceId]);
      return 'released';
    });
  }
}

/**
 * T-023 Expo SQLite adapter for the T-017 dynamic child pin store. The pin is
 * insert-once per logical invocation slot: identical replay is idempotent and a
 * different exact child definition is a conflict that never overwrites.
 */
export class ExpoSqliteDynamicChildPinStore implements DynamicChildPinStore {
  readonly #database: ExpoSqliteExecutorLike;
  readonly #writes: ExclusiveTransactionQueue;

  public constructor(database: ExpoSqliteExecutorLike, writes: ExclusiveTransactionQueue) {
    this.#database = database;
    this.#writes = writes;
  }

  async get(slotKey: string): Promise<DynamicChildExecutionPin | undefined> {
    const row = await this.#database.getFirstAsync<PinRow>(`
      SELECT pin_json FROM dh_v3_dynamic_child_pins WHERE slot_key = ?
    `, [slotKey]);
    return row === null
      ? undefined
      : decodeJson<DynamicChildExecutionPin>(row.pin_json, 'dynamic child execution pin');
  }

  async insertOnce(slotKey: string, pin: DynamicChildExecutionPin): Promise<InsertDynamicChildPinResult> {
    const encoded = canonicalText(pin as unknown as CanonicalJsonValue, 'dynamic child execution pin');
    return this.#writes.run(async (transaction) => {
      const existing = await transaction.getFirstAsync<PinRow>(`
        SELECT pin_json FROM dh_v3_dynamic_child_pins WHERE slot_key = ?
      `, [slotKey]);
      if (existing !== null) {
        const existingPin = decodeJson<DynamicChildExecutionPin>(
          existing.pin_json,
          'dynamic child execution pin',
        );
        return samePin(existingPin, pin) ? 'existing' : 'conflict';
      }
      await transaction.runAsync(`
        INSERT INTO dh_v3_dynamic_child_pins (slot_key, pin_json) VALUES (?, ?)
      `, [slotKey, encoded]);
      return 'inserted';
    });
  }
}
