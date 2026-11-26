# 0.11.5 R16 · Workflow-first native L2 contract and adversarial qualification design

> #1563 / #1615 / L2 #1767 / PR #1768. Frozen Product/L1 train d289b3fc4b86456f319e6e16a37483b66644b12e, blob 7041bb9f3d6fabfa5db0533bf3f2807276b74ab2; R13 ACCEPT_SCOPED; R14 freeze 7193176743. R15/R16-A0 architecture baseline 36de9cd5356ee55c741425cdfb8d223db43b2d2a / 190ecbbf713230d925022fb2e4305df0caf1671c. 
> L2 CANDIDATE FOR ONE INDEPENDENT REVIEW; NOT FROZEN. This companion specifies the previously open R15 §9, with Workflow strengthening integral to L2, not an optional follow-up. Where R15 illustrative names/choices differ, this companion is the current technical candidate. L1 controls scope. All SDK implementation, AC/DY/W/F-W execution NOT_RUN. Independent reviewer must verify design and oracle adequacy before freeze; actual external consumer task and fixture bytes must be separately sealed before implementation.

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

## 2. Candidate public TypeScript surface (L2, not implementation)

Notation below: Readonly data is snapshot by SDK for bounded JSON and framework metadata; native I/O values remain trusted immutable domain values. Function-valued properties preserve strictFunctionTypes; no bivariant method contract for domain-specific arguments. Optional context-aware entry is additive for old calls. Stable reason codes use existing Outcome.reason; no seventh Outcome. Callback error/invalid return maps to FAILED or UNKNOWN where effect unsettled, redacted. Ordinary constructors should not perform I/O. Omitted optional fields never imply permission.

```ts
type Maybe<T> = T | Promise<T>; // private helper
type Outcome<T> = StandardWorkflowOutcome<T>; // existing
type J = StandardJsonValue; // existing JSON value type; exact runtime validation below

export interface WorkflowControlLimits {
  readonly maxWork: number;
  readonly maxActiveMs: number;
  readonly maxWallMs?: number; // relative to root start; includes actual user wait
  readonly maxSettlementMs: number; // bounded remote observation/cleanup, not force-kill
  readonly maxNoProgress: number;
  readonly model?: Readonly<{
    maxCalls: number; maxRetries: number; maxOutputTokens: number;
    maxReservedTokens?: number; // conservative aggregate cap only with reliable bound
  }>;
}
export interface WorkflowControlOptions {
  readonly limits: WorkflowControlLimits;
  readonly signal?: AbortSignal;
  readonly observe?: (record: WorkflowObservation) => void;
  // trusted synchronous callback; actual acceptance evidence sink separate below
}
export interface WorkflowOccurrence {
  readonly runId: string; readonly parentPath: readonly string[];
  readonly definitionId: string; readonly nodeId: string; readonly attempt: number;
}
export interface WorkflowObservation {
  readonly occurrence: WorkflowOccurrence;
  readonly seq: number; readonly planRevision?: number; readonly factRevision?: number;
  readonly kind: 'enter'|'reject'|'skip'|'observe'|'accept'|'invalidate'|'edit'|'stop';
  readonly detail: J; // safe explicit projection, never raw exception/native input or provider response
}
export interface WorkflowNode<I,O> {
  readonly id: string;
  readonly before: (input: I, scope: NativeWorkflowContext) => Maybe<Outcome<void>>;
  readonly run: (input: I, scope: NativeWorkflowContext) => Maybe<Outcome<O>>;
  readonly after: (input: I, actual: WorkflowAttempt<O>, scope: NativeWorkflowContext) => Maybe<Outcome<void>>;
  readonly cleanup?: (input: I, actual: WorkflowAttempt<O>) => Maybe<void>;
  readonly project: (actual: WorkflowAttempt<O>) => J; // explicit safe actual observation
}
export type WorkflowAttempt<O> =
  | Readonly<{kind:'returned'; outcome:Outcome<O>}>
  | Readonly<{kind:'exception'|'cancelled'|'timeout'|'unsettled'; code:string}>;
export interface WorkflowNodeOptions {
  readonly planRevision?: number; readonly factRevision?: number;
  // trusted synchronous current-revision check, required in mutable region
  readonly current?: () => boolean;
}
export interface WorkflowActorOptions<Snapshot> {
  readonly project: (snapshot: Snapshot) => J;
}
```

