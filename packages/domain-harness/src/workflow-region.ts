import { randomUUID } from 'node:crypto';
import { borrowRegionScope, guardBoundFactory, regionDisposition, regionOperation } from './native-workflow-composition.js';
import type { NativeWorkflowContext } from './native-workflow-composition.js';
import { capabilityData, invokeCapability } from './workflow-capabilities.js';
import { SlotLeaseScope, slotDeclarations } from './workflow-slots.js';
import type { SlotEntry, SlotProvenance, WorkflowSlotReader } from './workflow-slots.js';
import { candidate, nodeProposal, proposal } from './workflow-region-proposal.js';
import { managedFailure, snapshotOutcome } from './workflow-managed-runtime.js';
import { invalidateEvidence, resolveEvidence } from './standard-evidence.js';
import type { EvidenceResolution } from './standard-evidence.js';
import { opaqueId, validLimit, dense } from './semantic-data.js';
import { knowledgeScanWork, leaseScanWork } from './workflow-resource-control.js';
import type { WorkflowContextView, WorkflowKnowledgeFrame, WorkflowNodeOptions } from './workflow-managed-contract.js';
import type { WorkflowCapability, WorkflowNodeProposal, WorkflowRegionDefinition, WorkflowRegionLimits,
  WorkflowRegionProposal, WorkflowRegionView, WorkflowSlotBinding } from './workflow-region-contract.js';
import type { StandardWorkflowOutcome as Outcome } from './standard-workflow.js';
import type { StandardJsonValue as J } from './standard-files.js';

const ok = <T>(value: T): Outcome<T> => ({ status: 'COMPLETE', value });
const fail = <T>(code = 'WORKFLOW_REGION_INVALID'): Outcome<T> => managedFailure(code);
const stale = <T>(): Outcome<T> => ({ status: 'UNKNOWN', reason: { code: 'WORKFLOW_REGION_STALE', message: 'Current region obligations not accepted' } });
type Entries = ReadonlyMap<string, SlotEntry>;
type Resolution = EvidenceResolution<string, unknown>;
type Left = WorkflowContextView['remaining'];
type State = 'pending' | 'accepted' | 'stale' | 'skipped' | 'removed';
interface Pending {
  readonly id: string; readonly section: number; readonly required: boolean; readonly capability: WorkflowCapability;
  readonly node: WorkflowNodeProposal;
  readonly state: State;
  readonly attempt: number;
  readonly outputs?: Entries;
}
interface Gap { readonly id: string; readonly section: number; readonly templates: ReadonlyMap<string, WorkflowNodeProposal> }
type RefreshState = { entries: Entries; facts: Resolution; nodes: Pending[]; replays: number; next: number; frame: WorkflowKnowledgeFrame; progress: boolean };
type EditState = { nodes: Pending[]; next: number; progress: boolean };
type Refresh<I, O> = Awaited<ReturnType<WorkflowRegionDefinition<I, O>['refresh']>>;
const array = (v: unknown): boolean => Array.isArray(v);
const validLimits = (l: WorkflowRegionLimits) => !!l && validLimit(l.maxWork, 2 ** 31 - 1) && validLimit(l.maxDescendantDepth, 256)
  && validLimit(l.maxCandidateBytes, 1048576) && l.maxCandidateBytes > 0 && validLimit(l.maxProjectionBytes, 1048576)
  && validLimit(l.maxJsonDepth, 32) && validLimit(l.maxJsonItems, 8192) && l.maxJsonItems > 0
  && validLimit(l.maxNodes, 256) && validLimit(l.maxBindings, 2048) && validLimit(l.maxEdits, 128);
const live = (n: Pending) => n.state !== 'removed' && n.state !== 'skipped';
const pending = (n: Pending) => n.state === 'pending' || n.state === 'stale';
function sourceCurrent(entry: SlotEntry, frame: WorkflowKnowledgeFrame): boolean {
  return entry.epoch === frame.epoch && entry.scope === frame.context.scope && entry.sources.every(s =>
    s.scope === frame.context.scope && frame.context.revisions.get(s.id) === s.revision &&
    (s.validity === undefined || (frame.context.asOf !== undefined && s.validity.from <= frame.context.asOf && frame.context.asOf < s.validity.until)));
}
function sameSource(a: SlotEntry, b: SlotEntry): boolean {
  return a.slot === b.slot && Object.is(a.value, b.value) && a.evidenceKeys.length === b.evidenceKeys.length
    && a.evidenceKeys.every(k => b.evidenceKeys.includes(k)) && a.sources.length === b.sources.length
    && a.sources.every(s => b.sources.some(t => s.id === t.id && s.scope === t.scope && s.revision === t.revision
      && s.validity?.from === t.validity?.from && s.validity?.until === t.validity?.until));
}
function remap(ref: WorkflowSlotBinding, aliases: ReadonlyMap<string, string>): WorkflowSlotBinding {
  return ref.kind === 'result' ? Object.freeze({ ...ref, node: aliases.get(ref.node) ?? ref.node }) : ref;
}
function boundedNames(values: readonly string[], max: number): boolean {
  return array(values) && values.length <= max && dense(values) && new Set(values).size === values.length && values.every(opaqueId);
}

