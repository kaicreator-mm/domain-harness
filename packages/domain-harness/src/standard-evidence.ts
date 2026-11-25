/** 局部意图证据的来源类别；推荐只作为提案，默认需显式许可。 */
export type EvidenceOrigin = 'authority' | 'user' | 'derived' | 'default' | 'recommendation';
export type EvidenceObservation<K extends string, V> = Readonly<{
  key: K;
  origin: EvidenceOrigin;
  source: Readonly<{ id: string; scope: string; revision: string; validity?: Readonly<{ from: number; until: number }> }>;
}> & (Readonly<{ state: 'known'; value: V }> | Readonly<{ state: 'unknown' | 'not-applicable' }>);
export interface EvidenceRequirement<K extends string> {
  readonly key: K;
  readonly accepts: readonly Exclude<EvidenceOrigin, 'recommendation'>[];
}
export interface EvidenceContext {
  readonly scope: string;
  readonly revisions: ReadonlyMap<string, string>;
  readonly asOf?: number;
}
type Failure = Readonly<{ complete: false; reason: 'LIMIT' | 'INVALID_EVIDENCE' | 'INVALID_DEPENDENCY' | 'POLICY_FAILED' }>;
export type EvidenceResolution<K extends string, V> = Failure | Readonly<{
  complete: true;
  items: readonly (Readonly<{
    key: K;
    evidence: readonly EvidenceObservation<K, V>[];
    proposals: readonly EvidenceObservation<K, V>[];
  }> & (Readonly<{ status: 'resolved'; value: V }> | Readonly<{ status: 'missing'; reason: 'NO_OBSERVATION' }> |
    Readonly<{ status: 'unknown'; reason: 'NO_APPLICABLE_EVIDENCE' | 'NO_ACCEPTED_ORIGIN' | 'EXPLICIT_UNKNOWN' }> |
    Readonly<{ status: 'conflict'; reason: 'CONFLICTING_EVIDENCE' }> |
    Readonly<{ status: 'not-applicable'; reason: 'EXPLICIT_NOT_APPLICABLE' }>))[];
}>;
export interface EvidenceDependency<K extends string> { readonly key: K; readonly dependsOn: readonly K[] }
export type EvidenceInvalidation<K extends string> = Failure | Readonly<{ complete: true; stale: readonly K[]; retained: readonly K[] }>;

const MAX_ITEMS = 4096;
const MAX_DEPENDENCIES = 16384;
const origins: readonly EvidenceOrigin[] = ['authority', 'user', 'derived', 'default', 'recommendation'];
const failure = (reason: Failure['reason']): Failure => Object.freeze({ complete: false, reason });
const validLimit = (n: number, max: number): boolean => Number.isSafeInteger(n) && n >= 0 && n <= max;
const nonempty = (s: string): boolean => typeof s === 'string' && s.trim().length > 0;
const distinct = (xs: readonly unknown[]): boolean => new Set(xs).size === xs.length;

/** 证据值由可信域提供且保持不可变；复制冻结元数据，不复制任意业务对象。 */
function snapshot<K extends string, V>(item: EvidenceObservation<K, V>): EvidenceObservation<K, V> {
  const { id, scope, revision, validity } = item.source;
  const source = Object.freeze({ id, scope, revision, ...(validity === undefined ? {} : { validity: Object.freeze({ from: validity.from, until: validity.until }) }) });
  const base = { key: item.key, origin: item.origin, source };
  return item.state === 'known' ? Object.freeze({ ...base, state: item.state, value: item.value }) : Object.freeze({ ...base, state: item.state });
}