Existing public classes extended (no new root):
```ts
// StandardWorkflowSession(limits: WorkflowLimits, control?: WorkflowControlOptions)
// run<T>(action: (root: NativeWorkflowContext)=>Maybe<Outcome<T>>): Promise<Outcome<T>> unchanged
// NativeWorkflowContext additions; legacy invoke/invokeOutcome/child/leaf/remaining remain:
readonly signal: AbortSignal;
readonly runId: string;
node<I,O>(definition: WorkflowNode<I,O>, input: I, options?: WorkflowNodeOptions): Promise<Outcome<O>>;
work<T>(units: number, action: () => Maybe<Outcome<T>>): Promise<Outcome<T>>;
// XStateWorkflowElement retains run(input) and adds:
runIn(input: InputFrom<Logic>, root: NativeWorkflowContext,
      options: WorkflowActorOptions<SnapshotFrom<Logic>>): Promise<Outcome<Output>>;
// InteractionElement retains run(limits, work), adds:
runIn<T>(root: NativeWorkflowContext, work: (scope: InteractionScope)=>Maybe<Outcome<T>>): Promise<Outcome<T>>;
```

The general node API is not a dynamic interpreter. Fixed domain code can directly call `root.node(checkCompatibility, vehicle)`, bind its COMPLETE value to the next native node; direct raw Function call remains valid for unmanaged helper. For XState, trusted actor actions/invokes explicitly receive supplied root through typed input closure; runIn observes actual snapshot, does not intercept arbitrary actor internal effects or auto-discover managed nodes. Required gates must be explicitly executed as managed nodes by domain-defined fixed transitions. Adapter reserves its entry as controlled work; actor terminal projection and stop obey §3. SDK tests actual producer transitions and gate reachability; no static proof of arbitrary trusted TS code.

