/** 当前领域契约：单一结构定义与严格的数据验证。 */
import type { ContentDigest, SemVer } from './base.js';
import type { ResourceRef } from './element-contracts.js';

export interface ElementRef {
  readonly namespace: string;
  readonly id: string;
  readonly version: SemVer;
  readonly digest: ContentDigest;
}

export interface FunctionRef {
  readonly element: ElementRef;
  readonly functionId: string;
  readonly contractVersion: string;
}

export type ElementVisibility = 'public' | 'private';

export const ELEMENT_VISIBILITIES = ['public', 'private'] as const;

/** BUILD Target 的私有 ESM 定位符，不是领域逻辑身份。 */
export interface ImplementationLocator {
  readonly module: ResourceRef;
  readonly exportName: string;
}

export interface ImplementationBinding {
  readonly elementId: string;
  readonly functionId: string;
  readonly contractVersion: string;
  /** 仅由唯一 KDP Host Init 实现声明，普通 Function 禁止设置。 */
  readonly invocationAbi?: 'kdp-host-init/1';
  readonly entry: ImplementationLocator;
  readonly resources?: readonly ResourceRef[];
}

export interface TargetSelector {
  readonly runtime: 'node';
  readonly module: 'esm';
  readonly nodeMajor?: number;
}

export type ResolvedTargetProfile = 'node22-esm/1';
export const NODE22_ESM_PROFILE: ResolvedTargetProfile = 'node22-esm/1';

export interface ResolvedTarget extends TargetSelector {
  readonly profile: ResolvedTargetProfile;
}

export interface TargetBinding {
  readonly target: TargetSelector;
  readonly implementations: readonly ImplementationBinding[];
}
