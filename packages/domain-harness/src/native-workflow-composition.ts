import type { StandardWorkflowOutcome } from './standard-workflow.js';
import { WorkflowResourceLedger } from './workflow-resource-control.js';
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
  private readonly ledger: WorkflowResourceLedger;

  constructor(limits: WorkflowLimits) {
    this.ledger = new WorkflowResourceLedger(limits.maxCalls, limits.maxSteps);
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

  constructor(private readonly parent?: ScopeLifetime) {}

  public isOpen(): boolean {
    return this.state === 'OPEN' && (this.parent?.isOpen() ?? true);
  }

  /** 在回调执行前同步登记；释放只能发生在实际操作结算后。 */
  public begin(): () => void {
    let release!: () => void;
    const settled = new Promise<void>(resolve => { release = resolve; });
    this.pending.add(settled);
    return () => {
      this.pending.delete(settled);
      release();
    };
  }

  public async close(): Promise<boolean> {
    this.state = 'STOPPING';
    const outstanding = [...this.pending];
    await Promise.all(outstanding);
    this.state = 'CLOSED';
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

function scopeLifetime(context: NativeWorkflowContext): ScopeLifetime {
  const lifetime = scopeLifetimes.get(context);
  if (lifetime === undefined) throw new Error('Missing native workflow scope');
  return lifetime;
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
    if (!scopeLifetime(this).isOpen()) return failure('WORKFLOW_SCOPE_CLOSED');
    const refused = this.budget.reserve(1, 1);
    if (refused !== undefined) return failure(refused);
    const finish = scopeLifetime(this).begin();
    try {
      return { status: 'COMPLETE', value: await action() };
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
    if (!scopeLifetime(this).isOpen()) return failure('WORKFLOW_SCOPE_CLOSED');
    const refused = this.budget.reserve(1, 1);
    if (refused !== undefined) return failure(refused);
    const finish = scopeLifetime(this).begin();
    try {
      return await action();
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
    if (!scopeLifetime(this).isOpen()) return failure('WORKFLOW_SCOPE_CLOSED');
    // 不可信数值只验证当前 Workflow 的业务参数，不复查 Package 结构。
    if (!validLimit(maxDescendantDepth)) return failure('WORKFLOW_INVALID_LIMIT');
    const nextDepth = this.depth + 1;
    if (this.ancestors.some((item) => nextDepth - item.depth > item.descendants)) {
      return failure('WORKFLOW_DEPTH_LIMIT');
    }
    const refused = this.budget.reserve(0, 1);
    if (refused !== undefined) return failure(refused);
    const finish = scopeLifetime(this).begin();
    const lifetime = new ScopeLifetime(scopeLifetime(this));
    const child = new NativeWorkflowContext(this.budget, [
      ...this.ancestors, { depth: nextDepth, descendants: maxDescendantDepth },
    ], nextDepth);
    scopeLifetimes.set(child, lifetime);
    let result: Result<T>;
    try {
      result = await action(child);
    } catch {
      result = failure('WORKFLOW_EXECUTION_FAILED');
    }
    try {
      return afterJoin(result, await lifetime.close());
    } finally {
      finish();
    }
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
    if (!scopeLifetime(this).isOpen()) return failure('WORKFLOW_SCOPE_CLOSED');
    // 预算与执行必须使用同一组已接纳的回调；调用方可能持有可变别名。
    const { start, run, end } = options;
    const calls = 1 + Number(start !== undefined) + Number(end !== undefined);
    const refused = this.budget.reserve(calls, calls);
    if (refused !== undefined) return failure(refused);
    const finish = scopeLifetime(this).begin();

    let result: Result<T> | undefined;
    try {
      if (start !== undefined) await start.call(options);
      result = scopeLifetime(this).isOpen()
        ? await run.call(options)
        : failure('WORKFLOW_SCOPE_CLOSED');
    } catch {
      result = failure('WORKFLOW_EXECUTION_FAILED');
    } finally {
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
    return result ?? failure('WORKFLOW_EXECUTION_FAILED');
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

  constructor(limits: WorkflowLimits) {
    // 同一时点读取不可变快照；验证、余额和祖先深度必须使用同一份值。
    // 不能信任调用方后续对原始 limits 对象的修改。
    this.limits = {
      maxCalls: limits.maxCalls,
      maxSteps: limits.maxSteps,
      maxDepth: limits.maxDepth,
    };
    this.budget = new RootBudget(this.limits);
  }

  public async run<T>(action: WorkflowHandler<T>): Promise<Result<T>> {
    if (this.started) return failure('WORKFLOW_ALREADY_RUN');
    this.started = true;
    if (![this.limits.maxCalls, this.limits.maxSteps, this.limits.maxDepth]
      .every(validLimit)) {
      return failure('WORKFLOW_INVALID_LIMIT');
    }
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
