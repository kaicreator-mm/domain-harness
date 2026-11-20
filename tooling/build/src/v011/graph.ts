/**
 * DomainHarness v0.11.0 T02 (#1576) — deterministic graph helpers.
 *
 * Minimal authoring-range semantics (exact `x.y.z`, caret `^x.y.z`, tilde
 * `~x.y.z`, wildcard `*`/`x`) cover the frozen authoring forms; anything else
 * is unresolvable (its caller maps that to the exact frozen refusal code).
 * Topological order is Kahn with a lexicographically-sorted ready set (L2
 * §5.3 tie-break) so repeated BUILD over identical input is byte-identical.
 */

const RANGE_PATTERN = /^([\^~]?)(\d+)\.(\d+)\.(\d+)$/;

export function satisfiesSemver(version: string, range: string): boolean {
  if (range === '*' || range === 'x') return true;
  const parsed = RANGE_PATTERN.exec(range);
  if (!parsed) return false;
  const op = parsed[1] ?? '';
  const rMaj = Number.parseInt(parsed[2]!, 10);
  const rMin = Number.parseInt(parsed[3]!, 10);
  const rPat = Number.parseInt(parsed[4]!, 10);
  const [vMaj = 0, vMin = 0, vPat = 0] = version.split('.').map((part) => Number.parseInt(part, 10));
  if (op === '^') {
    if (vMaj !== rMaj) return false;
    if (rMaj === 0) return vMin === rMin && vPat >= rPat;
    return vMin > rMin || (vMin === rMin && vPat >= rPat);
  }
  if (op === '~') {
    return vMaj === rMaj && vMin === rMin && vPat >= rPat;
  }
  return vMaj === rMaj && vMin === rMin && vPat === rPat;
}

/**
 * Kahn topological order over `nodes` with edges dependency -> dependent
 * taken from `dependencies` (node -> the nodes it depends on). The ready set
 * is consumed in lexicographic order. Returns null when the graph carries a
 * cycle.
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
