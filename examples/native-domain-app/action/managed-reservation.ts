import type { NativeWorkflowContext, WorkflowNodeOptions } from '@kaicreator/domain-harness';
import { commandOf, stop } from './authority.js';
import type { Receipt, Reply, ReserveCommand } from './authority.js';
import type { ReservationElement } from './client.js';

/** 领域拥有者选择的同资源冲突范围；只负责当前实例，不是跨进程锁或持久恢复服务。 */
export class ManagedInventoryReservation {
  readonly #pending = new Map<string, ReserveCommand>();
  readonly #active = new Set<string>();
  constructor(private readonly client: ReservationElement,
    private readonly readOriginal: (command: ReserveCommand, signal: AbortSignal) => Promise<Reply>,
    private readonly options: WorkflowNodeOptions) {}

  /** 未决原命令只能显式恢复；不同 ID 不能覆盖未知效果。 */
  public async execute(root: NativeWorkflowContext, input: ReserveCommand, mode: 'FIRST_SUBMIT' | 'RECOVER',
    allow: () => boolean = () => true): Promise<Reply> {
    const command = commandOf(input);
    if (!command || (mode !== 'FIRST_SUBMIT' && mode !== 'RECOVER')) return stop('REJECT','COMMAND_INPUT_INVALID');
    const key = JSON.stringify([command.tenant, command.resource]);
    let observed: Receipt | undefined;
    let owns=false, settled=false, confirmedNoEffect=false;
    const permitted=()=> {
      const pending=this.#pending.get(key);
      return !this.#active.has(key) && (!pending || mode==='RECOVER' && JSON.stringify(pending)===JSON.stringify(command))
        && (pending!==undefined || this.#pending.size<256);
    };
    try { return await root.node({
      id: 'inventory-reservation', goal: 'actual authorized inventory receipt', requiredKnowledge: [],
      before: () => {
        if (!allow()) return stop('REJECT','DOMAIN_PRE_DENIED');
        if (!permitted())
          return stop('UNKNOWN','CONFLICTING_UNKNOWN');
        return {status:'COMPLETE',value:undefined};
      },
      run: async (c, scope) => {
        // 在任何 await 前再次检查并占用；并发根不共享 SDK 账本，但领域冲突由同一实例控制。
        if (!permitted())
          return stop('UNKNOWN','CONFLICTING_UNKNOWN');
        this.#pending.set(key,c);this.#active.add(key);owns=true;
        const result = await this.client.runIn(scope,c,mode,scope.signal);
        if (result.status === 'COMPLETE') observed = result.value;
        return result;
      },
      terminalReads: 1,
      after: async (c, actual, terminal) => {
        if (!owns) return {status:'COMPLETE',value:undefined};
        const read = await terminal.read(signal => this.readOriginal(c,signal));
        if (read.status === 'COMPLETE') {
          const receipt=read.value;
          if(observed && (observed.id!==receipt.id || observed.digest!==receipt.digest ||
            observed.version!==receipt.version || observed.remaining!==receipt.remaining))
            return stop('UNKNOWN','RECEIPT_CONFLICT');
          observed=receipt;settled=true;
        } else if (actual.kind === 'returned' && (actual.outcome.status === 'REJECT'||actual.outcome.status==='ASK') && read.status===actual.outcome.status
          && read.reason.code === actual.outcome.reason.code) {
          settled=true;confirmedNoEffect=true;
        }
        if (actual.kind === 'returned' && actual.outcome.status === 'COMPLETE' && read.status!=='COMPLETE')
          return stop('UNKNOWN','RECEIPT_UNCONFIRMED');
        return {status:'COMPLETE',value:undefined};
      },
      project: () => observed ? {effect:'committed',receiptId:observed.id,detail:{version:observed.version,remaining:observed.remaining}}
        : {effect:confirmedNoEffect||!owns?'none':'unknown',detail:null},
    },command,this.options); }
    finally {
      if(owns){this.#active.delete(key);if(settled)this.#pending.delete(key);}
    }
  }
}
