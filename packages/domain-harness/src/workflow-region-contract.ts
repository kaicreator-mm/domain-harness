import type { StandardJsonValue as J } from './standard-files.js';
import type { StandardWorkflowOutcome as Outcome } from './standard-workflow.js';
import type { NativeWorkflowContext } from './native-workflow-composition.js';
import type { EvidenceDependency, EvidenceObservation, EvidenceRequirement } from './standard-evidence.js';
import type { WorkflowContextView, WorkflowKnowledgePolicy, WorkflowNode } from './workflow-managed-contract.js';
import type { WorkflowSlot, WorkflowSlotReader, WorkflowSlotWriter } from './workflow-slots.js';

type Maybe<T> = T | Promise<T>;

/** 具名输入的有限提案引用，不携带原生值或私有 token。
 * @dhKind type
 * @dhCapability workflow
 */
export type WorkflowSlotBinding =
  | Readonly<{ kind: 'literal'; value: J }>
  | Readonly<{ kind: 'context'; slot: string }>
  | Readonly<{ kind: 'result'; node: string; slot: string }>;

/** 运行期节点提案；接纳之前没有执行权限。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowNodeProposal {
  readonly alias: string; readonly capability: string;
  readonly input: Readonly<Record<string, WorkflowSlotBinding>>;
  readonly initial?: readonly WorkflowNodeProposal[];
}

/** 有限区域编辑候选，不直接改写实际流程。
 * @dhKind type
 * @dhCapability workflow
 */
export type WorkflowEdit =
  | Readonly<{ kind: 'insert'; gap: string; before?: string; node: WorkflowNodeProposal }>
  | Readonly<{ kind: 'reuse'; gap: string; before?: string; template: string; alias: string }>
  | Readonly<{ kind: 'skip' | 'remove'; node: string }>
  | Readonly<{ kind: 'move'; node: string; before?: string }>
  | Readonly<{ kind: 'rebind'; node: string; input: string; to: WorkflowSlotBinding }>;

/** 与实际运行、区域及事实版本关联的编辑批次。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowRegionProposal {
  readonly runId: string; readonly regionId: string; readonly planRevision: number; readonly factRevision: number;
  readonly edits: readonly WorkflowEdit[]; readonly action: 'continue' | 'finish' | 'clarify' | 'stop';
}

/** 单区域在祖先与根约束内的有限结构和扫描上限。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowRegionLimits {
  readonly maxWork: number; readonly maxDescendantDepth: number; readonly maxCandidateBytes: number;
  readonly maxJsonDepth: number; readonly maxJsonItems: number; readonly maxNodes: number;
  readonly maxBindings: number; readonly maxEdits: number; readonly maxProjectionBytes: number;
}

/** 当前区域已允许的名称、实际结果与有限借用读取器。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowRegionView extends WorkflowContextView {
  readonly regionId: string;
  readonly slots: readonly string[];
  readonly results: readonly Readonly<{ node: string; slots: readonly string[] }>[];
  readonly reader: WorkflowSlotReader;
}

/** 原生领域 Function 的输入装配、受控节点及输出编码。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowFunctionBinding<I, O> {
  readonly id: string; readonly description: string;
  readonly inputs: Readonly<Record<string, WorkflowSlot<unknown>>>;
  readonly outputs: Readonly<Record<string, WorkflowSlot<unknown>>>;
  readonly input: (reader: WorkflowSlotReader) => Outcome<I>;
  readonly node: WorkflowNode<I, O>;
  readonly output: (value: O, writer: WorkflowSlotWriter) => Outcome<void>;
  readonly model?: Readonly<{ schema: J; describe: string }>;
}

/** 工厂分配的能力身份；仅声明名称与种类，不暴露可执行回调。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowCapability { readonly id: string; readonly kind: 'function' | 'region' }

/** 区域声明合同；接纳、递归执行和事实失效由受控 Workflow 实施。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowRegionDefinition<I, O> {
  readonly id: string; readonly goal: string; readonly constraints: readonly string[];
  readonly limits: WorkflowRegionLimits; readonly capabilities: readonly WorkflowCapability[];
  readonly knowledge: WorkflowKnowledgePolicy; readonly current: () => boolean;
  readonly requiredKnowledge: readonly EvidenceRequirement<string>[];
  readonly optionalKnowledge: readonly EvidenceRequirement<string>[];
  readonly contextSlots: Readonly<Record<string, WorkflowSlot<unknown>>>;
  readonly layout: readonly (
    | Readonly<{ kind: 'anchor'; id: string; node: WorkflowNodeProposal }>
    | Readonly<{ kind: 'gap'; id: string; templates: readonly WorkflowNodeProposal[]; seed: readonly string[] }>
  )[];
  readonly refresh: (input: I, root: NativeWorkflowContext, previous: WorkflowRegionView | undefined,
    writer: WorkflowSlotWriter) => Maybe<Outcome<Readonly<{ changed: readonly string[];
      dependencies: readonly EvidenceDependency<string>[];
      observations: readonly EvidenceObservation<string, unknown>[];
      slotEvidence: Readonly<Record<string, readonly string[]>>;
    }>>>;
  readonly plan: (view: WorkflowRegionView, root: NativeWorkflowContext) => Maybe<Outcome<
    Readonly<{ source: 'native'; proposal: WorkflowRegionProposal }> |
    Readonly<{ source: 'model'; proposal: WorkflowRegionProposal; access: Readonly<{
      capabilities: readonly string[]; contextSlots: readonly string[];
      resultSlots: readonly Readonly<{ node: string; slot: string }>[];
    }> }>>>;
  readonly admit: (current: WorkflowRegionView, proposed: WorkflowRegionProposal) => Maybe<Outcome<void>>;
  readonly canSkip: (nodeId: string, view: WorkflowRegionView) => Maybe<Outcome<void>>;
  readonly canRebind: (nodeId: string, input: string, from: WorkflowSlotBinding, to: WorkflowSlotBinding,
    view: WorkflowRegionView) => Maybe<Outcome<void>>;
  readonly replay: 'never' | 'pure-read-only';
  readonly clarify?: (view: WorkflowRegionView, root: NativeWorkflowContext) => Maybe<Outcome<void>>;
  readonly complete: (view: WorkflowRegionView, root: NativeWorkflowContext) => Maybe<Outcome<O>>;
}
