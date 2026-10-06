import { type CommandOutcomeSnapshot, type DurableProcessData, type PrepareProcessedCommandTurnRequest, type PreparedProcessedCommandTurn, type ProcessedCommandResolution, type ProcessedCommandTurnCommit, type ProcessedCommandTurnCurrentState } from '../contracts/process-command.js';
import type { MessageDispositionSnapshot } from '../v2/contracts/message.js';
/** Validate and normalize mutable workflow-local process data. */
export declare function normalizeDurableProcessData(value: unknown): DurableProcessData;
/**
 * Deterministically maps durable mailbox disposition + processed resolution to
 * the first-class command outcome contract.
 */
export declare function deriveCommandOutcome(disposition: MessageDispositionSnapshot, processedResolution?: ProcessedCommandResolution): CommandOutcomeSnapshot | null;
/**
 * Fail closed if a durable command outcome disagrees with the authoritative
 * mailbox disposition/identity. Accepted/processing messages have no terminal
 * outcome; processed messages may only be applied/rejected.
 */
export declare function assertCommandOutcomeAlignment(disposition: MessageDispositionSnapshot, outcome: CommandOutcomeSnapshot | null): void;
/**
 * Frozen A9 structural guard (v0.6 T003).
 *
 * REVISION_OWNER=RUNTIME_CORE
 * NORMAL_TRANSITION_RULE=EXACT_N_TO_N_PLUS_1
 * STORE_ROLE=DEFENSIVE_CONTRACT_BOUNDARY_NOT_SEMANTIC_OWNER
 *
 * A conforming RuntimeStore MUST run this before any durable write of a
 * `ProcessedCommandTurnCommit`. It creates no second revision authority: it
 * only proves that the supplied persistence command conforms to the revision
 * Runtime/core already derived (expectedStateRevision -> expectedStateRevision
 * + 1). The store chooses no alternate next revision and adds no business
 * semantics.
 *
 * Failure semantics: stable, deterministic, externally diagnosable — always
 * `ProcessCommandContractError` with code `STATE_REVISION_MISMATCH`.
 */
export declare function assertProcessedCommandTurnRevisionProgression(commit: ProcessedCommandTurnCommit): void;
/**
 * Prepare one deterministic atomic processed-command write.
 *
 * Idempotent replay of an already-processed command returns the exact durable
 * outcome without advancing state again. A conflicting replay fails closed.
 */
export declare function prepareProcessedCommandTurn(state: ProcessedCommandTurnCurrentState, request: PrepareProcessedCommandTurnRequest): PreparedProcessedCommandTurn;
//# sourceMappingURL=process-command.d.ts.map