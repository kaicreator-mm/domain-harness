import { createHash } from 'node:crypto';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type Sha256Digest = string;

export type CompiledIntelligenceArtifactKind =
  | 'rule'
  | 'knowledge'
  | 'skill'
  | 'tool'
  | 'output-schema'
  | 'workflow'
  | 'promoted-subworkflow'
  | 'harness-config';

export interface DomainFactsOwnership {
  readonly owner: 'domain-application';
  readonly authority: 'authoritative-runtime-facts';
  readonly mutableOutsidePackage: true;
}

export interface CompiledDomainIntelligenceOwnership {
  readonly owner: 'domain-project';
  readonly producer: 'domain-harness-compiler';
  readonly runtimeAuthority: 'immutable-consumer-only';
}

/**
 * Stable logical name + optional human lifecycle version + semantic content identity.
 * contentDigest MUST exclude source paths, registration order, audit timestamps, and
 * other representation-only metadata.
 */
export interface CompiledArtifactIdentity {
  readonly kind: CompiledIntelligenceArtifactKind;
  readonly artifactId: string;
  readonly version?: string;
  readonly contentDigest: Sha256Digest;
}

/**
 * v0.3 identity adds a semantic content digest without replacing v0.2 packageId.
 * packageId remains the exact target-compiled package activation/recovery pin.
 * contentDigest identifies canonical Compiled Domain Intelligence content.
 */
export interface DomainIntelligencePackageIdentity {
  readonly domainId: string;
  readonly version: string;
  readonly packageId: string;
  readonly contentDigest: Sha256Digest;
  readonly formatVersion: string;
  readonly runtimeContractMajor: number;
  readonly executionEngineMajor: number;
  readonly requiredCapabilities: readonly string[];
}

export interface SemanticContextProjectionDescriptor {
  readonly projectionId: string;
  readonly source: 'input' | 'domain-facts' | 'workflow-context';
  /** Deterministic JSON-path-like selectors. A production compiler may use a compiled IR. */
  readonly selectors: readonly string[];
  readonly descriptorDigest: Sha256Digest;
}

export interface ResolvedSemanticContextProjection {
  readonly projectionId: string;
  readonly descriptorDigest: Sha256Digest;
  readonly valueDigest: Sha256Digest;
}

export interface SemanticDependencySet {
  /** Only artifacts that can affect this decision belong here. */
  readonly artifacts: readonly CompiledArtifactIdentity[];
  readonly context: readonly ResolvedSemanticContextProjection[];
}

export interface SemanticInvocationIdentityMaterial {
  readonly namespace: string;
  readonly domainId: string;
  readonly decisionId: string;
  readonly inputDigest: Sha256Digest;
  readonly dependencies: SemanticDependencySet;
}

export interface PromotedSubworkflowSemanticMaterial {
  readonly artifactId: string;
  readonly inputSchema: JsonValue;
  readonly outputSchema: JsonValue;
  readonly applicability: readonly JsonValue[];
  readonly steps: Readonly<Record<string, JsonValue>>;
  readonly edges: readonly JsonValue[];
  readonly allowedTools: readonly CompiledArtifactIdentity[];
  readonly referencedArtifacts: readonly CompiledArtifactIdentity[];
  readonly allowedEvents: readonly string[];
  readonly bounds: JsonValue;
}

export interface PackageContentMaterial {
  readonly domainId: string;
  readonly artifacts: readonly CompiledArtifactIdentity[];
  readonly semanticContextProjections: readonly SemanticContextProjectionDescriptor[];
}

