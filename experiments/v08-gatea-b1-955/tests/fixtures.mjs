
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blobSHA } from '../reference940/bootstrap.mjs';
import { hashBytes, componentDigest, packageDigest } from '../reference956/candidate-validator.mjs';

const reference=fileURLToPath(new URL('../reference940/',import.meta.url));
const ref=(kindId,version='1.0.0')=>({kindId,version});
const baseComponent=(packageId,componentId,kindId,semanticBody,requiredSemanticContracts=[],requiresCapabilities=[],providesCapabilities=[],relations=[],operations=[])=>({
  schemaVersion:'ucb/1',componentId,packageId,kindRef:ref(kindId),semanticBody,requiredSemanticContracts,
  requiresCapabilities,providesCapabilities,relations,operations
});
const cap=(capabilityId,ops)=>({capabilityId,version:'1.0.0',operations:ops});
const makeCandidate=(id,version,deps,components,exports=[],imports=[],source=null)=> {
  const artifacts=source?{'modules/impl.mjs':source}:{};
  const implementations=source?[{implementationId:'sdk.rule.impl.v1',componentId:'sdk-rule',path:'modules/impl.mjs',sha256:'sha256:'+hashBytes(Buffer.from(source))}]:[];
  const manifest={formatVersion:'dhpkg/0.8-candidate-1',packageId:id,packageVersion:version,targetAbi:'dh.node22/1',
    hostRequirements:[],dependencies:deps,imports,exports,components,implementations,integrity:''};
  manifest.integrity=packageDigest(manifest,artifacts);
  return {manifest,artifacts};
};
export async function createFixture({four=false,duplicateProvider=false,unknownKind=false,unknownSemantic=false,wrongKindVersion=false,invalidBody=false,invalidImport=false,wrongDependencyVersion=false,missingProvider=false,wrongKindImplementation=false}={}){
  const root=await mkdtemp(join(tmpdir(),'v08-b1-'));
  await cp(reference,root,{recursive:true});
  const manifests={};const modules={};
  for(const id of ['kernel','sdk','support','business-approval']){
    manifests[id]=JSON.parse(await readFile(join(root,id,'manifest.json'),'utf8'));
    modules[id]=await readFile(join(root,id,'impl.mjs'),'utf8');
  }
  // Same #940 SDK code, made import-free to load the EXACT verified module bytes
  // as a data: URL. The original PR #940 source is never changed.
  const sdkSource=modules.sdk.replace("import { SpikeError } from '../bootstrap.mjs';",
    "class SpikeError extends Error { constructor(code){ super(code); this.code=code; } }");
  if(sdkSource===modules.sdk)throw new Error('fixture SDK import adaptation missing');
  const validatorCode=String.raw`
export const kindValidators={
 'std.rule@1.0.0':env=>{
   const b=env.semanticBody;
   if(!b||Object.keys(b).sort().join(',')!=='operator,threshold'
     ||b.operator!=='gte'||typeof b.threshold!=='number'||!Number.isFinite(b.threshold))
     throw Object.assign(new Error('invalid material Rule semantics'),{code:'E_KIND_SEMANTIC_BODY'});
 },
 'std.schema@1.0.0':env=>{
   const b=env.semanticBody;
   if(!b||b.type!=='object'||Object.keys(b).join(',')!=='type')
     throw Object.assign(new Error('invalid material Schema semantics'),{code:'E_KIND_SEMANTIC_BODY'});
 }
};
`;
  modules.sdk=sdkSource+validatorCode;
  manifests.sdk.moduleDigest=blobSHA(Buffer.from(modules.sdk));
  const rule=baseComponent('sdk','sdk-rule',
    unknownKind?'uninstalled.behavior':'std.rule',
    invalidBody?{threshold:'seventy'}:{threshold:70,operator:'gte'},
    [{contractId:unknownSemantic?'sc.unknown.required':'sc.rule.threshold',version:'1.0.0'}],
    [],[cap('rule.score',['test'])],[],[{
      operationId:'test',inputSchema:{type:'object'},outputSchema:{type:'boolean'},
      failures:['E_BAD_INPUT'],effect:'none',callers:['business'],exposure:'internal'
    }]);
  if(wrongKindVersion)rule.kindRef.version='2.0.0';
  const ruleDigest=componentDigest(rule,{
    'std.schema@1.0.0':[],
    'std.rule@1.0.0':['sc.rule.threshold@1.0.0','sc.unknown.required@1.0.0'],
    'std.rule@2.0.0':['sc.rule.threshold@1.0.0'],
    'uninstalled.behavior@1.0.0':['sc.rule.threshold@1.0.0'],
  });
  const schema=baseComponent('approval','approval-schema','std.schema',{type:'object'},[],[cap('rule.score',['test'])],[],
    [{relationKind:'depends-on',target:{packageId:'sdk',componentId:'sdk-rule',digest:ruleDigest}}],[]);
  schema.nonMaterialExtensions={label:'inert decorative hint'};
  const supportSchema=baseComponent('support','support-schema','std.schema',{type:'object'});
  const kernel=makeCandidate('kernel','0.0.1',[],[]);
  const sdk=makeCandidate('sdk','0.0.1',[{packageId:'kernel',version:'0.0.1',digest:kernel.manifest.integrity}],
    missingProvider?[]:[rule],missingProvider?[]:['sdk-rule'],[],missingProvider?null:modules.sdk);
  const support=makeCandidate('support','1.0.0',[{packageId:'sdk',version:'0.0.1',digest:sdk.manifest.integrity}],
    [supportSchema],['support-schema']);
  const deps=[{packageId:'sdk',version:wrongDependencyVersion?'9.9.9':'0.0.1',digest:sdk.manifest.integrity}];
  if(four)deps.push({packageId:'support',version:'1.0.0',digest:support.manifest.integrity});
  const imported=invalidImport?[]:[{fromPackage:'sdk',componentId:'sdk-rule',digest:ruleDigest}];
  const business=makeCandidate('approval','1.0.0',deps,[schema],[],imported);
  manifests.sdk.bCandidate=sdk.manifest;
  manifests.sdk.bKinds=[
    {kindId:'std.rule',version:'1.0.0',implementationId:wrongKindImplementation?'sdk.missing.impl@1':'sdk.rule.impl@1',semantics:['sc.rule.threshold@1.0.0']},
    {kindId:'std.schema',version:'1.0.0',implementationId:null,semantics:[]}
  ];
  manifests['business-approval'].bCandidate=business.manifest;
  manifests.support.bCandidate=support.manifest;
  if(four)manifests['business-approval'].dependencies.push({id:'support',version:'1.0.0'});
  if(duplicateProvider){
    const more=structuredClone(rule);more.componentId='another-rule';more.providesCapabilities=[cap('rule.score',['test'])];
    sdk.manifest.components.push(more);
    sdk.manifest.integrity=packageDigest(sdk.manifest,sdk.artifacts);
    manifests.sdk.bCandidate=sdk.manifest;
    business.manifest.dependencies[0].digest=sdk.manifest.integrity;
    business.manifest.integrity=packageDigest(business.manifest,business.artifacts);
  }
  const pins={};for(const id of ['kernel','sdk','support','business-approval']){
    await writeFile(join(root,id,'impl.mjs'),modules[id]);
    const m=manifests[id];m.moduleDigest=blobSHA(Buffer.from(modules[id]));
    const b=Buffer.from(JSON.stringify(m,null,2)+'\n');
    await writeFile(join(root,id,'manifest.json'),b);
    pins[id]={path:id,digest:blobSHA(b)};
  }
  return {root,pins,expected:four?4:3};
}
