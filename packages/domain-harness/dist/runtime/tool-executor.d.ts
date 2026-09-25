import type { ToolExecutorPort } from '../v2/contracts/effect.js';
import type { RuntimeHostBindings } from '../v2/contracts/host.js';
export declare class RuntimeToolBindingError extends Error {
    constructor(message: string);
}
export declare function createRuntimeToolExecutor(host: RuntimeHostBindings): ToolExecutorPort;
//# sourceMappingURL=tool-executor.d.ts.map