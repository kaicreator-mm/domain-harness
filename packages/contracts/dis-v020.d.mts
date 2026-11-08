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
export interface DisV020LocalHandleContract {
 readonly schema:'dis.v0.2.local-handle-contract/1';
 readonly version:string;
 readonly methods:readonly string[];
 readonly lifetime:'PROCESS_LOCAL';
}
export declare function validateDisV020LocalHandle(contract:DisV020LocalHandleContract,value:unknown):true;
export type DisV020Disposition='OBSERVED'|'UNKNOWN'|'FAILED'|'NEEDS_INPUT'|'NEEDS_CONFIRMATION'|'PENDING_AUTHORIZATION'|'SUCCEEDED';
export interface DisV020RecordShape {
 readonly type:'record';
 readonly fields?:Readonly<Record<string,'string'|'boolean'|'number'|'record'|'array'>>;
 readonly optional?:readonly string[];
 readonly additionalProperties?:boolean;
 /** Only a closed, zero-field input may explicitly accept an omitted argument. */
 readonly allowAbsent?:boolean;
}
export interface DisV020FunctionContract {
 readonly schema:'dis.v0.2.function-contract/1';
 readonly version:string;
 readonly input:DisV020RecordShape;
 readonly output:DisV020RecordShape;
 readonly outcomes:Readonly<{field:string;classes:Readonly<Record<string,DisV020Disposition>>}>;
 readonly evidence:Readonly<{refField:string;requiredFor:readonly DisV020Disposition[]}>;
 readonly compatibility:Readonly<{major:number;minReader:'0.2.0';maxReaderExclusive:'0.3.0'}>;
}
export declare function compareDisV020FunctionContracts(previous:DisV020FunctionContract,next:DisV020FunctionContract):Readonly<{compatible:true;from:string;to:string}>;
export declare function validateDisV020FunctionValue(contract:DisV020FunctionContract,phase:'input'|'output',value:unknown):true;
export declare function classifyDisV020FunctionOutcome(contract:DisV020FunctionContract,value:Record<string,unknown>):Readonly<{disposition:DisV020Disposition;evidenceRefs:readonly string[]}>;
export interface DisV020Function {
 readonly id:string;
 readonly kind:'init'|'knowledge'|'rule'|'stateful'|'workflow'|'effect'|'interaction';
 readonly effect:'none'|'governed';
 readonly optional?:boolean;
 readonly contract?:DisV020FunctionContract;
 readonly receiptContract?:DisV020KdpReceiptContract;
 readonly handleContract?:DisV020LocalHandleContract;
 /** Optional additional AOT-pinned source IDs read by this LOCAL Function.
  * These are structural provenance edges, not accepted business evidence. */
 readonly sourceDependencies?:readonly string[];
 readonly binding: {readonly type:'local'; readonly sourceId:string} |
  {readonly type:'kdp-intent'; readonly intentId:string};
}
export interface DisV020ElementValidation {
 /** Structural source pinning only; never independently attested Knowledge. */
 readonly schema:'dis.v0.2.element-validation/1';
 readonly sourceIds:readonly string[];
 readonly authority:'NONE';
}
export interface DisV020Element {
 readonly id:string;
 readonly version:string;
 readonly validation?:DisV020ElementValidation;
 readonly domainId:string;
 readonly kind:'global'|'knowledge'|'rule'|'stateful'|'workflow'|'effect'|'interaction';
 readonly description:string;
 readonly packageId?:string|null;
 readonly dependsOn:readonly string[];
 readonly functions:readonly DisV020Function[];
}
/** Bounded same-major Element ABI evolution, not semantic qualification. */
export declare function compareDisV020ElementContracts(previous:DisV020Element,next:DisV020Element):Readonly<{compatible:true;from:string;to:string}>;
/** Builder-declared selected target with full canonical BUILD module digest roster.
 * Structural selected-Target assertion only, independently installer-pinned.
 * Not proof of actual Windows/Linux/Android execution. */
export interface DisV020SelectedTarget {
 readonly schema:'dis.v0.2.selected-target/1';
 readonly platform:'linux'|'windows'|'android';
 readonly architecture:'x64'|'arm64';
 readonly runtime:'node';
 readonly selectedModules:readonly Readonly<{packageId:string;moduleSha256:string}>[];
}
export interface DisV020Program {
 readonly format:typeof DIS_V020_PROGRAM;
 readonly appId:string;
 readonly domains:readonly {readonly id:string;readonly description:string;readonly repositories:readonly string[]}[];
 readonly elements:readonly DisV020Element[];
 readonly relations:readonly {readonly from:string;readonly to:string;readonly kind:'depends-on'|'constrains'|'cooperates'|'defines'}[];
 readonly appInit:string;
 readonly target?:DisV020SelectedTarget;
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
 readonly target:DisV020SelectedTarget|null;
 /** AOT-declared source → selected LOCAL Function reverse lookup, not ECP closure. */
 readonly sourceConsumers:ReadonlyMap<string,readonly string[]>;
}
export declare function sourceSha256(value:string):string;
export declare function sourceGitBlob(value:string):string;
export declare function qualifyDisV020Artifact(artifact:DisV020Aot):DisV020Qualified;
