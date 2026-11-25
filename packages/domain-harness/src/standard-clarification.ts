import { dense } from './semantic-data.js';
import { types } from 'node:util';
import { makePrompt, readResponse, responseData } from './interaction-protocol.js';
import type { InteractionEvent, InteractionField, InteractionPrompt, InteractionPromptSpec, InteractionResponse } from './interaction-protocol.js';
import type { CandidatePreparation } from './standard-candidates.js';
import type { DecisionCondition, DecisionSelection } from './standard-decision.js';
import type { EvidenceObservation, EvidenceResolution } from './standard-evidence.js';

type Prefill = NonNullable<InteractionField['prefill']>;
type Value = Prefill['value'];
type Choice = Extract<InteractionField, { kind: 'choice' | 'multi-choice' }>;
type Known<E extends string, V> = Extract<EvidenceObservation<E, V>, { state: 'known' }>;
/** 领域字段与证据键的显式映射。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export interface ClarificationField<E extends string, V> {
  readonly field: InteractionField;
  readonly evidenceKey: E;
  readonly applicable: DecisionCondition;
  readonly confirmation: 'accepted' | 'user';
  readonly projectPrefill?: (observation: Known<E, V>) => Prefill | undefined;
  readonly candidates?: Readonly<{ current: Readonly<{ scope: string; revision: string }>; result: CandidatePreparation<unknown> }>;
}
/** 当前证据及决策对应的澄清准备。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export type ClarificationPreparation<E extends string> =
  Readonly<{ status: 'failed'; reason: 'LIMIT' | 'INVALID_MAPPING' | 'EVIDENCE_FAILED' | 'DECISION_FAILED' | 'CANDIDATE_FAILED' | 'STALE_CANDIDATES' | 'INVALID_PROMPT' | 'PREFILL_FAILED' }> |
  Readonly<{ status: 'ready' }> |
  Readonly<{ status: 'unresolved' | 'blocked' | 'conflict'; reason: 'DECISION' | 'FIELD_APPLICABILITY' | 'EVIDENCE_NOT_APPLICABLE' | 'NO_FIELDS' | 'NO_SUBMISSION' }> |
  Readonly<{ status: 'prompt'; prompt: InteractionPromptSpec; bindings: readonly Readonly<{ fieldId: string; key: E }>[] }>;
/** 显式用户响应的映射结果。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export type ClarificationResponse<E extends string> = Readonly<{ status: 'failed'; reason: 'INVALID_RESPONSE' }> |
  Readonly<{ status: 'other'; action: InteractionResponse['action'] }> |
  Readonly<{ status: 'values'; action: 'submit' | 'revise'; values: readonly Readonly<{ key: E; origin: 'user'; value: Value }>[] }>;

const previewId = '00000000-0000-0000-0000-000000000000';
const failure = (reason: Extract<ClarificationPreparation<string>, { status: 'failed' }>['reason']) => Object.freeze({ status: 'failed' as const, reason });
function choice(field: InteractionField): field is Choice { return field.kind === 'choice' || field.kind === 'multi-choice'; }
function currentChoice(field: Choice, value: Value): boolean {
  const has = (id: unknown) => typeof id === 'string' && field.options.some(option => option.id === id);
  if (field.kind === 'choice') return has(value);
  return Array.isArray(value) && value.length <= 256 && dense(value) && (!field.required || value.length > 0) && new Set(value).size === value.length && value.every(has);
}

/** 根据本轮真实证据组织当前必要决策的原生语义表单，不执行领域规则或业务。
 * @dhKind function
 * @dhCapability semantic-interaction
 */
