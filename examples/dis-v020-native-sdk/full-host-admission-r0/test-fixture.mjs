/** Shared real-AOT fixture for full-host-admission-r0 (Harness #1527 Phase B).
 *
 * Byte-for-byte the same source-pinned construction as the accepted R188
 * boundary test (r188-current815-o2-host-boundary.test.mjs @6244a0cd): the
 * 815-node Tally research graph, the Forge R143 two-leg selected CQ repin and
 * the R155 consumer reader are loaded from the sibling files and pinned to
 * their exact Git blobs before compilation. The admission work adds NO new
 * semantic source; it reuses the exact selected Function contract.
 */
import {readFile} from 'node:fs/promises';
import {sourceGitBlob,sourceSha256} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from '../native-fixture.mjs';
import {makeCurrentVv815Reader} from '../r155-current-vv-815-research-consumer.mjs';

export const R188_PIN=Object.freeze({
  graph:'a49ddf58a0c4a5b25ebdd4018c8234f64e6365e0',
  forge:'63d671aa270df0eff649cd34a5f6258f4c9cbc21',
  reader:'234997708b5520d7f9ce5997eb7ad6ff963a5e68'
});
export const R188_ORIGIN=Object.freeze({
  graph:{repository:'kaicreator-mm/domain-harness',
    commit:'064740ddecfc257ba4f3e1c50f3025b87660ea81',
    path:'examples/dis-v020-native-sdk/fixtures/r155-c1-v212-graph-815.jsonld',
    gitBlob:R188_PIN.graph},
  forge:{repository:'kaicreator-mm/domain-forge',
    commit:'4e7b34075a00426fb9207f33de8115e1e670a934',
    path:'docs/standards/dke/DKE-0.0.1/demos/ev16-d04-source-tier-r0/EV16_D02_VV_SELECTED_CQ_TWO_LEG_SOURCE_REPIN_R143.json',
    gitBlob:R188_PIN.forge},
  reader:{repository:'kaicreator-mm/domain-harness',
    commit:'064740ddecfc257ba4f3e1c50f3025b87660ea81',
    path:'examples/dis-v020-native-sdk/r155-current-vv-815-research-consumer.mjs',
    gitBlob:R188_PIN.reader}
});
export const R188_SOURCE=Object.freeze({
  graph:'r188-graph-815',forge:'r188-forge-r143',reader:'r188-reader'
});
export const R188_FUNCTION='dke.ev16.d02.vv.r188.observe';
export const R188_ELEMENT='dke.ev16.d02.vv.r188';
export const R188_BINDING_SUBJECT='se:SCB-CS2023-VV-R1';
export const R188_BOOT_TENANT='tenant:r188-current815';

/** Build the real selected AOT context. All source blobs are pinned. */
export async function buildR188AdmissionContext(){
  const [fixture,graph,forge,readerCode]=await Promise.all([
    makeNativeFixture(),
    readFile(new URL('../fixtures/r155-c1-v212-graph-815.jsonld',import.meta.url),'utf8'),
    readFile(new URL('../fixtures/r155-ev16-d02-vv-two-leg-source-repin-r143.json',import.meta.url),'utf8'),
    readFile(new URL('../r155-current-vv-815-research-consumer.mjs',import.meta.url),'utf8')
  ]);
  for(const [key,raw] of Object.entries({graph,forge,reader:readerCode}))
    if(sourceGitBlob(raw)!==R188_PIN[key])
      throw Error('R188 source blob pin drift: '+key);
  if(JSON.parse(graph)['@graph'].length!==815)
    throw Error('R188 graph node count drift');
  const reader=makeCurrentVv815Reader(graph,forge);
  if(reader.summary.authority!=='NONE'||reader.summary.sapQualified!==false)
    throw Error('R188 reader authority shape drift');
  const sources=[...fixture.sources,
    ...Object.entries({graph,forge,reader:readerCode}).map(([key,sourceText])=>({
      id:R188_SOURCE[key],sourceText,origin:R188_ORIGIN[key]
    }))];
  const program=structuredClone(fixture.program);
  program.domains.push({
    id:'dke.ev16.r188',description:'Unqualified 815 research observation -> O2 deny',
    repositories:['kaicreator-mm/tally','kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']
  });
  const fields=Object.fromEntries(Object.entries(reader.value).map(
    ([name,value])=>[name,typeof value]));
  program.elements.push({
    id:R188_ELEMENT,domainId:'dke.ev16.r188',version:'1.0.0',kind:'knowledge',
    description:'Current 815 observation remains UNKNOWN, not an installed Rule',
    dependsOn:[],functions:[{
      id:R188_FUNCTION,kind:'knowledge',effect:'none',
      binding:{type:'local',sourceId:R188_SOURCE.reader},
      sourceDependencies:[R188_SOURCE.graph,R188_SOURCE.forge],
      contract:{
        schema:'dis.v0.2.function-contract/1',version:'1.0.0',
        input:{type:'record',fields:{subject:'string'},additionalProperties:false},
        output:{type:'record',fields,additionalProperties:false},
        outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
        evidence:{refField:'evidenceRefs',requiredFor:[]},
        compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
      }
    }]
  });
  const origins={...fixture.expectedSourceOrigins,
    ...Object.fromEntries(Object.entries(R188_SOURCE).map(([key,id])=>
      [id,R188_ORIGIN[key]]))};
  const compile=(p=program,s=sources,o=origins)=>compileDisV020Aot({
    built:fixture.artifact.built,program:p,sources:s,expectedSourceOrigins:o});
  const artifact=compile();
  const registry={...fixture.registry,[R188_FUNCTION]:{
    sourceId:R188_SOURCE.reader,sha256:sourceSha256(readerCode),
    origin:R188_ORIGIN.reader,gitBlob:R188_PIN.reader,
    execute:input=>reader.query({subject:input.subject})
  }};
  const expectedSourcePins=Object.fromEntries(
    sources.filter(s=>Object.values(R188_SOURCE).includes(s.id))
      .map(s=>[s.id,{sha256:sourceSha256(s.sourceText),origin:s.origin}]));
  return Object.freeze({reader,graph,forge,readerCode,program,sources,origins,
    compile,artifact,registry,expectedSourcePins,
    ruleDigest:sourceSha256(readerCode),bootTenant:R188_BOOT_TENANT});
}

/** Boot the real selected AOT/SDK app for the R188 function. */
export function bootR188App(context){
  return loadDisV020Aot(context.artifact,{
    expectedDigest:context.artifact.digest,registry:context.registry,
    expectedSourcePins:context.expectedSourcePins,
    store:new PlainCasDocStore(),tenantId:context.bootTenant
  });
}
