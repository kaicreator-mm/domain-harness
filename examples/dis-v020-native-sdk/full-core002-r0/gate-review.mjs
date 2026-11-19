/**
 * CORE-002 lane r0 — bounded readiness review (Workflow strategy source).
 *
 * Composes the shared gate catalog and the rule assessment into a single
 * advisory readiness verdict for one review. It never issues a closeout,
 * claim, Effect or release: advisoryOnly is always true.
 */
import {currentGateCatalog} from './gate-catalog.mjs';
import {assessEvidence} from './gate-rule.mjs';

/** Deterministic Workflow-strategy composition of catalog + rule. */
export function reviewReadiness({reviewId,records}){
 if(typeof reviewId!=='string'||reviewId.length===0)
  throw new TypeError('reviewId must be a non-empty string');
 const catalog=currentGateCatalog();
 const assessment=assessEvidence({records});
 const state=assessment.state==='ALL_SATISFIED'?'READY_FOR_CLOSEOUT':
  assessment.state==='GATES_VIOLATED'?'BLOCKED':'UNDECIDED';
 return Object.freeze({
  state,
  reviewId,
  gates:assessment.gates,
  advisoryOnly:true,
  catalogVersion:catalog.catalogVersion,
 });
}
