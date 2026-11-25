/** 当前领域判断，不将未知或冲突当成否定。 */
export type DecisionCondition = 'yes' | 'no' | 'unknown' | 'conflict';
export interface DecisionDescription<K extends string> {
  readonly key: K;
  readonly dependsOn: readonly K[];
  readonly applicable: DecisionCondition;
  readonly required: DecisionCondition;
  readonly satisfied: DecisionCondition;
  readonly priority: number;
}
type Row<K extends string> = Readonly<{
  key: K;
  disposition: 'satisfied' | 'skipped' | 'eligible' | 'unresolved' | 'blocked' | 'conflict';
  reason: 'SATISFIED' | 'NOT_APPLICABLE' | 'NOT_REQUIRED' | 'NEEDS_DECISION' | 'APPLICABILITY' | 'NECESSITY' | 'SATISFACTION' | 'DEPENDENCY';
  blockedBy: readonly K[];
}>;
export type DecisionSelection<K extends string> = Readonly<{ complete: false; reason: 'LIMIT' | 'INVALID_DECISION' | 'INVALID_DEPENDENCY' }> |
  (Readonly<{ complete: true; rows: readonly Row<K>[] }> & (Readonly<{ status: 'next'; key: K }> |
    Readonly<{ status: 'ready' | 'unresolved' | 'blocked' | 'conflict' }>));

const validLimit = (n: number, max: number): boolean => Number.isSafeInteger(n) && n >= 0 && n <= max;
const validCondition = (value: DecisionCondition): boolean => ['yes', 'no', 'unknown', 'conflict'].includes(value);
const failure = (reason: Extract<DecisionSelection<string>, { complete: false }>['reason']) => Object.freeze({ complete: false as const, reason });
function dense(xs: readonly unknown[]): boolean {
  for (let i = 0; i < xs.length; i++) if (!Object.hasOwn(xs, i)) return false;
  return true;
}

/** 根据当前证据的领域判断选择必要决策；不执行领域规则、工作流或外部操作。 */
export function selectNextDecision<K extends string>(decisions: readonly DecisionDescription<K>[],
  limits: Readonly<{ maxItems: number; maxDependencies: number }>): DecisionSelection<K> {
  if (!validLimit(limits.maxItems, 4096) || !validLimit(limits.maxDependencies, 16384) || decisions.length > limits.maxItems) return failure('LIMIT');
  if (!dense(decisions)) return failure('INVALID_DECISION');
  const byKey = new Map<K, DecisionDescription<K>>();
  const children = new Map<K, K[]>();
  const indegree = new Map<K, number>();
  for (const d of decisions) {
    if (typeof d.key !== 'string' || !d.key.trim() || byKey.has(d.key) || !Number.isFinite(d.priority) ||
      !validCondition(d.applicable) || !validCondition(d.required) || !validCondition(d.satisfied)) return failure('INVALID_DECISION');
    byKey.set(d.key, d);
    children.set(d.key, []);
  }
  let edges = 0;
  for (const d of decisions) {
    edges += d.dependsOn.length;
    if (edges > limits.maxDependencies) return failure('LIMIT');
    if (!dense(d.dependsOn) || new Set(d.dependsOn).size !== d.dependsOn.length || d.dependsOn.some(key => !byKey.has(key))) return failure('INVALID_DEPENDENCY');
    indegree.set(d.key, d.dependsOn.length);
    for (const parent of d.dependsOn) children.get(parent)!.push(d.key);
  }
  const queue = decisions.filter(d => indegree.get(d.key) === 0).map(d => d.key);
  const available = new Set<K>();
  const evaluated = new Map<K, Row<K>>();
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i]!;
    const d = byKey.get(key)!;
    const blockedBy = Object.freeze(d.dependsOn.filter(parent => !available.has(parent)));
    const row = (disposition: Row<K>['disposition'], reason: Row<K>['reason']): Row<K> => Object.freeze({ key, disposition, reason, blockedBy });
    const uncertain = (value: DecisionCondition, reason: Row<K>['reason']): Row<K> => row(value === 'conflict' ? 'conflict' : 'unresolved', reason);
    let current: Row<K>;
    if (d.applicable === 'no') current = row('skipped', 'NOT_APPLICABLE');
    else if (d.applicable !== 'yes') current = uncertain(d.applicable, 'APPLICABILITY');
    else if (d.required === 'no') {
      current = row('skipped', 'NOT_REQUIRED');
      if (d.satisfied === 'yes' && blockedBy.length === 0) available.add(key);
    } else if (d.required !== 'yes') current = uncertain(d.required, 'NECESSITY');
    else if (d.satisfied === 'unknown' || d.satisfied === 'conflict') current = uncertain(d.satisfied, 'SATISFACTION');
    else if (blockedBy.length > 0) current = row('blocked', 'DEPENDENCY');
    else if (d.satisfied === 'yes') { current = row('satisfied', 'SATISFIED'); available.add(key); }
    else current = row('eligible', 'NEEDS_DECISION');
    evaluated.set(key, current);
    for (const child of children.get(key)!) {
      const remaining = indegree.get(child)! - 1;
      indegree.set(child, remaining);
      if (remaining === 0) queue.push(child);
    }
  }
  if (queue.length !== decisions.length) return failure('INVALID_DEPENDENCY');
  const rows = Object.freeze(decisions.map(d => evaluated.get(d.key)!));
  let best: DecisionDescription<K> | undefined;
  for (const d of decisions) {
    if (evaluated.get(d.key)!.disposition === 'eligible' && (best === undefined || d.priority > best.priority)) best = d;
  }
  const base = { complete: true as const, rows };
  if (best !== undefined) return Object.freeze({ ...base, status: 'next', key: best.key });
  if (rows.some(r => r.disposition === 'conflict')) return Object.freeze({ ...base, status: 'conflict' });
  if (rows.some(r => r.disposition === 'unresolved')) return Object.freeze({ ...base, status: 'unresolved' });
  if (rows.some(r => r.disposition === 'blocked')) return Object.freeze({ ...base, status: 'blocked' });
  return Object.freeze({ ...base, status: 'ready' });
}