/** 只组织已取得的证据，不读取数据源。complete 表示遍历完整，不表示全部已确定。 */
export function resolveEvidence<K extends string, V>(
  requirements: readonly EvidenceRequirement<K>[], observations: readonly EvidenceObservation<K, V>[],
  context: EvidenceContext, policy: Readonly<{
    equal: (key: K, left: V, right: V) => boolean;
    rank?: (observation: EvidenceObservation<K, V>) => number;
  }>, maxItems: number,
): EvidenceResolution<K, V> {
  if (!validLimit(maxItems, MAX_ITEMS) || requirements.length > maxItems || observations.length > maxItems || context.revisions.size > maxItems) return failure('LIMIT');
  if (!nonempty(context.scope) || (context.asOf !== undefined && !Number.isFinite(context.asOf))) return failure('INVALID_EVIDENCE');
  const grouped = new Map<K, EvidenceObservation<K, V>[]>();
  for (const req of requirements) {
    if (!nonempty(req.key) || grouped.has(req.key) || !req.accepts.length || req.accepts.length > 4 || !distinct(req.accepts) ||
        req.accepts.some(origin => !origins.slice(0, 4).includes(origin))) return failure('INVALID_EVIDENCE');
    grouped.set(req.key, []);
  }
  for (const item of observations) {
    const bucket = grouped.get(item.key), source = item.source, validity = source.validity;
    if (!bucket || !origins.includes(item.origin) || !nonempty(source.id) || !nonempty(source.scope) || !nonempty(source.revision) ||
        !['known', 'unknown', 'not-applicable'].includes(item.state) || (item.state === 'known' && (!Object.hasOwn(item, 'value') || item.value === undefined)) ||
        (validity !== undefined && (!Number.isFinite(validity.from) || !Number.isFinite(validity.until) || validity.from >= validity.until))) return failure('INVALID_EVIDENCE');
    bucket.push(snapshot(item));
  }
  type Item = Extract<EvidenceResolution<K, V>, { complete: true }>['items'][number];
  const items: Item[] = [];
  try {
    for (const req of requirements) {
      const all = grouped.get(req.key)!;
      const applicable = all.filter(item => item.source.scope === context.scope && context.revisions.get(item.source.id) === item.source.revision &&
        (item.source.validity === undefined || (context.asOf !== undefined && item.source.validity.from <= context.asOf && context.asOf < item.source.validity.until)));
      const proposals = Object.freeze(applicable.filter(item => item.state === 'known' && (item.origin === 'recommendation' || item.origin === 'default')));
      let highest = -Infinity;
      let selected: EvidenceObservation<K, V>[] = [];
      for (const item of applicable) {
        if (item.origin === 'recommendation' || !req.accepts.includes(item.origin)) continue;
        const rank = policy.rank === undefined ? 0 : policy.rank(item);
        if (!Number.isFinite(rank)) return failure('POLICY_FAILED');
        if (rank > highest) { highest = rank; selected = [item]; }
        else if (rank === highest) selected.push(item);
      }
      const base = { key: req.key, evidence: Object.freeze(selected), proposals };
      const known = selected.filter(item => item.state === 'known');
      const first = known[0];
      const mismatch = first !== undefined && known.slice(1).some(item => {
        const equal = policy.equal(req.key, first.value, item.value);
        if (typeof equal !== 'boolean') throw new Error('EVIDENCE_POLICY_RESULT');
        return !equal;
      });
      if (mismatch || (first !== undefined && selected.some(item => item.state === 'not-applicable'))) items.push(Object.freeze({ ...base, status: 'conflict', reason: 'CONFLICTING_EVIDENCE' }));
      else if (selected.some(item => item.state === 'unknown')) items.push(Object.freeze({ ...base, status: 'unknown', reason: 'EXPLICIT_UNKNOWN' }));
      else if (first !== undefined) items.push(Object.freeze({ ...base, status: 'resolved', value: first.value }));
      else if (selected.length > 0) items.push(Object.freeze({ ...base, status: 'not-applicable', reason: 'EXPLICIT_NOT_APPLICABLE' }));
      else if (all.length === 0) items.push(Object.freeze({ ...base, status: 'missing', reason: 'NO_OBSERVATION' }));
      else items.push(Object.freeze({ ...base, status: 'unknown', reason: applicable.length === 0 ? 'NO_APPLICABLE_EVIDENCE' : 'NO_ACCEPTED_ORIGIN' }));
    }
  } catch { return failure('POLICY_FAILED'); }
  return Object.freeze({ complete: true, items: Object.freeze(items) });
}

/** 当前意图的显式有限依赖；缺少声明时有变更即保守失效，空列表表示无依赖。 */
export function invalidateEvidence<K extends string>(keys: readonly K[], changed: readonly K[], declarations: readonly EvidenceDependency<K>[],
  limits: Readonly<{ maxItems: number; maxDependencies: number }>): EvidenceInvalidation<K> {
  const { maxItems, maxDependencies } = limits;
  if (!validLimit(maxItems, MAX_ITEMS) || !validLimit(maxDependencies, MAX_DEPENDENCIES) ||
      keys.length > maxItems || changed.length > maxItems || declarations.length > maxItems) return failure('LIMIT');
  const keySet = new Set(keys);
  if (keySet.size !== keys.length || keys.some(key => !nonempty(key)) || !distinct(changed) || changed.some(key => !keySet.has(key))) return failure('INVALID_DEPENDENCY');
  const children = new Map(keys.map(key => [key, [] as K[]]));
  const indegree = new Map(keys.map(key => [key, 0]));
  const declared = new Set<K>();
  let edges = 0;
  for (const { key, dependsOn } of declarations) {
    edges += dependsOn.length;
    if (edges > maxDependencies) return failure('LIMIT');
    if (!keySet.has(key) || declared.has(key) || !distinct(dependsOn) || dependsOn.some(parent => !keySet.has(parent))) return failure('INVALID_DEPENDENCY');
    declared.add(key);
    indegree.set(key, dependsOn.length);
    for (const parent of dependsOn) children.get(parent)!.push(key);
  }
  const stale = new Set(changed);
  if (changed.length > 0) for (const key of keys) if (!declared.has(key)) stale.add(key);
  const queue = keys.filter(key => indegree.get(key) === 0);
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i]!;
    for (const child of children.get(key)!) {
      if (stale.has(key)) stale.add(child);
      const remaining = indegree.get(child)! - 1;
      indegree.set(child, remaining);
      if (remaining === 0) queue.push(child);
    }
  }
  if (queue.length !== keys.length) return failure('INVALID_DEPENDENCY');
  return Object.freeze({ complete: true, stale: Object.freeze(keys.filter(key => stale.has(key))), retained: Object.freeze(keys.filter(key => !stale.has(key))) });
}
