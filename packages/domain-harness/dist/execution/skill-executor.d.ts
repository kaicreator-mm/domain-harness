import type { AIOperationIdentity, AIOperationPort } from '../contracts/ai.js';
import type { JsonValue } from '../contracts/json.js';
import type { SkillAst } from '../loader/ast.js';
export interface SkillExecutionOptions {
    signal: AbortSignal;
    timeoutMs?: number;
}
export declare class SkillExecutor {
    private readonly ai;
    private readonly schemas;
    constructor(ai: AIOperationPort);
    execute(skill: SkillAst, input: unknown, identity: AIOperationIdentity, options: SkillExecutionOptions): Promise<JsonValue>;
}
//# sourceMappingURL=skill-executor.d.ts.map