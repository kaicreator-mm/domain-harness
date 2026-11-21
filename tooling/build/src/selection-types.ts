/** BUILD 内部的选定 Element/Function 载体；不构成新的对外 ABI。 */
import type {
  ContentDigest, DomainPackageManifest, ElementDefinition, FunctionContract,
} from '@kaicreator/domain-harness-contracts';

export interface LoadedElement {
  readonly def: ElementDefinition;
  readonly namespace: string;
  readonly key: string;
  readonly definitionDigest: ContentDigest;
  readonly owner: DomainPackageManifest;
  readonly visibility: 'public' | 'private';
}

export interface ResolvedFunction {
  readonly element: LoadedElement;
  readonly fn: FunctionContract;
  readonly owner: DomainPackageManifest;
}
