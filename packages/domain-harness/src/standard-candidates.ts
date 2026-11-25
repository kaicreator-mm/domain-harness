import { dense, validLimit as limit, opaqueId as id } from './semantic-data.js';
import { types } from 'node:util';
import { BoundedQueryElement } from './standard-query.js';
import type { BoundedQueryLimits } from './standard-query.js';
import type { InteractionCandidate, InteractionField } from './interaction-protocol.js';

export interface CandidateEntry<T> {
  readonly id: string;
  readonly scope: string;
  readonly revision: string;
  readonly value: T;
}
export type CandidateSource<T> = Readonly<{ scope: string; revision: string }> & (
  | Readonly<{ status: 'complete' | 'incomplete'; entries: readonly CandidateEntry<T>[] }>
  | Readonly<{ status: 'failed' }>);
export type CandidateAssessment = Readonly<{ status: 'eligible' }> |
  Readonly<{ status: 'excluded' | 'unknown' | 'failed'; reason: string }>;
export interface CandidateProjection {
  readonly label: string;
  readonly reason?: string;
  readonly scope?: string;
  readonly priority: number;
  readonly recommended?: boolean;
  readonly cells: readonly string[];
}
type Comparison = NonNullable<Extract<InteractionField, { kind: 'choice' | 'multi-choice' }>['comparison']>;
type FailureCode = 'LIMIT' | 'INVALID_CANDIDATE' | 'STALE_SOURCE' | 'STALE_CANDIDATE' | 'SOURCE_FAILED' | 'ASSESSMENT_FAILED' | 'PROJECTION_FAILED';
type IncompleteReason = 'SOURCE_INCOMPLETE' | 'QUERY_VISIT_LIMIT' | 'QUERY_RESULT_LIMIT' | 'ASSESSMENT_UNKNOWN';
export type CandidatePreparation<T> = Readonly<{ status: 'failed'; complete: false; reason: FailureCode }> | Readonly<{
  status: 'available' | 'empty' | 'unknown'; complete: boolean; visited: number;
  scope: string; revision: string; entries: readonly CandidateEntry<T>[];
  options: readonly InteractionCandidate[]; comparison: Comparison;
  issues: readonly Readonly<{ id: string; status: 'excluded' | 'unknown'; reason: string }>[];
  incompleteReasons: readonly IncompleteReason[];
}>;
const failure = (reason: FailureCode) => Object.freeze({ status: 'failed' as const, complete: false as const, reason });
function text(value: unknown, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= 1024 && Buffer.byteLength(value) <= 1024 && (allowEmpty || value.trim().length > 0);
}
function record(value: unknown): value is Record<string, unknown> {
  if (types.isPromise(value)) {
    void Promise.prototype.then.call(value, undefined, () => undefined);
    return false;
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 组织已取得的领域候选；只把显示投影传给交互协议，业务值留在领域内部。 */
export function prepareCandidates<T>(source: CandidateSource<T>, current: Readonly<{ scope: string; revision: string }>,
  policy: Readonly<{ assess: (entry: CandidateEntry<T>) => CandidateAssessment; project: (entry: CandidateEntry<T>) => CandidateProjection; comparisonLabels: readonly string[] }>,
  limits: BoundedQueryLimits): CandidatePreparation<T> {
  const { maxVisited, maxReturned } = limits;
  const labels = policy.comparisonLabels;
  if (!limit(maxVisited, 4096) || !limit(maxReturned, 256) || labels.length > 32) return failure('LIMIT');
  if (!text(current.scope) || !text(current.revision) || !text(source.scope) || !text(source.revision)) return failure('INVALID_CANDIDATE');
  if (source.scope !== current.scope || source.revision !== current.revision) return failure('STALE_SOURCE');
  if (source.status === 'failed') return failure('SOURCE_FAILED');
  if (source.status !== 'complete' && source.status !== 'incomplete') return failure('INVALID_CANDIDATE');
  if (source.entries.length > 4096) return failure('LIMIT');
  if (!dense(labels) || labels.some(label => !text(label)) || new Set(labels).size !== labels.length) return failure('INVALID_CANDIDATE');
  if (types.isAsyncFunction(policy.assess)) return failure('ASSESSMENT_FAILED');
  if (types.isAsyncFunction(policy.project)) return failure('PROJECTION_FAILED');
  const ids = new Set<string>();
  const issues: { id: string; status: 'excluded' | 'unknown'; reason: string }[] = [];
  const incompleteReasons: IncompleteReason[] = [];
  if (source.status === 'incomplete') incompleteReasons.push('SOURCE_INCOMPLETE');
  let index = 0;
  let code: FailureCode = 'INVALID_CANDIDATE';
  const selected: { entry: CandidateEntry<T>; display: CandidateProjection }[] = [];
  try {
    const query = new BoundedQueryElement().select(source.entries, entry => {
      code = 'INVALID_CANDIDATE';
      if (!Object.hasOwn(source.entries, index++) || !entry || !id(entry.id) || ids.has(entry.id) || !Object.hasOwn(entry, 'value')) throw new Error(code);
      ids.add(entry.id);
      code = 'STALE_CANDIDATE';
      if (entry.scope !== current.scope || entry.revision !== current.revision) throw new Error(code);
      code = 'ASSESSMENT_FAILED';
      const assessment: unknown = policy.assess(entry);
      if (!record(assessment)) throw new Error(code);
      if (assessment.status === 'eligible') return true;
      if ((assessment.status !== 'excluded' && assessment.status !== 'unknown') || !text(assessment.reason)) throw new Error(code);
      issues.push(Object.freeze({ id: entry.id, status: assessment.status, reason: assessment.reason }));
      return false;
    }, { maxVisited, maxReturned });
    if (query.truncationReason === 'VISIT_LIMIT') incompleteReasons.push('QUERY_VISIT_LIMIT');
    if (query.truncationReason === 'RESULT_LIMIT') incompleteReasons.push('QUERY_RESULT_LIMIT');
    if (issues.some(issue => issue.status === 'unknown')) incompleteReasons.push('ASSESSMENT_UNKNOWN');
    const complete = source.status === 'complete' && query.complete && incompleteReasons.length === 0;
    code = 'PROJECTION_FAILED';
    for (const entry of query.items) {
      const raw: unknown = policy.project(entry);
      if (!record(raw) || !text(raw.label) || (raw.reason !== undefined && !text(raw.reason)) || (raw.scope !== undefined && !text(raw.scope)) ||
        typeof raw.priority !== 'number' || !Number.isFinite(raw.priority) || (raw.recommended !== undefined && typeof raw.recommended !== 'boolean') ||
        (raw.recommended === true && raw.reason === undefined) ||
        !Array.isArray(raw.cells) || raw.cells.length !== labels.length || !dense(raw.cells)) throw new Error(code);
      const cells: readonly unknown[] = raw.cells;
      if (!cells.every(cell => text(cell, true))) throw new Error(code);
      const display = { label: raw.label, priority: raw.priority, cells: Object.freeze([...cells]),
        ...(raw.reason === undefined ? {} : { reason: raw.reason }), ...(raw.scope === undefined ? {} : { scope: raw.scope }),
        ...(raw.recommended === undefined ? {} : { recommended: raw.recommended }) };
      selected.push({ entry: Object.freeze({ id: entry.id, scope: entry.scope, revision: entry.revision, value: entry.value }), display });
    }
    selected.sort((a, b) => a.display.priority === b.display.priority ? 0 : a.display.priority > b.display.priority ? -1 : 1);
    const options = Object.freeze(selected.map(({ entry, display }) => Object.freeze({ id: entry.id, label: display.label,
      ...(display.reason === undefined ? {} : { reason: display.reason }), ...(display.scope === undefined ? {} : { scope: display.scope }),
      ...(complete && display.recommended === true ? { recommended: true } : {}) })));
    const comparison = Object.freeze(labels.map((label, i) => Object.freeze({ label,
      cells: Object.freeze(Object.fromEntries(selected.map(({ entry, display }) => [entry.id, display.cells[i]!]))) })));
    if (Buffer.byteLength(JSON.stringify({ options, comparison })) > 65_536) return failure('LIMIT');
    return Object.freeze({ status: selected.length > 0 ? 'available' : complete ? 'empty' : 'unknown', complete,
      scope: current.scope, revision: current.revision, visited: query.visited, entries: Object.freeze(selected.map(item => item.entry)),
      options, comparison, issues: Object.freeze(issues), incompleteReasons: Object.freeze(incompleteReasons) });
  } catch { return failure(code); }
}