Domain Context and dynamic region:
```ts
export type WorkflowSlotBinding =
  | Readonly<{kind:'literal'; value:J}>
  | Readonly<{kind:'context'; slot:string}>
  | Readonly<{kind:'result'; node:string; slot:string}>;
export interface WorkflowNodeProposal {
  readonly alias: string;
  readonly capability: string;
  readonly input: Readonly<Record<string,WorkflowSlotBinding>>;
  readonly initial?: readonly WorkflowNodeProposal[]; // only for region capability
}
export type WorkflowEdit =
  | Readonly<{kind:'insert'; gap:string; before?:string; node:WorkflowNodeProposal}>
  | Readonly<{kind:'reuse'; gap:string; before?:string; template:string; alias:string}>
  | Readonly<{kind:'skip'|'remove'; node:string}>
  | Readonly<{kind:'move'; node:string; before?:string}>;
export interface WorkflowRegionProposal {
  readonly runId:string; readonly regionId:string;
  readonly planRevision:number; readonly factRevision:number;
  readonly edits:readonly WorkflowEdit[];
  readonly action:'continue'|'finish'|'clarify'|'stop';
}
export interface WorkflowRegionLimits {
  readonly maxWork:number; readonly maxDescendantDepth:number;
  readonly maxCandidateBytes:number; readonly maxJsonDepth:number; readonly maxJsonItems:number;
  readonly maxNodes:number; readonly maxBindings:number; readonly maxEdits:number;
  readonly maxProjectionBytes:number;
}
export interface WorkflowRegionView {
  readonly runId:string; readonly regionId:string;
  readonly planRevision:number; readonly factRevision:number;
  readonly goal:string; readonly constraints:readonly J[];
  readonly slots:Readonly<Record<string,J>>;
  readonly nodes:readonly Readonly<{id:string; definitionId:string; gap:string;
    state:'pending'|'running'|'accepted'|'rejected'|'skipped'|'stale'|'unknown'|'removed'}>[];
  readonly capabilities:readonly Readonly<{id:string; description:string;
    kind:'function'|'region'; schema:J}>[];
}
export interface WorkflowFunctionBinding<I,O> {
  readonly id:string; readonly description:string; readonly schema:J;
  readonly decode:(value:J)=>Outcome<I>;
  readonly node:WorkflowNode<I,O>;
  readonly encode:(value:O)=>Outcome<Readonly<Record<string,J>>>;
}
// Opaque SDK-created value/type, no public execute or arbitrary code in proposal.
// Internally captures typed decoder, same native node, encoder, or trusted region factory.
export interface WorkflowCapability { readonly id:string; readonly kind:'function'|'region' }
export function bindWorkflowFunction<I,O>(binding:WorkflowFunctionBinding<I,O>):WorkflowCapability;
export function bindWorkflowRegion(binding:Readonly<{
  id:string; description:string; schema:J;
  create:(input:Readonly<Record<string,J>>)=>Outcome<WorkflowRegionDefinition>;
}>):WorkflowCapability;
export interface WorkflowRegionDefinition {
  readonly id:string; readonly goal:string; readonly constraints:readonly J[];
  readonly limits:WorkflowRegionLimits;
  readonly capabilities:readonly WorkflowCapability[];
  // required anchors are domain-selected nodes; gaps are ordered mutable slots between them.
  readonly layout:readonly (
    | Readonly<{kind:'anchor'; id:string; node:WorkflowNodeProposal}>
    | Readonly<{kind:'gap'; id:string; templates:readonly WorkflowNodeProposal[]; seed:readonly string[]}>
  )[];
  readonly refresh:(root:NativeWorkflowContext, previous:WorkflowRegionView|undefined)
    =>Maybe<Outcome<Readonly<{
      slots:Readonly<Record<string,J>>;
      sources:readonly J[]; changed:readonly string[];
      dependencies:readonly EvidenceDependency<string>[];
    }>>>;
  readonly plan:(view:WorkflowRegionView, root:NativeWorkflowContext)
    =>Maybe<Outcome<WorkflowRegionProposal>>;
  readonly admit:(current:WorkflowRegionView, proposed:WorkflowRegionProposal)=>Maybe<Outcome<void>>;
  readonly canSkip:(nodeId:string, view:WorkflowRegionView)=>Maybe<Outcome<void>>;
  readonly clarify?: (view:WorkflowRegionView, root:NativeWorkflowContext)=>Maybe<Outcome<void>>;
  readonly complete:(view:WorkflowRegionView, root:NativeWorkflowContext)
    =>Maybe<Outcome<Readonly<Record<string,J>>>>;
}
export function runWorkflowRegion(root:NativeWorkflowContext, definition:WorkflowRegionDefinition,
  initial?:readonly WorkflowNodeProposal[]):Promise<Outcome<Readonly<Record<string,J>>>>;
```

Clarifications normative for design: region is JSON *proposal/projection boundary only*; fixed/native typed objects not forced into JSON; child factory validates typed input before constructing a region. Binding captures concrete Function (or ordinary Workflow call), not a global registry. Runtime capability object must be authenticated by module-private WeakMap/brand, not structural public interface alone. Only explicitly delegated binding set copied by trusted definition; child factory may use trusted private internal native helpers, but dynamic capability/slot authority must be subset of trusted parent delegation (private prebound helpers do not become model-selectable). View includes only domain-safe projected slots; result slots are exposed only after node validation, encoder success and current revision; encoder is bounded projection, not second business invocation. Schema is provider-facing description; local decoder authoritative and tests ensure agreement on supported shapes. Domain decoder must enforce shape and professional constraints; not claim arbitrary supplied JSON schema is runtime-enforced by SDK. No new validator DSL. For SDK-owned proposal schema, handwritten finite parser plus exact documented schema + conformance tests; no dependency on general JSON Schema validator in this candidate. If two real consumer cases require generic schema validation, evaluate vetted dependency in finite L2 delta before implementation; never silently accept unknown keywords as enforced.

