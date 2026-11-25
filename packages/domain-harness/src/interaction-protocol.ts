import { opaqueId as id } from './semantic-data.js';
/** 语义交互只传输有界 JSON 数据，不解释领域规则或可执行代码。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export interface InteractionCandidate {
  readonly id: string;
  readonly label: string;
  readonly reason?: string;
  readonly scope?: string;
  readonly recommended?: boolean;
}
type Value = string | number | boolean | readonly string[];
type Values = Readonly<Record<string, Value>>;
type Action = 'submit' | 'revise' | 'text' | 'no-fit' | 'reject' | 'cancel';
interface FieldBase {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
  readonly prefill?: { readonly value: Value; readonly source: string };
}
/** 原生语义表单的字段类型与约束。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export type InteractionField = FieldBase & (
  | { readonly kind: 'string' | 'text' | 'file'; readonly minLength?: number; readonly maxLength?: number }
  | { readonly kind: 'number'; readonly min?: number; readonly max?: number }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'choice' | 'multi-choice'; readonly options: readonly InteractionCandidate[];
      readonly completeness: 'complete' | 'incomplete';
      readonly comparison?: readonly { readonly label: string; readonly cells: Readonly<Record<string, string>> }[] }
);
/** 由领域组织的待发布表单内容。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export interface InteractionPromptSpec {
  readonly decisionKey: string;
  readonly title: string;
  readonly description?: string;
  readonly fields: readonly InteractionField[];
  readonly actions: readonly Action[];
}
/** 实际发布且带意图身份与修订的表单。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export interface InteractionPrompt extends InteractionPromptSpec {
  readonly intentId: string;
  readonly revision: number;
}
/** 客户端响应动作与显式数据。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export type InteractionResponse = Readonly<{ intentId: string; revision: number; decisionKey: string }> & (
  | { readonly action: 'submit'; readonly values: Values }
  | { readonly action: 'revise'; readonly values: Values }
  | { readonly action: 'revise' | 'text'; readonly text: string }
  | { readonly action: 'no-fit' | 'reject' | 'cancel' }
);
/** 响应与其当前有效性。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export interface InteractionRecord {
  readonly response: InteractionResponse;
  readonly valid: boolean;
}
/** 领域分析收到的初始或实际响应事件。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export type InteractionEvent = (
  | { readonly kind: 'initial' }
  | { readonly kind: 'response'; readonly response: InteractionResponse }
) & { readonly records: readonly InteractionRecord[] };
/** 响应捕获确认；不是业务成功。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export type InteractionSubmitResult = { readonly accepted: true } | {
  readonly accepted: false;
  readonly code: 'NO_PENDING' | 'STALE_RESPONSE' | 'WRONG_INTENT' | 'INVALID_RESPONSE' | 'ALREADY_SETTLED';
};

const MAX_BYTES = 65_536;
const MAX_ITEMS = 256;
const ACTIONS = ['submit', 'revise', 'text', 'no-fit', 'reject', 'cancel'];
function invalid(): never { throw new Error('INTERACTION_INVALID_DATA'); }
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) return invalid();
  return value;
}
function str(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function size(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_BYTES; }
function list(value: unknown): unknown[] { if (!Array.isArray(value)) return invalid(); return value as unknown[]; }
function unique(values: readonly unknown[]): boolean { return new Set(values).size === values.length; }

// 拒绝访问器、循环、特殊对象、非 JSON 值及过大/过深数据；从不调用 toJSON。
function snapshot(input: unknown): unknown {
  let bytes = 0, nodes = 0;
  const active = new Set<object>();
  function copy(value: unknown, depth: number): unknown {
    if (++nodes > 4096 || depth > 16) return invalid();
    if (typeof value === 'string') { bytes += Buffer.byteLength(value); if (bytes > MAX_BYTES) return invalid(); return value; }
    if (value === null || typeof value === 'boolean' || finite(value)) return value;
    if (typeof value !== 'object' || active.has(value)) return invalid();
    const array = Array.isArray(value);
    const proto: unknown = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) return invalid();
    active.add(value);
    const own = Reflect.ownKeys(value);
    if (own.length > 4096 || own.some(key => typeof key !== 'string')) return invalid();
    const result: Record<string, unknown> | unknown[] = array ? [] : Object.create(null) as Record<string, unknown>;
    if (array && (value.length > 4096 || own.length !== value.length + 1)) return invalid();
    for (const key of own) {
      if (typeof key !== 'string') return invalid();
      if (array && key === 'length') continue;
      if (array && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)) return invalid();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return invalid();
      bytes += Buffer.byteLength(key); if (bytes > MAX_BYTES) return invalid();
      Object.defineProperty(result, key, { value: copy(descriptor.value as unknown, depth + 1), enumerable: true });
    }
    active.delete(value);
    return Object.freeze(result);
  }
  const result = copy(input, 0);
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) return invalid();
  return result;
}

function valueMatches(field: InteractionField, value: unknown): boolean {
  switch (field.kind) {
    case 'string': case 'text': case 'file':
      return typeof value === 'string' && (field.kind !== 'file' || str(value)) &&
        value.length >= (field.minLength ?? 0) && value.length <= (field.maxLength ?? MAX_BYTES);
    case 'number': return finite(value) && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max);
    case 'boolean': return typeof value === 'boolean';
    case 'choice': return typeof value === 'string' && field.options.some(option => option.id === value);
    case 'multi-choice': return Array.isArray(value) && unique(value) && (!field.required || value.length > 0) &&
      value.every(item => typeof item === 'string' && field.options.some(option => option.id === item));
  }
}

/** 内部协议 helper；不从 SDK 根导出。候选组绑定具体选择字段。 */
export function makePrompt(spec: InteractionPromptSpec, intentId: string, revision: number): InteractionPrompt {
  const raw = keys(snapshot(spec), ['decisionKey', 'title', 'description', 'fields', 'actions']);
  if (!id(raw.decisionKey) || !str(raw.title) || (raw.description !== undefined && typeof raw.description !== 'string')) return invalid();
  const fields = list(raw.fields), actions = list(raw.actions);
  if (!actions.length || !unique(actions) || actions.some(a => typeof a !== 'string' || !ACTIONS.includes(a))) return invalid();
  const submitOnly = actions.length === 1 && actions[0] === 'submit';
  const ids = new Set<string>();
  let items = fields.length;
  for (const field of fields) {
    const f = keys(field, ['id', 'label', 'kind', 'required', 'prefill', 'minLength', 'maxLength', 'min', 'max', 'options', 'completeness', 'comparison']);
    if (!id(f.id) || ids.has(f.id) || !str(f.label) || (f.required !== undefined && typeof f.required !== 'boolean')) return invalid();
    ids.add(f.id);
    const common = ['id', 'label', 'kind', 'required', 'prefill'];
    if (f.kind === 'string' || f.kind === 'text' || f.kind === 'file') {
      keys(f, [...common, 'minLength', 'maxLength']);
      if ((f.minLength !== undefined && !size(f.minLength)) || (f.maxLength !== undefined && !size(f.maxLength)) ||
        (size(f.minLength) && size(f.maxLength) && f.minLength > f.maxLength)) return invalid();
    } else if (f.kind === 'number') {
      keys(f, [...common, 'min', 'max']);
      if ((f.min !== undefined && !finite(f.min)) || (f.max !== undefined && !finite(f.max)) ||
        (finite(f.min) && finite(f.max) && f.min > f.max)) return invalid();
    } else if (f.kind === 'boolean') { keys(f, common); }
    else if (f.kind === 'choice' || f.kind === 'multi-choice') {
      keys(f, [...common, 'options', 'completeness', 'comparison']);
      const options = list(f.options), optionIds = new Set<string>(); items += options.length;
      if (f.completeness !== 'complete' && f.completeness !== 'incomplete') return invalid();
      for (const option of options) {
        const o = keys(option, ['id', 'label', 'reason', 'scope', 'recommended']);
        if (!id(o.id) || optionIds.has(o.id) || !str(o.label) ||
            (o.reason !== undefined && typeof o.reason !== 'string') || (o.scope !== undefined && typeof o.scope !== 'string') ||
            (o.recommended !== undefined && typeof o.recommended !== 'boolean')) return invalid();
        optionIds.add(o.id);
      }
      if (f.comparison !== undefined) for (const row of list(f.comparison)) {
        const r = keys(row, ['label', 'cells']);
        if (!str(r.label) || !object(r.cells) || Object.entries(r.cells).some(([key, val]) => !optionIds.has(key) || typeof val !== 'string')) return invalid();
      }
    } else return invalid();
    // 必填空选项及零长度文件引用不可能通过提交；有其他声明动作时仍可澄清或退出。
    if (submitOnly && f.required === true && (
      ((f.kind === 'choice' || f.kind === 'multi-choice') && list(f.options).length === 0) ||
      (f.kind === 'file' && f.maxLength === 0)
    )) return invalid();
    if (f.prefill !== undefined) {
      const p = keys(f.prefill, ['value', 'source']);
      if (!str(p.source) || !valueMatches(f as unknown as InteractionField, p.value)) return invalid();
    }
  }
  if (items > MAX_ITEMS) return invalid();
  return snapshot({ ...raw, intentId, revision }) as InteractionPrompt;
}

