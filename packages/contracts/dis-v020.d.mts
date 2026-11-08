import type {V10BuiltApp} from './dist/index.js';
export declare const DIS_V020_PROGRAM:'dis.v0.2.program/1';
export declare const DIS_V020_AOT:'dis.v0.2.aot/1';
export declare class DisV020Error extends Error { readonly code:string; constructor(code:string); }
export interface DisV020Origin { readonly repository:string; readonly commit:string; readonly path:string; readonly gitBlob:string; }
export interface DisV020Pin { readonly id:string; readonly sha256:string; readonly origin:DisV020Origin; }
export interface DisV020SourceInput { readonly id:string; readonly sourceText:string; readonly origin:DisV020Origin; }
export type DisV020Admission='ADMITTED'|'DENIED'|'UNKNOWN';
export interface DisV020KdpReceiptContract {
 readonly schema:'dis.v0.2.kdp-receipt-contract/1';
 readonly version:string;
 readonly statusMap:Readonly<Record<string,DisV020Admission>>;
 readonly compatibility:Readonly<{major:number;minReader:'0.2.0';maxReaderExclusive:'0.3.0'}>;
}
export declare function classifyDisV020KdpReceipt(contract:DisV020KdpReceiptContract,receipt:unknown):Readonly<{admission:DisV020Admission;execution:'NOT_PROVEN';businessEvidenceAttested:false}>;
export type DisV020Disposition='OBSERVED'|'UNKNOWN'|'FAILED'|'NEEDS_INPUT'|'NEEDS_CONFIRMATION'|'PENDING_AUTHORIZATION'|'SUCCEEDED';
export interface DisV020FunctionContract {
 readonly schema:'dis.v0.2.function-contract/1';
 readonly version:string;
 readonly input:Readonly<{type:'record';fields?:Readonly<Record<string,'string'|'boolean'|'number'|'record'|'array'>>}>;
 readonly output:Readonly<{type:'record';fields?:Readonly<Record<string,'string'|'boolean'|'number'|'record'|'array'>>}>;
 readonly outcomes:Readonly<{field:string;classes:Readonly<Record<string,DisV020Disposition>>}>;
 readonly evidence:Readonly<{refField:string;requiredFor:readonly DisV020Disposition[]}>;
 readonly compatibility:Readonly<{major:number;minReader:'0.2.0';maxReaderExclusive:'0.3.0'}>;
}
export declare function validateDisV020FunctionValue(contract:DisV020FunctionContract,phase:'input'|'output',value:unknown):true;
export declare function classifyDisV020FunctionOutcome(contract:DisV020FunctionContract,value:Record<string,unknown>):Readonly<{disposition:DisV020Disposition;evidenceRefs:readonly string[]}>;
export interface DisV020Function {
 readonly id:string;
 readonly kind:'init'|'knowledge'|'rule'|'stateful'|'workflow'|'effect'|'interaction';
 readonly effect:'none'|'governed';
 readonly optional?:boolean;
 readonly contract?:DisV020FunctionContract;
 readonly receiptContract?:DisV020KdpReceiptContract;
 readonly binding: {readonly type:'local'; readonly sourceId:string} |
  {readonly type:'kdp-intent'; readonly intentId:string};
}
export interface DisV020Element {
 readonly id:string;
 readonly domainId:string;
 readonly kind:'global'|'knowledge'|'rule'|'stateful'|'workflow'|'effect'|'interaction';
 readonly description:string;
 readonly packageId?:string|null;
 readonly dependsOn:readonly string[];
 readonly functions:readonly DisV020Function[];
}
export interface DisV020Program {
 readonly format:typeof DIS_V020_PROGRAM;
 readonly appId:string;
 readonly domains:readonly {readonly id:string;readonly description:string;readonly repositories:readonly string[]}[];
 readonly elements:readonly DisV020Element[];
 readonly relations:readonly {readonly from:string;readonly to:string;readonly kind:'depends-on'|'constrains'|'cooperates'|'defines'}[];
 readonly appInit:string;
}
export interface DisV020Aot {
 readonly format:typeof DIS_V020_AOT;
 readonly built:V10BuiltApp;
 readonly program:DisV020Program;
 readonly sources:readonly DisV020Pin[];
 readonly digest:string;
}
export interface DisV020Qualified {
 readonly functions:ReadonlyMap<string,{readonly definition:DisV020Function;readonly element:DisV020Element}>;
 readonly elements:ReadonlyMap<string,DisV020Element>;
 readonly selected:ReadonlyMap<string,V10BuiltApp['modules'][number]>;
 readonly pins:ReadonlyMap<string,DisV020Pin>;
}
export declare function sourceSha256(value:string):string;
export declare function sourceGitBlob(value:string):string;
export declare function qualifyDisV020Artifact(artifact:DisV020Aot):DisV020Qualified;
