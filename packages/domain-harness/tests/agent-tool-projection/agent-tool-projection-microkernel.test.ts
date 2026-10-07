/**
 * T004D invariant matrix — Agent adapter boundary: projection/caller only,
 * never authority owner (issue #886; authority #589 PACK-C T004D section;
 * readiness #702 NO_AGENT_AUTHORITY=CONFIRMED / WRITE_SET_BOUND).
 *
 * Pins the frozen adapter posture at the source/contract level:
 *  - the adapter composes ONLY the accepted generic caller-plane seams (T004A
 *    exposure/request admission, T004B non-effectful invocation) and imports
 *    no effectful-invocation, admission, governance, workflow, journal or
 *    node dependency — the mutation route is the generic T004A -> T004C path
 *    composed by the host, and NO Agent-specific mutation dispatch exists
 *    anywhere in this module;
 *  - the query seam is a SIBLING adapter: the frozen DomainQueryDispatcher /
 *    read seam is untouched and mutation stays structurally absent from the
 *    Agent query path (typed refusal before dispatch);
 *  - model output is PROPOSAL material only: no exported function converts
 *    model output into invocation/transition authority, and no
 *    occurrence/journal/verdict/pin field is representable on any adapter
 *    input;
 *  - the projection is derived metadata: frozen, non-aliasing, digest-bound,
 *    and it never substitutes for admission evidence (the T004A/T004B seams
 *    re-prove exact currentness authoritatively on every call).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  resolveCurrentCapabilityProvider,
} from '../../src/contracts/capability-provision.js';
import { sealRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import { bindToolImplementation } from '../../src/contracts/tool-implementation-binding.js';
import {
  computeDefinitionGraphDigest,
} from '../../src/contracts/definition-graph.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Source-level adapter boundary proof.
// ---------------------------------------------------------------------------

test('PACK-C T004D adapter boundary: only the generic T004A/T004B seams are composed — no effectful/admission/governance dependency, no Agent mutation dispatch', () => {
  const sourcePath = fileURLToPath(
    new URL('../../src/adapters/agent-tool-projection.ts', import.meta.url),
  );
  const source = readFileSync(sourcePath, 'utf8');

  // Positive boundary: only generic contract seams + record-safety helpers.
  const allowedImports = [
    '../contracts/component.js',
    '../contracts/definition-graph.js',
    '../contracts/identity.js',
    '../contracts/json.js',
    '../contracts/record-safety.js',
    '../contracts/invocation-request.js',
    '../contracts/non-effectful-invocation.js',
    '../contracts/resource-resolution.js',
    '../contracts/runtime-assembly.js',
    '../contracts/tool-component.js',
    '../contracts/tool-implementation-binding.js',
  ];
  const imported = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  assert.ok(imported.length > 0, 'sanity: imports were detected');
  for (const specifier of imported) {
    assert.ok(
      allowedImports.includes(specifier),
      `unexpected inward dependency of the Agent adapter: ${specifier}`,
    );
  }

  // Structural prohibition: the mutation route must NOT be composed here. The
  // host routes admitted mutation intent through the T004C module itself.
  // (Checked over import specifiers: imported identifiers are pinned by the
  // allowedImports allowlist above, and the doc header names the forbidden
  // seams to explain the boundary.)
  for (const specifier of imported) {
    assert.doesNotMatch(
      specifier,
      /(?<!non-)effectful-invocation/,
      'the Agent adapter must not import the effectful invocation seam — no Agent mutation shortcut',
    );
    assert.doesNotMatch(
      specifier,
      /admission|governance|workflow|journal|occurrence/i,
      'the Agent adapter must not import admission/governance/workflow material — it owns no effect authority',
    );
    assert.doesNotMatch(
      specifier,
      /node:/,
      'the Agent adapter must not import node builtins',
    );
  }

  // Authority vocabulary must be absent: no journal driving, no occurrence
  // minting, no verdict/pin material, no implementation selection.
  assert.doesNotMatch(source, /beginEffect|completeEffect|appendJournal/);
  assert.doesNotMatch(source, /mintOccurrence|activate\(|sealRuntimeAssembly\(|bindToolImplementation\(/);
  assert.doesNotMatch(source, /descriptors\[|registry\.|first[A-Z]|latest[A-Z]|default[A-Z]Implementation/);

  // The generic owner seams are consumed structurally.
  for (const required of [
    'admitToolExposure(',
    'admitToolInvocationRequest(',
    'invokeNonEffectfulTool(',
    'validateToolComponent(',
    'computeDefinitionGraphDigest(',
  ] as const) {
    assert.match(
      source,
      new RegExp(required.replace('(', '\\(').replace(')', '\\)')),
      `the Agent adapter must consume the accepted generic seam: ${required}`,
    );
  }

  // No caller-plane branch inside the adapter's exposure rule either: the
  // plane rule is the fixed agent-audience predicate, not a caller switch.
  const bodyWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(
    bodyWithoutComments,
    /callerKind\s*===/,
    'the adapter must not branch on callerKind (the plane is fixed, never switched)',
  );
});

test('PACK-C T004D adapter export surface: exactly the projection, the query seam and the mutation-intent admission — no dispatch, no journal, no occurrence material', async () => {
  const moduleUrl = new URL('../../src/adapters/agent-tool-projection.js', import.meta.url);
  const mod = (await import(moduleUrl.href)) as Record<string, unknown>;

  const runtimeFunctions = Object.entries(mod)
    .filter(([, value]) => typeof value === 'function')
    .map(([key]) => key);
  assert.deepEqual(
    runtimeFunctions.sort(),
    ['AgentToolProjectionError', 'admitAgentMutationIntent', 'projectAgentToolSurface', 'queryAgentTool'],
    'the adapter must export exactly one error class + three plane functions — no mutation dispatch of its own',
  );
  for (const forbidden of [
    'dispatchEffectfulTool',
    'invokeAgentMutation',
    'appendJournalEntry',
    'mintOccurrence',
    'admitCentralDecision',
    'activateOccurrence',
  ]) {
    assert.equal(mod[forbidden], undefined, `module must not export ${forbidden}`);
  }
});

// ---------------------------------------------------------------------------
// Read-seam integrity: the frozen DomainQueryDispatcher is untouched.
// ---------------------------------------------------------------------------

test('PACK-C T004D sibling-adapter posture: the frozen read seam carries no Tool mutation dispatch and no Agent branch', () => {
  const sourcePath = fileURLToPath(
    new URL('../../src/query/domain-query-dispatcher.ts', import.meta.url),
  );
  const source = readFileSync(sourcePath, 'utf8');
  const bodyWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  assert.doesNotMatch(
    source,
    /non-effectful-invocation|effectful-invocation|invocation-request/,
    'the frozen DomainQueryDispatcher must not be widened with Tool invocation dispatch (T004D read-only review of the write-set bound)',
  );
  assert.doesNotMatch(
    bodyWithoutComments,
    /callerKind\s*===|['"]agent['"]/i,
    'the frozen read seam must not grow an Agent branch',
  );
});

// ---------------------------------------------------------------------------
// Projection currentness: derived metadata only, never admission evidence.
// ---------------------------------------------------------------------------

test('PACK-C T004D projection is derived metadata: the exact T004A/T004B seams re-prove currentness even for a fresh projection', async () => {
  const { projectAgentToolSurface, AgentToolProjectionError } = await import(
    '../../src/adapters/agent-tool-projection.js'
  );

  const consumer: ComponentEnvelope = {
    family: 'semantic',
    componentId: 'consumer.a',
    kind: { kindId: 'test.t004d-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    semanticBody: { note: 'consumer' },
  };
  const tool: ComponentEnvelope = {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'test.t004d-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'op.query',
          inputSchema: {},
          outputSchema: {},
          effect: 'none',
          declaredExposure: { audiences: ['agent'] },
        },
      ],
      providesCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    },
  };
  const g: DefinitionGraphEnvelope = {
    graphId: 'graph.t004d-meta',
    components: [consumer, tool],
    relations: [],
  };
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph: g, kindImplementations: [
      {
        pin: {
          kind: { kindId: 'test.t004d-kind', version: '1.0.0' },
          implementation: {
            implementationId: 'impl.t004d-kind',
            implementationVersion: '1.0.0',
            implementationDigest: 'sha256:kind-impl',
          },
        },
        understoodSemanticContracts: [],
        understoodCapabilities: [],
        validateComponent: () => {},
      },
    ] },
    realSha256,
  );
  const digest = await computeDefinitionGraphDigest(g, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    g,
    { capabilityId: 'cap.calc', version: '1.0.0' },
    'consumer.a',
    digest,
    realSha256,
  );
  const binding = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: g,
    implementations: [
      {
        implementation: {
          implementationId: 'impl.calc.alpha',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:impl.calc.alpha-content',
        },
        supportedOperations: ['op.query'],
        handle: { id: 'handle.calc' },
      },
    ],
    sha256: realSha256,
  });

  const projection = await projectAgentToolSurface({
    agentId: 'agent.session-1',
    currentDefinitionGraph: g,
    sha256: realSha256,
  });
  assert.equal(projection.tools.length, 1);
  assert.equal(projection.tools[0]!.operations.length, 1);

  // Direct proof: a forged AdmittedToolExposure-shaped object fails the T004A
  // mint registry no matter what the projection says — projection identity
  // never substitutes for admission evidence.
  const { admitToolExposure, admitToolInvocationRequest } = await import(
    '../../src/contracts/invocation-request.js'
  );
  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.query',
      caller: { callerId: 'agent.session-1', callerKind: 'agent' },
      assembly: binding.successorAssembly,
      currentDefinitionGraph: g,
      policy: { decideAdmission: () => ({ admitted: true }) },
    },
    realSha256,
  );
  const forgedLookalike = { ...exposure, assemblyDigest: 'sha256:forged' };
  await assert.rejects(
    admitToolInvocationRequest(
      {
        toolComponentId: 'tool.alpha',
        operationId: 'op.query',
        input: {},
        caller: { callerId: 'agent.session-1', callerKind: 'agent' },
        definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
        assemblyDigest: binding.successorAssembly.assemblyDigest,
        exposure: forgedLookalike as never,
      },
      { assembly: binding.successorAssembly, currentDefinitionGraph: g },
      realSha256,
    ),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'FORGED_EXPOSURE_EVIDENCE');
      return true;
    },
  );
  assert.ok(AgentToolProjectionError !== undefined);
});
