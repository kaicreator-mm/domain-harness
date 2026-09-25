import type { VolatileSemanticCacheRetentionPolicy } from '@kaicreator/domain-harness';
import { ExclusiveTransactionQueue } from './exclusive-transaction.js';
import { ExpoSqliteRuntimeEvidenceStore } from './expo-sqlite-evidence-store.js';
import {
  ExpoSqliteAdmissionEffectJournal,
  ExpoSqliteExactSemanticCacheStore,
  ExpoSqliteHarnessExecutionJournalStore,
} from './expo-sqlite-execution-stores.js';
import {
  ExpoSqliteAuthorityAuditStore,
  ExpoSqliteDomainActivationAuthority,
  ExpoSqliteExactPackageCdiAuthority,
  ExpoSqliteGovernanceBaselineStore,
} from './expo-sqlite-governance-stores.js';
import {
  ExpoSqliteDynamicChildPinStore,
  ExpoSqlitePromotedArtifactStore,
} from './expo-sqlite-promoted-stores.js';
import type {
  ExpoSqliteDatabaseLike,
  ExpoSqliteModuleLike,
} from './expo-sqlite-types.js';
import { migrateExpoRuntimeStore } from './migrations.js';

export interface OpenExpoSqliteAuthorityStoresOptions {
  readonly database?: ExpoSqliteDatabaseLike;
  readonly sqlite?: ExpoSqliteModuleLike;
  readonly databaseName?: string;
  /** T-013 host retention policy (same shape as the volatile reference). */
  readonly semanticCacheRetention?: VolatileSemanticCacheRetentionPolicy;
}

/**
 * The T-023 physical Expo SQLite form of every standalone v0.3 authority
 * store, sharing one database handle, ONE ExclusiveTransactionQueue (one
 * transaction manager / single writer gate) and the store file's append-only
 * migration chain. The runtime-store durability seams (T-009/T-010/T-014)
 * live on ExpoSqliteRuntimeStore itself; passing {@link writes} as its
 * constructor queue binds both halves to the same durability domain — the
 * intended single-file deployment, mirroring openNodeSqliteAuthorityStores.
 */
export interface ExpoSqliteAuthorityStores {
  readonly baselines: ExpoSqliteGovernanceBaselineStore;
  readonly activation: ExpoSqliteDomainActivationAuthority;
  readonly exactPackageCdi: ExpoSqliteExactPackageCdiAuthority;
  readonly promotedArtifacts: ExpoSqlitePromotedArtifactStore;
  readonly semanticCache: ExpoSqliteExactSemanticCacheStore;
  readonly dynamicChildPins: ExpoSqliteDynamicChildPinStore;
  readonly authorityAudit: ExpoSqliteAuthorityAuditStore;
  readonly evidence: ExpoSqliteRuntimeEvidenceStore;
  readonly harnessJournal: ExpoSqliteHarnessExecutionJournalStore;
  readonly admissionEffectJournal: ExpoSqliteAdmissionEffectJournal;
  /** The shared writer gate; inject into ExpoSqliteRuntimeStore's constructor. */
  readonly writes: ExclusiveTransactionQueue;
  close(): Promise<void>;
}

export async function openExpoSqliteAuthorityStores(
  options: OpenExpoSqliteAuthorityStoresOptions,
): Promise<ExpoSqliteAuthorityStores> {
  let database = options.database;
  let ownsDatabase = false;

  if (database === undefined) {
    if (options.sqlite === undefined || options.databaseName === undefined) {
      throw new TypeError('Provide either database or both sqlite and databaseName');
    }
    database = await options.sqlite.openDatabaseAsync(options.databaseName);
    ownsDatabase = true;
  }

  // Same pragma set as ExpoSqliteRuntimeStore.initialize(): one durability
  // posture per physical store file, regardless of which half opens first.
  const writes = new ExclusiveTransactionQueue(database);
  try {
    await database.execAsync(
      'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
    );
    await writes.run(async (transaction) => {
      await migrateExpoRuntimeStore(transaction);
    });
  } catch (error) {
    if (ownsDatabase) {
      await database.closeAsync?.();
    }
    throw error;
  }

  let closed = false;
  return {
    baselines: new ExpoSqliteGovernanceBaselineStore(database, writes),
    activation: new ExpoSqliteDomainActivationAuthority(database, writes),
    exactPackageCdi: new ExpoSqliteExactPackageCdiAuthority(database, writes),
    promotedArtifacts: new ExpoSqlitePromotedArtifactStore(database, writes),
    semanticCache: new ExpoSqliteExactSemanticCacheStore(
      database,
      writes,
      options.semanticCacheRetention ?? {},
    ),
    dynamicChildPins: new ExpoSqliteDynamicChildPinStore(database, writes),
    authorityAudit: new ExpoSqliteAuthorityAuditStore(database, writes),
    evidence: new ExpoSqliteRuntimeEvidenceStore(database, writes),
    harnessJournal: new ExpoSqliteHarnessExecutionJournalStore(database, writes),
    admissionEffectJournal: new ExpoSqliteAdmissionEffectJournal(database, writes),
    writes,
    async close() {
      if (closed) return;
      closed = true;
      await writes.idle();
      if (ownsDatabase) {
        await database.closeAsync?.();
      }
    },
  };
}
