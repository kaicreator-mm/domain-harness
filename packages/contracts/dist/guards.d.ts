/**
 * v0.10 record predicates shared by BUILD/activation/Host observers.
 *
 * Do not conflate the two semantics: the AST walker and BUILD's initial
 * shape scan need only a non-array object; authority-bearing data paths
 * require an actual plain/null-prototype record. These are structural
 * predicates, not trust/authorization checks; hostile Proxy traps propagate
 * to the existing typed refusal boundary.
 */
export declare function isObjectRecord(value: unknown): value is Record<string, unknown>;
export declare function isPlainRecord(value: unknown): value is Record<string, unknown>;
