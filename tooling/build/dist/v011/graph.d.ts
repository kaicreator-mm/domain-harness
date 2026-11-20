/**
 * DomainHarness v0.11.0 T02 (#1576) — deterministic graph helpers.
 *
 * Minimal authoring-range semantics (exact `x.y.z`, caret `^x.y.z`, tilde
 * `~x.y.z`, wildcard `*`/`x`) cover the frozen authoring forms; anything else
 * is unresolvable (its caller maps that to the exact frozen refusal code).
 * Topological order is Kahn with a lexicographically-sorted ready set (L2
 * §5.3 tie-break) so repeated BUILD over identical input is byte-identical.
 */
export declare function satisfiesSemver(version: string, range: string): boolean;
/**
 * Kahn topological order over `nodes` with edges dependency -> dependent
 * taken from `dependencies` (node -> the nodes it depends on). The ready set
 * is consumed in lexicographic order. Returns null when the graph carries a
 * cycle.
 */
export declare function kahnTopologicalOrder(nodes: readonly string[], dependencies: ReadonlyMap<string, readonly string[]>): string[] | null;
