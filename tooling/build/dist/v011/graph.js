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
const RANGE_PATTERN = /^([\^~]?)(\d+)\.(\d+)\.(\d+)$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
export function satisfiesSemver(version, range) {
    // fail closed: a malformed/prerelease version never satisfies.
    if (!VERSION_PATTERN.test(version))
        return false;
    if (range === '*' || range === 'x')
        return true;
    const parsed = RANGE_PATTERN.exec(range);
    if (!parsed)
        return false; // malformed or prerelease range: refuse, never widen.
    const op = parsed[1] ?? '';
    const rMaj = Number.parseInt(parsed[2], 10);
    const rMin = Number.parseInt(parsed[3], 10);
    const rPat = Number.parseInt(parsed[4], 10);
    const [vMaj = 0, vMin = 0, vPat = 0] = version.split('.').map((part) => Number.parseInt(part, 10));
    if (op === '^') {
        if (rMaj > 0)
            return vMaj === rMaj && (vMin > rMin || (vMin === rMin && vPat >= rPat));
        if (rMin > 0)
            return vMaj === 0 && vMin === rMin && vPat >= rPat;
        // ^0.0.z pins the patch segment exactly.
        return vMaj === 0 && vMin === 0 && vPat === rPat;
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
export function kahnTopologicalOrder(nodes, dependencies) {
    const nodeSet = new Set(nodes);
    const remainingDeps = new Map();
    const dependents = new Map();
    for (const node of nodes) {
        const deps = new Set((dependencies.get(node) ?? []).filter((dep) => nodeSet.has(dep)));
        remainingDeps.set(node, deps);
        for (const dep of deps) {
            const list = dependents.get(dep) ?? new Set();
            list.add(node);
            dependents.set(dep, list);
        }
    }
    const ready = nodes.filter((node) => (remainingDeps.get(node)?.size ?? 0) === 0).sort();
    const order = [];
    while (ready.length > 0) {
        const next = ready.shift();
        order.push(next);
        for (const dependent of dependents.get(next) ?? []) {
            const deps = remainingDeps.get(dependent);
            deps.delete(next);
            if (deps.size === 0) {
                const insertAt = ready.findIndex((item) => item > dependent);
                if (insertAt === -1)
                    ready.push(dependent);
                else
                    ready.splice(insertAt, 0, dependent);
            }
        }
    }
    return order.length === nodes.length ? order : null;
}
/** Total strict-weak-order comparison over the frozen SemVer domain. */
export function compareSemver(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
