import type { V10BuiltApp } from '@kaicreator/domain-harness-contracts';
export interface VerifiedProviderBundlePolicy {
    readonly profile: 'VERIFIED_PROVIDER_BUNDLE_V1';
    /** Independently protected Host approval; never read from the mutable seal. */
    readonly subjectDigest: string;
    readonly packageClosureDigest: string;
    readonly provider: {
        readonly specifier: string;
        /** Exact approved file, relative to the original deployment root. */
        readonly artifactPath: string;
        readonly artifactSha256: string;
    };
    readonly allowedNodeBuiltins: readonly string[];
    /** Existing, Host-controlled directory outside attacker-writable deployment. */
    readonly stagingRoot: string;
    /** Trusted Host dependency: e.g. Acorn parse(source, { sourceType:'module' }). */
    readonly parseModule: (source: string) => unknown;
}
export interface VerifiedProviderSnapshot {
    readonly deploymentRoot: string;
    dispose(): Promise<void>;
}
type Refuse = (code: string, message: string) => never;
/** A private immutable plain-data copy also closes caller mutation across awaits. */
export declare function snapshotVerifiedProviderApp(app: V10BuiltApp, refuse: Refuse): V10BuiltApp;
/** No original provider byte is evaluated; staging is copied from the open handle. */
export declare function prepareVerifiedProviderBundle(app: V10BuiltApp, policy: VerifiedProviderBundlePolicy, sourceRoot: string | undefined, closureDigest: string, reject: Refuse): Promise<VerifiedProviderSnapshot>;
export {};
