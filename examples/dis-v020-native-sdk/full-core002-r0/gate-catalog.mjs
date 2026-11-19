/**
 * CORE-002 lane r0 — shared gate catalog (Knowledge/Query strategy source).
 *
 * Single source of truth for the evidence gate review Element's declared
 * gates. This is an in-repo engineering responsibility (lane closeout
 * evidence gating), authored in this lane; it is NOT an external original
 * business Element and claims no independent semantic authority.
 */
export const GATE_CATALOG_SCHEMA='core002.gate-catalog/1';
export const GATE_CATALOG_VERSION='1.0.0';

const GATES=Object.freeze({
 'gate.native-tests-green':Object.freeze({
  kind:'native-test',
  requirement:'every native test evidence record reports exitCode 0'}),
 'gate.ci-pipeline-green':Object.freeze({
  kind:'ci-pipeline',
  requirement:'every CI pipeline evidence record reports status SUCCESS'}),
 'gate.independent-review-present':Object.freeze({
  kind:'review',
  requirement:'at least one review record whose reviewer differs from the writer'}),
});

/** Deterministic Query-strategy read of the declared gate catalog. */
export function currentGateCatalog(){
 return Object.freeze({
  schema:GATE_CATALOG_SCHEMA,
  catalogVersion:GATE_CATALOG_VERSION,
  state:'DECLARED',
  gates:GATES,
 });
}
