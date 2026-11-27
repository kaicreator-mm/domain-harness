import { randomUUID } from 'node:crypto';
import { StandardWorkflowSession, borrowInteractionScope } from './native-workflow-composition.js';
import type { NativeWorkflowContext, WorkflowLimits, AttachedInteractionScope } from './native-workflow-composition.js';
import type { StandardWorkflowOutcome } from './standard-workflow.js';
import { makePrompt, readResponse, responseData } from './interaction-protocol.js';
import type { InteractionEvent as RawInteractionEvent, InteractionPrompt, InteractionPromptSpec, InteractionRecord, InteractionResponse, InteractionSubmitResult } from './interaction-protocol.js';
export type { InteractionCandidate, InteractionField, InteractionPrompt, InteractionPromptSpec, InteractionRecord, InteractionResponse, InteractionSubmitResult } from './interaction-protocol.js';

import { ClarificationElement, clarificationData, mapClarificationResponse } from './standard-clarification.js';
import type { ClarificationResponse, RawClarificationPreparation } from './standard-clarification.js';

type Outcome<T> = StandardWorkflowOutcome<T>;
type Maybe<T> = T | Promise<T>;
/** 领域分析的继续澄清或已确定意图。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export type InteractionDecision<S, I, E extends string = string> =
  | { readonly kind: 'ready'; readonly intent: I; readonly invalidate?: readonly string[] }
  | { readonly kind: 'clarify'; readonly state: S; readonly prompt: InteractionPromptSpec; readonly clarification?: never; readonly invalidate?: readonly string[] }
  | { readonly kind: 'clarify'; readonly state: S; readonly clarification: ClarificationElement<E>; readonly prompt?: never; readonly invalidate?: readonly string[] };
/** 真实分析事件；只有绑定路径交付当前实际用户响应的领域键映射。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export type InteractionEvent<E extends string = string> =
  | { readonly kind: 'initial'; readonly records: readonly InteractionRecord[]; readonly clarification?: never }
  | { readonly kind: 'response'; readonly response: InteractionResponse; readonly records: readonly InteractionRecord[]; readonly clarification?: never }
  | { readonly kind: 'response'; readonly response: InteractionResponse; readonly records: readonly InteractionRecord[]; readonly clarification: Exclude<ClarificationResponse<E>, { status: 'failed' }> };
/** 同一交互根中的分析、处理及取消信号。
 * @dhKind type
 * @dhCapability semantic-interaction
 */
export interface InteractionScope {
  readonly root: NativeWorkflowContext;
  readonly signal: AbortSignal;
  resolve<S, I, E extends string = string>(initial: S, decide: (state: Readonly<S>, event: InteractionEvent<E>, root: NativeWorkflowContext, signal: AbortSignal) => Maybe<Outcome<InteractionDecision<S, I, E>>>): Promise<Outcome<I>>;
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
  published?: boolean;
  captured?: InteractionResponse;
}

/** 一个逻辑意图的运行期交互；领域判断与授权始终由应用负责。
 * @dhKind standard-element
 * @dhCapability semantic-interaction
 */
