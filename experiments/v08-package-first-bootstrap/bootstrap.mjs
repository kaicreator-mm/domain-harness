import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export class SpikeError extends Error{constructor(code,detail=code){super(detail);this.name='SpikeError';this.code=code}}
export const blobSHA=bytes=>{const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')};
export const TRUSTED_KERNEL_BLOB='a56d4f6ccfea720eb178cf446b3f68733c25f019';
export async function bootstrap({root=fileURLToPath(new URL('.',import.meta.url)),sdk,business,kernel,failCommit=false}={}){
 const trusted={path:'kernel',digest:TRUSTED_KERNEL_BLOB};
 if(kernel&&(kernel.path!==trusted.path||kernel.digest!==trusted.digest))throw new SpikeError('E_BOOT_PIN');
 async function readExact(sel){
  if(!sel||!/^[a-z][a-z0-9-]*$/.test(sel.path)||!/^[a-f0-9]{40}$/.test(sel.digest))throw new SpikeError('E_PIN');
  const dir=resolve(root,sel.path);let content;
  try{content=await readFile(join(dir,'manifest.json'))}catch{throw new SpikeError('E_PACKAGE_MISSING')}
  if(blobSHA(content)!==sel.digest)throw new SpikeError('E_INTEGRITY','manifest '+sel.path);
  let manifest;try{manifest=JSON.parse(content.toString('utf8'))}catch{throw new SpikeError('E_MANIFEST')}
  if(manifest.module!=='impl.mjs'||!/^[a-f0-9]{40}$/.test(manifest.moduleDigest))throw new SpikeError('E_MANIFEST');
  if(manifest.id!==sel.path&&!(sel.path.startsWith('business-')&&manifest.id===sel.path.slice(9)))throw new SpikeError('E_PACKAGE_IDENTITY');
  let source;try{source=await readFile(join(dir,'impl.mjs'))}catch{throw new SpikeError('E_IMPLEMENTATION_MISSING')}
  if(blobSHA(source)!==manifest.moduleDigest)throw new SpikeError('E_INTEGRITY','implementation '+sel.path);
  return {dir,manifest,digest:sel.digest};
 }
 async function loadModule(pkg){const bytes=await readFile(join(pkg.dir,'impl.mjs'));if(blobSHA(bytes)!==pkg.manifest.moduleDigest)throw new SpikeError('E_INTEGRITY');return import(pathToFileURL(join(pkg.dir,'impl.mjs')).href+'?blob='+pkg.manifest.moduleDigest)}
 const seed=Object.freeze({readExact,loadModule,sha256:s=>createHash('sha256').update(s).digest('hex')});
 const pkg=await readExact(trusted),mod=await loadModule(pkg);
 const candidates=pkg.manifest.components.filter(c=>c.provides?.some(x=>x.id==='pkg.link@1'&&x.operations.includes('link')));
 if(candidates.length!==1||typeof mod.implementations?.[candidates[0].implementation]!=='function')throw new SpikeError('E_BOOT_CAPABILITY');
 const linker=mod.implementations[candidates[0].implementation](seed);
 if(!linker||typeof linker.stageKernel!=='function'||typeof linker.link!=='function'||typeof linker.seal!=='function')throw new SpikeError('E_BOOT_CAPABILITY');
 linker.stageKernel(pkg);await linker.link(sdk);await linker.link(business);
 const sealed=await linker.seal();return sealed.activate({failCommit});
}
