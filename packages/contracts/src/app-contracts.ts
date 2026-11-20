/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
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

export interface AppInitContext {
  readonly appId: string;
  readonly activationId: string;
  readonly lockDigest: ContentDigest;
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly functions: ReadonlyMap<string, ReadonlyFunctionHandle>;
  readonly resources: ReadonlyMap<string, ReadonlyResourceHandle>;
}

export interface AppInitResult {
  readonly status: AppStatus;
  readonly suppressedIngress?: readonly string[];
  readonly detail?: JsonValue;
}

export type FunctionOutcome =
  | { readonly kind: 'SUCCEEDED'; readonly value: JsonValue }
  | { readonly kind: 'UNKNOWN'; readonly unknownReason: { readonly code: string; readonly message: string } }
  | { readonly kind: 'FAILED'; readonly failure: { readonly code: string; readonly message: string } };

export interface DomainApp {
  readonly status: AppStatus;
  invoke(ingressId: string, input: unknown): Promise<FunctionOutcome>;
  inspect(): Promise<DomainAppInspection>;
  dispose(): Promise<{ readonly status: 'DISPOSED' }>;
}

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
  readonly suppressedIngress: readonly string[];
}
