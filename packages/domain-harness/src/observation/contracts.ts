import type { DomainIntelligencePackageIdentity } from '../contracts/domain-data.js';
import type { WorkflowLifecycle, WorkflowAddress, WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
import type { DomainMessage, MessageAcceptedAck } from '../v2/contracts/message.js';
import type {
  CommitProcessedMessageRequest,
  FailMessageProcessingRequest,
  RuntimeStore,
  TerminalizeInstanceRequest,
} from '../v2/contracts/store.js';
import type { CompiledPackageManifest } from '../v2/contracts/package.js';

/**
 * Issue #312 / #301 (reviewed Product/L2 chain): durable ordered public
 * Runtime Observation Stream.
 *
 * Authority invariants (mandatory, frozen by the reviewed contract):
 *
 * ```text
 * RuntimeObservationRecord != DomainTruth
 * RuntimeObservationRecord != HarnessExecutionJournalRecord
 * RuntimeObservationRecord != RuntimeEvidenceRecord
 * RuntimeObservationStream != Runtime transition authority
 * Observer notification != durable observation record
 * Timestamp != ordering authority
 * ```
 *
 * The stream is read-only evidence for external consumers. It confers no
 * transition, promotion, selection, binding or activation authority, and it
 * never exposes private engine state or microsteps.
 */

/** Exact contract identity of this observation surface (capability negotiation). */
export const RUNTIME_OBSERVATION_CONTRACT_VERSION = 'runtime-observation/1' as const;

/**
 * Public semantic Runtime commit families observed by this contract.
 *
 * `EFFECT_SETTLED` is deliberately NOT part of contract v1: the reviewed
 * rereview (P2) allows omitting it when narrow atomic source-effect
 * association cannot be proven without widening the concern. The
 * `effectRef` envelope field is reserved for a future family and is never
 * populated by contract v1 emitters.
 */
export const RUNTIME_OBSERVATION_EVENT_FAMILIES = [
  'INSTANCE_OPENED',
  'MESSAGE_ACCEPTED',
  'TURN_COMMITTED',
  'TURN_RECOVERY_REQUIRED',
  'RECOVERY_COMMITTED',
  'INSTANCE_TERMINALIZED',
] as const;

export type RuntimeObservationEventFamily = (typeof RUNTIME_OBSERVATION_EVENT_FAMILIES)[number];

/**
 * Exact identity of one observation stream.
 *
 * Binds one WorkflowAddress, one exact immutable package identity (the
 * existing `DomainIntelligencePackageIdentity` shape/semantics — mutable
 * package/domain labels alone are never identity), and one stream epoch.
 *
 * `runtimeBindingRef`/`runtimeActivationRef` are opaque DAC/A2-owned
 * provenance carried verbatim when the host already holds them; this contract
 * never mints or interprets their lifecycle meanings.
 */
export interface RuntimeObservationStreamRef {
  readonly target: WorkflowAddress;
  readonly package: DomainIntelligencePackageIdentity;
  readonly epochId: string;
  readonly runtimeBindingRef?: string;
  readonly runtimeActivationRef?: string;
}

/** Reference to a journaled effect. Reserved for `EFFECT_SETTLED`; never emitted in contract v1. */
export interface RuntimeObservationEffectRef {
  readonly effectId: string;
}

/**
 * One durable public Runtime commit fact, in per-stream contiguous sequence.
 *
 * The envelope is stable and redacted by construction: it carries identities,
 * revisions and refs only — never raw message/state/tool payload bytes.
 * `observedAt` is informational; ordering authority is `sequence` alone.
 */
export interface RuntimeObservationRecord {
  readonly stream: RuntimeObservationStreamRef;
  /** Positive safe integer; contiguous per stream/epoch: seq(n+1) = seq(n) + 1. */
  readonly sequence: number;
  /** Deterministic unique observation identity (derived from exact stream identity + sequence). */
  readonly observationId: string;
  readonly kind: RuntimeObservationEventFamily;
  readonly observedAt: string;
  readonly stateRevisionBefore?: number;
  readonly stateRevisionAfter?: number;
  readonly sourceMessageId?: string;
  readonly targetSequence?: number;
  readonly lifecycleBefore?: WorkflowLifecycle;
  readonly lifecycleAfter?: WorkflowLifecycle;
  /** Reserved for `EFFECT_SETTLED`; never populated by contract v1 emitters. */
  readonly effectRef?: RuntimeObservationEffectRef;
}

/**
 * Opaque durable continuation token. Encodes the exact stream identity and an
 * exclusive-after sequence; a cursor from one stream/epoch never reads
 * another (substitution fails closed with an explicit `CURSOR_INVALID` gap).
 */
export type RuntimeObservationCursor = string;

export type RuntimeObservationGapKind =
  | 'RETENTION_TRUNCATED'
  | 'STORAGE_GAP'
  | 'CURSOR_INVALID';

/**
 * Explicit structured gap. When present, the reader MUST NOT claim an exact
 * continuous trace across it; absence of records never means "no activity".
 */
export interface RuntimeObservationGap {
  readonly kind: RuntimeObservationGapKind;
  /** Exclusive-after sequence the request resumed from (0 when no cursor was given). */
  readonly requestedAfter: number;
  /** Earliest retained sequence when known (RETENTION_TRUNCATED). */
  readonly earliestAvailable?: number;
  /** Highest committed sequence for the exact stream. */
  readonly highWatermark: number;
}

export interface RuntimeObservationReadRequest {
  readonly stream: RuntimeObservationStreamRef;
  readonly afterCursor?: RuntimeObservationCursor;
  /** Clamped to [1, 1000]; default 100. */
  readonly limit?: number;
}

export interface RuntimeObservationPage {
  /** Deterministic ascending sequence, exclusive-after the cursor, contiguous. */
  readonly records: readonly RuntimeObservationRecord[];
  /** Present iff at least one record was returned; resume exactly-after the last record. */
  readonly nextCursor?: RuntimeObservationCursor;
  /** Highest committed sequence for the exact stream (0 when nothing is committed). */
  readonly highWatermark: number;
  readonly gap?: RuntimeObservationGap;
}

/**
 * What a covered Runtime mutation asks the durable adapter to observe
 * atomically with that mutation. Everything else on the record (sequence,
 * epoch binding, revisions, lifecycles, target sequence) is derived by the
 * adapter inside the same durable transaction from the exact rows being
 * committed — never from a second best-effort write.
 */
export interface RuntimeObservationIntent {
  readonly kind: RuntimeObservationEventFamily;
  readonly packageIdentity: DomainIntelligencePackageIdentity;
  /** Informational timestamp for the commit being observed. */
  readonly observedAt: string;
  readonly runtimeBindingRef?: string;
  readonly runtimeActivationRef?: string;
}

export type RuntimeObservationErrorCode =
  | 'OBSERVATION_STORE_REQUIRED'
  | 'STREAM_IDENTITY_MISMATCH'
  | 'SEQUENCE_NOT_CONTIGUOUS'
  | 'INVALID_READ_LIMIT'
  | 'CURSOR_MALFORMED'
  | 'OBSERVATION_APPEND_FAILED';

export class RuntimeObservationError extends Error {
  readonly code: RuntimeObservationErrorCode;

  constructor(code: RuntimeObservationErrorCode, message: string) {
    super(message);
    this.name = 'RuntimeObservationError';
    this.code = code;
  }
}

/**
 * Narrow RuntimeStore extension implemented by observation-capable durable
 * adapters (issue #312 atomicity rule).
 *
 * Each `*WithObservation` method performs the covered Runtime mutation AND
 * appends its observation record(s) in ONE host transaction (or derives the
 * observation deterministically from that exact authoritative commit under
 * the same durability boundary). If the observation side cannot persist, the
 * whole call fails and the mutation MUST NOT remain committed — an enabled
 * adapter can never commit a covered mutation while silently losing its
 * required observation.
 *
 * Idempotent mutation replays (duplicate message acceptance, same-lifecycle
 * terminalization replays) commit no new observation: the durable fact was
 * already recorded exactly once.
 *
 * Not covered by contract v1 (explicit limitations, never silent): durable
 * process-command turn commits (`commitProcessedCommandTurn` on the separate
 * `RuntimeStoreProcessCommandExtension` seam) and effect journal operations
 * (`EFFECT_SETTLED` is omitted by reviewed decision).
 */
export interface RuntimeObservationStore extends RuntimeStore {
  createInstanceWithObservation(
    snapshot: WorkflowInstanceSnapshot,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<readonly RuntimeObservationRecord[]>;

  acceptMessageWithObservation(
    message: DomainMessage,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<{ readonly ack: MessageAcceptedAck; readonly records: readonly RuntimeObservationRecord[] }>;

  commitProcessedMessageWithObservation(
    request: CommitProcessedMessageRequest,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<readonly RuntimeObservationRecord[]>;

  failMessageProcessingWithObservation(
    request: FailMessageProcessingRequest,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<readonly RuntimeObservationRecord[]>;

  resetRecoveryWithObservation(
    target: WorkflowAddress,
    updatedAt: string,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<{ readonly instance: WorkflowInstanceSnapshot; readonly records: readonly RuntimeObservationRecord[] }>;

  terminalizeInstanceWithObservation(
    request: TerminalizeInstanceRequest,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<readonly RuntimeObservationRecord[]>;

  /** Durable fidelity read. Pull/cursor is the authority; see page/gap semantics. */
  readObservations(request: RuntimeObservationReadRequest): Promise<RuntimeObservationPage>;
}

/**
 * Explicit runtime observation capability (reviewed repair R2).
 *
 * `UNSUPPORTED`: deployments that do not opt in keep the existing Runtime
 * semantics; absence of records MUST NOT be read as "no Runtime activity".
 * `ENABLED`: the durable pull/cursor read is the fidelity authority; the
 * optional `watch` is a coalescible wake-up hint only and never substitutes
 * for the durable read.
 */
export type RuntimeObservationCapability =
  | { readonly status: 'UNSUPPORTED' }
  | {
      readonly status: 'ENABLED';
      readonly contractVersion: typeof RUNTIME_OBSERVATION_CONTRACT_VERSION;
      readonly eventFamilies: readonly RuntimeObservationEventFamily[];
      readObservations(request: RuntimeObservationReadRequest): Promise<RuntimeObservationPage>;
      /** Wake-up only: may coalesce, may miss; consumers must re-read the durable sequence. */
      watch?(stream: RuntimeObservationStreamRef, onWake: () => void): () => void;
    };

/** Structural capability check: does this store implement the observation seam? */
export function isRuntimeObservationStore(store: unknown): store is RuntimeObservationStore {
  if (store === null || typeof store !== 'object') return false;
  const candidate = store as Record<string, unknown>;
  return (
    typeof candidate.createInstanceWithObservation === 'function' &&
    typeof candidate.acceptMessageWithObservation === 'function' &&
    typeof candidate.commitProcessedMessageWithObservation === 'function' &&
    typeof candidate.failMessageProcessingWithObservation === 'function' &&
    typeof candidate.resetRecoveryWithObservation === 'function' &&
    typeof candidate.terminalizeInstanceWithObservation === 'function' &&
    typeof candidate.readObservations === 'function'
  );
}

/**
 * Default exact package identity for a runtime-compiled package, using the
 * `DomainIntelligencePackageIdentity` shape required by the reviewed
 * contract.
 *
 * `contentDigest` maps to the compiled `packageId`: in this runtime the
 * packageId IS the content-derived digest of the canonical compiled manifest
 * (activation re-verifies it and fails closed on `PACKAGE_ID_MISMATCH`),
 * and registry pins are exact — so the pair (packageId, contentDigest) is
 * the immutable content identity the Runtime itself pins instances to.
 * Hosts that own a richer identity (e.g. a DAC-promoted CDI package digest)
 * can override this mapping when enabling the capability.
 */
export function runtimePackageIdentityFromManifest(
  manifest: CompiledPackageManifest,
): DomainIntelligencePackageIdentity {
  return {
    domainId: manifest.domainId,
    version: manifest.domainVersion,
    packageId: manifest.packageId,
    contentDigest: manifest.packageId,
    formatVersion: manifest.formatVersion,
    runtimeContractMajor: manifest.runtimeContractMajor,
    executionEngineMajor: manifest.executionEngineMajor,
    requiredCapabilities: [...manifest.requiredCapabilities],
  };
}
