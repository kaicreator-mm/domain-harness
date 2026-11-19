/**
 * DomainHarness v0.11.0 T01 (#1575) — L206 App Init / status machine /
 * Function ingress contracts (L2 §7).
 *
 * FunctionOutcome is a STRICT discriminated union (L2 §13.5 P1-04):
 * SUCCEEDED always carries `value`, UNKNOWN always carries
 * `unknownReason`, FAILED always carries `failure`; mutually exclusive
 * fields are not declared on other variants, so statically constructing a
 * cross-state mixture or omitting the payload is a compile-time error
 * (enforced by the exported static negatives in
 * `function-outcome-negatives.ts` and the package tsc gates).
 */
import type { ContentDigest, JsonValue, SemVer } from './base.js';
import type {
  EffectIntent,
  FunctionOutcomeKind,
} from './element-contracts.js';
import type {
  ElementRef,
  ElementVisibility,
  FunctionRef,
  ResolvedTarget,
} from './refs.js';
import type { PackageLayer, PackageRole } from './package-manifest.js';
import type { ResourceRef } from './element-contracts.js';

export type AppStatus = 'READY' | 'DEGRADED' | 'BLOCKED' | 'FAILED';

export interface ReadonlyFunctionHandle {
  invoke(input: unknown): Promise<FunctionOutcome>;
}

export interface ReadonlyResourceHandle {
  readonly ref: ResourceRef;
  read(): Promise<Uint8Array>;
}

/**
 * Init context: exposes only identity / Lock pin / selected read-only
 * config / exported Function and resource handles (PRD A03) — never
 * unselected package modules, host permissions or KDP internals.
 */
export interface AppInitContext {
  readonly appId: string;
  readonly activationId: string;
  readonly lockDigest: ContentDigest;
  readonly config: Readonly<Record<string, JsonValue>>;
  /** ingress id → handle. */
  readonly functions: ReadonlyMap<string, ReadonlyFunctionHandle>;
  readonly resources: ReadonlyMap<string, ReadonlyResourceHandle>;
}

export interface AppInitResult {
  readonly status: AppStatus;
  /** DEGRADED only: predeclared optional ingress ids suppressed this run. */
  readonly suppressedIngress?: readonly string[];
  readonly detail?: JsonValue;
}

export type FunctionOutcome =
  /** value must pass the outputSchemaRef validation. */
  | { readonly kind: 'SUCCEEDED'; readonly value: JsonValue }
  | { readonly kind: 'UNKNOWN'; readonly unknownReason: { readonly code: string; readonly message: string } }
  | { readonly kind: 'FAILED'; readonly failure: { readonly code: string; readonly message: string } };

export interface DomainApp {
  readonly status: AppStatus;
  /**
   * Direct ingress: any when READY; only non-suppressed ones when
   * DEGRADED; typed refusal in every other status.
   */
  invoke(ingressId: string, input: unknown): Promise<FunctionOutcome>;
  /** B06: programmatic inspection of selected Element/Function metadata (no private internals). */
  inspect(): Promise<DomainAppInspection>;
  /** Normal teardown strictly in disposeOrder; no concurrent stop/drain semantics (PRD A07). */
  dispose(): Promise<{ readonly status: 'DISPOSED' }>;
}

/** B06 inspection closure (L2 §13.5 P1-04): read-only projection of Lock facts only. */
export interface DomainAppInspection {
  readonly appIdentity: { readonly id: string; readonly version: SemVer; readonly lockDigest: ContentDigest };
  readonly target: ResolvedTarget;
  readonly packages: readonly {
    readonly packageId: string;
    readonly version: SemVer;
    readonly layer: PackageLayer;
    readonly role: PackageRole;
  }[];
  readonly elements: readonly {
    readonly ref: ElementRef;
    readonly ownerPackageId: string;
    readonly visibility: ElementVisibility;
  }[];
  readonly functions: readonly {
    readonly ref: FunctionRef;
    readonly outcomes: readonly FunctionOutcomeKind[];
    readonly effects: EffectIntent;
  }[];
  readonly ingress: readonly { readonly id: string; readonly optional: boolean }[];
  /** Optional ingress ids suppressed while DEGRADED; empty array otherwise. */
  readonly suppressedIngress: readonly string[];
}
