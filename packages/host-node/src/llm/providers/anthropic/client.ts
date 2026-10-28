/** v0.10.3 T-C — selected, trusted Host transport for Anthropic Messages.
 * No BUILD selection or K permit is minted here. The caller must first traverse
 * the existing selected C operation and K external-effect admission.
 * The official Messages SDK is passed/constructed by the trusted Host against a
 * minimal local interface, so the shared Host/workspace manifest stays
 * untouched. The client snapshots the approved plain-data policy at creation;
 * trusted function bindings (clock, guards, transport, catalog) are pinned by
 * reference — later mutation of the caller's host object cannot change this
 * client's model/key/endpoint/guards/catalog.
 */
import { canonicalSnapshot } from '@kaicreator/domain-harness-contracts';
import type { LlmGenerateRequestV1, LlmGenerateResultV1 } from '@kaicreator/domain-harness-contracts';

export type AnthropicToolDefinition = Readonly<{
  name: string;
  description: string;
  input_schema: Readonly<{ type: 'object'; properties?: Record<string, unknown>; required?: readonly string[] }>;
}>;
export type TrustedAnthropicHost = Readonly<{
  modelId: string;
  apiKey: string;
  /** Trusted production endpoint is exact-allowlisted; loopback is for controlled tests only. */
  endpoint?: string;
  allowLoopbackForTest?: boolean;
  now: () => number;
  fetchTransport: typeof fetch;
  assertRequest: (value: unknown) => void;
  assertResult: (value: unknown) => void;
  /** Only Host-approved catalogs may become native Messages tools. */
  resolveTools?: (ref: string) => readonly AnthropicToolDefinition[] | undefined;
  maxDeadlineWindowMs?: number;
}>;

/** Minimal Messages surface the trusted Host may bind; the official SDK satisfies it. */
export interface AnthropicMessagesSDK {
  readonly messages: { readonly create: (body: Record<string, unknown>, options: {
    readonly signal: AbortSignal; readonly timeout: number;
  }) => Promise<unknown> };
}
export interface AnthropicMessagesSDKConstructor {
  new(options: { apiKey: string; baseURL: string; maxRetries: number; timeout: number; fetch: typeof fetch }): AnthropicMessagesSDK;
}

const VERSION = 'dh.llm.generate/1' as const;
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/anthropic/v1/messages';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';
const MAX_DEADLINE_MS = 120_000;
type Category = 'UNAVAILABLE' | 'UNSUPPORTED_FEATURE' | 'RATE_LIMITED' | 'AUTH_DENIED' |
  'MALFORMED_RESPONSE' | 'CONTEXT_OVERFLOW' | 'CANCELLED' | 'DEADLINE' | 'OUTCOME_UNKNOWN';

type FailureState = 'refused' | 'failed' | 'unknown';
const plain = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const objectish = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object';
const nonempty = (x: unknown, max: number): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= max;
/** A provider request id is provenance only when printable and credential-free. */
const observedId = (value: unknown, credential: string): string | undefined =>
  typeof value === 'string' && /^[\x21-\x7e]{1,256}$/u.test(value) && !value.includes(credential)
    ? value : undefined;

