// T009 build-time fixture compiler (runs under tsx in the workspace, BEFORE
// any copy to the device). Mirrors the v0.6 conformance fixture vocabulary
// (packages/domain-harness/tests/v06-conformance/fixtures.ts): constructs the
// compiled successor package manifest carrying the T009 semantic-decision
// declarations and computes its packageId through the PUBLIC product identity
// seam with the Node sha256 port. The device later recomputes the SAME
// packageId with its own pure-TS SHA-256 — cross-host compiled-identity parity
// is journey J1 evidence.
//
// Emits one JSON document on stdout (the build script slices the last {...}).
import { createHash } from 'node:crypto';
import type { Sha256Port } from '../../../packages/domain-harness/src/contracts/identity.js';
import { canonicalJsonStringify, computeCanonicalJsonDigest } from '../../../packages/domain-harness/src/contracts/identity.js';
import { computeCompiledPackageId } from '../../../packages/domain-harness/src/package/validation.js';
import {
  DOMAIN_HARNESS_JSON_SCHEMA_V1,
  SEMANTIC_DECISION_CAPABILITY,
  SEMANTIC_DECISION_CONTRACT_VERSION_V1,
} from '../../../packages/domain-harness/src/v2/index.js';
import type { TargetCompiledDomainPackage } from '../../../packages/domain-harness/src/v2/index.js';
import type { CompiledSemanticDecisionDescriptor } from '../../../packages/domain-harness/src/v2/index.js';
import type { JsonObject } from '../../../packages/domain-harness/src/contracts/json.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const CAPS = {
  hash: 'crypto-hash-sha256@1',
  random: 'secure-random@1',
  expression: 'expression-jsonata@1',
} as const;

const ALL_SUCCESSOR_CAPABILITIES = [CAPS.hash, CAPS.random, CAPS.expression, SEMANTIC_DECISION_CAPABILITY] as const;

/** The frozen quote result schema of the v0.6 conformance vocabulary. */
const QUOTE_RESULT_SCHEMA: JsonObject = {
  type: 'object',
  required: ['decision', 'event'],
  properties: {
    decision: {
      type: 'object',
      required: ['outcome'],
      properties: { outcome: { enum: ['approve', 'reject'] } },
    },
    event: {
      type: 'object',
      required: ['type'],
      properties: { type: { enum: ['QUOTE_DECIDED'] } },
    },
  },
};

async function quoteDeclaration(
  decisionId: string,
  overrides: {
    unavailable?: CompiledSemanticDecisionDescriptor['unavailable'];
    promotedReference?: CompiledSemanticDecisionDescriptor['promotedReference'];
    cachePolicy?: CompiledSemanticDecisionDescriptor['cachePolicy'];
  } = {},
): Promise<CompiledSemanticDecisionDescriptor> {
  const body = {
    decisionId,
    inputSelection: '$.order',
    resultSchema: QUOTE_RESULT_SCHEMA,
    allowedOutcomes: ['approve', 'reject'],
    allowedEventTypes: ['QUOTE_DECIDED'],
    queryCapabilityIds: ['quotes.lookup'],
    dependencyMaterial: { requiredProjectionIds: [], requiredRevisionSourceIds: [] },
    cachePolicy: overrides.cachePolicy ?? ({ mode: 'eligible' } as const),
    policy: { maxSteps: 4 },
    unavailable: overrides.unavailable ?? ({ kind: 'fail-closed' } as const),
    ...(overrides.promotedReference === undefined ? {} : { promotedReference: overrides.promotedReference }),
  };
  return { ...body, declarationDigest: await computeCanonicalJsonDigest(body, sha256) };
}

async function main(): Promise<void> {
  const decisions = [
    // Deterministic/fresh/harness journeys (J1, J2a rule, J2b exact reuse, J3
    // fresh model, J4a fail-closed, J5 guard/invariant denials).
    await quoteDeclaration('quote-decision'),
    // Declared-event unavailable disposition (J4b/J4c).
    await quoteDeclaration('quote-declared-decision', {
      unavailable: { kind: 'declared-event', eventType: 'QUOTE_DECIDED', outcome: 'reject' },
    }),
    // Non-model promoted subworkflow source (J2c).
    await quoteDeclaration('quote-promoted-decision', {
      promotedReference: { kind: 'version', artifactId: 'subworkflow:quote-review', version: '1.0.0' },
    }),
  ];

  const manifest: Record<string, unknown> = {
    formatVersion: '0.3',
    runtimeContractMajor: 2,
    executionEngineMajor: 3,
    domainId: 'orders',
    domainVersion: '0.6.0-t009',
    packageId: 'pending',
    targetProfileId: 't009-devicehost@1',
    requiredCapabilities: [...ALL_SUCCESSOR_CAPABILITIES],
    workflows: {
      'order-quote': {
        workflowId: 'order-quote',
        definition: {
          initial: 'review',
          states: {
            review: { final: false, done: [], error: [], events: {} },
            approved: { final: true, done: [], error: [], events: {} },
            rejected: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        },
        messageContracts: {},
      },
    },
    tools: {
      'quotes.lookup': {
        toolId: 'quotes.lookup',
        outputSchema: { type: 'object' },
        effect: 'none',
        execution: { kind: 'runtime-read', bindingId: 'bind:quotes.lookup' },
        requiredCapabilities: [CAPS.expression],
      },
    },
    projections: {
      'quote.view': {
        projectionId: 'quote.view',
        expression: '$',
        dependencies: [{ kind: 'business', source: 'quotes.source', selector: {} }],
        outputSchema: { type: 'object' },
      },
    },
    schemas: {},
    bindingDigests: { 'bind:quotes.lookup': 'digest-bind:quotes.lookup' },
    schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
    packageDataBounds: {
      maxDomainDataEntries: 4,
      maxDomainDataEntryCanonicalBytes: 2048,
      maxTotalDomainDataCanonicalBytes: 8192,
      maxBusinessSources: 4,
      maxSchemaCanonicalBytes: 4096,
    },
    domainData: [],
    businessSources: [{ source: 'quotes.source', valueSchema: { type: 'object' } }],
    semanticDecisionContractVersion: SEMANTIC_DECISION_CONTRACT_VERSION_V1,
    semanticDecisions: decisions,
  };

  const typed = manifest as unknown as TargetCompiledDomainPackage['manifest'];
  typed.packageId = await computeCompiledPackageId(typed, sha256);

  const document = {
    package: {
      packageId: typed.packageId,
      manifest: typed,
      declarationDigests: Object.fromEntries(decisions.map((d) => [d.decisionId, d.declarationDigest])),
      semanticDecisionContractVersion: SEMANTIC_DECISION_CONTRACT_VERSION_V1,
      semanticDecisionCapability: SEMANTIC_DECISION_CAPABILITY,
    },
    host: {
      capabilities: [...ALL_SUCCESSOR_CAPABILITIES],
      bounds: {
        maxDomainDataEntries: 32,
        maxDomainDataEntryCanonicalBytes: 4096,
        maxTotalDomainDataCanonicalBytes: 16384,
        maxBusinessSources: 32,
        maxSchemaCanonicalBytes: 8192,
      },
    },
  };
  console.log(JSON.stringify(document));
}

await main();
void canonicalJsonStringify;
