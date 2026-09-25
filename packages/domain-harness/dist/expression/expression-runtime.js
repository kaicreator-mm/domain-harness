import jsonata from 'jsonata';
import { isPortableJsonValue, utf8ByteLength } from './json-boundary.js';
import { assertExpressionPolicy } from './policy.js';
export class ExpressionRuntimeError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ExpressionRuntimeError';
        this.code = code;
    }
}
const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_STACK_LIMIT = 256;
const DEFAULT_MAX_INPUT_BYTES = 1_048_576;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;
export class ExpressionRuntime {
    async evaluate(expressionSource, scope, logicalTime, options = {}) {
        try {
            assertExpressionPolicy(expressionSource);
        }
        catch (error) {
            throw normalizeExpressionError(error);
        }
        const clockMs = Date.parse(logicalTime);
        if (!Number.isFinite(clockMs)) {
            throw new ExpressionRuntimeError('expression_error', 'logicalTime must be a valid ISO timestamp');
        }
        const clockIso = new Date(clockMs).toISOString();
        const maxInputBytes = positiveFiniteOption(options.maxInputBytes, DEFAULT_MAX_INPUT_BYTES, 'maxInputBytes');
        const maxOutputBytes = positiveFiniteOption(options.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES, 'maxOutputBytes');
        const timeoutMs = positiveFiniteOption(options.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs');
        const stackLimit = positiveFiniteOption(options.stackLimit, DEFAULT_STACK_LIMIT, 'stackLimit');
        if (!isPortableJsonValue(scope)) {
            throw new ExpressionRuntimeError('expression_error', 'expression input must be a portable JSON value');
        }
        const inputJson = JSON.stringify(scope);
        if (utf8ByteLength(inputJson) > maxInputBytes) {
            throw new ExpressionRuntimeError('expression_error', 'expression input exceeds maxInputBytes');
        }
        assertNotCancelled(options.signal);
        let expression;
        try {
            expression = jsonata(expressionSource, { timeout: timeoutMs, stack: stackLimit });
            expression.registerFunction('now', () => clockIso, '<:s>');
            expression.registerFunction('millis', () => clockMs, '<:n>');
        }
        catch (error) {
            throw normalizeExpressionError(error);
        }
        let result;
        try {
            result = await expression.evaluate(scope);
        }
        catch (error) {
            if (isJsonataTimeout(error)) {
                throw new ExpressionRuntimeError('timeout', `expression evaluation exceeded ${timeoutMs}ms`);
            }
            throw normalizeExpressionError(error);
        }
        assertNotCancelled(options.signal);
        if (!isPortableJsonValue(result)) {
            throw new ExpressionRuntimeError('expression_error', 'expression result is not a portable JSON value');
        }
        const outputJson = JSON.stringify(result);
        if (utf8ByteLength(outputJson) > maxOutputBytes) {
            throw new ExpressionRuntimeError('expression_error', 'expression result exceeds maxOutputBytes');
        }
        // JSONata builds result objects without Object.prototype; hand callers plain JSON.
        return JSON.parse(outputJson);
    }
    async evaluateBoolean(expression, scope, logicalTime, options = {}) {
        const result = await this.evaluate(expression, scope, logicalTime, options);
        if (typeof result !== 'boolean') {
            throw new ExpressionRuntimeError('expression_error', `route expression must return strict boolean, got ${result === null ? 'null' : typeof result}`);
        }
        return result;
    }
}
function positiveFiniteOption(value, fallback, label) {
    const resolved = value ?? fallback;
    if (!Number.isFinite(resolved) || resolved <= 0) {
        throw new ExpressionRuntimeError('expression_error', `${label} must be greater than zero`);
    }
    return resolved;
}
function assertNotCancelled(signal) {
    if (signal?.aborted) {
        throw new ExpressionRuntimeError('cancelled', 'expression evaluation was cancelled');
    }
}
function isJsonataTimeout(error) {
    if (!error || typeof error !== 'object')
        return false;
    const candidate = error;
    return (candidate.code === 'D1012' ||
        (typeof candidate.message === 'string' && /time(?:out| limit)/i.test(candidate.message)));
}
function normalizeExpressionError(error) {
    if (error instanceof ExpressionRuntimeError)
        return error;
    return new ExpressionRuntimeError('expression_error', error instanceof Error ? error.message : String(error));
}
//# sourceMappingURL=expression-runtime.js.map