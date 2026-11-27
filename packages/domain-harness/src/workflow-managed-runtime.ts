import { types } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { DetachedRegionProof } from './workflow-slots.js';
import { resolveEvidence } from './standard-evidence.js';
import type { EvidenceObservation, EvidenceRequirement, EvidenceResolution } from './standard-evidence.js';
import type { StandardWorkflowOutcome } from './standard-workflow.js';
import type {
  WorkflowControlOptions, WorkflowCompletionPolicy, WorkflowContextView,
  WorkflowKnowledgeFrame, WorkflowObservation, WorkflowTerminalContext, WorkflowKnowledgePolicy, WorkflowNodeOptions,
} from './workflow-managed-contract.js';
import {
  EVENT_SCAN_WORK, frameScanWork, knowledgeScanWork, WorkflowClock,
} from './workflow-resource-control.js';
import type { ResourceCharge, ResourceTicket, WorkflowResourceLedger, LocalWorkQuota } from './workflow-resource-control.js';

type Outcome<T> = StandardWorkflowOutcome<T>;
type Frame = WorkflowKnowledgeFrame;
type ScopeRecord = Extract<WorkflowObservation, { kind: 'scope' }>;
type Delivery = ScopeRecord['delivery'];
const ok = <T>(value: T): Outcome<T> => ({ status: 'COMPLETE', value });
export function managedFailure<T>(code: string): Outcome<T> {
  return { status: 'FAILED', reason: { code, message: 'Managed workflow did not complete' } };
}
const unknown = <T>(code: string): Outcome<T> => ({
  status: 'UNKNOWN', reason: { code, message: 'Managed workflow result not accepted' },
});
export const valid = (n: number, max = 2 ** 31 - 1) => Number.isSafeInteger(n) && n >= 0 && n <= max;
export const boundedText = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 1024;
const array = (value: unknown): boolean => Array.isArray(value);
export const dense = (xs: readonly unknown[]) => {
  for (let i = 0; i < xs.length; i++) if (!Object.hasOwn(xs, i)) return false;
  return true;
};
function sync(value: unknown): boolean {
  if (!types.isPromise(value)) return true;
  void Promise.prototype.then.call(value, undefined, () => undefined);
  return false;
}
export function isManagedOutcome(value: unknown): value is Outcome<unknown> {
  return typeof value === 'object' && value !== null && 'status' in value
    && (value.status === 'COMPLETE' ? Object.hasOwn(value, 'value')
      : ['REJECT', 'ASK', 'WAIT', 'UNKNOWN', 'FAILED'].includes(String(value.status))
      && 'reason' in value && typeof value.reason === 'object' && value.reason !== null
      && 'code' in value.reason && typeof value.reason.code === 'string'
      && 'message' in value.reason && typeof value.reason.message === 'string');
}
/** 复制结果外壳；原生业务值仍由可信域负责不可变性，不递归复制。 */
export function snapshotOutcome<T>(value: Outcome<T>): Outcome<T> {
  if (!isManagedOutcome(value)) return managedFailure('WORKFLOW_INVALID_OUTCOME');
  if (value.status === 'COMPLETE') return Object.freeze({ status: 'COMPLETE', value: value.value });
  return Object.freeze({ status: value.status, reason: Object.freeze({ code: value.reason.code, message: value.reason.message }) });
}
export function redact(value: Outcome<unknown>): Outcome<void> {
  if (value.status === 'COMPLETE') return Object.freeze(ok(undefined));
  // 不将业务值、错误文本或凭据放入公开观察。
  return Object.freeze({ status: value.status, reason: Object.freeze({
    code: 'WORKFLOW_NON_SUCCESS', message: 'Workflow result not accepted',
  }) });
}

/** 接纳时固定的前序义务校验，随当前节点作用域向下继承。
 * work 是一次 frame capture 额外检查的有限上界，不再单独扣账。
 */
export interface PredecessorFence {
  readonly work: number;
  readonly check: (frame: WorkflowKnowledgeFrame) => boolean;
}

export interface ManagedScope {
  readonly id: string;
  readonly parentId?: string;
  readonly owner: object;
  readonly ticket: ResourceTicket;
  delivery: Delivery;
  diagnostic: boolean;
  readonly parent?: ManagedScope;
  readonly local?: LocalWorkQuota;
  readonly actor?: { remaining: number; frame?: ScopeFrames };
  readonly policy?: LocalFramePolicy;
  readonly predecessorFence?: PredecessorFence;
  bound?: ScopeFrames;
  resolved?: EvidenceResolution<string, unknown>;
  finalCurrent?: (frame: Frame) => boolean;
  feedbackCount?: number;
  unsafeReplay?: boolean;
  prepaidChildWork?: number;
}

