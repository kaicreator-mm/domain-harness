import { type LoadedHarness } from './ast.js';
export interface LoadHarnessOptions {
    root: string;
    registeredTools?: ReadonlySet<string>;
}
export declare function loadHarness(options: LoadHarnessOptions): Promise<LoadedHarness>;
//# sourceMappingURL=load-harness.d.ts.map