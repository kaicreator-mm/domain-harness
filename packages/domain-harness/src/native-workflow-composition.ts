import { randomUUID } from 'node:crypto';
import { ManagedRuntime, isManagedOutcome, managedFailure, snapshotControl, snapshotOutcome } from './workflow-managed-runtime.js';
import { admitNode, executeNode, safeDetail } from './workflow-managed-node.js';
import type { BoundNodePreparation } from './workflow-managed-node.js';
import type { ScopeFrames, ManagedScope } from './workflow-managed-runtime.js';
import type { WorkflowCompletionPolicy, WorkflowControlOptions, WorkflowObservation, WorkflowNode, WorkflowNodeOptions, WorkflowKnowledgeFrame, WorkflowContextView } from './workflow-managed-contract.js';
import type { StandardJsonValue } from './standard-files.js';
import type { StandardWorkflowOutcome } from './standard-workflow.js';
import type { EvidenceResolution } from './standard-evidence.js';
import { EVENT_SCAN_WORK, WorkflowResourceLedger } from './workflow-resource-control.js';
import type { ResourceFailure } from './workflow-resource-control.js';

/** 同一根 Workflow 的共享调用和步骤额度；不是 Package 的运行时安全验证。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowLimits {
  readonly maxCalls: number;
  readonly maxSteps: number;
  readonly maxDepth: number;
}

type Result<T> = StandardWorkflowOutcome<T>;
type Status = Result<unknown>['status'];
type WorkflowHandler<T> = (context: NativeWorkflowContext) => Result<T> | Promise<Result<T>>;

type WorkflowFailureCode =
  | 'WORKFLOW_CALL_BUDGET' | 'WORKFLOW_STEP_BUDGET'
  | 'WORKFLOW_DEPTH_LIMIT' | 'WORKFLOW_EXECUTION_FAILED'
  | 'WORKFLOW_HOOK_END_FAILED' | 'WORKFLOW_ALREADY_RUN'
  | 'WORKFLOW_INVALID_LIMIT' | 'WORKFLOW_SCOPE_CLOSED' | ResourceFailure;

function failure<T>(code: WorkflowFailureCode): Result<T> {
  return { status: 'FAILED', reason: { code, message: 'Workflow could not complete' } };
}

function validLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** 以普通 TypeScript 函数显式声明全部结果分支，无中央 FunctionRef/Target。
 * @dhKind type
 * @dhCapability workflow
 */
export type WorkflowRoutes<T, R> = Readonly<
  Record<Status, (outcome: Result<T>) => R | Promise<R>>
>;

/** 显式路由六种 Workflow 结果。
 * @dhKind function
 * @dhCapability workflow
 */
export function routeWorkflowOutcome<T, R>(
  outcome: Result<T>, exits: WorkflowRoutes<T, R>,
): Promise<R> {
  return Promise.resolve().then(() => exits[outcome.status](outcome));
}

class RootBudget {
  public readonly ledger: WorkflowResourceLedger;

  constructor(limits: WorkflowLimits, control?: WorkflowControlOptions) {
    this.ledger = new WorkflowResourceLedger(limits.maxCalls, limits.maxSteps, control?.limits);
  }

  public get calls(): number { return this.ledger.remaining().calls; }
  public get steps(): number { return this.ledger.remaining().steps; }

  /** 旧调用、步骤与后续 managed 维度使用同一个内部账本。 */
  public reserve(calls: number, steps: number): WorkflowFailureCode | undefined {
    const admission = this.ledger.reserve(this, { calls, steps });
    return admission.ok ? undefined : admission.code;
  }
}

/**
 * 每个受控作用域拥有已接纳的本地操作。关闭先停止准入，再等待真实操作结束；
 * 不以 Promise.race 或超时标志替代资源释放。子作用域共享原根预算。
 * 私有实现，后续 managed control 复用，不构成第二执行器。
 */
class ScopeLifetime {
  private state: 'OPEN' | 'STOPPING' | 'CLOSED' = 'OPEN';
  private readonly pending = new Set<Promise<void>>();
  private children = 0;
  private direct = 0;
  private published = false;
  private activityClosed = false;
  private activeLeaves = 0;
  private waitingLeaves = 0;

  private syncActivity(): void {
    if (!this.managed) return;
    const waiting = Number(!this.activityClosed && this.published);
    const active = this.activityClosed ? 0 : this.direct - waiting
      + Number(this.direct === 0 && this.children === 0);
    const da = active - this.activeLeaves, dw = waiting - this.waitingLeaves;
    this.activeLeaves = active;
    this.waitingLeaves = waiting;
    if (da !== 0 || dw !== 0) this.managed.activity(da, dw);
  }

