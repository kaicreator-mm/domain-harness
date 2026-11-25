/** 私有语义数据检查；调用者先保证集合长度有限。不是公开 SDK 入口。 */
export function dense(xs: readonly unknown[]): boolean {
  for (let i = 0; i < xs.length; i++) if (!Object.hasOwn(xs, i)) return false;
  return true;
}
export function validLimit(n: number, max: number): boolean {
  return Number.isSafeInteger(n) && n >= 0 && n <= max;
}
export function opaqueId(value: unknown): value is string {
  return typeof value === 'string' && value !== 'constructor' && value !== 'prototype' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(value);
}

/** 仅排序已验证、有界、由调用者创建的局部图；不运行任务或判定领域依赖。 */
export function dependencyOrder<K extends string>(keys: readonly K[], children: ReadonlyMap<K, readonly K[]>, indegree: ReadonlyMap<K, number>): readonly K[] | undefined {
  const remaining = new Map(indegree);
  const order = keys.filter(key => remaining.get(key) === 0);
  for (let i = 0; i < order.length; i++) {
    for (const child of children.get(order[i]!)!) {
      const count = remaining.get(child)! - 1;
      remaining.set(child, count);
      if (count === 0) order.push(child);
    }
  }
  return order.length === keys.length ? order : undefined;
}
