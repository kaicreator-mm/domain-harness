import type {
  CompiledSemanticDecisionDescriptor,
  JsonSchema,
  SemanticDecisionCachePolicy,
} from '@kaicreator/domain-harness/v2';
import { DOMAIN_HARNESS_JSON_SCHEMA_V1, DomainHarnessJsonSchemaV1Validator } from '@kaicreator/domain-harness/v2';
import type {
  LoadedRawDomainPackage,
  RawProjectionDefinition,
  RawToolDefinition,
} from '../raw/types.js';
import type { BusinessSourceCompileEntry } from '../package/business-sources.js';
import { sha256Canonical } from '../package/canonical.js';

export class SemanticDecisionCompileError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`semantic decision declaration compilation failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'SemanticDecisionCompileError';
    this.issues = [...issues];
  }
}

const READ_ONLY_TOOL_EFFECT = 'none' as const;

/**
 * v0.6 T001 (issue #497, frozen L2 A2/A7): compile authoring-form Semantic
 * Decision Declarations into the portable first-class compiled descriptors.
 *
 * All external references resolve exclusively through existing authority:
 * - `queryCapabilities` must be compiled Tools with pure read semantics
 *   (`effect: 'none'`); mutation/effect exposure to semantic reasoning is a
 *   compile failure, never a downgrade;
 * - `requiredProjections` / `requiredRevisionSources` must reference the
 *   package's declared projections / Business Sources (existing resolver
 *   currentness vocabulary);
 * - the structured result schema is normalized under the existing
 *   DOMAIN_HARNESS_JSON_SCHEMA_V1 schema contract machinery.
 *
 * The compiled descriptor is canonical: arrays sorted and deduplicated,
 * cache policy always materialized, and `declarationDigest` carried as
 * content identity for the existing resolver/cache/promotion machinery.
 */
export function compileSemanticDecisions(input: {
  raw: LoadedRawDomainPackage;
  tools: readonly RawToolDefinition[];
  projections: readonly RawProjectionDefinition[];
  businessSources: readonly BusinessSourceCompileEntry[];
}): CompiledSemanticDecisionDescriptor[] {
  const declarations = [...(input.raw.semanticDecisions?.values() ?? [])].sort((a, b) =>
    a.decisionId.localeCompare(b.decisionId),
  );
  if (declarations.length === 0) return [];

  const issues: string[] = [];
  const projectionIds = new Set(input.projections.map((projection) => projection.projectionId));
  const businessSources = new Set(input.businessSources.map((entry) => entry.source));
  const readOnlyTools = new Map(
    input.tools
      .filter((tool) => tool.effect === READ_ONLY_TOOL_EFFECT)
      .map((tool) => [tool.toolId, tool]),
  );

  const validator = new DomainHarnessJsonSchemaV1Validator();
  const descriptors: CompiledSemanticDecisionDescriptor[] = [];
  for (const declaration of declarations) {
    const label = `semantic decision '${declaration.decisionId}'`;

    // Structured result schema authority through the existing schema contract.
    const loadedSchema = input.raw.schemas.get(`decision:${declaration.decisionId}:result:${declaration.resultSchemaPath}`);
    if (!loadedSchema) {
      issues.push(`${label}: structured result schema '${declaration.resultSchemaPath}' was not loaded into the package schema set`);
      continue;
    }
    let resultSchema: JsonSchema;
    try {
      resultSchema = validator.normalizeSchema(loadedSchema);
    } catch (error) {
      issues.push(`${label}: result schema is not a valid ${DOMAIN_HARNESS_JSON_SCHEMA_V1} schema: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    // Query/read-only capability boundary: mutation/effect tools are rejected.
    for (const capabilityId of declaration.queryCapabilities) {
      const tool = input.tools.find((candidate) => candidate.toolId === capabilityId);
      if (!tool) {
        issues.push(`${label}: query capability '${capabilityId}' is not a declared Tool`);
      } else if (tool.effect !== READ_ONLY_TOOL_EFFECT) {
        issues.push(
          `${label}: query capability '${capabilityId}' declares mutation/effect semantics '${tool.effect}'; semantic reasoning is bounded to query/read-only capabilities (effect '${READ_ONLY_TOOL_EFFECT}')`,
        );
      } else if (!readOnlyTools.has(capabilityId)) {
        // Defensive: unreachable when the two checks above pass.
        issues.push(`${label}: query capability '${capabilityId}' is not a read-only Tool`);
      }
    }

    for (const projectionId of declaration.requiredProjections ?? []) {
      if (!projectionIds.has(projectionId)) {
        issues.push(`${label}: required projection '${projectionId}' is not declared in this package`);
      }
    }
    for (const source of declaration.requiredRevisionSources ?? []) {
      if (!businessSources.has(source)) {
        issues.push(`${label}: required revision source '${source}' is not a declared Business Source in this package`);
      }
    }

    const cachePolicy: SemanticDecisionCachePolicy = declaration.cachePolicy ?? { mode: 'eligible' };
    const body = {
      decisionId: declaration.decisionId,
      inputSelection: declaration.inputSelection,
      resultSchema,
      allowedOutcomes: [...declaration.allowedOutcomes].sort(),
      allowedEventTypes: [...declaration.allowedEventTypes].sort(),
      queryCapabilityIds: [...declaration.queryCapabilities].sort(),
      dependencyMaterial: {
        requiredProjectionIds: [...(declaration.requiredProjections ?? [])].sort(),
        requiredRevisionSourceIds: [...(declaration.requiredRevisionSources ?? [])].sort(),
      },
      cachePolicy,
      ...(declaration.promotedReference === undefined ? {} : { promotedReference: declaration.promotedReference }),
      policy: { maxSteps: declaration.policy.maxSteps },
      unavailable: declaration.unavailable,
    };
    const descriptor: CompiledSemanticDecisionDescriptor = Object.freeze({
      ...body,
      declarationDigest: sha256Canonical(body),
    });
    // The digest covers exactly the canonical body; re-derive it from the
    // frozen descriptor so a future field addition can never silently escape
    // the content identity.
    const { declarationDigest: _verified, ...descriptorBody } = descriptor;
    if (sha256Canonical(descriptorBody) !== descriptor.declarationDigest) {
      issues.push(`${label}: internal declaration body normalization error`);
    }
    descriptors.push(descriptor);
  }

  if (issues.length > 0) throw new SemanticDecisionCompileError(issues);
  return descriptors;
}
