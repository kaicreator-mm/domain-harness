/**
 * Private process-wide import resolution for sealed data: modules.
 * Extracted from v0.10 activation without changing import hook authority.
 * Each allowance carries its original activation module URL to preserve
 * default installed dependency resolution when deploymentRoot is absent.
 * Not an untrusted-code sandbox; caller MUST dispose the returned closure.
 */
import { registerHooks } from 'node:module';
import type { V10AppView } from '@kaicreator/domain-harness-contracts';
export declare function privateModuleFragment(activationNonce: string, packageId: string): string;
/**
 * A separate, injectable registry is exposed only by this INTERNAL module
 * for deterministic hook tests. Every registry owns independent allowances,
 * refcounts and deregistration. The production registry is never reset by
 * tests, and the public compiler barrels do not export this symbol.
 */
export interface V10ImportHookRegistry {
    registerDeclaredBareImports(deps: {
        activationModuleUrl: string;
        activationNonce: string;
        appView: V10AppView;
        deploymentRoot: string | undefined;
    }): () => void;
    snapshot(): Readonly<{
        users: number;
        allowances: number;
        registered: boolean;
    }>;
}
/** Test-only: injected registries never mutate production registration state. */
export declare function createV10ImportHookRegistryForTests(registerHook: typeof registerHooks): V10ImportHookRegistry;
/** The single process-scoped production import registry. */
export declare function registerDeclaredBareImports(deps: Parameters<V10ImportHookRegistry['registerDeclaredBareImports']>[0]): () => void;