Required gate reachability: layout anchors immutable ordered; each gap may edit only own pending nodes; cursor cannot cross an anchor except after actual anchor accepted, and cannot finish until all required anchors and required completion predicate pass. Skip cannot target anchors; skipped optional output never becomes a value. Gap template existing instance fresh on reuse; initial/insert creates actual fresh local occurrence. Child generated through region capability with initial runtime node specs; child layout trusted; initial specs admitted into the first declared mutable gap before execution, then its own planner can generate a grandchild. No child factory may create a new root. Output, provenance and parent scope checked at child boundary. `complete` is trusted, called only after gates and no required pending work; it returns final validated typed JSON projection, not a model finish claim. Native domain wrapper can decode to rich O. Planner may run on actual state after each accepted node/refresh; action continue executes next pending node or consumes no-progress count if none, finish requires gates+complete, clarify calls declared same-root checkpoint and refreshes, stop returns non-success. Anchors execute at cursor, not controlled by model. `admit` is extra trusted business policy, not ability to override structural validator. Async admission compares original plan/fact revision again before atomic commit. For native plans same bounds apply; planner is trusted cooperative code, not arbitrary JS sandbox. R16 chooses finite ordered regions with dependencies on earlier accepted result slots; no dynamic general parallel/conditional graph API, existing fixed TS/XState control intact.

Model API:
```ts
export interface ModelProfile {
  readonly id:string; readonly protocol:'openai-chat'|'anthropic-messages';
  readonly endpoint:string; readonly model:string;
  readonly credential:()=>Maybe<string>;
  readonly tokenField?:'max_tokens'|'max_completion_tokens'; // only OpenAI explicit
  readonly anthropicVersion?:string; // required for Anthropic profile
  readonly features:Readonly<{tools:boolean; jsonSchema:boolean}>;
  readonly limits:Readonly<{requestBytes:number; responseBytes:number; maxOutputTokens:number; timeoutMs:number}>;
  // Optional trusted conservative *upper bound*, not tokenizer estimate.
  readonly boundInputTokens?:(request:ModelRequest)=>number;
}
export interface ModelToolDescription {readonly name:string;readonly description:string;readonly inputSchema:J}
export interface ModelToolCall {readonly id:string;readonly name:string;readonly input:J}
export interface ModelToolResult {readonly callId:string;readonly value:J;readonly error:boolean}
export interface ModelUsage {
  readonly input:number|null;readonly output:number|null;readonly total:number|null;
  readonly kind:'observed'|'estimated'|'unavailable';
}
export interface ModelTurn {
  readonly text:string; readonly calls:readonly ModelToolCall[]; readonly usage:ModelUsage;
}
export interface ModelRequest {
  readonly system:string;
  readonly input:readonly (
    | Readonly<{role:'user';text:string}>
    | Readonly<{role:'assistant';turn:ModelTurn}>
    | Readonly<{role:'tool-results';results:readonly ModelToolResult[]}>
  )[];
  readonly tools:readonly ModelToolDescription[];
  readonly output: Readonly<{kind:'text'}|{kind:'json'; schema?:J; strict:boolean}>;
  readonly maxOutputTokens:number;
  readonly retry?:boolean; // charged in same root; caller decides, no automatic retry
}
export class ModelElement {
  constructor(profile:ModelProfile);
  generate(root:NativeWorkflowContext, request:ModelRequest):Promise<Outcome<ModelTurn>>;
}
```

Model turns from successful calls must retain protocol-required safe ordering of text/tool blocks privately (SDK-owned brand for continuation, bounded and bound to profile/root, not public model authority); domain provides actual tool results correlated to exact preceding calls. Unknown/repeated/foreign IDs and malformed role order rejected before request. No server tools, hidden thought retention, multimodal, streaming or automatic provider switching. Model request output JSON parse and proposal shape checked locally by region planner; strict schema feature explicit supported profile, unsupported strict rejects before I/O. Non-strict JSON output mode explicitly requested and locally decoded, never silently downgrade strict. Plain text remains possible without tools. Single turn cannot represent business result success; actual observation separate.

### 2.1 Root public expectation

