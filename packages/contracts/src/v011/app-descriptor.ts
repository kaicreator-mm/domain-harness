/**
 * DomainHarness v0.11.0 T01 (#1575) — L204 Domain App Descriptor (L2 §5.1).
 *
 * The descriptor is the human author's selection intent, NOT a Lock: it
 * does not repeat Element definitions or transitive dependencies (PRD
 * P06). BUILD resolves every `PackageRef` version and emits the exact
 * `DomainAppLock` (L2 §5.2) as the sole runtime fact.
 */
import type { JsonValue, SemVer } from './base.js';
import type { FunctionRef, TargetSelector } from './refs.js';
import type { DH_APP_SCHEMA_VERSION } from './schema-versions.js';

/** BUILD resolves the version to an exact one before sealing the Lock. */
export interface PackageRef {
  readonly package: string;
  readonly version: SemVer;
}

export interface IngressEntry {
  /** Ingress name the consumer calls through. */
  readonly id: string;
  readonly function: FunctionRef;
  /** Predeclared optional ingress: DEGRADED may suppress exactly these (PRD A04). */
  readonly optional?: boolean;
}

export interface DomainAppDescriptor {
  readonly kind: 'DomainApp';
  readonly schemaVersion: typeof DH_APP_SCHEMA_VERSION;
  readonly id: string;
  readonly version: SemVer;
  readonly target: TargetSelector;
  readonly roots: {
    readonly kernelPrimary: PackageRef;
    readonly sdkPrimary: PackageRef;
    readonly businessPrimary: PackageRef;
  };
  /** 0..N, mixed layers; each entry's layer comes from its manifest. */
  readonly extensions: readonly PackageRef[];
  /** The one Business App Init (PRD A01/AR-09). */
  readonly businessAppInit: FunctionRef;
  readonly ingress: readonly IngressEntry[];
  /** Selected read-only configuration handed to the Init context (PRD A03). */
  readonly config?: Readonly<Record<string, JsonValue>>;
}
