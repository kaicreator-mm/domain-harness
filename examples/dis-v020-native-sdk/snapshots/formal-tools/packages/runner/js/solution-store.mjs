/**
 * Issue #11 / G4: owner-local, content-addressed, fail-closed Solution candidate store.
 *
 * It persists candidate metadata, NOT a reusable executable Solution.
 * No caller, LLM or test can authorize semantic promotion via this module.
 */
import { open, link, unlink, lstat, realpath, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { sealSolutionCandidate, inspectCandidateReplay } from "./solution-candidate.mjs";

const SHA=/^[a-f0-9]{64}$/;
const MAX=131072;
const REASONS=new Set([
  "SOURCE_REVOKED","ORACLE_REVOKED","MODEL_REVOKED",
  "TOOL_REVOKED","EVIDENCE_REVOKED","OPERATOR_REVOKED"
]);
const denied=reason=>({status:"BLOCKED",issues:[reason],claim_result:"UNVERIFIED",
  replay_allowed:false,solution_promotable:false});
const notReusable=(status,extra={})=>({status,claim_result:"UNVERIFIED",
  replay_allowed:false,solution_promotable:false,...extra});

async function ownerDirectory(directory) {
  if(typeof directory!=="string"||!isAbsolute(directory)||!directory)
    throw new Error("explicit absolute owner-local store directory required");
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())
    throw new Error("store root must be a real directory");
  return await realpath(directory);
}
function candidatePath(root,id) {return join(root,"candidate-"+id+".json");}
function revokePath(root,id) {return join(root,"candidate-"+id+".revoked.json");}
async function boundedRegularFile(file) {
  const stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<=0||stat.size>MAX)
    throw new Error("candidate or revocation marker is not a bounded regular file");
  return await readFile(file,"utf8");
}
async function revocationExists(file) {
  try {await boundedRegularFile(file);return true;}
  catch(err) {if(err?.code==="ENOENT")return false;throw err;}
}
// Publish only complete, fsync'ed bytes. A hard link is an atomic NO-REPLACE
// operation in the same directory; rename() could overwrite a live tombstone.
// A crash before publication leaves at most a .pending orphan, not a partial
// candidate or revocation visible at its final content-addressed path.
// Directory fsync is platform-dependent (win32/NTFS: EPERM). Exactly these
// codes mean "unsupported": fail closed with zero writes. Any other probe
// error is a real failure and rethrows.
const DIR_FSYNC_UNSUPPORTED=new Set(["EPERM","EINVAL","EOPNOTSUPP","ENOSYS","ENOTTY"]);
const STORE_UNSUPPORTED="store directory does not support directory fsync;"+
  " the owner must provision a local POSIX-style store directory;"+
  " nothing was written, provision a supported store and retry";
const PUBLISHED_NOT_DURABLE="record may exist at its final path but is not"+
  " directory-durable; re-inspect via inspectStoredReplay or retry"+
  " persist/revoke before relying on this state";
async function probeDirectorySync(root) {
  let dir;
  try {
    dir=await open(root,"r");
    await dir.sync();
    return true;
  } catch(err) {
    if(DIR_FSYNC_UNSUPPORTED.has(err?.code))return false;
    throw err;
  } finally {await dir?.close();}
}
async function syncDirectory(root) {
  let dir;
  try {
    dir=await open(root,"r");
    await dir.sync();
  } finally {await dir?.close();}
}
async function exclusiveWrite(root,file,text) {
  // Durability invariant: NEW/EXISTING is returned only when THIS operation
  // performed at least one successful directory fsync. The probe IS that fsync
  // for an idempotent EEXIST answer (it flushes prior directory entries);
  // NEW fsyncs again after link(). An unsupported probe aborts before any write.
  if(!await probeDirectorySync(root))return "UNSUPPORTED";
  const temp=join(root,".pending-"+randomUUID());
  let handle;
  try {
    handle=await open(temp,"wx",0o600);
    await handle.writeFile(text,"utf8");
    await handle.sync();
    await handle.close();
    handle=undefined;
    try {
      await link(temp,file);
    } catch(err) {
      if(err?.code!=="EEXIST")throw err;
      if(await boundedRegularFile(file)!==text)
        throw new Error("existing record content differs");
      return "EXISTING";
    }
    // Keep inode/link durable over process crash on POSIX local filesystems.
    // The probe passed, so this should succeed; if it still fails, the record
    // IS published at its final path but NOT directory-durable — never pretend.
    try {await syncDirectory(root);}
    catch {return "PUBLISHED_NOT_DURABLE";}
    return "NEW";
  } finally {
    await handle?.close();
    await unlink(temp).catch(err=>{if(err?.code!=="ENOENT")throw err;});
  }
}
/**
 * Strictly seal the original Problem/Method/provenance through G2 before storing.
 * The directory must be provisioned by the trusted local owner (no global cache).
 */
