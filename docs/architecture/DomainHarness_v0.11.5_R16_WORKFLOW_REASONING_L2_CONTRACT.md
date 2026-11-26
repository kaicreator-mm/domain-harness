# 0.11.5 R16 · Workflow-first native L2 contract and adversarial qualification design

> #1563 / #1615 / L2 #1767 / PR #1768. Frozen Product/L1 train d289b3fc4b86456f319e6e16a37483b66644b12e, blob 7041bb9f3d6fabfa5db0533bf3f2807276b74ab2; R13 ACCEPT_SCOPED; R14 freeze 7193176743. R15/R16-A0 architecture baseline 36de9cd5356ee55c741425cdfb8d223db43b2d2a / 190ecbbf713230d925022fb2e4305df0caf1671c. 
> R18 REMEDIATION CANDIDATE FOR FINITE R19 REVIEW; NOT FROZEN. R17 [review](https://github.com/kaicreator-mm/domain-harness/issues/1767#issuecomment-7194239584) P0=0 P1=4 P2=3. R18 supersedes R16 technical signatures/algorithms; L1 unchanged. This companion specifies the previously open R15 §9, with Workflow strengthening integral to L2, not an optional follow-up. Where R15 illustrative names/choices differ, this companion is the current technical candidate. L1 controls scope. All SDK implementation, AC/DY/W/F-W execution NOT_RUN. Independent reviewer must verify design and oracle adequacy before freeze; actual external consumer task and fixture bytes must be separately sealed before implementation.

## 1. Architecture and implementation ownership

WF01–08 in R15 §2A are mandatory. The shared native Workflow owns managed node execution, scope/lifetime, pre/post validation, actual observations, data/control-flow boundaries, semantic state/progress and recursive composition. Domain Workflow binds goals, required Data Knowledge and selected Function Knowledge via native typed references, actual input/output and constraints. Dynamic Workflow is a general Workflow composition capability, used by a deterministic planner or a Model-assisted planner; it is NOT a separate Reasoning executor. Reasoning is a purpose of composition, not a new required base class or provider. No automatic model initialization. Fixed TS/XState and dynamic structure call the same managed-node primitive. Model only returns data. Tool is a selected existing Function. Domain owns professional calculation, facts, applicable validation, authorization, resource conflict rules and final goal. SDK only runtime; generation tools/Forge outside SDK. Standard implementations must have two independent actual uses per shared capability, not class-count targets.

| Module family / responsibility | Design disposition and owner |
|---|---|
| native-workflow-composition.ts | EXTEND one Session/Context/private root ledger and occurrence/close fence; add managed node + bounded work; .1 #1605 owner trace, affected LIFE09–13 and QA04A |
| standard-workflow.ts | KEEP six Outcome statuses, existing run(input); ADD root-aware XState adapter for explicitly bound managed domain transitions, actual terminal and semantic projection; .1 |
| standard-interaction.ts | REFINE existing run/resolve/step with runIn, root signal, waiting and joining; .3 #1613 owner trace, LIFE14 regression |
| standard-evidence.ts, semantic-data.ts, query family | REUSE existing finite resolution/invalidation and actual query semantics, no new knowledge database; .2/.3 behavior unchanged except proven private reuse |
| workflow-region.ts (candidate new module) | .5 generic dynamic local workflow structure and domain context projection; no model import |
| model.ts and private codecs | .5 one-request ModelElement and native provider codecs, bounded local transcript; no execution registry |
| workflow-observation.ts (private mechanics colocated where appropriate) | root-owned actual run record + safe output callback; no evidence store; may be private helper of native workflow |
| business Host, domain packages | existing owner-authority / native professional functions; no central permission/Host/KDP dispatch; no SDK-generated Domain Package |
| SDK root and engineering docs | explicit export list, TSDoc, runtime usage examples, independent expectation; repo-only generation checks remain outside SDK runtime artifacts; Forge migration not implemented |

Source evidence: actual R15 §1 and R16-A0 §2A readbacks; .1 R75 historical closure #1605 retained; no broad reopen or new independent review per small task. Any owner-stage correction has finite task + affected regression before dependent .5 use. No main/release/version bump by design.

## 2. R18 corrected public TypeScript surface (L2 candidate)

R17-P1-01/02/03 and P2-01/02: these signatures replace the R16 JSON-only data path and optional currentness. Native objects are trusted immutable values (not automatically copied/serialized; Date requires immutable-use discipline). Bounded JSON J=StandardJsonValue is only the untrusted proposal/literal and explicit public/model projection format. All function-valued properties checked with strictFunctionTypes. Maybe<T> and Outcome<T> are private aliases of T|Promise<T> and existing StandardWorkflowOutcome<T>. Constructors do not perform I/O. Existing six outcomes and legacy calls unchanged.

```ts
export interface WorkflowControlLimits {
  readonly maxWork:number; readonly maxActiveMs:number; readonly maxWallMs?:number;
  readonly maxSettlementMs:number; readonly maxNoProgress:number;
  readonly maxEvents:number; readonly maxActiveScopes:number;
  readonly model?:Readonly<{maxCalls:number; maxRetries:number;
    maxOutputTokens:number; maxReservedTokens?:number}>;
}
export interface WorkflowControlOptions {
  readonly limits:WorkflowControlLimits; readonly signal?:AbortSignal;
  readonly observe?:(record:WorkflowObservation)=>void;
  readonly evidence?:Readonly<{required:boolean;emit:(record:WorkflowObservation)=>Outcome<void>}>;
}
// Scope identities allocated by SDK, not supplied by proposal.
export interface WorkflowOccurrence {
  readonly runId:string; readonly scopeId:string; readonly parentScopeId?:string;
  readonly definitionId:string; readonly instanceId:string;
  readonly attempt:number; // >=1, per instance
}
export interface WorkflowKnowledgeFrame {
  readonly epoch:number; readonly context:EvidenceContext; // independent trusted scope/revisions/asOf
}
export interface WorkflowKnowledgePolicy {
  readonly current:()=>WorkflowKnowledgeFrame; // sync trusted state, no I/O
  readonly equal:(key:string,left:unknown,right:unknown)=>boolean;
  readonly rank?:(observation:EvidenceObservation<string,unknown>)=>number;
  readonly maxItems:number;
}
export interface WorkflowNodeOptions {
  readonly knowledge:WorkflowKnowledgePolicy;
  readonly planRevision?:number; // present for mutable region; root verifies actual revision via internal binding
  readonly current:()=>boolean; // required sync domain guard, additional to SDK frame/scope checks
}
export interface WorkflowContextView {
  readonly runId:string; readonly scopeId:string; readonly goal:string; readonly stage:string;
  readonly factRevision:number; readonly planRevision?:number;
  readonly knowledge:EvidenceResolution<string,unknown>|undefined; // private typed native values
  readonly capabilities:readonly string[]; readonly constraints:readonly string[];
  readonly progress:readonly Readonly<{instanceId:string;definitionId:string;
    state:'pending'|'running'|'accepted'|'rejected'|'skipped'|'stale'|'unknown'|'removed'}>[];
  readonly feedbackRevision:number;
  readonly remaining:Readonly<{calls:number;steps:number;maxDescendantDepth:number;
    work:number;events:number;activeMs:number;wallMs?:number;localWork:number}>;
}
export interface WorkflowTerminalContext {
  readonly signal:AbortSignal;
  read<T>(action:(signal:AbortSignal)=>Maybe<Outcome<T>>):Promise<Outcome<T>>;
}
export type WorkflowAttempt<O> =
  | Readonly<{kind:'returned';outcome:Outcome<O>}>
  | Readonly<{kind:'exception'|'cancelled'|'timeout'|'unsettled';code:string}>;
export interface WorkflowNode<I,O> {
  readonly id:string; readonly goal:string;
  readonly requiredKnowledge:readonly EvidenceRequirement<string>[];
  readonly knowledge?:(input:I,scope:NativeWorkflowContext)
    =>Maybe<Outcome<readonly EvidenceObservation<string,unknown>[]>>;
  readonly before:(input:I,scope:NativeWorkflowContext,context:WorkflowContextView)=>Maybe<Outcome<void>>;
  readonly run:(input:I,scope:NativeWorkflowContext,context:WorkflowContextView)=>Maybe<Outcome<O>>;
  readonly terminalReads?:number;
  readonly after:(input:I,actual:WorkflowAttempt<O>,scope:WorkflowTerminalContext)=>Maybe<Outcome<void>>;
  readonly cleanup?:(input:I,actual:WorkflowAttempt<O>)=>Maybe<void>;
  readonly project:(actual:WorkflowAttempt<O>)=>J; // explicit safe actual detail
}
export interface WorkflowActorOptions<Snapshot> {
  readonly project:(snapshot:Snapshot)=>J;
  readonly maxProjections:number; // pre-reserved bound, includes actual terminal snapshot
}
// Public observation is a discriminated union. Required common fields; no fake node for root events.
export type WorkflowObservation = Readonly<{
  runId:string;scopeId:string;parentScopeId?:string;seq:number;
  factRevision:number;planRevision?:number;stage:string
}> & (
 | Readonly<{kind:'scope';phase:'open'|'stopping'|'closed';reason:string;
    localQuiescent:boolean;outcome?:Outcome<void>}>
 | Readonly<{kind:'node';occurrence:WorkflowOccurrence;
    phase:'pre-reject'|'enter'|'skip'|'actual'|'accept'|'invalidate';
    entered:boolean;acceptance:'pending'|'accepted'|'rejected'|'not-applicable'|'stale';
    outcome?:Outcome<void>;post:'pending'|'passed'|'failed'|'unknown'|'not-applicable';
    effect:'none'|'committed'|'unknown'|'not-applicable';receiptId?:string;
    reason:string;sources:readonly Readonly<{key:string;id:string;scope:string;revision:string;status:string}>[];
    detail:J}>
 | Readonly<{kind:'region';regionId:string;action:'proposal-rejected'|'edit'|'feedback'|'revalidate'|'complete';
    beforeRevision:number;afterRevision:number;reason:string;detail:J}>
 | Readonly<{kind:'actor';definitionId:string;detail:J}>
 | Readonly<{kind:'model';requestId:string;attempt:number;
    action:'selected'|'not-needed'|'unavailable'|'retry'|'fallback'|'result';
    profileId?:string;model?:string;protocol?:'openai-chat'|'anthropic-messages';
    reason:string;usage:ModelUsage;detail:J}>
 | Readonly<{kind:'evidence';delivery:'failed';required:boolean;reason:string}>
);
```

Existing classes: StandardWorkflowSession(limits:WorkflowLimits,control?:WorkflowControlOptions); run<T>(action:(root:NativeWorkflowContext)=>Maybe<Outcome<T>>):Promise<Outcome<T>> unchanged. NativeWorkflowContext additions readonly signal:AbortSignal, readonly runId:string, readonly scopeId:string; node<I,O>(definition:WorkflowNode<I,O>,input:I,options:WorkflowNodeOptions):Promise<Outcome<O>>; work<T>(units:number,action:()=>Maybe<Outcome<T>>):Promise<Outcome<T>>. Existing child/invoke/invokeOutcome/leaf/remaining signatures retain behavior and gain scope fences; managed work requires control. XStateWorkflowElement retains run(input); adds runIn(input:InputFrom<Logic>,root:NativeWorkflowContext,options:WorkflowActorOptions<SnapshotFrom<Logic>>):Promise<Outcome<Output>>. InteractionElement retains run(limits,work); adds runIn<T>(root:NativeWorkflowContext,work:(scope:InteractionScope)=>Maybe<Outcome<T>>):Promise<Outcome<T>>. WorkflowElement remains unchanged; generic native node is a typed contract not mandatory Class. XState root binding: trusted actor definition input must explicitly contain the supplied borrowed scope (typed input created for that invocation by domain); adapter rejects foreign scope using explicit supplied scope equality before entry, no implicit actor state inspection. Actual root binding contract refined below.

### 2.1 Native domain data path and bounded dynamic proposals

A typed slot is a local capability to read/write a *native* value of a declared type, not a string ID-to-object global store. Identity is module-created opaque token with a trusted synchronous type guard; same display name is not identity. SDK-private store is per run and region, contains explicitly admitted typed slots and provenance. No model sees values or tokens unless separately projected. Generic bind/read APIs ensure compile-time and runtime type checks. Type erasure internal only after checked binding; private map key object identity, no unsafe cast exposed. A native value may be reused through identical declared slot token or an explicitly trusted conversion Function; different token identity never auto-compatible based on matching text or TypeScript structural shape. Slot records are immutable within accepted epoch; refresh may replace through scoped contract. Input assembly is domain-owned typed Function; reads resolve only the named input binding, not arbitrary store traversal.

```ts
export interface WorkflowSlot<T> {
  readonly id:string; readonly accepts:(value:unknown)=>value is T;
}
export function createWorkflowSlot<T>(id:string,accepts:(value:unknown)=>value is T):WorkflowSlot<T>;
export interface WorkflowSlotReader {
  read<T>(name:string,slot:WorkflowSlot<T>):Outcome<T>;
}
export interface WorkflowSlotWriter {
  put<T>(name:string,slot:WorkflowSlot<T>,value:T):Outcome<void>;
}
export type WorkflowSlotBinding =
 | Readonly<{kind:'literal';value:J}>
 | Readonly<{kind:'context';slot:string}>
 | Readonly<{kind:'result';node:string;slot:string}>;
export interface WorkflowNodeProposal {
 readonly alias:string;readonly capability:string;
 readonly input:Readonly<Record<string,WorkflowSlotBinding>>;
 readonly initial?:readonly WorkflowNodeProposal[];
}
export type WorkflowEdit =
 | Readonly<{kind:'insert';gap:string;before?:string;node:WorkflowNodeProposal}>
 | Readonly<{kind:'reuse';gap:string;before?:string;template:string;alias:string}>
 | Readonly<{kind:'skip'|'remove';node:string}>
 | Readonly<{kind:'move';node:string;before?:string}>
 | Readonly<{kind:'rebind';node:string;input:string;to:WorkflowSlotBinding}>;
export interface WorkflowRegionProposal {
 readonly runId:string;readonly regionId:string;readonly planRevision:number;readonly factRevision:number;
 readonly edits:readonly WorkflowEdit[];readonly action:'continue'|'finish'|'clarify'|'stop';
}
export interface WorkflowRegionLimits {
 readonly maxWork:number;readonly maxDescendantDepth:number;readonly maxCandidateBytes:number;
 readonly maxJsonDepth:number;readonly maxJsonItems:number;readonly maxNodes:number;
 readonly maxBindings:number;readonly maxEdits:number;readonly maxProjectionBytes:number;
}
export interface WorkflowRegionView extends WorkflowContextView {
 readonly regionId:string;
 readonly slots:readonly string[]; // declared available context names, no values
 readonly results:readonly Readonly<{node:string;slots:readonly string[]}>[];
 readonly reader:WorkflowSlotReader; // scoped to current declared inputs/projection and epoch
}
export interface WorkflowFunctionBinding<I,O> {
 readonly id:string;readonly description:string;
 readonly input:(reader:WorkflowSlotReader)=>Outcome<I>;
 readonly node:WorkflowNode<I,O>;
 readonly output:(value:O,writer:WorkflowSlotWriter)=>Outcome<void>;
 readonly model?:Readonly<{schema:J;describe:string}>; // optional provider projection only
}
export interface WorkflowCapability {readonly id:string;readonly kind:'function'|'region'}
export function bindWorkflowFunction<I,O>(binding:WorkflowFunctionBinding<I,O>):WorkflowCapability;
export function bindWorkflowRegion<I,O>(binding:Readonly<{
 id:string;description:string;input:(reader:WorkflowSlotReader)=>Outcome<I>;
 create:(input:I)=>Outcome<WorkflowRegionDefinition<I,O>>;
 output:(value:O,writer:WorkflowSlotWriter)=>Outcome<void>;
 model?:Readonly<{schema:J;describe:string}>;
}>):WorkflowCapability;
export interface WorkflowRegionDefinition<I,O> {
 readonly id:string;readonly goal:string;readonly constraints:readonly string[];
 readonly limits:WorkflowRegionLimits;readonly capabilities:readonly WorkflowCapability[];
 readonly knowledge:WorkflowKnowledgePolicy;
 readonly layout:readonly (
 | Readonly<{kind:'anchor';id:string;node:WorkflowNodeProposal}>
 | Readonly<{kind:'gap';id:string;templates:readonly WorkflowNodeProposal[];seed:readonly string[]}>
 )[];
 readonly refresh:(input:I,root:NativeWorkflowContext,previous:WorkflowRegionView|undefined,
   writer:WorkflowSlotWriter)=>Maybe<Outcome<Readonly<{changed:readonly string[];
   dependencies:readonly EvidenceDependency<string>[];
   observations:readonly EvidenceObservation<string,unknown>[]}>>>;
 readonly plan:(view:WorkflowRegionView,root:NativeWorkflowContext)=>Maybe<Outcome<WorkflowRegionProposal>>;
 readonly admit:(current:WorkflowRegionView,proposed:WorkflowRegionProposal)=>Maybe<Outcome<void>>;
 readonly canSkip:(nodeId:string,view:WorkflowRegionView)=>Maybe<Outcome<void>>;
 readonly canRebind:(nodeId:string,input:string,from:WorkflowSlotBinding,to:WorkflowSlotBinding,
   view:WorkflowRegionView)=>Maybe<Outcome<void>>;
 readonly replay:'never'|'pure-read-only'; // default explicit never for effectful/unknown operations
 readonly clarify?:(view:WorkflowRegionView,root:NativeWorkflowContext)=>Maybe<Outcome<void>>;
 readonly complete:(view:WorkflowRegionView,root:NativeWorkflowContext)=>Maybe<Outcome<O>>;
}
export function runWorkflowRegion<I,O>(root:NativeWorkflowContext,definition:WorkflowRegionDefinition<I,O>,
 input:I,initial?:readonly WorkflowNodeProposal[]):Promise<Outcome<O>>;
```

**Binding and authorization.** Slot/capability brands checked against private factory identities; structural forged objects rejected. Private types and native values never go in proposal. Reader is scoped to exact input binding name and token, valid only during its synchronous callback; rejects expired lease/epoch, undelegated or stale result, wrong slot identity/value predicate. Writer only during synchronous callback into a finite staged write set, unique output names, explicit token and guard, no access to other results. No unchecked cast from J to native I. For literal binding read checks target token predicate against bounded J; no automatic Date/bigint parse or authority. For model tools, schema is only proposal description; input assembly still checks actual named bindings, domain validation, currentness. Capability-level replay policy: fixed node and binding definitions declare pure-read-only explicitly (add optional readonly replay?:'pure-read-only'|'never' to WorkflowNode, default never); generated child may be replayed only if its region explicitly pure-read-only and actual trace contains no effects or unknown attempts. All other nodes never automatically replay; domain may verify new evidence through separate approved read-only reconciliation node, or stop with appropriate non-success. No automatic effect retry.

Native example (illustrative authoring with explicit domain callbacks, not installed SDK proof): createWorkflowSlot<bigint>('cost', (v):v is bigint=>typeof v==='bigint'); createWorkflowSlot<Date>('due',(v):v is Date=>v instanceof Date). A fixed native node returns {cost:9007199254740993n,due:Date}; region refresh writes cost/due using those tokens; deterministic planner references context slots; bound node input calls reader.read('cost',costSlot) and reader.read('due',dueSlot), propagates any non-COMPLETE, invokes same typed Function as direct fixed node; output writer writes typed result, region complete reads exact accepted result through its scoped reader and returns native bigint/Date to next fixed node. Child binding input builds same typed input from explicitly delegated slots, child run receives only typed input and own approved capabilities, output maps only declared result to parent; no schema/no JSON encode/no model config. Wrong slot token, wrong type, expired/foreign reader rejected. Native planner view reader addresses approved context names or exact 'nodeId/slot' result handles issued in view; no arbitrary property paths. For model-assisted variant trusted domain projects only selected cost decimal string/due date and descriptions, model returns aliases/binding refs, actual native value remains exact; no provider schema required for deterministic path. Child definition capabilities subset of parent explicitly delegated capability identities; approved private native helper not a model-selectable capability. All context/result slot scopes, dependencies, source revision and ownership recorded by SDK, token metadata immutable. Callback output writes transactionally staged; only publish after current revision+post+encode validation+evidence gates; on failure discard staged values but keep real effect facts. Native O only published when validated, no need to serialize to cross fixed/dynamic. View's reader for plan/complete uses same finite scoped handles but not arbitrary native state. Model projection constructed by trusted domain from view using explicit safe bounded JSON; no automatic full view serialization.

**Current evidence.** Managed node options mandatory even fixed (legacy unmanaged calls remain valid). Domain current() returns independent trusted frame, SDK snapshots context scope, revision map, asOf and epoch, validates finite inputs; knowledge callback returns raw observations (never pre-resolved foreign result). SDK calls existing resolveEvidence with actual requirements, current trusted frame and policy. Complete traversal AND each required item resolved with exact accepted origins, matching scope/source/revision and validity; no missing/unknown/conflict/not-applicable or recommendation. Domain provider marks truncated/incomplete source as non-success, SDK cannot prove external completeness or trusted arbitrary code truth. Time validity checked with fresh trusted asOf before run and acceptance, absent asOf with validity fails. Epoch/revision map changes even during before/after/async policy invalidate captured snapshot; recheck after every relevant await and immediately before effect and publication, plus current guard and scope fence. Fixed node no knowledge requirement still receives current frame and guard, empty resolution valid. Epoch is monotonic nonnegative safe int; same epoch with different scope/revisions rejected, asOf may advance, check validity rather than require exact clock equality. Region current snapshot used for all nodes with mandatory internal plan/fact fences, no bypass via supplied scalar labels. Source origins determined by trusted domain, never model/user self-assertion. Context native view includes goal/stage, required knowledge status/provenance, authorized capability set, constraints, actual progress, feedback revision, remaining root/local budget; fixed node view uses domain-owned declared projections (add readonly context?:(input:I)=>Readonly<{constraints:readonly string[];capabilities:readonly string[];feedbackRevision:number}> to WorkflowNode; default empty lists/0 when no such domain constraints). SDK progress from actual node observations; fixed composition uses actual sequence and child projection, not guessed percentages. Project to model only via explicit safe view (mandatory relevant constraints/source statuses retained; overflow non-success).

**Actor attachment.** runIn input explicitly uses SDK-created borrowed scope supplied to trusted input factory (replace first argument with (scope:NativeWorkflowContext)=>InputFrom<Logic>, invokes once before actor creation). No caller-provided independent root; actual managed nodes must use this passed scope; actor binding tested, no automatic arbitrary TS inspection. Snapshot projections synchronous, bounded pre-reserved maxProjections, actual done/error/stopped; see §3. Interaction attaches through borrowed scope, own prompt contract retained.

### 2.2 Model API

```ts
export interface ModelProfile {
 readonly id:string;readonly protocol:'openai-chat'|'anthropic-messages';
 readonly endpoint:string;readonly model:string;readonly credential:()=>Maybe<string>;
 readonly tokenField?:'max_tokens'|'max_completion_tokens';readonly anthropicVersion?:string;
 readonly features:Readonly<{tools:boolean;jsonSchema:boolean;toolsWithJsonSchema:boolean}>;
 readonly limits:Readonly<{requestBytes:number;responseBytes:number;maxOutputTokens:number;timeoutMs:number}>;
 readonly boundInputTokens?:(wire:Readonly<{protocol:'openai-chat'|'anthropic-messages';body:string}>)=>number;
}
export interface ModelToolDescription {readonly name:string;readonly description:string;readonly inputSchema:J}
export interface ModelToolCall {readonly id:string;readonly name:string;readonly input:J}
export interface ModelToolResult {readonly callId:string;readonly value:J;readonly error:boolean}
export interface ModelUsage {
 readonly input:number|null;readonly output:number|null;readonly total:number|null;
 readonly kind:'observed'|'estimated'|'unavailable';
}
export interface ModelTurn {readonly text:string;readonly calls:readonly ModelToolCall[];readonly usage:ModelUsage}
export interface ModelRequest {
 readonly system:string;
 readonly input:readonly (
 | Readonly<{role:'user';text:string}>
 | Readonly<{role:'assistant';turn:ModelTurn}>
 | Readonly<{role:'tool-results';results:readonly ModelToolResult[]}>
 )[];
 readonly tools:readonly ModelToolDescription[];
 readonly output:Readonly<{kind:'text'}|{kind:'json';strict:false}|{kind:'json';strict:true;schema:J}>;
 readonly maxOutputTokens:number;
 readonly previousRequestId?:string;readonly action:'initial'|'retry'|'fallback'|'continue';
}
export class ModelElement {
 constructor(profile:ModelProfile);
 generate(root:NativeWorkflowContext,request:ModelRequest):Promise<Outcome<ModelTurn>>;
}
```

Model selection/failure evidence for deterministic path comes from managed domain workflow context and explicit trusted decision record (see §3). Continuation turns are SDK-issued privately branded immutable exact wire blocks, bounded and bound to root/scope/profile; caller cannot substitute mutated exposed fields; no hidden thought storage. Request attempt correlation in §5. All true calls use existing Function; Model tool descriptions not executable.

### 2.3 Independent expected public surface

Retain 27 existing root values: KernelLifecycle, WorkflowElement, XStateWorkflowElement, JsonReader, YamlReader, readJson, readYaml, writeJson, writeYaml, NativeWorkflowContext, StandardWorkflowSession, routeWorkflowOutcome, runRecognitionHandling, BoundedQueryElement, SQLiteDatabaseElement, SQLiteDatabaseError, VectorQueryElement, GraphQueryElement, BoundedExpressionElement, CliElement, InteractionElement, resolveEvidence, invalidateEvidence, selectNextDecision, prepareCandidates, ClarificationElement, runInteractiveRecognitionHandling. Add 5 values: createWorkflowSlot, bindWorkflowFunction, bindWorkflowRegion, runWorkflowRegion, ModelElement. Existing 61 type symbols retained per exact baseline root index 36581edff250571ff1eebcb6f225a817ae325cd2. New named types: WorkflowControlLimits, WorkflowControlOptions, WorkflowOccurrence, WorkflowKnowledgeFrame, WorkflowKnowledgePolicy, WorkflowContextView, WorkflowNodeOptions, WorkflowTerminalContext, WorkflowNode, WorkflowAttempt, WorkflowActorOptions, WorkflowObservation, WorkflowSlot, WorkflowSlotReader, WorkflowSlotWriter, WorkflowSlotBinding, WorkflowNodeProposal, WorkflowEdit, WorkflowRegionProposal, WorkflowRegionLimits, WorkflowRegionView, WorkflowFunctionBinding, WorkflowCapability, WorkflowRegionDefinition, ModelProfile, ModelToolDescription, ModelToolCall, ModelToolResult, ModelUsage, ModelTurn, ModelRequest (31 new types, expected total 32 values/92 types). Changed existing members: Session constructor optional control and original run; NativeWorkflowContext signal/runId/scopeId/node/work and existing child/invoke/invokeOutcome/leaf/remaining with lifetime fences; XStateWorkflowElement.runIn with trusted input factory and projection bound; InteractionElement.runIn with existing scope; no new subpath. Add explicit NativeWorkflowContext.recordModelDecision(reason:string,action:'not-needed'|'unavailable'):Outcome<void> for domain no-model decision evidence (charged, no authority). No exports of codecs/brands/store/ledger/admission helpers; generated tooling not SDK. Type positive/negative sketches and eventual installed root/type inventory required; these signatures are design, no actual compiled implementation. Wrong type, wrong slot, forged capability, wrong actor input, stale frame, unsafe private imports negative; real fixed/native/dynamic/child, model projection and same-root actor/interaction positive. Reassess every public member against two real independent uses, no class-count goal.

## 3. Shared root, scope, resource, observation and node execution (R17-P1-04/P2-01)

Preserve legacy root start 0calls/1step, child 0/1, invoke/invokeOutcome 1/1, leaf exact original start/run/end reservations (end awaited), old XState run(input), Interaction run(limits,work) prompt correlation. Managed APIs require explicit control. Single physical root ledger plus parent-owned borrowed scopes; no per-child reset. Root and every child/actor/region/attached Interaction/attempt have distinct internal admission state OPEN→STOPPING→CLOSED, opaque identity and owned operations. Root starts NEW; each scope closes new admission synchronously on return/stop before terminal callbacks and joining. A retained child while parent/sibling OPEN is invalid after child's STOPPING; all ancestor admission fences checked, ancestor/local limits shared; closed ancestor prevents descendants. Scope-local cancellation closes descendants and signal, not unrelated sibling/root; root abort cascades. Scope owns its active child promises/listeners/leases; never detached, no self-join; wait actual local resource quiescence before CLOSED and KDP dispose. A remote request can remain UNKNOWN after local quiescence; bounded terminal readback records fact, not forced remote settlement. Noncooperative local callback cannot be preempted; task requiring hard deadline must reject unqualified adapter before entry; otherwise stop new work and await quiescence, no SDK background observer. If trusted callback violates cooperation, elapsed overrun is observable, no false finite return. No root reopen or hidden resume. Terminal reads only already-reserved readback, separate attempt-bound expiring scope, not new business work.

Managed accounting units (safe positive integers <= 2^31-1 per limit, cumulative checked safe integer; work/model/attempt/event/active counts finite, zero allowed for quotas, invalid limits reject before callbacks). All reservations atomic synchronous across root and every active ancestor, no refund or double charge. Managed child local work cap set by region/definition, ancestor depth checked at admission, all descendant work/event reservations counted at ancestors. Counters for maxEvents (including failure/terminal records), maxActiveScopes (simultaneous owned scopes/attempts; release only at CLOSED, root counts 1), maxWork, model calls/retries/tokens plus legacy calls/steps. Limits do not measure arbitrary trusted TS instructions. No optional user control of counter internals. Terminal reservations held for exact owning scope/attempt, unspent never returned; terminal work allowed only for that owner after stop, not general grant. Normal records and delivery callbacks synchronous bounded (event <=64KiB and finite shape; maxEvents reserves record emission, one work per record includes validated projection/emit and observer, no unmetered retries). A failure diagnostic is not recursively emitted through a failed sink; use reserved failure summary in next/final envelope or explicit terminal reason; optional observer errors recorded separately. Required evidence invalid or throw/non-COMPLETE prevents acceptance/goal, actual receipt retained. Observer/emit guard rejects reentrant admission, async functions rejected before call, unexpected Promise observed for rejection and never awaited/adopted, contract failure; synchronous trusted callbacks bounded by contract, not sandboxed.

| Controlled event | Atomic reservation (calls,steps; work; events) |
|---|---|
| Managed root/borrowed child scope | (0,1; 3;2) for entry + scope open/close records; active slot 1 before creating scope; root has reserved final record from start |
| invoke/invokeOutcome / leaf | legacy (1,1 per callback) plus equal work count; no fabricated node record for unmanaged helper |
| Managed node attempt | (4+K+C+R,4+K+C+R; 4+K+C+R+4;4), K=knowledge callback 0/1, C=cleanup 0/1, R=terminalReads; four record allowances enter/pre-reject, actual, accept/reject, terminal diagnostic (unused never refunded); pre-run/post/project base 4; active scope slot; nested actual work separately through same root |
| work(units,callback) | (1,1;units;0), units positive safe int, trusted bounded operation, cannot use as untrusted arbitrary code |
| region refresh/planner/admit/skip/rebind/edit/encoder/complete | each (1,1;bounded scan units+1; up to 1 record if producer emits), reserve before callback/scan; edit reservation includes rejection alternative; complete includes region completion candidate record before callback; encoder separate before output projection, not hidden extra business call |
| region invalidation/revalidation/feedback/skip observation | (1,1;bounded graph scan units+1;1) per transition before state mutation; pre-reserve needed records for bounded batch, no event without quota |
| XState runIn | borrowed scope above plus (1,1;1+P;P), P=maxProjections incl terminal actor projection; actor source transition observer consumes its own reserved ticket before project; if no projection ticket for next snapshot stop actor, terminal scope record still reserved, no success based on unobserved final |
| Interaction decide/wait | legacy (1,1) each plus 1work, attached borrowed scope above; feedback checkpoint (1,1;1;1) before consuming revision update; pending response matching remains existing contract |
| Model request | (1,1;1+bounded request/response scan units+2;2), before credential/network plus model call/retry and conservative tokens; selected/result events reserved, failure alternative; no new work after deadline |
| recordModelDecision | (0,1;1;1) before decision event |
| remaining/read-only bounded already-materialized snapshot | (0,0;0;0); building/projection is controlled work, not read |

Node invocation uses borrowed attempt fence with its own reserved record allowance, not double charge generic scope open/close records. Root/child mandatory terminal scope record includes any additional failure summary and actual local quiescence; no extra event required when reserved event exhausted. All work units include finite SDK loop passes (see next). Native legacy root close has no managed event contract, no extra charges to historical simple paths. On admission refusal due exhausted work/events, do not emit unreserved record; preserve reason through already reserved owning scope terminal record, stop/return non-success, no effect. Root with insufficient 3work/2events/1step does not enter or promise evidence; returns stable failure. Zero/one-short for root, actor, node and terminal read verified later. No extra arbitrary max values unsupported by implementation; hard caps for structures §4; maxActiveScopes <=4096, maxEvents <=65536 for bounded active metadata and total records. No unbounded observer/lease registry. Finite event seq monotonic per root; SDK-generated run/scope/instance identities distinct, attempts monotonic within same obligation, no fake occurrence for root/region/model. Event fields from §2 typed union: kind/phase/identity/outcome (redacted Outcome<void>), actual entered vs pre-reject/skip, post state, acceptance, source metadata, effect/receipt (domain authoritative projection), reason and usage. Domain actual fact and output acceptance separate; receipt known commit never erased by late revision/evidence failure. For node actual/acceptance events domain's project supplies explicit typed effect/receipt data: replace project return J in §2 with Readonly<{effect:'none'|'committed'|'unknown'|'not-applicable';receiptId?:string;detail:J}>; unknown/committed only trusted source, no false 'none' on absent receipt. No private thoughts/raw exceptions/native objects. Model no-call event explicitly no profile/model and usage unavailable. Scope open/stopping/closed: emit open and final closed; stopping state observable in final reason (if explicit stopping event requested requires own normal record; no mandatory extra terminal ticket). Outcome in final event means candidate result delivered to evidence sink; if sink fails, public returned result non-success, not atomic external commit.

Structural scanner work reserve before parse: 1+ceil(maxCandidateBytes/256)+4*(maxJsonItems+maxNodes+maxBindings+maxEdits) for bounded passes on capped input; explicit graph scan 1+4*(maxItems+maxDependencies), cap 4096/16384. Projection/encoder/refresh similarly pre-reserve 1+ceil(maxProjectionBytes/256)+4*(maxJsonItems+maxBindings) within region, fixed node safe detail cap64KiB/8192items enforced with pre-reserved scan units per event (ceil(65536/256)+4*8192) added to work for every record allowance in table. Model scan 1+ceil((requestBytes+responseBytes)/256)+4*8192 per request; charge full declared maxima, no double debit when actual bytes less. Candidate malformed/oversize still charged admission before parse; header length checked bounded, capped body read then cancel. Limits technical conservative counters, not exact CPU; bounded iterative scanner rejects duplicate/prototype-sensitive keys, invalid UTF-8/nonfinite/depth/items. Native trusted callbacks obey bounded construction and cooperation; no arbitrary JS sandbox. Candidate/response/request <=1MiB each, JSON depth<=32, items<=8192, live plus attempted local node entries <=256, bindings<=2048, edits<=128; root work counts cumulative, no unlimited new IDs. Native slot values not enumerated/serialized by SDK, trusted domain bounds native acquisition and validation. Private state metadata count bounded by nodes/items/scopes; epoch/attempt safe integer overflow rejects.

Clock: monotonic active elapsed whenever any leaf owned operation running (ancestor awaiting child not double-counted; ancestor independently doing work counts active), pause only when at least one real published user wait and all current leaves waiting, none active; transition ledger on start/end/wait/resume, do not pause for arbitrary Promise or remote I/O. Arm active remaining timer when active, wall timer always if configured, both close admission/abort even while awaited; before/after awaited checks catch deadline races. Terminal window starts on actual stop requiring reconciliation, or node completion if terminal reads needed, finite maxSettlementMs not reset per retry; no normal business admission. Finite no-progress consecutive count per region (new ID/revision/no-op not progress; actual verified fact/goal/node state change only); root work also caps all rejected attempts and feedback. Clock expires before actual invocation if stale, local quiescence as above. Model maxOutputTokens per-call root ceiling, maxReservedTokens aggregate conservative quota, not same field.

Managed node sequence: reserve all entry+terminal allowance before any callback; snapshot trusted definition/options/input metadata, create attempt identity and borrowed scope, current frame validated. Resolve actual raw observations via existing resolveEvidence (§2.1); verify current guard/scope/fact epoch/revisions after knowledge and before callback, after pre and immediately before actual callable. Pre may not perform business effect; reject no actual run, applicable cleanup for entered resources, actual pre-reject record not fake run. Business Function executes same native invocation, preserves Outcome; actual entered result/exception/cancel/timeout/unsettled recorded; always applicable post observation and cleanup with terminal scope read allowance. A post-read callback only observes/reconciles authorized fact, cannot replay unknown effect. Current frame recheck after await, post/cleanup/encoder/evidence and immediately before publishing accepted result; stale receipt still observed, never advance old plan. Pre/post/cleanup/project/evidence failure cannot yield accepted output, preserve first non-success/UNKNOWN and actual commit. Domain determines conflict of effects using authoritative source; different command ID doesn't resolve prior UNKNOWN. Required gate/goal rechecked §4. Node attempt closes admission before terminal callbacks (terminal read scope only), joins actual entered local operations before scope ends, result acceptance only if quiescent/current. Native nested child during business run attaches to borrowed attempt scope; parent result not usable until child joins. Explicit final root close fence before terminal callback/observer; no reentry or new work. Existing .1/.3 legacy behavior regression required. No durable persistence/recovery.

## 4. Current context, anchor obligations and bounded dynamic composition (R17-P1-01/02/03)

Ordered immutable anchor obligations separated from mutable gaps; physical history immutable, current satisfaction mutable. Each required anchor has trusted definition, logical obligation ID, current accepted attempt+provenance/dependencies and status unsatisfied/valid/stale/blocked. Optional nodes similarly have logical identity vs attempts. Cursor means earliest unsatisfied required obligation or pending eligible optional node in ordered layout, NOT permanent history index. Current slots only validated output from accepted attempt with valid dependencies and epoch/source revision. Refresh from actual domain observations (raw, resolve with independent trusted frame); refresh stages native typed slot writes and source/dependency metadata, commits atomically only current. Domain's refresh changed keys and scoped source versions; SDK compares actual slot/provenance identity and mandatory declared dependencies, invalidates result/anchor/gate via existing finite invalidateEvidence; absent dependency declarations conservative stale. Exact typed native dataflow and allowed context/capability names per scope; private child sources don't leak, only explicitly delegated inputs and verified output/provenance; parent dependencies invalidated when child output validity changes. Current global epoch changes on actual relevant revision/feedback, not repeated same data. For unchanged evidence retain only after scope/version/asOf/applicability and dependency proof; update validation binding to current frame without inventing reexecution. Fixed native nodes use same mandatory current frame and pre/post checks; domain fixed control explicitly routes back to a read-only validation node when actual need, no automatic mutation of trusted code.

### 4.1 Revalidation and edit semantics

On invalidation mark affected anchor obligation stale even if earlier historically executed; remove its result slots from current view, cascade downstream (including current child output/finish candidate). Preserve all actual attempts, effects, evidence. Recompute earliest unsatisfied anchor/pending predecessor; trusted SDK reopens allowed prior gap for repair/rebind, not model skipping or changing anchor. Replay a stale logical anchor or predecessor with fresh attempt/occurrence reference only when explicit pure-read-only replay policy and domain current guard pass, no prior unknown/committed effect to repeat, same root budget/depth; prior attempt remains immutable. If invalidated effectful/UNKNOWN obligation, block replay and dependent/conflicting effect, use explicitly authorized reconciliation read-only capability to establish current fact and trusted gate policy, or return UNKNOWN/non-success. Do not declare existing committed effect undone. Stale generated child: replay only explicit pure-read-only region and actual trace no effect/unknown; otherwise reconcile/stop; no new root. Current gate satisfaction after replay must reference new verified attempt, not historical accepted status. Unaffected anchors stay valid and need not rerun; global mandatory completion checks current obligations not existence. Revalidation consumes own work/record, no unbounded loop; no-progress and root limits.

Edit batch atomic, proposal references existing issued instance ID or same-batch earlier alias, never definition display name. Template local names immutable; reuse clones template with new occurrence ID and remaps references only to explicitly named prior accepted result/context or earlier same-batch alias; unresolved/self/future/foreign reference rejected. Reuse of same template never reuses prior output by ID. Initial child specs inserted into first declared mutable gap, validated under delegated capability/slot restrictions and trusted child contract before work; no arbitrary new function. Insertion only in allowed current/future gap or reopened repair gap. Move within same gap and pending only, before named pending node or end; recheck data dependency ordering. Remove only pending optional with no required downstream binding after entire transaction. Skip pending optional only (no executed result, no fabricated value), canSkip must prove domain not needed or equivalent valid source. Rebind edit explicitly targets input of pending optional OR pending/stale required anchor obligation, not history; domain canRebind confirms allowed source and equivalence/applicability (mandatory anchor's contract/identity unchanged), input slot token and source provenance current. From binding known in candidate copy, to legal context or earlier current result; no literal asserting authority. Required anchor pending/stale effective bindings stored per current attempt, not immutable source definition. If already accepted target's input affected, invalidate first via trusted revision, then rebind effective binding for new attempt; cannot silently modify accepted history. All dependent consumers including required anchors must remain satisfiable after skip/remove, or entire batch rejects. Replacing pending optional = remove+insert with explicit rebind; no alias collision. Forward refs/cycles/foreign scopes/unavailable tokens/illegal gate or gap edits reject. All reachable paths preserve fixed ordered anchors; no general DAG or dynamic parallel scheduler.

Algorithm:
1. Borrow current root scope, reserve planning/refresh/validation; snapshot run/region/plan+fact epoch, root/scope OPEN, bounded context. Candidate parser bounded before construction; proposed structure uses JSON names and refs only, native values private. Verify trusted layout and anchors, limits, current source and delegated capability identities.
2. Copy bounded pending structure/effective bindings; apply finite edits with local aliases, validate dependency order/cap/required anchors and typed binding admissibility, collect staged changes. Validate skip/rebind/business policy on current view (async permitted but recheck frame+root+scope+revision after each await). Before commit re-read captured identity, frame, revisions, scope OPEN; atomic sync commit or whole reject; reserve records beforehand. No partial mutation on invalid proposals.
3. Execute earliest current ready obligation/pending node through same node primitive. Read native typed inputs from scope-bound reader, guard then actual Function/child, post/observe and typed writer staged, check current after every async phase/encoder/required evidence; only publish validated current result. Update actual progress. Loop refresh/propose/revalidate under same budgets; finish action no authority.
4. On feedback/new observation update trusted epoch/deps, invalidate downstream and reopen earliest affected safe obligations; Interaction uses same-root borrowed scope and prompt identity. User changes don't rewrite root contract, actual receipt facts retained; model no direct state mutation. If actual root goal changes outside allowed scope, require trusted new task/explicit rejection. If canceled/time over/stale after await, no new plan acceptance; actual observation/cleanup retained.
5. Completion: check all current required anchors and prerequisites valid, no required pending/stale work, current frame/plan/fact epoch, invoke trusted complete under reservation; after await recheck all these plus currentness, after output/critical evidence delivery recheck again synchronously before returning current COMPLETE. If changed, invalidate/replan bounded or non-success, no stale COMPLETE. Parent child result same rule at parent acceptance, independent root goal. Partial verified evidence may accompany non-success, not fabricated success.

Positive mandatory-anchor revalidation: compatibility anchor A accepted using quote r1; later actual quote r2 invalidates A and dependent comparison, cursor later; reopen A with fresh read-only attempt (same logical obligation), source r2 validated, unaffected vehicle ID anchor retained, new comparison executes, current completion gate. Legal skip optional duplicate source read with actual equivalent accepted context slot, rebind required anchor input by explicit trusted equivalence; illegal skip missing dependency rejects. Negative complete awaiting r1 then change to r2 -> old result rejected, receipt preserved if any; no replay of unsafe effect/UNKNOWN, independent readback guard; child late result cannot advance parent. Fixed/dynamic common native dataflow no JSON conversion. Interaction actual wait and revision same root; no nested resolve while one active, return clarification to owner, existing prompt correlation and approval distinction. No mandatory global Context Manager, no runtime discovery.

## 5. Model protocols and feasibility decision

Prefer Node native fetch (no new runtime dependency) for explicit protocol scope. Official references freshly checked 2026-11-26:
- https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- https://developers.openai.com/api/docs/guides/migrate-to-responses
- https://platform.claude.com/docs/en/api/messages/create
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://nodejs.org/download/release/v22.12.0/docs/api/globals.html

| Common feature | OpenAI Chat Completions | Anthropic Messages |
|---|---|---|
| endpoint/auth | explicit HTTPS endpoint ending /chat/completions, Bearer | /messages, x-api-key + anthropic-version |
| initial instruction | system message | top-level system |
| user | user content string | user text content |
| Function description | tools[].type=function, function.name/description/parameters | tools[].name/description/input_schema |
| actual proposal | choices single message.tool_calls, id/name/arguments JSON string | content tool_use id/name/input object |
| actual results | assistant exact prior call message then role=tool per call tool_call_id | assistant exact prior text/tool_use order then single user tool_result blocks, tool_use_id; no intervening message |
| structured output | response_format json_schema when explicitly supported; local decoder | output_config.format json_schema when explicitly supported; local decoder |
| output bound | profile max_completion_tokens or explicitly compatible max_tokens | max_tokens |
| termination | finish_reason stop/tool_calls valid when corresponding content valid; length/content_filter/refusal/error non-success | end_turn/tool_use valid when corresponding content valid; max_tokens/refusal/pause_turn or unsupported block/stop non-success |
| usage | prompt_tokens, completion_tokens, total_tokens if provided | input_tokens, output_tokens and reported cache fields as applicable; no invented total if components unknown |

Strict JSON schema does not prove business correctness, provider-specific unsupported recursive schemas are not mandatory. Model request schema/description supplied only from trusted binding, no untrusted endpoint/credential/provider options. Non-strict structured proposal via JSON text + local finite decode; no fallback from strict unsupported. Require explicit capability profile, no guessing model supports feature; OpenAI Responses not Chat wire (out of minimal baseline). HTTP nonstream response only, single model choice; limit response bytes incrementally (including decompressed stream), abort on overflow, cancel reader, fatal UTF-8 decode; no automatic retry/redirect (reject redirect and do not forward credential), HTTP errors mapped to stable redacted categories (429 limited, 5xx unavailable, 401/403 denied, invalid response, timeout/cancel, refusal); never log auth/body/raw provider error. Endpoint trusted static config, HTTPS by default; HTTP loopback only explicitly trusted test/local configuration, no model-supplied URI; trusted proxy deployment separately tested if needed. n=1, stream=false, no server-side tools, no provider automatic persistence assumption. Tool result carries actual bounded observation, including error; no tool called just because response is syntactically valid. Explicit caller fallback only before new request using same root quota and allowed data scope, no implicit retries. Token budget §3. Protocol fixture tests exercise exact wire shapes/mismatch IDs, unknown tools, malformed arguments, wrong choice/content/finish reason, output caps, usage absent, unsupported strict, provider status, redirect and abort; at least one actual real provider loop and two independent actual Model uses in product qualification.

Actual controller feasibility probe in current environment 2026-11-26: Node v22.16.0 linux x64, native http loopback + fetch, no network credentials, 4 assertions PASS (normal bounded body, over-limit cancellation, redirect rejected with target hit count 0, AbortController cancels slow body read). Probe SHA256 53c0ba4c77cc87c3c205daed03a9e0aeeb4dcab9e1f8f95bbf007eef10639174; this is a disposable design probe, not shipped code, not provider/protocol adapter test, not exact minimum 22.12.0 or Windows evidence. Reproduction: Node loopback server returns {"ok":true}, 256-byte body with 64-byte cap, 302 /target with counter, delayed body write 1500ms; fetch redirect:error; reader getReader/read loop counts bytes and cancels over cap; abort signal after 50ms while reading delayed body. Exact SDK adapters, real provider credentials and platform qualification NOT_RUN; use actual environment only when required, no continuous agent. Library alternative official SDK/AI SDK rejected for now due larger unverified dependency closure/automatic retry/executor risk; revisit if native transport cannot meet actual contract.

## 6. Oracle dossier — concrete candidate independent of implementation

These demand fixtures are controlled synthetic business records, not live supplier/production claims. Owner requested real-demand complexity or adversarial scenarios; real computations/query/Host and independent objective checks mandatory. Freeze reviewed requirements, data bytes and expected predicates BEFORE source implementation. Reviewer must recompute independently and flag unrealistic/insufficient cases; controller's calculations below are not independent acceptance. Implementation writer does not control oracle. Use same fixture IDs for tests; fixture files with exact SHA256 and separate sealed hidden/adversarial cases from independent evaluator before implementation. No SDK-specific oracle assumptions of function names for business correctness, but actual topology observations required by AC06. No test solely checking mock calls.

### D-A procurement, exact quantity and incompatible substitutes
Demand 6 compatible units, max lead 5 days, budget 75 integer monetary units, minimize total cost then delivery then stable offer ID order. Zero additional tax/shipping in fixture, no partial order, each used supplier meets MOQ pack count, finite availability. Offers: A compatible pack3 cost30 lead5 max2 MOQ1; B compatible pack2 cost24 lead2 max3 MOQ1; C incompatible pack1 cost5 lead1 max6 MOQ1; D compatible pack2 cost20 lead3 max2 MOQ2. Counts nonnegative integers. Actual typed domain query (SQLite/Graph or explicit finite query with source completeness), compatibility rule, pack/MOQ/cost calculation. Independent enumeration of all count products (3*4*7*3=252 combos), filter exact 6 and rules. Controller computed:
| User demand | Feasible plans by (cost, lead, A/B/C/D counts) | Expected |
|---|---|---|
| lead<=5,budget75 | (60,5,2/0/0/0), (64,3,0/1/0/2), (72,2,0/3/0/0) | 60, A2 |
| lead<=3,budget75 | (64,3,0/1/0/2), (72,2,0/3/0/0) | 64, B1+D2 |
| lead<=2,budget75 | (72,2,0/3/0/0) | 72, B3 |
| lead<=2,budget70 | none | non-success infeasible, no fabricated quote |

Actual workflow demand: before price comparison establish mandatory compatibility and source validity; if alternative supplier data missing, actual lookup inserted; user asks comparison with faster delivery, add analysis node, reuse existing candidate verification, skip redundant optional lookup only when source-complete equivalent valid evidence; real feedback revises lead, changes admitted structure and comparison but not unaffected compatible-source proof. Required final validation anchor always executed; adversary cheap incompatible C, D MOQ violation, wrong revision/tenant, truncated offers, malicious text pretending authority, skipping compatibility/verification or stale output rejected. W01 fixed TS no model uses same validation/context node, W04 actual model multi-step insert query/comparison and actual observation back to model, W05 changed user constraints and hybrid path. Additional fixed XState workflow uses explicitly managed nodes. Real model may choose different valid route, oracle checks business optimum and required topology properties, not exact prose. No purchase effect.

### D-B repair scheduling, actual constrained professional solver
Three jobs each inspect then repair, no preemption, two separate capacity1 resources I (inspection) and R (repair lift), integer start times; J1 duration I1/R3 release0, J2 I2/R1 release0, J3 I1/R2 release1; horizon8, minimize makespan then sum repair completion times then lexicographic starts if deterministic tie required. Real professional solver (e.g. prior SciPy MILP as external domain tool, not SDK dependency), independent enumerator tests all 9^6 start vectors, release, precedence, pairwise resource non-overlap, horizon. Controller enumeration: 98 feasible vectors, optimal makespan7 (11 opt makespan vectors), lex best objective (7,16) starts I=(0,1,3), R=(1,4,5); deadline6 infeasible (0), deadline7 11 feasible. Lower bound earliest repair1+total repair6=7. Oracle permits any plan satisfying chosen objective tie policy, never treats infeasible solver status as dispatch success.
Actual demand: changed deadline, missing resource status or additional check requires dynamic generation; deterministically generate parent feasibility region with runtime child repair sequencing region, child's planner generates grandchild resource conflict analysis region (each actual generated nodes and I/O, not prewritten three branches); same root ancestor limits, no model for W03/W06; W02 fixed Model Function extracts user constraint from ambiguous text with trusted validation and real Interaction; W05 user correction re-solves only affected dependencies; second actual Model use and Interaction both domains. Invalid precedence/overlap/release, false makespan, cyclic/forward dependency, old solver revision, impossible deadline and canceled solver result negative. Professional solver is real, enumeration independent of solver algorithm; external process ownership/cancel/quiescence observed. No actual dispatch.

### D-C real authorized effect, failure and concurrent roots
Reuse prior actual independent loopback InventoryAuthority/SQLite Host. Controlled stock=5 version0; authorized reserve qty2 with actual current grant -> stock3/version1/one effect. Barrier delay response after actual Host commit; change plan revision before release; old plan result not accepted, actual receipt still observed/readback stock3, no false rollback. Lost ACK after commit -> readback exact original identity or UNKNOWN; before readback resolution different command ID same resource conflicting qty must not submit; independent authorized resource allowed only trusted conflict guard; revoked/expired approval, wrong principal/payload/revision, PREAUTHORIZED/PER_CALL/SESSION, CAS two clients at same version => exactly one commit. Actual DB queries independent of client output. Fault injection at proxy/test boundary only. Critical evidence sink failure after commit yields non-success/UNKNOWN while receipt/count preserved. Actual root with Interaction wait/cancel interleaves second root progress; no shared counters/context/auth. Noncooperative remote delayed response vs local lease release test; controlled local Promise barrier remains active, no KDP disposal or false CLOSED until quiescent. Prevalidation reject zero actual call; post failure, exception, cancel, timeout and stale receipt checked separately. Keep same actual authority/receipt contract, not SDK-wide conflict policy.

### 6.1 AC/DY/W/F-W mapped evidence
| Oracle ID | Observable positive/negative witness | L1 and foundation |
|---|---|---|
| O01 fixed no-model | D-A fixed native + XState, D-B fixed constraints, zero credential/network/model init, known complete path; missing required authority non-success | AC01,W01,F-W01 |
| O02 two wire families | actual loopback protocol fixtures each valid + malformed IDs/shape/refusal/429/5xx/timeout/abort/unsupported strict/usage/oversize; >=1 real provider loop D-A and second real use D-B | AC02/03,W02/04 |
| O03 context and scope | D-A source complete vs truncated, D-B job/resource revisions; cross-sibling/child dependencies, stale proposal, private/other-root slot rejection, mandatory context cap | AC03/04,F-W05 |
| O04 real dynamic topology | D-A real LLM observation reentry, D-B deterministic generated child+grandchild; fixed anchor actual pre/post, W05 feedback alters plan | AC05/06,W03–06,F-W02/03/06 |
| O05 edit legality | each DY operation compare admitted structure before/after and actual calls, no output from skip, reject anchor bypass/unknown capability/forward refs/cycle/oversize/stale/child scope | AC06/07,DY01–06 |
| O06 node envelope | D-A/D-B pre-reject zero run, post-reject no accepted output; D-C actual commit and stale/exception/cancel/timeout/critical evidence matrix | AC08/12/13,F-W02/06 |
| O07 resource/lifetime | root/local zero and one-less at proposal/parse/node/child/terminal reservation, depth/cap, repeated invalid/no-op, model token/retry, wait active/wall, retained context after close, noncoop local barrier no resource release | AC09,F-W04 |
| O08 native reuse | identical actual Function direct and Tool, reusable fixed child and generated child with typed contract, unique occurrence/attempt, changed child internals same parent | AC10,F-W02/03 |
| O09 interaction/authority | actual feedback both directions same root and invalidation, two roots interleaved, real Host contention/UNKNOWN/different-ID conflict | AC11/12,F-W04/05 |
| O10 evidence consumer | actual bounded safe observation output includes plan edit/revision/actual nodes/source/model optional/usage/terminal, critical sink failure preserves receipt, no private secrets/thoughts | AC13,F-W06 |
| O11 installed product | per shared capability two independent actual uses, actual packed SDK Linux and Windows x64 Node22.12.0, TS positives/negatives/root expectations, affected LIFE/QA tests, no private import | AC14 |
| O12 stranger + maintenance | independent D-A/D-B (or equally difficult frozen fresh domain) consumer generated from public SDK and demand, hidden oracle held by evaluator; actual build/run, separate new requirement maintenance, preserved initial evidence | AC15 |

DY01 generate actual fresh node distinct from template; DY02 reuse template distinct occurrence; DY03 actually admit/execute new node (not advice); DY04 legitimate skip with equivalent or no required output, illegal skip rejected; DY05 runtime child then generated grandchild, actual parent-child input/output/identity; DY06 reorder/replace/remove pending within gap, actual feedback/revisions and preserve prior facts. Each positive and negative requires actual topology and invocation trace, independent business oracle. W01–W06 exactly as frozen L1, no weakening. F-W01–06 as §2A; cases O01/03–10 cover fixed & dynamic common envelope. Ensure two actual uses per changed Standard: root/node/observation D-A/D-B, XState runIn two actual domain fixed paths (D-A/D-B), region/bindings D-A/D-B, Interaction runIn D-A/D-B, ModelElement actual real requests in both, context/validation/evidence both; Host only Business single domain, not shared Standard. If a shared capability cannot be justified by these demands, simplify/remove candidate API or add independent real need; never waive frozen L1 coverage. Fixture results here are controller computed, not actual SDK pass or sealed independent oracle. Reviewer must evaluate exact predicates and independence; before implementation publish independent reviewer-approved fixture digest/hidden counterexamples (with access control outside writer materials), no post-hoc adjustment to fit implementation.

## 7. Implementation dependencies and gates (proposed, not READY source tasks)

A owner-traceable .1 native foundation: close fence, shared managed root/clock/quotas/lifetime, node execution/progress/XState same-root, exact regression and F-W01/04. B .3 same-root Interaction + applicable evidence seam (depends A), keep original prompt/response rules. C .5 generic domain Workflow region + typed bindings/Context and dynamic admission (depends A, B for feedback), fixed and deterministic real demands first. D .5 Model codecs and bounded transport (depends A; may be parallel to C after shared contracts accepted), real protocol fixture then live domain. E compose C/D/B actual W/DY, postvalidation, Host and evidence in real domains. F engineering abstraction/quality check per QA09/A/B, pack/Node22.12 Linux/Windows, external stranger generation/maintenance and independent final oracle. This is dependency outline, not implementation Task DAG or activation. L2 acceptance and actual independent oracle fixture freeze required before source tasks. Target affected LIFE07–15, EL12–15, QA04A/B/09; preserve earlier simple budget/outcome/error/exit and prompt correlation tests. Syntax/type/lint/relevant tests before any code PR. Local equivalent verification first, Woodpecker only when useful and real platform/Host evidence needed; no recurring agent jobs. No SDK authoring tools, no Forge refactor, no post-run experience platform. 
L2 design decisions made by controller for independent evaluation: shared Workflow primitive before Reasoning, explicit managed-node APIs, finite ordered dynamic regions with immutable anchors, native fetch + bounded codec and local decoders, no generic schema library, candidate resource units/maxima, oracle fixtures and dependency outline. These are not owner-imposed exact implementation details. Open proof prerequisites: compile actual declarations and runtime implementation only after acceptance, exact Node22.12/Windows and live provider availability/credentials, independent fixture sealing and evaluator separation. No actual implementation/CI or product acceptance. 
