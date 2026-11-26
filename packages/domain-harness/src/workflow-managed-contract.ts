import type { StandardWorkflowOutcome } from './standard-workflow.js';
import type { StandardJsonValue } from './standard-files.js';
import type { EvidenceContext, EvidenceObservation, EvidenceRequirement, EvidenceResolution } from './standard-evidence.js';

type Outcome<T> = StandardWorkflowOutcome<T>;
type Maybe<T> = T | Promise<T>;

/** 统一根任务的有限资源合同。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowControlLimits {
  readonly maxWork: number; readonly maxActiveMs: number; readonly maxWallMs?: number;
  readonly maxSettlementMs: number; readonly maxNoProgress: number;
  readonly maxEvents: number; readonly maxActiveScopes: number;
  readonly model?: Readonly<{ maxCalls: number; maxRetries: number;
    maxOutputTokens: number; maxReservedTokens?: number }>;
}

/** 根任务的可信事实策略、取消与同步观察。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowControlOptions {
  readonly limits: WorkflowControlLimits; readonly signal?: AbortSignal;
  readonly knowledge: WorkflowKnowledgePolicy;
  readonly current: () => boolean;
  readonly observe?: (record: WorkflowObservation) => void;
  readonly evidence?: Readonly<{ required: boolean; emit: (record: WorkflowObservation) => Outcome<void> }>;
}

/** SDK 分配的作用域、定义、实例和执行尝试标识。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowOccurrence {
  readonly runId: string; readonly scopeId: string; readonly parentScopeId?: string;
  readonly definitionId: string; readonly instanceId: string;
  readonly attempt?: number;
}

/** 当前可信证据范围与单调事实版本。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowKnowledgeFrame {
  readonly epoch: number; readonly context: EvidenceContext;
}

/** 域提供事实读取与比较策略，SDK 只执行有限验证。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowKnowledgePolicy {
  readonly current: () => WorkflowKnowledgeFrame;
  readonly equal: (key: string, left: unknown, right: unknown) => boolean;
  readonly rank?: (observation: EvidenceObservation<string, unknown>) => number;
  readonly maxItems: number;
}

/** 受控根任务在真实本地操作结算后验证当前业务目标。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowCompletionPolicy<T> {
  readonly goal: string;
  readonly requiredKnowledge: readonly EvidenceRequirement<string>[];
  readonly terminalReads: number;
  readonly observe?: (value: T, scope: WorkflowTerminalContext) => Maybe<Outcome<readonly EvidenceObservation<string, unknown>[]>>;
  readonly validate: (value: T, context: WorkflowContextView) => Outcome<void>;
}

/** 当前作用域的有限语义投影；原生业务值不自动序列化。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowContextView {
  readonly runId: string; readonly scopeId: string; readonly goal: string; readonly stage: string;
  readonly factRevision: number; readonly planRevision?: number;
  readonly knowledge: EvidenceResolution<string, unknown> | undefined;
  readonly capabilities: readonly string[]; readonly constraints: readonly string[];
  readonly progress: readonly Readonly<{ instanceId: string; definitionId: string;
    state: 'pending' | 'running' | 'accepted' | 'rejected' | 'skipped' | 'stale' | 'unknown' | 'removed' }>[];
  readonly feedbackRevision: number;
  readonly remaining: Readonly<{ calls: number; steps: number; maxDescendantDepth: number;
    work: number; events: number; activeMs: number; wallMs?: number; localWork: number }>;
}

/** 已预留的只读终止观察窗口，不提供普通业务调用入口。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowTerminalContext {
  readonly signal: AbortSignal;
  read<T>(action: (signal: AbortSignal) => Maybe<Outcome<T>>): Promise<Outcome<T>>;
}

/** 模型使用量保留已观察、估计和未知的区别。
 * @dhKind type
 * @dhCapability workflow
 */
export interface ModelUsage {
  readonly input: number | null; readonly output: number | null; readonly total: number | null;
  readonly kind: 'observed' | 'estimated' | 'unavailable';
}

/** 运行时最小观察合同；候选结果不是最终裁定。
 * @dhKind type
 * @dhCapability workflow
 */
export type WorkflowObservation = Readonly<{
  runId: string; scopeId: string; parentScopeId?: string; seq: number;
  factRevision: number; planRevision?: number; stage: string;
}> & (
  | Readonly<{ kind: 'scope'; phase: 'open' | 'stopping' | 'candidate' | 'closed'; reason: string;
    localQuiescent: boolean; outcome?: Outcome<void>; candidateSeq?: number;
    delivery: 'pending' | 'satisfied' | 'failed' | 'not-required' }>
  | Readonly<{ kind: 'node'; occurrence: WorkflowOccurrence;
    phase: 'pre-reject' | 'enter' | 'skip' | 'actual' | 'candidate' | 'disposition' | 'invalidate';
    entered: boolean; acceptance: 'pending' | 'accepted' | 'rejected' | 'not-applicable' | 'stale';
    candidateSeq?: number; delivery: 'pending' | 'satisfied' | 'failed' | 'not-required';
    outcome?: Outcome<void>; post: 'pending' | 'passed' | 'failed' | 'unknown' | 'not-applicable';
    effect: 'none' | 'committed' | 'unknown' | 'not-applicable'; receiptId?: string;
    reason: string; sources: readonly Readonly<{ key: string; id: string; scope: string; revision: string; status: string }>[];
    detail: StandardJsonValue }>
  | Readonly<{ kind: 'region'; regionId: string; action: 'proposal-rejected' | 'edit' | 'feedback' | 'revalidate' | 'complete';
    beforeRevision: number; afterRevision: number; reason: string; detail: StandardJsonValue }>
  | Readonly<{ kind: 'actor'; definitionId: string; detail: StandardJsonValue }>
  | Readonly<{ kind: 'model'; decisionId: string; action: 'not-needed' | 'unavailable';
    reason: string; usage: ModelUsage; detail: StandardJsonValue }>
  | Readonly<{ kind: 'model'; requestId: string; attempt: number; action: 'selected' | 'retry' | 'fallback' | 'result';
    profileId: string; model: string; protocol: 'openai-chat' | 'anthropic-messages';
    reason: string; usage: ModelUsage; detail: StandardJsonValue }>
  | Readonly<{ kind: 'evidence'; delivery: 'failed'; required: boolean; reason: string }>
);
