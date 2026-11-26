/**
 * 内部 Workflow 资源原语；不是第二个执行器，也不是公共 SDK 入口。
 * 同一根账本原子接纳所有维度；业务回调和作用域生命周期由原生 Workflow 持有。
 */
export type ResourceFailure =
  | 'WORKFLOW_INVALID_LIMIT' | 'WORKFLOW_CALL_BUDGET' | 'WORKFLOW_STEP_BUDGET'
  | 'WORKFLOW_WORK_BUDGET' | 'WORKFLOW_EVENT_BUDGET' | 'WORKFLOW_ACTIVE_SCOPE_LIMIT'
  | 'WORKFLOW_MODEL_CALL_BUDGET' | 'WORKFLOW_MODEL_RETRY_BUDGET'
  | 'WORKFLOW_MODEL_TOKEN_BUDGET' | 'WORKFLOW_LOCAL_WORK_BUDGET';

export interface ResourceLimits {
  readonly maxWork: number;
  readonly maxEvents: number;
  readonly maxActiveScopes: number;
  readonly model?: Readonly<{
    maxCalls: number; maxRetries: number; maxOutputTokens: number;
  }>;
}

export interface ResourceCharge {
  readonly calls: number;
  readonly steps: number;
  readonly work?: number;
  readonly events?: number;
  readonly activeScopes?: number;
  readonly modelCalls?: number;
  readonly modelRetries?: number;
  readonly outputTokens?: number;
  /** 终止读取已包含在调用、步骤及 work 中，不再重复收费。 */
  readonly terminalReads?: number;
}

const MAX_LIMIT = 2 ** 31 - 1;
const valid = (n: number, max = Number.MAX_SAFE_INTEGER): boolean =>
  Number.isSafeInteger(n) && n >= 0 && n <= max;

interface LocalBalance {
  readonly parent: LocalWorkQuota | undefined;
  remaining: number;
}
export interface LocalWorkQuota {
  readonly kind: 'workflow-local-work';
}

/** 已扣除额度的票据只允许原拥有者使用；关闭返还活动占位，不返还累计额度。 */
export class ResourceTicket {
  #events: number;
  #terminalReads: number;
  #activeScopes: number;
  #closed = false;

  constructor(
    private readonly owner: object,
    events: number,
    terminalReads: number,
    activeScopes: number,
    private readonly releaseActive: (count: number) => void,
  ) {
    this.#events = events;
    this.#terminalReads = terminalReads;
    this.#activeScopes = activeScopes;
  }

