const VERSION = 'dh.llm.generate/1';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MAX_BYTES = 256 * 1024;
const MAX_DEADLINE_MS = 120_000;
const plain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const nonempty = (x, max) => typeof x === 'string' && x.length > 0 && x.length <= max;
const count = (x) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
async function boundedJson(response) {
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json'))
        return null;
    if (!response.body)
        return null;
    const reader = response.body.getReader();
    const parts = [];
    let size = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done)
                break;
            size += next.value.byteLength;
            if (size > MAX_BYTES) {
                await reader.cancel();
                return null;
            }
            parts.push(next.value);
        }
        return JSON.parse(Buffer.concat(parts.map(p => Buffer.from(p)), size).toString('utf8'));
    }
    catch {
        return null;
    }
    finally {
        reader.releaseLock();
    }
}
export function createTrustedAnthropicMessagesClient(host) {
    if (!nonempty(host.modelId, 128) || !nonempty(host.apiKey, 4096) ||
        /[\r\n]/u.test(host.apiKey) || typeof host.fetchTransport !== 'function' ||
        typeof host.now !== 'function' || typeof host.assertRequest !== 'function' ||
        typeof host.assertResult !== 'function')
        throw new TypeError('ANTHROPIC_HOST_CONFIGURATION');
    const endpoint = host.endpoint ?? ENDPOINT;
    const url = new URL(endpoint);
    const loopback = host.allowLoopbackForTest === true && url.protocol === 'http:' &&
        (url.hostname === '127.0.0.1' || url.hostname === '[::1]') && url.pathname === '/v1/messages';
    if (!(endpoint === ENDPOINT || loopback) || url.username || url.password || url.search || url.hash)
        throw new TypeError('ANTHROPIC_ENDPOINT_UNAPPROVED');
    const windowMs = host.maxDeadlineWindowMs ?? MAX_DEADLINE_MS;
    if (!Number.isSafeInteger(windowMs) || windowMs < 1 || windowMs > MAX_DEADLINE_MS)
        throw new TypeError('ANTHROPIC_DEADLINE_CONFIG');
    return async (raw, signal) => {
        // Invalid request data cannot authorize I/O; return only a static sanitized code.
        // The guard is the unchanged A contract, wired by the trusted Host.
        let request;
        try {
            host.assertRequest(raw);
            request = raw;
        }
        catch {
            const id = plain(raw) && nonempty(raw.requestId, 128) ? raw.requestId : 'invalid-request';
            return { contractVersion: VERSION, requestId: id, providerKind: 'anthropic-messages',
                modelId: host.modelId, status: 'refused', errorCategory: 'MALFORMED_RESPONSE',
                reasonCode: 'INVALID_REQUEST', usage: { evidenceMode: 'unavailable' } };
        }
        const r = request;
        const base = { contractVersion: VERSION, requestId: r.requestId,
            providerKind: 'anthropic-messages', modelId: host.modelId };
        const unavailable = { evidenceMode: 'unavailable' };
        function error(status, category, code, providerRequestId, usage = unavailable) {
            const res = { ...base, status, errorCategory: category, reasonCode: code, usage,
                ...(providerRequestId === undefined ? {} : { providerRequestId }) };
            host.assertResult(res);
            return res;
        }
        if (r.modelId !== host.modelId)
            return error('refused', 'UNSUPPORTED_FEATURE', 'MODEL_NOT_SELECTED');
        if (signal?.aborted)
            return error('refused', 'CANCELLED', 'CANCELLED_BEFORE_SEND');
        let start;
        try {
            start = host.now();
        }
        catch {
            return error('refused', 'UNAVAILABLE', 'HOST_CLOCK_UNAVAILABLE');
        }
        if (!Number.isSafeInteger(start) || r.deadlineUnixMs <= start)
            return error('refused', 'DEADLINE', 'DEADLINE_BEFORE_SEND');
        if (r.deadlineUnixMs - start > windowMs)
            return error('refused', 'DEADLINE', 'DEADLINE_WINDOW_UNAPPROVED');
        if (r.outputSchemaRef !== undefined || r.outputFormat !== 'text' || r.temperature !== undefined)
            return error('refused', 'UNSUPPORTED_FEATURE', 'FEATURE_NOT_APPROVED');
        let tools;
        if (r.toolCatalogRef !== undefined) {
            try {
                tools = host.resolveTools?.(r.toolCatalogRef);
            }
            catch { /* untrusted selector */ }
            if (!tools || tools.length < 1 || tools.length > 8 ||
                !tools.every(t => nonempty(t.name, 128) && nonempty(t.description, 1024) &&
                    plain(t.input_schema) && t.input_schema.type === 'object')) {
                return error('refused', 'UNSUPPORTED_FEATURE', 'TOOL_CATALOG_UNAPPROVED');
            }
        }
        const system = r.messages.filter(m => m.role === 'system').map(m => ({ type: 'text', text: m.content }));
        const messages = r.messages.filter(m => m.role !== 'system').map(m => ({
            role: m.role, content: [{ type: 'text', text: m.content }],
        }));
        // Anthropic Messages demands a nonempty user/assistant message array.
        if (messages.length === 0)
            return error('refused', 'UNSUPPORTED_FEATURE', 'SYSTEM_ONLY_UNSUPPORTED');
        const body = JSON.stringify({ model: host.modelId, max_tokens: r.maxOutputTokens,
            messages, ...(system.length === 0 ? {} : { system }),
            ...(tools === undefined ? {} : { tools }), stream: false });
        const timeout = AbortSignal.timeout(Math.max(1, r.deadlineUnixMs - start));
        const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
        let response;
        // No retry: once fetch is reached the remote outcome may be charged/unknown.
        try {
            response = await host.fetchTransport(endpoint, { method: 'POST',
                headers: { 'x-api-key': host.apiKey, 'anthropic-version': '2023-06-01',
                    'content-type': 'application/json' }, body, signal: combined,
                redirect: 'manual', credentials: 'omit', cache: 'no-store' });
        }
        catch {
            return error('unknown', 'OUTCOME_UNKNOWN', 'SENT_OUTCOME_UNKNOWN');
        }
        if (response.redirected || (response.url !== '' && response.url !== endpoint))
            return error('failed', 'UNSUPPORTED_FEATURE', 'REDIRECT_REFUSED');
        if (response.status !== 200) {
            if (response.status === 401 || response.status === 403)
                return error('failed', 'AUTH_DENIED', 'PROVIDER_AUTH_DENIED');
            if (response.status === 429)
                return error('failed', 'RATE_LIMITED', 'PROVIDER_RATE_LIMITED');
            if (response.status === 413)
                return error('failed', 'CONTEXT_OVERFLOW', 'PROVIDER_CONTEXT_OVERFLOW');
            return error('failed', response.status >= 500 ? 'UNAVAILABLE' : 'UNSUPPORTED_FEATURE', response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_REJECTED');
        }
        const payload = await boundedJson(response);
        if (combined.aborted)
            return error('unknown', 'OUTCOME_UNKNOWN', 'SENT_OUTCOME_UNKNOWN');
        if (!plain(payload) || payload.type !== 'message' || payload.role !== 'assistant' ||
            !Array.isArray(payload.content) || !nonempty(payload.id, 256))
            return error('failed', 'MALFORMED_RESPONSE', 'MALFORMED_PROVIDER_RESPONSE');
        const providerRequestId = payload.id;
        const u = plain(payload.usage) ? payload.usage : null;
        const usage = u && count(u.input_tokens) && count(u.output_tokens)
            ? { evidenceMode: 'provider-reported', inputTokens: u.input_tokens,
                outputTokens: u.output_tokens } : unavailable;
        if (payload.stop_reason === 'refusal')
            return error('refused', 'UNAVAILABLE', 'MODEL_REFUSAL', providerRequestId, usage);
        if (payload.stop_reason === 'pause_turn' || payload.stop_reason === 'model_context_window_exceeded')
            return error('failed', 'UNSUPPORTED_FEATURE', 'CONTINUATION_UNSUPPORTED', providerRequestId, usage);
        const text = [];
        const proposals = [];
        for (const block of payload.content) {
            if (!plain(block))
                return error('failed', 'MALFORMED_RESPONSE', 'MALFORMED_CONTENT_BLOCK', providerRequestId, usage);
            if (block.type === 'text' && typeof block.text === 'string')
                text.push(block.text);
            else if (block.type === 'tool_use') {
                if (!nonempty(block.name, 128) || !plain(block.input) ||
                    tools === undefined || !tools.some(t => t.name === block.name) || proposals.length >= 8)
                    return error('failed', 'UNSUPPORTED_FEATURE', 'UNAPPROVED_TOOL_PROPOSAL', providerRequestId, usage);
                const argumentsJson = JSON.stringify(block.input);
                if (argumentsJson.length === 0 || argumentsJson.length > 16384)
                    return error('failed', 'UNSUPPORTED_FEATURE', 'TOOL_ARGUMENTS_EXCEEDED', providerRequestId, usage);
                proposals.push({ name: block.name, argumentsJson });
            }
            else
                return error('failed', 'UNSUPPORTED_FEATURE', 'UNSUPPORTED_CONTENT_BLOCK', providerRequestId, usage);
        }
        if (payload.stop_reason === 'tool_use' && proposals.length === 0)
            return error('failed', 'MALFORMED_RESPONSE', 'MISSING_TOOL_USE', providerRequestId, usage);
        if (payload.stop_reason !== 'tool_use' && proposals.length > 0)
            return error('failed', 'UNSUPPORTED_FEATURE', 'UNEXPECTED_TOOL_USE', providerRequestId, usage);
        if (!['end_turn', 'max_tokens', 'stop_sequence', 'tool_use'].includes(String(payload.stop_reason)))
            return error('failed', 'UNSUPPORTED_FEATURE', 'UNKNOWN_STOP_REASON', providerRequestId, usage);
        const combinedText = text.join('');
        if (combinedText.length > 65536 || (combinedText.length === 0 && proposals.length === 0))
            return error('failed', 'MALFORMED_RESPONSE', 'EMPTY_OR_OVERSIZED_OUTPUT', providerRequestId, usage);
        const finishReason = payload.stop_reason === 'tool_use' ? 'tool_proposal' :
            payload.stop_reason === 'max_tokens' ? 'length' : 'stop';
        const result = { ...base, status: 'completed', text: combinedText,
            finishReason, usage, providerRequestId,
            ...(proposals.length === 0 ? {} : { toolProposals: proposals }) };
        host.assertResult(result);
        return result;
    };
}