  /** 只有实际已通知且尚未捕获响应的等待可以暂停这一叶子。 */
  public publishedWait(waiting: boolean): void {
    if (waiting && (this.activityClosed || this.direct < 1 || this.published)) throw Error('WORKFLOW_WAIT_INVALID');
    this.published = waiting;
    this.syncActivity();
  }

  public finishActivity(): void {
    this.activityClosed = true;
    this.syncActivity();
  }

  readonly id = randomUUID();
  readonly runId: string;
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();
  private readonly upstream: AbortSignal | undefined;
  private readonly abort = () => { this.controller.abort(this.upstream?.reason); };
  constructor(private readonly parent?: ScopeLifetime, readonly managed?: ManagedRuntime,
    readonly scope?: ManagedScope) {
    this.runId = managed?.runId ?? parent?.runId ?? randomUUID();
    this.upstream = parent?.signal ?? managed?.signal;
    this.signal = this.controller.signal;
    if (this.upstream?.aborted) this.abort();
    else this.upstream?.addEventListener('abort', this.abort, { once: true });
    this.syncActivity();
  }
  public admissible(): boolean { return !this.signal.aborted && this.isOpen() && (this.managed?.available() ?? true); }

  public reserve(budget: RootBudget, calls: number, units: number):
    { frame?: ScopeFrames } | { code: string } {
    if (!this.admissible()) return { code: 'WORKFLOW_SCOPE_CLOSED' };
    if (this.managed && this.scope) return this.managed.reserveCall(this.scope, calls, units);
    const refused = budget.reserve(calls, calls);
    return refused === undefined ? {} : { code: refused };
  }

  public checked<T>(result: Result<T>, frame?: ScopeFrames): Result<T> {
    if (!this.managed) return result;
    result = snapshotOutcome(result);
    if (result.status !== 'COMPLETE') return result;
    return frame && this.admissible() && this.scope && this.managed.checkFrames(this.scope, frame) ? result
      : { status: 'UNKNOWN', reason: { code: 'WORKFLOW_CURRENTNESS', message: 'Managed result not accepted' } };
  }

  public isOpen(): boolean {
    return this.state === 'OPEN' && (this.parent?.isOpen() ?? true);
  }

  /** 在回调执行前同步登记；释放只能发生在实际操作结算后。 */
  public begin(kind: 'direct' | 'child' | 'orchestration' = 'direct'): () => void {
    let release!: () => void;
    const settled = new Promise<void>(resolve => { release = resolve; });
    this.pending.add(settled);
    if (kind === 'child') this.children++; else if (kind === 'direct') this.direct++;
    this.syncActivity();
    return () => {
      if (!this.pending.delete(settled)) return;
      if (kind === 'child') this.children--; else if (kind === 'direct') this.direct--;
      this.syncActivity();
      release();
    };
  }

  /** actor 终态先关闭准入；异常仅取消本地作用域及后代，随后由原有 close 等待。 */
  public stopAdmission(cancel: boolean): void {
    if (this.state === 'OPEN') this.state = 'STOPPING';
    if (cancel) this.controller.abort('workflow-scope-stopped');
  }

  public async close(): Promise<boolean> {
    this.stopAdmission(false);
    const outstanding = [...this.pending];
    // 已返回的调用者不能留下永久暂停的孤立用户等待；取消仍等待真实结算。
    if (this.managed && outstanding.length > 0) this.stopAdmission(true);
    await Promise.all(outstanding);
    this.state = 'CLOSED';
    this.upstream?.removeEventListener('abort', this.abort);
    return outstanding.length > 0;
  }
}

/** 已脱离调用方的操作不能被根/子成功掩盖；先结算本地资源，再保留原非成功。 */
function afterJoin<T>(result: Result<T>, unjoined: boolean): Result<T> {
  if (!unjoined || result.status !== 'COMPLETE') return result;
  return { status: 'UNKNOWN', reason: {
    code: 'WORKFLOW_UNJOINED_WORK', message: 'Workflow returned with outstanding owned work',
  } };
}

const scopeLifetimes = new WeakMap<NativeWorkflowContext, ScopeLifetime>();
const boundNodes = new WeakMap<NativeWorkflowContext, <I, O>(definition: WorkflowNode<I, O>, options: WorkflowNodeOptions,
  binding: BoundNodePreparation<I, O>) => Promise<Result<O>>>();

/** 子区域工厂是同步准备回调，禁止借用其他已捕获作用域重入。 */
export function guardBoundFactory<T>(root: NativeWorkflowContext, factory: () => Result<T>): Result<T> {
  const lifetime = scopeLifetime(root);
  if (!lifetime.admissible() || !lifetime.managed) return managedFailure('WORKFLOW_SCOPE_CLOSED');
  try { return snapshotOutcome(lifetime.managed.guarded(factory)); }
  catch { return managedFailure('WORKFLOW_BINDING_INVALID'); }
}