/** 区域只维护有界顺序、当前数据流和真实节点义务；执行、取消和预算归原生 Workflow。 */
class Region<I, O> {
  readonly id: string;
  readonly options: WorkflowNodeOptions;
  readonly limits: WorkflowRegionLimits;
  readonly allowed = new Map<string, WorkflowCapability>();
  readonly leases: SlotLeaseScope;
  readonly gaps = new Map<string, Gap>();
  readonly requirements: WorkflowRegionDefinition<I,O>['requiredKnowledge'];
  #frame: WorkflowKnowledgeFrame | undefined;
  #facts: Resolution | undefined;
  #context: Entries = new Map();
  #nodes: Pending[] = [];
  #revision = 0;
  #feedback = 0;
  #initialized = false;
  #noProgress = 0;
  #replays = 0;
  #maxNoProgress = 0;
  #factRevision = 0;
  finalProof?: SlotProvenance;
  constructor(readonly root: NativeWorkflowContext, readonly d: WorkflowRegionDefinition<I,O>, readonly input: I,
    readonly initial?: readonly WorkflowNodeProposal[]) {
    this.id = root.scopeId;
    this.limits = d.limits;
    this.options = { knowledge: d.knowledge, current: d.current };
    this.requirements = Object.freeze([...d.requiredKnowledge, ...d.optionalKnowledge]);
    this.leases = new SlotLeaseScope(() => root.signal.aborted ? undefined : this.#frame);
  }

  private get structuralWork() {
    const l = this.limits;
    return 1 + Math.ceil(l.maxCandidateBytes / 256) + 4 * (l.maxJsonItems + l.maxNodes + l.maxBindings + l.maxEdits);
  }
  private get viewWork() {
    const l = this.limits;
    return 1 + Math.ceil(l.maxProjectionBytes / 256) + 4 * (l.maxJsonItems + l.maxBindings) + leaseScanWork(l.maxBindings);
  }
  private get graphWork() { return 1 + 4 * (this.d.knowledge.maxItems + 16384); }
  private event(action: 'edit' | 'feedback' | 'revalidate' | 'complete' | 'proposal-rejected', before: number, after: number, reason: string, detail: J = null) {
    return { regionId: this.id, action, beforeRevision: before, afterRevision: after, reason, detail };
  }
  private current(frame: WorkflowKnowledgeFrame) { this.#frame = frame; }

  private entries(nodes = this.#nodes, context = this.#context): Map<string, SlotEntry> {
    const out = new Map(context);
    for (const n of nodes) if (n.state === 'accepted') for (const [name, entry] of n.outputs ?? []) {
      out.set(n.id + '/' + name, entry);
    }
    return out;
  }
  private currentEntries(frame: WorkflowKnowledgeFrame): Map<string, SlotEntry> {
    return new Map([...this.entries()].filter(([, e]) => sourceCurrent(e, frame)));
  }
  private view(reader: WorkflowSlotReader, remaining: Left, stage: string, frame: WorkflowKnowledgeFrame): WorkflowRegionView {
    const results = this.#nodes.filter(n => n.state === 'accepted').map(n => Object.freeze({ node: n.id, slots: Object.freeze([...(n.outputs?.keys() ?? [])]) }));
    const progress = this.#nodes.map(n => Object.freeze({ instanceId: n.id, definitionId: n.capability.id, state: n.state }));
    const view = Object.freeze({ runId: this.root.runId, scopeId: this.root.scopeId, regionId: this.id, goal: this.d.goal, stage,
      factRevision: frame.epoch, planRevision: this.#revision, knowledge: this.#facts, capabilities: Object.freeze([...this.allowed.keys()]),
      constraints: this.d.constraints, progress: Object.freeze(progress), feedbackRevision: this.#feedback, remaining,
      slots: Object.freeze([...this.#context.keys()]), results: Object.freeze(results), reader });
    // 只计算结构名称，不序列化领域知识或值。
    const metadata = { ...view, knowledge: undefined, reader: undefined };
    if (Buffer.byteLength(JSON.stringify(metadata)) > this.limits.maxProjectionBytes) throw Error('WORKFLOW_REGION_VIEW_LIMIT');
    return view;
  }
  private async withView<T>(frame: WorkflowKnowledgeFrame, remaining: Left, stage: string,
    callback: (view: WorkflowRegionView) => Outcome<T> | Promise<Outcome<T>>): Promise<Outcome<T>> {
    const lease = this.leases.viewLease(this.currentEntries(frame), this.limits.maxBindings, fn => guardBoundFactory(this.root, fn));
    let actual: Outcome<T> | Promise<Outcome<T>>;
    try { actual = callback(this.view(lease.reader, remaining, stage, frame)); }
    catch { return fail(); }
    finally { lease.close(); }
    try {
      const result = snapshotOutcome(await actual);
      return lease.valid() ? result : fail('WORKFLOW_SLOT_CLOSED');
    } catch { return fail(); }
  }
  private create(p: WorkflowNodeProposal, section: number, required: boolean, aliases: Map<string, string>): Pending {
    if (aliases.has(p.alias)) throw Error('WORKFLOW_ALIAS_DUPLICATE');
    const capability = this.allowed.get(p.capability);
    if (!capability || (p.initial !== undefined && capability.kind !== 'region')) throw Error('WORKFLOW_CAPABILITY_DENIED');
    const input = Object.freeze(Object.fromEntries(Object.entries(p.input).map(([name, ref]) => [name, remap(ref, aliases)])));
    const id = randomUUID();
    aliases.set(p.alias, id);
    return Object.freeze({ id, section, required, capability, node: Object.freeze({ ...p, input }), state: 'pending', attempt: 0 });
  }
  private validate(nodes: readonly Pending[], context: Entries): boolean {
    if (nodes.length + this.#replays > this.limits.maxNodes) return false;
    let bindings = 0, visible = context.size;
    const prior = new Map<string, Pending>();
    for (const n of nodes) {
      if (!live(n)) continue;
      const data = capabilityData(n.capability);
      if (!data) return false;
      const declared = slotDeclarations(data.inputs, this.limits.maxBindings);
      const outputs = slotDeclarations(data.outputs, this.limits.maxBindings);
      if ((visible += outputs.size) > this.limits.maxBindings) return false;
      const refs = Object.entries(n.node.input);
      if (refs.length !== declared.size || (bindings += refs.length) > this.limits.maxBindings) return false;
      for (const [name, ref] of refs) {
        const token = declared.get(name);
        if (!token) return false;
        if (ref.kind === 'literal') {
          if (guardBoundFactory(this.root, () => this.leases.literal(token, ref.value)).status !== 'COMPLETE') return false;
        } else if (ref.kind === 'context') {
          if (context.get(ref.slot)?.slot !== token) return false;
        } else {
          const producer = prior.get(ref.node);
          if (!producer || capabilityData(producer.capability)?.outputs[ref.slot] !== token
            || (producer.state === 'accepted' && producer.outputs?.get(ref.slot)?.slot !== token)) return false;
        }
      }
      prior.set(n.id, n);
    }
    return true;
  }
  private initLayout(context: Entries): Pending[] {
    if (!opaqueId(this.d.id) || typeof this.d.goal !== 'string' || !this.d.goal.trim() || this.d.goal.length > 1024
      || !array(this.d.capabilities) || this.d.capabilities.length > this.limits.maxNodes || !dense(this.d.capabilities)
      || !array(this.d.layout) || this.d.layout.length > this.limits.maxNodes || !dense(this.d.layout)
      || !array(this.d.constraints) || this.d.constraints.length > 4096
      || this.d.constraints.some(c => typeof c !== 'string' || c.length > 1024)
      || (this.d.replay !== 'never' && this.d.replay !== 'pure-read-only')) throw Error('WORKFLOW_REGION_INVALID');
    for (const c of this.d.capabilities) {
      if (!capabilityData(c) || this.allowed.has(c.id)) throw Error('WORKFLOW_CAPABILITY_DENIED');
      this.allowed.set(c.id, c);
    }
    slotDeclarations(this.d.contextSlots, this.limits.maxBindings);
    candidate(this.d.layout, this.limits);
    if (this.initial !== undefined) candidate(this.initial, this.limits);
    const ids = new Set<string>(), aliases = new Map<string, string>(), nodes: Pending[] = [];
    let initial = this.initial;
    for (const [section, part] of this.d.layout.entries()) {
      if (!opaqueId(part.id) || ids.has(part.id)) throw Error('WORKFLOW_LAYOUT_INVALID');
      ids.add(part.id);
      if (part.kind === 'anchor') {
        nodes.push(this.create(nodeProposal(candidate(part.node, this.limits), this.limits), section, true, aliases));
      } else if (part.kind === 'gap') {
        const templates = new Map<string, WorkflowNodeProposal>();
        if (!boundedNames(part.seed, this.limits.maxNodes) || !array(part.templates) || part.templates.length > this.limits.maxNodes) throw Error('WORKFLOW_LAYOUT_INVALID');
        for (const raw of part.templates) {
          const p = nodeProposal(candidate(raw, this.limits), this.limits);
          if (templates.has(p.alias) || !this.allowed.has(p.capability)) throw Error('WORKFLOW_LAYOUT_INVALID');
          templates.set(p.alias, p);
        }
        this.gaps.set(part.id, { id: part.id, section, templates });
        for (const name of part.seed) {
          const p = templates.get(name);
          if (!p) throw Error('WORKFLOW_TEMPLATE_INVALID');
          nodes.push(this.create(p, section, false, aliases));
        }
        for (const raw of initial ?? []) nodes.push(this.create(nodeProposal(candidate(raw, this.limits), this.limits), section, false, aliases));
        initial = undefined;
      } else throw Error('WORKFLOW_LAYOUT_INVALID');
    }
    if (initial?.length || !this.validate(nodes, context)) throw Error('WORKFLOW_LAYOUT_INVALID');
    return nodes;
  }
  private async refresh(): Promise<Outcome<boolean>> {
    const result = await regionOperation<RefreshState>(this.root, this.structuralWork + this.viewWork + this.graphWork
      + knowledgeScanWork(this.d.knowledge.maxItems) + leaseScanWork(this.limits.maxBindings), 1, true, async (frame, left, max) => {
      this.current(frame); this.#maxNoProgress = max;
      if (this.requirements.length > this.d.knowledge.maxItems || new Set(this.requirements.map(r => r.key)).size !== this.requirements.length) return fail('WORKFLOW_REGION_KNOWLEDGE');
      const previous = this.#initialized ? this.leases.viewLease(this.currentEntries(frame), this.limits.maxBindings, fn => guardBoundFactory(this.root, fn)) : undefined;
      let settlement: Promise<Refresh<I,O>> | undefined, late = false;
      const stage = this.leases.write(this.d.contextSlots, this.limits.maxBindings, writer => {
        try {
          const view = previous ? this.view(previous.reader, left, 'refresh', frame) : undefined;
          const wrapped = Object.freeze({ put: <T>(name: string, slot: import('./workflow-slots.js').WorkflowSlot<T>, value: NoInfer<T>) =>
            guardBoundFactory(this.root, () => writer.put(name, slot, value)) });
          settlement = Promise.resolve(this.d.refresh(this.input, this.root, view, wrapped)).catch(() => fail());
          return ok(settlement);
        } finally { previous?.close(); }
      }, false, () => { late = true; });
      previous?.close();
      const settled = settlement === undefined ? fail<never>() : snapshotOutcome(await settlement);
      if (stage.status !== 'COMPLETE' || late || (previous && !previous.valid())) return fail('WORKFLOW_SLOT_CLOSED');
      if (settled.status !== 'COMPLETE') return settled;
      const refresh = settled.value;
      const resolved = guardBoundFactory(this.root, () => ok(resolveEvidence(this.requirements, refresh.observations,
        frame.context, this.d.knowledge, this.d.knowledge.maxItems)));
      if (resolved.status !== 'COMPLETE' || !resolved.value.complete
        || this.d.requiredKnowledge.some(r => resolved.value.complete && resolved.value.items.find(x => x.key === r.key)?.status !== 'resolved')) return fail('WORKFLOW_REGION_KNOWLEDGE');
      const entries = this.leases.contextEntries(stage.value, refresh.slotEvidence, resolved.value);
      if (entries.status !== 'COMPLETE') return entries;
      if (!array(refresh.changed) || refresh.changed.length > this.d.knowledge.maxItems || !dense(refresh.changed)
        || new Set(refresh.changed).size !== refresh.changed.length || refresh.changed.some(k => typeof k !== 'string' || !k.trim() || k.length > 1024)) return fail('WORKFLOW_REGION_DEPENDENCY');
      const changed = new Set(refresh.changed);
      if (this.#initialized && this.#facts?.complete) for (const old of this.#facts.items) {
        const next = resolved.value.items.find(i => i.key === old.key);
        if (!next || next.status !== old.status || (old.status === 'resolved' && next.status === 'resolved' && !Object.is(old.value, next.value))
          || old.evidence.length !== next.evidence.length || old.evidence.some(e => !next.evidence.some(n =>
            n.source.id === e.source.id && n.source.scope === e.source.scope && n.source.revision === e.source.revision
              && n.source.validity?.from === e.source.validity?.from && n.source.validity?.until === e.source.validity?.until))) changed.add(old.key);
      }
      const changedSlots = new Set<string>();
      if (this.#initialized) for (const [name, old] of this.#context) {
        const next = entries.value.get(name);
        if (!next || !sameSource(old, next)) {
          changedSlots.add(name);
          for (const key of old.evidenceKeys) changed.add(key);
          for (const key of next?.evidenceKeys ?? []) changed.add(key);
        }
      }
      const invalid = invalidateEvidence(this.requirements.map(r => r.key), [...changed], refresh.dependencies,
        { maxItems: this.d.knowledge.maxItems, maxDependencies: 16384 });
      if (!invalid.complete) return fail('WORKFLOW_REGION_DEPENDENCY');
      const affected = new Set(invalid.stale), staleIds = new Set<string>();
      const nodes: Pending[] = this.#initialized ? [] : this.initLayout(entries.value);
      let replays = this.#replays;
      if (this.#initialized) for (const n of this.#nodes) {
        if (n.state !== 'accepted') { nodes.push(n); continue; }
        const touched = Object.values(n.node.input).some(ref => ref.kind === 'context' ? changedSlots.has(ref.slot)
          : ref.kind === 'result' && staleIds.has(ref.node));
        const hasProof = [...(n.outputs?.values() ?? [])].some(e => e.evidenceKeys.length > 0);
        const retained = touched || (n.capability.kind === 'region' && (affected.size > 0 || frame.epoch !== this.#factRevision)) || (!hasProof && affected.size > 0) ? fail<Entries>() : this.leases.retain(n.outputs ?? new Map(), affected);
        if (retained.status === 'COMPLETE') {
          nodes.push(Object.freeze({ ...n, outputs: retained.value })); continue;
        }
        const actual = regionDisposition(this.root, n.id);
        if (capabilityData(n.capability)?.replay !== 'pure-read-only' || actual?.effect !== 'none' || actual.acceptance !== 'accepted') return stale();
        staleIds.add(n.id); replays++;
        const { outputs: _discarded, ...rest } = n;
        void _discarded;
        nodes.push(Object.freeze({ ...rest, state: 'stale' }));
      }
      if (nodes.length + replays > this.limits.maxNodes) return fail('WORKFLOW_REGION_LIMIT');
      const progress = !this.#initialized || staleIds.size > 0 || changed.size > 0 || changedSlots.size > 0;
      const next = this.#revision + Number(this.#initialized && progress);
      return ok({ value: { entries: entries.value, facts: resolved.value, nodes, replays, next, frame, progress },
        resolution: resolved.value, ...(this.#initialized && progress ? {
          event: this.event('revalidate', this.#revision, next, 'WORKFLOW_REGION_REFRESH', { stale: [...staleIds] }),
        } : {}) });
    });
    if (result.status !== 'COMPLETE') return result;
    const r = result.value;
    this.#context = r.entries; this.#facts = r.facts; this.#nodes = r.nodes; this.#replays = r.replays;
    this.#revision = r.next; this.#factRevision = r.frame.epoch; this.#initialized = true;
    return ok(r.progress);
  }

  private async edit(p: WorkflowRegionProposal): Promise<Outcome<boolean>> {
    const l = this.limits;
    const result = await regionOperation<EditState>(this.root, this.structuralWork + this.viewWork * (1 + p.edits.length), 1 + p.edits.filter(e => e.kind === 'skip' || e.kind === 'rebind').length,
      true, async (frame, left, _max, check) => {
      this.current(frame);
      if (p.runId !== this.root.runId || p.regionId !== this.id || p.planRevision !== this.#revision || p.factRevision !== frame.epoch || this.#factRevision !== frame.epoch) return stale();
      const nodes = [...this.#nodes];
      const aliases = new Map<string, string>();
      const locate = (id: string) => nodes.findIndex(n => n.id === (aliases.get(id) ?? id));
      const nextPending = this.#nodes.find(pending)?.section ?? this.d.layout.length;
      const previousAnchor = this.#nodes.filter(n => n.required && n.state === 'accepted' && n.section < nextPending).at(-1)?.section ?? -1;
      const cursor = previousAnchor + 1;
      const insert = (n: Pending, before?: string) => {
        let at = before === undefined ? nodes.findIndex(x => x.section > n.section) : locate(before);
        if (at === -1 && before === undefined) at = nodes.length;
        if (at < 0 || (before !== undefined && (nodes[at]?.section !== n.section || !pending(nodes[at]!)))) throw Error('WORKFLOW_EDIT_ORDER');
        nodes.splice(at, 0, n);
      };
      for (const e of p.edits) {
        if (e.kind === 'insert' || e.kind === 'reuse') {
          const gap = this.gaps.get(e.gap);
          if (!gap || gap.section < cursor) return fail('WORKFLOW_EDIT_GAP');
          const raw = e.kind === 'insert' ? e.node : gap.templates.get(e.template);
          if (!raw) return fail('WORKFLOW_TEMPLATE_INVALID');
          const n = this.create(e.kind === 'reuse' ? { ...raw, alias: e.alias } : raw, gap.section, false, aliases);
          insert(n, e.before);
        } else {
          const i = locate(e.node), n = nodes[i];
          if (!n || !pending(n) || (e.kind !== 'rebind' && (n.required || n.state !== 'pending'))) return fail('WORKFLOW_EDIT_TARGET');
          if (e.kind === 'skip') {
            const allowed = await this.withView(frame, left, 'skip', view => this.d.canSkip(n.id, view));
            if (allowed.status !== 'COMPLETE' || !check()) return fail('WORKFLOW_EDIT_POLICY');
            nodes[i] = Object.freeze({ ...n, state: 'skipped' });
          } else if (e.kind === 'remove') nodes[i] = Object.freeze({ ...n, state: 'removed' });
          else if (e.kind === 'move') {
            nodes.splice(i, 1); insert(n, e.before);
          } else if (e.kind === 'rebind') {
            const from = n.node.input[e.input];
            if (!from) return fail('WORKFLOW_EDIT_INPUT');
            const to = remap(e.to, aliases);
            const allowed = await this.withView(frame, left, 'rebind', view => this.d.canRebind(n.id, e.input, from, to, view));
            if (allowed.status !== 'COMPLETE' || !check()) return fail('WORKFLOW_EDIT_POLICY');
            nodes[i] = Object.freeze({ ...n, node: Object.freeze({ ...n.node, input: Object.freeze({ ...n.node.input, [e.input]: to }) }) });
          }
        }
        if (nodes.length + this.#replays > l.maxNodes) return fail('WORKFLOW_REGION_LIMIT');
      }
      if (!this.validate(nodes, this.#context)) return fail('WORKFLOW_BINDING_INVALID');
      const allowed = await this.withView(frame, left, 'admit', view => this.d.admit(view, p));
      if (allowed.status !== 'COMPLETE' || !check()) return fail('WORKFLOW_EDIT_POLICY');
      const progress = nodes.length !== this.#nodes.length || nodes.some((n, i) => {
        const old = this.#nodes[i];
        return old?.id !== n.id || old.state !== n.state || JSON.stringify(old.node.input) !== JSON.stringify(n.node.input);
      });
      const next = this.#revision + Number(progress);
      return ok({ value: { nodes, next, progress }, ...(progress ? { event: this.event('edit', this.#revision, next, 'WORKFLOW_EDIT_ACCEPTED', { edits: p.edits.length }) } : {}),
        ...(this.#facts === undefined ? {} : { resolution: this.#facts }) });
    }, false, false, 2 * l.maxEdits, this.event('proposal-rejected', this.#revision, this.#revision, 'WORKFLOW_EDIT_REJECTED'));
    if (result.status !== 'COMPLETE') return result;
    this.#nodes = result.value.nodes; this.#revision = result.value.next;
    return ok(result.value.progress);
  }
  private async execute(n: Pending): Promise<Outcome<void>> {
    const prepared = await regionOperation<Entries>(this.root, this.structuralWork + leaseScanWork(this.limits.maxBindings), 1, false, frame => {
      this.current(frame);
      if (frame.epoch !== this.#factRevision || !this.validate(this.#nodes, this.#context)) return stale();
      const data = capabilityData(n.capability);
      if (!data) return fail();
      const inputs = new Map<string, SlotEntry>();
      for (const [name, ref] of Object.entries(n.node.input)) {
        const token = data.inputs[name];
        if (!token) return fail();
        if (ref.kind === 'literal') {
          const literal = guardBoundFactory(this.root, () => this.leases.literal(token, ref.value));
          if (literal.status !== 'COMPLETE') return literal;
          inputs.set(name, literal.value);
        } else {
          const value = ref.kind === 'context' ? this.#context.get(ref.slot) : this.#nodes.find(x => x.id === ref.node && x.state === 'accepted')?.outputs?.get(ref.slot);
          if (!value || value.slot !== token || !sourceCurrent(value, frame)) return stale();
          inputs.set(name, value);
        }
      }
      return ok({ value: inputs, ...(this.#facts === undefined ? {} : { resolution: this.#facts }) });
    });
    if (prepared.status !== 'COMPLETE') return prepared;
    const revision = this.#revision;
    const actual = await invokeCapability(n.capability, [...this.allowed.values()], { root: this.root, leases: this.leases,
      inputs: prepared.value, maxBindings: this.limits.maxBindings, options: { ...this.options, planRevision: revision,
        current: () => revision === this.#revision && this.d.current() },
      occurrence: { instanceId: n.id, attempt: n.attempt + 1, planRevision: revision },
      runRegion: runRegionWithProof, delegated: [...this.allowed.values()], delegatedCurrent: this.d.current,
      ...(n.node.initial === undefined ? {} : { initial: n.node.initial }) });
    if (actual.status !== 'COMPLETE') return actual;
    const index = this.#nodes.indexOf(n);
    if (index < 0) return stale();
    this.#nodes[index] = Object.freeze({ ...n, state: 'accepted', attempt: n.attempt + 1, outputs: actual.value });
    return ok(undefined);
  }
  private async choose(): Promise<Outcome<WorkflowRegionProposal>> {
    const result = await regionOperation<WorkflowRegionProposal>(this.root, this.structuralWork + this.viewWork, 1, true, async (frame, left) => {
      this.current(frame);
      if (frame.epoch !== this.#factRevision) return stale();
      const planned = await this.withView(frame, left, 'plan', view => this.d.plan(view, this.root));
      if (planned.status !== 'COMPLETE') return planned;
      // 模型接入前拒绝模型来源，不能伪装为 native。
      if (planned.value.source !== 'native') return fail('WORKFLOW_MODEL_ACCESS_NOT_READY');
      return ok({ value: proposal(planned.value.proposal, this.limits), ...(this.#facts === undefined ? {} : { resolution: this.#facts }) });
    }, false, false, 0, this.event('proposal-rejected', this.#revision, this.#revision, 'WORKFLOW_PROPOSAL_REJECTED'));
    return result;
  }
  public async run(): Promise<Outcome<O>> {
    try {
      let refreshed = await this.refresh();
      if (refreshed.status !== 'COMPLETE') return refreshed;
      for (;;) {
        const choice = await this.choose();
        if (choice.status !== 'COMPLETE') return choice;
        const p = choice.value;
        const changed = await this.edit(p);
        if (changed.status !== 'COMPLETE') return changed;
        if (p.action === 'stop') return fail('WORKFLOW_REGION_STOPPED');
        if (p.action === 'finish') {
          if (this.#nodes.some(n => n.required && n.state !== 'accepted' || pending(n))) return fail('WORKFLOW_REGION_OBLIGATION');
          const finalized = await regionOperation<{ result: O; proof: SlotProvenance }>(this.root,
            this.viewWork + knowledgeScanWork(this.d.knowledge.maxItems), 1, true, async (frame, left) => {
              this.current(frame);
              const entries = [...this.entries().values()];
              const valid = (now: WorkflowKnowledgeFrame) => now.epoch === this.#factRevision && entries.every(e => sourceCurrent(e, now));
              if (!valid(frame) || !this.#facts?.complete) return stale();
              const complete = await this.withView(frame, left, 'complete', view => this.d.complete(view, this.root));
              if (complete.status !== 'COMPLETE') return complete;
              const keys = new Set<string>(), sources = new Set<SlotEntry['sources'][number]>();
              let links = 0;
              const checked = new Set<readonly SlotEntry['sources'][number][]>();
              for (const entry of entries) {
                if (checked.has(entry.sources)) continue;
                checked.add(entry.sources);
                for (const key of entry.evidenceKeys) { if (++links > 16384) return fail('WORKFLOW_SLOT_LIMIT'); keys.add(key); }
                for (const source of entry.sources) { if (++links > 16384) return fail('WORKFLOW_SLOT_LIMIT'); sources.add(source); }
              }
              for (const item of this.#facts.items) if (item.status === 'resolved') {
                keys.add(item.key);
                for (const evidence of item.evidence) { if (++links > 16384) return fail('WORKFLOW_SLOT_LIMIT'); sources.add(evidence.source); }
              }
              const proof: SlotProvenance = Object.freeze({ epoch: frame.epoch, scope: frame.context.scope,
                evidenceKeys: Object.freeze([...keys]), sources: Object.freeze([...sources]) });
              return ok({ value: { result: complete.value, proof }, resolution: this.#facts, validate: valid,
                event: this.event('complete', this.#revision, this.#revision, 'WORKFLOW_REGION_COMPLETE') });
            }, true);
          if (finalized.status !== 'COMPLETE') return finalized;
          this.finalProof = finalized.value.proof;
          return ok(finalized.value.result);
        }
        if (p.action === 'clarify') {
          const clarify = this.d.clarify;
          if (!clarify) return fail('WORKFLOW_REGION_CLARIFY_REQUIRED');
          const feedback = await regionOperation<void>(this.root, this.viewWork, 1, true, async (frame, left) => {
            this.current(frame);
            const response = await this.withView(frame, left, 'clarify', view => clarify(view, this.root));
            if (response.status !== 'COMPLETE') return response;
            return ok({ value: undefined, event: this.event('feedback', this.#revision, this.#revision + 1, 'WORKFLOW_REGION_FEEDBACK') });
          }, false, true);
          if (feedback.status !== 'COMPLETE') return feedback;
          this.#feedback++; this.#revision++;
          refreshed = await this.refresh();
          if (refreshed.status !== 'COMPLETE') return refreshed;
          this.#noProgress = refreshed.value ? 0 : this.#noProgress + 1;
        } else {
          const next = this.#nodes.find(pending);
          if (next) {
            const run = await this.execute(next);
            if (run.status !== 'COMPLETE') return run;
            this.#noProgress = 0;
            refreshed = await this.refresh();
            if (refreshed.status !== 'COMPLETE') return refreshed;
          } else this.#noProgress = changed.value ? 0 : this.#noProgress + 1;
        }
        if (this.#noProgress > this.#maxNoProgress) return fail('WORKFLOW_REGION_NO_PROGRESS');
      }
    } finally { this.leases.close(); }
  }
}

/** 在已有受控根内执行有界原生区域，复用实际节点、作用域和共享预算。
 * @dhKind function
 * @dhCapability workflow
 */
export function runWorkflowRegion<I, O>(root: NativeWorkflowContext, definition: WorkflowRegionDefinition<I, O>,
  input: I, initial?: readonly WorkflowNodeProposal[]): Promise<Outcome<O>> {
  return runRegionWithProof(root, definition, input, initial);
}
async function runRegionWithProof<I, O>(root: NativeWorkflowContext, definition: WorkflowRegionDefinition<I, O>,
  input: I, initial?: readonly WorkflowNodeProposal[], receiveProof?: (proof: SlotProvenance) => void): Promise<Outcome<O>> {
  try {
    if (!definition || !validLimits(definition.limits) || !definition.knowledge || !validLimit(definition.knowledge.maxItems, 4096)
      || !array(definition.requiredKnowledge) || !array(definition.optionalKnowledge)
      || definition.requiredKnowledge.length + definition.optionalKnowledge.length > definition.knowledge.maxItems
      || ![definition.refresh, definition.plan, definition.admit, definition.canSkip, definition.canRebind, definition.complete].every(f => typeof f === 'function')) return Promise.resolve(fail());
    // 同一可信声明快照用于预算和执行；可变的事实由 current/refresh 提供。
    const d = Object.freeze({ ...definition, limits: Object.freeze({ ...definition.limits }),
      knowledge: Object.freeze({ ...definition.knowledge }) });
    let proof: SlotProvenance | undefined;
    const result = await borrowRegionScope(root, d.limits.maxDescendantDepth, d.limits.maxWork,
      { knowledge: d.knowledge, current: d.current }, async child => {
        const region = new Region(child, d, input, initial);
        const outcome = await region.run();
        proof = region.finalProof;
        return outcome;
      });
    if (result.status === 'COMPLETE' && receiveProof) {
      if (!proof) return fail('WORKFLOW_CHILD_PROVENANCE');
      receiveProof(proof);
    }
    return result;
  } catch { return Promise.resolve(fail()); }
}
