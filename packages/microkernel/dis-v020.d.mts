import type {DisV020Aot,DisV020Origin} from '@kaicreator/domain-harness-contracts/dis-v020';
import type {V10DocStore} from '@kaicreator/domain-harness-contracts';
export interface DisV020Implementation {
 readonly sourceId:string; readonly sha256:string; readonly gitBlob:string;
 readonly origin:DisV020Origin;
 readonly execute:(input:unknown)=>unknown|Promise<unknown>;
}
export interface DisV020LoadOptions {
 readonly expectedDigest:string;
 readonly registry:Readonly<Record<string,DisV020Implementation>>;
 readonly store:V10DocStore;
 readonly tenantId?:string;
 readonly deploymentIdentity?:{readonly deployedAppId:string;readonly tenantId:string;readonly appId:string};
}
export interface DisV020App {
 readonly aotDigest:string;
 readonly state:'READY'|'DEGRADED'|'STOPPED';
 readonly functions:readonly string[];
 invoke(id:string,input?:unknown):Promise<
  |Readonly<{kind:'OBSERVATION';authority:'NONE';value:unknown}>
  |Readonly<{kind:'KDP_RECEIPT';authority:'KDP';receipt:Record<string,unknown>}>>;
 stop():void;
}
export declare function loadDisV020Aot(artifact:DisV020Aot,options:DisV020LoadOptions):Promise<DisV020App>;
