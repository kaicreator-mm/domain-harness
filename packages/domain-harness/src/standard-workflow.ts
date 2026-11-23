import { createActor, toPromise } from 'xstate';
import type { AnyActorLogic } from 'xstate';

/** 业务工作流的显式结果；未完成状态不得被解释为成功。 */
export type StandardWorkflowOutcome<Output> =
  | { readonly status: 'COMPLETE'; readonly value: Output }
  | {
    readonly status: 'REJECT' | 'ASK' | 'WAIT' | 'UNKNOWN' | 'FAILED';
    readonly reason: { readonly code: string; readonly message: string };
  };

/** Domain App 层面的可复用 Workflow Element 基础接口。 */
export abstract class WorkflowElement<Input, Output> {
  abstract run(input: Input): Promise<StandardWorkflowOutcome<Output>>;
}

/**
 * SDK 内置的 XState 标准 Workflow Element。
 * 业务提供 XState 逻辑/定义以及输出到领域结果的映射；KDP 不拥有引擎。
 */
export class XStateWorkflowElement<Input, Output> extends WorkflowElement<Input, Output> {
  constructor(
    private readonly logic: AnyActorLogic,
    private readonly mapOutput: (output: unknown) => StandardWorkflowOutcome<Output>,
  ) {
    super();
  }

  public async run(input: Input): Promise<StandardWorkflowOutcome<Output>> {
    // 标准能力直接使用 XState Actor；不借道 Kernel FunctionRef/Target。
    const actor = createActor(this.logic, { input });
    try {
      actor.start();
      return this.mapOutput(await toPromise(actor));
    } catch {
      // Actor 失败是本次 Workflow 的失败结果；不把它改写为 COMPLETE。
      return {
        status: 'FAILED',
        reason: { code: 'DH_WORKFLOW_EXECUTION_FAILED', message: 'Workflow execution failed' },
      };
    } finally {
      actor.stop();
    }
  }
}
