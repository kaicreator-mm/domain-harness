/** 构建期职责：校验并封存选定的依赖、资源和函数，保证生成确定性 Lock。 */

const RANGE_PATTERN = /^([\^~]?)(\d+)\.(\d+)\.(\d+)$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function satisfiesSemver(version: string, range: string): boolean {
  if (!VERSION_PATTERN.test(version)) return false;
  if (range === '*' || range === 'x') return true;
  const parsed = RANGE_PATTERN.exec(range);
  if (!parsed) return false;
  const op = parsed[1] ?? '';
  const rMaj = Number.parseInt(parsed[2]!, 10);
  const rMin = Number.parseInt(parsed[3]!, 10);
  const rPat = Number.parseInt(parsed[4]!, 10);
  const [vMaj = 0, vMin = 0, vPat = 0] = version.split('.').map((part) => Number.parseInt(part, 10));
  if (op === '^') {
    if (rMaj > 0) return vMaj === rMaj && (vMin > rMin || (vMin === rMin && vPat >= rPat));
    if (rMin > 0) return vMaj === 0 && vMin === rMin && vPat >= rPat;
    return vMaj === 0 && vMin === 0 && vPat === rPat;
  }
  if (op === '~') {
    return vMaj === rMaj && vMin === rMin && vPat >= rPat;
  }
  return vMaj === rMaj && vMin === rMin && vPat === rPat;
}

/**
 * 对已选依赖图进行稳定 Kahn 拓扑排序；同一依赖集合按字典序处理就绪节点，
 * 保证 Lock 构建复现性。返回 null 表示仍有依赖环，调用方必须拒绝。
 */
export function kahnTopologicalOrder(
  nodes: readonly string[],
  dependencies: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const nodeSet = new Set(nodes);
  const remainingDeps = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  for (const node of nodes) {
    const deps = new Set((dependencies.get(node) ?? []).filter((dep) => nodeSet.has(dep)));
    remainingDeps.set(node, deps);
    for (const dep of deps) {
      const list = dependents.get(dep) ?? new Set<string>();
      list.add(node);
      dependents.set(dep, list);
    }
  }
  const ready = nodes.filter((node) => (remainingDeps.get(node)?.size ?? 0) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const next = ready.shift()!;
    order.push(next);
    for (const dependent of dependents.get(next) ?? []) {
      const deps = remainingDeps.get(dependent)!;
      deps.delete(next);
      if (deps.size === 0) {
        const insertAt = ready.findIndex((item) => item > dependent);
        if (insertAt === -1) ready.push(dependent);
        else ready.splice(insertAt, 0, dependent);
      }
    }
  }
  return order.length === nodes.length ? order : null;
}

export function compareSemver(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
