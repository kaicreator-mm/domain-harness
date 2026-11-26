import { types } from 'node:util';
import { managedFailure, snapshotOutcome, valid } from './workflow-managed-runtime.js';
import type { WorkflowKnowledgeFrame, WorkflowKnowledgePolicy } from './workflow-managed-contract.js';
import type { EvidenceObservation, EvidenceResolution } from './standard-evidence.js';
import type { StandardWorkflowOutcome } from './standard-workflow.js';

type Outcome<T> = StandardWorkflowOutcome<T>;
const ok = <T>(value: T): Outcome<T> => ({ status: 'COMPLETE', value });
const fail = <T>(code = 'WORKFLOW_SLOT_INVALID'): Outcome<T> => managedFailure(code);
const issued = new WeakSet<object>();
const nameValid = (name: unknown): name is string =>
  typeof name === 'string' && name.trim().length > 0 && Buffer.byteLength(name) <= 128 && !name.includes('/');

function sync<T>(callback: () => T): T {
  if (types.isAsyncFunction(callback)) throw Error('WORKFLOW_SLOT_ASYNC');
  const value = callback();
  if (types.isPromise(value)) {
    void Promise.prototype.then.call(value, undefined, () => undefined);
    throw Error('WORKFLOW_SLOT_ASYNC');
  }
  return value;
}

/** 模块分配的原生值类型身份；同名不表示同一类型能力。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowSlot<T> {
  readonly id: string;
  readonly accepts: (value: unknown) => value is T;
}

/** 仅在本次同步输入/投影回调内借用的具名原生值读取器。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowSlotReader {
  read<T>(name: string, slot: WorkflowSlot<T>): Outcome<T>;
}

/** 仅在本次同步输出回调内借用的暂存写入器，不直接发布结果。
 * @dhKind type
 * @dhCapability workflow
 */
export interface WorkflowSlotWriter {
  put<T>(name: string, slot: WorkflowSlot<T>, value: NoInfer<T>): Outcome<void>;
}

/** 创建不可伪造身份的类型能力；守卫必须是可信同步判断。
 * @dhKind function
 * @dhCapability workflow
 */
export function createWorkflowSlot<T>(id: string, accepts: (value: unknown) => value is T): WorkflowSlot<T> {
  if (!nameValid(id) || typeof accepts !== 'function' || types.isAsyncFunction(accepts)) throw Error('WORKFLOW_SLOT_INVALID');
  const slot = Object.freeze({ id, accepts });
  issued.add(slot);
  return slot;
}

type Declarations = Readonly<Record<string, WorkflowSlot<unknown>>>;
export type SlotSource = EvidenceObservation<string, unknown>['source'];
type Source = SlotSource;
type Resolved = Extract<EvidenceResolution<string, unknown>, { complete: true }>;
interface NativeValue { readonly slot: WorkflowSlot<unknown>; readonly value: unknown }
/** 子区域的私有事实证明只在 SDK 内传递，不进入父区域的知识键或模型投影。 */
export interface DetachedRegionProof {
  readonly frame: WorkflowKnowledgeFrame;
  readonly knowledge: WorkflowKnowledgePolicy;
  readonly current: () => boolean;
  readonly sources: readonly Source[];
  readonly children: readonly DetachedRegionProof[];
  readonly replayable: boolean;
}
export interface SlotEntry extends NativeValue {
  readonly children?: readonly DetachedRegionProof[];
  readonly epoch: number;
  readonly scope: string;
  readonly evidenceKeys: readonly string[];
  readonly sources: readonly Source[];
}
export interface SlotStage<T> { readonly result: T }

