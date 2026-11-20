/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
import type { ContentDigest, JsonValue, SemVer } from './base.js';
import type {
  DH_DOMAIN_SCHEMA_VERSION,
  DH_ELEMENT_SCHEMA_VERSION,
} from './schema-versions.js';


export const CORE_CONTENT_KINDS = [
  'semantic-model',
  'knowledge',
  'rule',
  'constraint',
  'workflow-definition',
  'state-model',
  'structured-data',
  'interaction',
  'document',
  'validation',
] as const;

export type CoreContentKind = (typeof CORE_CONTENT_KINDS)[number];

export type ContentKind = CoreContentKind | `dh-ext.${string}`;

export function isUnknownContentKind(kind: string): boolean {
  return !(CORE_CONTENT_KINDS as readonly string[]).includes(kind) && !kind.startsWith('dh-ext.');
}


export interface SchemaResourceRef {
  readonly packageId: string;
  readonly path: string;
  readonly digest: ContentDigest;
}

export type SchemaRef = { readonly inline: JsonValue } | SchemaResourceRef;

export interface ResourceRef {
  readonly packageId: string;
  readonly path: string;
  readonly digest: ContentDigest;
}

export interface ApplicabilityRule {
  readonly targets?: readonly string[];
  readonly when?: JsonValue;
}

export interface ProvenanceRef {
  readonly source?: string;
  readonly refs?: readonly ResourceRef[];
}

export interface ContentBlock {
  readonly id: string;
  readonly contentKind: ContentKind;
  readonly schemaRef: SchemaRef;
  readonly required: boolean;
  readonly value?: JsonValue;
  readonly ref?: ResourceRef;
  readonly applicability?: ApplicabilityRule;
  readonly provenance?: ProvenanceRef;
}


export type FunctionOutcomeKind = 'SUCCEEDED' | 'UNKNOWN' | 'FAILED';

export type EffectIntent = 'none' | 'external' | 'state';

export interface FunctionContract {
  readonly id: string;
  readonly contractVersion: string;
  readonly description?: string;
  readonly inputSchemaRef: SchemaRef;
  readonly outputSchemaRef: SchemaRef;
  readonly outcomes: readonly FunctionOutcomeKind[];
  readonly effects: EffectIntent;
  readonly applicability?: ApplicabilityRule;
}


export interface ElementDependency {
  readonly element: string;
  readonly version: string;
  readonly functions?: readonly string[];
}

export interface ElementDefinition {
  readonly kind: 'Element';
  readonly schemaVersion: typeof DH_ELEMENT_SCHEMA_VERSION;
  readonly id: string;
  readonly version: SemVer;
  readonly description: string;
  readonly roles?: readonly string[];
  readonly content: readonly ContentBlock[];
  readonly functions: readonly FunctionContract[];
  readonly dependencies?: readonly ElementDependency[];
  readonly validation?: { readonly ref: ResourceRef };
}


export interface SemanticEdge {
  readonly relation: string;
  readonly from: string;
  readonly to: string;
  readonly version?: string;
}

export interface DomainDefinition {
  readonly kind: 'Domain';
  readonly schemaVersion: typeof DH_DOMAIN_SCHEMA_VERSION;
  readonly id: string;
  readonly version: SemVer;
  readonly description?: string;
  readonly elements: readonly ElementDefinition[];
  readonly semanticRelations?: readonly SemanticEdge[];
  readonly constraints?: readonly JsonValue[];
}
