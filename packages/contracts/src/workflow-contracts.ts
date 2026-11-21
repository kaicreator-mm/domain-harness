/** v0.11.1：只描述 BUILD 已选的 Workflow 业务合同，不创建第二个 Element/Package Runtime。 */
import type { JsonValue } from './base.js';
import type { FunctionOutcome } from './app-contracts.js';
import type { ResourceRef } from './element-contracts.js';
import type { ElementRef, FunctionRef } from './refs.js';
import type { DH_WORKFLOW_SCHEMA_VERSION } from './schema-versions.js';

/** 一个 Element 可包含多个 Workflow 内容块，因此必须连同 ContentBlock.id 精确引用。 */
export interface WorkflowRef {
  readonly element: ElementRef;
  readonly contentId: string;
}

export type WorkflowTerminal = 'COMPLETE' | 'REJECT' | 'ASK' | 'WAIT' | 'UNKNOWN' | 'FAILED';
export const WORKFLOW_TERMINALS = [
  'COMPLETE', 'REJECT', 'ASK', 'WAIT', 'UNKNOWN', 'FAILED',
] as const satisfies readonly WorkflowTerminal[];

export interface WorkflowReason {
  readonly code: string;
  readonly message: string;
}

/** 本轮终态不等于 Business Core 的 AppStatus；ASK/WAIT 不承诺 0.11.6 Durable Resume。 */
export type WorkflowOutcome =
  | { readonly status: 'COMPLETE'; readonly value: JsonValue }
  | { readonly status: Exclude<WorkflowTerminal, 'COMPLETE'>; readonly reason: WorkflowReason };

/** Switch 用有序声明保存键以检测重复，路由本身不依赖排列优先级。 */
export type WorkflowTarget =
  | { readonly nodeId: string }
  | { readonly terminal: WorkflowTerminal };

export interface WorkflowExit {
  readonly label: string;
  readonly target: WorkflowTarget;
}

export interface WorkflowSwitch {
  readonly exits: readonly WorkflowExit[];
}

/** 只能读取 BUILD 封存的单份 UTF-8 数据资源。不得注入 Host path/fs/network。 */
export interface WorkflowDataSource {
  readonly format: 'json' | 'yaml';
  readonly resource: ResourceRef;
  readonly maxBytes: number;
}

export interface WorkflowElementHooks {
  readonly start?: FunctionRef;
  readonly end?: FunctionRef;
}

/** Reader 和 Guard 都是普通已选 Element.Function，不是另一种嵌套 Workflow。 */
export interface WorkflowFunctionNode {
  readonly id: string;
  readonly kind: 'function';
  readonly function: FunctionRef;
  readonly data?: WorkflowDataSource;
  readonly hooks?: WorkflowElementHooks;
  readonly switch: WorkflowSwitch;
}

/** 只有 Workflow 才能递归创建子 WorkflowRun；业务 leaf 不隐式派生 Actor。 */
export interface WorkflowChildNode {
  readonly id: string;
  readonly kind: 'workflow';
  readonly workflow: WorkflowRef;
  readonly switch: WorkflowSwitch;
}

export type WorkflowNode = WorkflowFunctionNode | WorkflowChildNode;

/**
 * 最大业务调用次数是每次根 WorkflowRun 唯一共享的预算；子 Workflow 作为
 * child 运行时仍消费根预算，其自身 maxElementCalls 仅在单独作为根运行时生效。
 * maxDescendantWorkflowDepth 每个 Workflow 独立限制其后代，进入子 Workflow
 * 之前须检查所有活动祖先（当前=0、直接子=1）。
 */
export interface WorkflowDefinition {
  readonly kind: 'Workflow';
  readonly schemaVersion: typeof DH_WORKFLOW_SCHEMA_VERSION;
  readonly id: string;
  readonly entryNodeId: string;
  readonly maxElementCalls: number;
  readonly maxDescendantWorkflowDepth: number;
  readonly nodes: readonly WorkflowNode[];
}

/**
 * Package.Init 可访问的 KDP 绑定启动能力：没有通用全局函数列表，也没有
 * 已废弃的 DomainApp.invoke。T13 将本字段装配到现有 PackageInitContext。
 * BUILD/T12 只允许 Package 自身或显式直接 Extension 授权的已选 WorkflowRef。
 */
export interface ReadonlyWorkflowStarter {
  start(ref: WorkflowRef, input: JsonValue): Promise<WorkflowOutcome>;
}

export interface WorkflowInitExtension {
  readonly workflows: ReadonlyWorkflowStarter;
}

/**
 * 结果选路只有一个出口：Function UNKNOWN/FAILED 按同名标签；SUCCEEDED 的
 * value.route 是明确的业务具名出口（缺失则 SUCCEEDED）。出现未声明 route
 * 不能静默回退为 SUCCEEDED。未找到出口时返回 null，T13 必须 fail closed。
 */
export function functionOutcomeRouteLabel(outcome: FunctionOutcome): string | null {
  if (outcome.kind !== 'SUCCEEDED') return outcome.kind;
  const value = outcome.value;
  if (value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, 'route')) {
    const label = value['route'];
    return typeof label === 'string' && label.length > 0 ? label : null;
  }
  return 'SUCCEEDED';
}

export function selectWorkflowTarget(
  exits: readonly WorkflowExit[],
  label: string | null,
): WorkflowTarget | null {
  if (label === null) return null;
  const matches = exits.filter((exit) => exit.label === label);
  return matches.length === 1 ? matches[0]!.target : null;
}

/** 子 Workflow 没有 FunctionOutcome.SUCCEEDED；只把其明确终态作为标签。 */
export function childWorkflowRouteLabel(outcome: WorkflowOutcome): WorkflowTerminal {
  return outcome.status;
}

/**
 * 在触发 start Hook 前预约整个 leaf 的最大必需调用数。
 * 一次 leaf Function 及可选 start/end 均计入根预算；预算不足不进入节点，
 * 因而不会消耗最后一格后让必需 end 无法清理。T13 不得再放宽此规则。
 */
export function requiredFunctionCallsForNode(node: WorkflowFunctionNode): number {
  return 1 + (node.hooks?.start ? 1 : 0) + (node.hooks?.end ? 1 : 0);
}

export function hasWorkflowCallBudget(
  remaining: number,
  node: WorkflowFunctionNode,
): boolean {
  return Number.isSafeInteger(remaining) && remaining >= requiredFunctionCallsForNode(node);
}

/** childDepth 是相对当前 active ancestor 的子 Workflow 深度，从 1 开始。 */
export function withinWorkflowAncestorDepth(
  ancestors: readonly { readonly maxDescendantWorkflowDepth: number }[],
): boolean {
  return ancestors.every((ancestor, index) =>
    ancestors.length - index - 1 <= ancestor.maxDescendantWorkflowDepth);
}