/** @param {{store_dir?:string,problem_json?:string,method_json?:string,provenance_json?:string}} [args] @returns {Promise<any>} */
export async function persistSolutionCandidate({store_dir,problem_json,method_json,provenance_json}={}) {
  try {
    const candidate=sealSolutionCandidate({problem_json,method_json,provenance_json});
    if(candidate.status!=="CANDIDATE"||!SHA.test(candidate.candidate_sha256))
      return denied("unqualified or invalid candidate");
    const root=await ownerDirectory(store_dir);
    const serialized=JSON.stringify(candidate)+"\n";
    if(Buffer.byteLength(serialized,"utf8")>MAX)return denied("oversized candidate record");
    const preflight=inspectCandidateReplay(JSON.stringify(candidate),provenance_json);
    if(preflight.status!=="REPLAY_BLOCKED_UNQUALIFIED")
      return denied("candidate preflight did not fail closed");
    // A permanent tombstone must dominate even an identical existing candidate.
    // This double check provides a clear linearization point; a subsequent
    // concurrent revoke is authoritative and readers must re-inspect.
    if(await revocationExists(revokePath(root,candidate.candidate_sha256)))
      return notReusable("INVALIDATED",{reason:"EXPLICIT_REVOCATION"});
    const stored=await exclusiveWrite(root,candidatePath(root,candidate.candidate_sha256),serialized);
    if(stored==="UNSUPPORTED")return denied(STORE_UNSUPPORTED);
    if(stored==="PUBLISHED_NOT_DURABLE")return denied(PUBLISHED_NOT_DURABLE);
    if(await revocationExists(revokePath(root,candidate.candidate_sha256)))
      return notReusable("INVALIDATED",{reason:"EXPLICIT_REVOCATION"});
    return notReusable("CANDIDATE_PERSISTED",{
      candidate_sha256:candidate.candidate_sha256,record_write:stored});
  } catch {return denied("candidate store write or validation failed");}
}

/** Read the exact stored bytes, reject a mutation, version drift or revocation. */
/** @param {{store_dir?:string,candidate_sha256?:string,current_provenance_json?:string}} [args] @returns {Promise<any>} */
export async function inspectStoredReplay({store_dir,candidate_sha256,current_provenance_json}={}) {
  try {
    if(!SHA.test(candidate_sha256))return denied("invalid candidate identifier");
    const root=await ownerDirectory(store_dir);
    if(await revocationExists(revokePath(root,candidate_sha256)))
      return notReusable("INVALIDATED",{reason:"EXPLICIT_REVOCATION"});
    const source=await boundedRegularFile(candidatePath(root,candidate_sha256));
    const record=JSON.parse(source);
    if(record?.candidate_sha256!==candidate_sha256)
      return denied("stored record identity mismatch");
    return inspectCandidateReplay(JSON.stringify(record),current_provenance_json);
  } catch {return denied("candidate store read or integrity check failed");}
}

/** Tombstone is append-only at this API boundary; never auto-resurrect. */
/** @param {{store_dir?:string,candidate_sha256?:string,reason?:string}} [args] @returns {Promise<any>} */
export async function revokeStoredCandidate({store_dir,candidate_sha256,reason}={}) {
  try {
    if(!SHA.test(candidate_sha256)||!REASONS.has(reason))
      return denied("invalid revocation request");
    const root=await ownerDirectory(store_dir);
    const source=await boundedRegularFile(candidatePath(root,candidate_sha256));
    const record=JSON.parse(source);
    if(record?.candidate_sha256!==candidate_sha256 ||
       inspectCandidateReplay(JSON.stringify(record),JSON.stringify(record.provenance))
         .status!=="REPLAY_BLOCKED_UNQUALIFIED")
      return denied("cannot revoke an invalid candidate");
    const marker=JSON.stringify({schema:"formal-tools/solution-revocation/0.1",
      candidate_sha256,reason})+"\n";
    const written=await exclusiveWrite(root,revokePath(root,candidate_sha256),marker);
    if(written==="UNSUPPORTED")return denied(STORE_UNSUPPORTED);
    if(written==="PUBLISHED_NOT_DURABLE")return denied(PUBLISHED_NOT_DURABLE);
    return notReusable("INVALIDATED",{reason,record_write:written});
  } catch {return denied("candidate revocation failed");}
}
