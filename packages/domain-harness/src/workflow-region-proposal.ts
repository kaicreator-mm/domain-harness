import { types } from 'node:util';
import { opaqueId } from './semantic-data.js';
import type { StandardJsonValue as J } from './standard-files.js';
import type { WorkflowEdit, WorkflowNodeProposal, WorkflowRegionLimits, WorkflowRegionProposal, WorkflowSlotBinding } from './workflow-region-contract.js';

const reject = (): never => { throw Error('WORKFLOW_REGION_PROPOSAL_INVALID'); };
type Obj = Readonly<Record<string, J>>;
function object(v: J): Obj {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return reject();
  return v as Obj;
}
function fields(v: Obj, required: readonly string[], optional: readonly string[] = []): void {
  if (required.some(k => !Object.hasOwn(v, k)) || Object.keys(v).some(k => !required.includes(k) && !optional.includes(k))) reject();
}
function id(v: unknown): string { return opaqueId(v) ? v : reject(); }
function slotName(v: unknown): string {
  return typeof v === 'string' && v.trim().length > 0 && Buffer.byteLength(v) <= 128 && !v.includes('/')
    && !['__proto__','constructor','prototype'].includes(v) ? v : reject();
}
function number(v: unknown): number { return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : reject(); }
function list(v: J | undefined): readonly J[] { return Array.isArray(v) ? v as readonly J[] : reject(); }

/** 候选在预留结构票据后才读取；仅复制有限 JSON 元数据，绝不序列化领域原生值。 */
export function candidate(value: unknown, limits: WorkflowRegionLimits): J {
  let items = 0, bytes = 0;
  const seen = new Set<object>();
  const debit = (n: number) => { bytes += n; if (bytes > limits.maxCandidateBytes) reject(); };
  const copy = (v: unknown, depth: number): J => {
    if (++items > limits.maxJsonItems || depth > limits.maxJsonDepth) return reject();
    if (v === null || typeof v === 'boolean') { debit(v === null ? 4 : v ? 4 : 5); return v; }
    if (typeof v === 'number' && Number.isFinite(v)) { debit(Buffer.byteLength(JSON.stringify(v))); return v; }
    if (typeof v === 'string') {
      if (v.length > limits.maxCandidateBytes) return reject();
      debit(Buffer.byteLength(JSON.stringify(v))); return v;
    }
    if (typeof v !== 'object' || v === null || types.isProxy(v) || seen.has(v)) return reject();
    seen.add(v);
    try {
      if (Array.isArray(v)) {
        if (v.length > limits.maxJsonItems - items) return reject();
        debit(2 + Math.max(0, v.length - 1));
        const out: J[] = [];
        for (let i = 0; i < v.length; i++) {
          const d = Object.getOwnPropertyDescriptor(v, String(i));
          if (!d || !('value' in d)) return reject();
          out.push(copy(d.value, depth + 1));
        }
        return Object.freeze(out);
      }
      if (![Object.prototype, null].includes(Object.getPrototypeOf(v) as object | null)) return reject();
      const out: Record<string, J> = Object.create(null) as Record<string, J>;
      debit(2);
      let count = 0;
      for (const key in v) {
        if (!Object.hasOwn(v, key) || ['__proto__', 'constructor', 'prototype'].includes(key) || key.length > limits.maxCandidateBytes) return reject();
        const d = Object.getOwnPropertyDescriptor(v, key);
        if (!d || !('value' in d)) return reject();
        debit(Buffer.byteLength(JSON.stringify(key)) + 1 + Number(count++ > 0));
        out[key] = copy(d.value, depth + 1);
      }
      return Object.freeze(out);
    } finally { seen.delete(v); }
  };
  return copy(value, 0);
}

function binding(v: J): WorkflowSlotBinding {
  const o = object(v);
  if (o.kind === 'literal') { fields(o, ['kind','value']); return Object.freeze({ kind: 'literal', value: o.value! }); }
  if (o.kind === 'context') { fields(o, ['kind','slot']); return Object.freeze({ kind: 'context', slot: slotName(o.slot) }); }
  if (o.kind === 'result') { fields(o, ['kind','node','slot']); return Object.freeze({ kind: 'result', node: id(o.node), slot: slotName(o.slot) }); }
  return reject();
}
export function nodeProposal(v: J, limits: WorkflowRegionLimits): WorkflowNodeProposal {
  const o = object(v); fields(o, ['alias','capability','input'], ['initial']);
  const entries = Object.entries(object(o.input!));
  if (entries.length > limits.maxBindings) return reject();
  const input = Object.freeze(Object.fromEntries(entries.map(([key, value]) => [slotName(key), binding(value)])));
  const initial = o.initial === undefined ? undefined : list(o.initial).map(x => nodeProposal(x, limits));
  if (initial && initial.length > limits.maxNodes) return reject();
  return Object.freeze({ alias: id(o.alias), capability: id(o.capability), input,
    ...(initial === undefined ? {} : { initial: Object.freeze(initial) }) });
}
function edit(v: J, limits: WorkflowRegionLimits): WorkflowEdit {
  const o = object(v);
  const before = () => o.before === undefined ? {} : { before: id(o.before) };
  switch (o.kind) {
    case 'insert': fields(o, ['kind','gap','node'], ['before']); return { kind: 'insert', gap: id(o.gap), ...before(), node: nodeProposal(o.node!, limits) };
    case 'reuse': fields(o, ['kind','gap','template','alias'], ['before']); return { kind: 'reuse', gap: id(o.gap), template: id(o.template), alias: id(o.alias), ...before() };
    case 'skip': case 'remove': fields(o, ['kind','node']); return { kind: o.kind, node: id(o.node) };
    case 'move': fields(o, ['kind','node'], ['before']); return { kind: 'move', node: id(o.node), ...before() };
    case 'rebind': fields(o, ['kind','node','input','to']); return { kind: 'rebind', node: id(o.node), input: slotName(o.input), to: binding(o.to!) };
    default: return reject();
  }
}
export function proposal(v: unknown, limits: WorkflowRegionLimits): WorkflowRegionProposal {
  const o = object(candidate(v, limits));
  fields(o, ['runId','regionId','planRevision','factRevision','edits','action']);
  if (o.action !== 'continue' && o.action !== 'finish' && o.action !== 'clarify' && o.action !== 'stop') return reject();
  const edits = list(o.edits);
  if (edits.length > limits.maxEdits) return reject();
  return Object.freeze({ runId: id(o.runId), regionId: id(o.regionId), planRevision: number(o.planRevision),
    factRevision: number(o.factRevision), action: o.action, edits: Object.freeze(edits.map(e => Object.freeze(edit(e, limits)))) });
}
