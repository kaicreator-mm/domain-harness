import { bindWorkflowFunction, createWorkflowSlot, runWorkflowRegion, StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { InteractionElement, ModelElement, NativeWorkflowContext, ModelRequest, StandardWorkflowOutcome, WorkflowLimits, WorkflowNodeOptions, WorkflowObservation, WorkflowRegionDefinition, WorkflowRegionProposal, WorkflowRegionView } from '@kaicreator/domain-harness';
import type { BookCatalogElement, BookRequest, Plan } from './book-catalog.js';
import type { Receipt } from '../action/authority.js';

type Ready = Required<BookRequest>;
export type CatalogTopology = 'fixed' | 'replace' | 'skip';
type Outcome<T> = StandardWorkflowOutcome<T>;
export interface CatalogReasoningResult { initial: Plan; final: Plan; receipt?: Receipt }
export interface CatalogReasoningOptions {
  readonly interaction: InteractionElement;
  readonly recognition?: InteractionElement;
  readonly reconsider?: InteractionElement;
  readonly model?: ModelElement;
  readonly limits?: WorkflowLimits;
  readonly modelCalls?: number;
  readonly topology?: CatalogTopology;
  readonly current: () => boolean;
  /** Trusted application effect boundary, never exposed to a model. */
  readonly reserve?: (root: NativeWorkflowContext, verified: Plan, request: Ready, nodeOptions: WorkflowNodeOptions) => Promise<Outcome<Receipt>>;
  readonly observe?: (event: WorkflowObservation) => void;
  readonly dispositions?: (events: readonly WorkflowObservation[]) => void;
}
const ok = <T>(value: T): Outcome<T> => ({ status: 'COMPLETE', value });
const deny = (code: string): Outcome<never> => ({ status: 'REJECT', reason: { code, message: 'Catalog workflow rejected' } });
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isRequest = (v: unknown): v is Ready => record(v) && Object.keys(v).length === 4 && typeof v.isbn === 'string' && typeof v.revision === 'string'
  && typeof v.quantity === 'number' && Number.isSafeInteger(v.quantity) && typeof v.budgetCents === 'number' && Number.isSafeInteger(v.budgetCents);
const isPlan = (v: unknown): v is Plan => record(v) && typeof v.isbn === 'string' && typeof v.resource === 'string'
  && typeof v.quantity === 'number' && typeof v.totalCents === 'number' && record(v.rule) && record(v.rule.source)
  && Array.isArray(v.comparable) && Array.isArray(v.predecessor);
const requestSlot = createWorkflowSlot('catalog-request', isRequest);
const planSlot = createWorkflowSlot('catalog-plan', isPlan);
const context = (slot: string) => ({ kind: 'context' as const, slot });
const result = (node: string) => ({ kind: 'result' as const, node, slot: 'value' });
const active = (view: WorkflowRegionView, name: string) => view.progress.find(n => n.definitionId === name && n.state !== 'removed' && n.state !== 'skipped');
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value) ?? 'undefined';
};
const native = (view: WorkflowRegionView, action: WorkflowRegionProposal['action'], edits: WorkflowRegionProposal['edits'] = []) => ok({
  source: 'native' as const,
  proposal: { runId: view.runId, regionId: view.regionId, planRevision: view.planRevision ?? 0, factRevision: view.factRevision, action, edits },
});

async function quantityFeedback(root:NativeWorkflowContext, interaction:InteractionElement, key:string, title:string):Promise<Outcome<number>> {
  return interaction.runIn(root, scope => scope.resolve<number, number>(0, (_state, event) => {
    if (event.kind === 'initial') return ok({ kind:'clarify',state:1,prompt:{decisionKey:key,title,actions:['submit'],
      fields:[{id:'quantity',kind:'number',label:'Quantity',required:true}]} });
    if(event.response.action!=='submit')return deny('INVALID_QUANTITY');
    const value=event.response.values.quantity;
    return typeof value==='number'&&Number.isSafeInteger(value)&&value>=1&&value<=100?ok({kind:'ready',intent:value}):deny('INVALID_QUANTITY');
  }));
}
type PolicyIdentity={readonly isbn:string;readonly revision:string;readonly prefix:string};
const isPolicy=(v:unknown):v is PolicyIdentity=>record(v)&&typeof v.isbn==='string'&&typeof v.revision==='string'&&typeof v.prefix==='string';
const policySlot=createWorkflowSlot('catalog-policy',isPolicy);

