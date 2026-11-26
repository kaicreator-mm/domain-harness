import { createActor } from 'xstate';
import { types } from 'node:util';
import { randomUUID } from 'node:crypto';
import { borrowActorScope } from './native-workflow-composition.js';
import type { AttachedActorScope, NativeWorkflowContext } from './native-workflow-composition.js';
import type { WorkflowActorOptions } from './workflow-managed-contract.js';
import type { AnyActorLogic, InputFrom, OutputFrom, SnapshotFrom } from 'xstate';

/** 明确区分业务完成与非成功终态，禁止把 stopped/未知误报为成功。
 * @dhKind type
 * @dhCapability workflow
 */
export type StandardWorkflowOutcome<Output> =
  | { readonly status: 'COMPLETE'; readonly value: Output }
  | {
    readonly status: 'REJECT' | 'ASK' | 'WAIT' | 'UNKNOWN' | 'FAILED';
    readonly reason: { readonly code: string; readonly message: string };
  };

/** 应用级可复用 Workflow Element，不要求 KDP 充当工作流执行中心。
 * @dhKind abstract-contract
 * @dhCapability workflow
 */
export abstract class WorkflowElement<Input, Output> {
  abstract run(input: Input): Promise<StandardWorkflowOutcome<Output>>;
}

/**
 * XState v5 标准 Workflow Element。
 * 从真实 actor logic 派生 Input 与已完成 Output 类型，防止弱化 TS 类型检查。

 * @dhKind standard-element
 * @dhCapability workflow
 */
export class XStateWorkflowElement<
  Logic extends AnyActorLogic,
  Output,
> extends WorkflowElement<InputFrom<Logic>, Output> {
  private readonly definitionId = randomUUID();

  constructor(
    private readonly logic: Logic,
    private readonly mapOutput: (output: OutputFrom<Logic>) => StandardWorkflowOutcome<Output>,
  ) {
    super();
  }

  private failed(code: 'WORKFLOW_EXECUTION_FAILED' | 'WORKFLOW_STOPPED'):
    StandardWorkflowOutcome<Output> {
    return {
      status: 'FAILED',
      reason: {
        code,
        message: code === 'WORKFLOW_STOPPED'
          ? 'Workflow stopped before completion'
          : 'Workflow execution failed',
      },
    };
  }

  public run(input: InputFrom<Logic>): Promise<StandardWorkflowOutcome<Output>> {
    return this.runActor(input);
  }

  /** 使用既有根任务的借用作用域及实际 actor 快照，不新建 Session。 */
  public runIn(input: (scope: NativeWorkflowContext) => InputFrom<Logic>, root: NativeWorkflowContext,
    options: WorkflowActorOptions<SnapshotFrom<Logic>>): Promise<StandardWorkflowOutcome<Output>> {
    if (!options || typeof input !== 'function' || typeof options.project !== 'function'
      || types.isAsyncFunction(input) || types.isAsyncFunction(options.project)) {
      return Promise.resolve(this.failed('WORKFLOW_EXECUTION_FAILED'));
    }
    const { project, maxProjections } = options;
    return borrowActorScope(root, maxProjections, (scope, attached) => {
      const actualInput = attached.input(() => input(scope));
      return this.runActor(actualInput, attached, project);
    });
  }

  private runActor(input: InputFrom<Logic>, attached?: AttachedActorScope,
    project?: WorkflowActorOptions<SnapshotFrom<Logic>>['project']): Promise<StandardWorkflowOutcome<Output>> {
    try {
      const actor = createActor(this.logic, { input });
      return new Promise<StandardWorkflowOutcome<Output>>((resolve) => {
        let settled = false;
        let subscription: { unsubscribe(): void } | undefined;
        let lastSnapshot: unknown;
        let hasSnapshot = false;
        const aborted = () => { finish(this.failed('WORKFLOW_STOPPED')); };

        // 仅结算一次；清理行为不能在错误之后再次把结果改写为 COMPLETE。
        const finish = (result: StandardWorkflowOutcome<Output>): void => {
          if (settled) return;
          settled = true;
          attached?.signal.removeEventListener('abort', aborted);
          attached?.stop(result.status !== 'COMPLETE');
          subscription?.unsubscribe();
          try {
            actor.stop();
          } catch {
            // 受控成功不能掩盖 stop 故障；旧非成功终态保持。
            if (attached && result.status === 'COMPLETE') result = this.failed('WORKFLOW_EXECUTION_FAILED');
          }
          resolve(result);
        };

        const observe = (snapshot: unknown): void => {
          if (settled || typeof snapshot !== 'object' || snapshot === null) return;
          // 实际同一快照只投影一次；订阅与终态回读不重复计费。
          if (attached && project) {
            if (hasSnapshot && snapshot === lastSnapshot) return;
            hasSnapshot = true;
            lastSnapshot = snapshot;
            if (!attached.project(this.definitionId, () => project(snapshot as SnapshotFrom<Logic>))) {
              finish(this.failed('WORKFLOW_EXECUTION_FAILED'));
              return;
            }
          }
          // XState 允许多种 Actor Logic；只有确认真实终态才解释 output。
          const observed = snapshot as { readonly status?: unknown; readonly output?: unknown };
          if (observed.status === 'done') {
            try {
              // mapper 合同为同步；不启动已声明 async 的 mapper，也不采用异步结果。
              if (types.isAsyncFunction(this.mapOutput)) {
                finish(this.failed('WORKFLOW_EXECUTION_FAILED'));
                return;
              }
              const mapped = attached ? attached.map(() => this.mapOutput(observed.output as OutputFrom<Logic>))
                : this.mapOutput(observed.output as OutputFrom<Logic>);
              if (types.isPromise(mapped)) {
                void Promise.prototype.then.call(mapped, undefined, () => undefined);
                finish(this.failed('WORKFLOW_EXECUTION_FAILED'));
                return;
              }
              finish(mapped);
            } catch {
              finish(this.failed('WORKFLOW_EXECUTION_FAILED'));
            }
          } else if (observed.status === 'error') {
            finish(this.failed('WORKFLOW_EXECUTION_FAILED'));
          } else if (observed.status === 'stopped') {
            finish(this.failed('WORKFLOW_STOPPED'));
          }
        };

        // 先订阅再 start，捕获初始 entry 同步失败与同步 self.stop。
        try {
          if (attached?.signal.aborted) { aborted(); return; }
          attached?.signal.addEventListener('abort', aborted, { once: true });
          subscription = actor.subscribe({
            next: (snapshot) => { observe(snapshot); },
            error: () => { finish(this.failed('WORKFLOW_EXECUTION_FAILED')); },
            complete: () => {
              // XState 的 complete 同时代表 done 和主动 stop，必须看快照。
              observe(actor.getSnapshot());
              if (!settled) finish(this.failed('WORKFLOW_STOPPED'));
            },
          });
          if (settled) { subscription.unsubscribe(); return; }
          actor.start();
          observe(actor.getSnapshot());
        } catch {
          finish(this.failed('WORKFLOW_EXECUTION_FAILED'));
        }
      });
    } catch {
      return Promise.resolve(this.failed('WORKFLOW_EXECUTION_FAILED'));
    }
  }
}