/** 内部动态能力复用同一受控节点；不增加公开执行入口。 */
export function executeBoundNode<I, O>(root: NativeWorkflowContext, definition: WorkflowNode<I, O>,
  options: WorkflowNodeOptions, binding: BoundNodePreparation<I, O>): Promise<Result<O>> {
  return boundNodes.get(root)?.(definition, options, binding) ?? Promise.resolve(managedFailure('WORKFLOW_SCOPE_CLOSED'));
}

const scopeBorrowers = new WeakMap<NativeWorkflowContext, <T>(depth: number, action: WorkflowHandler<T>, local?: number, actorProjections?: number, region?: WorkflowNodeOptions) => Promise<Result<T>>>();

/** 内部 Region/Actor 入口使用同一借用生命周期；不从 SDK 根导出。 */
export function borrowWorkflowScope<T>(root: NativeWorkflowContext, maxDescendantDepth: number,
  action: WorkflowHandler<T>, maxLocalWork?: number): Promise<Result<T>> {
  const borrow = scopeBorrowers.get(root);
  return borrow === undefined ? Promise.resolve(managedFailure('WORKFLOW_SCOPE_CLOSED'))
    : borrow(maxDescendantDepth, action, maxLocalWork);
}

/** 区域沿用借用生命周期，可信区域策略加入祖先策略链。 */
export function borrowRegionScope<T>(root: NativeWorkflowContext, depth: number, local: number,
  options: WorkflowNodeOptions, action: WorkflowHandler<T>): Promise<Result<T>> {
  if (!scopeLifetime(root).managed) return Promise.resolve(managedFailure('WORKFLOW_CONTROL_REQUIRED'));
  return scopeBorrowers.get(root)?.(depth, action, local, undefined, options)
    ?? Promise.resolve(managedFailure('WORKFLOW_SCOPE_CLOSED'));
}

type RegionEvent = Readonly<Pick<Extract<WorkflowObservation, { kind: 'region' }>,
  'regionId' | 'action' | 'beforeRevision' | 'afterRevision' | 'reason' | 'detail'>>;
interface RegionOperation<T> {
  readonly value: T;
  readonly resolution?: EvidenceResolution<string, unknown>;
  readonly event?: RegionEvent;
  readonly validate?: (frame: WorkflowKnowledgeFrame) => boolean;
}

/** 区域阶段统一在原账本、真实 frame、生命周期和证据接口中执行。
 * 不暴露账本；可变事实只允许在明确的可信反馈边界开始新阶段。
 */
export async function regionOperation<T>(root: NativeWorkflowContext, units: number, calls: number,
  emits: boolean, action: (frame: WorkflowKnowledgeFrame, remaining: WorkflowContextView['remaining'],
    maxNoProgress: number, check: () => boolean) => Result<RegionOperation<T>> | Promise<Result<RegionOperation<T>>>,
  final = false, feedback = false, extraChecks = 0, rejection?: RegionEvent): Promise<Result<T>> {
  const lifetime = scopeLifetime(root), runtime = lifetime.managed, scope = lifetime.scope;
  if (!lifetime.admissible() || !runtime || !scope || !scope.policy || scope.bound
    || !Number.isSafeInteger(units) || units < 1 || !Number.isSafeInteger(calls) || calls < 1) return managedFailure('WORKFLOW_REGION_ADMISSION');
  const ticket = runtime.ledger.reserve(scope.owner, { calls, steps: calls,
    work: units + (8 + extraChecks) * runtime.frameChainCost(scope) + Number(emits) * EVENT_SCAN_WORK,
    events: Number(emits) }, scope.local);
  if (!ticket.ok) return managedFailure(ticket.code);
  const finish = lifetime.begin('orchestration');
  try {
    const chain = runtime.frames(scope), frame = chain?.locals.at(-1)?.frame;
    if (!chain || !frame || !lifetime.admissible()) return managedFailure('WORKFLOW_CURRENTNESS');
    const left = runtime.ledger.remaining();
    const remaining = Object.freeze({ calls: left.calls, steps: left.steps, work: left.work, events: left.events,
      maxDescendantDepth: root.remaining().maxDescendantDepth, localWork: runtime.localRemaining(scope), ...runtime.clock.remaining() });
    const feedbackBefore = scope.feedbackCount ?? 0;
    let result: Result<RegionOperation<T>>;
    try { result = snapshotOutcome(await action(frame, remaining, runtime.control.limits.maxNoProgress, () => lifetime.admissible() && runtime.checkFrames(scope, chain))); }
    catch { result = managedFailure('WORKFLOW_REGION_INVALID'); }
    if (result.status !== 'COMPLETE') {
      if (rejection && emits && lifetime.admissible() && runtime.checkFrames(scope, chain) && ticket.ticket.event(scope.owner)) {
        const record: WorkflowObservation = Object.freeze({ ...rejection, kind: 'region', runId: root.runId,
          scopeId: root.scopeId, parentScopeId: scope.parentId!, seq: runtime.sequence(), factRevision: frame.epoch,
          planRevision: rejection.afterRevision, stage: rejection.action });
        if (!runtime.deliver(scope, record)) return managedFailure('WORKFLOW_EVIDENCE_FAILED');
      }
      return result;
    }
    if (feedback && (scope.feedbackCount ?? 0) <= feedbackBefore) return managedFailure('WORKFLOW_FEEDBACK_NOT_OBSERVED');
    const output = result.value;
    const current = feedback ? runtime.frames(scope) : chain;
    if (!current || !lifetime.admissible() || !runtime.checkFrames(scope, current, output.resolution, output.validate)) return managedFailure('WORKFLOW_CURRENTNESS');
    if (output.event) {
      if (!emits || !ticket.ticket.event(scope.owner)) return managedFailure('WORKFLOW_EVENT_BUDGET');
      const record: WorkflowObservation = Object.freeze({ ...output.event, kind: 'region', runId: root.runId, scopeId: root.scopeId,
        parentScopeId: scope.parentId!, seq: runtime.sequence(), factRevision: current.locals.at(-1)?.frame.epoch ?? current.root.epoch,
        planRevision: output.event.afterRevision, stage: output.event.action });
      if (!runtime.deliver(scope, record) || !lifetime.admissible() || !runtime.checkFrames(scope, current, output.resolution, output.validate)) return managedFailure('WORKFLOW_CURRENTNESS');
    }
    if (final) {
      scope.bound = current;
      if (output.resolution !== undefined) scope.resolved = output.resolution;
      if (output.validate !== undefined) scope.finalCurrent = output.validate;
    }
    return { status: 'COMPLETE', value: output.value };
  } catch { return managedFailure('WORKFLOW_REGION_INVALID'); }
  finally { ticket.ticket.close(scope.owner); finish(); }
}

