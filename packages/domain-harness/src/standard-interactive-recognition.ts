import type { InteractionDecision, InteractionElement, InteractionEvent, InteractionScope } from './standard-interaction.js';
import type { NativeWorkflowContext, WorkflowLimits } from './native-workflow-composition.js';
import type { StandardWorkflowOutcome } from './standard-workflow.js';

type Outcome<T> = StandardWorkflowOutcome<T>;
type Maybe<T> = T | Promise<T>;

/** 同根识别兼分析、必要澄清、处理；复杂业务仍可直接组合原 InteractionScope。 */
export function runInteractiveRecognitionHandling<S, I, O>(interaction: InteractionElement, limits: WorkflowLimits, initial: S,
  decide: (state: Readonly<S>, event: InteractionEvent, root: NativeWorkflowContext) => Maybe<Outcome<InteractionDecision<S, I>>>,
  handle: (intent: I, scope: InteractionScope) => Maybe<Outcome<O>>): Promise<Outcome<O>> {
  return interaction.run(limits, async scope => {
    const recognized = await scope.resolve(initial, decide);
    if (recognized.status !== 'COMPLETE') return recognized;
    // 已进入处理的结果原样返回；再次澄清由领域在同 scope 的明确 checkpoint 组织。
    return scope.step(() => handle(recognized.value, scope));
  });
}
