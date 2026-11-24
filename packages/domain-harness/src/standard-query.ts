/** 有界查询预算由调用方设定；SDK 不规定领域数据的 Schema 或适用性。 */
export interface BoundedQueryLimits {
  readonly maxVisited: number;
  readonly maxReturned: number;
}

export type BoundedQueryTruncationReason = 'VISIT_LIMIT' | 'RESULT_LIMIT';

/** complete 表示所有输入记录均已判断；部分结果不可当作完整事实。 */
export interface BoundedQueryResult<T> {
  readonly items: readonly T[];
  readonly visited: number;
  readonly complete: boolean;
  readonly truncated: boolean;
  readonly truncationReason?: BoundedQueryTruncationReason;
}

function validLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function truncated<T>(
  items: readonly T[], visited: number, reason: BoundedQueryTruncationReason,
): BoundedQueryResult<T> {
  return {
    items: Object.freeze(items), visited, complete: false,
    truncated: true, truncationReason: reason,
  };
}

/**
 * 同步、无副作用的 Standard 查询封装；领域过滤条件来自可信生成期业务代码。
 * 保留调用方源顺序，不隐式排序，也不将截断的候选列表视为完备结论。
 */
export class BoundedQueryElement {
  public select<T>(
    source: readonly T[],
    predicate: (item: T) => boolean,
    limits: BoundedQueryLimits,
  ): BoundedQueryResult<T> {
    if (!Array.isArray(source) || typeof predicate !== 'function' ||
        limits === null || typeof limits !== 'object' ||
        !validLimit(limits.maxVisited) || !validLimit(limits.maxReturned)) {
      throw new TypeError('DH_STD_QUERY_INVALID_INPUT');
    }

    const items: T[] = [];
    const length = source.length;
    if (length === 0) {
      return { items: Object.freeze(items), visited: 0, complete: true, truncated: false };
    }
    // 当两个限制均为零时 RESULT_LIMIT 优先；任何一项都不能推断全量事实。
    if (limits.maxReturned === 0) return truncated(items, 0, 'RESULT_LIMIT');
    if (limits.maxVisited === 0) return truncated(items, 0, 'VISIT_LIMIT');

    let visited = 0;
    for (let index = 0; index < length; index += 1) {
      if (visited === limits.maxVisited) return truncated(items, visited, 'VISIT_LIMIT');
      const selected: unknown = predicate(source[index] as T);
      if (typeof selected !== 'boolean') {
        throw new TypeError('DH_STD_QUERY_INVALID_PREDICATE_RESULT');
      }
      visited += 1;
      if (selected) {
        items.push(source[index] as T);
        // 已达结果上限，但绝不超出源限额去窥视余项。
        if (items.length === limits.maxReturned && index < length - 1) {
          return truncated(items, visited, 'RESULT_LIMIT');
        }
      }
    }
    return { items: Object.freeze(items), visited, complete: true, truncated: false };
  }
}
