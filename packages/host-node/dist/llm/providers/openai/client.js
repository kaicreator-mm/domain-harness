/** Trusted Host binding; no SDK, credential or endpoint comes from model JSON. */
import { canonicalSnapshot } from '@kaicreator/domain-harness-contracts';
import { assertLlmGenerateRequestV1, assertLlmGenerateResultV1 } from '../../../../../contracts/dist/llm-generate-v1-guards.js';
const REASONS = Object.freeze({
    UNAVAILABLE: 'OPENAI_UNAVAILABLE', UNSUPPORTED_FEATURE: 'OPENAI_UNSUPPORTED_FEATURE',
    RATE_LIMITED: 'OPENAI_RATE_LIMITED', AUTH_DENIED: 'OPENAI_AUTH_DENIED',
    MALFORMED_RESPONSE: 'OPENAI_MALFORMED_RESPONSE', CONTEXT_OVERFLOW: 'OPENAI_CONTEXT_OVERFLOW',
    CANCELLED: 'OPENAI_CANCELLED', DEADLINE: 'OPENAI_DEADLINE', OUTCOME_UNKNOWN: 'OPENAI_OUTCOME_UNKNOWN',
});
export const OPENAI_REASON_CODES = Object.freeze(Object.values(REASONS));
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const requestId = (v, credential) => typeof v === 'string'
    && /^[\x21-\x7e]{1,256}$/.test(v) && !v.includes(credential) ? v : undefined;