/** 私有子域来源校验由实际所属根和作用域承担。 */
export function verifyRegionProofs(root: NativeWorkflowContext, proofs: readonly import('./workflow-slots.js').DetachedRegionProof[]): boolean {
  const lifetime = scopeLifetime(root);
  return lifetime.managed !== undefined && lifetime.scope !== undefined && lifetime.managed.checkDetached(lifetime.scope, proofs);
}

/** 实际受控后代出现已提交/未知或未接纳调用时，不得自动重执行区域。 */
export function regionReplaySafe(root: NativeWorkflowContext): boolean {
  const scope = scopeLifetime(root).scope;
  return scope !== undefined && scope.feedbackCount !== undefined && !scope.unsafeReplay;
}

/** 实际已接受节点的效果只用于后续保守重规划判断。 */
export function regionDisposition(root: NativeWorkflowContext, instanceId: string): Extract<WorkflowObservation, { kind: 'node' }> | undefined {
  return scopeLifetime(root).managed?.nodeDisposition(instanceId);
}

/** Interaction 复用同一受控子作用域；取消仅关闭该作用域及后代。 */
export function borrowInteractionScope<T>(root: NativeWorkflowContext,
  action: (child: NativeWorkflowContext, attachment: AttachedInteractionScope) => Promise<Result<T>>): Promise<Result<T>> {
  if (!scopeLifetime(root).managed) return Promise.resolve(managedFailure('WORKFLOW_CONTROL_REQUIRED'));
  return borrowWorkflowScope(root, Math.max(0, root.remaining().maxDescendantDepth - 1), child => {
    const lifetime = scopeLifetime(child);
    return action(child, {
      cancel: () => lifetime.stopAdmission(true),
      waiting: waiting => lifetime.publishedWait(waiting),
      admissible: () => lifetime.admissible(),
      feedback: () => lifetime.admissible() && lifetime.managed && lifetime.scope
        ? lifetime.managed.feedbackCheckpoint(lifetime.scope) : managedFailure('WORKFLOW_SCOPE_CLOSED'),
    });
  });
}

export interface AttachedInteractionScope {
  cancel(): void;
  waiting(waiting: boolean): void;
  admissible(): boolean;
  feedback(): Result<void>;
}

function scopeLifetime(context: NativeWorkflowContext): ScopeLifetime {
  const lifetime = scopeLifetimes.get(context);
  if (lifetime === undefined) throw new Error('Missing native workflow scope');
  return lifetime;
}

/** 私有 actor 接线，不暴露账本、票据或新的根任务。 */
export interface AttachedActorScope {
  readonly signal: AbortSignal;
  input<T>(factory: () => T): T;
  project(definitionId: string, callback: () => StandardJsonValue): boolean;
  map<T>(callback: () => Result<T>): Result<T>;
  stop(cancel: boolean): void;
}

