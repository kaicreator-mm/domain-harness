/** B12/R58 — actual original Runx stateful Domain source lives only in
 * process memory even with the same real file-backed SQLite KDP store.
 * Proves explicit non-persistence boundary; does not promise a durable Domain
 * State Element, KDP lease or Effect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
const exec=promisify(execFile);
const child=fileURLToPath(new URL('../dis-v020-stateful/runx-process-state.mjs',import.meta.url));
async function run(sqlitePath,...args){
 const {stdout,stderr}=await exec(process.execPath,['--import','tsx',child,sqlitePath,...args],{
  timeout:30000,maxBuffer:65536,env:process.env
 });
 assert.equal(stderr,'');
 return JSON.parse(stdout);
}
test('B12 R58 original Runx Stateful local presence does NOT auto-resurrect through second Node process with same physical KDP SQLite file',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dis-v020-r58-physical-')),db=join(dir,'kdp.sqlite');
 try{
  const first=await run(db,'observe','agent-a','incarnation-a');
  assert.equal(first.kind,'OBSERVATION');assert.equal(first.authority,'NONE');
  assert.equal(first.handleLifetime,'PROCESS_LOCAL');
  assert.equal(first.evidenceAttested,false);
  assert.equal(first.before,null);
  assert.equal(first.after.agent_incarnation_id,'incarnation-a');
  assert.equal(first.list.length,1);
  assert.equal(first.effectDispatched,false);
  const bytes=await readFile(db);
  assert.equal(bytes.subarray(0,16).toString(),'SQLite format 3\0');
  // Reopen same KDP-backed file and use same tenant in a new OS process.
  const second=await run(db,'inspect');
  assert.equal(second.handleLifetime,'PROCESS_LOCAL');
  assert.equal(second.before,null);assert.equal(second.after,null);
  assert.deepEqual(second.list,[]);
  assert.equal(second.physicalKdpStore,'SQLITE_FILE_REOPENED_NO_DOMAIN_STATE_AUTO_RESTORE');
  // A subsequent real OS process independently owns its fresh Runx facts.
  const third=await run(db,'observe','agent-a','incarnation-b');
  assert.equal(third.before,null);
  assert.equal(third.after.agent_incarnation_id,'incarnation-b');
  assert.equal(third.after.agent_id,'agent-a');
  assert.equal(third.list.length,1);
  for(const x of [first,second,third]){
   assert.equal(x.source,'kaicreator-mm/runx');
   assert.equal(x.authority,'NONE');assert.equal(x.effectDispatched,false);
  }
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('B12 R58 forged Runx agent token cannot put a fake execution lease into the physical KDP or Runx owner map',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dis-v020-r58-forged-')),db=join(dir,'kdp.sqlite');
 try{
  const invalid=await run(db,'forged','agent-a','incarnation-forged');
  assert.equal(invalid.before,null);assert.equal(invalid.after,null);
  assert.deepEqual(invalid.list,[]);
  assert.equal(invalid.effectDispatched,false);
  assert.equal(invalid.authority,'NONE');
  const again=await run(db,'inspect');
  assert.equal(again.after,null);
  assert.deepEqual(again.list,[]);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('B12 R58 invalid OS process modes and source spoofed argument shape fail closed before KDP DB opening',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dis-v020-r58-invalid-')),db=join(dir,'never.sqlite');
 try{
  for(const args of [
   ['execute','agent-a','incarnation-a'],
   ['observe','agent-a'],
   ['observe','agent-a','incarnation-a','--permit'],
   ['observe','agent-a','bad/id'],
   ['forged','agent-a','incarnation-fake','--owner-approved']
  ]){
   await assert.rejects(run(db,...args),e=>{
    assert.equal(e.code,2);assert.equal(e.stdout,'');
    assert.deepEqual(JSON.parse(e.stderr),{error:'DIS_STATE_PROCESS_INVALID'});
    return true;
   });
  }
  await assert.rejects(access(db));
 }finally{await rm(dir,{recursive:true,force:true})}
});
