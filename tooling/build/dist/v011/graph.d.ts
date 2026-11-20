/**
 * DomainHarness v0.11.0 T02 (#1576) — deterministic graph helpers.
 *
 * Minimal authoring-range semantics with fail-closed parsing: exact `x.y.z`,
 * caret `^x.y.z`, tilde `~x.y.z`, wildcard `*`/`x`. Caret on the 0.x line pins
 * tightly per semver (^0.0.z is an exact pin); malformed ranges, prerelease
 * strings and non-semver versions are REJECTED (false) rather than silently
 * widened — their callers map that to the exact frozen refusal code.
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
/** Total strict-weak-order comparison over the frozen SemVer domain. */
export declare function compareSemver(a: string, b: string): number;
