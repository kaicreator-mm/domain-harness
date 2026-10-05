/**
 * T004A invariant matrix — Microkernel boundary and authority posture
 * (issue #609, fine-grained DAG #534 T004A; authority #589 PACK-A T004A
 * section).
 *
 * Pins the PACK-A authority posture:
 *  - the new production Microkernel file imports no concrete
 *    Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/Storage
 *    dependency; Agent/UX are adapters OUTSIDE the kernel and no branch on
 *    the caller plane exists in the kernel (callerKind is provenance data,
 *    never a switch target);
 *  - T004A mints REQUEST ADMISSION evidence only — no dispatch, no execution,
 *    no occurrence anchoring and no effect authority: the admitted request
 *    exposes exactly the pinned closed field set;
 *  - exposure evidence is exactly the pinned closed field set as well.
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
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
} from '../../src/contracts/runtime-assembly.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
  type ToolInvocationRequest,
} from '../../src/contracts/invocation-request.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function toolComponent(overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'test.tool-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'op.mutate',
          inputSchema: {},
          outputSchema: {},
          effect: 'non-idempotent',
        },
      ],
      providesCapabilities: [],
    },
    ...overrides,
  };
}

function graph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.invocation',
    components: [toolComponent()],
    relations: [],
    ...overrides,
  };
}

function toolBinding(overrides: Partial<KindImplementationBindingInput> = {}): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'test.tool-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.test.tool-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:tool-kind-impl',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
    ...overrides,
  };
}

const ADMIT_ALL: ToolExposureAdmissionPolicy = { decideAdmission: () => ({ admitted: true }) };

function caller(overrides: Partial<InvocationCallerContext> = {}): InvocationCallerContext {
  return { callerId: 'caller.internal-1', callerKind: 'internal', ...overrides };
}

test('PACK-A kernel boundary: no forbidden concrete import and no branch on the caller plane', () => {
  const sourcePath = fileURLToPath(
    new URL('../../src/contracts/invocation-request.ts', import.meta.url),
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
        `invocation-request.ts must not import a forbidden concrete dependency: ${statement}`,
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
    './runtime-assembly.js',
    './tool-component.js',
  ];
  const imported = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  assert.ok(imported.length > 0, 'sanity: imports were detected');
  for (const specifier of imported) {
    assert.ok(
      allowedImports.includes(specifier),
      `unexpected inward dependency of the invocation-request seam: ${specifier}`,
    );
  }

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

  // T004A exposes exactly two authority functions: exposure admission and
  // request admission. No dispatch/execute/run entry point exists.
  const exportedFunctions = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(exportedFunctions.sort(), ['admitToolExposure', 'admitToolInvocationRequest']);
});

test('PACK-A authority posture: the admitted request and the exposure evidence carry exactly identity material — no effect authority', async () => {
  const g = graph();
  const sealed = await sealRuntimeAssembly(
    { definitionGraph: g, kindImplementations: [toolBinding()] },
    realSha256,
  );
  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.mutate',
      caller: caller(),
      assembly: sealed,
      currentDefinitionGraph: g,
      policy: ADMIT_ALL,
    },
    realSha256,
  );
  assert.deepEqual(Object.keys(exposure).sort(), [
    'assemblyDigest',
    'caller',
    'definitionGraphDigest',
    'exposureDigest',
    'operationId',
    'status',
    'toolComponentId',
  ]);
  assert.equal((exposure as unknown as Record<string, unknown>).effect, undefined);
  assert.equal((exposure as unknown as Record<string, unknown>).occurrenceId, undefined);

  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.mutate',
      input: { delta: 1 },
      caller: caller(),
      definitionGraphDigest: sealed.record.definitionGraphDigest,
      assemblyDigest: sealed.assemblyDigest,
      exposure,
    } satisfies ToolInvocationRequest,
    { assembly: sealed, currentDefinitionGraph: g },
    realSha256,
  );

  // REQUEST_ADMITTED=YES, DISPATCH_AUTHORITY=NO, EFFECT_AUTHORITY=NO:
  // operationEffect is the frozen L2 classification carried forward for
  // T004B/T004C gating — never an effect grant.
  assert.deepEqual(Object.keys(admitted).sort(), [
    'assemblyDigest',
    'caller',
    'definitionGraphDigest',
    'exposure',
    'input',
    'operationEffect',
    'operationId',
    'status',
    'toolComponentId',
  ]);
  for (const forbidden of ['dispatch', 'execute', 'run', 'invoke', 'occurrenceId', 'journalEntry', 'effectAuthority']) {
    assert.equal(
      (admitted as unknown as Record<string, unknown>)[forbidden],
      undefined,
      `admitted request must not carry ${forbidden}`,
    );
  }
  // The module surface itself has no dispatch/execute entry point.
  const moduleUrl = new URL('../../src/contracts/invocation-request.js', import.meta.url);
  const mod = (await import(moduleUrl.href)) as Record<string, unknown>;
  for (const forbidden of ['dispatchToolInvocation', 'executeToolInvocation', 'runToolInvocation', 'invokeTool']) {
    assert.equal(mod[forbidden], undefined, `module must not export ${forbidden}`);
  }
});