export function slotDeclarations(input: Declarations, max: number, handles = false): Map<string, WorkflowSlot<unknown>> {
  if (!valid(max, 2048) || !input || types.isProxy(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input) as object | null)) throw Error('WORKFLOW_SLOT_INVALID');
  const out = new Map<string, WorkflowSlot<unknown>>();
  for (const key in input) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (out.size >= max || !((handles && key.split('/').length === 2 && key.split('/').every(nameValid)) || nameValid(key)) || !d || !('value' in d) || !issued.has(d.value as object)) throw Error('WORKFLOW_SLOT_INVALID');
    out.set(key, d.value as WorkflowSlot<unknown>);
  }
  return out;
}
function applicable(source: Source, frame: WorkflowKnowledgeFrame): boolean {
  const time = source.validity;
  return source.scope === frame.context.scope && frame.context.revisions.get(source.id) === source.revision
    && (time === undefined || (frame.context.asOf !== undefined && time.from <= frame.context.asOf && frame.context.asOf < time.until));
}
function sameFrame(a: WorkflowKnowledgeFrame, b: WorkflowKnowledgeFrame): boolean {
  return a.epoch === b.epoch && a.context.scope === b.context.scope && a.context.revisions.size === b.context.revisions.size
    && [...a.context.revisions].every(([id, revision]) => b.context.revisions.get(id) === revision);
}
function accepted<T>(slot: WorkflowSlot<T>, value: unknown): value is T {
  // 不使用类型断言代替守卫；只有明确 true 可接纳原生值。
  return sync(() => slot.accepts(value)) === true;
}

/** 每个实际区域独立持有的私有租约与记录身份。调用方在回调前预留已有
 * leaseScanWork，提供受控当前性策略；这里不另建 Session，也不发布全局存储。
 * 原生值由可信域保持不可变，SDK 只冻结记录与来源元数据。
 */
export class SlotLeaseScope {
  readonly #entries = new WeakSet<SlotEntry>();
  readonly #stages = new WeakMap<object, { readonly frame: WorkflowKnowledgeFrame; readonly values: ReadonlyMap<string, NativeValue> }>();
  #closed = false;
  #busy = false;
  #violated = false;

  constructor(private readonly current: () => WorkflowKnowledgeFrame | undefined) {}

