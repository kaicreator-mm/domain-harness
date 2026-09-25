import type { JsonValue } from '../contracts/json.js';
import type { HarnessTool, ToolContext, ToolEffect } from '../contracts/tool.js';
export interface ToolExecutionOptions {
    timeoutMs?: number;
}
export declare class ToolRegistry {
    private readonly tools;
    private readonly schemas;
    register(id: string, tool: HarnessTool): void;
    has(id: string): boolean;
    names(): ReadonlySet<string>;
    effectOf(id: string): ToolEffect;
    execute(id: string, input: unknown, context: ToolContext, options?: ToolExecutionOptions): Promise<JsonValue>;
}
//# sourceMappingURL=tool-registry.d.ts.map