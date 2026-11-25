import { randomUUID } from 'node:crypto';
import { StandardWorkflowSession } from './native-workflow-composition.js';
import type { NativeWorkflowContext, WorkflowLimits } from './native-workflow-composition.js';
import type { StandardWorkflowOutcome } from './standard-workflow.js';
import { makePrompt, readResponse, responseData } from './interaction-protocol.js';
import type { InteractionEvent, InteractionPrompt, InteractionPromptSpec, InteractionRecord, InteractionResponse, InteractionSubmitResult } from './interaction-protocol.js';
export type { InteractionCandidate, InteractionField, InteractionEvent, InteractionPrompt, InteractionPromptSpec, InteractionRecord, InteractionResponse, InteractionSubmitResult } from './interaction-protocol.js';

type Outcome<T> = StandardWorkflowOutcome<T>;
type Maybe<T> = T | Promise<T>;
export type InteractionDecision<S, I> =
  | { readonly kind: 'ready'; readonly intent: I; readonly invalidate?: readonly string[] }
  | { readonly kind: 'clarify'; readonly state: S; readonly prompt: InteractionPromptSpec; readonly invalidate?: readonly string[] };
export interface InteractionScope {
  readonly root: NativeWorkflowContext;
  readonly signal: AbortSignal;
  resolve<S, I>(initial: S, decide: (state: Readonly<S>, event: InteractionEvent, root: NativeWorkflowContext) => Maybe<Outcome<InteractionDecision<S, I>>>): Promise<Outcome<I>>;
  step<T>(action: () => Maybe<Outcome<T>>): Promise<Outcome<T>>;
}
function stop(status: 'REJECT' | 'FAILED', code: string): Outcome<never> {
  return { status, reason: { code, message: 'Interaction could not continue' } };
}
function ok<T>(value: T): Outcome<T> { return { status: 'COMPLETE', value }; }
interface Pending {
  readonly prompt: InteractionPrompt;
  readonly finish: (result: Outcome<InteractionResponse>) => void;
  notifying: boolean;
  captured?: InteractionResponse;
}

