import { type CommandOutcomeSnapshot, type DurableProcessData, type PrepareProcessedCommandTurnRequest, type PreparedProcessedCommandTurn, type ProcessedCommandResolution, type ProcessedCommandTurnCurrentState } from '../contracts/process-command.js';
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
 * Prepare one deterministic atomic processed-command write.
 *
 * Idempotent replay of an already-processed command returns the exact durable
 * outcome without advancing state again. A conflicting replay fails closed.
 */
export declare function prepareProcessedCommandTurn(state: ProcessedCommandTurnCurrentState, request: PrepareProcessedCommandTurnRequest): PreparedProcessedCommandTurn;
//# sourceMappingURL=process-command.d.ts.map