import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { resolveEvidence } from './standard-evidence.js';
import type { EvidenceObservation, EvidenceResolution } from './standard-evidence.js';
import type { NativeWorkflowContext } from './native-workflow-composition.js';
import type { StandardWorkflowOutcome } from './standard-workflow.js';
import type { StandardJsonValue } from './standard-files.js';
import type { WorkflowNode, WorkflowNodeOptions, WorkflowAttempt, WorkflowContextView, WorkflowObservation } from './workflow-managed-contract.js';
import { boundedText, dense, valid, managedFailure, snapshotOutcome, redact } from './workflow-managed-runtime.js';
import type { ManagedRuntime, ManagedScope, LocalFramePolicy, ScopeFrames } from './workflow-managed-runtime.js';
import { EVENT_SCAN_WORK, frameScanWork, knowledgeScanWork } from './workflow-resource-control.js';

type Outcome<T> = StandardWorkflowOutcome<T>;
type NodeRecord = Extract<WorkflowObservation, { kind: 'node' }>;
type Projection = ReturnType<WorkflowNode<unknown, unknown>['project']>;
const stale = <T>(): Outcome<T> => ({ status: 'UNKNOWN', reason: { code: 'WORKFLOW_CURRENTNESS', message: 'Managed node result not accepted' } });
const array = (value: unknown): boolean => Array.isArray(value);
const defaultProjection: Projection = Object.freeze({ effect: 'unknown', detail: null });
const notEntered: Projection = Object.freeze({ effect: 'not-applicable', detail: null });

/** 仅允许有限 JSON 观察元数据；原生值不经此投影。 */
export function safeDetail(value: StandardJsonValue, limit: number): StandardJsonValue {
  let items = 0, bytes = 0;
  const seen = new Set<object>();
  function copy(v: StandardJsonValue, depth: number): StandardJsonValue {
    if (++items > 8192 || depth > 32 || bytes > limit) throw Error('WORKFLOW_PROJECTION_LIMIT');
    if (v === null || typeof v === 'boolean') { bytes += 5; return v; }
    if (typeof v === 'number' && Number.isFinite(v)) { bytes += 32; return v; }
    if (typeof v === 'string') {
      if (v.length > limit) throw Error('WORKFLOW_PROJECTION_LIMIT');
      bytes += Buffer.byteLength(JSON.stringify(v));
      if (bytes > limit) throw Error('WORKFLOW_PROJECTION_LIMIT');
      return v;
    }
    if (typeof v !== 'object' || v === null || types.isProxy(v) || seen.has(v)) throw Error('WORKFLOW_PROJECTION_INVALID');
    seen.add(v);
    try {
      if (Array.isArray(v)) {
        if (v.length > 8192 - items || !dense(v)) throw Error('WORKFLOW_PROJECTION_LIMIT');
        const out: StandardJsonValue[] = [];
        for (let i = 0; i < v.length; i++) {
          const d = Object.getOwnPropertyDescriptor(v, String(i));
          if (!d || !('value' in d)) throw Error('WORKFLOW_PROJECTION_INVALID');
          out.push(copy(d.value as StandardJsonValue, depth + 1));
        }
        return Object.freeze(out);
      }
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw Error('WORKFLOW_PROJECTION_INVALID');
      const result: Record<string, StandardJsonValue> = Object.create(null) as Record<string, StandardJsonValue>;
      const record = v as Record<string, StandardJsonValue>;
      for (const k in record) {
        if (!Object.hasOwn(v, k) || k.length > 1024 || items >= 8192) throw Error('WORKFLOW_PROJECTION_LIMIT');
        const d = Object.getOwnPropertyDescriptor(v, k);
        if (!d || !('value' in d)) throw Error('WORKFLOW_PROJECTION_INVALID');
        bytes += Buffer.byteLength(JSON.stringify(k)) + 2;
        if (bytes > limit) throw Error('WORKFLOW_PROJECTION_LIMIT');
        result[k] = copy(d.value as StandardJsonValue, depth + 1);
      }
      return Object.freeze(result);
    } finally { seen.delete(v); }
  }
  const result = copy(value, 0);
  if (Buffer.byteLength(JSON.stringify(result)) > limit) throw Error('WORKFLOW_PROJECTION_LIMIT');
  return result;
}

export interface NodeAdmission<I, O> {
  readonly definition: WorkflowNode<I, O>;
  readonly options: WorkflowNodeOptions;
  readonly scope: ManagedScope;
}

