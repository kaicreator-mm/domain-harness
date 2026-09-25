import { type SupportedCompiledInvokeKind } from '../v2/contracts/package.js';
import type { CompiledSkillDefinition } from './journaled-skill-runner.js';
/**
 * Authoritative decoded shape of a compiled Workflow definition for
 * `executionEngineMajor` 2 (issue #168). One decoder is shared by package
 * activation (fail-closed rejection of corrupt or unsupported artifacts, per
 * the PRD R4 corrupt-package acceptance criterion) and by the runtime
 * interpreter, so the artifact boundary no longer relies on
 * `as unknown as` casts plus a three-field spot check.
 *
 * Decoding normalizes optional route containers (`done`/`error`/`events`
 * default to empty) and rejects everything the engine cannot execute:
 * unknown or legacy invoke kinds, dangling route targets, non-array effect
 * lists (previously silently skipped), invalid `maxSteps`, and malformed
 * state/route/effect shapes.
 */
export interface CompiledRoute {
    readonly target: string;
    readonly when?: string;
}
export interface CompiledMessageEffect {
    readonly kind: 'domain-message';
    readonly targetExpression: string;
    readonly messageType: string;
    readonly payloadExpression?: string;
    readonly contractVersion?: string;
}
export interface CompiledInvoke {
    readonly kind: SupportedCompiledInvokeKind;
    readonly ref?: string;
    readonly expression?: string;
    readonly input?: string;
    readonly timeoutMs?: number;
    readonly skill?: CompiledSkillDefinition;
}
export interface CompiledState {
    readonly final: boolean;
    readonly invoke?: CompiledInvoke;
    readonly done: readonly CompiledRoute[];
    readonly error: readonly CompiledRoute[];
    readonly events: Readonly<Record<string, {
        readonly routes: readonly CompiledRoute[];
    }>>;
    readonly effects?: readonly CompiledMessageEffect[];
}
export interface CompiledWorkflowIRV2 {
    readonly initial: string;
    readonly output?: string;
    readonly states: Readonly<Record<string, CompiledState>>;
    readonly limits?: {
        readonly maxSteps?: number;
    };
}
export declare class CompiledWorkflowIrError extends Error {
    constructor(message: string);
}
export declare function decodeCompiledWorkflowDefinition(workflowId: string, definition: unknown): CompiledWorkflowIRV2;
//# sourceMappingURL=compiled-workflow-ir.d.ts.map