export interface LocalFramePolicy {
  readonly knowledge: WorkflowKnowledgePolicy;
  readonly current: () => boolean;
  last?: Frame;
}
export interface ScopeFrames {
  readonly root: Frame;
  readonly locals: readonly Readonly<{ policy: LocalFramePolicy; frame: Frame }>[];
}


export function snapshotControl(control: WorkflowControlOptions): WorkflowControlOptions {
  const limits = control.limits;
  return Object.freeze({ ...control, limits: Object.freeze({ ...limits,
    ...(limits.model === undefined ? {} : { model: Object.freeze({ ...limits.model }) }),
  }), knowledge: Object.freeze({ ...control.knowledge }),
  ...(control.evidence === undefined ? {} : { evidence: Object.freeze({ ...control.evidence }) }) });
}

/** 根账本、时钟和输出归属同一个 Session；内部机制不从 SDK 根导出。 */
export class ManagedRuntime {
  readonly runId = randomUUID();
  readonly clock: WorkflowClock;
  readonly #final: WorkflowObservation[] = [];
  #seq = 0;
  readonly #nodeFinal = new Map<string, Extract<WorkflowObservation, { kind: 'node' }>>();
  readonly #progress = new Map<string, Map<string, WorkflowContextView['progress'][number]>>();

  public sequence(): number { return ++this.#seq; }

  /** 每个实际节点至少预留四个累计事件；独立于记录扫描额度预付进度复制。
   * 同一根可能并发接纳新节点，按根声明的最大事件数计算上界而非接纳时当前长度。
   */
  public get progressScanCost(): number { return Math.floor(this.control.limits.maxEvents / 4); }

  /** 仅供已预留的固定节点两次、根完成一次投影；每项已是冻结元数据。 */
  public progress(scopeId: string): WorkflowContextView['progress'] {
    const progress = this.#progress.get(scopeId);
    if (progress && progress.size > this.progressScanCost) throw new RangeError('WORKFLOW_PROGRESS_LIMIT');
    return Object.freeze([...(progress?.values() ?? [])]);
  }

  public noteNode(record: Extract<WorkflowObservation, { kind: 'node' }>, scope?: ManagedScope): void {
    const { instanceId, definitionId } = record.occurrence;
    const state = record.phase === 'enter' ? 'running' : record.acceptance === 'accepted' ? 'accepted'
      : record.effect === 'unknown' ? 'unknown' : record.acceptance === 'stale' ? 'stale' : 'rejected';
    const parent = record.parentScopeId ?? record.scopeId;
    let progress = this.#progress.get(parent);
    if (!progress) { progress = new Map(); this.#progress.set(parent, progress); }
    progress.set(instanceId, Object.freeze({ instanceId, definitionId, state }));
    if (record.phase === 'disposition') {
      this.#final.push(record); this.#nodeFinal.set(instanceId, record);
      // 子区域的所有实际后代（含域直接调用的受控节点）都参与保守重执行资格。
      if (record.entered && (record.effect !== 'none' || record.acceptance !== 'accepted')) {
        for (let s = scope; s !== undefined; s = s.parent) if (s.feedbackCount !== undefined) s.unsafeReplay = true;
      }
    }
  }
  public nodeDisposition(instanceId: string) { return this.#nodeFinal.get(instanceId); }
  public localRemaining(scope: ManagedScope): number {
    return scope.local === undefined ? this.ledger.remaining().work : this.ledger.localRemaining(scope.local);
  }
  public get criticalFailed(): boolean { return this.#criticalFailed; }

  #activeLeaves = 0;
  #waitingLeaves = 0;

  /** 只接收已拥有操作的叶子状态变化；时钟需要是否存在，不新增额度维度。 */
  public activity(activeDelta: number, waitingDelta: number): void {
    this.#activeLeaves += activeDelta;
    this.#waitingLeaves += waitingDelta;
    this.clock.activity(Number(this.#activeLeaves > 0), Number(this.#waitingLeaves > 0));
  }

  #callback = false;
  #criticalFailed = false;
  #last: Frame | undefined;

  constructor(readonly control: WorkflowControlOptions, readonly ledger: WorkflowResourceLedger) {
    const l = control.limits;
    if (!valid(l.maxNoProgress) || !valid(control.knowledge.maxItems, 4096)
      || typeof control.current !== 'function' || typeof control.knowledge.current !== 'function'
      || typeof control.knowledge.equal !== 'function'
      || (control.knowledge.rank !== undefined && typeof control.knowledge.rank !== 'function')
      || (control.observe !== undefined && typeof control.observe !== 'function')
      || (control.evidence !== undefined && (typeof control.evidence.emit !== 'function'
        || typeof control.evidence.required !== 'boolean'))) throw new RangeError('Invalid managed workflow options');
    this.clock = new WorkflowClock(l.maxActiveMs, l.maxWallMs, l.maxSettlementMs, control.signal);
  }

  public get signal() { return this.clock.signal; }
  public get frameCost() { return frameScanWork(this.control.knowledge.maxItems); }
  public available(): boolean { return !this.#callback && !this.#criticalFailed && this.clock.check(); }
  public dispositions(): readonly WorkflowObservation[] { return Object.freeze([...this.#final]); }

  public guarded<T>(callback: () => T): T;
  public guarded<T, R>(callback: () => T, project: (value: T) => R): R;
  public guarded<T, R>(callback: () => T, project?: (value: T) => R): T | R {
    if (this.#callback || types.isAsyncFunction(callback)) throw new Error('WORKFLOW_REENTRANT');
    this.#callback = true;
    try {
      const value = callback();
      // 在读取投影字段或转换 JSON 前观察意外 Promise，仍保持重入围栏。
      if (!sync(value)) throw new Error('WORKFLOW_ASYNC_POLICY');
      return project === undefined ? value : project(value);
    } finally { this.#callback = false; }
  }

  /** 只在已预留的 frame ticket 内读取可信策略，不序列化领域值。 */
  private capture(knowledge: WorkflowKnowledgePolicy, current: () => boolean, last?: Frame): Frame | undefined {
    if (!this.available()) return undefined;
    try {
      if (types.isAsyncFunction(current) || types.isAsyncFunction(knowledge.current)) return undefined;
      if (this.guarded(current) !== true) return undefined;
      const actual = this.guarded(knowledge.current);
      const context = actual.context;
      if (!valid(actual.epoch, Number.MAX_SAFE_INTEGER) || !boundedText(context.scope)
        || context.revisions.size > knowledge.maxItems
        || (context.asOf !== undefined && !Number.isFinite(context.asOf))) return undefined;
      const revisions = new Map<string, string>();
      let visited = 0;
      for (const [key, revision] of context.revisions) {
        if (++visited > knowledge.maxItems || revisions.has(key) || !boundedText(key) || !boundedText(revision)) return undefined;
        revisions.set(key, revision);
      }
      if (revisions.size !== context.revisions.size) return undefined;
      const frame: Frame = { epoch: actual.epoch, context: { scope: context.scope, revisions,
        ...(context.asOf === undefined ? {} : { asOf: context.asOf }),
      } };
      if (last && (frame.epoch < last.epoch || frame.context.scope !== last.context.scope
        || (frame.epoch === last.epoch && !this.same(last, frame)))) return undefined;
      return this.available() ? frame : undefined;
    } catch { return undefined; }
  }

  public frame(): Frame | undefined {
    const frame = this.capture(this.control.knowledge, this.control.current, this.#last);
    if (frame !== undefined) this.#last = frame;
    return frame;
  }

  private policies(scope?: ManagedScope): LocalFramePolicy[] {
    const result: LocalFramePolicy[] = [];
    for (let s = scope; s !== undefined; s = s.parent) if (s.policy !== undefined) result.push(s.policy);
    return result.reverse();
  }

  public frameChainCost(scope?: ManagedScope): number {
    let cost=this.frameCost;
    for(let owner=scope;owner!==undefined;owner=owner.parent){
      if(owner.policy)cost+=frameScanWork(owner.policy.knowledge.maxItems);
      cost+=owner.predecessorFence?.work??0;
    }
    return cost;
  }

  public frames(scope: ManagedScope): ScopeFrames | undefined {
    const root = this.frame();
    if (!root) return undefined;
    const locals: { policy: LocalFramePolicy; frame: Frame }[] = [];
    for (const policy of this.policies(scope)) {
      const frame = this.capture(policy.knowledge, policy.current, policy.last);
      if (!frame) return undefined;
      policy.last = frame;
      locals.push({ policy, frame });
    }
    const captured = { root, locals };
    // 祖先绑定在接纳时已验证其更早祖先；逐层检查自身绑定与最深的根绑定，避免重复扫描所有前缀。
    let rootChecked = false;
    let index = locals.length - 1;
    for (let owner: ManagedScope | undefined = scope; owner !== undefined; owner = owner.parent) {
      const bound = owner.bound;
      if (bound && !rootChecked) {
        if (!this.same(bound.root, root)) return undefined;
        rootChecked = true;
      }
      if (owner.policy === undefined) continue;
      const current = locals[index--];
      if (!current || current.policy !== owner.policy) return undefined;
      if (owner.predecessorFence && !owner.predecessorFence.check(current.frame)) return undefined;
      if (!bound) continue;
      const own = bound.locals.at(-1);
      if (!own || own.policy !== current.policy || !this.same(own.frame, current.frame)
        || !this.evidenceCurrent(current.frame, owner.resolved)) return undefined;
    }
    return captured;
  }

  public checkFrames(scope: ManagedScope, captured: ScopeFrames,
    resolution?: EvidenceResolution<string, unknown>,
    validate?: (frame: Frame) => boolean): boolean {
    const now = this.frames(scope);
    if (!now || !this.same(captured.root, now.root) || now.locals.length !== captured.locals.length) return false;
    if (!captured.locals.every((x, i) => x.policy === now.locals[i]?.policy && this.same(x.frame, now.locals[i].frame))) return false;
    const frame = now.locals.at(-1)?.frame ?? now.root;
    return this.evidenceCurrent(frame, resolution) && (validate?.(frame) ?? true);
  }

  /** 已知私有子域证明的有限扫描计划，不调用可信策略。 */
  public detachedPlan(proofs: readonly DetachedRegionProof[]): Readonly<{ work: number; check: () => boolean }> | undefined {
    if (!this.available() || proofs.length > 256) return undefined;
    if (proofs.length === 0) return Object.freeze({ work: 0, check: () => true });
    const seen = new Set<DetachedRegionProof>(), pending = [...proofs];
    let work = 1, links = 0;
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i]!;
      if (seen.has(p)) continue;
      if (seen.size >= 256 || p.children.length > 256 || !valid(p.knowledge.maxItems, 4096)
        || (links += p.sources.length + p.children.length) > 16384) return undefined;
      seen.add(p);
      work += frameScanWork(p.knowledge.maxItems) + 4 * (p.sources.length + p.children.length);
      for (const child of p.children) if (!seen.has(child)) pending.push(child);
    }
    return Object.freeze({ work, check: () => {
      for (const p of seen) {
        const now = this.capture(p.knowledge, p.current, p.frame);
        if (!now || !this.same(p.frame, now)) return false;
        for (const source of p.sources) {
          const t = source.validity, asOf = now.context.asOf;
          if (source.scope !== now.context.scope || now.context.revisions.get(source.id) !== source.revision
            || (t && (asOf === undefined || asOf < t.from || asOf >= t.until))) return false;
        }
      }
      return this.available();
    } });
  }

  /** 区域普通阶段按已有 work 额度校验；节点已知输入证明在整次接纳中预留。 */
  public checkDetached(scope: ManagedScope, proofs: readonly DetachedRegionProof[]): boolean {
    const plan = this.detachedPlan(proofs);
    if (!plan) return false;
    if (plan.work === 0) return true;
    const admission = this.ledger.reserve(scope.owner, { calls: 0, steps: 0, work: plan.work }, scope.local);
    if (!admission.ok) return false;
    try { return plan.check(); }
    finally { admission.ticket.close(scope.owner); }
  }

  private same(a: Frame, b: Frame): boolean {
    return a.epoch === b.epoch && a.context.scope === b.context.scope
      && a.context.revisions.size === b.context.revisions.size
      && [...a.context.revisions].every(([k, v]) => b.context.revisions.get(k) === v)
      && (a.context.asOf === undefined || (b.context.asOf !== undefined && b.context.asOf >= a.context.asOf));
  }

  public check(frame: Frame, resolution?: EvidenceResolution<string, unknown>): boolean {
    const now = this.frame();
    if (!now || !this.same(frame, now)) return false;
    return this.evidenceCurrent(now, resolution);
  }

  private evidenceCurrent(now: Frame, resolution?: EvidenceResolution<string, unknown>): boolean {
    if (resolution?.complete) {
      for (const item of resolution.items) for (const observation of item.evidence) {
        const validity = observation.source.validity, asOf = now.context.asOf;
        if (validity && (asOf === undefined || asOf < validity.from || asOf >= validity.until)) return false;
      }
    }
    return true;
  }

  public reserveScope(parentId?: string, completion?: WorkflowCompletionPolicy<unknown>, parent?: ManagedScope, maxLocalWork?: number, actorProjections?: number, region?: WorkflowNodeOptions, prepaid = false):
    { scope: ManagedScope } | { code: string } {
    if (!this.available()) return { code: 'WORKFLOW_STOPPED' };
    if (actorProjections !== undefined && (!valid(actorProjections, 65536) || actorProjections < 1
      || completion !== undefined || parent === undefined)) return { code: 'WORKFLOW_INVALID_LIMIT' };
    if (region && (completion || !parent || !valid(region.knowledge.maxItems, 4096)
      || typeof region.current !== 'function' || typeof region.knowledge.current !== 'function'
      || typeof region.knowledge.equal !== 'function')) return { code: 'WORKFLOW_INVALID_LIMIT' };
    const P = actorProjections ?? 0;
    const actorCalls = Number(actorProjections !== undefined);
    const owner = {};
    const reads = completion?.terminalReads ?? 0;
    const finalCalls = completion === undefined ? 0 : 1 + Number(completion.observe !== undefined) + reads;
    const charge: ResourceCharge = { calls: finalCalls + actorCalls, steps: 1 + finalCalls + actorCalls,
      work: 4 + 3 * EVENT_SCAN_WORK + finalCalls + (completion === undefined
        ? 4 * (this.frameChainCost(parent) + (region ? frameScanWork(region.knowledge.maxItems) : 0)) : knowledgeScanWork(this.control.knowledge.maxItems) + (8 + reads) * this.frameCost + this.progressScanCost)
        + actorCalls + P * (1 + EVENT_SCAN_WORK + this.frameChainCost(parent)),
      events: 3 + P, activeScopes: 1, terminalReads: reads };
    if (maxLocalWork !== undefined && !valid(maxLocalWork)) return { code: 'WORKFLOW_INVALID_LIMIT' };
    // 局部额度包含作用域自身准入、所有后代及终止预留；不从根转移或复制实际余额。
    let local: LocalWorkQuota | undefined, ticket: ResourceTicket;
    if (prepaid) {
      if (!parent || !region || parent.prepaidChildWork === undefined || completion || actorProjections !== undefined
        || maxLocalWork === undefined || charge.work === undefined || charge.work > parent.prepaidChildWork) return { code: 'WORKFLOW_CHILD_ADMISSION' };
      if (maxLocalWork < charge.work) return { code: 'WORKFLOW_LOCAL_WORK_BUDGET' };
      local = this.ledger.prepaidLocal(maxLocalWork, charge.work, parent.local);
      const split = parent.ticket.splitChild(parent.owner, owner);
      if (!split) return { code: 'WORKFLOW_CHILD_ADMISSION' };
      delete parent.prepaidChildWork;
      ticket = split;
    } else {
      local = maxLocalWork === undefined ? parent?.local : this.ledger.local(maxLocalWork, parent?.local);
      const admission = this.ledger.reserve(owner, charge, local);
      if (!admission.ok) return { code: admission.code };
      ticket = admission.ticket;
    }
    return { scope: { id: randomUUID(), ...(parentId === undefined ? {} : { parentId }),
      owner, ticket, delivery: 'not-required', diagnostic: false, ...(parent === undefined ? {} : { parent }), ...(local === undefined ? {} : { local }),
      ...(actorProjections === undefined ? {} : { actor: { remaining: P } }),
      ...(region ? { policy: { knowledge: Object.freeze({ ...region.knowledge }), current: region.current }, feedbackCount: 0 } : {}) } };
  }

  public reserveCall(scope: ManagedScope, calls: number, units: number):
    { frame: ScopeFrames } | { code: string } {
    if (!this.available()) return { code: 'WORKFLOW_STOPPED' };
    const admission = this.ledger.reserve(scope.owner, { calls, steps: calls,
      work: units + 4 * calls * this.frameChainCost(scope) }, scope.local);
    if (!admission.ok) return { code: admission.code };
    admission.ticket.close(scope.owner);
    const frame = this.frames(scope);
    return frame === undefined ? { code: 'WORKFLOW_CURRENTNESS' } : { frame };
  }

  /** 用户响应实际进入分析前预留检查点；真实响应由 Interaction 保存，
   * 区域的反馈/重规划观察由实际 Region 产生，不虚构 region 标识。
   */
  public feedbackCheckpoint(scope: ManagedScope): Outcome<void> {
    if (!this.available()) return managedFailure('WORKFLOW_STOPPED');
    const charge = this.ledger.reserve(scope.owner, { calls: 1, steps: 1,
      work: 1 + 4 * this.frameChainCost(scope), events: 1 }, scope.local);
    if (!charge.ok) return managedFailure(charge.code);
    try {
      const frame = this.frames(scope);
      if (!frame || !this.checkFrames(scope, frame)) return unknown('WORKFLOW_CURRENTNESS');
      if (!charge.ticket.event(scope.owner)) return managedFailure('WORKFLOW_EVENT_BUDGET');
      for (let owner: ManagedScope | undefined = scope; owner !== undefined; owner = owner.parent) {
        if (owner.feedbackCount !== undefined) {
          if (!Number.isSafeInteger(owner.feedbackCount + 1)) return managedFailure('WORKFLOW_FEEDBACK_LIMIT');
          owner.feedbackCount++; break;
        }
      }
      return ok(undefined);
    } finally { charge.ticket.close(scope.owner); }
  }

  public modelDecision(scope: ManagedScope, reason: string, action: 'not-needed' | 'unavailable'): Outcome<void> {
    if (!this.available() || !boundedText(reason) || Buffer.byteLength(reason) > 1024
      || (action !== 'not-needed' && action !== 'unavailable')) return managedFailure('WORKFLOW_MODEL_DECISION_INVALID');
    // 复用现有作用域当前性检查，交付前后各一次；不足时不运行策略或观察回调。
    const charge = this.ledger.reserve(scope.owner, { calls: 0, steps: 1,
      work: 1 + EVENT_SCAN_WORK + 2 * this.frameChainCost(scope), events: 1 }, scope.local);
    if (!charge.ok) return managedFailure(charge.code);
    try {
      const frame = this.frames(scope);
      if (!frame) return unknown('WORKFLOW_CURRENTNESS');
      if (!charge.ticket.event(scope.owner)) return managedFailure('WORKFLOW_EVENT_BUDGET');
      const record = Object.freeze({ kind: 'model' as const, action, decisionId: randomUUID(), reason,
        usage: Object.freeze({ input: null, output: null, total: null, kind: 'unavailable' as const }), detail: null,
        runId: this.runId, scopeId: scope.id, ...(scope.parentId === undefined ? {} : { parentScopeId: scope.parentId }),
        seq: this.sequence(), factRevision: frame.locals.at(-1)?.frame.epoch ?? frame.root.epoch, stage: 'model-decision' });
      if (!this.deliver(scope, record)) return managedFailure('WORKFLOW_EVIDENCE_FAILED');
      return this.checkFrames(scope, frame) ? ok(undefined) : unknown('WORKFLOW_CURRENTNESS');
    } finally { charge.ticket.close(scope.owner); }
  }

  private record(scope: ManagedScope, phase: ScopeRecord['phase'], reason: string,
    quiescent: boolean, delivery: Delivery, value?: Outcome<unknown>, candidateSeq?: number): ScopeRecord {
    return Object.freeze({ kind: 'scope', phase, runId: this.runId, scopeId: scope.id,
      ...(scope.parentId === undefined ? {} : { parentScopeId: scope.parentId }),
      seq: ++this.#seq, factRevision: this.#last?.epoch ?? 0, stage: scope.parentId === undefined ? 'root' : 'child',
      reason, localQuiescent: quiescent, delivery,
      ...(value === undefined ? {} : { outcome: redact(value) }),
      ...(candidateSeq === undefined ? {} : { candidateSeq }) });
  }

  public deliver(scope: ManagedScope, record: WorkflowObservation): boolean {
    // 此处仅序列化经过限定的观察元数据，不读取原生业务值。
    if (Buffer.byteLength(JSON.stringify(record)) > 65536) {
      scope.diagnostic = true;
      if (this.control.evidence?.required) { scope.delivery = 'failed'; this.#criticalFailed = true; }
      return false;
    }
    const { observe, evidence } = this.control;
    let requiredOk = true;
    try {
      if (observe !== undefined) {
        if (types.isAsyncFunction(observe)) throw new Error('WORKFLOW_ASYNC_OBSERVER');
        this.guarded(() => observe(record));
      }
    } catch { scope.diagnostic = true; }
    if (evidence !== undefined) {
      try {
        if (types.isAsyncFunction(evidence.emit)) throw new Error('WORKFLOW_ASYNC_EVIDENCE');
        const result = this.guarded(() => evidence.emit(record));
        if (!isManagedOutcome(result) || result.status !== 'COMPLETE') throw new Error('WORKFLOW_EVIDENCE_FAILED');
        if (scope.delivery !== 'failed') scope.delivery = 'satisfied';
      } catch { scope.delivery = 'failed'; requiredOk = !evidence.required; if (evidence.required) this.#criticalFailed = true; }
    }
    return requiredOk;
  }

  public open(scope: ManagedScope): boolean {
    if (!scope.ticket.event(scope.owner)) return false;
    return this.deliver(scope, this.record(scope, 'open', 'WORKFLOW_SCOPE_OPEN', false,
      this.control.evidence === undefined ? 'not-required' : 'pending'));
  }

  /** 先候选交付，再检查当前性，最后不调用用户代码地提交唯一裁定。 */
  public close<T>(scope: ManagedScope, value: Outcome<T>, frame?: Frame,
    resolution?: EvidenceResolution<string, unknown>, chain?: ScopeFrames): Outcome<T> {
    let result = snapshotOutcome(value);
    let seq: number | undefined;
    if (scope.ticket.event(scope.owner)) {
      const candidate = this.record(scope, 'candidate', 'WORKFLOW_SCOPE_CANDIDATE', true,
        this.control.evidence === undefined ? 'not-required' : 'pending', result);
      seq = candidate.seq;
      const delivered = this.deliver(scope, candidate);
      if (!delivered && result.status === 'COMPLETE') result = managedFailure('WORKFLOW_EVIDENCE_FAILED');
    } else if (result.status === 'COMPLETE') result = managedFailure('WORKFLOW_EVENT_BUDGET');
    if (result.status === 'COMPLETE' && this.#criticalFailed) result = managedFailure('WORKFLOW_EVIDENCE_FAILED');
    if (result.status === 'COMPLETE' && (chain ? !this.checkFrames(scope, chain, resolution, scope.finalCurrent) : !frame || !this.check(frame, resolution))) result = unknown('WORKFLOW_CURRENTNESS');
    if (!scope.ticket.event(scope.owner)) {
      scope.ticket.close(scope.owner);
      return result.status === 'COMPLETE' ? managedFailure('WORKFLOW_EVENT_BUDGET') : result;
    }
    const reason = scope.diagnostic ? 'WORKFLOW_OBSERVER_FAILED'
      : result.status === 'COMPLETE' ? 'WORKFLOW_ACCEPTED' : 'WORKFLOW_NOT_ACCEPTED';
    this.#final.push(this.record(scope, 'closed', reason, true, scope.delivery, result, seq));
    scope.ticket.close(scope.owner);
    return result;
  }

  public validCompletion<T>(policy: WorkflowCompletionPolicy<T> | undefined): policy is WorkflowCompletionPolicy<T> {
    return policy !== undefined && policy !== null && boundedText(policy.goal) && array(policy.requiredKnowledge)
      && policy.requiredKnowledge.length <= this.control.knowledge.maxItems && valid(policy.terminalReads)
      && (policy.requiredKnowledge.length === 0 || typeof policy.observe === 'function')
      && (policy.observe === undefined || typeof policy.observe === 'function')
      && typeof policy.validate === 'function' && !types.isAsyncFunction(policy.validate);
  }

  /** 根入口预留后验证完整声明；在任何业务回调前拒绝重复、非法 origin。 */
  public requirements(policy: { readonly requiredKnowledge: readonly EvidenceRequirement<string>[] }): readonly EvidenceRequirement<string>[] | undefined {
    const reqs = policy.requiredKnowledge;
    if (!dense(reqs)) return undefined;
    const keys = new Set<string>();
    const result: EvidenceRequirement<string>[] = [];
    for (const req of reqs) {
      if (!boundedText(req.key) || keys.has(req.key) || !array(req.accepts)
        || req.accepts.length < 1 || req.accepts.length > 4 || !dense(req.accepts)
        || new Set(req.accepts).size !== req.accepts.length
        || req.accepts.some(x => !['authority', 'user', 'derived', 'default'].includes(x))) return undefined;
      keys.add(req.key);
      result.push(Object.freeze({ key: req.key, accepts: Object.freeze([...req.accepts]) }));
    }
    return Object.freeze(result);
  }

  public async complete<T>(scope: ManagedScope, value: Outcome<T>, policy: WorkflowCompletionPolicy<T>,
    requirements: readonly EvidenceRequirement<string>[], depth: number):
    Promise<{ result: Outcome<T>; frame?: Frame; resolution?: EvidenceResolution<string, unknown> }> {
    value = snapshotOutcome(value);
    if (value.status !== 'COMPLETE') return { result: value };
    if (!this.available()) return { result: unknown('WORKFLOW_STOPPED') };
    const frame = this.frame();
    if (!frame) return { result: managedFailure('WORKFLOW_CURRENTNESS') };
    let raw: readonly EvidenceObservation<string, unknown>[] = [];
    if (policy.observe !== undefined) {
      const terminal = this.terminal(scope, frame);
      try {
        const observed = await policy.observe(value.value, terminal.context);
        const unjoined = await terminal.close();
        if (unjoined || !isManagedOutcome(observed) || observed.status !== 'COMPLETE') {
          return { result: managedFailure('WORKFLOW_COMPLETION_OBSERVATION') };
        }
        raw = observed.value;
      } catch {
        await terminal.close();
        return { result: managedFailure('WORKFLOW_COMPLETION_OBSERVATION') };
      }
    }
    if (!this.check(frame) || !array(raw) || raw.length > this.control.knowledge.maxItems
      || !dense(raw) || raw.some(o => !boundedText(o?.key) || !boundedText(o?.source?.id)
        || !boundedText(o?.source?.scope) || !boundedText(o?.source?.revision))) {
      return { result: managedFailure('WORKFLOW_CURRENTNESS') };
    }
    let resolution: EvidenceResolution<string, unknown>;
    try {
      resolution = this.guarded(() => resolveEvidence(requirements, raw, frame.context,
        this.control.knowledge, this.control.knowledge.maxItems));
    } catch { return { result: managedFailure('WORKFLOW_COMPLETION_KNOWLEDGE') }; }
    if (!resolution.complete || resolution.items.some(i => i.status !== 'resolved')
      || !this.check(frame, resolution)) return { result: managedFailure('WORKFLOW_COMPLETION_KNOWLEDGE') };
    const remaining = this.ledger.remaining();
    const view: WorkflowContextView = Object.freeze({ runId: this.runId, scopeId: scope.id,
      goal: policy.goal, stage: 'completion', factRevision: frame.epoch, knowledge: resolution,
      capabilities: Object.freeze([]), constraints: Object.freeze([]), progress: this.progress(scope.id),
      feedbackRevision: 0, remaining: Object.freeze({ calls: remaining.calls, steps: remaining.steps,
        maxDescendantDepth: depth, work: remaining.work, events: remaining.events,
        ...this.clock.remaining(), localWork: this.localRemaining(scope) }) });
    try {
      const validated = this.guarded(() => policy.validate(value.value, view));
      if (!isManagedOutcome(validated)) return { result: managedFailure('WORKFLOW_COMPLETION_INVALID') };
      if (validated.status !== 'COMPLETE') return { result: snapshotOutcome(validated) };
      if (!this.check(frame, resolution)) return { result: unknown('WORKFLOW_CURRENTNESS') };
    } catch { return { result: managedFailure('WORKFLOW_COMPLETION_INVALID') }; }
    return { result: value, frame, resolution };
  }

  public terminal(scope: ManagedScope, frame?: Frame, chain?: ScopeFrames, actualObservation = false) {
    const controller = new AbortController();
    const pending = new Set<Promise<void>>();
    let open = true;
    let invalid = false;
    const remaining = this.clock.reason === undefined ? this.control.limits.maxSettlementMs : this.clock.beginSettlement();
    const started = performance.now();
    const left = () => Math.min(Math.max(0, remaining - (performance.now() - started)), this.clock.reason === undefined ? Infinity : this.clock.settlementRemaining());
    const timeout = setTimeout(() => { controller.abort('settlement-timeout'); }, Math.max(1, Math.ceil(remaining)));
    const context: WorkflowTerminalContext = Object.freeze({
      signal: controller.signal,
      read: async <T>(action: (signal: AbortSignal) => Outcome<T> | Promise<Outcome<T>>): Promise<Outcome<T>> => {
        if (!open || this.#callback || controller.signal.aborted || left() <= 0
          || !scope.ticket.terminalRead(scope.owner)) {
          invalid = true;
          return managedFailure('WORKFLOW_TERMINAL_READ_DENIED');
        }
        let release!: () => void;
        const joined = new Promise<void>(resolve => { release = resolve; });
        pending.add(joined);
        try {
          const rawValue = await action(controller.signal);
          const value = snapshotOutcome(rawValue);
          const current = chain ? this.checkFrames(scope, chain) : frame !== undefined && this.check(frame);
          if (!isManagedOutcome(rawValue) || (!actualObservation && !current) || controller.signal.aborted
            || left() <= 0) {
            invalid = true;
            return managedFailure('WORKFLOW_TERMINAL_READ_STALE');
          }
          return value;
        } catch { invalid = true; return managedFailure('WORKFLOW_TERMINAL_READ_FAILED'); }
        finally { pending.delete(joined); release(); }
      },
    });
    return { context, close: async () => {
      open = false;
      const work = [...pending];
      await Promise.all(work);
      clearTimeout(timeout);
      const expired = controller.signal.aborted || left() <= 0;
      controller.abort('terminal-closed');
      return work.length > 0 || invalid || expired;
    } };
  }
}
