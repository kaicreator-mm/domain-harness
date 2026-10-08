/**
 * T004B invariant matrix — Microkernel boundary and no-authority posture
 * (issue #632, fine-grained DAG #534 T004B; authority #589 PACK-C T004B
 * section).
 *
 * Pins the PACK-C authority posture:
 *  - the new production Microkernel file imports no concrete
 *    Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/Storage
 *    dependency; Agent/UX are adapters OUTSIDE the kernel and no branch on
 *    the caller plane exists (callerKind is provenance data, never a switch
 *    target);
 *  - T004B mints OBSERVATIONAL output only — no transition, no occurrence, no
 *    durable effect journal: the module exports exactly one authority
 *    function, the result field set is closed, and no occurrence/journal
 *    input option is representable;
 *  - the effect=none path has no fallback into an effectful path: no
 *    exported entry point can carry an operation whose effect class is not
 *    `none`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import { sealRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../../src/contracts/invocation-request.js';
import {
  invokeNonEffectfulTool,
  type InvokeNonEffectfulToolInput,
  type NonEffectfulToolDispatchPort,
  type NonEffectfulToolInvocationResult,
} from '../../src/contracts/non-effectful-invocation.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.a',
    kind: { kindId: 'test.t004b-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    semanticBody: { note: 'consumer' },
  };
}

function toolComponent(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'test.t004b-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'op.query',
          inputSchema: { type: 'object' },
          outputSchema: {},
          effect: 'none',
          declaredExposure: { audiences: ['agent', 'ux'] },
        },
      ],
      providesCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    },
  };
}

function graph(): DefinitionGraphEnvelope {
  return { graphId: 'graph.t004b', components: [consumer(), toolComponent()], relations: [] };
}

const ADMIT_ALL: ToolExposureAdmissionPolicy = { decideAdmission: () => ({ admitted: true }) };

function caller(): InvocationCallerContext {
  return { callerId: 'caller.session-1', callerKind: 'agent' };
}

async function admittedFixture(): Promise<{
  g: DefinitionGraphEnvelope;
  binding: SealedToolImplementationBinding;
  admitted: AdmittedToolInvocationRequest;
}> {
  const g = graph();
  const baseAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: g,
      kindImplementations: [
        {
          pin: {
            kind: { kindId: 'test.t004b-kind', version: '1.0.0' },
            implementation: {
              implementationId: 'impl.t004b-kind',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:kind-impl',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: () => {},
        },
      ],
    },
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
  const candidates: readonly ToolImplementationCandidate[] = [
    {
      implementation: {
        implementationId: 'impl.calc.alpha',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:impl.calc.alpha-content',
      },
      supportedOperations: ['op.query'],
      handle: { id: 'handle.alpha' },
    },
  ];
  const binding = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: g,
    implementations: candidates,
    sha256: realSha256,
  });
  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.query',
      caller: caller(),
      assembly: binding.successorAssembly,
      currentDefinitionGraph: g,
      policy: ADMIT_ALL,
    },
    realSha256,
  );
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.query',
      input: {},
      caller: caller(),
      definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: binding.successorAssembly.assemblyDigest,
      exposure,
    },
    { assembly: binding.successorAssembly, currentDefinitionGraph: g },
    realSha256,
  );
  return { g, binding, admitted };
}

test('PACK-C T004B kernel boundary: no forbidden concrete import and no branch on the caller plane', () => {
  const sourcePath = fileURLToPath(
    new URL('../../src/contracts/non-effectful-invocation.ts', import.meta.url),
  );
  const source = readFileSync(sourcePath, 'utf8');

  const importStatements = [...source.matchAll(/import\s[^;]*?from\s+'([^']+)'/gs)].map(
    (match) => match[0],
  );
  const FORBIDDEN_PATTERNS = [
    /xstate/i,
    /workflow(?!-)/i,
    /tool[\s\-_.]*registry/i,
    /sqlite/i,
    /\bsql\b/i,
    /agent/i,
    /\bux\b/i,
    /\bai[\s\-_.]/i,
    /http/i,
    /search/i,
    /storage/i,
    /node:/,
    /compiler/i,
    /adapter/i,
    /standard[\s\-_.]*component/i,
  ];
  for (const statement of importStatements) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.doesNotMatch(
        statement,
        pattern,
        `non-effectful-invocation.ts must not import a forbidden concrete dependency: ${statement}`,
      );
    }
  }

  // Positive boundary: only accepted generic contract/helper modules import.
  const allowedImports = [
    './component.js',
    './definition-graph.js',
    './identity.js',
    './json.js',
    './record-safety.js',
    './invocation-request.js',
    './resource-resolution.js',
    './runtime-assembly.js',
    './tool-implementation-binding.js',
  ];
  const imported = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  assert.ok(imported.length > 0, 'sanity: imports were detected');
  for (const specifier of imported) {
    assert.ok(
      allowedImports.includes(specifier),
      `unexpected inward dependency of the non-effectful invocation seam: ${specifier}`,
    );
  }

  // #691 repair pins — shared verifier consumption is structural, not
  // incidental: the T002B mint verifier is consumed DIRECTLY over the exact
  // final Assembly, and the T003C consumer verifier gates the pairing and
  // exposure of the opaque implementation handle. No injected provenance
  // decision seam exists anywhere in the module.
  assert.match(
    source,
    /isSealedRuntimeAssembly\(/,
    'the T002B mint verifier must be consumed directly over the exact final Assembly',
  );
  assert.match(
    source,
    /verifyToolImplementationBinding\(/,
    'the T003C consumer verifier must gate the pairing/exposure of the implementation handle',
  );
  assert.doesNotMatch(
    source,
    /SealedAssemblyProvenanceGuard|AssemblyProvenanceDecision|verifyProvenance/,
    'no injected provenance-decision seam may exist after the #691 repair',
  );

  // Caller-plane neutrality: the kernel never switches on callerKind or
  // caller identity — provenance strings are data, never branch targets.
  const bodyWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(
    bodyWithoutComments,
    /callerKind\s*===/,
    'the Microkernel must not branch on the caller plane (Agent/UX neutrality)',
  );
  assert.doesNotMatch(
    bodyWithoutComments,
    /switch\s*\([^)]*caller/i,
    'the Microkernel must not switch on caller material',
  );
  assert.doesNotMatch(
    bodyWithoutComments,
    /['"]agent['"]|['"]ux['"]|['"]workflow['"]/i,
    'concrete caller-plane literals must not appear in the Microkernel even as branch keys',
  );

  // T004B exposes exactly ONE authority function: the non-effectful
  // invocation boundary. No effectful/execute/transition entry point exists.
  const exportedFunctions = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(exportedFunctions.sort(), ['invokeNonEffectfulTool']);
});

test('PACK-C T004B no-authority proof: the observational result and the closed input mint no transition/journal/occurrence material', async () => {
  const fx = await admittedFixture();
  const dispatch: NonEffectfulToolDispatchPort = {
    async dispatch() {
      return { ok: true };
    },
  };
  const input: InvokeNonEffectfulToolInput = {
    request: fx.admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    dispatch,
    sha256: realSha256,
  };

  // Authority-bearing inputs that would smuggle a transition/journal surface
  // are unrepresentable: extra fields fail closed before any dispatch.
  for (const smuggled of [
    { ...input, journal: [] },
    { ...input, transitionLog: [] },
    { ...input, occurrenceId: 'occ.1' },
  ]) {
    await assert.rejects(
      invokeNonEffectfulTool(smuggled as unknown as InvokeNonEffectfulToolInput),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { code?: string }).code, 'INVALID_INVOCATION_INPUT');
        return true;
      },
    );
  }

  const result: NonEffectfulToolInvocationResult = await invokeNonEffectfulTool(input);

  // The result is exactly the pinned closed field set — observational
  // identity + portable output, nothing else.
  assert.deepEqual(Object.keys(result).sort(), [
    'assemblyDigest',
    'bindingDigest',
    'definitionGraphDigest',
    'implementation',
    'operationId',
    'output',
    'status',
    'toolComponentId',
  ]);
  for (const forbidden of ['occurrenceId', 'journalEntry', 'transition', 'effect', 'effectAuthority']) {
    assert.equal(
      (result as unknown as Record<string, unknown>)[forbidden],
      undefined,
      `the observational result must not carry ${forbidden}`,
    );
  }

  // The module surface has no effectful/transition entry point at all.
  const moduleUrl = new URL('../../src/contracts/non-effectful-invocation.js', import.meta.url);
  const mod = (await import(moduleUrl.href)) as Record<string, unknown>;
  for (const forbidden of [
    'invokeEffectfulTool',
    'executeToolInvocation',
    'dispatchEffectfulTool',
    'transitionDomain',
    'appendJournalEntry',
    'mintOccurrence',
  ]) {
    assert.equal(mod[forbidden], undefined, `module must not export ${forbidden}`);
  }
  // Exactly one runtime function is exported (the type-only exports vanish at
  // runtime, so the function key set is the whole authority surface).
  const runtimeFunctions = Object.values(mod).filter((value) => typeof value === 'function');
  assert.equal(runtimeFunctions.length, 2, 'module + error class constructor are the only runtime callables');
});
