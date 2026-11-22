/**
 * 有界 Workflow 节点语义，由唯一 KDP 的 XState Actor 边界复用。
 * 不在此处发现 Lock 之外的 Function、Workflow 或 Resource。
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
  /** 调用方授权已由唯一 BUILD Lock 封存。 */
  select(ref: WorkflowRef): SelectedWorkflow | undefined;
  /** 复用 KDP 已有的选定 Function Schema/Outcome 防线。 */
  invoke(ref: FunctionRef, input: JsonValue): Promise<FunctionOutcome>;
  /** 只读取摘要已验证的 ResourceRef，绝不接受任意路径。 */
  read(ref: ResourceRef): Promise<Uint8Array>;
}

export interface RunBudget {
  remainingCalls: number;
  remainingSteps: number;
}

export type WorkflowChildRunner = (
  ref: WorkflowRef,
  input: JsonValue,
  driver: SelectedWorkflowDriver,
  budget: RunBudget,
  ancestors: readonly WorkflowDefinition[],
  activeRefs: readonly string[],
) => Promise<WorkflowOutcome>;

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
  if ('status' in original && original.status === kind) {
    return original;
  }
  if ('kind' in original && original.kind === kind) {
    return { status: kind, reason: reasonOf(original) };
  }
  return { status: kind, reason: { code: 'DH_WORKFLOW_TERMINAL', message: 'explicit business terminal' } };
}

function selectedKey(ref: WorkflowRef): string {
  return canonicalJson(ref);
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
  // KDP 只负责已封存 ResourceRef 的真实字节、大小与严格 UTF-8；
  // 解析唯一归选中的 Standard Reader Element.Function，不再重复 JSON/YAML 业务解析。
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return { format: node.data.format, source };
}

/** 每次真实 Function 调用只扣一次预算，调用前必须已经完成整叶预留。 */
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
 * 调用 start → leaf → end。只要尝试过 start，就必须恰好尝试一次 end；
 * 包括 UNKNOWN、FAILED 和致命异常。未处理致命异常在 end 后继续交给唯一 KDP 退出兜底。
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
  // 逻辑上先预留整个叶节点，实际只扣除真正发生的 Function 调用。
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
  if (fatal !== undefined) {
    if (fatal instanceof Error) throw fatal;
    throw new Error('DH_WORKFLOW_FATAL');
  }
  return outcome;
}

/**
 * 纯语义入口用于对照测试；生产 Package.Init 走 startWorkflowRun 的真实 Actor。
 * 子 Workflow 可通过 runChild 交给独立 XState Actor，预算引用保持不变。
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

export async function executeDefinition(
  ref: WorkflowRef,
  input: JsonValue,
  driver: SelectedWorkflowDriver,
  budget: RunBudget,
  ancestors: readonly WorkflowDefinition[],
  activeRefs: readonly string[],
  runChild?: WorkflowChildRunner,
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
      result = runChild
        ? await runChild(node.workflow, value, driver, budget, chain, [...activeRefs, key])
        : await executeDefinition(node.workflow, value, driver, budget, chain, [...activeRefs, key]);
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
    // 在 Runtime 再次强化 T11 的非成功不得进入 COMPLETE 约束。
    if (target.terminal === 'COMPLETE' && ('kind' in result
      ? result.kind !== 'SUCCEEDED' : result.status !== 'COMPLETE')) {
      return failed('DH_WORKFLOW_INVALID_SUCCESS', 'non-success cannot become COMPLETE');
    }
    return terminal(target.terminal, newValue, result);
  }
}