function normalize(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number is not canonical JSON');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) throw new Error(`undefined at ${key} is not canonical JSON`);
      output[key] = normalize(child);
    }
    return output;
  }
  throw new Error(`unsupported canonical JSON type: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256Canonical(value: unknown): Sha256Digest {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function artifactIdentity(
  kind: CompiledIntelligenceArtifactKind,
  artifactId: string,
  semanticMaterial: JsonValue,
  version?: string,
): CompiledArtifactIdentity {
  return {
    kind,
    artifactId,
    ...(version === undefined ? {} : { version }),
    contentDigest: sha256Canonical({ kind, artifactId, semanticMaterial }),
  };
}

function sortedArtifactIdentityMaterial(artifacts: readonly CompiledArtifactIdentity[]): JsonValue[] {
  return artifacts
    .map(({ kind, artifactId, contentDigest }) => ({ kind, artifactId, contentDigest }))
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}

export function packageContentDigest(material: PackageContentMaterial): Sha256Digest {
  return sha256Canonical({
    domainId: material.domainId,
    artifacts: sortedArtifactIdentityMaterial(material.artifacts),
    semanticContextProjections: [...material.semanticContextProjections]
      .map(({ projectionId, source, descriptorDigest }) => ({ projectionId, source, descriptorDigest }))
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
  });
}

/**
 * Exact semantic identity deliberately excludes packageId/version/contentDigest as a
 * whole-package invalidator. The execution remains pinned to packageId, but semantic
 * reuse is invalidated only by the selected dependency identities below.
 */
export function semanticInvocationDigest(material: SemanticInvocationIdentityMaterial): Sha256Digest {
  return sha256Canonical({
    namespace: material.namespace,
    domainId: material.domainId,
    decisionId: material.decisionId,
    inputDigest: material.inputDigest,
    artifacts: sortedArtifactIdentityMaterial(material.dependencies.artifacts),
    context: [...material.dependencies.context]
      .map(({ projectionId, descriptorDigest, valueDigest }) => ({ projectionId, descriptorDigest, valueDigest }))
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
  });
}

/** Audit/provenance metadata is intentionally not accepted here. */
export function promotedSubworkflowContentDigest(material: PromotedSubworkflowSemanticMaterial): Sha256Digest {
  return sha256Canonical({
    artifactId: material.artifactId,
    inputSchema: material.inputSchema,
    outputSchema: material.outputSchema,
    applicability: [...material.applicability].map(normalize).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
    steps: material.steps,
    edges: [...material.edges].map(normalize).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
    allowedTools: sortedArtifactIdentityMaterial(material.allowedTools),
    referencedArtifacts: sortedArtifactIdentityMaterial(material.referencedArtifacts),
    allowedEvents: [...material.allowedEvents].sort(),
    bounds: material.bounds,
  });
}

export interface ActivationCompatibilityPolicy {
  readonly formatVersion: string;
  readonly runtimeContractMajor: number;
  readonly executionEngineMajor: number;
  readonly hostCapabilities: readonly string[];
}

export type ActivationCompatibilityResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly string[] };

export function checkActivationCompatibility(
  pkg: DomainIntelligencePackageIdentity,
  policy: ActivationCompatibilityPolicy,
): ActivationCompatibilityResult {
  const reasons: string[] = [];
  if (pkg.formatVersion !== policy.formatVersion) reasons.push('formatVersion');
  if (pkg.runtimeContractMajor !== policy.runtimeContractMajor) reasons.push('runtimeContractMajor');
  if (pkg.executionEngineMajor !== policy.executionEngineMajor) reasons.push('executionEngineMajor');
  const available = new Set(policy.hostCapabilities);
  for (const capability of pkg.requiredCapabilities) {
    if (!available.has(capability)) reasons.push(`capability:${capability}`);
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons: [...new Set(reasons)].sort() };
}

export function resolveSelectedContext(
  descriptor: SemanticContextProjectionDescriptor,
  source: Readonly<Record<string, JsonValue>>,
): ResolvedSemanticContextProjection {
  const selected: Record<string, JsonValue> = {};
  for (const selector of [...descriptor.selectors].sort()) {
    if (!Object.prototype.hasOwnProperty.call(source, selector)) {
      throw new Error(`missing declared semantic context selector: ${selector}`);
    }
    selected[selector] = source[selector] as JsonValue;
  }
  return {
    projectionId: descriptor.projectionId,
    descriptorDigest: descriptor.descriptorDigest,
    valueDigest: sha256Canonical(selected),
  };
}
