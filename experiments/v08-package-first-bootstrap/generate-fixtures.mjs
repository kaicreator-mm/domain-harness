// Reproducible development helper. It does NOT run during bootstrap.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {blobSHA} from './bootstrap.mjs';
const dir=new URL('.',import.meta.url);
const cap=(id,...operations)=>({id,operations});
const component=(id,kind,implementation,provides,requires=[])=>({id,kind,implementation,provides,requires});
const definition=(id,version,definitionId,dependencies,components,workflow)=>({id,version,definitionId,dependencies,components,selections:Object.fromEntries(components.flatMap(c=>c.provides.map(p=>[p.id,id+'@'+version+'/'+c.id+'#'+c.implementation]))),module:'impl.mjs',moduleDigest:'',...(workflow?{workflow}:{})});
const kernel=definition('kernel','0.0.1','kernel.definition@1',[],[
 component('loader','semantic','kernel.link.impl@1',[cap('pkg.link@1','link','seal','stageKernel')]),
 component('state','semantic','kernel.state.impl@1',[cap('state.commit@1','read','commit')]),
 component('effect','tool','kernel.effect.impl@1',[cap('effect.record@1','record','list')])]);
const sdk=definition('sdk','0.0.1','sdk.definition@1',[{id:'kernel',version:'0.0.1'}],[
 component('rule','tool','sdk.rule.impl@1',[cap('rule.eval@1','test')]),
 component('workflow','semantic','sdk.workflow.impl@1',[cap('workflow.run@1','run')],[cap('rule.eval@1','test'),cap('business.action@1','run'),cap('effect.record@1','record'),cap('state.commit@1','read','commit')])]);
const approval=definition('approval','1.0.0','approval.definition@1',[{id:'sdk',version:'0.0.1'}],[component('action','tool','approval.action.impl@1',[cap('business.action@1','run','probeUnauthorized')])],{
 id:'approval.flow@1',endWhen:{field:'done',op:'eq',value:true},nodes:[
 {id:'review',priority:1,when:{field:'score',op:'gte',value:50},action:'review'},
 {id:'auto',priority:1,when:{field:'score',op:'lt',value:50},action:'auto'},
 {id:'audit',priority:0,when:{field:'approved',op:'present'},action:'audit'},
 {id:'notice',priority:2,when:{field:'score',op:'gte',value:0},action:'notice'}]});
const learning=definition('learning','1.0.0','learning.definition@1',[{id:'sdk',version:'0.0.1'}],[component('action','tool','learning.action.impl@1',[cap('business.action@1','run','probeUnauthorized')])],{
 id:'learning.flow@1',endWhen:{field:'done',op:'eq',value:true},nodes:[
 {id:'lesson',priority:0,when:{field:'progress',op:'gte',value:0},action:'lesson'},
 {id:'badge',priority:1,when:{field:'mastery',op:'gte',value:80},action:'badge'}]});
const pairs=[['kernel',kernel],['sdk',sdk],['business-approval',approval],['business-learning',learning]];
const pins={};
for(const [path,m] of pairs){m.moduleDigest=blobSHA(await readFile(new URL(path+'/impl.mjs',dir)));const bytes=JSON.stringify(m,null,2)+'\n';await writeFile(new URL(path+'/manifest.json',dir),bytes);pins[path]={path,digest:blobSHA(bytes)}}
await writeFile(new URL('pins.json',dir),JSON.stringify({kernel:pins.kernel,sdk:pins.sdk,approval:pins['business-approval'],learning:pins['business-learning']},null,2)+'\n');
const boot=new URL('bootstrap.mjs',dir);let source=await readFile(boot,'utf8');source=source.replace(/(TRUSTED_KERNEL_BLOB=')[^']*(';)/,(_m,a,b)=>a+pins.kernel.digest+b);await writeFile(boot,source);
console.log(pins);
