import { randomUUID } from 'node:crypto';
import { StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { InteractionElement, NativeWorkflowContext, WorkflowNodeOptions } from '@kaicreator/domain-harness';
import { commandDigest, payloadDigest, stop } from '../action/authority.js';
import type { ApprovalGrant, Receipt, Reply, ReserveCommand } from '../action/authority.js';
import { ManagedInventoryReservation } from '../action/managed-reservation.js';
import type { ReservationElement } from '../action/client.js';
import type { BookCatalogElement, BookRequest, Plan } from './book-catalog.js';

export interface CatalogReservationAuthority {
  readonly tenant: string;
  readonly principal: string;
  readonly inspect: (resource: string) => { readonly version: number | undefined; readonly stock: number | undefined };
  readonly approve: (grant: ApprovalGrant) => void;
  readonly readback: (command: ReserveCommand, signal: AbortSignal) => Promise<Reply>;
}

// 客户端实例即本应用的预留生命周期；不把未决命令交给单次 Workflow 包装器。
type Pending = { readonly principal: string; active: boolean; command?: Readonly<ReserveCommand> };
const sessions = new WeakMap<ReservationElement, Map<string, Pending>>();
type RootSettlement = {client:ReservationElement;entry:Pending;terminal?:Reply};
const settlements = new WeakMap<NativeWorkflowContext,RootSettlement>();
const keyOf = (tenant: string, resource: string) => JSON.stringify([tenant, resource]);
function entries(client: ReservationElement): Map<string, Pending> {
  let state = sessions.get(client);
  if (!state) { state = new Map(); sessions.set(client,state); }
  return state;
}
export interface PendingCatalogReservation {
  readonly id: string; readonly resource: string; readonly quantity: number; readonly version: number;
}
/** Exposes only the recovery handle, never the grant or credentials. */
export function pendingCatalogReservation(client: ReservationElement, authority: CatalogReservationAuthority,
  resource: string): PendingCatalogReservation | undefined {
  const entry = entries(client).get(keyOf(authority.tenant,resource));
  const c = entry?.command;
  if (!c || entry.principal !== authority.principal) return undefined;
  return { id:c.id, resource:c.resource, quantity:c.quantity, version:c.version };
}
const noEffectCodes = new Set(['RESOURCE_CONFLICT','APPROVAL_DENIED','RESOURCE_MISSING','POLICY_INVALID']);
function confirmedTerminal(result: Reply, read: Reply | undefined, command: ReserveCommand, principal: string): boolean {
  if (result.status === 'COMPLETE' && read?.status === 'COMPLETE') {
    const a = result.value, b = read.value;
    return a.id === command.id && a.digest === commandDigest(principal,command) && a.version === command.version+1 &&
      Number.isSafeInteger(a.remaining) && a.remaining>=0 && a.id===b.id && a.digest===b.digest && a.version===b.version && a.remaining===b.remaining;
  }
  return result.status === 'REJECT' && read?.status === 'REJECT' &&
    noEffectCodes.has(result.reason.code) && result.reason.code === read.reason.code;
}
/** Called only while the application-level resource fence is held.
 * A fresh wrapper has a fresh root policy, but never a fresh business command for RECOVER.
 */
async function executeOriginal(root: NativeWorkflowContext, client: ReservationElement, authority: CatalogReservationAuthority,
  entry: Pending, options: WorkflowNodeOptions, mode: 'FIRST_SUBMIT'|'RECOVER', allow: () => boolean): Promise<Reply> {
  const command = entry.command;
  if (!command) return stop('UNKNOWN','ORIGINAL_COMMAND_UNAVAILABLE');
  let read: Reply | undefined;
  const flow = new ManagedInventoryReservation(client, async (c,signal) => {
    // Do not settle a different logical command.
    if (JSON.stringify(c)!==JSON.stringify(command)) return stop('UNKNOWN','ORIGINAL_COMMAND_MISMATCH');
    read = await authority.readback(c,signal);
    return read;
  },options);
  const settlement:RootSettlement={client,entry};
  settlements.set(root,settlement);
  const result = await flow.execute(root,command,mode,allow);
  if (confirmedTerminal(result,read,command,entry.principal))settlement.terminal=result;
  return result;
}

/** Release only after the enclosing application root actually delivers a matching terminal result.
 * A verified node receipt followed by root failure remains recoverable, not a fresh submit.
 */
export function finishCatalogReservation(root:NativeWorkflowContext, delivered:Reply|undefined):void {
  const settled=settlements.get(root);
  if(!settled)return;
  settlements.delete(root);
  const {client,entry,terminal}=settled;
  const command=entry.command;
  entry.active=false;
  if(!command||!delivered||!terminal||!confirmedTerminal(delivered,terminal,command,entry.principal))return;
  const state=entries(client),key=keyOf(command.tenant,command.resource);
  if(state.get(key)===entry)state.delete(key);
}

/** Explicit, original-ID recovery is readback only. No confirmation, grant or new command.
 * An unavailable/unauthorized/unobserved readback retains the fence.
 */
export async function recoverCatalogReservation(client: ReservationElement, authority: CatalogReservationAuthority,
  resource: string, originalId: string, current: () => boolean = () => true): Promise<Reply> {
  const entry=entries(client).get(keyOf(authority.tenant,resource));
  if(!entry?.command || entry.principal!==authority.principal || entry.command.id!==originalId)
    return stop('REJECT','ORIGINAL_COMMAND_REQUIRED');
  if(entry.active)return stop('UNKNOWN','CONFLICTING_UNKNOWN');
  entry.active=true;
  let recoveryRoot:NativeWorkflowContext|undefined;
  try {
    const knowledge={maxItems:2,equal:Object.is,current:()=>({epoch:1,context:{scope:'catalog-recovery',revisions:new Map<string,string>()}})};
    const outcome=await new StandardWorkflowSession({maxCalls:30,maxSteps:60,maxDepth:5},{
      knowledge,current,limits:{maxWork:5_000_000,maxEvents:64,maxActiveScopes:8,maxNoProgress:4,maxActiveMs:15000,maxSettlementMs:2000},
    }).run(root=>{recoveryRoot=root;return executeOriginal(root,client,authority,entry,{knowledge,current},'RECOVER',current);},{
      goal:'recover exact original reservation receipt',requiredKnowledge:[],terminalReads:0,
      validate:receipt=>receipt.id===entry.command?.id && receipt.digest===commandDigest(entry.principal,entry.command) ?
        {status:'COMPLETE',value:undefined}:stop('UNKNOWN','ORIGINAL_RECEIPT_MISMATCH'),
    });
    if(recoveryRoot)finishCatalogReservation(recoveryRoot,outcome);
    return outcome;
  } finally { entry.active=false; }
}

/** A separately authorized business capability, deliberately unavailable to the model planner.
 * A current user confirmation and the owner's grant are both required.
 */
export function catalogReservation(catalog: BookCatalogElement, client: ReservationElement,
  authority: CatalogReservationAuthority, confirmation: InteractionElement, options: WorkflowNodeOptions) {
  return async (root: NativeWorkflowContext, plan: Plan, request: Required<BookRequest>): Promise<Reply> => {
    const stateMap=entries(client), key=keyOf(authority.tenant,plan.resource);
    if(stateMap.has(key))return stop('UNKNOWN','CONFLICTING_UNKNOWN');
    if(stateMap.size>=256)return stop('UNKNOWN','RESERVATION_FENCE_LIMIT');
    const entry:Pending={principal:authority.principal,active:true};
    // Acquire before any prompt or grant, including concurrent roots.
    stateMap.set(key,entry);
    try {
      const current = catalog.verifyCurrent(request, plan);
      if (current.status !== 'COMPLETE') return current;
      const state = authority.inspect(plan.resource);
      if (state.version === undefined || state.stock === undefined) return stop('UNKNOWN','RESOURCE_UNKNOWN');
      if (state.stock < plan.quantity) return stop('REJECT','INSUFFICIENT_STOCK');
      const version = state.version;
      const confirmed = await confirmation.runIn(root, scope => scope.resolve<number, boolean>(0, (_state,event) => {
        if (event.kind === 'initial') return { status: 'COMPLETE', value: { kind: 'clarify', state: 1,
          prompt: { decisionKey: 'reserve', title: 'Reserve '+plan.quantity+' units of '+plan.resource+' for '+plan.totalCents+' cents?',
            actions: ['submit'], fields: [{ id: 'approve', kind: 'choice', label: 'Authorize this exact reservation', required: true,
              options: [{ id: 'yes', label: 'Approve' },{ id: 'no', label: 'Decline' }], completeness: 'complete' }] } } };
        if (event.response.action !== 'submit') return stop('REJECT','APPROVAL_REQUIRED');
        const value = event.response.values.approve;
        return value === 'yes' || value === 'no' ? { status: 'COMPLETE', value: { kind: 'ready', intent: value === 'yes' } } : stop('REJECT','APPROVAL_REQUIRED');
      }));
      if (confirmed.status !== 'COMPLETE') return confirmed;
      if (!confirmed.value) return stop('REJECT','USER_DECLINED');
      if (!options.current() || root.signal.aborted || catalog.verifyCurrent(request,plan).status !== 'COMPLETE' ||
        authority.inspect(plan.resource).version !== version) return stop('UNKNOWN','STALE_APPROVAL');
      const id = randomUUID(), grant = randomUUID();
      const command: ReserveCommand = Object.freeze({ id, tenant: authority.tenant, resource: plan.resource, version, quantity: plan.quantity, grant });
      entry.command=command;
      authority.approve({ id: grant, mode: 'PER_CALL', principal: authority.principal, tenant: command.tenant, resource: command.resource,
        expires: Date.now()+60_000, digest: payloadDigest(authority.principal,command), maxQuantity: command.quantity });
      return await executeOriginal(root,client,authority,entry,options,'FIRST_SUBMIT',()=> options.current() && catalog.verifyCurrent(request,plan).status === 'COMPLETE');
    } finally {
      if(!settlements.has(root))entry.active=false;
      // Before a command exists, decline/cancel/stale approval cannot have submitted an effect.
      if(!entry.command && stateMap.get(key)===entry)stateMap.delete(key);
    }
  };
}

/** Only the original command's readback endpoint is used for terminal observation. */
export function catalogReceiptReader(base: string, principal: string, token: string) {
  return async (command: ReserveCommand, signal: AbortSignal): Promise<Reply> => {
    try {
      const response = await fetch(base+'/readback', { method: 'POST', headers: { authorization:'Bearer '+token, 'x-principal': principal,
        'content-type':'application/json' }, body:JSON.stringify(command), redirect:'error', signal:AbortSignal.any([signal,AbortSignal.timeout(1500)]) });
      if (!response.ok) return stop('UNKNOWN','READBACK_UNAVAILABLE');
      const body = await response.text();
      if (Buffer.byteLength(body)>16384) return stop('UNKNOWN','READBACK_UNAVAILABLE');
      const result = JSON.parse(body) as Reply;
      if (result.status === 'COMPLETE') {
        const r: Receipt = result.value;
        if (r.id === command.id && r.digest === commandDigest(principal,command) && r.version === command.version+1 &&
          Number.isSafeInteger(r.remaining) && r.remaining >= 0) return result;
      }
      if (result.status === 'REJECT' && noEffectCodes.has(result.reason.code)) return result;
      return stop('UNKNOWN','READBACK_UNAVAILABLE');
    } catch { return stop('UNKNOWN','READBACK_UNAVAILABLE'); }
  };
}
