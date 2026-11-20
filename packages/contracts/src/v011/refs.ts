/**
 * DomainHarness v0.11.0 T01 (#1575) — L202 refs / ownership / visibility /
 * implementation / Target contracts (L2 §3).
 *
 * Logical references resolve exactly (exact version + exact definition
 * digest); cross-Package consumption goes through explicit exports plus
 * ElementRef/FunctionRef (PRD AR-03/P04/P09). Implementation ownership may
 * differ from definition ownership (PRD P05) but is declared ONLY inside
 * `TargetBinding.implementations[]` — the manifest has no second
 * implementations field, and the applicable Target of a binding is
 * exclusively its owning TargetBinding.target (L2 §13.5 P1-03).
 */
import type { ContentDigest, SemVer } from './base.js';
import type { ResourceRef } from './element-contracts.js';

/** Logical Element reference; resolves to exact version + exact definition digest. */
export interface ElementRef {
  /** Domain id, e.g. 'orders'. */
  readonly namespace: string;
  /** Full element id, e.g. 'orders.eligibility'. */
  readonly id: string;
  /** Exact version. */
  readonly version: SemVer;
  /** definitionDigest of the resolved Element definition. */
  readonly digest: ContentDigest;
}

export interface FunctionRef {
  readonly element: ElementRef;
  readonly functionId: string;
  readonly contractVersion: string;
}

export type ElementVisibility = 'public' | 'private';

export const ELEMENT_VISIBILITIES = ['public', 'private'] as const;

export interface EntryRef {
  /** Implementation module artifact reference (e.g. dist/package.mjs) + digest. */
  readonly module: ResourceRef;
  /** Named export (e.g. 'init'); default-export anonymity is refused. */
  readonly exportName: string;
}

export interface ImplementationBinding {
  readonly elementId: string;
  readonly functionId: string;
  readonly contractVersion: string;
  readonly entry: EntryRef;
  /** Resource closure this implementation consumes. */
  readonly resources?: readonly ResourceRef[];
}

export interface TargetSelector {
  /** 0.11.0 sole implemented runtime target (PRD B01). */
  readonly runtime: 'node';
  readonly module: 'esm';
  /** Declared applicability floor; aligned with the L2 §8.4 ruling (22; R27). */
  readonly nodeMajor?: number;
}

/** Exact Target constant entering the Lock (L2 §5.2/§8.4). */
export type ResolvedTargetProfile = 'node22-esm/1';
export const NODE22_ESM_PROFILE: ResolvedTargetProfile = 'node22-esm/1';

export interface ResolvedTarget extends TargetSelector {
  readonly profile: ResolvedTargetProfile;
}

/**
 * Package-side Target variant declaration; `implementations[]` is the ONLY
 * source of the implementation inventory (L2 §13.5 P1-03 — the manifest
 * top level carries no implementations field).
 */
export interface TargetBinding {
  readonly target: TargetSelector;
  readonly implementations: readonly ImplementationBinding[];
}
