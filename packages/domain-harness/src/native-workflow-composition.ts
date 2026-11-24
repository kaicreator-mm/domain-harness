import type { StandardWorkflowOutcome } from './standard-workflow.js';

/** 同一根 Workflow 的共享调用和步骤额度；不是 Package 的运行时安全验证。 */
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
  | 'WORKFLOW_INVALID_LIMIT';

function failure<T>(code: WorkflowFailureCode): Result<T> {
  return { status: 'FAILED', reason: { code, message: 'Workflow could not complete' } };
}

function validLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** 以普通 TypeScript 函数显式声明全部结果分支，无中央 FunctionRef/Target。 */
export type WorkflowRoutes<T, R> = Readonly<
  Record<Status, (outcome: Result<T>) => R | Promise<R>>
>;

export function routeWorkflowOutcome<T, R>(
  outcome: Result<T>, exits: WorkflowRoutes<T, R>,
): Promise<R> {
  return Promise.resolve().then(() => exits[outcome.status](outcome));
}

class RootBudget {
  public calls: number;
  public steps: number;

  constructor(limits: WorkflowLimits) {
    this.calls = limits.maxCalls;
    this.steps = limits.maxSteps;
  }

  /** 在执行任何业务副作用前同步预留，多个嵌套调用共享此对象。 */
  public reserve(calls: number, steps: number): WorkflowFailureCode | undefined {
    if (this.calls < calls) return 'WORKFLOW_CALL_BUDGET';
    if (this.steps < steps) return 'WORKFLOW_STEP_BUDGET';
    this.calls -= calls;
    this.steps -= steps;
    return undefined;
  }
}

interface AncestorLimit {
  readonly depth: number;
  readonly descendants: number;
}

/** Standard 层的执行上下文仅组合原生回调，不是动态任务图解释器。 */
export class NativeWorkflowContext {
  constructor(
    private readonly budget: RootBudget,
    private readonly ancestors: readonly AncestorLimit[],
    public readonly depth: number,
  ) {}

  /**
   * 仅处理普通值（包括 Reader 返回的普通数据对象）；任何返回的业务
   * Outcome 都会作为 value 被包装，不能用本方法传播业务 REJECT/UNKNOWN/FAILED。
   */
  public async invoke<T>(action: () => T | Promise<T>): Promise<Result<T>> {
    const refused = this.budget.reserve(1, 1);
    if (refused !== undefined) return failure(refused);
    try {
      return { status: 'COMPLETE', value: await action() };
    } catch {
      return failure('WORKFLOW_EXECUTION_FAILED');
    }
  }

  /**
   * 直接调用已经返回 WorkflowOutcome 的业务 Function，保留所有终态，
   * 同样在副作用前收取一次根调用/步骤预算；不把 FAILED 包成 COMPLETE。
   */
  public async invokeOutcome<T>(
    action: () => Result<T> | Promise<Result<T>>,
  ): Promise<Result<T>> {
    const refused = this.budget.reserve(1, 1);
    if (refused !== undefined) return failure(refused);
    try {
      return await action();
    } catch {
      return failure('WORKFLOW_EXECUTION_FAILED');
    }
  }

  /** 受祖先与自身约束的子 Workflow，额度不复制、不重置。 */
  public async child<T>(
    maxDescendantDepth: number,
    action: WorkflowHandler<T>,
  ): Promise<Result<T>> {
    // 不可信数值只验证当前 Workflow 的业务参数，不复查 Package 结构。
    if (!validLimit(maxDescendantDepth)) return failure('WORKFLOW_INVALID_LIMIT');
    const nextDepth = this.depth + 1;
    if (this.ancestors.some((item) => nextDepth - item.depth > item.descendants)) {
      return failure('WORKFLOW_DEPTH_LIMIT');
    }
    const refused = this.budget.reserve(0, 1);
    if (refused !== undefined) return failure(refused);
    const child = new NativeWorkflowContext(this.budget, [
      ...this.ancestors, { depth: nextDepth, descendants: maxDescendantDepth },
    ], nextDepth);
    try {
      return await action(child);
    } catch {
      return failure('WORKFLOW_EXECUTION_FAILED');
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
    const calls = 1 + Number(options.start !== undefined) + Number(options.end !== undefined);
    const refused = this.budget.reserve(calls, calls);
    if (refused !== undefined) return failure(refused);

    let result: Result<T> | undefined;
    try {
      if (options.start !== undefined) await options.start();
      result = await options.run();
    } catch {
      result = failure('WORKFLOW_EXECUTION_FAILED');
    } finally {
      // 进入 start / run 后总是等待 end；end 不是 Package Exit。
      if (options.end !== undefined) {
        try {
          await options.end();
        } catch {
          // 保留更早的非成功结果，成功结果不能掩盖 end 失败。
          if (result === undefined || result.status === 'COMPLETE') {
            result = failure('WORKFLOW_HOOK_END_FAILED');
          }
        }
      }
    }
    return result ?? failure('WORKFLOW_EXECUTION_FAILED');
  }
}

/** 每个业务根 Workflow 显式创建独立会话，内部不包含 KDP/Package Loader。 */
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
    const root = new NativeWorkflowContext(this.budget, [
      { depth: 0, descendants: this.limits.maxDepth },
    ], 0);
    try {
      return await action(root);
    } catch {
      return failure('WORKFLOW_EXECUTION_FAILED');
    }
  }
}

/**
 * 两个固定叶子角色的便捷组合：识别 COMPLETE 才进入处理，两个角色共享一根额度。
 * 各角色的输入、输出、领域规则与授权由调用方定义；复杂流程直接组合 Session/Context。
 * 完整成功路径需要 2 次调用、5 个步骤和 1 层深度；不是业务全量预算预检或等待恢复协议。
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
