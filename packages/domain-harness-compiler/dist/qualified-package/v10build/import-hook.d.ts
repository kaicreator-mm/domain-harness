import type { V10AppView } from './activation.js';
export declare function privateModuleFragment(activationNonce: string, packageId: string): string;
/**
 * Honor the consumed record's declared npm/native allowances for the `data:`
 * URLs this activation is about to import. Returns the release closure that
 * unregisters the allowances (and the process hook when this was its last
 * user). Refuses typed when the runtime cannot host the resolve hook.
 */
export declare function registerDeclaredBareImports(deps: {
    activationModuleUrl: string;
    activationNonce: string;
    appView: V10AppView;
    deploymentRoot: string | undefined;
}): () => void;
