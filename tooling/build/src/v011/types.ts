/**
 * DomainHarness v0.11.0 T02 (#1576) — BUILD-owned input/result types for the
 * canonical `buildV011App` (L2 §5 BUILD / AOT / exact Lock).
 *
 * These types are BUILD property: they describe how an authoring workspace is
 * handed to BUILD (descriptor + package manifests + on-disk package roots with
 * REAL resource bytes), and what BUILD returns (the sealed `DomainAppLock` plus
 * its canonical JSON bytes). They consume ONLY the frozen T01 common contracts
 * (`@kaicreator/domain-harness-contracts/v011`); no second schema authority, no
 * runtime discovery, no dependency repair, no dynamic version negotiation.
 */
import type {
  DomainAppLock,
  V011BuildErrorCode,
} from '@kaicreator/domain-harness-contracts/v011';

/**
 * A BUILD refusal: exactly one frozen BUILD error code (L2 §9.1), a human
 * message (never machine semantics — consumers match on `code` only, PRD D02)
 * and an optional dot path into the offending input document.
 */
export interface V011BuildFailure {
  readonly ok: false;
  readonly code: V011BuildErrorCode;
  readonly message: string;
  readonly path?: string;
}

export interface V011BuildSuccess {
  readonly ok: true;
  /** The sealed exact Lock — the ONLY runtime fact (PRD AR-05/B04). */
  readonly lock: DomainAppLock;
  /**
   * `canonicalJson(lock)` as UTF-8 bytes (sorted keys, no whitespace, L2
   * §2.1/§5.3). Repeated BUILD over identical input yields byte-identical
   * `lockBytes` (AC07).
   */
  readonly lockBytes: Uint8Array;
}

export type V011BuildResult = V011BuildSuccess | V011BuildFailure;

/** The KDP bootstrap artifact BUILD pins into `Lock.bootstrapKdpPin` (L2 §5.2). */
export interface V011KdpArtifactInput {
  /** The KDP package id recorded in the Lock (e.g. the microkernel package). */
  readonly packageId: string;
  /** Package-root relative POSIX path of the KDP bootstrap entry artifact. */
  readonly path: string;
}

/**
 * Input of one canonical BUILD run.
 *
 * - `descriptor`: the human-authored DomainAppDescriptor selection intent
 *   (L2 §5.1), validated against the T01 machine schema.
 * - `domains`: optional authoring Domain definitions, validated through the T01
 *   Domain validators. The Package closure itself is manifest-driven; Domain
 *   documents are validated when supplied but never override the manifests.
 * - `packages`: the candidate DomainPackageManifest pool. Selected closure =
 *   descriptor roots + extensions + transitive `dependsOn`.
 * - `packageRoots`: packageId -> absolute directory holding that package's
 *   on-disk files. Every ResourceRef is resolved inside its package root
 *   (containment-enforced) and its declared sha256 digest verified against the
 *   real bytes (PRD B07 / AC07).
 * - `packageArtifacts`: selected packageId -> package-root relative path of
 *   that package's exact Target artifact; its real bytes become
 *   `SelectedPackage.artifact.digest`.
 * - `kdpArtifact`: the KDP Primary bootstrap artifact whose byte digest becomes
 *   `bootstrapKdpPin.kdpPrimaryDigest`.
 */
export interface V011BuildInput {
  readonly descriptor: unknown;
  readonly domains?: readonly unknown[];
  readonly packages: readonly unknown[];
  readonly packageRoots: Readonly<Record<string, string>>;
  readonly packageArtifacts: Readonly<Record<string, string>>;
  readonly kdpArtifact: V011KdpArtifactInput;
}