export function borrowActorScope<T>(root: NativeWorkflowContext, maxProjections: number,
  action: (scope: NativeWorkflowContext, actor: AttachedActorScope) => Result<T> | Promise<Result<T>>): Promise<Result<T>> {
  const borrow = scopeBorrowers.get(root);
  if (!borrow || !Number.isSafeInteger(maxProjections) || maxProjections < 1 || maxProjections > 65536) {
    return Promise.resolve(managedFailure('WORKFLOW_INVALID_LIMIT'));
  }
  return borrow(Math.max(0, root.remaining().maxDescendantDepth - 1), async child => {
    const lifetime = scopeLifetime(child);
    const runtime = lifetime.managed, scope = lifetime.scope, actor = scope?.actor;
    if (!runtime || !scope || !actor?.frame) return managedFailure('WORKFLOW_ACTOR_ADMISSION');
    const frame = actor.frame;
    const attached: AttachedActorScope = {
      signal: child.signal,
      input: <I>(factory: () => I): I => {
        if (!lifetime.admissible()) throw Error('WORKFLOW_SCOPE_CLOSED');
        const input = runtime.guarded(factory);
        if (!lifetime.admissible() || !runtime.checkFrames(scope, frame)) throw Error('WORKFLOW_CURRENTNESS');
        return input;
      },
      project: (definitionId, callback) => {
        if (!lifetime.admissible() || actor.remaining === 0 || !scope.ticket.event(scope.owner)) return false;
        actor.remaining--;
        try {
          const detail = runtime.guarded(callback, value => safeDetail(value, 65536 - 1024));
          const delivered = runtime.deliver(scope, Object.freeze({ kind: 'actor', definitionId, detail,
            runId: runtime.runId, scopeId: scope.id, parentScopeId: scope.parentId!,
            seq: runtime.sequence(), factRevision: frame.locals.at(-1)?.frame.epoch ?? frame.root.epoch,
            stage: 'actor' }));
          return delivered && lifetime.admissible() && runtime.checkFrames(scope, frame);
        } catch { return false; }
      },
      map: <O>(callback: () => Result<O>): Result<O> => {
        if (!lifetime.admissible()) return managedFailure('WORKFLOW_SCOPE_CLOSED');
        const result = runtime.guarded(callback);
        return snapshotOutcome(result);
      },
      stop: cancel => { lifetime.stopAdmission(cancel); },
    };
    return action(child, attached);
  }, undefined, maxProjections);
}

interface AncestorLimit {
  readonly depth: number;
  readonly descendants: number;
}

/** Standard 层的执行上下文仅组合原生回调，不是动态任务图解释器。
 * @dhKind execution-support
 * @dhCapability workflow
 */
export class NativeWorkflowContext {
  constructor(
    private readonly budget: RootBudget,
    private readonly ancestors: readonly AncestorLimit[],
    public readonly depth: number,
  ) {
    scopeLifetimes.set(this, new ScopeLifetime());
    boundNodes.set(this, (definition, options, binding) => this.runNode(definition, binding.input, options, binding));
    scopeBorrowers.set(this, (depth, action, local, actorProjections, region) => this.borrow(depth, action, local, actorProjections, region));
  }

  public get signal(): AbortSignal { return scopeLifetime(this).signal; }
  public get runId(): string { return scopeLifetime(this).runId; }
  public get scopeId(): string { const lifetime = scopeLifetime(this); return lifetime.scope?.id ?? lifetime.id; }

  /** 显式有限工作；仅受控 Session 可接纳。 */
  public async work<T>(units: number, action: () => Result<T> | Promise<Result<T>>): Promise<Result<T>> {
    const lifetime = scopeLifetime(this);
    if (!lifetime.managed || !Number.isSafeInteger(units) || units <= 0) return managedFailure('WORKFLOW_INVALID_LIMIT');
    const reserved = lifetime.reserve(this.budget, 1, units);
    if ('code' in reserved) return lifetime.managed ? managedFailure(reserved.code) : failure(reserved.code as WorkflowFailureCode);
    const finish = lifetime.begin();
    try { return lifetime.admissible() ? lifetime.checked(await action(), reserved.frame) : failure('WORKFLOW_SCOPE_CLOSED'); }
    catch { return failure('WORKFLOW_EXECUTION_FAILED'); }
    finally { finish(); }
  }

  /** 同一根任务中的类型化节点尝试；普通固定代码与未来动态结构共用。 */
  public async node<I, O>(definition: WorkflowNode<I, O>, input: I, options: WorkflowNodeOptions): Promise<Result<O>> {
    return this.runNode(definition, () => ({ status: 'COMPLETE', value: input }), options);
  }

