import Database from 'better-sqlite3';
import type { VolatileSemanticCacheRetentionPolicy } from '@kaicreator/domain-harness';
import { applyNodeSqliteMigrations } from './migrations.js';
import { NodeSqliteRuntimeEvidenceStore } from './node-sqlite-evidence-store.js';
import {
  NodeSqliteAuthorityAuditStore,
  NodeSqliteDomainActivationAuthority,
  NodeSqliteExactPackageCdiAuthority,
  NodeSqliteGovernanceBaselineStore,
} from './node-sqlite-governance-stores.js';
import {
  NodeSqliteDynamicChildPinStore,
  NodeSqlitePromotedArtifactStore,
} from './node-sqlite-promoted-stores.js';
import {
  NodeSqliteAdmissionEffectJournal,
  NodeSqliteExactSemanticCacheStore,
  NodeSqliteHarnessExecutionJournalStore,
} from './node-sqlite-execution-stores.js';

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

export interface NodeSqliteAuthorityStoresOptions {
  readonly path: string;
  readonly busyTimeoutMs?: number;
  /** T-013 host retention policy (same shape as the volatile reference). */
  readonly semanticCacheRetention?: VolatileSemanticCacheRetentionPolicy;
}

/**
 * The T-022 physical Node SQLite form of every standalone v0.3 authority
 * store, sharing one database handle (one transaction manager, WAL +
 * synchronous=FULL) and the store file's append-only migration chain. The
 * runtime-store durability seams (T-009/T-010/T-014) live on
 * NodeSqliteRuntimeStore itself; opening both against the same path is the
 * intended single-file deployment.
 */
export interface NodeSqliteAuthorityStores {
  readonly baselines: NodeSqliteGovernanceBaselineStore;
  readonly activation: NodeSqliteDomainActivationAuthority;
  readonly exactPackageCdi: NodeSqliteExactPackageCdiAuthority;
  readonly promotedArtifacts: NodeSqlitePromotedArtifactStore;
  readonly semanticCache: NodeSqliteExactSemanticCacheStore;
  readonly dynamicChildPins: NodeSqliteDynamicChildPinStore;
  readonly authorityAudit: NodeSqliteAuthorityAuditStore;
  readonly evidence: NodeSqliteRuntimeEvidenceStore;
  readonly harnessJournal: NodeSqliteHarnessExecutionJournalStore;
  readonly admissionEffectJournal: NodeSqliteAdmissionEffectJournal;
  close(): void;
}

export function openNodeSqliteAuthorityStores(
  options: NodeSqliteAuthorityStoresOptions,
): NodeSqliteAuthorityStores {
  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0) {
    throw new RangeError('busyTimeoutMs must be a non-negative safe integer');
  }

  const db = new Database(options.path);
  db.pragma(`busy_timeout = ${busyTimeoutMs}`);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  applyNodeSqliteMigrations(db);

  return {
    baselines: new NodeSqliteGovernanceBaselineStore(db),
    activation: new NodeSqliteDomainActivationAuthority(db),
    exactPackageCdi: new NodeSqliteExactPackageCdiAuthority(db),
    promotedArtifacts: new NodeSqlitePromotedArtifactStore(db),
    semanticCache: new NodeSqliteExactSemanticCacheStore(
      db,
      options.semanticCacheRetention ?? {},
    ),
    dynamicChildPins: new NodeSqliteDynamicChildPinStore(db),
    authorityAudit: new NodeSqliteAuthorityAuditStore(db),
    evidence: new NodeSqliteRuntimeEvidenceStore(db),
    harnessJournal: new NodeSqliteHarnessExecutionJournalStore(db),
    admissionEffectJournal: new NodeSqliteAdmissionEffectJournal(db),
    close() {
      db.close();
    },
  };
}
