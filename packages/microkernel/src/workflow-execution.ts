/**
 * v0.11.1 T13: pure, bounded Workflow node semantics shared by the KDP actor boundary.
 *
 * This is NOT a replacement for XState v5 actor lifecycle. The first-party XState
 * wrapper must own each WorkflowRun/child actor and drive this verified step logic.
 * It never discovers Function, Workflow or Resource beyond BUILD-selected Lock data.
 */
import {
  canonicalJson,
  childWorkflowRouteLabel,
  functionOutcomeRouteLabel,
  hasWorkflowCallBudget,
  selectWorkflowTarget,
  withinWorkflowAncestorDepth,
} from '@kaicreator/domain-harness-contracts';
import type {
  FunctionOutcome,
  FunctionRef,
  JsonValue,
  ResourceRef,
  SelectedWorkflow,
  WorkflowDefinition,
  WorkflowFunctionNode,
  WorkflowOutcome,
  WorkflowRef,
  WorkflowTerminal,
} from '@kaicreator/domain-harness-contracts';

export interface SelectedWorkflowDriver {
  /** Caller authorization is already sealed in the sole BUILD Lock. */
  select(ref: WorkflowRef): SelectedWorkflow | undefined;
  /** Reuses KDP's existing selected Function Schema/Outcome guard. */
  invoke(ref: FunctionRef, input: JsonValue): Promise<FunctionOutcome>;
  /** Reads an exact digest-verified ResourceRef, never an arbitrary path. */
  read(ref: ResourceRef): Promise<Uint8Array>;
}

interface RunBudget {
  remainingCalls: number;
  remainingSteps: number;
}

function failed(code: string, message: string): WorkflowOutcome {
  return { status: 'FAILED', reason: { code, message } };
}

function reasonOf(outcome: FunctionOutcome): { code: string; message: string } {
  if (outcome.kind === 'UNKNOWN') return outcome.unknownReason;
  if (outcome.kind === 'FAILED') return outcome.failure;
  return { code: 'DH_WORKFLOW_TERMINAL', message: 'business terminal' };
}

function terminal(
  kind: WorkflowTerminal,
  current: JsonValue,
  original: WorkflowOutcome | FunctionOutcome,
): WorkflowOutcome {
  if (kind === 'COMPLETE') return { status: 'COMPLETE', value: current };
  if ('status' in original && original.status === kind && original.status !== 'COMPLETE') {
    return original;
  }
  if ('kind' in original && original.kind === kind && original.kind !== 'SUCCEEDED') {
    return { status: kind, reason: reasonOf(original) };
  }
  return { status: kind, reason: { code: 'DH_WORKFLOW_TERMINAL', message: 'explicit business terminal' } };
}

function callBudgetFailure(): WorkflowOutcome {
  return failed('DH_WORKFLOW_CALL_BUDGET', 'root WorkflowRun has no remaining reserved Function calls');
}

function selectedKey(ref: WorkflowRef): string {
  return canonicalJson(ref as unknown as JsonValue);
}

async function prepareDataInput(
  node: WorkflowFunctionNode,
  input: JsonValue,
  driver: SelectedWorkflowDriver,
): Promise<JsonValue> {
  if (!node.data) return input;
  const bytes = await driver.read(node.data.resource);
  if (bytes.byteLength > node.data.maxBytes) {
    throw new Error('DH_WORKFLOW_READER_SIZE_LIMIT');
  }
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return { format: node.data.format, source };
}

/** Call once per real Function invocation; reservation must have succeeded first. */
async function invoke(
  driver: SelectedWorkflowDriver,
  budget: RunBudget,
  ref: FunctionRef,
  input: JsonValue,
): Promise<FunctionOutcome> {
  if (budget.remainingCalls <= 0) {
    return { kind: 'FAILED', failure: {
      code: 'DH_WORKFLOW_CALL_BUDGET', message: 'root Function call budget exhausted',
    } };
  }
  budget.remainingCalls -= 1;
  return driver.invoke(ref, input);
}

/**
 * Invokes start → leaf → end. Once start is attempted end is always attempted
 * exactly once, including start/leaf UNKNOWN, FAILED and thrown fatal errors.
 * An unhandled fatal is rethrown for KDP's sole Exit fallback after end attempt.
 */
