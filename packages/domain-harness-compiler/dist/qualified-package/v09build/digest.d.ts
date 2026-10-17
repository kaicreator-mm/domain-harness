/**
 * DomainHarness v0.9 N06 (#1032) — BUILD-side typed errors and the
 * `dh.v9.qualified-root.subject/1` canonical digest (frozen L2 §11 D04).
 * =======================================================================
 *
 * The digest is lower-case hex SHA-256 of UTF-8
 * `JSON.stringify(canonicalSnapshot(subject))` with own string keys sorted
 * recursively and arrays in sealed order. The canonicalizer is REUSED from
 * the published v0.8 core (`@kaicreator/domain-harness/v8` — the exact same
 * module the protected H side imports as `../public-v8/contracts.js`), so
 * BUILD and H cannot drift on canonical bytes; no duplicate canonicalizer is
 * hand-rolled. The two D04 SHA256 vectors are asserted verbatim in
 * tests/v09-build-zero-import-n06.test.ts.
 */
/** Exact digest domain (D04). */
export declare const V09_SUBJECT_DOMAIN = "dh.v9.qualified-root.subject/1";
/** Sealed-root format emitted by the v0.9 BUILD. */
export declare const V09_SEALED_ROOT_FORMAT = "dh.v9.sealed-root/1";
/** Empty package import allowlist policy revision for the first cohort (D01). */
export declare const V09_IMPORT_POLICY_REVISION = "dh-import-zero/1";
/** First qualified reference cohort runtime ABI (D01: Node.js 24.x ESM). */
export declare const V09_RUNTIME_ABI = "js-es2022-esm-async/1";
/** Protected Host ABI revision of the v0.9 registry layer (D02). */
export declare const V09_HOST_ABI = "dh-host-protected/1";
/** BUILD bundler revision sealed into every v0.9 subject produced here. */
export declare const V09_BUNDLER_REVISION = "dh-v09-build-zero-import/1";
/**
 * Canonicalize one strict plain-data value and serialize it to the exact
 * canonical JSON bytes (sorted keys, sealed array order). Snapshot
 * refusals (hostile accessors, unsafe keys, sparse arrays, nonfinite
 * numbers, `-0`) are re-typed as `SUBJECT_RECORD_UNSAFE` without weakening.
 */
export declare function canonicalV9Json(value: unknown): string;
/**
 * Recompute the `dh.v9.qualified-root.subject/1` digest over a subject
 * record: lower-case hex SHA-256 of the UTF-8 canonical JSON bytes. The
 * protected H recomputes this value from stored bytes at install/activation
 * and refuses any divergence.
 */
export declare function computeV9QualifiedRootSubjectDigest(subject: unknown): string;
/**
 * Assemble the D04 subject record of a v0.9 sealed root and compute its
 * digest. The subject carries exactly the D04 field set plus the digest
 * `domain`; this helper never invents fields.
 */
export declare function computeV09SealedRootSubjectDigest(input: {
    readonly rootPackageId: string;
    readonly buildId: string;
    readonly bundlerRevision: string;
    readonly importPolicyRevision: string;
    readonly runtimeAbi: string;
    readonly hostAbi: string;
    readonly packages: readonly {
        readonly packageId: string;
        readonly kind: string;
        readonly abiVersion: string;
        readonly moduleSha256: string;
    }[];
    readonly bindings: readonly unknown[];
}): string;
