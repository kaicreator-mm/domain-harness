/**
 * Issue #11 / G4 preparation: deterministic, digest-bound Solution CANDIDATE.
 *
 * This does not run a solver, attest a process or accept an LLM/author's
 * semantic-review claim. Unqualified packages cannot be replayed as answers.
 */
import { createHash } from "node:crypto";
import { assessMethod } from "./method-planner.mjs";

const sha = /^[a-f0-9]{64}$/;
const ident = /^[a-z][a-z0-9_.-]{0,79}$/;
const keys = ["schema","source_id","source_sha256","oracle_id","oracle_sha256",
  "model_sha256","tool_id","tool_version","tool_binary_sha256","platform",
  "evidence_sha256","evidence_gate"];
const plain = x => x && typeof x === "object" && !Array.isArray(x) &&
  Object.getPrototypeOf(x) === Object.prototype;
const canonical = x => Array.isArray(x) ? x.map(canonical) :
  plain(x) ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])) : x;
const digest = x => createHash("sha256").update(JSON.stringify(canonical(x))).digest("hex");
const denied = issue => ({status:"BLOCKED",issues:[issue],solution_promotable:false,
  replay_allowed:false,claim_result:"UNVERIFIED"});
function parse(text,cap=131072) {
  if(typeof text!=="string" || Buffer.byteLength(text,"utf8")>cap)throw Error("bounded JSON text required");
  const data=JSON.parse(text);
  if(!plain(data))throw Error("expected JSON record");
  return data;
}
function provenanceValid(p) {
  return plain(p) && Object.keys(p).length===keys.length && keys.every(k=>Object.hasOwn(p,k)) &&
    keys.every(k=>typeof p[k]==="string") &&
    p.schema==="formal-tools/solution-provenance/0.1" &&
    [p.source_id,p.oracle_id,p.tool_id].every(x=>ident.test(x)) &&
    [p.source_sha256,p.oracle_sha256,p.model_sha256,p.tool_binary_sha256,p.evidence_sha256].every(x=>sha.test(x)) &&
    p.tool_version.length>0 && p.tool_version.length<=96 &&
    p.platform.length>0 && p.platform.length<=96 &&
    ["NOT_RUN","BYTES_BOUND_UNATTESTED"].includes(p.evidence_gate);
}

/** Accept only JSON strings, not getter-bearing JS records or spoofable arrays.
 * @param {{problem_json?:string,method_json?:string,provenance_json?:string}} input
 * @returns {any}
 */
export function sealSolutionCandidate({problem_json,method_json,provenance_json}={}) {
  try {
    const problem=parse(problem_json), method=parse(method_json), provenance=parse(provenance_json);
    if(!provenanceValid(provenance))return denied("invalid or falsely promoted provenance");
    const check=assessMethod(problem,method);
    if(check.status!=="STRUCTURALLY_VALID"||check.candidate_tools_present)
      return denied("no valid native-only G2 Method DAG");
    const source=problem.source_refs.find(s=>s.id===provenance.source_id);
    const oracle=problem.oracles.find(o=>o.id===provenance.oracle_id);
    if(!source||source.sha256!==provenance.source_sha256||!oracle||
       oracle.source_ref!==provenance.source_id||
       oracle.frozen!==true||provenance.oracle_sha256!==source.sha256)
      return denied("source/oracle does not match frozen G2 authority");
    if(!method.oracle_ids.includes(provenance.oracle_id) ||
       !method.steps.some(s=>s.tool_id===provenance.tool_id))
      return denied("tool or frozen oracle is not in accepted Method");
    const candidate={
      schema:"formal-tools/solution-candidate/0.1",
      status:"CANDIDATE",problem_id:problem.problem_id,method_id:method.method_id,
      problem_sha256:check.problem_sha256,method_sha256:check.method_sha256,
      provenance,qualification:"NOT_ADMITTED",
      claim_result:"UNVERIFIED",replay_allowed:false,solution_promotable:false
    };
    return {...candidate,candidate_sha256:digest(candidate)};
  }catch{return denied("invalid, hostile or unbounded candidate input");}
}

/**
 * Compare a candidate's sealed provenance against a new exact environment
 * snapshot. Even an exact match is ONLY a preflight, not a trusted replay.
 */
/** @param {string} candidate_json @param {string} current_provenance_json @returns {any} */
export function inspectCandidateReplay(candidate_json,current_provenance_json) {
  try {
    const c=parse(candidate_json),now=parse(current_provenance_json);
    const required=["schema","status","problem_id","method_id","problem_sha256","method_sha256",
      "provenance","qualification","claim_result","replay_allowed","solution_promotable",
      "candidate_sha256"];
    if(Object.keys(c).length!==required.length||required.some(k=>!Object.hasOwn(c,k)) ||
       c.schema!=="formal-tools/solution-candidate/0.1"||c.status!=="CANDIDATE" ||
       !sha.test(c.problem_sha256)||!sha.test(c.method_sha256)||!sha.test(c.candidate_sha256)||
       c.qualification!=="NOT_ADMITTED"||c.claim_result!=="UNVERIFIED" ||
       c.replay_allowed!==false||c.solution_promotable!==false||!provenanceValid(c.provenance))
      return denied("candidate schema or qualification claim invalid");
    const {candidate_sha256,...body}=c;
    if(digest(body)!==candidate_sha256)return denied("candidate content hash mismatch");
    if(!provenanceValid(now))return denied("invalid current provenance");
    const changed=keys.filter(k=>c.provenance[k]!==now[k]);
    if(changed.length)return {status:"STALE",changed_fields:changed,
      claim_result:"UNVERIFIED",replay_allowed:false,solution_promotable:false};
    return {status:"REPLAY_BLOCKED_UNQUALIFIED",changed_fields:[],
      fingerprint:c.candidate_sha256,claim_result:"UNVERIFIED",
      replay_allowed:false,solution_promotable:false};
  }catch{return denied("malformed replay request");}
}
