import type { JsonObject, JsonValue } from './json.js';
import type { MessageDispositionSnapshot } from '../v2/contracts/message.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
import type {
  RuntimeFailure,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '../v2/contracts/workflow.js';

/**
 * Mutable workflow-local data that is durable with the owning control snapshot.
 * It is execution/process data only and MUST NOT be treated as authoritative
 * Business Store / external SoR state.
 */
export type DurableProcessData = JsonObject;

/** Logical view of process data at one committed instance revision. */
export interface DurableProcessDataSnapshot {
  readonly target: WorkflowAddress;
  readonly instanceStateRevision: number;
  readonly data: DurableProcessData;
}

export interface DomainCommandRejection {
  readonly code: string;
  readonly message: string;
  readonly details?: JsonObject;
}

interface CommandOutcomeBase {
  readonly messageId: string;
  readonly target: WorkflowAddress;
  readonly targetSequence: number;
  readonly packageId: string;
  readonly correlationId: string;
  readonly acceptedAt: string;
  readonly resolvedAt: string;
}

export interface AppliedCommandOutcome extends CommandOutcomeBase {
  readonly status: 'applied';
  readonly result?: JsonValue;
}

export interface RejectedCommandOutcome extends CommandOutcomeBase {
  readonly status: 'rejected';
  readonly rejection: DomainCommandRejection;
}

export interface FailedCommandOutcome extends CommandOutcomeBase {
  readonly status: 'failed';
  readonly failure: RuntimeFailure;
}

export interface AbandonedCommandOutcome extends CommandOutcomeBase {
  readonly status: 'abandoned';
  readonly reason?: JsonValue;
}

/**
 * First-class durable terminal result of one accepted command message.
 *
 * Progress before terminal resolution remains represented by the existing
 * durable MessageDisposition (`accepted` / `processing`). A `processed`
 * disposition resolves to either `applied` or normal domain `rejected`.
 */
export type CommandOutcomeSnapshot =
  | AppliedCommandOutcome
  | RejectedCommandOutcome
  | FailedCommandOutcome
  | AbandonedCommandOutcome;

export interface AppliedCommandResolution {
  readonly status: 'applied';
  readonly result?: JsonValue;
}

export interface RejectedCommandResolution {
  readonly status: 'rejected';
  readonly rejection: DomainCommandRejection;
}

export type ProcessedCommandResolution =
  | AppliedCommandResolution
  | RejectedCommandResolution;

/**
 * Atomic logical commit for a successfully processed durable command turn.
 *
 * A conforming host persists the existing source message disposition as
 * `processed`, the next instance/control state, process data and the command
 * outcome in the SAME RuntimeStore durability/ordering domain. This is a
 * logical extension seam, not a second store authority.
 */
export interface ProcessedCommandTurnCommit {
  readonly target: WorkflowAddress;
  readonly messageId: string;
  readonly expectedTargetSequence: number;
  readonly expectedStateRevision: number;
  readonly nextStateRevision: number;
  readonly nextState: JsonValue;
  readonly nextProcessData: DurableProcessData;
  readonly nextLifecycle: WorkflowInstanceSnapshot['lifecycle'];
  readonly outcome: AppliedCommandOutcome | RejectedCommandOutcome;
  readonly output?: JsonValue;
  readonly updatedAt: string;
}

export interface PrepareProcessedCommandTurnRequest {
  readonly target: WorkflowAddress;
  readonly messageId: string;
  readonly expectedTargetSequence: number;
  readonly expectedStateRevision: number;
  readonly nextState: JsonValue;
  readonly nextProcessData: DurableProcessData;
  readonly nextLifecycle: WorkflowInstanceSnapshot['lifecycle'];
  readonly resolution: ProcessedCommandResolution;
  readonly output?: JsonValue;
  readonly updatedAt: string;
}

export type PreparedProcessedCommandTurn =
  | {
      readonly kind: 'commit';
      readonly commit: ProcessedCommandTurnCommit;
    }
  | {
      readonly kind: 'already_committed';
      readonly outcome: AppliedCommandOutcome | RejectedCommandOutcome;
    };

/**
 * Narrow v0.3 extension seam for the existing RuntimeStore authority.
 * Implementations MUST use the same transaction manager/durability domain as
 * the RuntimeStore methods they extend.
 */
export interface RuntimeStoreProcessCommandExtension {
  getProcessData(target: WorkflowAddress): Promise<DurableProcessDataSnapshot | null>;
  getCommandOutcome(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<CommandOutcomeSnapshot | null>;
  commitProcessedCommandTurn(commit: ProcessedCommandTurnCommit): Promise<void>;
}

/** Existing durable authority plus the T-009 extension seam. */
export type ProcessCommandRuntimeStore = Pick<
  RuntimeStore,
  'getInstance' | 'getMessageDisposition'
> &
  RuntimeStoreProcessCommandExtension;

export type ProcessCommandContractErrorCode =
  | 'INVALID_PROCESS_DATA'
  | 'INVALID_COMMAND_RESOLUTION'
  | 'TARGET_MISMATCH'
  | 'TARGET_SEQUENCE_MISMATCH'
  | 'STATE_REVISION_MISMATCH'
  | 'COMMAND_TURN_NOT_PROCESSING'
  | 'COMMAND_OUTCOME_MISSING'
  | 'COMMAND_OUTCOME_CONFLICT'
  | 'COMMAND_OUTCOME_MISMATCH'
  | 'NORMAL_OUTCOME_CANNOT_REQUIRE_RECOVERY';

export class ProcessCommandContractError extends Error {
  readonly code: ProcessCommandContractErrorCode;

  constructor(code: ProcessCommandContractErrorCode, message: string) {
    super(message);
    this.name = 'ProcessCommandContractError';
    this.code = code;
  }
}

/** Store-side state supplied to the deterministic T-009 validator. */
export interface ProcessedCommandTurnCurrentState {
  readonly instance: WorkflowInstanceSnapshot;
  readonly disposition: MessageDispositionSnapshot;
  readonly existingOutcome: CommandOutcomeSnapshot | null;
}