/** 业务回调之前完整预留固定节点额度，后续动态准备复用此执行边界。 */
export function admitNode<I, O>(runtime: ManagedRuntime, parent: ManagedScope, definition: WorkflowNode<I, O>,
  options: WorkflowNodeOptions): NodeAdmission<I, O> | { code: string } {
  if (!runtime.available()) return { code: 'WORKFLOW_STOPPED' };
  if (!definition || !options || !options.knowledge || !boundedText(definition.id) || Buffer.byteLength(definition.id) > 128 || !boundedText(definition.goal)
    || !valid(options.knowledge.maxItems, 4096) || !array(definition.requiredKnowledge)
    || definition.requiredKnowledge.length > options.knowledge.maxItems
    || (definition.requiredKnowledge.length > 0 && typeof definition.knowledge !== 'function')
    || !valid(definition.terminalReads ?? 0) || options.planRevision !== undefined
    || typeof options.current !== 'function' || typeof options.knowledge.current !== 'function'
    || typeof options.knowledge.equal !== 'function'
    || [definition.before, definition.run, definition.after, definition.project].some(x => typeof x !== 'function')
    || [definition.knowledge, definition.cleanup, definition.context, options.knowledge.rank].some(x => x !== undefined && typeof x !== 'function')
    || (definition.replay !== undefined && !['pure-read-only', 'never'].includes(definition.replay))) {
    return { code: 'WORKFLOW_NODE_INVALID' };
  }
  const node = Object.freeze({ ...definition });
  const local: LocalFramePolicy = { knowledge: Object.freeze({ ...options.knowledge }), current: options.current };
  const bound = Object.freeze({ ...options, knowledge: local.knowledge });
  const owner = {};
  const R = node.terminalReads ?? 0;
  const N = 4 + Number(node.knowledge !== undefined) + Number(node.cleanup !== undefined) + R + Number(node.context !== undefined);
  const F = runtime.frameChainCost(parent) + frameScanWork(local.knowledge.maxItems);
  const reservation = runtime.ledger.reserve(owner, { calls: N, steps: N,
    work: N + 4 + 4 * EVENT_SCAN_WORK + (16 + R) * F + knowledgeScanWork(local.knowledge.maxItems),
    events: 4, activeScopes: 1, terminalReads: R }, parent.local);
  if (!reservation.ok) return { code: reservation.code };
  return { definition: node, options: bound, scope: { id: randomUUID(), parentId: parent.id, parent,
    policy: local, owner, ticket: reservation.ticket, delivery: 'not-required', diagnostic: false, ...(parent.local === undefined ? {} : { local: parent.local }) } };
}

