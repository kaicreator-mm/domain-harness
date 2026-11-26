import { types } from 'node:util';
import { executeBoundNode, guardBoundFactory } from './native-workflow-composition.js';
import type { NativeWorkflowContext } from './native-workflow-composition.js';
import { managedFailure } from './workflow-managed-runtime.js';
import { slotDeclarations } from './workflow-slots.js';
import type { SlotEntry, SlotLeaseScope, SlotProvenance, WorkflowSlot } from './workflow-slots.js';
import type { WorkflowCapability, WorkflowFunctionBinding, WorkflowRegionDefinition, WorkflowNodeProposal } from './workflow-region-contract.js';
import type { WorkflowNode, WorkflowNodeOptions } from './workflow-managed-contract.js';
import type { StandardWorkflowOutcome as Outcome } from './standard-workflow.js';
import { safeDetail } from './workflow-managed-node.js';

type Names = Readonly<Record<string, WorkflowSlot<unknown>>>;
type RegionBinding<I, O> = Omit<WorkflowFunctionBinding<I, O>, 'node'> & Readonly<{
  node: Omit<WorkflowNode<I, O>, 'run'>;
  create: (input: I) => Outcome<WorkflowRegionDefinition<I, O>>;
}>;
type RegionRunner = <I, O>(root: NativeWorkflowContext, definition: WorkflowRegionDefinition<I, O>,
  input: I, initial?: readonly WorkflowNodeProposal[], proof?: (value: SlotProvenance) => void) => Promise<Outcome<O>>;
interface BoundInvocation {
  readonly root: NativeWorkflowContext;
  readonly leases: SlotLeaseScope;
  readonly inputs: ReadonlyMap<string, SlotEntry>;
  readonly maxBindings: number;
  readonly options: WorkflowNodeOptions;
  readonly runRegion?: RegionRunner;
  readonly initial?: readonly WorkflowNodeProposal[];
  readonly delegated?: readonly WorkflowCapability[];
  readonly delegatedCurrent?: () => boolean;
  readonly receiveProof?: (proof: SlotProvenance) => void;
  readonly occurrence?: Readonly<{ instanceId: string; attempt: number; planRevision: number }>;
}
interface CapabilityData {
  readonly inputs: Names; readonly outputs: Names;
  readonly model?: WorkflowFunctionBinding<unknown, unknown>['model'];
  readonly description: string;
  readonly replay: 'pure-read-only' | 'never';
  readonly invoke: (invocation: BoundInvocation) => Promise<Outcome<ReadonlyMap<string, SlotEntry>>>;
}
const capabilities = new WeakMap<WorkflowCapability, CapabilityData>();
const fail = <T>(code = 'WORKFLOW_BINDING_INVALID'): Outcome<T> => managedFailure(code);
const ok = <T>(value: T): Outcome<T> => ({ status: 'COMPLETE', value });
function array(value: unknown): boolean { return Array.isArray(value); }
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value) <= max;
}
function names(value: Names): Names {
  return Object.freeze(Object.fromEntries(slotDeclarations(value, 2048)));
}
function common<I, O>(binding: Omit<WorkflowFunctionBinding<I, O>, 'node'>) {
  if (!text(binding.id, 128) || binding.id.includes('/') || !text(binding.description, 65536)
    || typeof binding.input !== 'function' || types.isAsyncFunction(binding.input)
    || typeof binding.output !== 'function' || types.isAsyncFunction(binding.output)) throw Error('WORKFLOW_BINDING_INVALID');
  const model = binding.model === undefined ? undefined : Object.freeze({
    schema: safeDetail(binding.model.schema, 65536), describe: binding.model.describe,
  });
  if (model && !text(model.describe, 65536)) throw Error('WORKFLOW_BINDING_INVALID');
  return Object.freeze({ id: binding.id, description: binding.description, inputs: names(binding.inputs),
    outputs: names(binding.outputs), input: binding.input, output: binding.output, ...(model ? { model } : {}) });
}
function nodeSnapshot<I, O>(node: WorkflowNode<I, O>): WorkflowNode<I, O> {
  if (!node || !array(node.requiredKnowledge) || node.requiredKnowledge.length > 4096) throw Error('WORKFLOW_BINDING_INVALID');
  const requiredKnowledge = Object.freeze(node.requiredKnowledge.map(r =>
    Object.freeze({ key: r.key, accepts: Object.freeze([...r.accepts]) })));
  return Object.freeze({ ...node, requiredKnowledge });
}
function factory<I, O>(binding: ReturnType<typeof common<I, O>>, kind: WorkflowCapability['kind'],
  build: (invocation: BoundInvocation) => WorkflowNode<I, O>, replay: 'pure-read-only' | 'never'): WorkflowCapability {
  const capability: WorkflowCapability = Object.freeze({ id: binding.id, kind });
  const invoke: CapabilityData['invoke'] = async invocation => {
    const { root, leases, inputs, maxBindings, options } = invocation;
    let staged: ReadonlyMap<string, SlotEntry> | undefined;
    let childProof: SlotProvenance | undefined;
    try {
      const result = await executeBoundNode(root, build({ ...invocation, receiveProof: proof => { childProof = proof; } }), options, {
        maxBindings, child: kind === 'region', ...(invocation.occurrence === undefined ? {} : { occurrence: invocation.occurrence }),
        current: frame => leases.entriesCurrent(inputs, frame) && (staged === undefined || leases.entriesCurrent(staged, frame)),
        input: () => {
          // 每个声明输入必须存在；实际 token、值、来源在同一租约再次验证。
          const declared = slotDeclarations(binding.inputs, maxBindings);
          slotDeclarations(binding.outputs, maxBindings);
          if (inputs.size !== declared.size) return fail();
          for (const [name, token] of declared) if (inputs.get(name)?.slot !== token) return fail();
          return leases.read(binding.inputs, inputs, maxBindings, reader => {
            // 可信装配函数只允许消费已授权输入；遗漏输入仍由声明和来源检查拒绝。
            return binding.input(reader);
          }, true);
        },
        encode: (value, resolution) => {
          if (kind === 'region' && childProof === undefined) return fail('WORKFLOW_CHILD_PROVENANCE');
          const stage = leases.write(binding.outputs, maxBindings, writer => binding.output(value, writer), true);
          if (stage.status !== 'COMPLETE') return stage;
          const entries = leases.resultEntries(stage.value, inputs, resolution, childProof);
          if (entries.status !== 'COMPLETE') return entries;
          staged = entries.value;
          return ok(undefined);
        },
      });
      // 最终候选观察和当前性校验由已有节点 envelope 完成；非成功不泄漏暂存值。
      return result.status === 'COMPLETE' ? staged === undefined ? fail() : ok(staged) : result;
    } catch { return fail(); }
  };
  capabilities.set(capability, Object.freeze({ inputs: binding.inputs, outputs: binding.outputs,
    description: binding.description, replay, ...(binding.model === undefined ? {} : { model: binding.model }), invoke }));
  return capability;
}

