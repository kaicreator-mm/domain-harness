import { createActor } from 'xstate';
import type { AnyActorLogic, InputFrom, OutputFrom } from 'xstate';

/** 明确区分业务完成与非成功终态，禁止把 stopped/未知误报为成功。 */
export type StandardWorkflowOutcome<Output> =
  | { readonly status: 'COMPLETE'; readonly value: Output }
  | {
    readonly status: 'REJECT' | 'ASK' | 'WAIT' | 'UNKNOWN' | 'FAILED';
    readonly reason: { readonly code: string; readonly message: string };
  };

/** 应用级可复用 Workflow Element，不要求 KDP 充当工作流执行中心。 */
export abstract class WorkflowElement<Input, Output> {
  abstract run(input: Input): Promise<StandardWorkflowOutcome<Output>>;
}

/**
 * XState v5 标准 Workflow Element。
 * 从真实 actor logic 派生 Input 与已完成 Output 类型，防止弱化 TS 类型检查。
 */
export class XStateWorkflowElement<
  Logic extends AnyActorLogic,
  Output,
> extends WorkflowElement<InputFrom<Logic>, Output> {
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
    try {
      const actor = createActor(this.logic, { input });
      return new Promise<StandardWorkflowOutcome<Output>>((resolve) => {
        let settled = false;
        let subscription: { unsubscribe(): void } | undefined;

        // 仅结算一次；清理行为不能在错误之后再次把结果改写为 COMPLETE。
        const finish = (result: StandardWorkflowOutcome<Output>): void => {
          if (settled) return;
          settled = true;
          subscription?.unsubscribe();
          try {
            actor.stop();
          } catch {
            // stop 故障不覆盖已观察的主终态；最终兜底只处理逃逸异常。
          }
          resolve(result);
        };

        const observe = (snapshot: unknown): void => {
          if (settled || typeof snapshot !== 'object' || snapshot === null) return;
          // XState 允许多种 Actor Logic；只有确认真实终态才解释 output。
          const observed = snapshot as { readonly status?: unknown; readonly output?: unknown };
          if (observed.status === 'done') {
            try {
              finish(this.mapOutput(observed.output as OutputFrom<Logic>));
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
          subscription = actor.subscribe({
            next: (snapshot) => { observe(snapshot); },
            error: () => { finish(this.failed('WORKFLOW_EXECUTION_FAILED')); },
            complete: () => {
              // XState 的 complete 同时代表 done 和主动 stop，必须看快照。
              observe(actor.getSnapshot());
              if (!settled) finish(this.failed('WORKFLOW_STOPPED'));
            },
          });
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
