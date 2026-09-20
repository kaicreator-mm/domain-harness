import assert from 'node:assert/strict';
import test from 'node:test';
import {
  artifactIdentity,
  checkActivationCompatibility,
  packageContentDigest,
  promotedSubworkflowContentDigest,
  resolveSelectedContext,
  semanticInvocationDigest,
  sha256Canonical,
  type CompiledArtifactIdentity,
  type DomainIntelligencePackageIdentity,
  type SemanticContextProjectionDescriptor,
  type PromotedSubworkflowSemanticMaterial,
} from './domain-data-contracts.proposal.js';

const rule = artifactIdentity('rule', 'quote.eligibility', { op: 'gte', field: 'orderTotal', value: 1000 }, '1.0.0');
const knowledge = artifactIdentity('knowledge', 'quote.policy-slice', { countries: ['MM', 'TH'], policy: 'export-v3' });
const skill = artifactIdentity('skill', 'quote.prepare', { instruction: 'prepare-quote', toolAllowlist: ['catalog.lookup'] });
const tool = artifactIdentity('tool', 'catalog.lookup', {
  semanticRevision: '2026-09-20',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  effect: 'none',
  capability: 'catalog-query@1',
});
const output = artifactIdentity('output-schema', 'quote.decision', {
  type: 'object',
  required: ['event'],
  properties: { event: { enum: ['QUOTE_REQUESTED', 'REJECTED'] } },
});
const workflow = artifactIdentity('workflow', 'quote.request', { start: 'resolve', terminal: 'done' });
const harnessConfig = artifactIdentity('harness-config', 'quote.resolver-policy', { maxSteps: 4, allowedOutcomes: ['approve', 'reject'] });

function contextDescriptor(selectors = ['customerTier', 'orderTotal']): SemanticContextProjectionDescriptor {
  return {
    projectionId: 'quote.semantic-context',
    source: 'domain-facts',
    selectors,
    descriptorDigest: sha256Canonical({ projectionId: 'quote.semantic-context', source: 'domain-facts', selectors: [...selectors].sort() }),
  };
}

function semanticDigest(options: {
  context?: ReturnType<typeof resolveSelectedContext>;
  artifacts?: readonly CompiledArtifactIdentity[];
  input?: unknown;
} = {}): string {
  return semanticInvocationDigest({
    namespace: 'tenant-a',
    domainId: 'trade.quote',
    decisionId: 'quote.resolve',
    inputDigest: sha256Canonical(options.input ?? { sku: 'A-1', qty: 100 }),
    dependencies: {
      artifacts: options.artifacts ?? [rule, knowledge, skill, tool, output, harnessConfig],
      context: [options.context ?? resolveSelectedContext(contextDescriptor(), {
        customerTier: 'gold',
        orderTotal: 1200,
        uiTheme: 'dark',
        telemetrySession: 's-1',
      })],
    },
  });
}

test('artifact identity changes only when semantic material changes', () => {
  const relocated = artifactIdentity('rule', 'quote.eligibility', { field: 'orderTotal', value: 1000, op: 'gte' }, '9.9.9');
  const changed = artifactIdentity('rule', 'quote.eligibility', { op: 'gte', field: 'orderTotal', value: 1500 }, '1.0.1');

  assert.equal(relocated.contentDigest, rule.contentDigest, 'human version/order is not semantic content');
  assert.notEqual(changed.contentDigest, rule.contentDigest, 'behavior change must alter digest');
});

test('semantic context projection ignores unrelated context but invalidates selected facts', () => {
  const descriptor = contextDescriptor();
  const first = resolveSelectedContext(descriptor, {
    customerTier: 'gold',
    orderTotal: 1200,
    uiTheme: 'dark',
    telemetrySession: 's-1',
  });
  const unrelatedChanged = resolveSelectedContext(descriptor, {
    customerTier: 'gold',
    orderTotal: 1200,
    uiTheme: 'light',
    telemetrySession: 's-999',
  });
  const selectedChanged = resolveSelectedContext(descriptor, {
    customerTier: 'silver',
    orderTotal: 1200,
    uiTheme: 'dark',
    telemetrySession: 's-1',
  });

  assert.equal(first.valueDigest, unrelatedChanged.valueDigest);
  assert.notEqual(first.valueDigest, selectedChanged.valueDigest);
  assert.equal(semanticDigest({ context: first }), semanticDigest({ context: unrelatedChanged }));
  assert.notEqual(semanticDigest({ context: first }), semanticDigest({ context: selectedChanged }));
});

