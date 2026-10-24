/**
 * v0.10 record predicates shared by BUILD/activation/Host observers.
 *
 * Do not conflate the two semantics: the AST walker and BUILD's initial
 * shape scan need only a non-array object; authority-bearing data paths
 * require an actual plain/null-prototype record. These are structural
 * predicates, not trust/authorization checks; hostile Proxy traps propagate
 * to the existing typed refusal boundary.
 */
export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isObjectRecord(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
