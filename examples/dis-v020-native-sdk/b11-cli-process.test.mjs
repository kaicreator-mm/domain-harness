/** B11/R57: actual OS CLI child process invokes original selected
 * xDownload Interaction in DIS BUILD/SDK/KDP, not a mocked parser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile);
const script=fileURLToPath(new URL('../dis-v020-interaction/cli-transport.mjs',import.meta.url));
const run=async args=>{
 const {stdout,stderr}=await execute(process.execPath,['--import','tsx',script,...args],{
  timeout:30000,maxBuffer:65536,env:process.env
 });
 assert.equal(stderr,'');
 return JSON.parse(stdout);
};
const request=(id,bytes,confirm=true,url='https://example.org/media.mp4')=>[
 'download',url,'--bytes',String(bytes),...(confirm?['--confirm']:[]),'--request-id',id
];
test('B11 R57 real CLI OS child process starts native DIS AOT selected Interaction but never dispatches Effect',async()=>{
 const v=await run(request('R57-CONFIRM',512));
 assert.equal(v.kind,'OBSERVATION');assert.equal(v.channel,'cli');
 assert.equal(v.requestId,'R57-CONFIRM');assert.equal(v.status,'READY_FOR_KDP');
 assert.equal(v.disposition,'PENDING_AUTHORIZATION');
 assert.deepEqual(v.proposal,{channel:'cli',requestId:'R57-CONFIRM',
  url:'https://example.org/media.mp4',declaredBytes:512});
 assert.equal(v.authority,'NONE');assert.equal(v.evidenceAttested,false);
 assert.equal(v.permittedEffect,false);assert.equal(v.effectDispatched,false);
});
test('B11 R57 OS CLI without confirmation keeps source-selected Intent at NEEDS_CONFIRMATION',async()=>{
 const v=await run(request('R57-PENDING',1024,false));
 assert.equal(v.status,'AWAITING_CONFIRMATION');
 assert.equal(v.disposition,'NEEDS_CONFIRMATION');
 assert.equal(v.authority,'NONE');assert.equal(v.effectDispatched,false);
 assert.equal(v.permittedEffect,false);
});
test('B11 R57 real child process isolates simultaneous request IDs and original business proposals',async()=>{
 const values=await Promise.all([
  run(request('R57-A',111,true,'https://example.org/a')),
  run(request('R57-B',222,true,'https://example.org/b')),
  run(request('R57-C',333,false,'https://example.org/c'))
 ]);
 for(let i=0;i<3;i++){
  assert.equal(values[i].requestId,['R57-A','R57-B','R57-C'][i]);
  assert.equal(values[i].proposal.declaredBytes,[111,222,333][i]);
  assert.equal(values[i].proposal.url,'https://example.org/'+['a','b','c'][i]);
  assert.equal(values[i].authority,'NONE');assert.equal(values[i].effectDispatched,false);
 }
 assert.equal(values[2].status,'AWAITING_CONFIRMATION');
});
test('B11 R57 forbidden CLI Effect flags and spoofed caller authorization are refused before native SDK',async()=>{
 for(const args of [
  [...request('R57-EFFECT',512),'--execute'],
  ['execute','https://example.org/a','--bytes','512','--confirm','--request-id','R57'],
  ['download','https://example.org/a','--bytes','512','--effect','--request-id','R57'],
  ['download','https://example.org/a','--bytes','512','--confirm','--request-id','R57','--owner-approved'],
  ['download','https://example.org/a','--bytes','512','--confirm','--request-id','a'.repeat(81)],
  ['download','https://example.org/a','--bytes','512','--confirm','--request-id','R57','--request-id','R57']
 ]){
  await assert.rejects(run(args),e=>{
   assert.equal(e.code,2);assert.equal(e.stdout,'');
   assert.deepEqual(JSON.parse(e.stderr),{error:'DIS_CLI_INVALID'});
   return true;
  });
 }
});
test('B11 R57 real CLI passes credential-bearing URL into selected business rejection, never silent success',async()=>{
 const x=await run(request('R57-BAD-URL',512,true,'https://example.org/private?token=secret'));
 assert.equal(x.status,'REJECTED');assert.equal(x.disposition,'REJECTED');
 assert.equal(x.authority,'NONE');assert.equal(x.permittedEffect,false);
 assert.equal(x.effectDispatched,false);
});