export function buildClarification<K extends string, E extends string, V>(evidence: EvidenceResolution<E, V>, selection: DecisionSelection<K>,
  template: Omit<InteractionPromptSpec, 'fields'>, fields: readonly ClarificationField<E, V>[]): ClarificationPreparation<E> {
  if (!evidence.complete) return failure('EVIDENCE_FAILED');
  if (!selection.complete) return failure('DECISION_FAILED');
  if (selection.status === 'ready') return Object.freeze({ status: 'ready' });
  if (selection.status !== 'next') return Object.freeze({ status: selection.status, reason: 'DECISION' });
  if (fields.length > 256 || evidence.items.length > 4096 || selection.rows.length > 4096) return failure('LIMIT');
  if (!dense(fields) || !dense(evidence.items) || !dense(selection.rows) || template.decisionKey !== selection.key ||
    !selection.rows.some(row => row.key === selection.key && row.disposition === 'eligible')) return failure('INVALID_MAPPING');
  const items = new Map(evidence.items.map(item => [item.key, item]));
  if (items.size !== evidence.items.length) return failure('INVALID_MAPPING');
  const ids = new Set<string>(), keys = new Set<E>();
  const active: InteractionField[] = [], bindings: { fieldId: string; key: E }[] = [];
  for (const binding of fields) {
    let field = binding.field;
    const key = binding.evidenceKey, item = items.get(key);
    if (!item || ids.has(field.id) || keys.has(key) || Object.hasOwn(field, 'prefill') ||
      !['yes', 'no', 'unknown', 'conflict'].includes(binding.applicable) || !['accepted', 'user'].includes(binding.confirmation)) return failure('INVALID_MAPPING');
    ids.add(field.id); keys.add(key);
    if (binding.applicable === 'no') continue;
    if (binding.applicable !== 'yes') return Object.freeze({ status: binding.applicable === 'conflict' ? 'conflict' : 'unresolved', reason: 'FIELD_APPLICABILITY' });
    if (item.status === 'not-applicable') return Object.freeze({ status: 'unresolved', reason: 'EVIDENCE_NOT_APPLICABLE' });
    if (choice(field)) {
      if (!binding.candidates || field.options.length !== 0 || field.comparison !== undefined) return failure('INVALID_MAPPING');
      const { current, result } = binding.candidates;
      if (result.status === 'failed') return failure('CANDIDATE_FAILED');
      if (result.scope !== current.scope || result.revision !== current.revision) return failure('STALE_CANDIDATES');
      field = { ...field, options: result.options, comparison: result.comparison, completeness: result.complete ? 'complete' : 'incomplete' };
    } else if (binding.candidates !== undefined) return failure('INVALID_MAPPING');
    const resolved = item.status === 'resolved' && (binding.confirmation === 'accepted' || item.evidence.some(o => o.origin === 'user' && o.state === 'known'));
    if (resolved && !choice(field)) continue;
    let prefill: Prefill | undefined;
    // 已确定值或唯一提案才可由域显式投影为安全的呈现数据；不自动选取冲突中的值。
    const observation = item.status === 'resolved' ? (binding.confirmation === 'user' ?
      item.evidence.find(o => o.state === 'known' && o.origin === 'user') : undefined) ?? item.evidence.find(o => o.state === 'known') :
      (item.status === 'unknown' && item.reason === 'NO_ACCEPTED_ORIGIN' && item.proposals.length === 1 ? item.proposals[0] : undefined);
    if (observation?.state === 'known' && binding.projectPrefill !== undefined) {
      if (types.isAsyncFunction(binding.projectPrefill)) return failure('PREFILL_FAILED');
      try {
        const projected = binding.projectPrefill(observation);
        if (types.isPromise(projected)) { void Promise.prototype.then.call(projected, undefined, () => undefined); return failure('PREFILL_FAILED'); }
        if (projected !== undefined) {
          if (typeof projected.source !== 'string' || !projected.source.trim()) return failure('PREFILL_FAILED');
          if (!choice(field) || currentChoice(field, projected.value)) prefill = { value: projected.value, source: observation.origin + ':' + projected.source };
        }
      } catch { return failure('PREFILL_FAILED'); }
    }
    if (resolved && choice(field) && prefill !== undefined) continue;
    if (field.required === true && choice(field) && field.options.length === 0 && template.actions.length === 1 && template.actions[0] === 'submit')
      return Object.freeze({ status: 'unresolved', reason: 'NO_SUBMISSION' });
    active.push(prefill === undefined ? field : { ...field, prefill });
    bindings.push(Object.freeze({ fieldId: field.id, key }));
  }
  if (active.length === 0) return Object.freeze({ status: 'unresolved', reason: 'NO_FIELDS' });
  try {
    // 使用同一协议验证完整表单，预留真实 UUID 与安全整数 revision 的长度。
    const validated = makePrompt({ ...template, fields: active }, previewId, Number.MAX_SAFE_INTEGER);
    const prompt = Object.freeze({ decisionKey: validated.decisionKey, title: validated.title,
      ...(validated.description === undefined ? {} : { description: validated.description }), fields: validated.fields, actions: validated.actions });
    return Object.freeze({ status: 'prompt', prompt, bindings: Object.freeze(bindings) });
  } catch { return failure('INVALID_PROMPT'); }
}

/** 只映射实际交互当前有效响应的显式字段；不写状态、不授予权威或权限。
 * @dhKind function
 * @dhCapability semantic-interaction
 */
export function mapClarificationResponse<E extends string>(prepared: Extract<ClarificationPreparation<E>, { status: 'prompt' }>,
  current: InteractionPrompt, event: InteractionEvent): ClarificationResponse<E> {
  const invalid = Object.freeze({ status: 'failed' as const, reason: 'INVALID_RESPONSE' as const });
  if (event.kind !== 'response') return invalid;
  const latest = event.records.at(-1);
  if (!latest?.valid || latest.response !== event.response) return invalid;
  try {
    const expected = makePrompt(prepared.prompt, current.intentId, current.revision);
    if (JSON.stringify(expected) !== JSON.stringify(current)) return invalid;
    const response = readResponse(responseData(event.response), expected);
    if (response.action !== 'submit' && !(response.action === 'revise' && 'values' in response)) return Object.freeze({ status: 'other', action: response.action });
    const byId = new Map(prepared.bindings.map(binding => [binding.fieldId, binding.key]));
    if (byId.size !== current.fields.length || new Set(byId.values()).size !== byId.size || current.fields.some(field => !byId.has(field.id))) return invalid;
    const values = Object.entries(response.values).map(([id, value]) => Object.freeze({ key: byId.get(id)!, origin: 'user' as const, value }));
    return Object.freeze({ status: 'values', action: response.action, values: Object.freeze(values) });
  } catch { return invalid; }
}
