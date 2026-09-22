import type { CandidateExactReference } from '../candidate/contracts.js';
import { type Sha256Port } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import type { GovernanceExecutionPin } from '../governance/execution-binding.js';
import { type HarnessExecutionIdentityContext, type HarnessExecutionJournalStore } from '../harness/execution-journal.js';
import { type CompiledPromotedChild, type DynamicChildExecutionPin, type DynamicChildInvocationSlot, type DynamicChildPinStore, type PromotedChildArtifactPort, type PromotedChildInvokingContext, type PromotedChildSelector, type PromotedChildTerminalResult, type ResolvedPromotedChild } from './contracts.js';
/** Narrow query-tool execution seam. Query tools are read-only; mutation is never bound here. */
export interface PromotedChildQueryExecutorPort {
    executeQuery(tool: CandidateExactReference, input: JsonValue): Promise<JsonValue>;
}
export interface PromotedChildExecutionSessionOptions {
    readonly durableControlTurnId: string;
    /** Parent integration's exact behaviorally relevant decision-contract digest. */
    readonly semanticContractDigest: string;
}
export interface RunPromotedChildOptions extends PromotedChildExecutionSessionOptions {
    readonly input: JsonValue;
    readonly journal: HarnessExecutionJournalStore;
    readonly executor: PromotedChildQueryExecutorPort;
    readonly signal?: AbortSignal;
}
/**
 * A pinned child execution. Sessions exist ONLY after the exact
 * DynamicChildExecutionPin is durably committed (fresh) or reloaded (recovery),
 * which structurally enforces pin-before-journaled-work (frozen L2 §14.1).
 */
export declare class PromotedChildExecutionSession {
    readonly pin: DynamicChildExecutionPin;
    readonly compiled: CompiledPromotedChild;
    private readonly sha256;
    constructor(pin: DynamicChildExecutionPin, compiled: CompiledPromotedChild, sha256: Sha256Port);
    /**
     * T-016 journaled-operation identity context. Every operation executed inside
     * this child carries the exact promoted artifact contentDigest, so committed
     * work from one artifact digest can never be consumed by another (§14.5).
     */
    operationIdentityContext(options: PromotedChildExecutionSessionOptions): HarnessExecutionIdentityContext;
    private resolveSource;
    /**
     * Execute the compiled step plan. Query steps run at most once per deterministic
     * operation slot through the T-016 journal. Effect intents are collected as
     * data only — durable effect admission/execution stays with the parent authority.
     */
    run(options: RunPromotedChildOptions): Promise<PromotedChildTerminalResult>;
}
export interface BeginFreshPromotedChildInput {
    readonly selector: PromotedChildSelector;
    readonly slot: DynamicChildInvocationSlot;
    readonly invoking: PromotedChildInvokingContext;
    readonly governancePin?: GovernanceExecutionPin;
    readonly pinnedAt: string;
}
export interface BeginFreshResolvedPromotedChildInput {
    /** The single pre-resolved selection object (frozen L2 §17.3: resolved once, reused here). */
    readonly resolved: ResolvedPromotedChild;
    readonly slot: DynamicChildInvocationSlot;
    readonly invoking: PromotedChildInvokingContext;
    readonly governancePin?: GovernanceExecutionPin;
    readonly pinnedAt: string;
}
export interface RecoverPromotedChildInput {
    readonly slot: DynamicChildInvocationSlot;
    readonly invoking: PromotedChildInvokingContext;
    readonly governancePin?: GovernanceExecutionPin;
}
export declare class PromotedChildRuntime {
    private readonly artifactPort;
    private readonly sha256;
    private readonly pins;
    constructor(artifactPort: PromotedChildArtifactPort, pinStore: DynamicChildPinStore, sha256: Sha256Port);
    /**
     * Fresh selection-to-execution boundary (frozen L2 §14.1):
     * resolve once → evaluate against invoking pinned context → commit pin →
     * compile (pure) → child becomes eligible for journaled work.
     */
    beginFreshExecution(input: BeginFreshPromotedChildInput): Promise<PromotedChildExecutionSession>;
    /**
     * Same fresh selection-to-execution boundary, but consuming an already
     * resolved selection object (T-018 resolver pre-read reuse). The runtime
     * never resolves a selector twice per decision invocation (frozen L2 §17.3).
     */
    beginFreshResolvedExecution(input: BeginFreshResolvedPromotedChildInput): Promise<PromotedChildExecutionSession>;
    /**
     * Exact pinned recovery (frozen L2 §14.4). There is deliberately NO selector
     * input: recovery never re-resolves an alias/version. The pin loads the exact
     * body by content digest, the body re-compiles deterministically, and a
     * revoked artifact stays resolvable only on this path.
     */
    recoverExecution(input: RecoverPromotedChildInput): Promise<PromotedChildExecutionSession>;
    releaseRetention(slot: DynamicChildInvocationSlot): Promise<void>;
}
/**
 * Standalone journaled-work gate for executors that do not hold a session:
 * no journaled work may exist for a promoted child whose pin was never committed.
 */
export declare function requireDynamicChildOperationGate(store: DynamicChildPinStore, slot: DynamicChildInvocationSlot): Promise<DynamicChildExecutionPin>;
//# sourceMappingURL=runtime.d.ts.map