  private async runNode<I, O>(definition: WorkflowNode<I, O>, input: () => Result<I>, options: WorkflowNodeOptions,
    binding?: BoundNodePreparation<I, O>): Promise<Result<O>> {
    const parent = scopeLifetime(this);
    if (!parent.admissible() || !parent.managed || !parent.scope) return managedFailure('WORKFLOW_NODE_CONTROL_REQUIRED');
    const runtime = parent.managed;
    try {
      const admitted = admitNode(runtime, parent.scope, definition, options, binding);
      if ('code' in admitted) return managedFailure(admitted.code);
      const finish = parent.begin('child');
      const lifetime = new ScopeLifetime(parent, runtime, admitted.scope);
      // 尝试不是子 Workflow 层级；嵌套 child 仍按原有祖先深度合同。
      const attempt = new NativeWorkflowContext(this.budget, this.ancestors, this.depth);
      scopeLifetimes.set(attempt, lifetime);
      try { return await executeNode(runtime, admitted, input, attempt, () => lifetime.close(), () => parent.admissible()); }
      finally { lifetime.finishActivity(); finish(); }
    } catch { return managedFailure('WORKFLOW_NODE_INVALID'); }
  }

  /** 显式记录领域不调用模型的决定；不创建 Provider，也不授予权限。 */
  public recordModelDecision(reason: string, action: 'not-needed' | 'unavailable'): Result<void> {
    const lifetime = scopeLifetime(this);
    return lifetime.admissible() && lifetime.managed && lifetime.scope
      ? lifetime.managed.modelDecision(lifetime.scope, reason, action) : managedFailure('WORKFLOW_CONTROL_REQUIRED');
  }

  /** 当前共享根余额及本层可用子层深度；只读快照，不预留或增加额度。 */
  public remaining(): Readonly<{ calls: number; steps: number; maxDescendantDepth: number }> {
    return Object.freeze({
      calls: this.budget.calls,
      steps: this.budget.steps,
      maxDescendantDepth: Math.min(...this.ancestors.map(item => item.descendants - (this.depth - item.depth))),
    });
  }

  /**
   * 仅处理普通值（包括 Reader 返回的普通数据对象）；任何返回的业务
   * Outcome 都会作为 value 被包装，不能用本方法传播业务 REJECT/UNKNOWN/FAILED。
   */
  public async invoke<T>(action: () => T | Promise<T>): Promise<Result<T>> {
    const lifetime = scopeLifetime(this);
    const reserved = lifetime.reserve(this.budget, 1, 1);
    if ('code' in reserved) return lifetime.managed ? managedFailure(reserved.code) : failure(reserved.code as WorkflowFailureCode);
    const finish = lifetime.begin();
    try {
      if (!lifetime.admissible()) return failure('WORKFLOW_SCOPE_CLOSED');
      return lifetime.checked({ status: 'COMPLETE', value: await action() }, reserved.frame);
    } catch {
      return failure('WORKFLOW_EXECUTION_FAILED');
    } finally {
      finish();
    }
  }

  /**
   * 直接调用已经返回 WorkflowOutcome 的业务 Function，保留所有终态，
   * 同样在副作用前收取一次根调用/步骤预算；不把 FAILED 包成 COMPLETE。
   */
  public async invokeOutcome<T>(
    action: () => Result<T> | Promise<Result<T>>,
  ): Promise<Result<T>> {
    const lifetime = scopeLifetime(this);
    const reserved = lifetime.reserve(this.budget, 1, 1);
    if ('code' in reserved) return lifetime.managed ? managedFailure(reserved.code) : failure(reserved.code as WorkflowFailureCode);
    const finish = lifetime.begin();
    try {
      if (!lifetime.admissible()) return failure('WORKFLOW_SCOPE_CLOSED');
      return lifetime.checked(await action(), reserved.frame);
    } catch {
      return failure('WORKFLOW_EXECUTION_FAILED');
    } finally {
      finish();
    }
  }

  /** 受祖先与自身约束的子 Workflow，额度不复制、不重置。 */
  public async child<T>(
    maxDescendantDepth: number,
    action: WorkflowHandler<T>,
  ): Promise<Result<T>> {
    return this.borrow(maxDescendantDepth, action);
  }

