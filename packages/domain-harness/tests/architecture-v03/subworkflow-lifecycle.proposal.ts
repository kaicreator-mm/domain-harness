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

/** Exact vocabulary consumed from Issue #205 final contract. */
export interface CompiledArtifactIdentity {
  readonly kind: CompiledIntelligenceArtifactKind;
  readonly artifactId: string;
  readonly version?: string;
  readonly contentDigest: Sha256Digest;
}

/** Exact semantic material consumed from Issue #205 final contract. */
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

export interface SubworkflowCompatibilityContract {
  readonly formatVersion: string;
  readonly runtimeContractMajor: number;
  readonly executionEngineMajor: number;
  readonly requiredCapabilities: readonly string[];
}

export interface CandidateProvenance {
  readonly proposedBy: 'harness-machine' | 'human-author';
  readonly sourceInvocationId?: string;
  readonly evidenceRefs: readonly string[];
  readonly proposedAt: string;
}

export interface WorkflowCandidate {
  readonly kind: 'workflow-candidate-v1';
  readonly candidateId: string;
  readonly domainId: string;
  readonly semantic: PromotedSubworkflowSemanticMaterial;
  readonly compatibility: SubworkflowCompatibilityContract;
  readonly provenance: CandidateProvenance;
}

export interface ValidationEvidence {
  readonly validatorPolicyId: string;
  readonly validatorPolicyDigest: Sha256Digest;
  readonly validatedAt: string;
  readonly evidenceRefs: readonly string[];
}

export interface ValidatedWorkflowCandidate {
  readonly kind: 'validated-workflow-candidate-v1';
  readonly candidateId: string;
  readonly domainId: string;
  readonly semantic: PromotedSubworkflowSemanticMaterial;
  readonly compatibility: SubworkflowCompatibilityContract;
  readonly contentDigest: Sha256Digest;
  readonly candidateProvenance: CandidateProvenance;
  readonly validation: ValidationEvidence;
}

export interface PromotionAuthority {
  readonly authority: 'human-operator';
  readonly principalId: string;
}

export interface PromotionCommand {
  readonly version: string;
  readonly approvedBy: PromotionAuthority;
  readonly evidenceRefs: readonly string[];
  readonly promotedAt: string;
}

export interface PromotionAudit {
  readonly approvedBy: PromotionAuthority;
  readonly evidenceRefs: readonly string[];
  readonly promotedAt: string;
  readonly sourceCandidateId: string;
  readonly validationPolicyId: string;
  readonly validationPolicyDigest: Sha256Digest;
}

export interface PromotedSubworkflowArtifact {
  readonly kind: 'promoted-subworkflow-artifact-v1';
  readonly domainId: string;
  readonly identity: CompiledArtifactIdentity & { readonly kind: 'promoted-subworkflow'; readonly version: string };
  readonly semantic: PromotedSubworkflowSemanticMaterial;
  readonly compatibility: SubworkflowCompatibilityContract;
  readonly audit: PromotionAudit;
}

export interface RevocationRecord {
  readonly domainId: string;
  readonly artifactId: string;
  readonly contentDigest: Sha256Digest;
  readonly version: string;
  readonly revokedBy: PromotionAuthority;
  readonly revokedAt: string;
  readonly reason: string;
  readonly supersededByContentDigest?: Sha256Digest;
}

export type SubworkflowSelection =
  | { readonly kind: 'exact-digest'; readonly artifactId: string; readonly contentDigest: Sha256Digest }
  | { readonly kind: 'exact-version'; readonly artifactId: string; readonly version: string }
  | { readonly kind: 'selection-alias'; readonly artifactId: string; readonly alias: string };

export interface SelectionAliasRecord {
  readonly domainId: string;
  readonly artifactId: string;
  readonly alias: string;
  readonly contentDigest: Sha256Digest;
  readonly selectedBy: PromotionAuthority;
  readonly selectedAt: string;
  readonly evidenceRefs: readonly string[];
}

export interface AvailableToolContract {
  readonly identity: CompiledArtifactIdentity & { readonly kind: 'tool' };
  readonly capability: 'query' | 'mutation';
}