/** 绑定已声明的原生 Function 与输入、输出类型；不执行、不授予区域权限。
 * @dhKind function
 * @dhCapability workflow
 */
export function bindWorkflowFunction<I, O>(binding: WorkflowFunctionBinding<I, O>): WorkflowCapability {
  const captured = common(binding), node = nodeSnapshot(binding.node);
  return factory(captured, 'function', () => node, node.replay ?? 'never');
}

/** 绑定可生成子区域的可信工厂；实际子流程使用同一个受控节点 envelope。
 * @dhKind function
 * @dhCapability workflow
 */
export function bindWorkflowRegion<I, O>(binding: RegionBinding<I, O>): WorkflowCapability {
  const captured = common(binding), create = binding.create;
  if (typeof create !== 'function' || types.isAsyncFunction(create)) throw Error('WORKFLOW_BINDING_INVALID');
  const envelope = nodeSnapshot<I, O>({ ...binding.node, run: () => fail() });
  return factory(captured, 'region', invocation => Object.freeze({ ...envelope,
    run: (input: I, root: NativeWorkflowContext): Promise<Outcome<O>> => {
      if (!invocation.runRegion || !invocation.delegated) return Promise.resolve(fail('WORKFLOW_REGION_REQUIRED'));
      const child = guardBoundFactory(root, () => create(input));
      if (child.status !== 'COMPLETE') return Promise.resolve(child);
      const definition = child.value;
      if (!definition || !array(definition.capabilities) || definition.capabilities.length > 2048
        || definition.capabilities.some(c => !capabilities.has(c) || !invocation.delegated!.includes(c))) {
        return Promise.resolve(fail('WORKFLOW_CAPABILITY_DENIED'));
      }
      // 当前批次只接纳共用可信事实/适用性策略的子区域；独立私有事实映射需额外证明，
      // 不能在父候选交付后凭旧的子结果冒充仍当前。
      if (definition.knowledge.current !== invocation.options.knowledge.current
        || definition.current !== invocation.delegatedCurrent) return Promise.resolve(fail('WORKFLOW_CHILD_FRAME_UNSUPPORTED'));
      return invocation.runRegion<I, O>(root, definition, input, invocation.initial, invocation.receiveProof);
    },
  }), 'never');
}

/** 内部接纳读取已分配身份；不是运行时全局按名称查找能力。 */
export function capabilityData(capability: WorkflowCapability): CapabilityData | undefined {
  return capabilities.get(capability);
}

/** 内部调用必须属于本区域明确允许的能力身份集合。 */
export function invokeCapability(capability: WorkflowCapability, allowed: readonly WorkflowCapability[],
  invocation: BoundInvocation): Promise<Outcome<ReadonlyMap<string, SlotEntry>>> {
  const data = capabilities.get(capability);
  if (!data || !allowed.includes(capability)) return Promise.resolve(fail('WORKFLOW_CAPABILITY_DENIED'));
  return data.invoke(invocation);
}
