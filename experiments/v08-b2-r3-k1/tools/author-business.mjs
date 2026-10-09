// V08 B2 R3 K1 (#983) deterministic Business Package authoring tool.
// Regenerates experiments/v08-b2-r3-k1/business/*/manifest.json byte-for-byte
// (canonical JSON + trailing newline, D1 producer-neutral candidate format).
// Run: node experiments/v08-b2-r3-k1/tools/author-business.mjs
// This tool is research evidence for REPRODUCIBILITY only; it is NOT an
// admission authority and never signs on behalf of the Host trust roots.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalJson,hashBytes,packageDigest,componentDigest,verifyPackage}
  from '../../v08-gatea-b1-955-r2/reference956/candidate-validator.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=t=>readFile(join(root,t),'utf8');

// The exact D1 SDK component digest that cross-package imports must pin. It is
// recomputed from the vendored byte-exact genesis.sdk manifest and cross-checked
// against the value pinned by the original D1 business-smoke manifest.
const sdkManifest=JSON.parse(await read('genesis-exact/sdk/manifest.json'));
const sdkRule=sdkManifest.components.find(c=>c.componentId==='sdk-rule');
const SDK_RULE_DIGEST=componentDigest(sdkRule);
const D1_SMOKE_PINNED_SDK_RULE_DIGEST='sha256:31089a61b12dd5d4908c92783b479531fc4cde1d1928a60fe2d428a9bcafba28';
if (SDK_RULE_DIGEST!==D1_SMOKE_PINNED_SDK_RULE_DIGEST)
  throw new Error('vendored genesis.sdk sdk-rule digest diverged from D1 smoke pin');

function op(operationId,effect,extra={}){return {callers:['host'],effect,exposure:'component',
  failures:['E_BAD_INPUT'],inputSchema:{type:'object'},operationId,outputSchema:{type:'object'},...extra};}
function component(p){return {componentId:p.componentId,kindRef:p.kindRef,operations:p.operations,
  packageId:p.packageId,providesCapabilities:p.providesCapabilities,relations:p.relations||[],
  requiredSemanticContracts:[],requiresCapabilities:p.requiresCapabilities||[],
  schemaVersion:'ucb/1',semanticBody:p.semanticBody};}

const claim={
  packageId:'k1.business.claim',version:'1.0.0',
  components:[
    component({packageId:'k1.business.claim',componentId:'claim-policy',
      kindRef:{kindId:'std.rule',version:'1.0.0'},
      operations:[op('evaluate','none')],
      providesCapabilities:[{capabilityId:'business.claim.policy',operations:['evaluate'],version:'1.0.0'}],
      semanticBody:{maxAutoApprove:250,policyId:'high-value-claim'}}),
    component({packageId:'k1.business.claim',componentId:'claim-underwrite',
      kindRef:{kindId:'std.operation',version:'1.0.0'},
      operations:[op('underwrite','none')],
      providesCapabilities:[{capabilityId:'business.claim.underwrite',operations:['underwrite'],version:'1.0.0'}],
      requiresCapabilities:[{capabilityId:'rule.score',operations:['evaluate'],version:'1.0.0'}],
      relations:[{relationKind:'depends-on',
        target:{componentId:'sdk-rule',digest:SDK_RULE_DIGEST,packageId:'genesis.sdk'}}],
      semanticBody:{goal:'k1-sdk-rule-consume'}})
  ],
  exports:['claim-policy','claim-underwrite'],
  imports:[{componentId:'sdk-rule',digest:SDK_RULE_DIGEST,fromPackage:'genesis.sdk'}],
  dependencies:[{digest:sdkManifest.integrity,packageId:'genesis.sdk',version:sdkManifest.packageVersion}],
  implementations:[
    {componentId:'claim-policy',implementationId:'k1.business.claim.policy.v1',
     path:'modules/policy.mjs',sha256:'sha256:'+hashBytes(Buffer.from(await read('business/claim/modules/policy.mjs'),'utf8'))},
    {componentId:'claim-underwrite',implementationId:'k1.business.claim.underwrite.v1',
     path:'modules/underwrite.mjs',sha256:'sha256:'+hashBytes(Buffer.from(await read('business/claim/modules/underwrite.mjs'),'utf8'))}
  ]
};
const chargePkg={
  packageId:'k1.business.charge',version:'1.0.0',
  components:[
    component({packageId:'k1.business.charge',componentId:'charge-op',
      kindRef:{kindId:'std.operation',version:'1.0.0'},
      operations:[op('charge','non-idempotent')],
      providesCapabilities:[{capabilityId:'business.charge.execute',operations:['charge'],version:'1.0.0'}],
      semanticBody:{effectPolicy:'original-v07-authority-only'}})
  ],
  exports:['charge-op'],
  imports:[],
  dependencies:[],
  implementations:[
    {componentId:'charge-op',implementationId:'k1.business.charge.execute.v1',
     path:'modules/charge.mjs',sha256:'sha256:'+hashBytes(Buffer.from(await read('business/charge/modules/charge.mjs'),'utf8'))}
  ]
};

for(const pkg of [claim,chargePkg]){
  const m={formatVersion:'dhpkg/0.8-candidate-1',packageId:pkg.packageId,
    packageVersion:pkg.version,targetAbi:'dh.node22/1',hostRequirements:[],
    dependencies:pkg.dependencies,imports:pkg.imports,exports:pkg.exports,
    components:pkg.components,implementations:pkg.implementations,integrity:''};
  const artifacts=Object.fromEntries(m.implementations.map(i=>[i.path,null]));
  for(const i of m.implementations)artifacts[i.path]=await read('business/'+
    (pkg.packageId==='k1.business.claim'?'claim':'charge')+'/'+i.path);
  m.integrity=packageDigest(m,artifacts);
  verifyPackage(m,artifacts);
  const dir=join(root,'business',pkg.packageId==='k1.business.claim'?'claim':'charge');
  await writeFile(join(dir,'manifest.json'),canonicalJson(m)+'\n');
  console.log(JSON.stringify({packageId:m.packageId,integrity:m.integrity,
    modules:m.implementations.map(i=>({path:i.path,sha256:i.sha256}))}));
}
console.log(JSON.stringify({sdkRuleDigest:SDK_RULE_DIGEST}));
