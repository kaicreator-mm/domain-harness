import {readFile} from 'node:fs/promises';
import {buildV10App} from '../../tooling/build/dist/index.js';
import {basicComposition,PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {load} from '../../packages/microkernel/dist/index.js';
import {restoreProjectionRecord,createActivation} from './bridge.mjs';

const [path,expectedProjectionDigest]=process.argv.slice(2);
if(!path||!expectedProjectionDigest)throw Error('trusted projection anchor required');
const record=JSON.parse(await readFile(path,'utf8'));
const built=buildV10App(await basicComposition());
const projection=await restoreProjectionRecord(record,built,{expectedProjectionDigest});
const activated=createActivation({projection,built,load,store:new PlainCasDocStore()});
try{
 const init=await activated.start();
 if(init.status!=='READY')throw Error('business App Init did not reach READY');
 process.stdout.write(JSON.stringify({status:'RESTORED_REAL_BUILD',subjectDigest:built.subjectDigest,
  projectionDigest:projection.projectionDigest})+'\n');
}finally{activated.stop()}