const count = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export function createOpenAIHostClient(SDK, inputPolicy) {
    const policy = canonicalSnapshot(inputPolicy);
    const url = new URL(policy.baseURL);
    const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && policy.allowLoopbackHttp === true))
        || url.username || url.password || url.search || url.hash || !policy.apiKey
        || !/^[\x21-\x7e]{1,128}$/.test(policy.modelId) || !Number.isSafeInteger(policy.maxDeadlineMs)
        || policy.maxDeadlineMs < 1 || policy.maxDeadlineMs > 300_000)
        throw new Error('OPENAI_HOST_POLICY_INVALID');
    const catalog = policy.toolCatalog;
    if (catalog && (!catalog.ref || catalog.functions.length === 0 || catalog.functions.length > 8
        || new Set(catalog.functions.map(f => f.name)).size !== catalog.functions.length
        || catalog.functions.some(f => !/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(f.name))))
        throw new Error('OPENAI_HOST_POLICY_INVALID');
    const sdk = new SDK({ apiKey: policy.apiKey, baseURL: url.href, maxRetries: 0,
        timeout: policy.maxDeadlineMs, fetch: (resource, init) => fetch(resource, { ...init, redirect: 'error' }) });
    const active = new Map();
    // Host controls requestId -> AbortSignal. No serializable cancellation port.
    function cancel(id) { const c = active.get(id); c?.abort(); return c !== undefined; }
    async function generate(value, hostSignal) {
        // Invalid DTO errors are already fixed typed validation codes, never data echoes.
        assertLlmGenerateRequestV1(value);
        const request = canonicalSnapshot(value);
        const common = { contractVersion: request.contractVersion, requestId: request.requestId,
            providerKind: 'openai-compatible', modelId: policy.modelId, usage: { evidenceMode: 'unavailable' } };
        function failure(status, errorCategory, observedId) {
            return { ...common, status, errorCategory, reasonCode: REASONS[errorCategory],
                ...(observedId === undefined ? {} : { providerRequestId: observedId }) };
        }
        if (request.modelId !== policy.modelId)
            return failure('refused', 'AUTH_DENIED');
        if (hostSignal?.aborted)
            return failure('refused', 'CANCELLED');
        const remaining = request.deadlineUnixMs - Date.now();
        if (remaining <= 0 || remaining > policy.maxDeadlineMs)
            return failure('refused', 'DEADLINE');
        if (active.has(request.requestId))
            return failure('refused', 'UNAVAILABLE');
        if (request.outputSchemaRef !== undefined || (request.toolCatalogRef !== undefined && request.toolCatalogRef !== catalog?.ref)) {
            return failure('refused', 'UNSUPPORTED_FEATURE');
        }
        const controller = new AbortController();
        const abort = () => controller.abort();
        hostSignal?.addEventListener('abort', abort, { once: true });
        active.set(request.requestId, controller);
        const timer = setTimeout(abort, remaining);
        const body = { model: policy.modelId, messages: request.messages,
            max_tokens: request.maxOutputTokens, stream: false,
            ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
            ...(request.outputFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
            ...(request.toolCatalogRef === undefined ? {} : { tools: catalog?.functions.map(f => ({ type: 'function', function: f })) }),
        };
        let observedId;
        let terminal = false;
        try {
            // No retries: invocation is an attempt, not proof of remote idempotency.
            const data = await sdk.chat.completions.create(body, { signal: controller.signal, maxRetries: 0, timeout: remaining });
            terminal = true;
            if (!record(data))
                return failure('failed', 'MALFORMED_RESPONSE');
            observedId = requestId(data._request_id, policy.apiKey);
            if (!Array.isArray(data.choices) || data.choices.length !== 1 || !record(data.choices[0]))
                return failure('failed', 'MALFORMED_RESPONSE', observedId);
            const choice = data.choices[0];
            if (!record(choice.message) || typeof choice.finish_reason !== 'string')
                return failure('failed', 'MALFORMED_RESPONSE', observedId);
            const message = choice.message;
            if (message.function_call !== undefined || (message.tool_calls !== undefined && (!Array.isArray(message.tool_calls)
                || request.toolCatalogRef === undefined)))
                return failure('failed', 'UNSUPPORTED_FEATURE', observedId);
            const tools = message.tool_calls;
            const proposals = [];
            if (tools !== undefined) {
                if (!Array.isArray(tools) || tools.length === 0 || tools.length > 8 || choice.finish_reason !== 'tool_calls')
                    return failure('failed', 'MALFORMED_RESPONSE', observedId);
                for (const tool of tools) {
                    if (!record(tool) || tool.type !== 'function' || !record(tool.function))
                        return failure('failed', 'UNSUPPORTED_FEATURE', observedId);
                    const fn = tool.function;
                    if (typeof fn.name !== 'string' || !catalog?.functions.some(f => f.name === fn.name)
                        || typeof fn.arguments !== 'string')
                        return failure('failed', 'UNSUPPORTED_FEATURE', observedId);
                    proposals.push({ name: fn.name, argumentsJson: fn.arguments });
                }
            }
            if (choice.finish_reason === 'tool_calls' && proposals.length === 0)
                return failure('failed', 'MALFORMED_RESPONSE', observedId);
            if (message.refusal !== undefined && message.refusal !== null)
                return failure('failed', 'UNAVAILABLE', observedId);
            if (typeof message.content !== 'string' && !(message.content === null && proposals.length > 0))
                return failure('failed', 'MALFORMED_RESPONSE', observedId);
            const usage = record(data.usage) && count(data.usage.prompt_tokens) && count(data.usage.completion_tokens)
                ? { evidenceMode: 'provider-reported', inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
                : { evidenceMode: 'unavailable' };
            const finishReason = choice.finish_reason === 'stop' ? 'stop' : choice.finish_reason === 'length' ? 'length'
                : choice.finish_reason === 'content_filter' ? 'content_filtered' : choice.finish_reason === 'tool_calls' ? 'tool_proposal' : 'other';
            const result = { ...common, status: 'completed', text: message.content ?? '', finishReason, usage,
                ...(observedId === undefined ? {} : { providerRequestId: observedId }),
                ...(proposals.length === 0 ? {} : { toolProposals: proposals }) };
            if (request.outputFormat === 'json' && proposals.length === 0)
                JSON.parse(result.text);
            assertLlmGenerateResultV1(result);
            return result;
        }
        catch (error) {
            // Read only structured SDK fields; a hostile getter/throw is never echoed.
            if (terminal)
                return failure('failed', 'MALFORMED_RESPONSE', observedId);
            try {
                if (record(error) && typeof error.status === 'number') {
                    observedId = requestId(error.request_id, policy.apiKey);
                    const status = error.status;
                    if (status === 408 || status === 504)
                        return failure('unknown', 'OUTCOME_UNKNOWN', observedId);
                    const category = status === 401 || status === 403 ? 'AUTH_DENIED' : status === 429 ? 'RATE_LIMITED'
                        : status === 400 && record(error.error) && error.error.code === 'context_length_exceeded' ? 'CONTEXT_OVERFLOW'
                            : status === 400 || status === 422 ? 'UNSUPPORTED_FEATURE' : 'UNAVAILABLE';
                    return failure('failed', category, observedId);
                }
            }
            catch { /* Unknown structured error, keep the external outcome held. */ }
            return failure('unknown', 'OUTCOME_UNKNOWN');
        }
        finally {
            clearTimeout(timer);
            hostSignal?.removeEventListener('abort', abort);
            active.delete(request.requestId);
        }
    }
    return Object.freeze({ generate, cancel });
}
