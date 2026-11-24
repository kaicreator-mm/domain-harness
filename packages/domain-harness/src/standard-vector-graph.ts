import { types } from 'node:util';

/** 领域选择由调用方负责；SDK 不定义候选记录或业务 Scope 的 Schema。 */
export interface VectorCandidate<T> {
  readonly id: string;
  readonly vector: readonly number[];
  readonly item: T;
}
export interface VectorQueryOptions {
  readonly topK: number;
  readonly maxVisited: number;
  readonly dimension: number;
  readonly metric: 'COSINE' | 'L2';
}
export interface VectorMatch<T> {
  readonly id: string;
  readonly item: T;
  /** 越小越近：COSINE = 1 - similarity；L2 = 欧几里得距离。 */
  readonly distance: number;
}
export interface VectorQueryResult<T> {
  readonly matches: readonly VectorMatch<T>[];
  readonly visited: number;
  readonly complete: boolean;
  readonly truncated: boolean;
  readonly truncationReason?: 'VISIT_LIMIT' | 'RESULT_LIMIT';
}
function budget(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
function invalid(message: string): never {
  throw new TypeError('DH_STD_QUERY_' + message);
}
function norm(vector: readonly number[], dimension: number): number {
  if (!Array.isArray(vector) || vector.length !== dimension) return invalid('VECTOR_DIMENSION');
  let result = 0;
  for (let i = 0; i < dimension; i += 1) {
    const value = vector[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) return invalid('VECTOR_VALUE');
    result = Math.hypot(result, value);
  }
  if (!Number.isFinite(result)) return invalid('VECTOR_OVERFLOW');
  return result;
}
function distance(a: readonly number[], b: readonly number[], metric: 'COSINE' | 'L2', na: number, nb: number): number {
  if (metric === 'L2') {
    let result = 0;
    for (let i = 0; i < a.length; i += 1) result = Math.hypot(result, (a[i] as number) - (b[i] as number));
    if (!Number.isFinite(result)) return invalid('VECTOR_OVERFLOW');
    return result;
  }
  if (na === 0 || nb === 0) return invalid('VECTOR_ZERO_NORM');
  let similarity = 0;
  for (let i = 0; i < a.length; i += 1) similarity += ((a[i] as number) / na) * ((b[i] as number) / nb);
  if (!Number.isFinite(similarity)) return invalid('VECTOR_OVERFLOW');
  return 1 - Math.max(-1, Math.min(1, similarity));
}

/** 有限内存 Top-K；Scope 回调只可为可信同步业务函数，不是安全沙箱。 */
export class VectorQueryElement {
  public search<T>(
    source: readonly VectorCandidate<T>[],
    query: readonly number[],
    inScope: (item: T) => boolean,
    options: VectorQueryOptions,
  ): VectorQueryResult<T> {
    if (!Array.isArray(source) || typeof inScope !== 'function' || types.isAsyncFunction(inScope) ||
        options === null || typeof options !== 'object') return invalid('VECTOR_INPUT');
    // 配额在调用任何业务 Scope 之前一次性快照并校验，后续回调不能修改本次上限。
    const { topK, maxVisited, dimension, metric } = options;
    if (!budget(topK) || !budget(maxVisited) || !Number.isSafeInteger(dimension) || dimension <= 0 ||
        (metric !== 'COSINE' && metric !== 'L2')) return invalid('VECTOR_INPUT');
    const queryNorm = norm(query, dimension);
    if (metric === 'COSINE' && queryNorm === 0) return invalid('VECTOR_ZERO_NORM');
    const matches: Array<VectorMatch<T> & { readonly sourceIndex: number }> = [];
    let visited = 0;
    const finish = (complete: boolean, reason?: 'VISIT_LIMIT' | 'RESULT_LIMIT'): VectorQueryResult<T> => {
      const selected = Object.freeze(matches.map(({ id, item, distance: d }) => Object.freeze({ id, item, distance: d })));
      return reason === undefined
        ? { matches: selected, visited, complete, truncated: false }
        : { matches: selected, visited, complete, truncated: true, truncationReason: reason };
    };
    if (source.length === 0) return finish(true);
    if (topK === 0) return finish(false, 'RESULT_LIMIT');
    for (let i = 0; i < source.length; i += 1) {
      if (visited >= maxVisited) return finish(false, 'VISIT_LIMIT');
      const candidate = source[i];
      if (!candidate || typeof candidate !== 'object') return invalid('VECTOR_CANDIDATE');
      visited += 1;
      const decision: unknown = inScope(candidate.item);
      if (typeof decision !== 'boolean') {
        if (types.isPromise(decision)) void Promise.prototype.then.call(decision, undefined, () => undefined);
        return invalid('SCOPE_RESULT');
      }
      if (!decision) continue;
      if (typeof candidate.id !== 'string' || candidate.id.length === 0) return invalid('VECTOR_ID');
      const candidateNorm = norm(candidate.vector, dimension);
      const metricDistance = distance(query, candidate.vector, metric, queryNorm, candidateNorm);
      matches.push({ id: candidate.id, item: candidate.item, distance: metricDistance, sourceIndex: i });
      matches.sort((left, right) => left.distance - right.distance ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : left.sourceIndex - right.sourceIndex));
      if (matches.length > topK) matches.pop();
    }
    return finish(true);
  }
}
export interface TypedGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly type: string;
}
export interface GraphQueryLimits {
  readonly maxDepth: number;
  /** 实际检查的原始边数量，包含方向或类型不匹配的边。 */
  readonly maxVisited: number;
  readonly maxReturned: number;
}
export interface GraphQueryOptions {
  readonly start: string;
  readonly target?: string;
  readonly direction: 'OUT' | 'IN' | 'BOTH';
  readonly relationTypes?: readonly string[];
  readonly limits: GraphQueryLimits;
}
export interface GraphPath {
  readonly nodes: readonly string[];
  readonly edgeTypes: readonly string[];
}
export interface GraphQueryResult {
  readonly paths: readonly GraphPath[];
  /** 每次实际检查一条原始边计一次；重复扩展仍计入预算。 */
  readonly visited: number;
  readonly complete: boolean;
  readonly truncated: boolean;
  readonly truncationReason?: 'VISIT_LIMIT' | 'RESULT_LIMIT';
}

