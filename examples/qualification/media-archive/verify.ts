import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CliElement } from '../shared/cli.js';
import { VideoElement, policy, policyV2, FixityElement } from './media.js';
import { ArchiveElement } from './archive.js';
import { CatalogElement } from './catalog.js';
import { RegistrationElement } from './client.js';
const root=await mkdtemp(join(tmpdir(),'dh media '));
const cli=new CliElement(),db=join(root,'catalog.sqlite'),storage=join(root,'storage'),manifest=join(root,'owner.json');
const catalog=new CatalogElement(db,storage);
const limits={maxCalls:19,maxSteps:24,maxDepth:2};let host:ChildProcess|undefined;
async function launch(token:string){
  const child=spawn(process.execPath,[fileURLToPath(new URL('./host.js',import.meta.url)),db,storage,manifest],{stdio:['ignore','pipe','inherit']});host=child;
  const [data]=await Promise.race([once(child.stdout!,'data'),once(child,'exit').then(()=>{throw Error('HOST_EXIT');}),new Promise<never>((_,reject)=>{const t=setTimeout(()=>reject(Error('HOST_START_TIMEOUT')),5000);t.unref();})]);
  const ready=JSON.parse(String(data));assert.equal(ready.pid,child.pid);assert.notEqual(ready.pid,process.pid);
  return {client:new RegistrationElement('http://127.0.0.1:'+ready.port,token),base:'http://127.0.0.1:'+ready.port};
}
async function closeHost(){if(host&&host.exitCode===null){const ended=once(host,'exit');host.kill();await ended;}host=undefined;}
try{
  const image=join(root,'source image.png'),video=join(root,'source video.mp4'),bad=join(root,'broken.png');
  await sharp({create:{width:640,height:480,channels:3,background:'#abc'}}).png().toFile(image);
  await cli.run('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=640x480:r=10','-t','1','-c:v','mpeg4',video]);
  await writeFile(bad,'not an image');
  const app=new ArchiveElement(new VideoElement(cli),policy,root);
  const result=await app.plan([image,video],limits);assert.equal(result.status,'COMPLETE');if(result.status!=='COMPLETE')throw Error('PLAN');
  const [a,b]=result.value.assets;assert.ok(a&&b);assert.deepEqual([a.output.width,a.output.height,b.output.width,b.output.height],[320,240,320,240]);
  assert.equal(a.original,await new FixityElement().digest(image,policy.maxBytes));assert.equal(b.original,await new FixityElement().digest(video,policy.maxBytes));
  const token=randomBytes(24).toString('hex');const owner={token,approved:false,asset:a,tenant:'a'};await writeFile(manifest,JSON.stringify(owner));
  let {client,base}=await launch(token);
  assert.equal(catalog.count('a'),0);assert.equal((await client.register('a',a)).status,'ASK');assert.equal(catalog.count('a'),0);
  assert.equal((await new RegistrationElement(base,'wrong').register('a',a)).status,'REJECT');
  assert.equal((await client.register('b',a)).status,'REJECT');
  await writeFile(manifest,JSON.stringify({...owner,approved:true}));
  assert.equal((await client.register('a',{...a,derivative:'0'.repeat(64)})).status,'REJECT');assert.equal(catalog.count('a'),0);
  const first=await client.register('a',a);assert.equal(first.status,'COMPLETE');if(first.status!=='COMPLETE')throw Error('REGISTER');assert.equal(first.value.duplicate,false);
  const replay=await client.register('a',a);assert.equal(replay.status,'COMPLETE');if(replay.status!=='COMPLETE')throw Error('REPLAY');assert.equal(replay.value.duplicate,true);assert.equal(catalog.count('a'),1);assert.equal(catalog.count('b'),0);
  await writeFile(manifest,JSON.stringify({...owner,approved:true,asset:b}));
  const videoReceipt=await client.register('a',b);assert.equal(videoReceipt.status,'COMPLETE');assert.equal(catalog.count('a'),2);
  await writeFile(manifest,JSON.stringify({...owner,approved:true}));
  // A second tenant has its own write authority; same content gets a distinct record.
  const tokenB=randomBytes(24).toString('hex');await writeFile(manifest,JSON.stringify({...owner,token:tokenB,tenant:'b',approved:true}));
  const clientB=new RegistrationElement(base,tokenB);assert.equal((await clientB.register('b',a)).status,'COMPLETE');assert.equal(catalog.count('b'),1);
  assert.equal((await clientB.readback('a',a)).status,'REJECT');
  // Missing second file leaves no visible record or partial publication.
  await writeFile(manifest,JSON.stringify({...owner,tenant:'c',approved:true,asset:{...a,derivativePath:join(root,'missing-access')}}));
  assert.equal((await client.register('c',a)).status,'UNKNOWN');assert.equal(catalog.count('c'),0);assert.deepEqual(await readdir(join(storage,'c')),[]);
  await writeFile(manifest,JSON.stringify({...owner,approved:false}));
  await result.value.dispose();
  await closeHost();({client,base}=await launch(token));
  const lookup=await client.readback('a',a);assert.equal(lookup.status,'COMPLETE');if(lookup.status==='COMPLETE')assert.equal(lookup.value.tenant,'a');
  assert.equal((await client.readback('b',a)).status,'REJECT');assert.equal((await client.register('a',a)).status,'ASK');
  await writeFile(manifest,JSON.stringify({...owner,token:tokenB,tenant:'b',approved:false}));
  const bLookup=await new RegistrationElement(base,tokenB).readback('b',a);assert.equal(bLookup.status,'COMPLETE');if(bLookup.status==='COMPLETE')assert.equal(bLookup.value.tenant,'b');
  await writeFile(manifest,JSON.stringify({...owner,approved:false}));
  const fixity=new FixityElement();assert.equal(await fixity.digest(join(storage,'a',a.original,'original'),policy.maxBytes),a.original);assert.equal(await fixity.digest(join(storage,'a',a.original,'access'),policy.maxBytes),a.derivative);
  assert.equal(await fixity.digest(join(storage,'a',b.original,'original'),policy.maxBytes),b.original);assert.equal(await fixity.digest(join(storage,'a',b.original,'access'),policy.maxBytes),b.derivative);
  const readback=await client.readback('a',a);assert.equal(readback.status,'COMPLETE');
  assert.equal((await app.plan([image,image],limits)).status,'REJECT');assert.equal((await app.plan([bad,video],limits)).status,'UNKNOWN');assert.equal((await app.plan([image,video],{...limits,maxCalls:1})).status,'FAILED');assert.equal((await app.plan([image,video],{...limits,maxDepth:1})).status,'FAILED');
  assert.equal((await app.plan([image,video],{...limits,maxSteps:23})).status,'FAILED');assert.equal(catalog.count('a'),2);
  assert.equal((await app.plan([image],limits)).status,'ASK');
  assert.equal((await app.plan([image,join(root,'unknown.txt')],limits)).status,'REJECT');
  const large=join(root,'large.png');await writeFile(large,Buffer.alloc(policy.maxBytes+1));assert.deepEqual(await app.plan([large,video],limits),{status:'REJECT',reason:{code:'FILE_LIMIT',message:'FILE_LIMIT'}});
  const long=join(root,'long.mp4');await cli.run('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=64x48:r=1','-t','11','-c:v','mpeg4',long]);assert.equal((await app.plan([image,long],limits)).status,'REJECT');
  assert.equal((await app.plan([image,video],{...limits,maxCalls:18})).status,'FAILED');assert.equal(catalog.count('a'),2);
  const disguised=join(root,'disguised.mp4'),truncated=join(root,'truncated.mp4'),full=join(root,'full.mp4');
  await cli.run('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=64x48:r=10','-t','1','-c:v','mpeg4','-f','mov',disguised]);
  assert.deepEqual(await app.plan([image,disguised],limits),{status:'REJECT',reason:{code:'VIDEO_CONTAINER',message:'VIDEO_CONTAINER'}});
  await cli.run('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=640x480:r=10','-t','2','-c:v','mpeg4','-movflags','faststart',full]);
  const bytes=await readFile(full);await writeFile(truncated,bytes.subarray(0,Math.floor(bytes.length*.65)));
  let decodeCode='';await assert.rejects(cli.run('ffmpeg',['-nostdin','-v','error','-xerror','-i',truncated,'-f','null','-']),error=>{assert.ok(error instanceof Error);decodeCode=error.message;return /^CLI_EXIT_\d+$/.test(decodeCode);});
  const broken=await app.plan([image,truncated],limits);assert.deepEqual(broken,{status:'UNKNOWN',reason:{code:decodeCode,message:`SOURCE_DECODE: ${decodeCode}`}});
  const rounded=join(root,'rounded.mp4');await cli.run('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=640x478:r=10:d=1','-c:v','mpeg4',rounded]);
  const roundedPlan=await app.plan([image,rounded],limits);assert.equal(roundedPlan.status,'COMPLETE');if(roundedPlan.status!=='COMPLETE')throw Error('ROUNDED_PLAN');
  const roundedAsset=roundedPlan.value.assets[1]!;assert.deepEqual([roundedAsset.source.width,roundedAsset.source.height,roundedAsset.output.width,roundedAsset.output.height],[640,478,320,240]);
  const sar=(await cli.run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=sample_aspect_ratio','-of','default=nw=1:nk=1',roundedAsset.derivativePath])).trim();assert.equal(sar,'1:1');await roundedPlan.value.dispose();
  const longAudio=join(root,'long-audio.mp4');await cli.run('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=64x48:r=10:d=1','-f','lavfi','-i','sine=frequency=1000:sample_rate=8000:duration=11','-c:v','mpeg4','-c:a','aac',longAudio]);
  const longInfo=await new VideoElement(cli).inspect(longAudio);assert.equal(longInfo.seconds,1);assert.ok(longInfo.containerSeconds!>10);
  assert.deepEqual(await app.plan([image,longAudio],limits),{status:'REJECT',reason:{code:'DURATION_LIMIT',message:'DURATION_LIMIT'}});
  // Real failed subprocess injected only at conversion, not a fake successful decode.
  class ConversionFailureCli extends CliElement {override run(file:string,args:readonly string[]):Promise<string>{return args.includes('-vf')?super.run(process.execPath,['-e','console.error("PRIVATE_INPUT_MARKER");process.exit(7)']):super.run(file,args);}}
  const failedConversion=await new ArchiveElement(new VideoElement(new ConversionFailureCli()),policy,root).plan([image,video],limits);
  assert.deepEqual(failedConversion,{status:'UNKNOWN',reason:{code:'CLI_EXIT_7',message:'MEDIA_CONVERSION: CLI_EXIT_7'}});assert.equal(catalog.count('a'),2);assert.equal(catalog.count('b'),1);
  const thin=join(root,'thin.png');await sharp({create:{width:640,height:7,channels:3,background:'#abc'}}).png().toFile(thin);const thinResult=await app.plan([thin,video],limits);assert.equal(thinResult.status,'COMPLETE');if(thinResult.status==='COMPLETE'){assert.equal(thinResult.value.assets[0]!.output.width,320);await thinResult.value.dispose();}
  const revised=await new ArchiveElement(new VideoElement(cli),policyV2,root).plan([image,video],limits);assert.equal(revised.status,'COMPLETE');if(revised.status!=='COMPLETE')throw Error('REVISED');const revisedImage=revised.value.assets[0]!;assert.equal(revisedImage.output.width,160);assert.equal(revisedImage.original,a.original);
  await writeFile(manifest,JSON.stringify({...owner,approved:true,asset:revisedImage}));assert.equal((await client.register('a',revisedImage)).status,'REJECT');await revised.value.dispose();
  await assert.rejects(cli.run('dh-no-such-executable-1720',[]),/CLI_SPAWN/);await assert.rejects(cli.run(process.execPath,['-e','process.exit(7)']),/CLI_EXIT_7/);await assert.rejects(new CliElement(100).run(process.execPath,['-e','setInterval(()=>{},1000)']),/CLI_TIMEOUT/);await assert.rejects(new CliElement(5000,32).run(process.execPath,['-e','console.log("x".repeat(200))']),/CLI_OUTPUT_LIMIT/);
  if(process.platform==='linux'){
    const marker=join(root,'descendant-marker'),pidFile=join(root,'direct-pid');const start=Date.now();
    const childCode='const {spawn}=require("node:child_process");require("node:fs").writeFileSync(process.argv[3],String(process.pid));spawn(process.execPath,["-e",process.argv[1],process.argv[2]],{stdio:"inherit"});setInterval(()=>{},1000)';
    const grandCode='setTimeout(()=>require("node:fs").writeFileSync(process.argv[1],"survived"),1200)';
    await assert.rejects(new CliElement(200).run(process.execPath,['-e',childCode,grandCode,marker,pidFile]),/CLI_TIMEOUT/);assert.ok(Date.now()-start<900);
    const directPid=Number(await readFile(pidFile,'utf8'));assert.throws(()=>process.kill(directPid,0),/ESRCH/);
    const markers=[marker];
    for(const kind of ['nonzero','signal','success','overflow'] as const){
      const late=join(root,`${kind}-descendant`),pid=join(root,`${kind}-pid`);markers.push(late);
      const action={nonzero:'process.exit(7)',signal:'process.kill(process.pid,"SIGTERM")',success:'console.log("foreground")',overflow:'console.log("x".repeat(200));setInterval(()=>{},1000)'}[kind];
      const code='const {spawn}=require("node:child_process");require("node:fs").writeFileSync(process.argv[3],String(process.pid));spawn(process.execPath,["-e",process.argv[1],process.argv[2]],{stdio:"ignore"}).unref();'+action;
      const run=new CliElement(2000,kind==='overflow'?32:65536).run(process.execPath,['-e',code,grandCode,late,pid]);
      if(kind==='success')assert.equal((await run).trim(),'foreground');else await assert.rejects(run,{message:{nonzero:'CLI_EXIT_7',signal:'CLI_EXIT_SIGNAL',overflow:'CLI_OUTPUT_LIMIT'}[kind]});
      const endedPid=Number(await readFile(pid,'utf8'));assert.throws(()=>process.kill(endedPid,0),/ESRCH/);
    }
    await new Promise(r=>setTimeout(r,1400));for(const late of markers)await assert.rejects(stat(late),/ENOENT/);
  }
  assert.equal((await readdir(root)).filter(n=>n.startsWith('archive-')).length,0);
  await closeHost();assert.equal((await client.register('a',a)).status,'UNKNOWN');
  console.log(JSON.stringify({status:'MEDIA_PROBE_PASS',node:process.version,sharp:sharp.versions.sharp,vips:sharp.versions.vips,assets:result.value.assets.map(asset=>({original:asset.original,derivative:asset.derivative,source:asset.source,output:asset.output,revision:asset.revision})),policyRevision:revisedImage.revision,negative:['duplicate','corrupt','missing-item','unsupported','size-limit','duration-limit','final-call-budget','call-budget','depth-budget','step-budget','approval','wrong-token','wrong-tenant','wrong-derivative','conflict','host-unavailable','cli-spawn','cli-exit','cli-timeout','cli-output','mov-disguised','truncated-mp4','failed-pair','cross-tenant-read','readback-after-reopen','inherited-pipe-timeout','long-audio-container','conversion-stage','nonzero-descendant','signal-descendant','output-limit-descendant'],roundedVideo:{width:roundedAsset.output.width,height:roundedAsset.output.height,sar},sourceDecodeCode:decodeCode,containerDuration:longInfo.containerSeconds,foregroundCleanup:process.platform==='linux',archivedFilesVerified:4,secondTenant:true,readbackWithoutWriteApproval:true,independentHost:true,stagingClean:true}));
}finally{if(host&&host.exitCode===null){const ended=once(host,'exit');host.kill();await ended;}catalog.close();await rm(root,{recursive:true,force:true});}
