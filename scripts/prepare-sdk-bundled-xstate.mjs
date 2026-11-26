/** 构建期依赖交付准备：只复制已安装、完整校验的第三方工件，不执行第三方代码或安装钩子。 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sourceSdk=join(root,'packages/domain-harness');
const version='5.33.2-dh.1';
const artifact='xstate-'+version+'.tgz';
const artifactSha='905fcf91e69d6f7a91ebe27729bd093cfe858205cf35853c62ffc15d233e03b6';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function fileSet(dir){
  const files=[];
  function walk(path){
    for(const entry of readdirSync(path,{withFileTypes:true})){
      const next=join(path,entry.name);
      assert.ok(!entry.isSymbolicLink(),'XSTATE_UNEXPECTED_SYMLINK');
      if(entry.isDirectory())walk(next);
      else{assert.ok(entry.isFile(),'XSTATE_UNEXPECTED_FILE_TYPE');files.push(relative(dir,next).split(sep).join('/'));}
    }
  }
  walk(dir);return files.sort();
}
export function dependencyEvidence(sdkDir){
  const vendor=join(sdkDir,'vendor');
  const provenance=JSON.parse(readFileSync(join(vendor,'xstate-provenance.json'),'utf8'));
  assert.equal(provenance.upstream.version,'5.33.2');
  assert.equal(provenance.candidate.name,'xstate');
  assert.equal(provenance.candidate.version,version);
  assert.equal(provenance.candidate.file,artifact);
  assert.equal(provenance.candidate.sha256,artifactSha);
  assert.equal(digest(readFileSync(join(vendor,artifact))),artifactSha,'XSTATE_ARCHIVE_INTEGRITY');
  assert.deepEqual(Object.keys(provenance.changedMembers).sort(),['package/dist/declarations/src/types.d.ts','package/package.json']);
  assert.equal(Object.keys(provenance.members).length,132);
  return provenance;
}
export function verifyXStateFiles(dir,provenance){
  assert.deepEqual(fileSet(dir),Object.keys(provenance.members).sort(),'XSTATE_FILE_SET');
  for(const [path,hash] of Object.entries(provenance.members)){
    assert.equal(digest(readFileSync(join(dir,path))),hash,'XSTATE_FILE_INTEGRITY:'+path);
  }
  assert.equal(JSON.parse(readFileSync(join(dir,'package.json'),'utf8')).version,version);
}
export function verifyInstalledXState(sdkDir){
  const evidence=dependencyEvidence(sdkDir);
  const expected=realpathSync(join(sdkDir,'node_modules','xstate'));
  const actual=realpathSync(dirname(createRequire(join(sdkDir,'package.json')).resolve('xstate/package.json')));
  assert.equal(actual,expected,'XSTATE_BUNDLE_NOT_RESOLVED');
  verifyXStateFiles(actual,evidence);
  return evidence;
}
export function prepareSdkXState(){
  const evidence=dependencyEvidence(sourceSdk);
  const source=dirname(createRequire(join(root,'package.json')).resolve('xstate/package.json'));
  verifyXStateFiles(source,evidence);
  const target=join(sourceSdk,'node_modules','xstate');
  // Workspace hoisting is not a packaging guarantee. Prepare the exact bundle explicitly.
  if(!existsSync(target)){
    mkdirSync(dirname(target),{recursive:true});
    cpSync(source,target,{recursive:true,errorOnExist:true,force:false});
  }
  verifyInstalledXState(sourceSdk);
  console.log(JSON.stringify({status:'SDK_XSTATE_BUNDLE_PREPARED',version,sha256:artifactSha,files:132}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))prepareSdkXState();