/** 有向类型关系图的有限 BFS；每个节点最多产出一条最短发现路径。 */
export class GraphQueryElement {
  public search(edges: readonly TypedGraphEdge[], options: GraphQueryOptions): GraphQueryResult {
    if (!Array.isArray(edges) || !options || typeof options !== 'object') return invalid('GRAPH_INPUT');
    // 路径和边预算同样只接纳一份快照，避免重复 getter 读取带来不同合同。
    const { start, target, direction, limits, relationTypes } = options;
    if (typeof start !== 'string' || start.length === 0 ||
        (target !== undefined && (typeof target !== 'string' || target.length === 0)) ||
        (direction !== 'OUT' && direction !== 'IN' && direction !== 'BOTH') || !limits) {
      return invalid('GRAPH_INPUT');
    }
    const { maxDepth, maxVisited, maxReturned } = limits;
    if (!budget(maxDepth) || !budget(maxVisited) || !budget(maxReturned) ||
        (relationTypes !== undefined && (!Array.isArray(relationTypes) ||
          relationTypes.some(type => typeof type !== 'string' || type.length === 0)))) {
      return invalid('GRAPH_INPUT');
    }
    const typesToInclude = relationTypes === undefined ? undefined : new Set(relationTypes);
    const paths: GraphPath[] = [];
    let visited = 0;
    const finish = (complete: boolean, reason?: 'VISIT_LIMIT' | 'RESULT_LIMIT'): GraphQueryResult => {
      const result = Object.freeze(paths);
      return reason === undefined
        ? { paths: result, visited, complete, truncated: false }
        : { paths: result, visited, complete, truncated: true, truncationReason: reason };
    };
    if (target === start) {
      if (maxReturned === 0) return finish(false, 'RESULT_LIMIT');
      paths.push(Object.freeze({ nodes: Object.freeze([start]), edgeTypes: Object.freeze([]) }));
      return finish(true);
    }
    if (edges.length === 0 || maxDepth === 0) return finish(true);
    if (maxReturned === 0) return finish(false, 'RESULT_LIMIT');
    const seen = new Set<string>([start]);
    const queue: Array<{ readonly node: string; readonly path: readonly string[]; readonly types: readonly string[] }> = [
      { node: start, path: [start], types: [] },
    ];
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index] as (typeof queue)[number];
      if (item.types.length >= maxDepth) continue;
      for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
        if (visited >= maxVisited) return finish(false, 'VISIT_LIMIT');
        const edge = edges[edgeIndex];
        visited += 1;
        if (!edge || typeof edge.from !== 'string' || !edge.from ||
            typeof edge.to !== 'string' || !edge.to || typeof edge.type !== 'string' || !edge.type) {
          return invalid('GRAPH_EDGE');
        }
        if (typesToInclude !== undefined && !typesToInclude.has(edge.type)) continue;
        const next = direction === 'OUT' ? (edge.from === item.node ? edge.to : undefined)
          : direction === 'IN' ? (edge.to === item.node ? edge.from : undefined)
            : edge.from === item.node ? edge.to : edge.to === item.node ? edge.from : undefined;
        if (next === undefined || seen.has(next)) continue;
        seen.add(next);
        const nodes = [...item.path, next];
        const types = [...item.types, edge.type];
        queue.push({ node: next, path: nodes, types });
        if (target !== undefined && next !== target) continue;
        if (paths.length >= maxReturned) return finish(false, 'RESULT_LIMIT');
        paths.push(Object.freeze({ nodes: Object.freeze(nodes), edgeTypes: Object.freeze(types) }));
        if (target !== undefined) return finish(true);
      }
    }
    return finish(true);
  }
}