Existing root runtime values (retain): KernelLifecycle, WorkflowElement, XStateWorkflowElement, JsonReader, YamlReader, readJson, readYaml, writeJson, writeYaml, NativeWorkflowContext, StandardWorkflowSession, routeWorkflowOutcome, runRecognitionHandling, BoundedQueryElement, SQLiteDatabaseElement, SQLiteDatabaseError, VectorQueryElement, GraphQueryElement, BoundedExpressionElement, CliElement, InteractionElement, resolveEvidence, invalidateEvidence, selectNextDecision, prepareCandidates, ClarificationElement, runInteractiveRecognitionHandling (27).
Candidate additions: bindWorkflowFunction, bindWorkflowRegion, runWorkflowRegion, ModelElement (4). No new subpath; do not export codecs/ledger/admission internals, authoring CLI, private brands or runtime graph registry. Existing type exports unchanged from exact baseline index blob 36581edff250571ff1eebcb6f225a817ae325cd2; independently enumerated additions: WorkflowControlLimits, WorkflowControlOptions, WorkflowOccurrence, WorkflowObservation, WorkflowNode, WorkflowAttempt, WorkflowNodeOptions, WorkflowActorOptions, WorkflowSlotBinding, WorkflowNodeProposal, WorkflowEdit, WorkflowRegionProposal, WorkflowRegionLimits, WorkflowRegionView, WorkflowFunctionBinding, WorkflowCapability, WorkflowRegionDefinition, ModelProfile, ModelToolDescription, ModelToolCall, ModelToolResult, ModelUsage, ModelTurn, ModelRequest. Count 24 new named type exports. Public signatures of changed existing values above; method addition expected separately in capability catalog. Implementer must compare explicit expected type and value inventory to actual root/installed declarations; no export-star or expected derived from tested runtime. Compile negative: wrong native input/result, wrong child decoder binding, wrong actor input, unsafe private path, caller-created capability object runtime reject. Compile positive: native fixed node, same callable selected Tool, region child, XState and Interaction attached, no Model dependency/config. This is a signature design, not compiled SDK declaration evidence.

## 3. Root resource, lifecycle and node execution contract

Two modes: original simple Session numeric legacy accounting and managed-control Session with explicit finite limits. Legacy simple path costs remain root start 0 calls/1 step; child 0/1; invoke/invokeOutcome 1/1; leaf start/run/end each 1/1, pre-reserved; remaining read-only. Close fence applies both modes to SDK-controlled entry, not arbitrary trusted direct calls. Managed node/region/Model APIs require control configured (fail before work otherwise); XState run(input) and Interaction run(limits,work) remain valid legacy paths, not automatically claimed to satisfy managed .5 constraints.

| Event | Legacy calls/steps charge | Managed work charge / semantics |
|---|---|---|
| root start / child admission | 0/1 each | 1 each, child depth checked before entry |
| invoke / invokeOutcome | 1/1 | 1 before callback |
| leaf | exact prior start/run/end count | same count before start |
| node | pre + run + post + projection + optional cleanup = 4 or 5 calls/steps, reserved atomically | same number, terminal allowance reserved with entry; pre failure doesn't refund |
| work(units, callback) | 1/1 | units positive safe integer, >=1, caller trusted upper bound for private bounded operation; cannot bypass normal calls through untrusted work |
| refresh/planner/structural admission/edit/feedback/finish | each through work or controlled node/child | >=1 each, admission reserves worst-case bounded scan, see below |
| Model request | 1/1 | 1 + model request quota, optional retry quota + conservative tokens before credential/network; response validation within separately reserved bounded work |
| interaction decision and wait | existing 1/1 each | 1 each; true user wait clock exclusion only while no active sibling work |
| remaining/progress read-only projection snapshot | 0/0 | bounded output; no budget grant |

