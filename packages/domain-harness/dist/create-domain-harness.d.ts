import type { AIOperationPort } from './contracts/ai.js';
import type { DomainHarness } from './contracts/runtime.js';
import type { HarnessTool } from './contracts/tool.js';
export interface CreateDomainHarnessOptions {
    /** Root directory containing harness.yaml, workflows/, skills/, scripts/, and schemas. */
    root: string;
    /** SQLite database path owned by this DomainHarness process. `:memory:` is valid for tests. */
    sqlitePath: string;
    /** Provider-neutral AI Runtime boundary used by Skill steps. */
    ai: AIOperationPort;
    /** Host-owned Tool implementations keyed by the Tool ids referenced by Workflow YAML. */
    tools?: Readonly<Record<string, HarnessTool>>;
}
/**
 * Load one frozen Harness definition and assemble the embedded v0.1 Runtime.
 *
 * XState, SQLite schema/store, Runner and recovery implementation details remain
 * private; callers receive only the frozen DomainHarness lifecycle contract.
 */
export declare function createDomainHarness(options: CreateDomainHarnessOptions): Promise<DomainHarness>;
//# sourceMappingURL=create-domain-harness.d.ts.map