export function readResponse(input: Record<string, unknown>, prompt: InteractionPrompt): InteractionResponse {
  const r = keys(input, ['intentId', 'revision', 'decisionKey', 'action', 'values', 'text']);
  if (r.intentId !== prompt.intentId || r.revision !== prompt.revision || r.decisionKey !== prompt.decisionKey ||
      typeof r.action !== 'string' || !(prompt.actions as readonly string[]).includes(r.action)) return invalid();
  const base = ['intentId', 'revision', 'decisionKey', 'action'];
  if (r.action === 'submit' || (r.action === 'revise' && Object.hasOwn(r, 'values'))) {
    keys(r, [...base, 'values']);
    if (!object(r.values)) return invalid();
    const values = r.values;
    if (r.action === 'revise' && Object.keys(values).length === 0) return invalid();
    for (const [key, value] of Object.entries(values)) {
      const field = prompt.fields.find(item => item.id === key);
      if (!field || !valueMatches(field, value)) return invalid();
    }
    if (r.action === 'submit' && prompt.fields.some(field => field.required && !Object.hasOwn(values, field.id))) return invalid();
  } else if (r.action === 'text' || r.action === 'revise') {
    keys(r, [...base, 'text']); if (!str(r.text)) return invalid();
  } else keys(r, base);
  return r as InteractionResponse;
}

/** 先复制外部响应再读取关联字段；不信任 getter 或调用方后续修改。 */
export function responseData(input: unknown): Record<string, unknown> { return keys(snapshot(input), ['intentId', 'revision', 'decisionKey', 'action', 'values', 'text']); }