/** 一个逻辑意图的运行期交互；领域判断与授权始终由应用负责。 */
export class InteractionElement {
  readonly #id = randomUUID();
  readonly #abort = new AbortController();
  readonly #notify: ((prompt: InteractionPrompt) => void) | undefined;
  #phase: 'new' | 'running' | 'terminal' = 'new';
  #revision = 0;
  #pending: Pending | undefined;
  #records: InteractionRecord[] = [];
  #resolving = false;
  #active = new Set<Promise<unknown>>();
  constructor(options?: { readonly onPrompt?: (prompt: InteractionPrompt) => void }) { this.#notify = options?.onPrompt; }

  current(): InteractionPrompt | undefined { return this.#pending?.captured ? undefined : this.#pending?.prompt; }
  cancel(): void {
    if (this.#phase === 'terminal' || this.#abort.signal.aborted) return;
    const pending = this.#pending;
    // 先撤销当前等待，阻止 abort listener 或通知中的重入提交。
    this.#pending = undefined;
    if (pending && !pending.notifying) pending.finish(stop('REJECT', 'CANCELLED'));
    this.#abort.abort();
  }
  submit(input: unknown): InteractionSubmitResult {
    const pending = this.#pending;
    if (this.#phase === 'terminal' || this.#abort.signal.aborted || pending?.captured) return { accepted: false, code: 'ALREADY_SETTLED' };
    if (!pending) return { accepted: false, code: 'NO_PENDING' };
    let response: InteractionResponse;
    try {
      const data = responseData(input);
      if (data.intentId !== pending.prompt.intentId) return { accepted: false, code: 'WRONG_INTENT' };
      if (data.revision !== pending.prompt.revision || data.decisionKey !== pending.prompt.decisionKey) return { accepted: false, code: 'STALE_RESPONSE' };
      response = readResponse(data, pending.prompt);
    } catch { return { accepted: false, code: 'INVALID_RESPONSE' }; }
    // 解析结束再次核对所有权；同一个等待只可捕获一次。
    if (this.#pending !== pending || pending.captured || this.#abort.signal.aborted) return { accepted: false, code: 'ALREADY_SETTLED' };
    pending.captured = response;
    if (!pending.notifying) pending.finish(ok(response));
    return { accepted: true };
  }
  #wait(spec: InteractionPromptSpec): Promise<Outcome<InteractionResponse>> {
    if (this.#abort.signal.aborted) return Promise.resolve(stop('REJECT', 'CANCELLED'));
    let prompt: InteractionPrompt;
    try { prompt = makePrompt(spec, this.#id, ++this.#revision); }
    catch { return Promise.resolve(stop('FAILED', 'INTERACTION_INVALID_PROMPT')); }
    if (this.#abort.signal.aborted) return Promise.resolve(stop('REJECT', 'CANCELLED'));
    return new Promise(resolve => {
      const pending: Pending = { prompt, notifying: true, finish: result => {
        if (this.#pending === pending) this.#pending = undefined;
        resolve(result);
      } };
      this.#pending = pending;
      try {
        const returned: unknown = this.#notify?.(prompt);
        if (returned !== undefined) {
          // void 回调允许 async；立即观察拒绝，但不等待可能依赖自身 run 的通知。
          void Promise.resolve(returned).catch(() => undefined);
          throw new Error('INTERACTION_ASYNC_NOTIFICATION');
        }
        pending.notifying = false;
        if (this.#abort.signal.aborted) pending.finish(stop('REJECT', 'CANCELLED'));
        else if (pending.captured) pending.finish(ok(pending.captured));
      } catch {
        pending.finish(stop('FAILED', 'INTERACTION_NOTIFICATION_FAILED'));
      }
    });
  }
  #invalidate(keys?: readonly string[]): void {
    this.#records = this.#records.map(record => record.valid && (keys === undefined || keys.includes(record.response.decisionKey))
      ? Object.freeze({ response: record.response, valid: false }) : record);
  }
  #event(response?: InteractionResponse): InteractionEvent {
    const records = Object.freeze([...this.#records]);
    return response ? Object.freeze({ kind: 'response', response, records }) : Object.freeze({ kind: 'initial', records });
  }
  async #resolve<S, I>(root: NativeWorkflowContext, initial: S, decide: (state: Readonly<S>, event: InteractionEvent, root: NativeWorkflowContext) => Maybe<Outcome<InteractionDecision<S, I>>>): Promise<Outcome<I>> {
    if (this.#phase !== 'running') return stop('FAILED', 'INTERACTION_NOT_RUNNING');
    if (this.#abort.signal.aborted) return stop('REJECT', 'CANCELLED');
    if (this.#resolving) return stop('FAILED', 'INTERACTION_RESOLVE_ACTIVE');
    this.#resolving = true;
    try {
      let state = initial, event = this.#event();
      for (;;) {
        if (this.#abort.signal.aborted) return stop('REJECT', 'CANCELLED');
        const result = await root.invokeOutcome(() => decide(state, event, root));
        if (this.#abort.signal.aborted) return stop('REJECT', 'CANCELLED');
        if (result.status !== 'COMPLETE') return result;
        const decision = result.value;
        if (decision.invalidate !== undefined) this.#invalidate(decision.invalidate);
        if (decision.kind === 'ready') return ok(decision.intent);
        state = decision.state;
        const response = await root.invokeOutcome(() => this.#wait(decision.prompt));
        if (response.status !== 'COMPLETE') return response;
        if (this.#abort.signal.aborted) return stop('REJECT', 'CANCELLED');
        const accepted = response.value;
        if (accepted.action === 'cancel') { this.cancel(); return stop('REJECT', 'CANCELLED'); }
        if (accepted.action === 'reject') return stop('REJECT', 'INTERACTION_REJECTED');
        if (accepted.action === 'revise') this.#invalidate();
        else this.#invalidate([accepted.decisionKey]);
        this.#records.push(Object.freeze({ response: accepted, valid: true }));
        event = this.#event(accepted);
      }
    } catch { return stop('FAILED', 'INTERACTION_DECISION_FAILED'); }
    finally { this.#resolving = false; }
  }
  #track<T>(operation: Promise<T>): Promise<T> {
    this.#active.add(operation);
    void operation.then(() => { this.#active.delete(operation); }, () => { this.#active.delete(operation); });
    return operation;
  }
  async run<T>(limits: WorkflowLimits, work: (scope: InteractionScope) => Maybe<Outcome<T>>): Promise<Outcome<T>> {
    if (this.#phase !== 'new') return stop('FAILED', 'INTERACTION_ALREADY_RUN');
    this.#phase = 'running';
    try {
      if (this.#abort.signal.aborted) return stop('REJECT', 'CANCELLED');
      return await new StandardWorkflowSession(limits).run(async root => {
        const scope: InteractionScope = Object.freeze({
          root, signal: this.#abort.signal,
          resolve: <S, I>(initial: S, decide: (state: Readonly<S>, event: InteractionEvent, root: NativeWorkflowContext) => Maybe<Outcome<InteractionDecision<S, I>>>) =>
            this.#track(this.#resolve(root, initial, decide)),
          step: <R>(action: () => Maybe<Outcome<R>>) => {
            if (this.#phase !== 'running') return Promise.resolve(stop('FAILED', 'INTERACTION_NOT_RUNNING'));
            if (this.#abort.signal.aborted) return Promise.resolve(stop('REJECT', 'CANCELLED'));
            return this.#track(root.invokeOutcome(action));
          },
        });
        try {
          const result = await work(scope);
          if (this.#active.size > 0) return { status: 'UNKNOWN', reason: { code: 'INTERACTION_UNJOINED_WORK', message: 'Interaction has unjoined work' } };
          return result;
        } finally {
          // 可信调用方必须 await 自己的业务；防止遗留 scope 操作在应用退出后仍活跃。
          if (this.#active.size > 0) { this.cancel(); await Promise.allSettled([...this.#active]); }
        }
      });
    } finally { this.#phase = 'terminal'; this.#pending = undefined; }
  }
}
