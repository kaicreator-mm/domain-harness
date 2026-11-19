/**
 * CORE-002 lane r0 — gate review policy projection (Query strategy source).
 *
 * Declares which shared catalog gates this Element actually enforces and in
 * which mode. Advisory projection only; it never authorizes a closeout.
 */
import {currentGateCatalog,GATE_CATALOG_SCHEMA} from './gate-catalog.mjs';

/** Deterministic Query-strategy projection over the shared gate catalog. */
export function gateReviewPolicy(){
 const catalog=currentGateCatalog();
 if(catalog.schema!==GATE_CATALOG_SCHEMA)throw new TypeError('gate catalog schema mismatch');
 return Object.freeze({
  state:'DECLARED',
  catalogVersion:catalog.catalogVersion,
  enforcedGateIds:Object.freeze(Object.keys(catalog.gates)),
  mode:'advisory',
 });
}