  private async borrow<T>(maxDescendantDepth: number, action: WorkflowHandler<T>, maxLocalWork?: number, actorProjections?: number, region?: WorkflowNodeOptions): Promise<Result<T>> {
    const parent = scopeLifetime(this);
    if (!parent.admissible()) return failure('WORKFLOW_SCOPE_CLOSED');
    if (!validLimit(maxDescendantDepth) || (parent.managed && maxDescendantDepth > 2 ** 31 - 1)) return failure('WORKFLOW_INVALID_LIMIT');
    const nextDepth = this.depth + 1;
    if (this.ancestors.some(item => nextDepth - item.depth > item.descendants)) return failure('WORKFLOW_DEPTH_LIMIT');
    const managed = parent.managed;
    let scope: ManagedScope | undefined;
    if (managed) {
      const admitted = managed.reserveScope(this.scopeId, undefined, parent.scope, maxLocalWork, actorProjections, region);
      if ('code' in admitted) return managedFailure(admitted.code);
      scope = admitted.scope;
    } else {
      if (maxLocalWork !== undefined || actorProjections !== undefined || region !== undefined) return managedFailure('WORKFLOW_CONTROL_REQUIRED');
      const refused = this.budget.reserve(0, 1);
      if (refused !== undefined) return failure(refused);
    }
    const finish = parent.begin('child');
    const lifetime = new ScopeLifetime(parent, managed, scope);
    const child = new NativeWorkflowContext(this.budget, [
      ...this.ancestors, { depth: nextDepth, descendants: maxDescendantDepth },
    ], nextDepth);
    scopeLifetimes.set(child, lifetime);
    let result: Result<T>;
    const frame = managed && scope ? managed.frames(scope) : undefined;
    if (scope && frame && !region) scope.bound = frame;
    if (scope?.actor && frame) scope.actor.frame = frame;
    try {
      if (managed && scope && (!frame || !managed.open(scope) || !managed.checkFrames(scope, frame) || !parent.admissible())) {
        result = managedFailure('WORKFLOW_CHILD_ADMISSION');
      } else result = await action(child);
    } catch { result = failure('WORKFLOW_EXECUTION_FAILED'); }
    if (managed) result = snapshotOutcome(result);
    try {
      const unjoined = await lifetime.close();
      if (managed && !isManagedOutcome(result)) result = managedFailure('WORKFLOW_INVALID_OUTCOME');
      result = afterJoin(result, unjoined);
      if (managed && scope) {
        if (result.status === 'COMPLETE' && !parent.admissible()) result = managedFailure('WORKFLOW_SCOPE_CLOSED');
        return managed.close(scope, result, undefined, region ? scope.resolved : undefined, region ? scope.bound : frame);
      }
      return result;
    } finally { lifetime.finishActivity(); finish(); }
  }

  /**
   * 直接调用业务 Element Function，并按已进入的 Hook 负责最终 end。
   * 在 start 前一次性为 start、Function、end 预留预算，避免副作用后才拒绝。
   */
  public async leaf<T>(options: {
    readonly start?: () => void | Promise<void>;
    readonly run: () => Result<T> | Promise<Result<T>>;
    readonly end?: () => void | Promise<void>;
  }): Promise<Result<T>> {
    const lifetime = scopeLifetime(this);
    if (!lifetime.admissible()) return failure('WORKFLOW_SCOPE_CLOSED');
    // 预算与执行必须使用同一组已接纳的回调；调用方可能持有可变别名。
    const { start, run, end } = options;
    const calls = 1 + Number(start !== undefined) + Number(end !== undefined);
    const reserved = lifetime.reserve(this.budget, calls, calls);
    if ('code' in reserved) return lifetime.managed ? managedFailure(reserved.code) : failure(reserved.code as WorkflowFailureCode);
    const finish = lifetime.begin();
    if (!lifetime.admissible()) { finish(); return failure('WORKFLOW_SCOPE_CLOSED'); }

    let result: Result<T> | undefined;
    try {
      if (start !== undefined) await start.call(options);
      result = lifetime.admissible() && (!lifetime.managed || (reserved.frame && lifetime.scope && lifetime.managed.checkFrames(lifetime.scope, reserved.frame)))
        ? await run.call(options)
        : failure('WORKFLOW_SCOPE_CLOSED');
    } catch {
      result = failure('WORKFLOW_EXECUTION_FAILED');
    } finally {
      if (lifetime.managed && result !== undefined) result = snapshotOutcome(result);
      // 进入 start / run 后总是等待 end；end 不是 Package Exit。
      if (end !== undefined) {
        try {
          await end.call(options);
        } catch {
          // 保留更早的非成功结果，成功结果不能掩盖 end 失败。
          if (result === undefined || result.status === 'COMPLETE') {
            result = failure('WORKFLOW_HOOK_END_FAILED');
          }
        }
      }
      finish();
    }
    return lifetime.checked(result ?? failure('WORKFLOW_EXECUTION_FAILED'), reserved.frame);
  }
}

/** 每个业务根 Workflow 显式创建独立会话，内部不包含 KDP/Package Loader。
 * @dhKind execution-support
 * @dhCapability workflow
 */
export class StandardWorkflowSession {
  private readonly budget: RootBudget;
  private started = false;

  private readonly limits: WorkflowLimits;
  private readonly control: WorkflowControlOptions | undefined;
  private managed: ManagedRuntime | undefined;