async function invokeLeaf(
  node: WorkflowFunctionNode,
  input: JsonValue,
  driver: SelectedWorkflowDriver,
  budget: RunBudget,
): Promise<FunctionOutcome> {
  if (!hasWorkflowCallBudget(budget.remainingCalls, node)) {
    return { kind: 'FAILED', failure: {
      code: 'DH_WORKFLOW_CALL_BUDGET', message: 'insufficient budget before any leaf side effect',
    } };
  }
  // The whole leaf is reserved logically; debit only Functions actually invoked.
  let outcome: FunctionOutcome = { kind: 'FAILED', failure: {
    code: 'DH_WORKFLOW_NO_FUNCTION', message: 'selected leaf did not execute',
  } };
  let began = false;
  let fatal: unknown;
  try {
    if (node.hooks?.start) {
      began = true;
      const start = await invoke(driver, budget, node.hooks.start, input);
      if (start.kind !== 'SUCCEEDED') {
        outcome = start;
      } else {
        outcome = await invoke(driver, budget, node.function, await prepareDataInput(node, input, driver));
      }
    } else {
      outcome = await invoke(driver, budget, node.function, await prepareDataInput(node, input, driver));
    }
  } catch (error) {
    fatal = error;
  } finally {
    if (node.hooks?.end && (began || !node.hooks.start)) {
      try {
        const end = await invoke(driver, budget, node.hooks.end, input);
        if (end.kind !== 'SUCCEEDED' && outcome.kind !== 'FAILED' && fatal === undefined) {
          outcome = end;
        }
      } catch (error) {
        if (fatal === undefined) fatal = error;
      }
    }
  }
  if (fatal !== undefined) throw fatal;
  return outcome;
}

/**
 * Deterministic selected-graph runner. XState v5's promise actor will call this
 * for a root; child calls must be wrapped by the actor adapter (not by a new
 * Package loader). The shared budget is passed unchanged through all children.
 */
export async function executeSelectedWorkflow(
  rootRef: WorkflowRef,
  input: JsonValue,
  driver: SelectedWorkflowDriver,
): Promise<WorkflowOutcome> {
  const root = driver.select(rootRef);
  if (!root) return failed('DH_WORKFLOW_UNSELECTED', 'WorkflowRef not selected in sealed Lock');
  const budget: RunBudget = {
    remainingCalls: root.definition.maxElementCalls,
    remainingSteps: Math.min(100000, root.definition.maxElementCalls * 16),
  };
  return executeDefinition(rootRef, input, driver, budget, [], []);
}

async function executeDefinition(
  ref: WorkflowRef,
  input: JsonValue,
  driver: SelectedWorkflowDriver,
  budget: RunBudget,
  ancestors: readonly WorkflowDefinition[],
  activeRefs: readonly string[],
): Promise<WorkflowOutcome> {
  const entry = driver.select(ref);
  if (!entry) return failed('DH_WORKFLOW_UNSELECTED', 'child Workflow was not selected at BUILD');
  const key = selectedKey(ref);
  if (activeRefs.includes(key)) {
    return failed('DH_WORKFLOW_RECURSIVE', 'Workflow recursively references an active ancestor');
  }
  const chain = [...ancestors, entry.definition];
  if (!withinWorkflowAncestorDepth(chain)) {
    return failed('DH_WORKFLOW_DEPTH_LIMIT', 'per-Workflow descendant depth exceeded');
  }
  const nodes = new Map(entry.definition.nodes.map(node => [node.id, node] as const));
  let current = entry.definition.entryNodeId;
  let value: JsonValue = input;
  while (true) {
    budget.remainingSteps -= 1;
    if (budget.remainingSteps < 0) {
      return failed('DH_WORKFLOW_STEP_LIMIT', 'root WorkflowRun node transition limit reached');
    }
    const node = nodes.get(current);
    if (!node) return failed('DH_WORKFLOW_NODE_UNSELECTED', 'selected graph missing a node');
    let result: WorkflowOutcome | FunctionOutcome;
    if (node.kind === 'workflow') {
      result = await executeDefinition(node.workflow, value, driver, budget, chain, [...activeRefs, key]);
    } else {
      result = await invokeLeaf(node, value, driver, budget);
    }
    const label = 'kind' in result ? functionOutcomeRouteLabel(result) : childWorkflowRouteLabel(result);
    const target = selectWorkflowTarget(node.switch.exits, label);
    if (target === null) {
      if ('kind' in result && result.kind === 'UNKNOWN') {
        return { status: 'UNKNOWN', reason: result.unknownReason };
      }
      if ('kind' in result && result.kind === 'FAILED') {
        return { status: 'FAILED', reason: result.failure };
      }
      if ('status' in result && result.status !== 'COMPLETE') return result;
      return failed('DH_WORKFLOW_ROUTE_UNMATCHED', 'no unique declared Switch exit for result');
    }
    const newValue = 'kind' in result
      ? result.kind === 'SUCCEEDED' ? result.value : value
      : result.status === 'COMPLETE' ? result.value : value;
    if ('nodeId' in target) {
      current = target.nodeId;
      value = newValue;
      continue;
    }
    // Reinforce T11's BUILD-time non-success→COMPLETE rejection at runtime.
    if (target.terminal === 'COMPLETE' && ('kind' in result
      ? result.kind !== 'SUCCEEDED' : result.status !== 'COMPLETE')) {
      return failed('DH_WORKFLOW_INVALID_SUCCESS', 'non-success cannot become COMPLETE');
    }
    return terminal(target.terminal, newValue, result);
  }
}