export function createTrustedAnthropicMessagesClient(SDK: AnthropicMessagesSDKConstructor, host: TrustedAnthropicHost) {
  if (!nonempty(host.modelId, 128) || !nonempty(host.apiKey, 4096) ||
      /[\r\n]/u.test(host.apiKey) || typeof host.fetchTransport !== 'function' ||
      typeof host.now !== 'function' || typeof host.assertRequest !== 'function' ||
      typeof host.assertResult !== 'function') throw new TypeError('ANTHROPIC_HOST_CONFIGURATION');
  // Record-safe snapshot of the approved policy data; the trusted function
  // bindings below are captured once so a mutated original host object can
  // neither redirect I/O nor relax a guard after construction.
  const config = canonicalSnapshot({
    modelId: host.modelId,
    apiKey: host.apiKey,
    endpoint: host.endpoint ?? null,
    allowLoopbackForTest: host.allowLoopbackForTest === true,
    maxDeadlineWindowMs: host.maxDeadlineWindowMs ?? null,
  }) as {
    readonly modelId: string; readonly apiKey: string; readonly endpoint: string | null;
    readonly allowLoopbackForTest: boolean; readonly maxDeadlineWindowMs: number | null;
  };
  const now = host.now;
  const assertRequest = host.assertRequest;
  const assertResult = host.assertResult;
  const resolveTools = host.resolveTools;
  const transport = host.fetchTransport;
  const endpoint = config.endpoint ?? ENDPOINT;
  const url = new URL(endpoint);
  const loopback = config.allowLoopbackForTest && url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === '[::1]') && url.pathname === '/v1/messages';
  if (!(endpoint === ENDPOINT || endpoint === DEEPSEEK_ENDPOINT || loopback) || url.username || url.password || url.search || url.hash)
    throw new TypeError('ANTHROPIC_ENDPOINT_UNAPPROVED');
  const windowMs = config.maxDeadlineWindowMs ?? MAX_DEADLINE_MS;
  if (!Number.isSafeInteger(windowMs) || windowMs < 1 || windowMs > MAX_DEADLINE_MS)
    throw new TypeError('ANTHROPIC_DEADLINE_CONFIG');
  // The SDK owns the real Messages wire (auth/version headers, serialization,
  // typed APIError). No retry: once sent the remote outcome may be charged.
  const baseURL = endpoint === DEEPSEEK_ENDPOINT ? DEEPSEEK_BASE_URL : url.origin;
  const sdk = new SDK({ apiKey: config.apiKey, baseURL, maxRetries: 0,
    timeout: windowMs,
    fetch: (resource: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      transport(resource, { ...init, redirect: 'error' }) });

  return async (raw: unknown, signal?: AbortSignal): Promise<LlmGenerateResultV1> => {
    // Invalid request data cannot authorize I/O; return only a static sanitized code.
    // The guard is the unchanged A contract, wired by the trusted Host.
    try { assertRequest(raw); }
    catch {
      const id = plain(raw) && nonempty(raw.requestId, 128) ? raw.requestId : 'invalid-request';
      return { contractVersion: VERSION, requestId: id, providerKind: 'anthropic-messages',
        modelId: config.modelId, status: 'refused', errorCategory: 'MALFORMED_RESPONSE',
        reasonCode: 'INVALID_REQUEST', usage: { evidenceMode: 'unavailable' } };
    }
    // The validated request is snapshotted before any async use.
    const request = canonicalSnapshot(raw) as LlmGenerateRequestV1;
    const base = { contractVersion: VERSION, requestId: request.requestId,
      providerKind: 'anthropic-messages' as const, modelId: config.modelId };
    const unavailable = { evidenceMode: 'unavailable' as const };
    function error(status: FailureState, category: Category, code: string,
      providerRequestId?: string, usage: LlmGenerateResultV1['usage'] = unavailable): LlmGenerateResultV1 {
      const res = { ...base, status, errorCategory: category, reasonCode: code, usage,
        ...(providerRequestId === undefined ? {} : { providerRequestId }) } as LlmGenerateResultV1;
      assertResult(res);
      return res;
    }
    if (request.modelId !== config.modelId) return error('refused', 'UNSUPPORTED_FEATURE', 'MODEL_NOT_SELECTED');
    if (signal?.aborted) return error('refused', 'CANCELLED', 'CANCELLED_BEFORE_SEND');
    let start: number;
    try { start = now(); } catch { return error('refused', 'UNAVAILABLE', 'HOST_CLOCK_UNAVAILABLE'); }
    if (!Number.isSafeInteger(start) || request.deadlineUnixMs <= start)
      return error('refused', 'DEADLINE', 'DEADLINE_BEFORE_SEND');
    if (request.deadlineUnixMs - start > windowMs)
      return error('refused', 'DEADLINE', 'DEADLINE_WINDOW_UNAPPROVED');
    if (request.outputSchemaRef !== undefined || request.outputFormat !== 'text' || request.temperature !== undefined)
      return error('refused', 'UNSUPPORTED_FEATURE', 'FEATURE_NOT_APPROVED');

    let tools: readonly AnthropicToolDefinition[] | undefined;
    if (request.toolCatalogRef !== undefined) {
      try { tools = resolveTools?.(request.toolCatalogRef); } catch { /* untrusted selector */ }
      if (!tools || tools.length < 1 || tools.length > 8 ||
        !tools.every(t => nonempty(t.name, 128) && nonempty(t.description, 1024) &&
          plain(t.input_schema) && t.input_schema.type === 'object')) {
        return error('refused', 'UNSUPPORTED_FEATURE', 'TOOL_CATALOG_UNAPPROVED');
      }
    }
    const system = request.messages.filter(m => m.role === 'system').map(m => ({ type: 'text', text: m.content }));
    const messages = request.messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role, content: [{ type: 'text', text: m.content }],
    }));
    // Anthropic Messages demands a nonempty user/assistant message array.
    if (messages.length === 0) return error('refused', 'UNSUPPORTED_FEATURE', 'SYSTEM_ONLY_UNSUPPORTED');
    const body: Record<string, unknown> = { model: config.modelId, max_tokens: request.maxOutputTokens,
      messages, ...(system.length === 0 ? {} : { system }),
      ...(tools === undefined ? {} : { tools }), stream: false };
    const remainingMs = Math.max(1, request.deadlineUnixMs - start);
    const timeoutSignal = AbortSignal.timeout(remainingMs);
    const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    let payload: unknown;
    try {
      payload = await sdk.messages.create(body, { signal: combined, timeout: remainingMs });
    } catch (caught) {
      // Read only structured SDK error fields; a hostile getter/throw and raw
      // provider exception text are never echoed into the sanitized result.
      try {
        if (objectish(caught) && typeof caught.status === 'number') {
          const status = caught.status;
          const id = observedId(caught.requestID, config.apiKey);
          if (status === 408 || status === 504)
            return error('unknown', 'OUTCOME_UNKNOWN', 'SENT_OUTCOME_UNKNOWN', id);
          if (status === 401 || status === 403) return error('failed', 'AUTH_DENIED', 'PROVIDER_AUTH_DENIED', id);
          if (status === 429) return error('failed', 'RATE_LIMITED', 'PROVIDER_RATE_LIMITED', id);
          if (status === 413) return error('failed', 'CONTEXT_OVERFLOW', 'PROVIDER_CONTEXT_OVERFLOW', id);
          return error('failed', status >= 500 ? 'UNAVAILABLE' : 'UNSUPPORTED_FEATURE',
            status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_REJECTED', id);
        }
      } catch { /* unreadable structured error: keep the external outcome held */ }
      return error('unknown', 'OUTCOME_UNKNOWN', 'SENT_OUTCOME_UNKNOWN');
    }
    if (combined.aborted) return error('unknown', 'OUTCOME_UNKNOWN', 'SENT_OUTCOME_UNKNOWN');
    if (!plain(payload) || payload.type !== 'message' || payload.role !== 'assistant' ||
        !Array.isArray(payload.content) || !nonempty(payload.id, 256) || !nonempty(payload.stop_reason, 128))
      return error('failed', 'MALFORMED_RESPONSE', 'MALFORMED_PROVIDER_RESPONSE');
    const providerRequestId = observedId(payload.id, config.apiKey);
    const u = plain(payload.usage) ? payload.usage : null;
    const usage = u && typeof u.input_tokens === 'number' && Number.isSafeInteger(u.input_tokens) && u.input_tokens >= 0 &&
      typeof u.output_tokens === 'number' && Number.isSafeInteger(u.output_tokens) && u.output_tokens >= 0
      ? { evidenceMode: 'provider-reported' as const, inputTokens: u.input_tokens,
          outputTokens: u.output_tokens } : unavailable;
    if (payload.stop_reason === 'refusal')
      return error('refused', 'UNAVAILABLE', 'MODEL_REFUSAL', providerRequestId, usage);
    if (payload.stop_reason === 'pause_turn' || payload.stop_reason === 'model_context_window_exceeded')
      return error('failed', 'UNSUPPORTED_FEATURE', 'CONTINUATION_UNSUPPORTED', providerRequestId, usage);
    const text: string[] = [];
    const proposals: { name: string; argumentsJson: string }[] = [];
    for (const block of payload.content) {
      if (!plain(block)) return error('failed', 'MALFORMED_RESPONSE', 'MALFORMED_CONTENT_BLOCK', providerRequestId, usage);
      if (block.type === 'thinking') {
        // Reasoning is provider-private data, never final output or authority.
        // Some compatible providers omit the opaque signature. Do not retain
        // either field in the DTO that can enter the K Journal.
        if (typeof block.thinking !== 'string' || block.thinking.length > 65536 ||
            (block.signature !== undefined &&
              (typeof block.signature !== 'string' || block.signature.length > 65536)))
          return error('failed', 'MALFORMED_RESPONSE', 'MALFORMED_CONTENT_BLOCK', providerRequestId, usage);
        continue;
      }
      if (block.type === 'text' && typeof block.text === 'string') text.push(block.text);
      else if (block.type === 'tool_use') {
        if (!nonempty(block.name, 128) || !plain(block.input) ||
          tools === undefined || !tools.some(t => t.name === block.name) || proposals.length >= 8)
          return error('failed', 'UNSUPPORTED_FEATURE', 'UNAPPROVED_TOOL_PROPOSAL', providerRequestId, usage);
        const argumentsJson = JSON.stringify(block.input);
        if (argumentsJson.length === 0 || argumentsJson.length > 16384)
          return error('failed', 'UNSUPPORTED_FEATURE', 'TOOL_ARGUMENTS_EXCEEDED', providerRequestId, usage);
        proposals.push({ name: block.name, argumentsJson });
      } else return error('failed', 'UNSUPPORTED_FEATURE', 'UNSUPPORTED_CONTENT_BLOCK', providerRequestId, usage);
    }
    if (payload.stop_reason === 'tool_use' && proposals.length === 0)
      return error('failed', 'MALFORMED_RESPONSE', 'MISSING_TOOL_USE', providerRequestId, usage);
    if (payload.stop_reason !== 'tool_use' && proposals.length > 0)
      return error('failed', 'UNSUPPORTED_FEATURE', 'UNEXPECTED_TOOL_USE', providerRequestId, usage);
    // Unknown private provider reasons stay honest terminal completions: the
    // observed disposition maps to 'other', never a fabricated stop/feature code.
    const finishReason = payload.stop_reason === 'tool_use' ? 'tool_proposal' as const :
      payload.stop_reason === 'max_tokens' ? 'length' as const :
      payload.stop_reason === 'end_turn' || payload.stop_reason === 'stop_sequence' ? 'stop' as const :
      'other' as const;
    const combinedText = text.join('');
    if (combinedText.length > 65536 || (combinedText.length === 0 && proposals.length === 0))
      return error('failed', 'MALFORMED_RESPONSE', 'EMPTY_OR_OVERSIZED_OUTPUT', providerRequestId, usage);
    const result: LlmGenerateResultV1 = { ...base, status: 'completed', text: combinedText,
      finishReason, usage,
      ...(providerRequestId === undefined ? {} : { providerRequestId }),
      ...(proposals.length === 0 ? {} : { toolProposals: proposals }) };
    assertResult(result);
    return result;
  };
}
