import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CliElement, InteractionElement, StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { InteractionPrompt } from '@kaicreator/domain-harness';
import { VideoElement, policy, policyV2, FixityElement } from './media.js';
import { ArchiveElement, type Asset, type Result } from './archive.js';
import { CatalogElement } from './catalog.js';
import { RegistrationElement } from './client.js';
import { archiveInteractively, type ArchiveFacts, type ArchiveInput } from './interactive.js';

const envelope=(p:InteractionPrompt)=>({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey});
const limits=(calls:number,steps:number,depth=2)=>({maxCalls:calls,maxSteps:steps,maxDepth:depth});
const complete=<T>(x:Result<T>)=>{if(x.status!=='COMPLETE')assert.fail(JSON.stringify(x));return x.value;};
export async function verifyMediaInteraction(){
  const root=await mkdtemp(join(tmpdir(),'dh-media-interaction-')),storage=join(root,'storage'),db=join(root,'catalog.sqlite'),manifest=join(root,'owner.json');
  const catalog=new CatalogElement(db,storage),cli=new CliElement(),video=new VideoElement(cli),fixity=new FixityElement();
  const image=join(root,'photo-a.png'),movie=join(root,'video-b.mp4'),other=join(root,'photo-c.png');
  const token=randomBytes(24).toString('hex');let host:ChildProcess|undefined;
  let registers=0,reads=0,ownerCalls=0;let afterRegister:(()=>boolean)|undefined;
  let upstream='';
  const proxy=createServer(async(req,res)=>{
    try{const parts:Buffer[]=[];for await(const chunk of req)parts.push(Buffer.from(chunk));
      if(req.url==='/register')registers++;else if(req.url==='/readback')reads++;else{res.writeHead(404);res.end();return;}
      const reply=await fetch(upstream+req.url,{method:'POST',headers:{authorization:req.headers.authorization??'','content-type':'application/json'},body:Buffer.concat(parts)});
      const body=await reply.text();if(req.url==='/register'&&afterRegister){assert.equal(JSON.parse(body).status,'COMPLETE');if(afterRegister()){res.destroy();return;}}
      res.writeHead(reply.status,{'content-type':'application/json'});res.end(body);
    }catch{res.destroy();}
  });
  try{
    await sharp({create:{width:640,height:480,channels:3,background:'#abc'}}).png().toFile(image);
    await sharp({create:{width:480,height:640,channels:3,background:'#def'}}).png().toFile(other);
    await cli.run('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=640x480:r=10','-t','1','-c:v','mpeg4',movie]);
    host=spawn(process.execPath,[fileURLToPath(new URL('./host.js',import.meta.url)),db,storage,manifest],{stdio:['ignore','pipe','inherit']});
    const [data]=await Promise.race([once(host.stdout!,'data'),once(host,'exit').then(()=>{throw Error('HOST_EXIT');}),new Promise<never>((_,reject)=>{const t=setTimeout(()=>reject(Error('HOST_START_TIMEOUT')),5000);t.unref();})]);
    const address=JSON.parse(String(data));assert.equal(address.pid,host.pid);assert.notEqual(address.pid,process.pid);upstream='http://127.0.0.1:'+address.port;
    proxy.listen(0,'127.0.0.1');await once(proxy,'listening');const a=proxy.address();assert.ok(a&&typeof a!=='string');
    const client=new RegistrationElement('http://127.0.0.1:'+a.port,token);
    const facts=(tenant:string):ArchiveFacts=>({tenant,revision:'files-v1',policy,files:[{id:'photo-a',tenant,path:image},{id:'video-b',tenant,path:movie},{id:'photo-c',tenant,path:other},{id:'foreign',tenant:'other-tenant',path:other}]});
    const owner=(approved:boolean)=>async(tenant:string,asset:Asset)=>{ownerCalls++;await writeFile(manifest,JSON.stringify({tenant,asset,token,approved}));return client;};
    const verifyStored=async(tenant:string,asset:Asset)=>{assert.equal(catalog.count(tenant),1);assert.equal(await fixity.digest(join(storage,tenant,asset.original,'original'),policy.maxBytes),asset.original);assert.equal(await fixity.digest(join(storage,tenant,asset.original,'access'),policy.maxBytes),asset.derivative);assert.equal(complete(await catalog.readback(tenant,asset.original)).revision,asset.revision);};
    const start=(tenant:string,input:ArchiveInput,budget=limits(29,34),options:Parameters<typeof archiveInteractively>[6]={},approved=true,source:()=>ArchiveFacts|undefined=()=>facts(tenant))=>archiveInteractively(budget,input,source,video,root,owner(approved),options);
    const run0=start('zero','归档 photo-a video-b');const zero=complete(await run0.result);assert.equal(registers,1);assert.equal(reads,1);assert.equal(run0.observed()?.readback?.status,'COMPLETE');assert.equal(run0.cleanupFailed(),false);assert.equal(run0.proposals().length,1);assert.equal(run0.proposals()[0]!.length,2);assert.ok(!JSON.stringify(run0.proposals()).includes(root));assert.equal(run0.proposals()[0]![1]!.original,await fixity.digest(movie,policy.maxBytes));await verifyStored('zero',run0.observed()!.asset);
    assert.equal(zero.original,await fixity.digest(image,policy.maxBytes));assert.deepEqual([zero.output.width,zero.output.height],[320,240]);
    let prompted=0;const partial=start('partial',{first:'photo-a'},limits(34,39),{onPrompt(p,e){prompted++;assert.equal(p.decisionKey,'second');const field=p.fields[0]!;assert.equal(field.kind,'choice');if(field.kind==='choice'){assert.deepEqual(field.options.map(x=>x.id),['video-b','photo-c']);assert.equal(field.completeness,'complete');assert.equal(field.comparison?.length,3);}assert.ok(!JSON.stringify(p).includes(root));assert.equal(e.submit({...envelope(p),action:'submit',values:{second:'video-b'}}).accepted,true);}});
    const selected=complete(await partial.result);assert.equal(prompted,1);assert.equal(selected.original,zero.original);assert.equal(selected.derivative,zero.derivative);await verifyStored('partial',partial.observed()!.asset);
    // Independent fixed four-field interaction baseline uses real identical professional body and Host.
    let fixedPrompts=0;const fields=['scope','policy','first','second'] as const;const vals=['fixed','archive-v1','photo-a','video-b'];
    const fixed=new InteractionElement({onPrompt:p=>{const i=fixedPrompts++;assert.equal(fixed.submit({...envelope(p),action:'submit',values:{[fields[i]!]:vals[i]}}).accepted,true);}});
    const fixedResult=await fixed.run(limits(40,50),async scope=>{
      const answered=await scope.resolve(0,(i,event)=>{if(event.kind==='response'&&event.response.action==='submit')assert.equal(event.response.values[fields[i-1]!],vals[i-1]);return {status:'COMPLETE',value:i===4?{kind:'ready',intent:true}:{kind:'clarify',state:i+1,prompt:{decisionKey:fields[i]!,title:fields[i]!,actions:['submit'],fields:[{id:fields[i]!,label:fields[i]!,kind:'string',required:true}]}}};});
      if(answered.status!=='COMPLETE')return answered;const p=await new ArchiveElement(video,policy,root).planIn(scope.root,[image,movie]);if(p.status!=='COMPLETE')return p;
      try{const asset=p.value.assets[0]!;const c=complete(await scope.root.invokeOutcome(async()=>({status:'COMPLETE',value:await owner(true)('fixed',asset)})));const result=await c.registerIn(scope.root,'fixed',asset);if(result.status==='COMPLETE')complete(await c.readbackIn(scope.root,'fixed',asset));await verifyStored('fixed',asset);return result;}finally{await p.value.dispose();}
    });assert.equal(complete(fixedResult).derivative,selected.derivative);assert.equal(fixedPrompts,4);
    // Fixed preflight rejects calls/steps/depth shortage without owner or Host requests.
    let before=[registers,reads,ownerCalls];for(const budget of [limits(33,39),limits(34,38),limits(34,39,1)]){
      const short=start('short',{first:'photo-a'},budget,{onPrompt(p,e){e.submit({...envelope(p),action:'submit',values:{second:'video-b'}});}});assert.equal((await short.result).status,'FAILED');assert.deepEqual([registers,reads,ownerCalls],before);assert.equal(catalog.count('short'),0);}
    const denied=start('denied',{first:'photo-a',second:'video-b'},limits(29,34),{},false);assert.equal((await denied.result).status,'ASK');assert.equal(denied.observed()?.registration.status,'ASK');assert.equal(catalog.count('denied'),0);assert.equal(reads,before[1]);
    before=[registers,reads,ownerCalls];const missing=start('missing','归档 photo-a video-b',limits(29,34),{},true,()=>undefined);assert.equal((await missing.result).status,'UNKNOWN');
    assert.equal((await start('foreign','归档 photo-a foreign',limits(40,50)).result).status,'REJECT');
    assert.equal((await start('duplicate','归档 photo-a photo-a').result).status,'REJECT');
    const nofit=start('nofit','归档 photo-a',limits(34,39),{onPrompt(p,e){e.submit({...envelope(p),action:'no-fit'});}});assert.equal((await nofit.result).status,'ASK');
    const cancelled=start('cancel','归档 photo-a',limits(34,39),{onPrompt(_p,e){e.cancel();}});assert.equal((await cancelled.result).status,'REJECT');
    let current=facts('stale');const stale=start('stale','归档 photo-a',limits(34,39),{onPrompt(p,e){current={...current,revision:'files-v2',policy:policyV2};e.submit({...envelope(p),action:'submit',values:{second:'video-b'}});}},true,()=>current);assert.equal((await stale.result).status,'UNKNOWN');
    const saved=await readFile(other);let edited:Promise<void>|undefined;
    const changed=start('changed','归档 photo-a',limits(34,39),{onPrompt(p,e){edited=writeFile(other,Buffer.from('changed'));void edited.then(()=>e.submit({...envelope(p),action:'submit',values:{second:'photo-c'}}));}});
    assert.equal((await changed.result).status,'UNKNOWN');await edited;await writeFile(other,saved);assert.deepEqual([registers,reads,ownerCalls],before);
    let old:InteractionPrompt|undefined,revisionPrompts=0;
    // First partial selection, then explicitly requested review of actual computed proposal; revise the pair.
    const revised=start('revised',{first:'photo-a'},limits(62,71),{review:true,onPrompt(p,e){revisionPrompts++;if(!old){old=p;assert.equal(e.submit({...envelope(p),action:'submit',values:{second:'video-b'}}).accepted,true);}else{assert.ok(p.description?.includes('320×240'));assert.equal(e.submit({...envelope(old),action:'submit',values:{second:'video-b'}}).accepted,false);assert.equal(e.submit({...envelope(p),action:'revise',text:'归档 photo-c video-b'}).accepted,true);}}});
    const revisedReceipt=complete(await revised.result);assert.equal(revisionPrompts,2);assert.equal(revisedReceipt.original,await fixity.digest(other,policy.maxBytes));await verifyStored('revised',revised.observed()!.asset);assert.deepEqual([revisedReceipt.output.width,revisedReceipt.output.height],[240,320]);assert.deepEqual(revised.proposals().map(p=>p.map(a=>a.id)),[['photo-a','video-b'],['photo-c','video-b']]);
    const lost=start('lost','归档 photo-a video-b');afterRegister=()=>{lost.interaction.cancel();return true;};const previous=[registers,reads];assert.equal((await lost.result).status,'UNKNOWN');afterRegister=undefined;
    assert.deepEqual([registers,reads],[previous[0]!+1,previous[1]]);const receipt=lost.observed()!;assert.equal(receipt.registration.status,'UNKNOWN');await verifyStored('lost',receipt.asset);
    // Explicit later authorized recovery of exactly the original binding; no repeated submit.
    const recovered=complete(await client.readback(receipt.tenant,receipt.asset));assert.equal(recovered.original,receipt.asset.original);assert.equal(recovered.derivative,receipt.asset.derivative);assert.deepEqual([registers,reads],[previous[0]!+1,previous[1]!+1]);
    const known=start('known','归档 photo-a video-b');afterRegister=()=>{known.interaction.cancel();return false;};const observed=complete(await known.result);afterRegister=undefined;assert.equal(observed.tenant,'known');assert.equal(known.observed()?.readbackSkipped,'CANCELLED');await verifyStored('known',known.observed()!.asset);
    const beforeShortRegister=[registers,reads,ownerCalls];for(const l of [limits(27,33),limits(28,32)]){assert.equal((await start('short-register','归档 photo-a video-b',l,{readback:false}).result).status,'FAILED');assert.deepEqual([registers,reads,ownerCalls],beforeShortRegister);assert.equal(catalog.count('short-register'),0);}
    const registerOnly=start('single','归档 photo-a video-b',limits(28,33),{readback:false});complete(await registerOnly.result);assert.equal(registerOnly.observed()?.readbackSkipped,'NOT_REQUESTED');
    const beforeRead=reads;const only=registerOnly.observed()!;for(const l of [limits(0,2,0),limits(1,1,0)])assert.equal((await new StandardWorkflowSession(l).run(r=>client.readbackIn(r,only.tenant,only.asset))).status,'FAILED');assert.equal(reads,beforeRead);
    complete(await new StandardWorkflowSession(limits(1,2,0)).run(r=>client.readbackIn(r,only.tenant,only.asset)));assert.equal(reads,beforeRead+1);
    assert.equal((await readdir(root)).filter(n=>n.startsWith('archive-')).length,0);
    console.log(JSON.stringify({status:'MEDIA_INTERACTION_PASS',fixedPrompts,semanticPrompts:prompted,completePrompts:0,revisionPrompts,registers,reads,ownerCalls,realHost:true,lostAckRecovered:true,stagingClean:true,exactAndShort:true}));
  }finally{proxy.closeAllConnections();await new Promise<void>(resolve=>proxy.close(()=>resolve()));if(host&&host.exitCode===null){const done=once(host,'exit');host.kill();await done;}catalog.close();await rm(root,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await verifyMediaInteraction();
