/**
 * DomainHarness v0.11.0 T01 (#1575) — L205 Boot / BootstrapPin / KDP
 * single-core bootstrap contracts (L2 §6).
 *
 * The trusted install record is the trust anchor written by ONE trusted
 * installation process (PRD K02): Boot reads it from the fixed relative
 * path under installRoot and never accepts caller-supplied record content
 * or paths. The pin is untrusted caller input used only for field-by-field
 * cross-checking against that record; it cannot carry or self-declare
 * record contents (L2 §13.5 P1-02). No PKI/signature product in 0.11.0.
 */
import type { ContentDigest, SemVer } from './base.js';
import type { ResolvedTarget } from './refs.js';
import type {
  DH_INSTALL_RECORD_SCHEMA_VERSION,
  DH_PIN_SCHEMA_VERSION,
} from './schema-versions.js';
import type { DomainApp } from './app-contracts.js';

/**
 * Minimal installation facts written by a trusted installation process
 * (0.11.0: the T05 clean-install path / deployment operator). Boot reads
 * it ONLY from `<installRoot>/dh-install/installed-record.json`.
 */
export interface InstalledRecord {
  readonly kind: 'DomainAppInstallRecord';
  readonly schemaVersion: typeof DH_INSTALL_RECORD_SCHEMA_VERSION;
  readonly appId: string;
  readonly appVersion: SemVer;
  readonly target: ResolvedTarget;
  /** POSIX path relative to installRoot. */
  readonly lockPath: string;
  /** = the sealed Lock's closureDigest (predecessor image in L2 §5.3). */
  readonly lockDigest: ContentDigest;
  /** e.g. '@kaicreator/domain-harness-microkernel'. */
  readonly kdpPackageId: string;
  /** Fixed entry export name (frozen to the literal 'bootstrap'). */
  readonly kdpPrimaryEntry: 'bootstrap';
  /** implementationDigest of the KDP entry artifact. */
  readonly kdpPrimaryDigest: ContentDigest;
  /**
   * Installer-computed: sha256(canonicalJson(this record with
   * `recordDigest` removed)).
   */
  readonly recordDigest: ContentDigest;
}

/**
 * Minimal boot localization fixed at install time (PRD K02). The pin is
 * UNTRUSTED caller input: every field must equal the corresponding field
 * of the InstalledRecord Boot reads from the trusted location (§6.2
 * verification ladder) before it takes effect.
 */
export interface BootstrapPin {
  readonly schemaVersion: typeof DH_PIN_SCHEMA_VERSION;
  readonly target: ResolvedTarget;
  readonly kdpPackageId: string;
  readonly kdpPrimaryEntry: 'bootstrap';
  readonly kdpPrimaryDigest: ContentDigest;
  /** Points at the sealed Lock; must equal InstalledRecord.lockDigest. */
  readonly lockDigest: ContentDigest;
  readonly lockPath: string;
}

/** Minimal host channel for fixtures/tests; not an Effect permission and not service discovery. */
export interface HostPortBinding {
  readonly name: string;
  readonly port: number;
}

export interface KdpBootstrapContext {
  /** Trusted installation root: Boot reads the InstalledRecord at the fixed relative path. */
  readonly installRoot: string;
  readonly descriptorPath: string;
  readonly lockPath: string;
  readonly hostPorts?: readonly HostPortBinding[];
  readonly env: { readonly nodeMajor: number; readonly platform: string };
}

/**
 * KDP bootstrap result (Boot/KDP → caller hand-off, L2 §13.5 P1-04):
 * BOOTED = loading and technical init completed AND the one
 * businessAppInit executed (app.status ∈ AppStatus); FAILED = physical
 * load/technical-init failure — an ordinary startup failure with zero
 * ingress, no App handle and no automatic retry (PRD K07).
 */
export type KdpBootstrapResult =
  | { readonly status: 'BOOTED'; readonly app: DomainApp }
  | { readonly status: 'FAILED'; readonly code: string; readonly reason: string };

/** Fixed entry interface of the KDP Primary (microkernel/v011 export). */
export interface KdpPrimary {
  bootstrap(context: KdpBootstrapContext): Promise<KdpBootstrapResult>;
}

/**
 * Boot's return: REFUSED = pin/record verification failure (typed error
 * code, zero side effects, no module loaded); otherwise the
 * KdpBootstrapResult passes through.
 */
export type BootResult =
  | { readonly status: 'REFUSED'; readonly code: string; readonly reason: string }
  | KdpBootstrapResult;
