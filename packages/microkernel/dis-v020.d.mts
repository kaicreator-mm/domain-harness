import type {DisV020Aot,DisV020Origin,DisV020Disposition,DisV020Admission,DisV020SelectedSemanticRelation} from '@kaicreator/domain-harness-contracts/dis-v020';
import type {V10DocStore} from '@kaicreator/domain-harness-contracts';
export interface DisV020Implementation {
 readonly sourceId:string; readonly sha256:string; readonly gitBlob:string;
 readonly origin:DisV020Origin;
 readonly execute:(input:unknown)=>unknown|Promise<unknown>;
}
export interface DisV020LoadOptions {
 readonly expectedDigest:string;
 /** Independent installed Target identity, mandatory for target-locked AOT. */
 readonly expectedTarget?:Readonly<{platform:'linux'|'windows'|'android';architecture:'x64'|'arm64';runtime:'node'}>;
 /** Optional trusted installer source-currentness checkpoint, independent of the AOT. */
 readonly expectedSourcePins?:Readonly<Record<string,Readonly<{
  sha256:string;origin:DisV020Origin
 }>>>;
 /** Opt-in independent installer exact pin of every selected/consumed source. */
 readonly requireAllSourcesPinned?:boolean;
 readonly registry:Readonly<Record<string,DisV020Implementation>>;
 readonly store:V10DocStore;
 readonly tenantId?:string;
 readonly deploymentIdentity?:{readonly deployedAppId:string;readonly tenantId:string;readonly appId:string};
}
export interface DisV020App {
 readonly aotDigest:string;

 readonly selectedTarget:Readonly<{platform:'linux'|'windows'|'android';architecture:'x64'|'arm64';runtime:'node'}>|null;
 /** Real Node process OS/arch compared against installer and AOT before KDP boot.
  * No physical hardware attestation or target-specific code provenance claim. */
 readonly actualHostTarget:Readonly<{platform:string;architecture:string;runtime:'node'}>|null;
 readonly state:'READY'|'DEGRADED'|'STOPPED';
 /** Bounded source AOT relations, not independently accepted semantic truth. */
 readonly semanticRelations:readonly DisV020SelectedSemanticRelation[];
 readonly functions:readonly string[];
 readonly contractVersions:Readonly<Record<string,string>>;
 invoke(id:string,input?:unknown,options?:Readonly<{expectedContractVersion?:string}>):Promise<
  |Readonly<{kind:'OBSERVATION';authority:'NONE';value:unknown;disposition?:DisV020Disposition;contractVersion?:string;evidence?:Readonly<{source:Readonly<{sourceId:string;sha256:string;gitBlob:string}>;declaredRefs:readonly string[];attested:false}>}>
  |Readonly<{kind:'KDP_RECEIPT';authority:'KDP';receipt:Record<string,unknown>;admission?:DisV020Admission;execution?:'NOT_PROVEN';contractVersion?:string;evidence?:Readonly<{receiptAuthority:'KDP';businessAttested:false}>}>
  |Readonly<{kind:'OBSERVATION';authority:'NONE';value:unknown;contractVersion:string;handle:Readonly<{lifetime:'PROCESS_LOCAL';methods:readonly string[]}>;evidence:Readonly<{source:Readonly<{sourceId:string;sha256:string;gitBlob:string}>;attested:false}>}>>;
 stop():void;
}
export declare function loadDisV020Aot(artifact:DisV020Aot,options:DisV020LoadOptions):Promise<DisV020App>;