  public event(owner: object): boolean {
    if (owner !== this.owner || this.#closed || this.#events === 0) return false;
    this.#events--;
    return true;
  }

  public terminalRead(owner: object): boolean {
    if (owner !== this.owner || this.#closed || this.#terminalReads === 0) return false;
    this.#terminalReads--;
    return true;
  }

  /** 将已原子接纳的子作用域记录和活动占位移交给唯一子所有者，不重复扣账。 */
  public splitChild(owner: object, childOwner: object): ResourceTicket | undefined {
    if (owner !== this.owner || this.#closed || this.#events < 3 || this.#activeScopes < 2) return undefined;
    this.#events -= 3;
    this.#activeScopes--;
    return new ResourceTicket(childOwner, 3, 0, 1, this.releaseActive);
  }

  /** 只能由拥有者在本地操作实际结算、作用域 CLOSED 后调用。 */
  public close(owner: object): boolean {
    if (owner !== this.owner || this.#closed) return false;
    this.#closed = true;
    this.#events = 0;
    this.#terminalReads = 0;
    this.releaseActive(this.#activeScopes);
    this.#activeScopes = 0;
    return true;
  }
}

type Admission = { readonly ok: true; readonly ticket: ResourceTicket }
  | { readonly ok: false; readonly code: ResourceFailure };
const denied = (code: ResourceFailure): Admission => ({ ok: false, code });

/** 固定的保守扫描计费常量；不会根据实际较小结果退款。 */
export const EVENT_SCAN_WORK = Math.ceil(65536 / 256) + 4 * 8192;

export function frameScanWork(maxItems: number): number {
  if (!valid(maxItems, 4096)) throw new RangeError('Invalid frame scan bound');
  return 1 + 4 * maxItems;
}

export function knowledgeScanWork(maxItems: number): number {
  if (!valid(maxItems, 4096)) throw new RangeError('Invalid knowledge scan bound');
  return 1 + 16 * maxItems;
}

export function leaseScanWork(maxBindings: number): number {
  if (!valid(maxBindings, 2048)) throw new RangeError('Invalid lease scan bound');
  return 1 + 4 * maxBindings;
}

/**
 * 兼容旧 calls/steps；managed 配额按冻结合同扩展同一个账本。
 * 所有祖先局部 work 余额与根余额同步检查后才统一扣除。
 */
export class WorkflowResourceLedger {
  #calls: number;
  #steps: number;
  #work: number;
  #events: number;
  #activeScopes: number;
  #modelCalls: number;
  #modelRetries: number;
  readonly #outputLimit: number | undefined;
  readonly #managed: boolean;
  readonly #valid: boolean;
  readonly #locals = new WeakMap<LocalWorkQuota, LocalBalance>();

  constructor(calls: number, steps: number, limits?: ResourceLimits) {
    this.#calls = calls;
    this.#steps = steps;
    this.#managed = limits !== undefined;
    this.#work = limits?.maxWork ?? 0;
    this.#events = limits?.maxEvents ?? 0;
    this.#activeScopes = limits?.maxActiveScopes ?? 0;
    this.#modelCalls = limits?.model?.maxCalls ?? 0;
    this.#modelRetries = limits?.model?.maxRetries ?? 0;
    this.#outputLimit = limits?.model?.maxOutputTokens;
    const model = limits?.model;
    this.#valid = valid(calls, this.#managed ? MAX_LIMIT : Number.MAX_SAFE_INTEGER)
      && valid(steps, this.#managed ? MAX_LIMIT : Number.MAX_SAFE_INTEGER)
      && valid(this.#work, MAX_LIMIT) && valid(this.#events, 65536)
      && valid(this.#activeScopes, 4096) && valid(this.#modelCalls, MAX_LIMIT)
      && valid(this.#modelRetries, MAX_LIMIT)
      && (this.#outputLimit === undefined || valid(this.#outputLimit, MAX_LIMIT))
      && !(model && 'maxReservedTokens' in model && model.maxReservedTokens !== undefined);
  }

  public remaining() {
    return Object.freeze({
      calls: this.#calls, steps: this.#steps, work: this.#work, events: this.#events,
      activeScopes: this.#activeScopes, modelCalls: this.#modelCalls,
      modelRetries: this.#modelRetries,
    });
  }

  /** 局部预算只能在同一根账本创建；上限不会扩大根或祖先额度。 */
  public local(maxWork: number, parent?: LocalWorkQuota): LocalWorkQuota {
    if (!this.#managed || !this.#valid || !valid(maxWork, MAX_LIMIT)
      || (parent !== undefined && !this.#locals.has(parent))) {
      throw new RangeError('Invalid local work quota');
    }
    const quota = Object.freeze({ kind: 'workflow-local-work' as const });
    this.#locals.set(quota, { parent, remaining: maxWork });
    return quota;
  }

  /** 已由祖先预付的子入口只扣新建局部余额，不能再次扣根或祖先。 */
  public prepaidLocal(maxWork: number, entryWork: number, parent?: LocalWorkQuota): LocalWorkQuota {
    if (!valid(entryWork, MAX_LIMIT) || entryWork > maxWork) throw new RangeError('Invalid prepaid scope work');
    const quota = this.local(maxWork, parent);
    this.#locals.get(quota)!.remaining -= entryWork;
    return quota;
  }

  public localRemaining(quota: LocalWorkQuota): number {
    let current: LocalWorkQuota | undefined = quota;
    let remaining = this.#work;
    while (current !== undefined) {
      const balance = this.#locals.get(current);
      if (balance === undefined) throw new RangeError('Foreign local work quota');
      remaining = Math.min(remaining, balance.remaining);
      current = balance.parent;
    }
    return remaining;
  }

  public reserve(owner: object, charge: ResourceCharge, local?: LocalWorkQuota): Admission {
    // 每个字段只读一次；先完整验证，再同步扣除，失败不产生票据。
    const { calls, steps, work = 0, events = 0, activeScopes = 0,
      modelCalls = 0, modelRetries = 0,
      outputTokens = 0, terminalReads = 0 } = charge;
    const managed = [work, events, activeScopes, modelCalls, modelRetries,
      outputTokens, terminalReads];
    if (!this.#valid || ('reservedTokens' in charge && charge.reservedTokens !== undefined) || !valid(calls) || !valid(steps) || !managed.every(n => valid(n))
      || (!this.#managed && (managed.some(n => n !== 0) || local !== undefined))
      || terminalReads > Math.min(calls, steps, work) || modelRetries > modelCalls
      || (modelCalls === 0 && outputTokens !== 0)
      || (modelCalls > 0 && (modelCalls !== 1 || outputTokens === 0))) {
      return denied('WORKFLOW_INVALID_LIMIT');
    }
    const balances: LocalBalance[] = [];
    let current = local;
    while (current !== undefined) {
      const balance = this.#locals.get(current);
      if (balance === undefined) return denied('WORKFLOW_INVALID_LIMIT');
      balances.push(balance);
      current = balance.parent;
    }
    if (calls > this.#calls) return denied('WORKFLOW_CALL_BUDGET');
    if (steps > this.#steps) return denied('WORKFLOW_STEP_BUDGET');
    if (work > this.#work) return denied('WORKFLOW_WORK_BUDGET');
    if (events > this.#events) return denied('WORKFLOW_EVENT_BUDGET');
    if (activeScopes > this.#activeScopes) return denied('WORKFLOW_ACTIVE_SCOPE_LIMIT');
    if (modelCalls > this.#modelCalls) return denied('WORKFLOW_MODEL_CALL_BUDGET');
    if (modelRetries > this.#modelRetries) return denied('WORKFLOW_MODEL_RETRY_BUDGET');
    if (modelCalls > 0 && (this.#outputLimit === undefined || outputTokens > this.#outputLimit)) {
      return denied('WORKFLOW_MODEL_TOKEN_BUDGET');
    }
    if (balances.some(balance => work > balance.remaining)) return denied('WORKFLOW_LOCAL_WORK_BUDGET');

    this.#calls -= calls;
    this.#steps -= steps;
    this.#work -= work;
    this.#events -= events;
    this.#activeScopes -= activeScopes;
    this.#modelCalls -= modelCalls;
    this.#modelRetries -= modelRetries;
    for (const balance of balances) balance.remaining -= work;
    const ticket = new ResourceTicket(owner, events, terminalReads, activeScopes,
      count => { this.#activeScopes += count; });
    return { ok: true, ticket };
  }
}

export type ClockStop = 'cancelled' | 'active-timeout' | 'wall-timeout';

/**
 * 私有根时钟。只有真实已发布的用户等待且无活动叶子时暂停 active；
 * 普通 Promise/IO 不暂停。定时器只关闭准入，绝不宣称资源已释放。
 * 生命周期协调者负责提供实际叶子状态及等待本地操作。
 */
export class WorkflowClock {
  readonly #controller = new AbortController();
  readonly #started = performance.now();
  #last = this.#started;
  #active = 0;
  #running = true;
  #finished = false;
  #reason: ClockStop | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #settlementStart: number | undefined;
  readonly #cancel = () => { this.stop('cancelled'); };

  constructor(
    private readonly maxActiveMs: number,
    private readonly maxWallMs: number | undefined,
    private readonly maxSettlementMs: number,
    private readonly external?: AbortSignal,
  ) {
    if (!valid(maxActiveMs, MAX_LIMIT) || !valid(maxSettlementMs, MAX_LIMIT)
      || (maxWallMs !== undefined && !valid(maxWallMs, MAX_LIMIT))) {
      throw new RangeError('Invalid workflow clock limit');
    }
    if (external?.aborted) this.stop('cancelled');
    else {
      external?.addEventListener('abort', this.#cancel, { once: true });
      this.check();
    }
  }

  public get signal(): AbortSignal { return this.#controller.signal; }
  public get reason(): ClockStop | undefined { return this.#reason; }

  private update(): number {
    const now = performance.now();
    if (this.#running && !this.#finished && this.#reason === undefined) this.#active += now - this.#last;
    this.#last = now;
    return now;
  }

  private clearTimer(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /** 在每次受控入口及 await 返回时同步检查，覆盖定时器尚未被调度的情况。 */
  public check(): boolean {
    const now = this.update();
    this.clearTimer();
    if (this.#finished || this.#reason !== undefined) return false;
    const wall = this.maxWallMs === undefined ? Infinity : this.maxWallMs - (now - this.#started);
    const active = this.maxActiveMs - this.#active;
    if (wall <= 0) { this.stop('wall-timeout'); return false; }
    if (active <= 0) { this.stop('active-timeout'); return false; }
    const next = Math.min(wall, this.#running ? active : Infinity);
    if (Number.isFinite(next)) this.#timer = setTimeout(() => { this.check(); }, Math.max(1, Math.ceil(next)));
    return true;
  }

  public activity(activeLeaves: number, publishedWaitingLeaves: number): boolean {
    if (!valid(activeLeaves, 4096) || !valid(publishedWaitingLeaves, 4096)) {
      throw new RangeError('Invalid workflow activity');
    }
    if (!this.check()) return false;
    this.#running = activeLeaves > 0 || publishedWaitingLeaves === 0;
    return this.check();
  }

  public remaining() {
    this.check();
    return Object.freeze({
      activeMs: Math.max(0, this.maxActiveMs - this.#active),
      ...(this.maxWallMs === undefined ? {} : {
        wallMs: Math.max(0, this.maxWallMs - (this.#last - this.#started)),
      }),
    });
  }

  public stop(reason: ClockStop): void {
    if (this.#finished || this.#reason !== undefined) return;
    this.update();
    this.#reason = reason;
    this.beginSettlement();
    this.clearTimer();
    this.external?.removeEventListener('abort', this.#cancel);
    this.#controller.abort(reason);
  }

  /** 同一终止窗口不因后续读取或重试而重置。 */
  public beginSettlement(): number {
    this.#settlementStart ??= performance.now();
    return this.settlementRemaining();
  }

  public settlementRemaining(): number {
    return this.#settlementStart === undefined ? this.maxSettlementMs
      : Math.max(0, this.maxSettlementMs - (performance.now() - this.#settlementStart));
  }

  /** 由根在实际本地资源结算后调用；不是取消或抢占。 */
  public finish(): void {
    if (this.#finished) return;
    this.update();
    this.#finished = true;
    this.clearTimer();
    this.external?.removeEventListener('abort', this.#cancel);
  }
}