export interface RuntimeCompatibilityContext {
  readonly formatVersion: string;
  readonly runtimeContractMajor: number;
  readonly executionEngineMajor: number;
  readonly hostCapabilities: readonly string[];
  readonly availableArtifacts: readonly CompiledArtifactIdentity[];
  readonly availableTools: readonly AvailableToolContract[];
}

export interface ApplicabilityContext {
  readonly input: Readonly<Record<string, JsonValue>>;
  readonly domainFacts: Readonly<Record<string, JsonValue>>;
  readonly workflowContext: Readonly<Record<string, JsonValue>>;
}

export interface CandidateValidationPolicy {
  readonly policyId: string;
  readonly policyDigest: Sha256Digest;
  readonly allowedEvents: readonly string[];
  readonly allowedTools: readonly AvailableToolContract[];
  readonly maxSteps: number;
  readonly maxReasonedCalls: number;
}

export interface XStateChildWorkflowPlan {
  readonly runtime: 'xstate-child';
  readonly machineId: string;
  readonly artifactIdentity: CompiledArtifactIdentity;
  readonly initial: 'applicability';
  readonly applicability: readonly JsonValue[];
  readonly startStep: string;
  readonly states: readonly {
    readonly stateId: string;
    readonly step: JsonValue;
    readonly outgoing: readonly JsonValue[];
  }[];
  readonly finalEvents: readonly string[];
  readonly toolBindings: readonly {
    readonly artifactId: string;
    readonly contentDigest: Sha256Digest;
    readonly authority: 'query-port';
  }[];
  readonly reasonedStepAuthority: 'harness-machine-only';
  readonly mutationAuthority: 'domain-harness-durable-effect-only';
}

export type RegistryResolution =
  | { readonly ok: true; readonly artifact: PromotedSubworkflowArtifact; readonly selection: SubworkflowSelection }
  | {
      readonly ok: false;
      readonly reason:
        | 'not-found'
        | 'ambiguous-version'
        | 'revoked'
        | 'incompatible'
        | 'not-applicable'
        | 'invalid-applicability-context';
      readonly details: readonly string[];
    };

const forbiddenAuthorityFields = new Set([
  'actorRef',
  'actorReference',
  'apiKey',
  'chainOfThought',
  'code',
  'eval',
  'modelState',
  'privateReasoning',
  'prompt',
  'provider',
  'providerSecret',
  'providerState',
  'reasoning',
  'script',
  'sourceCode',
]);

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

function sortedArtifactIdentityMaterial(artifacts: readonly CompiledArtifactIdentity[]): JsonValue[] {
  return artifacts
    .map(({ kind, artifactId, contentDigest }) => ({ kind, artifactId, contentDigest }))
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}

/**
 * This is intentionally behavior-identical to the #205 final helper. Audit/provenance,
 * source paths, promoter identity, timestamps and human evidence references are excluded.
 */
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