  public close(): void { this.#closed = true; }

  private frame(): WorkflowKnowledgeFrame {
    const frame = sync(this.current);
    if (this.#closed || !frame || !valid(frame.epoch, Number.MAX_SAFE_INTEGER)
      || typeof frame.context.scope !== 'string' || frame.context.scope.length === 0 || frame.context.scope.length > 1024 || frame.context.revisions.size > 4096) throw Error('WORKFLOW_SLOT_CURRENTNESS');
    return { epoch: frame.epoch, context: { ...frame.context, revisions: new Map(frame.context.revisions) } };
  }

  private execute<T>(action: (frame: WorkflowKnowledgeFrame) => Outcome<T>): Outcome<T> {
    if (this.#busy) { this.#violated = true; return fail('WORKFLOW_SLOT_REENTRY'); }
    if (this.#closed) return fail('WORKFLOW_SLOT_CLOSED');
    this.#busy = true;
    this.#violated = false;
    try {
      const result = action(this.frame());
      return this.#violated || this.#closed ? fail('WORKFLOW_SLOT_CLOSED') : result;
    } catch { return fail(); }
    finally { this.#busy = false; }
  }

  private usable(entry: SlotEntry, slot: WorkflowSlot<unknown>, frame: WorkflowKnowledgeFrame): boolean {
    return this.#entries.has(entry) && entry.slot === slot && entry.epoch === frame.epoch
      && entry.scope === frame.context.scope && entry.sources.every(s => applicable(s, frame));
  }

  /** 使用节点刚捕获的可信 frame 检查实际输入/暂存结果，不触发用户回调。 */
  public entriesCurrent(entries: ReadonlyMap<string, SlotEntry>, frame: WorkflowKnowledgeFrame): boolean {
    if (this.#closed || entries.size > 2048) return false;
    let links = 0;
    const checked = new Set<readonly Source[]>();
    for (const entry of entries.values()) {
      if (!this.#entries.has(entry) || entry.epoch !== frame.epoch || entry.scope !== frame.context.scope) return false;
      if (checked.has(entry.sources)) continue;
      checked.add(entry.sources);
      for (const source of entry.sources) {
        if (++links > 16384 || !applicable(source, frame)) return false;
      }
    }
    return true;
  }

  /** 提案中的 JSON 字面量只能通过目标 token 守卫接纳，不取得来源权威。 */
  public literal(slot: WorkflowSlot<unknown>, value: unknown): Outcome<SlotEntry> {
    return this.execute(frame => {
      if (!issued.has(slot) || !accepted(slot, value) || !sameFrame(frame, this.frame())) return fail();
      const entry = Object.freeze({ slot, value, epoch: frame.epoch, scope: frame.context.scope,
        evidenceKeys: Object.freeze([]), sources: Object.freeze([]) });
      this.#entries.add(entry);
      return ok(entry);
    });
  }

  /** 只在可信刷新后把实际未受影响的旧记录重新绑定当前 frame，不重写历史。 */
  public retain(entries: ReadonlyMap<string, SlotEntry>, changed: ReadonlySet<string>): Outcome<ReadonlyMap<string, SlotEntry>> {
    return this.execute(frame => {
      const out = new Map<string, SlotEntry>();
      if (entries.size > 2048) return fail();
      for (const [name, entry] of entries) {
        if (!this.#entries.has(entry) || entry.scope !== frame.context.scope
          || entry.evidenceKeys.some(k => changed.has(k)) || entry.sources.some(s => !applicable(s, frame))) return fail();
        out.set(name, Object.freeze({ ...entry, epoch: frame.epoch }));
      }
      if (!sameFrame(frame, this.frame())) return fail();
      for (const entry of out.values()) this.#entries.add(entry);
      return ok(out);
    });
  }

  /** 区域视图借用只在同步前缀有效，与 refresh 的写租约并存。 */
  public viewLease(supplied: ReadonlyMap<string, SlotEntry>, maxBindings: number,
    guard: <T>(action: () => Outcome<T>) => Outcome<T>) {
    const frame = this.frame();
    if (!valid(maxBindings, 2048) || supplied.size > maxBindings) throw Error('WORKFLOW_SLOT_LIMIT');
    let open = true, failed = false, count = 0, checking = false;
    const reader: WorkflowSlotReader = Object.freeze({
      read: <T>(name: string, slot: WorkflowSlot<T>): Outcome<T> => {
        if (!open || this.#closed || checking || ++count > maxBindings) { failed = true; return fail('WORKFLOW_SLOT_CLOSED'); }
        checking = true;
        try {
          const value = guard(() => {
            const entry = supplied.get(name);
            if (!entry || !this.usable(entry, slot, frame) || !accepted(slot, entry.value)) return fail<T>();
            return ok(entry.value);
          });
          if (value.status !== 'COMPLETE') failed = true;
          return value;
        } catch { failed = true; return fail(); }
        finally { checking = false; }
      },
    });
    return { reader, close: () => { open = false; }, valid: () => !failed && !this.#closed && sameFrame(frame, this.frame()) };
  }

  /** 已声明名称与已接纳记录绑定；回调结束即关闭，失败不能被回调吞掉。 */
  public read<T>(declared: Declarations, supplied: ReadonlyMap<string, SlotEntry>, maxBindings: number,
    callback: (reader: WorkflowSlotReader) => Outcome<T>, requireAll = false, handles = false, late?: () => void): Outcome<T> {
    return this.execute(frame => {
      const names = slotDeclarations(declared, maxBindings, handles);
      let open = true, failed = false, count = 0, checking = false;
      const seen = new Set<SlotEntry>();
      const readNames = new Set<string>();
      const reader: WorkflowSlotReader = Object.freeze({
        read: <V>(name: string, slot: WorkflowSlot<V>): Outcome<V> => {
          if (!open || this.#closed) { late?.(); return fail('WORKFLOW_SLOT_CLOSED'); }
          if (checking || ++count > maxBindings) { failed = true; return fail('WORKFLOW_SLOT_LIMIT'); }
          checking = true;
          try {
            const entry = supplied.get(name);
            if (names.get(name) !== slot || !entry || !this.usable(entry, slot, frame) || !accepted(slot, entry.value)) {
              failed = true; return fail();
            }
            seen.add(entry); readNames.add(name);
            return ok(entry.value);
          } catch { failed = true; return fail(); }
          finally { checking = false; }
        },
      });
      let result: Outcome<T>;
      try {
        if (types.isAsyncFunction(callback)) return fail('WORKFLOW_SLOT_ASYNC');
        result = snapshotOutcome(sync(() => callback(reader)));
      } finally { open = false; }
      const fresh = this.frame();
      return failed || (requireAll && readNames.size !== names.size) || !sameFrame(frame, fresh) || [...seen].some(e => !this.usable(e, e.slot, fresh))
        ? fail('WORKFLOW_SLOT_CURRENTNESS') : result;
    });
  }

  /** 只暂存输出；每个声明名最多写入一次。失败或过期丢弃整批。 */
  public write<T>(declared: Declarations, maxBindings: number,
    callback: (writer: WorkflowSlotWriter) => Outcome<T>, requireAll = false, late?: () => void): Outcome<SlotStage<T>> {
    return this.execute(frame => {
      const names = slotDeclarations(declared, maxBindings);
      const values = new Map<string, NativeValue>();
      let open = true, failed = false, count = 0, checking = false;
      const writer: WorkflowSlotWriter = Object.freeze({
        put: <V>(name: string, slot: WorkflowSlot<V>, value: NoInfer<V>): Outcome<void> => {
          if (!open || this.#closed) { late?.(); return fail('WORKFLOW_SLOT_CLOSED'); }
          if (checking || ++count > maxBindings) { failed = true; return fail('WORKFLOW_SLOT_LIMIT'); }
          checking = true;
          try {
            if (names.get(name) !== slot || values.has(name) || !accepted(slot, value)) { failed = true; return fail(); }
            values.set(name, Object.freeze({ slot, value }));
            return ok(undefined);
          } catch { failed = true; return fail(); }
          finally { checking = false; }
        },
      });
      let result: Outcome<T>;
      try {
        if (types.isAsyncFunction(callback)) return fail('WORKFLOW_SLOT_ASYNC');
        result = snapshotOutcome(sync(() => callback(writer)));
      } finally { open = false; }
      if (failed || (requireAll && values.size !== names.size) || !sameFrame(frame, this.frame())) return fail('WORKFLOW_SLOT_CURRENTNESS');
      if (result.status !== 'COMPLETE') return result;
      const stage = Object.freeze({ result: result.value });
      this.#stages.set(stage, { frame, values });
      return ok(stage);
    });
  }

  /** 从实际已接纳输入和节点解析证据继承结果依赖；候选只由调用方在节点接纳后使用。 */
  public resultEntries<T>(stage: SlotStage<T>, inputs: ReadonlyMap<string, SlotEntry>,
    resolution: EvidenceResolution<string, unknown>, extra?: DetachedRegionProof): Outcome<ReadonlyMap<string, SlotEntry>> {
    return this.execute(frame => {
      const staged = this.#stages.get(stage);
      if (!staged) return fail();
      this.#stages.delete(stage);
      if (!sameFrame(staged.frame, frame) || !resolution.complete || resolution.items.length > 4096 || inputs.size > 2048) return fail();
      const keys = new Set<string>(), sources = new Set<Source>(), children = new Set<DetachedRegionProof>();
      let links = 0;
      for (const entry of inputs.values()) {
        if (!this.usable(entry, entry.slot, frame)) return fail();
        for (const child of entry.children ?? []) { children.add(child); if (children.size > 256) return fail(); }
        for (const key of entry.evidenceKeys) { if (++links > 16384) return fail(); keys.add(key); }
        for (const source of entry.sources) { if (++links > 16384) return fail(); sources.add(source); }
      }
      if (extra) children.add(extra);
      if (children.size > 256) return fail();
      for (const item of resolution.items) {
        if (item.status !== 'resolved' || !item.evidence.length) return fail();
        keys.add(item.key);
        for (const e of item.evidence) {
          if (++links > 16384 || !applicable(e.source, frame)) return fail();
          sources.add(e.source);
        }
      }
      const fresh = this.frame();
      if (!sameFrame(frame, fresh) || [...sources].some(s => !applicable(s, fresh))) return fail();
      const evidenceKeys = Object.freeze([...keys]), provenance = Object.freeze([...sources]);
      const out = new Map<string, SlotEntry>();
      for (const [name, value] of staged.values) {
        const entry = Object.freeze({ ...value, epoch: frame.epoch, scope: frame.context.scope, evidenceKeys, sources: provenance, ...(children.size ? { children: Object.freeze([...children]) } : {}) });
        this.#entries.add(entry); out.set(name, entry);
      }
      return ok(out);
    });
  }

  /** 暂存值必须对应真实 resolver 的已解决来源键；返回私有候选记录集合，
   * 不写入区域当前状态。Region 在最终接纳线性化处才可使用这批记录。
   */
  public contextEntries<T>(stage: SlotStage<T>, slotEvidence: Readonly<Record<string, readonly string[]>>,
    resolution: EvidenceResolution<string, unknown>): Outcome<ReadonlyMap<string, SlotEntry>> {
    return this.execute(frame => {
      const staged = this.#stages.get(stage);
      // 每个暂存批次只能尝试一次，禁止跨域/过期/重放发布。
      if (!staged) return fail();
      this.#stages.delete(stage);
      if (!sameFrame(staged.frame, frame) || !resolution.complete || resolution.items.length > 4096
        || !slotEvidence || types.isProxy(slotEvidence)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(slotEvidence) as object | null)) return fail();
      const byKey = new Map<string, Resolved['items'][number]>();
      for (const item of resolution.items) {
        if (byKey.has(item.key)) return fail();
        byKey.set(item.key, item);
      }
      const out = new Map<string, SlotEntry>();
      let links = 0;
      for (const name in slotEvidence) {
        const value = staged.values.get(name);
        const d = Object.getOwnPropertyDescriptor(slotEvidence, name);
        if (!value || out.has(name) || !d || !('value' in d)) return fail();
        const keys: unknown = d.value;
        if (!Array.isArray(keys) || types.isProxy(keys) || !keys.length || keys.length > 4096) return fail();
        const sources: Source[] = [];
        const evidenceKeys: string[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < keys.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(keys, String(i));
          const key: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
          if (typeof key !== 'string' || seen.has(key) || ++links > 16384) return fail();
          seen.add(key); evidenceKeys.push(key);
          const item = byKey.get(key);
          if (item?.status !== 'resolved' || !item.evidence.length || item.evidence.length > 4096) return fail();
          for (const e of item.evidence) {
            if (++links > 16384 || e.state !== 'known' || !applicable(e.source, frame)) return fail();
            sources.push(e.source);
          }
        }
        out.set(name, Object.freeze({ ...value, epoch: frame.epoch, scope: frame.context.scope,
          evidenceKeys: Object.freeze(evidenceKeys), sources: Object.freeze(sources) }));
      }
      if (out.size !== staged.values.size) return fail();
      const fresh = this.frame();
      if (!sameFrame(frame, fresh) || [...out.values()].some(e => e.sources.some(s => !applicable(s, fresh)))) return fail();
      for (const entry of out.values()) this.#entries.add(entry);
      return ok(out);
    });
  }
}
