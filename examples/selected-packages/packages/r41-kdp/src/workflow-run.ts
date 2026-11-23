/** 使用真实 XState Promise Actor 承载根 WorkflowRun 与受控子 Workflow。 */
import { createActor, fromPromise, waitFor } from 'xstate';
import type {
  JsonValue,
  WorkflowDefinition,
  WorkflowOutcome,
  WorkflowRef,
} from '@kaicreator/domain-harness-contracts';
import {
  executeDefinition,
  type RunBudget,
  type SelectedWorkflowDriver,
  type WorkflowChildRunner,
} from './workflow-execution.js';

interface ActorRunInput {
  readonly ref: WorkflowRef;
  readonly input: JsonValue;
  readonly driver: SelectedWorkflowDriver;
  readonly budget: RunBudget;
  readonly ancestors: readonly WorkflowDefinition[];
  readonly activeRefs: readonly string[];
}

async function startActor(run: ActorRunInput): Promise<WorkflowOutcome> {
  // 每次调用都创建独立 PromiseActorLogic/Actor；预算对象只按引用共享给受控子 Actor。
  const logic = fromPromise<WorkflowOutcome, ActorRunInput>(async ({ input }) => {
    const runChild: WorkflowChildRunner = (ref, value, driver, budget, ancestors, activeRefs) =>
      startActor({ ref, input: value, driver, budget, ancestors, activeRefs });
    return executeDefinition(
      input.ref,
      input.input,
      input.driver,
      input.budget,
      input.ancestors,
      input.activeRefs,
      runChild,
    );
  });
  const actor = createActor(logic, { input: run });
  actor.start();
  try {
    const snapshot = await waitFor(actor, (current) =>
      current.status === 'done' || current.status === 'error');
    if (snapshot.status === 'error') throw snapshot.error;
    if (snapshot.output === undefined) throw new Error('DH_WORKFLOW_ACTOR_OUTPUT_MISSING');
    return snapshot.output;
  } finally {
    actor.stop();
  }
}

/** 根 WorkflowRun 创建一次根 Actor；其 maxElementCalls 是唯一共享根预算。 */
export async function startWorkflowRun(
  rootRef: WorkflowRef,
  input: JsonValue,
  driver: SelectedWorkflowDriver,
): Promise<WorkflowOutcome> {
  const root = driver.select(rootRef);
  if (!root) {
    return { status: 'FAILED', reason: {
      code: 'DH_WORKFLOW_UNSELECTED', message: 'WorkflowRef not selected in sealed Lock',
    } };
  }
  const budget: RunBudget = {
    remainingCalls: root.definition.maxElementCalls,
    remainingSteps: Math.min(100000, root.definition.maxElementCalls * 16),
  };
  return startActor({ ref: rootRef, input, driver, budget, ancestors: [], activeRefs: [] });
}
