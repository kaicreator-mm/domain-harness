/**
 * DomainHarness v0.9 N06 (#1032) — `dh.v9.qualified-root.subject/1` canonical
 * digest (frozen L2 §11 D04).
 * ============================================================================
 *
 * Lower-case hex SHA-256 of UTF-8 `JSON.stringify(canonicalSnapshot(subject))`
 * with own string keys sorted recursively, arrays in sealed order — the exact
 * v0.8 snapshot discipline, REUSED here by importing the published v0.8
 * `canonicalSnapshot` (hostile getters/accessors refused unread, unsafe
 * `__proto__`/`prototype`/`constructor` keys refused, sparse arrays and
 * non-enumerable own keys refused, nonfinite numbers and `-0` refused, no
 * silent prototype/number normalization). No duplicate canonicalizer is
 * hand-rolled (L2 §7 R2 mandate).
 *
 * The two D04 canonical byte vectors (V1, V2) are asserted verbatim in
 * tests/v09-host-registry-n06.test.ts and were independently re-verified
 * against real Node24 before this implementation (claim evidence).
 *
 * The compiler-side BUILD reuses the SAME canonicalizer from
 * `@kaicreator/domain-harness/v8` and the same subject construction; tests
 * assert both sides produce identical digests for identical subjects.
 */

import { canonicalSnapshot, sha256Hex } from '../public-v8/contracts.js';
import { V09HostError, governanceRefusal } from './errors.js';

/** Exact digest domain (D04). */
export const V09_SUBJECT_DOMAIN = 'dh.v9.qualified-root.subject/1';
/** Sealed-root format carried by v0.9 BUILD output and H registry artifacts. */
export const V09_SEALED_ROOT_FORMAT = 'dh.v9.sealed-root/1';
/** Empty package import allowlist policy revision for the first cohort (D01). */
export const V09_IMPORT_POLICY_REVISION = 'dh-import-zero/1';
/** First qualified reference cohort runtime ABI (D01: Node.js 24.x ESM). */
export const V09_RUNTIME_ABI = 'js-es2022-esm-async/1';
/** Protected Host ABI revision of this v0.9 registry layer (D02). */
export const V09_HOST_ABI = 'dh-host-protected/1';

export class V09SubjectError extends V09HostError {
  constructor(code: string, message: string) {
    super(code, code, message);
    this.name = 'V09SubjectError';
  }
}

/**
 * Canonicalize one strict plain-data value and serialize it to the exact
 * canonical JSON bytes (sorted keys, sealed array order). Refusals from the
 * snapshot discipline are re-typed as `SUBJECT_RECORD_UNSAFE` without
 * weakening the underlying refusal.
 */
export function canonicalV9Json(value: unknown): string {
  let snapshot: unknown;
  try {
    snapshot = canonicalSnapshot(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw governanceRefusal('SUBJECT_RECORD_UNSAFE', `v0.9 subject record is not strict canonical plain data: ${detail}`);
  }
  return JSON.stringify(snapshot);
}

/**
 * Recompute the `dh.v9.qualified-root.subject/1` digest over a subject
 * record: lower-case hex SHA-256 of the UTF-8 canonical JSON bytes.
 * Both the producer (BUILD) and the protected H recompute this value and
 * refuse any divergence — an approval can never be replayed onto a
 * different closure.
 */
export function computeV9QualifiedRootSubjectDigest(subject: unknown): string {
  if (typeof subject !== 'object' || subject === null || Array.isArray(subject)) {
    throw new V09SubjectError('SUBJECT_RECORD_UNSAFE', 'v0.9 subject must be a plain record');
  }
  return sha256Hex(canonicalV9Json(subject));
}

/**
 * Assemble the D04 subject record of a v0.9 sealed root and compute its
 * digest. The subject carries exactly the D04 field set — `formatVersion`,
 * `rootPackageId`, `buildId`, `bundlerRevision`, `importPolicyRevision`,
 * `runtimeAbi`, `hostAbi`, ordered `packages[{packageId,kind,abiVersion,
 * moduleSha256,imports:[]}]` and ordered `bindings` — plus the digest
 * `domain`. Unknown fields/aliases are refused at the root boundary before
 * this function is reached; this helper never invents fields.
 */
export function computeV09SealedRootSubjectDigest(input: {
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
}): string {
  return computeV9QualifiedRootSubjectDigest({
    domain: V09_SUBJECT_DOMAIN,
    formatVersion: V09_SEALED_ROOT_FORMAT,
    rootPackageId: input.rootPackageId,
    buildId: input.buildId,
    bundlerRevision: input.bundlerRevision,
    importPolicyRevision: input.importPolicyRevision,
    runtimeAbi: input.runtimeAbi,
    hostAbi: input.hostAbi,
    packages: input.packages.map((pkg) => ({
      packageId: pkg.packageId,
      kind: pkg.kind,
      abiVersion: pkg.abiVersion,
      moduleSha256: pkg.moduleSha256,
      imports: [],
    })),
    bindings: input.bindings,
  });
}