export class InteractionElement {
  readonly #id = randomUUID();
  readonly #abort = new AbortController();
  readonly #notify: ((prompt: InteractionPrompt, interaction: InteractionElement) => void) | undefined;
  #phase: 'new' | 'running' | 'terminal' = 'new';
  #revision = 0;
  #pending: Pending | undefined;
  #records: InteractionRecord[] = [];
  #resolving = false;
  #attachment: AttachedInteractionScope | undefined;
  #active = new Set<Promise<unknown>>();
  constructor(options?: { readonly onPrompt?: (prompt: InteractionPrompt, interaction: InteractionElement) => void }) { this.#notify = options?.onPrompt; }

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
    if (this.#attachment && !this.#attachment.admissible()) return { accepted: false, code: 'ALREADY_SETTLED' };
    if (this.#pending !== pending || pending.captured || this.#abort.signal.aborted) return { accepted: false, code: 'ALREADY_SETTLED' };
    pending.captured = response;
    if (!pending.notifying) pending.finish(ok(response));
    return { accepted: true };
  }
  #wait(prompt: InteractionPrompt): Promise<Outcome<InteractionResponse>> {
    if (this.#abort.signal.aborted) return Promise.resolve(stop('REJECT', 'CANCELLED'));
    return new Promise(resolve => {
      const pending: Pending = { prompt, notifying: true, finish: result => {
        if (this.#pending === pending) this.#pending = undefined;
        if (pending.published) {
          pending.published = false;
          this.#attachment?.waiting(false);
        }
        resolve(result);
      } };
      this.#pending = pending;
      try {
        const returned: unknown = this.#notify?.(prompt, this);
        if (returned !== undefined) {
          // void 回调允许 async；立即观察拒绝，但不等待可能依赖自身 run 的通知。
          void Promise.resolve(returned).catch(() => undefined);
          throw new Error('INTERACTION_ASYNC_NOTIFICATION');
        }
        pending.notifying = false;
        if (this.#abort.signal.aborted) pending.finish(stop('REJECT', 'CANCELLED'));
        else if (pending.captured) pending.finish(ok(pending.captured));
        else if (this.#attachment) {
          pending.published = true;
          this.#attachment.waiting(true);
        }
      } catch {
        pending.finish(stop('FAILED', 'INTERACTION_NOTIFICATION_FAILED'));
      }
    });
  }
  #invalidate(keys?: readonly string[]): void {
    this.#records = this.#records.map(record => record.valid && (keys === undefined || keys.includes(record.response.decisionKey))
      ? Object.freeze({ response: record.response, valid: false }) : record);
  }
  #event(response?: InteractionResponse): RawInteractionEvent {
    const records = Object.freeze([...this.#records]);
    return response ? Object.freeze({ kind: 'response', response, records }) : Object.freeze({ kind: 'initial', records });
  }
  async #resolve<S, I, E extends string = string>(root: NativeWorkflowContext, initial: S, decide: (state: Readonly<S>, event: InteractionEvent<E>, root: NativeWorkflowContext, signal: AbortSignal) => Maybe<Outcome<InteractionDecision<S, I, E>>>): Promise<Outcome<I>> {
    if (this.#phase !== 'running') return stop('FAILED', 'INTERACTION_NOT_RUNNING');
    if (this.#abort.signal.aborted) return stop('REJECT', 'CANCELLED');
    if (this.#resolving) return stop('FAILED', 'INTERACTION_RESOLVE_ACTIVE');
    this.#resolving = true;
    try {
      let state = initial, event = this.#event();
      let occurrence: { readonly prepared: Extract<RawClarificationPreparation<E>, { status: 'prompt' }>; readonly prompt: InteractionPrompt } | undefined;
      for (;;) {
        if (this.#abort.signal.aborted) return stop('REJECT', 'CANCELLED');
        const result = await root.invokeOutcome(() => {
          if (this.#abort.signal.aborted) return stop('REJECT', 'CANCELLED');
          // 映射仅在本次分析实际预留之后，使用上一次真实发布的局部不可变绑定。
          const bound = occurrence;
          occurrence = undefined;
          if (bound) {
            const mapped = mapClarificationResponse(bound.prepared, bound.prompt, event);
            if (mapped.status === 'failed' || event.kind !== 'response') return stop('FAILED', 'INTERACTION_CLARIFICATION_BINDING_FAILED');
            const delivered: InteractionEvent<E> = Object.freeze({ ...event, clarification: mapped });
            return decide(state, delivered, root, this.#abort.signal);
          }
          return decide(state, event, root, this.#abort.signal);
        });
        if (this.#abort.signal.aborted) return stop('REJECT', 'CANCELLED');
        if (result.status !== 'COMPLETE') return result;
        const decision = result.value;
        if (decision.invalidate !== undefined) this.#invalidate(decision.invalidate);
        if (decision.kind === 'ready') return ok(decision.intent);
        state = decision.state;
        // 无法发布的表单在等待预留之前拒绝，不额外消耗等待额度。
        let prompt: InteractionPrompt;
        try {
          const raw = Object.hasOwn(decision, 'prompt'), bound = Object.hasOwn(decision, 'clarification');
          if (raw === bound) throw new Error('INTERACTION_INVALID_PROMPT');
          if (bound) {
            const chosen = decision.clarification;
            if (!chosen) throw new Error('INTERACTION_INVALID_PROMPT');
            const prepared = ClarificationElement[clarificationData](chosen);
            prompt = makePrompt(prepared.prompt, this.#id, ++this.#revision);
            occurrence = { prepared, prompt };
          } else {
            const chosen = decision.prompt;
            if (!chosen) throw new Error('INTERACTION_INVALID_PROMPT');
            prompt = makePrompt(chosen, this.#id, ++this.#revision);
          }
        }
        catch { return stop('FAILED', 'INTERACTION_INVALID_PROMPT'); }
        if (this.#abort.signal.aborted) return stop('REJECT', 'CANCELLED');
        const response = await root.invokeOutcome(() => this.#wait(prompt));
        if (response.status !== 'COMPLETE') return response;
        if (this.#abort.signal.aborted) return stop('REJECT', 'CANCELLED');
        const accepted = response.value;
        if (accepted.action === 'cancel') { this.cancel(); return stop('REJECT', 'CANCELLED'); }
        if (accepted.action === 'reject') return stop('REJECT', 'INTERACTION_REJECTED');
        const checkpoint = this.#attachment?.feedback();
        if (checkpoint && checkpoint.status !== 'COMPLETE') return checkpoint;
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
  async #runScope<T>(root: NativeWorkflowContext, work: (scope: InteractionScope) => Maybe<Outcome<T>>): Promise<Outcome<T>> {
    const scope: InteractionScope = Object.freeze({
      root, signal: this.#abort.signal,
      resolve: <S, I, E extends string = string>(initial: S, decide: (state: Readonly<S>, event: InteractionEvent<E>, root: NativeWorkflowContext, signal: AbortSignal) => Maybe<Outcome<InteractionDecision<S, I, E>>>) =>
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
  }

  async #execute<T>(action: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
    if (this.#phase !== 'new') return stop('FAILED', 'INTERACTION_ALREADY_RUN');
    this.#phase = 'running';
    try {
      if (this.#abort.signal.aborted) return stop('REJECT', 'CANCELLED');
      return await action();
    } finally { this.#phase = 'terminal'; this.#pending = undefined; }
  }

  async run<T>(limits: WorkflowLimits, work: (scope: InteractionScope) => Maybe<Outcome<T>>): Promise<Outcome<T>> {
    return this.#execute(() => new StandardWorkflowSession(limits).run(root => this.#runScope(root, work)));
  }

  /** 附着已有受控 Workflow；共享根额度、作用域及取消，不创建 Session。 */
  async runIn<T>(root: NativeWorkflowContext, work: (scope: InteractionScope) => Maybe<Outcome<T>>): Promise<Outcome<T>> {
    return this.#execute(() => borrowInteractionScope(root, async (child, attachment) => {
      this.#attachment = attachment;
      const cancel = () => attachment.cancel();
      const abort = () => this.cancel();
      child.signal.addEventListener('abort', abort, { once: true });
      this.#abort.signal.addEventListener('abort', cancel, { once: true });
      try {
        if (child.signal.aborted) this.cancel();
        if (this.#abort.signal.aborted) { cancel(); return stop('REJECT', 'CANCELLED'); }
        const result = await this.#runScope(child, work);
        return this.#abort.signal.aborted && result.status === 'COMPLETE' ? stop('REJECT', 'CANCELLED') : result;
      } finally {
        child.signal.removeEventListener('abort', abort);
        this.#abort.signal.removeEventListener('abort', cancel);
        this.#attachment = undefined;
      }
    }));
  }
}
