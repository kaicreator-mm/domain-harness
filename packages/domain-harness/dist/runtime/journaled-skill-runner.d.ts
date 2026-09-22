import type { AIOperationPort } from '../contracts/ai.js';
import type { JsonSchema, JsonValue } from '../contracts/json.js';
import { type EffectIdentitySeed } from '../execution/journal/effect-identity.js';
import type { Sha256Port } from '../v2/contracts/host.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
export interface CompiledSkillDefinition {
    readonly skillId: string;
    readonly instructions: string;
    readonly inputSchema?: JsonSchema;
    readonly outputSchema: JsonSchema;
    readonly resources: readonly {
        readonly path: string;
        readonly content: string;
    }[];
    readonly profile?: string;
}
export type SkillJournalStore = Pick<RuntimeStore, 'getEffect' | 'beginEffect' | 'completeEffect'>;
export interface JournaledSkillRunnerOptions {
    readonly store: SkillJournalStore;
    readonly sha256: Sha256Port;
    readonly ai: AIOperationPort;
    readonly now?: () => string;
}
export interface RunSkillRequest extends EffectIdentitySeed {
    readonly skill: CompiledSkillDefinition;
    readonly input: JsonValue;
    readonly timeoutMs?: number;
}
export interface CompletedSkillResult {
    readonly effectId: string;
    readonly output: JsonValue;
    readonly attempt: number;
    readonly replayed: boolean;
}
export declare class JournaledSkillRunner {
    #private;
    constructor(options: JournaledSkillRunnerOptions);
    run(request: RunSkillRequest): Promise<CompletedSkillResult>;
    private execute;
}
//# sourceMappingURL=journaled-skill-runner.d.ts.map