The above are design accounting units, not CPU instructions. Each admitted candidate parse/scan/graph validation charges deterministic upper bound before processing: one work unit per 256 bytes (ceil), plus declared maxJsonItems + maxNodes + maxBindings + maxEdits of bounded region for worst-case structural validation; bounded iterative parse scanner and finite passes; if budget insufficient reject before parse/admission (even malformed candidate is charged at least admission attempt and byte check; no unbounded rejection loop). Separate cap for bytes/decoded strings, depth, total items and total tree nodes including child initial specs, edge/binding count; use hard implementation maxima (proposal/request/response <= 1MiB each; JSON depth<=32; items<=8192; live/attempted region nodes<=256 per proposal, bindings<=2048, edits<=128; region scope may choose stricter; root work limits total cumulative work). Values and hard maxima are technical defaults/ceilings, not universal domain constraints; no arbitrary unbounded expansion. For preflight oversize raw body count up to cap then cancel; no full materialization. JSON scanner handles quoted escapes, rejects duplicate keys, non-finite numbers, prototype-sensitive keys, malformed UTF-8 and excessive nesting/items; no recursive parse before structural guard. Trusted native proposals are limited plain JSON data, no getters/proxies/cycles; trusted authors obey construction cap and finite callbacks; no claim arbitrary code interception. Local work consumed across all ancestors; reserve checks all root/ancestor budgets atomically, never copies root or refunds failure. Model time/usage must not depend on fake usage=0. If maxReservedTokens is set, require reliable explicit conservative input bound and actual enforced output bound; reserve sum before I/O; no refund for unknown/failed request. Output cap configured per call/provider, check requested<=profile<=root policy; observed usage exceeding certified cap is contract failure, stop new work, retain actual reported usage; do not claim strict provider total when no reliable bound. No cost API in this candidate because no reliable pricing/usage hard bound yet. Caller-specified unsupported hard limits fail before work.

Root lifetime states internal NEW→OPEN→STOPPING→CLOSED; admission fence shared and checked before any managed action, including captured child/context after terminal. Stop signal closes new admission synchronously before callbacks; pending terminal allowances usable only by already-entered attempt, never new business work. Track actual active operations and local resource leases; root result cannot allow Package disposal before local work actually quiesces. For cooperative Node I/O signal and bounded transport timeout; for opaque noncooperative local TS, not preemptible, cannot promise wall time or release resources on timer. Strict hard-time task must reject unsupported adapter before entering; trusted violation stops admission and awaits local resource quiescence or explicit app-owned retained lease, never detached unobserved promise. Prefer await quiescence for initial design; no SDK-owned detached worker or after-run background observer. Remote operation can be unsettled while local I/O quiesces; bounded terminal readback window produces honest UNKNOWN. If local still active beyond window, do not claim CLOSED; LIFE10 controls Package lifetime. Signal is root-wide cancellation; child local failure does not automatically abort unrelated concurrent root. runIn owner attaches signal and cleans listener in finally, single existing resolve; real UI wait registration only after publication; active clock monotonic, pauses when all managed activity is genuinely waiting and no sibling active. Wall timer if configured never paused. Timeout/stop after awaited actual return rejects stale acceptance and retains terminal facts. No new work after stop. Meaningful progress increments only when validated fact/goal/accepted actual stage changes; proposal ID/revision or empty edit no progress. Repeated invalid proposal or no-op uses quota and stops at no-progress threshold; feedback change with real new fact may progress but root finite. maxNoProgress=0 permits no consecutive nonprogress (first triggers). Time checks before/after each controlled operation; do not promise hard synchronous CPU preemption.

Managed node algorithm (same fixed/dynamic):
1. Allocate instance ID on trusted definition occurrence; enter attempt only after atomic pre/run/post/projection/cleanup reservation. Snapshot metadata and callbacks; validate input and current dependencies in before. Pre-reject means no run, emit reject without fake actual attempt outcome; cleanup only for resources actually entered (pre must not produce business effect). Current revision and signal rechecked after pre, before actual run.
2. Execute actual callable, retain Outcome vs exception vs timeout/cancel/unsettled; if result contains authoritative receipt preserve even if obsolete. No catch→COMPLETE wrapper. after observes actual attempt (including non-success) and domain validation/authoritative settlement, never opens unapproved new effect; applicable cleanup always finally. Reserve bounded terminal observation separately from new work admission; if an actual readback is required its bounded allowance is defined within after's reserved work; root stop not an excuse to erase actual fact. Node project is pure synchronous safe JSON fact projection, bounded. Project/cleanup/critical evidence failure cannot erase receipt; use domain-owned authoritative record and return non-success/UNKNOWN per L1.
3. Observe before acceptance: append actual outcome/effect, post validation and terminal state; current-revision and pre/post success gate checked, only then expose result. If non-success return original reason (retain additional diagnostic as bounded observation). If actual COMPLETE but post/cleanup rejects, return non-success; committed effect stays known. Stale/timeout/cancel after actual effect never implies rollback; no current plan advancement. Required goal validation separate. Observer callback synchronous and bounded; failure in required output blocks completion, noncritical policy recorded by domain. No private thought/secret raw logs. Existing six Outcomes unchanged.
4. Root completion/stop closes managed admission; final record distinguishes local quiescence and remote fact. Actual task-owned record sink consumes during run; no durable event queue or post-run processing. Evidence record includes source/scope/revision, provider optional, actual model usage classification, plan edit diff, node identity/attempt, post status, receipt identity, user feedback and stop reason. Detail data explicit redacted projection, never serialization of arbitrary object/credentials. Bound event size (<=64KiB), total work and count; observer failure never silently promotes missing mandatory evidence.

