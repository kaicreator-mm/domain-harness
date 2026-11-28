import { randomUUID } from 'node:crypto';
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

/** A separately authorized business capability, deliberately unavailable to the model planner.
 * A current user confirmation and the owner's grant are both required.
 */
export function catalogReservation(catalog: BookCatalogElement, client: ReservationElement,
  authority: CatalogReservationAuthority, confirmation: InteractionElement, options: WorkflowNodeOptions) {
  const flow = new ManagedInventoryReservation(client, authority.readback, options);
  return async (root: NativeWorkflowContext, plan: Plan, request: Required<BookRequest>): Promise<Reply> => {
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
    const command: ReserveCommand = { id, tenant: authority.tenant, resource: plan.resource, version, quantity: plan.quantity, grant };
    authority.approve({ id: grant, mode: 'PER_CALL', principal: authority.principal, tenant: command.tenant, resource: command.resource,
      expires: Date.now()+60_000, digest: payloadDigest(authority.principal,command), maxQuantity: command.quantity });
    return flow.execute(root,command,'FIRST_SUBMIT',()=> options.current() && catalog.verifyCurrent(request,plan).status === 'COMPLETE');
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
      if (result.status === 'REJECT' && ['RESOURCE_CONFLICT','APPROVAL_DENIED','RESOURCE_MISSING'].includes(result.reason.code)) return result;
      return stop('UNKNOWN','READBACK_UNAVAILABLE');
    } catch { return stop('UNKNOWN','READBACK_UNAVAILABLE'); }
  };
}