export async function executeNode<I, O>(runtime: ManagedRuntime, admission: NodeAdmission<I, O>, input: I,
  context: NativeWorkflowContext, closeAttempt: () => Promise<boolean>, parentOpen: () => boolean): Promise<Outcome<O>> {
  const { definition: node, options, scope } = admission;
  const occurrence = Object.freeze({ runId: runtime.runId, scopeId: scope.id, parentScopeId: scope.parentId!,
    definitionId: node.id, instanceId: randomUUID(), attempt: 1 });
  let frames: ScopeFrames | undefined;
  let resolution: EvidenceResolution<string, unknown> | undefined;
  let enterRecord = false;
  let entered = false, post: NodeRecord['post'] = 'not-applicable';
  let projection = notEntered;
  let sources: NodeRecord['sources'] = Object.freeze([]);
  let result: Outcome<O> = managedFailure('WORKFLOW_NODE_INVALID');
  let candidateSeq: number | undefined;
  let currentChecks = 0;
  const current = () => ++currentChecks <= 15 && frames !== undefined && parentOpen() && runtime.checkFrames(scope, frames, resolution);
  const record = (phase: NodeRecord['phase'], acceptance: NodeRecord['acceptance'], value?: Outcome<unknown>): NodeRecord =>
    Object.freeze({ kind: 'node', phase, occurrence, runId: runtime.runId, scopeId: scope.id, parentScopeId: scope.parentId!,
      seq: runtime.sequence(), factRevision: frames?.locals.at(-1)?.frame.epoch ?? 0, stage: node.id,
      entered, acceptance, post, effect: projection.effect, ...(projection.receiptId === undefined ? {} : { receiptId: projection.receiptId }),
      detail: phase === 'disposition' ? null : projection.detail, sources: phase === 'disposition' ? Object.freeze([]) : sources,
      reason: scope.diagnostic ? 'WORKFLOW_OBSERVER_FAILED' : value?.status === 'COMPLETE' ? 'WORKFLOW_NODE_CANDIDATE' : 'WORKFLOW_NODE_OBSERVATION',
      delivery: phase === 'disposition' ? scope.delivery : runtime.control.evidence === undefined ? 'not-required' : 'pending',
      ...(value === undefined ? {} : { outcome: redact(value) }), ...(candidateSeq === undefined ? {} : { candidateSeq }) });
  const emit = (phase: NodeRecord['phase'], value?: Outcome<unknown>) => {
    if (!scope.ticket.event(scope.owner)) return false;
    const r = record(phase, 'pending', value);
    if (phase === 'enter') { enterRecord = true; runtime.noteNode(r); }
    if (phase === 'candidate') candidateSeq = r.seq;
    return runtime.deliver(scope, r);
  };
  const accept = snapshotOutcome;
  const rejectIfComplete = (code: string) => { if (result.status === 'COMPLETE') result = managedFailure(code); };
  let actual: WorkflowAttempt<O> | undefined;
  let preEntered = false;
  try {
    frames = runtime.frames(scope);
    const requirements = runtime.requirements(node);
    if (!frames || !requirements || !parentOpen()) throw Error('WORKFLOW_NODE_ADMISSION');
    scope.bound = frames;
    const local = frames.locals.at(-1)?.frame;
    if (!local) throw Error('WORKFLOW_NODE_FRAME');
    let constraints: readonly string[] = Object.freeze([]), capabilities: readonly string[] = Object.freeze([]);
    let feedbackRevision = 0;
    if (node.context) {
      const projected = runtime.guarded(() => node.context!(input));
      if (!array(projected.constraints) || !array(projected.capabilities) || projected.constraints.length + projected.capabilities.length > 4096 || !dense(projected.constraints) || !dense(projected.capabilities)
        || projected.constraints.some(x => !boundedText(x)) || projected.capabilities.some(x => !boundedText(x))
        || !valid(projected.feedbackRevision, Number.MAX_SAFE_INTEGER)) throw Error('WORKFLOW_CONTEXT_INVALID');
      let contextBytes = 0;
      for (const list of [projected.constraints, projected.capabilities]) for (const item of list) {
        contextBytes += Buffer.byteLength(JSON.stringify(item)) + 1;
        if (contextBytes > 65536) throw Error('WORKFLOW_CONTEXT_LIMIT');
      }
      constraints = Object.freeze([...projected.constraints]); capabilities = Object.freeze([...projected.capabilities]);
      feedbackRevision = projected.feedbackRevision;
      if (!current()) throw Error('WORKFLOW_CURRENTNESS');
    }
    let raw: readonly EvidenceObservation<string, unknown>[] = [];
    if (node.knowledge) {
      const observed = accept(await node.knowledge(input, context));
      if (observed.status !== 'COMPLETE') { result = observed; throw Error('WORKFLOW_KNOWLEDGE'); }
      raw = observed.value;
      if (!current()) throw Error('WORKFLOW_CURRENTNESS');
    }
    if (!array(raw) || raw.length > options.knowledge.maxItems || !dense(raw)
      || raw.some(x => !boundedText(x?.key) || !boundedText(x?.source?.id) || !boundedText(x?.source?.scope)
        || !boundedText(x?.source?.revision))) throw Error('WORKFLOW_KNOWLEDGE_LIMIT');
    resolution = runtime.guarded(() => resolveEvidence(requirements, raw, local.context, options.knowledge, options.knowledge.maxItems));
    if (!resolution.complete || resolution.items.some(x => x.status !== 'resolved') || !current()) throw Error('WORKFLOW_KNOWLEDGE');
    scope.resolved = resolution;
    const projectedSources: NodeRecord['sources'][number][] = [];
    let sourceBytes = 2;
    for (const item of resolution.items) for (const e of item.evidence) {
      const source = Object.freeze({ key: item.key, id: e.source.id, scope: e.source.scope,
        revision: e.source.revision, status: item.status });
      sourceBytes += Buffer.byteLength(JSON.stringify(source)) + 1;
      if (sourceBytes > 65536 - 2048) throw Error('WORKFLOW_SOURCE_LIMIT');
      projectedSources.push(source);
    }
    sources = Object.freeze(projectedSources);
    const view = (stage: string): WorkflowContextView => {
      const remaining = runtime.ledger.remaining();
      return Object.freeze({ runId: runtime.runId, scopeId: scope.id, goal: node.goal, stage,
        factRevision: local.epoch, knowledge: resolution, capabilities, constraints, feedbackRevision,
        progress: runtime.progress(scope.parentId!), remaining: Object.freeze({ calls: remaining.calls, steps: remaining.steps,
          work: remaining.work, events: remaining.events, localWork: runtime.localRemaining(scope),
          maxDescendantDepth: context.remaining().maxDescendantDepth, ...runtime.clock.remaining() }) });
    };
    preEntered = true;
    const pre = accept(await node.before(input, context, view('before')));
    if (pre.status !== 'COMPLETE') { result = pre; throw Error('WORKFLOW_PRE_REJECT'); }
    if (!current()) throw Error('WORKFLOW_CURRENTNESS');
    // enter 记录不代表实际调用；若证据交付使当前性失效，禁止调用。
    if (!emit('enter') || !current()) throw Error('WORKFLOW_NODE_ADMISSION');
    entered = true;
    post = 'pending';
    try {
      result = accept(await node.run(input, context, view('run')));
      actual = Object.freeze({ kind: 'returned', outcome: result });
    } catch {
      const kind = runtime.clock.reason === 'cancelled' ? 'cancelled' : runtime.clock.reason !== undefined ? 'timeout' : 'exception';
      actual = Object.freeze({ kind, code: 'WORKFLOW_EXECUTION_FAILED' });
      result = managedFailure('WORKFLOW_EXECUTION_FAILED');
    }
    if (!current() && result.status === 'COMPLETE') result = stale();
  } catch {
    if (result.status === 'COMPLETE') result = managedFailure('WORKFLOW_NODE_INVALID');
  } finally {
    const outstanding = await closeAttempt();
    if (outstanding && result.status === 'COMPLETE') result = stale();
    if (entered && actual) {
      const terminal = runtime.terminal(scope, undefined, frames, true);
      try {
        const observed = accept(await node.after(input, actual, terminal.context));
        post = observed.status === 'COMPLETE' ? 'passed' : 'failed';
        if (observed.status !== 'COMPLETE' && result.status === 'COMPLETE') result = observed;
      } catch { post = 'failed'; rejectIfComplete('WORKFLOW_POST_FAILED'); }
      finally { if (await terminal.close()) { post = 'unknown'; rejectIfComplete('WORKFLOW_TERMINAL_READ_FAILED'); } }
      if (!current() && result.status === 'COMPLETE') result = stale();
      try {
        if (node.cleanup) await node.cleanup(input, actual);
      } catch { rejectIfComplete('WORKFLOW_CLEANUP_FAILED'); }
      if (!current() && result.status === 'COMPLETE') result = stale();
      try {
        const p = runtime.guarded(() => {
          if (types.isAsyncFunction(node.project)) throw Error('WORKFLOW_ASYNC_PROJECT');
          const value = node.project(actual!);
          if (!['none', 'committed', 'unknown', 'not-applicable'].includes(value.effect)
            || (value.receiptId !== undefined && (!boundedText(value.receiptId) || Buffer.byteLength(value.receiptId) > 128))) throw Error('WORKFLOW_PROJECT_INVALID');
          return value;
        });
        projection = Object.freeze({ effect: p.effect, ...(p.receiptId === undefined ? {} : { receiptId: p.receiptId }), detail: null });
        try { projection = Object.freeze({ ...projection, detail: safeDetail(p.detail, 65536 - Buffer.byteLength(JSON.stringify(sources)) - 2048) }); }
        catch { rejectIfComplete('WORKFLOW_PROJECT_INVALID'); }
      } catch { projection = defaultProjection; rejectIfComplete('WORKFLOW_PROJECT_INVALID'); }
      if (projection.effect === 'unknown') rejectIfComplete('WORKFLOW_EFFECT_UNKNOWN');
      if (!current() && result.status === 'COMPLETE') result = stale();
      if (!emit('actual', actual.kind === 'returned' ? actual.outcome : managedFailure(actual.code))) rejectIfComplete('WORKFLOW_EVIDENCE_FAILED');
    } else {
      if (preEntered && node.cleanup) {
        try { await node.cleanup(input, { kind: 'unsettled', code: 'WORKFLOW_PRE_REJECT' }); }
        catch { rejectIfComplete('WORKFLOW_CLEANUP_FAILED'); }
      }
      // 已输出 enter 时复用实际观察记录，不增加第五条。
      if (enterRecord) emit('actual', result);
      else emit('pre-reject', result);
    }
    if (result.status === 'COMPLETE' && (!current() || runtime.criticalFailed)) result = stale();
    if (!emit('candidate', result)) rejectIfComplete('WORKFLOW_EVIDENCE_FAILED');
    if (result.status === 'COMPLETE' && (!current() || runtime.criticalFailed)) result = stale();
    if (scope.ticket.event(scope.owner)) {
      runtime.noteNode(record('disposition', result.status === 'COMPLETE' ? 'accepted' : result.status === 'UNKNOWN' ? 'stale' : 'rejected', result));
    } else rejectIfComplete('WORKFLOW_EVENT_BUDGET');
    scope.ticket.close(scope.owner);
  }
  return result;
}
