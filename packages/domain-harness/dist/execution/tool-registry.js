import { runAbortable } from './abortable.js';
import { ExecutorError } from './executor-error.js';
import { SchemaValidator } from './schema-validator.js';
export class ToolRegistry {
    tools = new Map();
    schemas = new SchemaValidator();
    register(id, tool) {
        if (!id.trim())
            throw new Error('Tool id must be non-empty');
        if (this.tools.has(id))
            throw new Error(`Tool '${id}' is already registered`);
        this.tools.set(id, { tool, effect: tool.effect });
    }
    has(id) {
        return this.tools.has(id);
    }
    names() {
        return new Set(this.tools.keys());
    }
    effectOf(id) {
        const registered = this.tools.get(id);
        if (!registered)
            throw new ExecutorError('tool_error', `Tool '${id}' is not registered`);
        return registered.effect;
    }
    async execute(id, input, context, options = {}) {
        const registered = this.tools.get(id);
        if (!registered)
            throw new ExecutorError('tool_error', `Tool '${id}' is not registered`);
        const normalizedInput = this.schemas.validate(registered.tool.input, input, 'invalid_input', `Tool '${id}' input`);
        const result = await runAbortable({
            signal: context.signal,
            ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        }, 'tool_error', `Tool '${id}'`, async (signal) => registered.tool.execute(normalizedInput, { ...context, signal }));
        return this.schemas.validate(registered.tool.output, result, 'invalid_output', `Tool '${id}' output`);
    }
}
//# sourceMappingURL=tool-registry.js.map