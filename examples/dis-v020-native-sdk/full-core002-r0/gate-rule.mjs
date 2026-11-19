/**
 * CORE-002 lane r0 — evidence assessment (Rule strategy source).
 *
 * Evaluates supplied evidence records against the shared gate catalog.
 * Unrecognized record kinds and gates without any record fail to UNDECIDED —
 * they never silently pass. The result is an advisory rule observation, not
 * an authority-bearing closeout decision.
 */
import {currentGateCatalog} from './gate-catalog.mjs';

const PRESENCE_GATE='gate.independent-review-present';

const isNonEmptyString=value=>typeof value==='string'&&value.length>0;
const judged=(gateId,rec)=>{
 if(gateId==='gate.native-tests-green')return rec.exitCode===0;
 if(gateId==='gate.ci-pipeline-green')return rec.status==='SUCCESS';
 if(gateId===PRESENCE_GATE)
  return isNonEmptyString(rec.reviewer)&&isNonEmptyString(rec.writer)&&
   rec.reviewer!==rec.writer;
 return false;
};

/** Deterministic Rule-strategy assessment over supplied evidence records. */
export function assessEvidence({records}){
 if(!Array.isArray(records))throw new TypeError('records must be an array');
 const catalog=currentGateCatalog();
 const decisions={};
 for(const gateId of Object.keys(catalog.gates))
  decisions[gateId]={state:'SATISFIED',satisfied:[],violated:[]};
 const satisfied=[],violated=[],undecidableIds=[];
 for(const rec of records){
  if(rec===null||typeof rec!=='object'||Array.isArray(rec)){
   undecidableIds.push('malformed-record');continue;
  }
  const id=isNonEmptyString(rec.id)?rec.id:'malformed-record';
  let matched=false;
  for(const [gateId,gate] of Object.entries(catalog.gates)){
   if(gate.kind!==rec.kind)continue;
   matched=true;
   (judged(gateId,rec)?decisions[gateId].satisfied:decisions[gateId].violated)
    .push(id);
  }
  if(!matched)undecidableIds.push(id);
 }
 // A presence gate with no records at all is violated, not undecided: the
 // gate demands at least one qualifying record.
 const presence=decisions[PRESENCE_GATE];
 if(presence.satisfied.length===0&&presence.violated.length===0)
  presence.violated.push('missing-review-record');
 let anyViolated=false,anyUndecided=undecidableIds.length>0;
 for(const decision of Object.values(decisions)){
  if(decision.violated.length>0){decision.state='VIOLATED';anyViolated=true}
  else if(decision.satisfied.length===0){decision.state='UNDECIDED';anyUndecided=true}
  for(const id of decision.satisfied)satisfied.push(id);
  for(const id of decision.violated)violated.push(id);
 }
 const state=anyUndecided?'UNDECIDED':anyViolated?'GATES_VIOLATED':'ALL_SATISFIED';
 return Object.freeze({
  state,
  gates:Object.freeze(Object.fromEntries(Object.entries(decisions).map(
   ([gateId,decision])=>[gateId,Object.freeze({
    state:decision.state,
    satisfied:Object.freeze([...decision.satisfied]),
    violated:Object.freeze([...decision.violated]),
   })]))),
  satisfied:Object.freeze(satisfied),
  violated:Object.freeze(violated),
  undecidableIds:Object.freeze(undecidableIds),
  catalogVersion:catalog.catalogVersion,
 });
}