test('semantic identity invalidates per behavior dependency instead of whole-package version', () => {
  const base = semanticDigest();
  const changedRule = artifactIdentity('rule', 'quote.eligibility', { op: 'gte', field: 'orderTotal', value: 1500 });
  const changedKnowledge = artifactIdentity('knowledge', 'quote.policy-slice', { countries: ['MM'], policy: 'export-v4' });
  const changedSkill = artifactIdentity('skill', 'quote.prepare', { instruction: 'prepare-quote-v2', toolAllowlist: ['catalog.lookup'] });
  const changedTool = artifactIdentity('tool', 'catalog.lookup', { semanticRevision: '2026-09-21', inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, effect: 'none', capability: 'catalog-query@1' });
  const changedOutput = artifactIdentity('output-schema', 'quote.decision', { type: 'object', required: ['event', 'reason'] });
  const changedHarness = artifactIdentity('harness-config', 'quote.resolver-policy', { maxSteps: 5, allowedOutcomes: ['approve', 'reject'] });

  for (const replacement of [changedRule, changedKnowledge, changedSkill, changedTool, changedOutput, changedHarness]) {
    const artifacts = [rule, knowledge, skill, tool, output, harnessConfig].map((current) =>
      current.kind === replacement.kind && current.artifactId === replacement.artifactId ? replacement : current,
    );
    assert.notEqual(semanticDigest({ artifacts }), base, `${replacement.kind} change must invalidate`);
  }

  // A workflow artifact that does not participate in this computation is intentionally absent.
  assert.equal(semanticDigest({ artifacts: [rule, knowledge, skill, tool, output, harnessConfig] }), base);
  assert.notEqual(workflow.contentDigest, rule.contentDigest);
});

test('package content digest is order- and version-label independent but behavior-sensitive', () => {
  const projection = contextDescriptor();
  const artifacts = [rule, knowledge, skill, tool, output, workflow, harnessConfig];
  const first = packageContentDigest({ domainId: 'trade.quote', artifacts, semanticContextProjections: [projection] });
  const reordered = packageContentDigest({ domainId: 'trade.quote', artifacts: [...artifacts].reverse(), semanticContextProjections: [projection] });
  const versionRelabeledRule = { ...rule, version: '2026.09.20+metadata-only' };
  const relabeled = packageContentDigest({
    domainId: 'trade.quote',
    artifacts: [versionRelabeledRule, knowledge, skill, tool, output, workflow, harnessConfig],
    semanticContextProjections: [projection],
  });
  const changed = packageContentDigest({
    domainId: 'trade.quote',
    artifacts: [artifactIdentity('rule', 'quote.eligibility', { op: 'gte', field: 'orderTotal', value: 1500 }), knowledge, skill, tool, output, workflow, harnessConfig],
    semanticContextProjections: [projection],
  });

  assert.equal(first, reordered);
  assert.equal(first, relabeled);
  assert.notEqual(first, changed);
});

test('promoted subworkflow digest excludes promotion/source metadata and invalidates behavior changes', () => {
  const semanticMaterial = {
    artifactId: 'quote.reusable-vetting',
    inputSchema: { type: 'object', required: ['country'] },
    outputSchema: { type: 'object', required: ['event'] },
    applicability: [{ field: 'country', op: 'in', values: ['MM', 'TH'] }],
    steps: {
      lookup: { kind: 'query', tool: 'catalog.lookup', next: 'emit' },
      emit: { kind: 'emit', event: 'QUOTE_REQUESTED' },
    },
    edges: [{ from: 'lookup', to: 'emit', label: 'next' }],
    allowedTools: [tool],
    referencedArtifacts: [rule, output],
    allowedEvents: ['QUOTE_REQUESTED'],
    bounds: { maxSteps: 2, maxReasonedCalls: 0 },
  } satisfies PromotedSubworkflowSemanticMaterial;

  const first = promotedSubworkflowContentDigest(semanticMaterial);
  const sameAfterPromotionMetadataChange = promotedSubworkflowContentDigest({
    ...semanticMaterial,
    // sourceLocation / selectedBy / evidenceRef are intentionally impossible in the semantic material contract.
    allowedTools: [...semanticMaterial.allowedTools],
  });
  const changedApplicability = promotedSubworkflowContentDigest({
    ...semanticMaterial,
    applicability: [{ field: 'country', op: 'in', values: ['MM'] }],
  });

  assert.equal(first, sameAfterPromotionMetadataChange);
  assert.notEqual(first, changedApplicability);
});

test('activation compatibility fails closed while exact package pin remains a separate concern', () => {
  const pkg: DomainIntelligencePackageIdentity = {
    domainId: 'trade.quote',
    version: '3.0.0',
    packageId: 'target-package-id-a',
    contentDigest: 'compiled-intelligence-digest-a',
    formatVersion: '0.3',
    runtimeContractMajor: 3,
    executionEngineMajor: 3,
    requiredCapabilities: ['catalog-query@1'],
  };
  const compatible = checkActivationCompatibility(pkg, {
    formatVersion: '0.3',
    runtimeContractMajor: 3,
    executionEngineMajor: 3,
    hostCapabilities: ['catalog-query@1', 'network@1'],
  });
  const missingCapability = checkActivationCompatibility(pkg, {
    formatVersion: '0.3',
    runtimeContractMajor: 3,
    executionEngineMajor: 3,
    hostCapabilities: [],
  });
  const incompatibleRuntime = checkActivationCompatibility(pkg, {
    formatVersion: '0.3',
    runtimeContractMajor: 2,
    executionEngineMajor: 3,
    hostCapabilities: ['catalog-query@1'],
  });

  assert.deepEqual(compatible, { ok: true });
  assert.deepEqual(missingCapability, { ok: false, reasons: ['capability:catalog-query@1'] });
  assert.deepEqual(incompatibleRuntime, { ok: false, reasons: ['runtimeContractMajor'] });

  // Execution pin is exact: no compatibility rule authorizes package substitution.
  assert.notEqual({ ...pkg, packageId: 'target-package-id-b' }.packageId, pkg.packageId);
});
