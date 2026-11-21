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

/** 内容类型是可扩展标识；未知必填类型由 BUILD 拒绝，可选未知类型必须被显式排除。 */
export type ContentKind = CoreContentKind | `dh-ext.${string}`;

export function isUnknownContentKind(kind: string): boolean {
  return !(CORE_CONTENT_KINDS as readonly string[]).includes(kind) && !kind.startsWith('dh-ext.');
}


/** Schema 文件的绝对身份由所属 Package、相对路径和内容摘要共同确定。 */
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

/** 内容块必须在内联值与资源引用中二选一，且每个块都有独立 Schema 和适用条件。 */
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

/** Function 只声明语义、输入输出和 Effect 意图；具体实现由 BUILD 按 Target 选定。 */
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

/** Element 表达一项内聚领域职责，允许零个或多个公开 Function，不建立封闭的子类型层级。 */
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

/** Domain 的语义关系可以成环；真正影响构建顺序的依赖关系必须无环。 */
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