## 4. Dynamic structure, Context and interaction algorithm

WF05/06 and C03/04: generation fixed domain Knowledge/Function requirements expressed in typed nodes/definition/refresh; runtime refresh uses only authorized actual sources, bounded reads, resolveEvidence policy, records source/scope/revision and complete vs truncated. View must include required goal, immutable constraints, mandatory facts or explicit missing/conflict/UNKNOWN, stage and allowed current capabilities. Domain's refresh returns scoped keys (run/region occurrence and slot), changed keys derived from actual source/user revisions; SDK maps admitted result slot dependencies to actual earlier result and source slots. Domain supplies additional semantic dependency edges (including child output to parent fact) where known; merge and validate finite graph with existing invalidateEvidence (4096 keys/16384 edges max). Missing declaration on change conservative stale. Cross-sibling/parent child dependency crosses only explicit input/output projections; private source remains private but revision/result validity propagates. Fact epoch increments on actual relevant change, not repeated same refresh. Invalidated accepted node result marked stale, immutable actual history remains; new attempt with fresh invocation identity if re-execution safe. No automatic replay of effect. Context refresh is managed work; projection cap checked without dropping mandatory constraints. Runtime LLM gets only safe projected current view, allowed Tool descriptions, no entire SDK or package. Trusted native algorithm can operate typed original data inside its own Function; model not required.

Admission pseudocode:
```text
reserve bounded candidate work
capture {run,region,planRevision,factRevision}
bounded decode and exact shape check; reject foreign identity/revision
copy current pending layout within finite cap
apply edit batch in order to copy, allocating only local temporary aliases
  existing template → new occurrence; insert → local allowed capability
  skip/remove/move → optional pending node in allowed current/future gap
  spawn → trusted child contract + bounded runtime initial nodes
check anchor order and reachability, cursor, dependencies, input slots,
  unique names/aliases, no skipped-required output, child delegation/depth
validate business admission and skip policy on actual current view
compare captured epoch/revision again; atomically commit or reject whole batch
execute through shared root.node/child; actual output and post validation only
```

Wire aliases mapped to SDK-issued occurrence IDs (opaque strings bounded 128 chars; reject reserved prototype names); forward references, cycles, cross-gap moves of anchors, mutation of running/completed history, wrong child region input, undelegated slots/functions rejected. New child initial structures are admitted before child work, bounded structurally before expansion; child execution depth checked independently. Move within same gap only, dependency order revalidated. `skip` accepted only domain canSkip positive and downstream bindings still satisfiable by actual prior/equivalent evidence explicitly rebound; no synthetic value. When revision changes invalidate affected pending candidates/outputs, retain actual receipts/history; repeated replan uses root and ancestor work. Ordered region has no generic DAG parallel scheduler, does not restrict fixed TS/XState loops/branches/parallel. Dynamic regions with mandatory anchor list can cover entire problem solving area; new local Workflow never becomes permanent definition. 
Interaction runIn uses existing resolve/step/response correlation, one pending resolve, actual user wait and cancel; old run creates one session then attaches, no second root; same-root planner can ask through declared clarify checkpoint, trusted feedback reducer updates actual facts, no direct model state mutation. If reasoning is inside current resolve decision, return clarification decision to owning scope rather than nested active resolve. Old response/approval invalid after revision, retained valid independent records subject to domain policy. Intent is not authority. Two independent roots do not share context/usage/abort. Existing Interaction unjoined work must be joined/observed under §3 lifetime contract.

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