  constructor(limits: WorkflowLimits, control?: WorkflowControlOptions) {
    // 同一时点读取不可变快照；验证、余额和祖先深度必须使用同一份值。
    // 不能信任调用方后续对原始 limits 对象的修改。
    this.limits = {
      maxCalls: limits.maxCalls,
      maxSteps: limits.maxSteps,
      maxDepth: limits.maxDepth,
    };
    this.control = control === undefined ? undefined : snapshotControl(control);
    this.budget = new RootBudget(this.limits, this.control);
  }

  public dispositions(): readonly WorkflowObservation[] { return this.managed?.dispositions() ?? Object.freeze([]); }

  public async run<T>(action: WorkflowHandler<T>, completion?: WorkflowCompletionPolicy<T>): Promise<Result<T>> {
    if (this.started) return failure('WORKFLOW_ALREADY_RUN');
    this.started = true;
    if (![this.limits.maxCalls, this.limits.maxSteps, this.limits.maxDepth]
      .every(validLimit)) {
      return failure('WORKFLOW_INVALID_LIMIT');
    }
    if (this.control !== undefined) {
      if (this.limits.maxDepth > 2 ** 31 - 1) return failure('WORKFLOW_INVALID_LIMIT');
      return this.runManaged(action, completion);
    }
    if (completion !== undefined) return managedFailure('WORKFLOW_CONTROL_REQUIRED');
    const refused = this.budget.reserve(0, 1);
    if (refused !== undefined) return failure(refused);
    const lifetime = new ScopeLifetime();
    const root = new NativeWorkflowContext(this.budget, [
      { depth: 0, descendants: this.limits.maxDepth },
    ], 0);
    scopeLifetimes.set(root, lifetime);
    let result: Result<T>;
    try {
      result = await action(root);
    } catch {
      result = failure('WORKFLOW_EXECUTION_FAILED');
    }
    return afterJoin(result, await lifetime.close());
  }

  private async runManaged<T>(action: WorkflowHandler<T>, completion?: WorkflowCompletionPolicy<T>): Promise<Result<T>> {
    let managed: ManagedRuntime;
    try { managed = new ManagedRuntime(this.control!, this.budget.ledger); }
    catch { return managedFailure('WORKFLOW_INVALID_LIMIT'); }
    this.managed = managed;
    try {
      if (!managed.validCompletion(completion)) return managedFailure('WORKFLOW_COMPLETION_REQUIRED');
      // 读取一次可信完成策略，预算和执行使用同一份回调与声明。
      const policy = Object.freeze({ ...completion });
      const admitted = managed.reserveScope(undefined, policy as WorkflowCompletionPolicy<unknown>);
      if ('code' in admitted) return managedFailure(admitted.code);
      const scope = admitted.scope;
      const lifetime = new ScopeLifetime(undefined, managed, scope);
      const root = new NativeWorkflowContext(this.budget, [
        { depth: 0, descendants: this.limits.maxDepth },
      ], 0);
      scopeLifetimes.set(root, lifetime);
      let result: Result<T>;
      let requirements: ReturnType<ManagedRuntime['requirements']>;
      try {
        requirements = managed.requirements(policy);
        const frame = managed.frame();
        result = requirements && frame && managed.open(scope) && managed.check(frame)
          ? await action(root) : managedFailure('WORKFLOW_ROOT_ADMISSION');
      } catch { result = failure('WORKFLOW_EXECUTION_FAILED'); }
      result = snapshotOutcome(result);
      const unjoined = await lifetime.close();
      result = afterJoin(result, unjoined);
      if (requirements === undefined) return managed.close(scope, result);
      try {
        const final = await managed.complete(scope, result, policy, requirements, this.limits.maxDepth);
        return managed.close(scope, final.result, final.frame, final.resolution);
      } catch { return managed.close(scope, managedFailure('WORKFLOW_COMPLETION_INVALID')); }
    } finally { managed.clock.finish(); }
  }

}

/**
 * 两个固定叶子角色的便捷组合：识别 COMPLETE 才进入处理，两个角色共享一根额度。
 * 各角色的输入、输出、领域规则与授权由调用方定义；复杂流程直接组合 Session/Context。
 * 完整成功路径需要 2 次调用、5 个步骤和 1 层深度；不是业务全量预算预检或等待恢复协议。

 * @dhKind function
 * @dhCapability workflow
 */
export function runRecognitionHandling<Intent, Output>(
  limits: WorkflowLimits,
  recognize: () => StandardWorkflowOutcome<Intent> | Promise<StandardWorkflowOutcome<Intent>>,
  handle: (intent: Intent) => StandardWorkflowOutcome<Output> | Promise<StandardWorkflowOutcome<Output>>,
): Promise<StandardWorkflowOutcome<Output>> {
  return new StandardWorkflowSession(limits).run(async root => {
    const recognized = await root.child(0, child => child.invokeOutcome(recognize));
    if (recognized.status !== 'COMPLETE') return recognized;
    return root.child(0, child => child.invokeOutcome(() => handle(recognized.value)));
  });
}