function asRecord(value: JsonValue, label: string): Record<string, JsonValue> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label} must be an object`);
  return value as Record<string, JsonValue>;
}

function asString(value: JsonValue | undefined, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function asFiniteInteger(value: JsonValue | undefined, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function assertNoForbiddenFields(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenFields(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenAuthorityFields.has(key)) throw new Error(`forbidden execution-authority field ${path}.${key}`);
    assertNoForbiddenFields(child, `${path}.${key}`);
  }
}

function parseBounds(material: PromotedSubworkflowSemanticMaterial): {
  startStep: string;
  maxSteps: number;
  maxReasonedCalls: number;
} {
  const bounds = asRecord(material.bounds, 'bounds');
  return {
    startStep: asString(bounds.startStep, 'bounds.startStep'),
    maxSteps: asFiniteInteger(bounds.maxSteps, 'bounds.maxSteps'),
    maxReasonedCalls: asFiniteInteger(bounds.maxReasonedCalls, 'bounds.maxReasonedCalls'),
  };
}

function parseEdge(edge: JsonValue): { from: string; to: string; when: string } {
  const record = asRecord(edge, 'edge');
  return {
    from: asString(record.from, 'edge.from'),
    to: asString(record.to, 'edge.to'),
    when: asString(record.when, 'edge.when'),
  };
}

function exactIdentityKey(identity: Pick<CompiledArtifactIdentity, 'kind' | 'artifactId' | 'contentDigest'>): string {
  return `${identity.kind}:${identity.artifactId}:${identity.contentDigest}`;
}

function toolIdentityForStep(step: Record<string, JsonValue>): { artifactId: string; contentDigest: string } | null {
  if (step.kind !== 'query') return null;
  return {
    artifactId: asString(step.toolArtifactId, 'query.toolArtifactId'),
    contentDigest: asString(step.toolContentDigest, 'query.toolContentDigest'),
  };
}

function validateGraph(material: PromotedSubworkflowSemanticMaterial): void {
  const bounds = parseBounds(material);
  const stepIds = new Set(Object.keys(material.steps));
  if (stepIds.size === 0) throw new Error('candidate must contain at least one step');
  if (!stepIds.has(bounds.startStep)) throw new Error('bounds.startStep does not exist');
  if (stepIds.size > bounds.maxSteps) throw new Error('candidate exceeds maxSteps bound');

  const edges = material.edges.map(parseEdge);
  for (const edge of edges) {
    if (!stepIds.has(edge.from) || !stepIds.has(edge.to)) throw new Error(`edge references unknown step ${edge.from}->${edge.to}`);
  }

  const adjacency = new Map<string, string[]>();
  for (const stepId of stepIds) adjacency.set(stepId, []);
  for (const edge of edges) adjacency.get(edge.from)?.push(edge.to);

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (stepId: string): void => {
    if (visiting.has(stepId)) throw new Error('control-flow cycle is not supported in v0.3 promoted subworkflow IR');
    if (visited.has(stepId)) return;
    visiting.add(stepId);
    for (const target of adjacency.get(stepId) ?? []) visit(target);
    visiting.delete(stepId);
    visited.add(stepId);
  };
  visit(bounds.startStep);
  if (visited.size !== stepIds.size) throw new Error('candidate contains unreachable step');

  let reasonedCalls = 0;
  let emitCount = 0;
  for (const [stepId, rawStep] of Object.entries(material.steps)) {
    const step = asRecord(rawStep, `steps.${stepId}`);
    const kind = asString(step.kind, `steps.${stepId}.kind`);
    const outgoing = edges.filter((edge) => edge.from === stepId);
    if (kind === 'query') {
      if (outgoing.length !== 1 || outgoing[0]?.when !== 'done') throw new Error(`query step ${stepId} requires one done edge`);
      toolIdentityForStep(step);
    } else if (kind === 'rule') {
      const labels = outgoing.map((edge) => edge.when).sort();
      if (labels.length !== 2 || labels[0] !== 'false' || labels[1] !== 'true') {
        throw new Error(`rule step ${stepId} requires true/false edges`);
      }
    } else if (kind === 'reasoned') {
      reasonedCalls += 1;
      const outcomes = step.outcomes;
      if (!Array.isArray(outcomes) || outcomes.length === 0 || outcomes.some((value) => typeof value !== 'string')) {
        throw new Error(`reasoned step ${stepId} requires finite outcomes`);
      }
      const declared = [...outcomes].map(String).sort();
      const labels = outgoing.map((edge) => edge.when).sort();
      if (canonicalJson(labels) !== canonicalJson(declared)) throw new Error(`reasoned step ${stepId} edges must match finite outcomes`);
    } else if (kind === 'emit') {
      emitCount += 1;
      if (outgoing.length !== 0) throw new Error(`emit step ${stepId} must be terminal`);
      asString(step.eventType, `steps.${stepId}.eventType`);
    } else {
      throw new Error(`unsupported workflow step kind: ${kind}`);
    }
  }
  if (emitCount === 0) throw new Error('candidate requires at least one terminal emit step');
  if (reasonedCalls > bounds.maxReasonedCalls) throw new Error('candidate exceeds maxReasonedCalls bound');
}

function validateTools(material: PromotedSubworkflowSemanticMaterial, policy: CandidateValidationPolicy): void {
  const semanticAllowlist = new Map(material.allowedTools.map((tool) => [exactIdentityKey(tool), tool]));
  const policyTools = new Map(policy.allowedTools.map((tool) => [exactIdentityKey(tool.identity), tool]));

  for (const tool of material.allowedTools) {
    if (tool.kind !== 'tool') throw new Error(`allowedTools contains non-tool artifact ${tool.artifactId}`);
    const available = policyTools.get(exactIdentityKey(tool));
    if (available === undefined) throw new Error(`tool is not allowlisted by validator policy: ${tool.artifactId}`);
    if (available.capability !== 'query') {
      throw new Error(`mutation tool ${tool.artifactId} cannot execute inside promoted solving workflow`);
    }
  }

  for (const [stepId, rawStep] of Object.entries(material.steps)) {
    const step = asRecord(rawStep, `steps.${stepId}`);
    const tool = toolIdentityForStep(step);
    if (tool === null) continue;
    const matching = [...semanticAllowlist.values()].find(
      (item) => item.artifactId === tool.artifactId && item.contentDigest === tool.contentDigest,
    );
    if (matching === undefined) throw new Error(`query step ${stepId} uses undeclared or digest-mismatched tool`);
  }
}

function validateEvents(material: PromotedSubworkflowSemanticMaterial, policy: CandidateValidationPolicy): void {
  const semanticEvents = new Set(material.allowedEvents);
  const policyEvents = new Set(policy.allowedEvents);
  if (semanticEvents.size !== material.allowedEvents.length) throw new Error('allowedEvents contains duplicates');
  for (const event of semanticEvents) {
    if (!policyEvents.has(event)) throw new Error(`event is not allowed by validator policy: ${event}`);
  }
  for (const [stepId, rawStep] of Object.entries(material.steps)) {
    const step = asRecord(rawStep, `steps.${stepId}`);
    if (step.kind !== 'emit') continue;
    const eventType = asString(step.eventType, `steps.${stepId}.eventType`);
    if (!semanticEvents.has(eventType)) throw new Error(`emit step ${stepId} uses undeclared event ${eventType}`);
  }
}

function validateApplicabilityShape(material: PromotedSubworkflowSemanticMaterial): void {
  for (const [index, rawClause] of material.applicability.entries()) {
    const clause = asRecord(rawClause, `applicability[${index}]`);
    const source = asString(clause.source, `applicability[${index}].source`);
    if (!['input', 'domain-facts', 'workflow-context'].includes(source)) throw new Error(`unsupported applicability source ${source}`);
    asString(clause.selector, `applicability[${index}].selector`);
    const op = asString(clause.op, `applicability[${index}].op`);
    if (!['eq', 'exists', 'in'].includes(op)) throw new Error(`unsupported applicability operator ${op}`);
    if (op === 'eq' && !Object.prototype.hasOwnProperty.call(clause, 'value')) throw new Error('eq applicability requires value');
    if (op === 'in' && !Array.isArray(clause.values)) throw new Error('in applicability requires values array');
  }
}

/** Deterministic, fail-closed Candidate -> Validated boundary. */
export function validateWorkflowCandidate(
  candidate: WorkflowCandidate,
  policy: CandidateValidationPolicy,
  evidence: Omit<ValidationEvidence, 'validatorPolicyId' | 'validatorPolicyDigest'>,
): ValidatedWorkflowCandidate {
  if (candidate.kind !== 'workflow-candidate-v1') throw new Error('unsupported candidate kind');
  assertNoForbiddenFields(candidate.semantic);
  normalize(candidate.semantic);
  if (candidate.semantic.artifactId.length === 0) throw new Error('semantic artifactId is required');
  if (candidate.compatibility.requiredCapabilities.some((item) => item.length === 0)) throw new Error('empty required capability');
  validateApplicabilityShape(candidate.semantic);
  validateGraph(candidate.semantic);
  validateTools(candidate.semantic, policy);
  validateEvents(candidate.semantic, policy);
  const bounds = parseBounds(candidate.semantic);
  if (bounds.maxSteps > policy.maxSteps) throw new Error('candidate maxSteps exceeds validator policy');
  if (bounds.maxReasonedCalls > policy.maxReasonedCalls) throw new Error('candidate maxReasonedCalls exceeds validator policy');

  return {
    kind: 'validated-workflow-candidate-v1',
    candidateId: candidate.candidateId,
    domainId: candidate.domainId,
    semantic: candidate.semantic,
    compatibility: candidate.compatibility,
    contentDigest: promotedSubworkflowContentDigest(candidate.semantic),
    candidateProvenance: candidate.provenance,
    validation: {
      ...evidence,
      validatorPolicyId: policy.policyId,
      validatorPolicyDigest: policy.policyDigest,
    },
  };
}

/** Explicit human authority is required; Harness/LLM output cannot construct a valid promotion command. */
export function promoteValidatedCandidate(
  validated: ValidatedWorkflowCandidate,
  command: PromotionCommand,
): PromotedSubworkflowArtifact {
  if (validated.kind !== 'validated-workflow-candidate-v1') throw new Error('candidate must be validated before promotion');
  if (command.approvedBy.authority !== 'human-operator' || command.approvedBy.principalId.length === 0) {
    throw new Error('promotion requires explicit human-operator authority');
  }
  if (command.version.length === 0) throw new Error('promotion version is required');
  const recomputed = promotedSubworkflowContentDigest(validated.semantic);
  if (recomputed !== validated.contentDigest) throw new Error('validated semantic content changed before promotion');

  return {
    kind: 'promoted-subworkflow-artifact-v1',
    domainId: validated.domainId,
    identity: {
      kind: 'promoted-subworkflow',
      artifactId: validated.semantic.artifactId,
      version: command.version,
      contentDigest: validated.contentDigest,
    },
    semantic: validated.semantic,
    compatibility: validated.compatibility,
    audit: {
      approvedBy: command.approvedBy,
      evidenceRefs: command.evidenceRefs,
      promotedAt: command.promotedAt,
      sourceCandidateId: validated.candidateId,
      validationPolicyId: validated.validation.validatorPolicyId,
      validationPolicyDigest: validated.validation.validatorPolicyDigest,
    },
  };
}

function resolveSelector(source: Readonly<Record<string, JsonValue>>, selector: string): JsonValue | undefined {
  if (!Object.prototype.hasOwnProperty.call(source, selector)) return undefined;
  return source[selector];
}

export function evaluateApplicability(
  material: PromotedSubworkflowSemanticMaterial,
  context: ApplicabilityContext,
): { ok: true } | { ok: false; invalidContext: boolean; reason: string } {
  for (const [index, rawClause] of material.applicability.entries()) {
    const clause = asRecord(rawClause, `applicability[${index}]`);
    const sourceName = asString(clause.source, `applicability[${index}].source`);
    const selector = asString(clause.selector, `applicability[${index}].selector`);
    const op = asString(clause.op, `applicability[${index}].op`);
    const source = sourceName === 'input' ? context.input : sourceName === 'domain-facts' ? context.domainFacts : context.workflowContext;
    const actual = resolveSelector(source, selector);
    if (actual === undefined) return { ok: false, invalidContext: true, reason: `missing applicability selector ${sourceName}:${selector}` };
    if (op === 'exists') continue;
    if (op === 'eq' && canonicalJson(actual) !== canonicalJson(clause.value)) {
      return { ok: false, invalidContext: false, reason: `applicability eq failed at ${sourceName}:${selector}` };
    }
    if (op === 'in') {
      const values = clause.values;
      if (!Array.isArray(values) || !values.some((value) => canonicalJson(value) === canonicalJson(actual))) {
        return { ok: false, invalidContext: false, reason: `applicability in failed at ${sourceName}:${selector}` };
      }
    }
  }
  return { ok: true };
}

export function checkSubworkflowCompatibility(
  artifact: PromotedSubworkflowArtifact,
  runtime: RuntimeCompatibilityContext,
): readonly string[] {
  const reasons: string[] = [];
  if (artifact.compatibility.formatVersion !== runtime.formatVersion) reasons.push('formatVersion');
  if (artifact.compatibility.runtimeContractMajor !== runtime.runtimeContractMajor) reasons.push('runtimeContractMajor');
  if (artifact.compatibility.executionEngineMajor !== runtime.executionEngineMajor) reasons.push('executionEngineMajor');
  const hostCapabilities = new Set(runtime.hostCapabilities);
  for (const capability of artifact.compatibility.requiredCapabilities) {
    if (!hostCapabilities.has(capability)) reasons.push(`capability:${capability}`);
  }

  const availableArtifacts = new Set(runtime.availableArtifacts.map(exactIdentityKey));
  for (const dependency of artifact.semantic.referencedArtifacts) {
    if (!availableArtifacts.has(exactIdentityKey(dependency))) reasons.push(`artifact:${dependency.artifactId}:${dependency.contentDigest}`);
  }
  const availableTools = new Map(runtime.availableTools.map((tool) => [exactIdentityKey(tool.identity), tool]));
  for (const tool of artifact.semantic.allowedTools) {
    const runtimeTool = availableTools.get(exactIdentityKey(tool));
    if (runtimeTool === undefined) reasons.push(`tool:${tool.artifactId}:${tool.contentDigest}`);
    else if (runtimeTool.capability !== 'query') reasons.push(`tool-capability:${tool.artifactId}:${runtimeTool.capability}`);
  }
  return [...new Set(reasons)].sort();
}

export class InMemoryPromotedSubworkflowRegistry {
  private readonly artifacts: PromotedSubworkflowArtifact[] = [];
  private readonly revocations: RevocationRecord[] = [];
  private readonly aliases: SelectionAliasRecord[] = [];

  promote(artifact: PromotedSubworkflowArtifact): void {
    if (artifact.kind !== 'promoted-subworkflow-artifact-v1') throw new Error('registry accepts promoted artifacts only');
    const recomputed = promotedSubworkflowContentDigest(artifact.semantic);
    if (recomputed !== artifact.identity.contentDigest) throw new Error('promoted artifact digest mismatch');
    const sameVersion = this.artifacts.find(
      (item) => item.domainId === artifact.domainId && item.identity.artifactId === artifact.identity.artifactId && item.identity.version === artifact.identity.version,
    );
    if (sameVersion !== undefined && sameVersion.identity.contentDigest !== artifact.identity.contentDigest) {
      throw new Error('version already names different semantic content');
    }
    const exact = this.artifacts.find(
      (item) => item.domainId === artifact.domainId && item.identity.artifactId === artifact.identity.artifactId && item.identity.contentDigest === artifact.identity.contentDigest,
    );
    if (exact === undefined) this.artifacts.push(artifact);
  }

  setAlias(record: SelectionAliasRecord): void {
    if (record.selectedBy.authority !== 'human-operator') throw new Error('selection alias requires human authority');
    const target = this.artifacts.find(
      (item) => item.domainId === record.domainId && item.identity.artifactId === record.artifactId && item.identity.contentDigest === record.contentDigest,
    );
    if (target === undefined) throw new Error('selection alias target does not exist');
    if (this.isRevoked(target)) throw new Error('selection alias cannot target revoked artifact');
    const existingIndex = this.aliases.findIndex(
      (item) => item.domainId === record.domainId && item.artifactId === record.artifactId && item.alias === record.alias,
    );
    if (existingIndex >= 0) this.aliases.splice(existingIndex, 1, record);
    else this.aliases.push(record);
  }

  revoke(record: RevocationRecord): void {
    if (record.revokedBy.authority !== 'human-operator') throw new Error('revocation requires human authority');
    const target = this.artifacts.find(
      (item) => item.domainId === record.domainId && item.identity.artifactId === record.artifactId && item.identity.contentDigest === record.contentDigest,
    );
    if (target === undefined) throw new Error('cannot revoke unknown artifact');
    if (target.identity.version !== record.version) throw new Error('revocation version does not match artifact');
    const duplicate = this.revocations.find(
      (item) => item.domainId === record.domainId && item.artifactId === record.artifactId && item.contentDigest === record.contentDigest,
    );
    if (duplicate === undefined) this.revocations.push(record);
  }

  auditTrail(): { readonly promotions: readonly PromotionAudit[]; readonly revocations: readonly RevocationRecord[]; readonly aliases: readonly SelectionAliasRecord[] } {
    return {
      promotions: this.artifacts.map((artifact) => artifact.audit),
      revocations: [...this.revocations],
      aliases: [...this.aliases],
    };
  }

  resolve(
    domainId: string,
    selection: SubworkflowSelection,
    runtime: RuntimeCompatibilityContext,
    applicability: ApplicabilityContext,
  ): RegistryResolution {
    let matches: PromotedSubworkflowArtifact[] = [];
    if (selection.kind === 'exact-digest') {
      matches = this.artifacts.filter(
        (item) => item.domainId === domainId && item.identity.artifactId === selection.artifactId && item.identity.contentDigest === selection.contentDigest,
      );
    } else if (selection.kind === 'exact-version') {
      matches = this.artifacts.filter(
        (item) => item.domainId === domainId && item.identity.artifactId === selection.artifactId && item.identity.version === selection.version,
      );
      if (matches.length > 1) return { ok: false, reason: 'ambiguous-version', details: ['more than one digest exists for exact version'] };
    } else {
      const alias = this.aliases.find(
        (item) => item.domainId === domainId && item.artifactId === selection.artifactId && item.alias === selection.alias,
      );
      if (alias !== undefined) {
        matches = this.artifacts.filter(
          (item) => item.domainId === domainId && item.identity.artifactId === selection.artifactId && item.identity.contentDigest === alias.contentDigest,
        );
      }
    }
    const artifact = matches[0];
    if (artifact === undefined) return { ok: false, reason: 'not-found', details: [] };
    if (this.isRevoked(artifact)) return { ok: false, reason: 'revoked', details: [artifact.identity.contentDigest] };
    const compatibilityReasons = checkSubworkflowCompatibility(artifact, runtime);
    if (compatibilityReasons.length > 0) return { ok: false, reason: 'incompatible', details: compatibilityReasons };
    const applicabilityResult = evaluateApplicability(artifact.semantic, applicability);
    if (!applicabilityResult.ok) {
      return {
        ok: false,
        reason: applicabilityResult.invalidContext ? 'invalid-applicability-context' : 'not-applicable',
        details: [applicabilityResult.reason],
      };
    }
    return { ok: true, artifact, selection };
  }

  private isRevoked(artifact: PromotedSubworkflowArtifact): boolean {
    return this.revocations.some(
      (item) => item.domainId === artifact.domainId && item.artifactId === artifact.identity.artifactId && item.contentDigest === artifact.identity.contentDigest,
    );
  }
}

/**
 * Production compiler seam proposal. It emits an XState-child plan only from a promoted
 * artifact. It is intentionally not a second workflow runtime or an interpreter.
 */
export function compilePromotedSubworkflow(artifact: PromotedSubworkflowArtifact): XStateChildWorkflowPlan {
  if (artifact.kind !== 'promoted-subworkflow-artifact-v1') throw new Error('compiler accepts promoted artifacts only');
  const recomputed = promotedSubworkflowContentDigest(artifact.semantic);
  if (recomputed !== artifact.identity.contentDigest) throw new Error('promoted artifact content changed after promotion');
  validateGraph(artifact.semantic);
  const bounds = parseBounds(artifact.semantic);
  const edges = artifact.semantic.edges.map(parseEdge);
  const toolBindings = artifact.semantic.allowedTools.map((tool) => ({
    artifactId: tool.artifactId,
    contentDigest: tool.contentDigest,
    authority: 'query-port' as const,
  }));
  return {
    runtime: 'xstate-child',
    machineId: `promoted:${artifact.domainId}:${artifact.identity.artifactId}:${artifact.identity.contentDigest}`,
    artifactIdentity: artifact.identity,
    initial: 'applicability',
    applicability: artifact.semantic.applicability,
    startStep: bounds.startStep,
    states: Object.entries(artifact.semantic.steps)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([stateId, step]) => ({
        stateId,
        step,
        outgoing: edges
          .filter((edge) => edge.from === stateId)
          .map((edge) => normalize(edge))
          .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
      })),
    finalEvents: [...artifact.semantic.allowedEvents].sort(),
    toolBindings,
    reasonedStepAuthority: 'harness-machine-only',
    mutationAuthority: 'domain-harness-durable-effect-only',
  };
}