/** 复用已有目录领域，固定计划、真实交互反馈、动态区域及独立权威重读共享一个执行根。
 * 模型只能提出有限的拓扑编辑，不负责计算价格或授予资源权限。
 */
export async function runCatalogReasoning(catalog: BookCatalogElement, input: BookRequest, options: CatalogReasoningOptions): Promise<Outcome<CatalogReasoningResult>> {
  let epoch = 1;
  const supplied = Object.freeze({...input});
  let demand: Ready;
  const knowledge = { maxItems: 2, equal: Object.is, current: () => ({ epoch, context: { scope: 'catalog-order', revisions: new Map([['request', String(epoch)],['policy',supplied.revision??'missing']]) } }) };
  const topology=options.topology??'replace';
  if(!['fixed','replace','skip'].includes(topology))return deny('CATALOG_TOPOLOGY_INVALID');
  const modelCalls=options.modelCalls??(topology==='fixed'?2:3);
  if(!Number.isSafeInteger(modelCalls)||modelCalls<0||modelCalls>3)return deny('CATALOG_MODEL_LIMIT_INVALID');
  const session = new StandardWorkflowSession(options.limits??{ maxCalls: 300, maxSteps: 600, maxDepth: 6 }, {
    knowledge, current: options.current,
    limits: { maxWork: 50_000_000, maxEvents: 400, maxActiveScopes: 16, maxNoProgress: 6, maxActiveMs: 90_000, maxSettlementMs: 2000,
      ...(options.model ? { model: { maxCalls: modelCalls, maxRetries: 0, maxOutputTokens: 1024 } } : {}) },
    ...(options.observe ? { observe: options.observe } : {}),
  });
  const outcome=await session.run(async root => {
    let candidate:BookRequest=supplied;
    if(candidate.quantity===undefined&&options.recognition&&typeof candidate.isbn==='string'&&typeof candidate.revision==='string'&&typeof candidate.budgetCents==='number'){
      const quantity=await quantityFeedback(root,options.recognition,'initial-quantity','Provide the missing order quantity');
      if(quantity.status!=='COMPLETE')return quantity;
      candidate={...candidate,quantity:quantity.value};
    }
    if(!isRequest(candidate))return {status:'ASK',reason:{code:'BOOK_INPUT_REQUIRED',message:'Order input incomplete or invalid'}};
    demand=Object.freeze({...candidate});
    const initial = await catalog.planIn(root, demand);
    if (initial.status !== 'COMPLETE') return initial;
    const changed = await quantityFeedback(root,options.interaction,'quantity','Confirm current order quantity');
    if (changed.status !== 'COMPLETE') return changed;
    demand = Object.freeze({ ...demand, quantity: changed.value });
    epoch++;
    if (options.model) {
      // Only the read-only catalog calculation is projected as a model tool.
      // A model turn never receives the authority object, token or reservation capability.
      const tools = [{ name: 'catalog_preview', description: 'Calculate the current read-only order quote for the confirmed request',
        inputSchema: { type: 'object', properties: { isbn: { type: 'string' }, revision: { type: 'string' },
          quantity: { type: 'integer' }, budgetCents: { type: 'integer' } },
          required: ['isbn','revision','quantity','budgetCents'], additionalProperties: false } } ] as const;
      const history = [{ role: 'user' as const, text: 'Preview the confirmed order using catalog_preview with exactly these arguments: '+JSON.stringify(demand)+
        '. After receiving its actual result, return only a JSON object with keys isbn, quantity, totalCents, resource, copied from that result.' }];
      const base: ModelRequest = { system: 'Read-only planning. Call catalog_preview once. Never invent a price or request an inventory effect.',
        input: history, tools, output: { kind: 'text' }, maxOutputTokens: 1024, requestKey: 'catalog-preview', action: 'initial', reason: 'current confirmed catalog preview' };
      const chosen = await options.model.generate(root,base);
      if (chosen.status !== 'COMPLETE') return chosen;
      const call = chosen.value.calls[0];
      if (chosen.value.calls.length !== 1 || !call || call.name !== 'catalog_preview' || !isRequest(call.input) ||
        canonical(call.input) !== canonical(demand)) return deny('CATALOG_TOOL_DENIED');
      const actual = await catalog.planIn(root,call.input);
      if (actual.status !== 'COMPLETE') return actual;
      if (catalog.verifyCurrent(demand,actual.value).status !== 'COMPLETE') return deny('CATALOG_TOOL_STALE');
      const summary = { isbn: actual.value.isbn, quantity: actual.value.quantity, totalCents: actual.value.totalCents, resource: actual.value.resource };
      const reply = await options.model.generate(root,{ ...base, requestKey:'catalog-preview-result', action:'continue', output:{ kind:'json',strict:false },
        input:[...history,{role:'assistant',turn:chosen.value},{role:'tool-results',results:[{callId:call.id,value:summary,error:false}]}] });
      if (reply.status !== 'COMPLETE') return reply;
      if (reply.value.calls.length || canonical(reply.value.json) !== canonical(summary)) return deny('CATALOG_TOOL_RESULT_INVALID');
    }
    const selectedPolicy=catalog.lookup(demand.isbn,demand.revision);
    const rule=selectedPolicy.items[0];
    if(!selectedPolicy.complete||selectedPolicy.items.length!==1||!rule)return deny('CATALOG_POLICY_UNRESOLVED');
    const policy=Object.freeze({isbn:demand.isbn,revision:rule.source.revision,prefix:rule.prefix});
    const audit=bindWorkflowFunction<PolicyIdentity,PolicyIdentity>({id:'catalog-policy',description:'Audit the selected immutable catalog policy',
      inputs:{value:policySlot},outputs:{value:policySlot},input:r=>r.read('value',policySlot),output:(v,w)=>w.put('value',policySlot,v),
      node:{id:'catalog-policy',goal:'actual selected rule identity',requiredKnowledge:[],replay:'pure-read-only',before:v=>canonical(v)===canonical(policy)?ok(undefined):deny('POLICY_MISMATCH'),
        run:v=>{const r=catalog.lookup(v.isbn,v.revision);return r.complete&&r.items.length===1&&r.items[0]?.prefix===v.prefix?ok(v):deny('POLICY_UNRESOLVED');},
        after:()=>ok(undefined),project:()=>({effect:'none',detail:null})}});
    let reconsidered=false;
    let edited = false;
    let replacementAdmitted = false;
    const source = bindWorkflowFunction<Ready, Ready>({ id: 'catalog-source', description: 'Current confirmed catalog request',
      inputs: { value: requestSlot }, outputs: { value: requestSlot }, input: r => r.read('value', requestSlot), output: (v,w) => w.put('value', requestSlot, v),
      node: { id: 'catalog-source', goal: 'confirmed request', requiredKnowledge: [], replay: 'pure-read-only', before: () => ok(undefined),
        run: v => ok(v), after: () => ok(undefined), project: () => ({ effect: 'none', detail: null }) } });
    const plan = bindWorkflowFunction<Ready, Plan>({ id: 'catalog-plan', description: 'Compute actual catalog plan from the confirmed request',
      inputs: { value: requestSlot }, outputs: { value: planSlot }, input: r => r.read('value', requestSlot), output: (v,w) => w.put('value', planSlot, v),
      model: { schema: { type: 'object', properties: { value: { type: 'object' } }, required: ['value'], additionalProperties: false }, describe: 'value is the typed catalog request from the source result' },
      node: { id: 'catalog-plan', goal: 'query and calculate current catalog plan', requiredKnowledge: [], replay: 'pure-read-only', before: v => v === demand || canonical(v) === canonical(demand) ? ok(undefined) : deny('STALE_REQUEST'),
        run: (v,scope) => catalog.planIn(scope,v), after: (v,a) => a.kind === 'returned' && a.outcome.status === 'COMPLETE' && catalog.verifyCurrent(v,a.outcome.value).status === 'COMPLETE' ? ok(undefined) : deny('PLAN_POST'),
        project: () => ({ effect: 'none', detail: null }) } });
    const verify = bindWorkflowFunction<Plan, Plan>({ id: 'catalog-verify', description: 'Independently reread current catalog facts',
      inputs: { value: planSlot }, outputs: { value: planSlot }, input: r => r.read('value', planSlot), output: (v,w) => w.put('value', planSlot, v),
      model: { schema: { type: 'object', properties: {}, required: [], additionalProperties: false }, describe: 'Mandatory verification anchor, only rebind its input to the current plan' },
      node: { id: 'catalog-verify', goal: 'current independent catalog verification', requiredKnowledge: [], replay: 'pure-read-only',
        before: () => ok(undefined), run: v => catalog.verifyCurrent(demand,v), after: () => ok(undefined), project: () => ({ effect: 'none', detail: null }) } });
    function edits(view: WorkflowRegionView): WorkflowRegionProposal['edits'] {
      const read = active(view,'catalog-source'), pending = active(view,'catalog-plan'), guard = active(view,'catalog-verify');
      if (!read || !pending || !guard || read.state !== 'accepted') throw new Error('CATALOG_TOPOLOGY_STATE');
      return [{ kind: 'insert', gap: 'planning', node: { alias: 'current-plan', capability: 'catalog-plan', input: { value: result(read.instanceId) } } },
        { kind: 'rebind', node: guard.instanceId, input: 'value', to: result('current-plan') },
        { kind: topology==='skip'?'skip':'remove', node: pending.instanceId }];
    }
    const definition: WorkflowRegionDefinition<undefined, Plan> = {
      id: 'catalog-reasoning', goal: 'verified revised catalog plan', constraints: ['confirmed current request', 'actual authoritative facts'],
      limits: { maxWork: 30_000_000, maxDescendantDepth: 2, maxCandidateBytes: 16384, maxJsonDepth: 16, maxJsonItems: 1024, maxNodes: 12, maxBindings: 16, maxEdits: 4, maxProjectionBytes: 16384 },
      capabilities: [audit,source,plan,verify], knowledge, current: options.current, requiredKnowledge: [{ key: 'request', accepts: ['user'] },{key:'policy',accepts:['authority']}], optionalKnowledge: [],
      contextSlots: { request: requestSlot, policy:policySlot }, replay: 'pure-read-only',
      layout: [{kind:'anchor',id:'policy',node:{alias:'policy',capability:'catalog-policy',input:{value:context('policy')}}},
        { kind: 'anchor', id: 'source', node: { alias: 'source', capability: 'catalog-source', input: { value: context('request') } } },
        { kind: 'gap', id: 'planning', templates: [{ alias: 'seed', capability: 'catalog-plan', input: { value: context('request') } }], seed: ['seed'] },
        { kind: 'anchor', id: 'verify', node: { alias: 'verify', capability: 'catalog-verify', input: { value: result('seed') } } }],
      refresh: (_i,_root,_previous,writer) => {
        const written = writer.put('request',requestSlot,demand), audited=writer.put('policy',policySlot,policy);
        return written.status !== 'COMPLETE' ? written : audited.status!=='COMPLETE'?audited:ok({ changed: [], dependencies: [{ key: 'request', dependsOn: [] },{key:'policy',dependsOn:[]}],
          observations: [{ key: 'request', origin: 'user', state: 'known', value: demand, source: { id: 'request', scope: 'catalog-order', revision: String(epoch) } },
            {key:'policy',origin:'authority',state:'known',value:policy,source:{id:'policy',scope:'catalog-order',revision:policy.revision}}],
          slotEvidence: { request: ['request'],policy:['policy'] } });
      },
      plan: async (view,scope) => {
        const read = active(view,'catalog-source');
        if (read?.state==='accepted'&&options.reconsider&&!reconsidered) {
          reconsidered=true;
          return native(view,'clarify');
        }
        if (topology==='fixed')return native(view,active(view,'catalog-verify')?.state==='accepted'?'finish':'continue');
        if (read?.state === 'accepted' && !edited) {
          edited = true;
          const proposed = edits(view);
          if (!options.model) return native(view,'continue',proposed);
          const metadata = { runId: view.runId, regionId: view.regionId, planRevision: view.planRevision ?? 0, factRevision: view.factRevision };
          const pending = active(view,'catalog-plan'), guard = active(view,'catalog-verify');
          const turn = await options.model.generate(scope, { system: 'Return one JSON workflow proposal only. No additional keys or business results.',
            input: [{ role: 'user', text: 'Return the proposal itself, not a wrapper or JSON schema. Exactly six top-level keys: runId, regionId, planRevision, factRevision, action, edits. Copy metadata exactly: '+JSON.stringify(metadata)+
              '. Current confirmed catalog request: '+JSON.stringify(demand)+'. Accepted source occurrence ID: '+read.instanceId+
              '. Mandatory verification occurrence ID: '+guard?.instanceId+'. Obsolete pending solver occurrence ID: '+pending?.instanceId+
              '. Use action "continue". Use this edit structure and replace every descriptive placeholder with its actual ID: '+
              '[{"kind":"insert","gap":"planning","node":{"alias":"current-plan","capability":"catalog-plan","input":{"value":{"kind":"result","node":"<accepted source occurrence ID>","slot":"value"}}}},{"kind":"rebind","node":"<mandatory verification occurrence ID>","input":"value","to":{"kind":"result","node":"current-plan","slot":"value"}},{"kind":"'+(topology==='skip'?'skip':'remove')+'","node":"<obsolete pending solver occurrence ID>"}]. No extra keys. Return only JSON.' }],
            tools: [], output: { kind: 'json', strict: false }, maxOutputTokens: 1024, requestKey: 'catalog-topology', action: 'initial', reason: 'actual revised request topology' });
          if (turn.status !== 'COMPLETE') return turn;
          if (turn.value.calls.length || !record(turn.value.json)) return deny('CATALOG_MODEL_PROPOSAL');
          return ok({ source: 'model', proposal: turn.value.json as unknown as WorkflowRegionProposal, access: { capabilities: ['catalog-plan','catalog-verify'], contextSlots: [], resultSlots: [{ node: read.instanceId, slot: 'value' }] } });
        }
        return native(view,active(view,'catalog-verify')?.state === 'accepted' ? 'finish' : 'continue');
      },
      clarify:async(_view,root)=>{
        if(!options.reconsider)return deny('UNEXPECTED_RECONSIDERATION');
        const next=await quantityFeedback(root,options.reconsider,'reconsider','Revise current order quantity after the catalog changed');
        if(next.status!=='COMPLETE')return next;
        demand=Object.freeze({...demand,quantity:next.value});
        epoch++;
        return ok(undefined);
      },
      admit: (view,proposal) => {
        if (proposal.edits.length === 0) return ok(undefined);
        if (topology==='fixed' || replacementAdmitted || proposal.action !== 'continue' || canonical(proposal.edits) !== canonical(edits(view))) return deny('CATALOG_EDIT_DENIED');
        replacementAdmitted = true;
        return ok(undefined);
      },
      canSkip: (node,view) => {
        // 仅允许跳过已被新计划替代的待执行旧节点，锚点和已接受节点均不可跳过。
        const pending=active(view,'catalog-plan');
        return topology==='skip'&&pending?.instanceId===node&&pending.state==='pending'?ok(undefined):deny('CATALOG_SKIP_DENIED');
      }, canRebind: (node,inputKey,_from,_to,view) =>
        node === active(view,'catalog-verify')?.instanceId && inputKey === 'value' ? ok(undefined) : deny('CATALOG_REBIND_DENIED'),
      complete: view => {
        const node = active(view,'catalog-verify');
        return (topology==='fixed'||replacementAdmitted) && active(view,'catalog-policy')?.state==='accepted' && node?.state === 'accepted' ? view.reader.read(node.instanceId+'/value',planSlot) : deny('CATALOG_VERIFY_REQUIRED');
      },
    };
    const final = await runWorkflowRegion(root,definition,undefined);
    if (final.status !== 'COMPLETE') return final;
    if (!options.reserve) return ok({ initial: initial.value, final: final.value });
    const receipt = await options.reserve(root,final.value,demand,{knowledge,current: options.current});
    return receipt.status !== 'COMPLETE' ? receipt : ok({ initial: initial.value, final: final.value, receipt: receipt.value });
  }, { goal: 'current verified revised catalog plan', requiredKnowledge: [], terminalReads: 0,
    validate: v => catalog.verifyCurrent(demand,v.final).status === 'COMPLETE' ? ok(undefined) : deny('CATALOG_FINAL_INVALID') });
  options.dispositions?.(session.dispositions());
  return outcome;
}

/** 固定无模型查询：仅从已验证目录识别资源，然后读取当前库存，不授予权限。 */
export async function readCatalogStock(catalog:BookCatalogElement,isbn:string,revision:string,
  inspect:(resource:string)=>{readonly stock:number|undefined;readonly version:number|undefined}):Promise<Outcome<{isbn:string;resource:string;stock:number;version:number}>>{
  return new StandardWorkflowSession({maxCalls:12,maxSteps:24,maxDepth:2}).run(async root=>{
    const plan=await catalog.planIn(root,{isbn,revision,quantity:1,budgetCents:Number.MAX_SAFE_INTEGER});
    if(plan.status!=='COMPLETE')return plan;
    return root.invokeOutcome(()=>{
      const state=inspect(plan.value.resource);
      if(state.stock===undefined||state.version===undefined)return {status:'UNKNOWN',reason:{code:'STOCK_UNKNOWN',message:'Current inventory unavailable'}};
      return ok({isbn:plan.value.isbn,resource:plan.value.resource,stock:state.stock,version:state.version});
    });
  });
}
