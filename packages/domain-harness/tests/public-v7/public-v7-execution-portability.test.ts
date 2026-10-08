/**
 * T012-D1 `./v7/execution` packed-dist portability test (gate #930;
 * adjudication #537@6052473158; defect #926 T012-D1).
 *
 * Mirrors `public-v7-portability.test.ts`: `npm pack` the package, install
 * the tarball into a throwaway consumer OUTSIDE the repository, and prove
 * from the packed bytes alone:
 *
 *  - the additive `./v7/execution` subpath resolves (import AND require) and
 *    ships its dist entry files;
 *  - the exact runtime closure holds at dist level (16 functions + 9 typed
 *    error classes, no internal leak, no Node-only dependency in the facade);
 *  - the frozen T010A identities are recomputable THROUGH THE DECLARED
 *    PUBLIC SURFACES of the installed tarball — DefinitionGraphDigest
 *    030402bf… via `./v7`, T003C bindingDigest 8f5220bf… and the final
 *    assemblyDigest 400d668f… via `./v7/execution` — over the frozen neutral
 *    fixture material (rebuilt literally inside the consumer; no repo src);
 *  - the representative authorized T010B Tool path (seal -> capability
 *    selection -> implementation bind -> consumer verification -> exposure
 *    admission -> request admission -> non-effectful invocation as OBSERVED
 *    only) is expressible ONLY through declared package exports;
 *  - the representative T010C refusal rows fail closed with TYPED codes
 *    through the same declared exports;
 *  - old private deep imports still refuse ERR_PACKAGE_PATH_NOT_EXPORTED;
 *  - a strict NodeNext consumer `tsc` (skipLibCheck:false) types the minimum
 *    frozen journey with zero private imports (see `src/types.ts`).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function runNpm(args: readonly string[], cwd: string): string {
  if (process.platform !== 'win32') return run('npm', args, cwd);
  const command = ['npm.cmd', ...args.map((arg) => `"${arg}"`)].join(' ');
  return execFileSync(command, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  });
}

test('#930 packed package exposes ./v7/execution and the frozen T010 journey runs from packed public bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-public-v7-execution-'));
  const packs = join(root, 'packs');
  const consumer = join(root, 'consumer');

  try {
    mkdirSync(packs, { recursive: true });
    mkdirSync(consumer, { recursive: true });

    runNpm(['pack', '--pack-destination', packs], packageRoot);
    const tarballs = readdirSync(packs).filter((name) => name.endsWith('.tgz'));
    assert.equal(tarballs.length, 1, 'core pack must produce exactly one tarball');
    const tarball = join(packs, tarballs[0]!);

    writeFileSync(join(consumer, 'package.json'), JSON.stringify({
      name: 'domain-harness-public-v7-execution-consumer',
      private: true,
      type: 'module',
    }, null, 2));

    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer);
    const installedPackage = join(consumer, 'node_modules', '@kaicreator', 'domain-harness');
    const installedDist = join(installedPackage, 'dist');
    assert.equal(
      existsSync(join(installedDist, 'public-v7', 'execution.js')),
      true,
      'packed package must ship dist/public-v7/execution.js',
    );
    assert.equal(
      existsSync(join(installedDist, 'public-v7', 'execution.d.ts')),
      true,
      'packed package must ship dist/public-v7/execution.d.ts',
    );

    // ------------------------------------------------------------------
    // Consumer runtime journey: frozen T010A identities + authorized T010B
    // representative path + T010C typed refusals, all through the packed
    // declared surfaces only.
    // ------------------------------------------------------------------
    writeFileSync(join(consumer, 'journey.mjs'), `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const v7 = await import('@kaicreator/domain-harness/v7');
const ex = await import('@kaicreator/domain-harness/v7/execution');

// The require condition resolves to the same additive subpath.
const exRequire = require('@kaicreator/domain-harness/v7/execution');
assert.equal(exRequire.sealRuntimeAssembly, ex.sealRuntimeAssembly);

// ---- Exact runtime closure at dist level --------------------------------
const FUNCTIONS = [
  'admitAgentMutationIntent', 'admitComponentWithAssembly', 'admitToolExposure',
  'admitToolInvocationRequest', 'bindToolImplementation', 'invokeEffectfulTool',
  'invokeNonEffectfulTool', 'invokeUxToolEffectfully', 'isSealedRuntimeAssembly',
  'projectAgentToolSurface', 'queryAgentTool', 'queryUxTool',
  'resolveCurrentCapabilityProvider', 'resolveToolResources', 'sealRuntimeAssembly',
  'verifyToolImplementationBinding',
];
const ERRORS = [
  'AgentToolProjectionError', 'CapabilityProvisionContractError', 'EffectfulInvocationError',
  'InvocationRequestError', 'NonEffectfulInvocationError', 'ResourceResolutionError',
  'RuntimeAssemblyError', 'ToolImplementationBindingError', 'UxToolRequestError',
];
assert.deepEqual(Object.keys(ex).sort(), [...FUNCTIONS, ...ERRORS].sort());
for (const name of FUNCTIONS) assert.equal(typeof ex[name], 'function', name);
for (const name of ERRORS) assert.equal(typeof ex[name], 'function', name);

// ---- Facade has no Node-only dependency leak (portable facade fence) ----
// require.resolve through the declared subpath lands on the packed dist file.
const facadePath = require.resolve('@kaicreator/domain-harness/v7/execution');
assert.ok(facadePath.includes('dist'), 'resolved facade must be the packed dist file');
const facadeSource = readFileSync(facadePath, 'utf8');
assert.equal(facadeSource.includes("from 'node:"), false);
assert.equal(facadeSource.includes('from "node:'), false);
assert.equal(facadeSource.includes("require('node:"), false);

// ---- Frozen T010A fixture material (literal rebuild inside the consumer) -
const KIND = { kindId: 'test.t010a-kind', version: '1.0.0' };
const CAPABILITY = { capabilityId: 'cap.t010a.record', version: '1.0.0' };
const OP_READ = 'op.t010a.read';
const OP_RECORD = 'op.t010a.record';
const RESOURCE_KEY = 'res.t010a.audit-log';
const RESOURCE_CURRENTNESS = {
  componentId: 'tool.t010a',
  providerId: 'provider.t010a-test',
  resourceKey: RESOURCE_KEY,
  revisionDigest: 'sha256:t010a-audit-log-revision-v1',
};
const KIND_IMPLEMENTATION = {
  implementationId: 'impl.t010a-kind',
  implementationVersion: '1.0.0',
  implementationDigest: 'sha256:t010a-kind-impl-content',
};
const TOOL_IMPLEMENTATION = {
  implementationId: 'impl.t010a.tool',
  implementationVersion: '1.0.0',
  implementationDigest: 'sha256:t010a-tool-impl-content',
};
const sha256 = {
  digestUtf8: async (value) => createHash('sha256').update(value, 'utf8').digest('hex'),
};

function workflowComponent() {
  return {
    family: 'semantic',
    componentId: 'wf.t010a',
    kind: KIND,
    requiredSemanticContracts: [],
    requiredCapabilities: [CAPABILITY],
    semanticBody: {
      workflowKey: 'wf.t010a',
      lifecycle: { initial: 'READY', final: 'DONE' },
      states: [
        { stateKey: 'READY', kind: 'active' },
        { stateKey: 'DONE', kind: 'final' },
      ],
      intents: [
        { intentId: 'complete', admitted: true, fromState: 'READY', toState: 'DONE' },
      ],
    },
  };
}
function toolComponent() {
  return {
    family: 'tool',
    componentId: 'tool.t010a',
    kind: KIND,
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: OP_READ, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, effect: 'none' },
        {
          operationId: OP_RECORD,
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'idempotent',
          declaredFailures: ['INVALID_NOTE'],
        },
      ],
      providesCapabilities: [CAPABILITY],
    },
  };
}
function definitionGraph() {
  return {
    graphId: 'graph.t010a.neutral',
    components: [workflowComponent(), toolComponent()],
    relations: [
      {
        relationId: 'rel.t010a.wf-uses-tool',
        relationKind: 'uses-capability',
        sourceComponentId: 'wf.t010a',
        targetComponentId: 'tool.t010a',
      },
    ],
  };
}
const kindValidator = (envelope) => {
  if (envelope.family === 'tool') {
    v7.validateToolComponent(envelope);
    return;
  }
  // Neutral workflow semantics: exactly READY -> DONE via admitted 'complete'.
  const body = envelope.semanticBody;
  if (
    body.workflowKey !== 'wf.t010a' ||
    body.lifecycle.initial !== 'READY' ||
    body.lifecycle.final !== 'DONE' ||
    body.intents.length !== 1 ||
    body.intents[0].intentId !== 'complete' ||
    body.intents[0].admitted !== true
  ) {
    throw new Error('frozen kind: unknown semantics (must-understand fail-closed)');
  }
};

const graph = definitionGraph();

// ---- Proof 4 row 1: DefinitionGraphDigest through packed ./v7 -----------
const definitionGraphDigest = await v7.computeDefinitionGraphDigest(graph, sha256);
assert.equal(
  definitionGraphDigest,
  '030402bf802340d77f1ed88a3a4858dc2202b9b16bc590038d45cbf26b97825c',
);

// ---- T002B seal through ./v7/execution ----------------------------------
const assembly = await ex.sealRuntimeAssembly(
  {
    definitionGraph: graph,
    kindImplementations: [
      {
        pin: { kind: KIND, implementation: KIND_IMPLEMENTATION },
        understoodSemanticContracts: [],
        understoodCapabilities: [CAPABILITY],
        validateComponent: kindValidator,
      },
    ],
    resourceRequirements: [
      {
        owner: toolComponent(),
        declaration: {
          componentId: 'tool.t010a',
          requirements: [
            {
              resourceKey: RESOURCE_KEY,
              contract: { contractId: 'test.t010a-audit-log', version: '1.0.0' },
              operationId: OP_RECORD,
              required: true,
            },
          ],
        },
      },
    ],
  },
  sha256,
);
assert.equal(ex.isSealedRuntimeAssembly(assembly), true);
assert.equal(ex.isSealedRuntimeAssembly({ record: assembly.record }), false);

// ---- T003B + T003C: select, bind, verify --------------------------------
const selection = await ex.resolveCurrentCapabilityProvider(
  graph,
  CAPABILITY,
  'wf.t010a',
  definitionGraphDigest,
  sha256,
);
assert.equal(selection.provider.componentId, 'tool.t010a');
assert.equal(selection.provider.family, 'tool');

const dispatched = [];
const executor = {
  async run(operationId, input) {
    dispatched.push({ operationId, input });
    return operationId === OP_RECORD
      ? { recorded: true }
      : { observed: true };
  },
};
const binding = await ex.bindToolImplementation({
  assembly,
  selection: JSON.parse(JSON.stringify(selection)),
  currentDefinitionGraph: graph,
  implementations: [
    {
      implementation: TOOL_IMPLEMENTATION,
      supportedOperations: [OP_READ, OP_RECORD],
      handle: executor,
    },
  ],
  sha256,
});

// ---- Proof 4 rows 2+3: frozen binding + final assembly digests ----------
assert.equal(
  binding.evidence.bindingDigest,
  '8f5220bfc9c2e41c44cd06cdf36a5369662806a6e311fb1b5e338d2b2df86a87',
);
assert.equal(
  binding.successorAssembly.assemblyDigest,
  '400d668f9f806b7b7266c78b2322ffdf13bde07c8aa87a86edd9d78398d677c0',
);
assert.notEqual(binding.successorAssembly.assemblyDigest, assembly.assemblyDigest);
assert.deepEqual(binding.successorAssembly.record.implementationBindingEvidence, [
  {
    subject: 'tool.t010a',
    bindingDigest:
      '8f5220bfc9c2e41c44cd06cdf36a5369662806a6e311fb1b5e338d2b2df86a87',
  },
]);

const verified = await ex.verifyToolImplementationBinding({
  binding,
  finalAssembly: binding.successorAssembly,
  expectedImplementationPin: TOOL_IMPLEMENTATION,
  sha256,
});
assert.equal(verified.status, 'VERIFIED_CURRENT');
assert.equal(verified.implementationHandle, executor);

// ---- Proof 5: authorized T010B Tool path via declared exports only ------
const ADMIT_ALL = { decideAdmission: () => ({ admitted: true }) };
const caller = { callerId: 'caller.t010a-session-1', callerKind: 'workflow' };
const exposure = await ex.admitToolExposure(
  {
    toolComponentId: 'tool.t010a',
    operationId: OP_READ,
    caller,
    assembly: binding.successorAssembly,
    currentDefinitionGraph: graph,
    policy: ADMIT_ALL,
  },
  sha256,
);
const request = await ex.admitToolInvocationRequest(
  {
    toolComponentId: 'tool.t010a',
    operationId: OP_READ,
    input: { note: 't010a-read' },
    caller,
    definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
    assemblyDigest: binding.successorAssembly.assemblyDigest,
    exposure,
  },
  { assembly: binding.successorAssembly, currentDefinitionGraph: graph },
  sha256,
);
assert.equal(request.operationEffect, 'none');
const observed = await ex.invokeNonEffectfulTool({
  request,
  binding,
  currentDefinitionGraph: graph,
  dispatch: {
    dispatch: async (query) => (await query.handle.run(query.operationId, query.input)),
  },
  sha256,
});
assert.equal(observed.status, 'OBSERVED');
assert.deepEqual(observed.output, { observed: true });
assert.equal(dispatched.length, 1);
assert.equal(dispatched[0].operationId, OP_READ);
assert.equal(observed.implementation.implementationId, 'impl.t010a.tool');

// T005C resource resolution through the declared seam.
const provider = {
  resolve: async (req) => {
    if (req.resourceKey !== RESOURCE_KEY) return { status: 'absent' };
    const resolved = {
      status: 'resolved',
      handle: { sink: 't010a-test-audit-log' },
      currentnessPin: {
        providerId: RESOURCE_CURRENTNESS.providerId,
        resourceKey: RESOURCE_CURRENTNESS.resourceKey,
        revisionDigest: RESOURCE_CURRENTNESS.revisionDigest,
      },
    };
    return req.contract === undefined ? resolved : { ...resolved, contract: req.contract };
  },
};
const resolved = await ex.resolveToolResources({
  assembly: binding.successorAssembly,
  componentId: 'tool.t010a',
  operationId: OP_RECORD,
  provider,
});
const entry = resolved.resources.get(RESOURCE_KEY);
assert.equal(entry.status, 'resolved');
assert.equal(entry.currentnessPin.revisionDigest, 'sha256:t010a-audit-log-revision-v1');

// ---- Proof 6: representative T010C refusals, fail-closed + typed --------
// R1: the frozen fixture declares no exposure material -> UX refuses typed
// before any admission or dispatch.
await assert.rejects(
  ex.queryUxTool({
    uxSessionId: 'ux.t010a.session',
    toolComponentId: 'tool.t010a',
    operationId: OP_READ,
    input: { note: 'x' },
    expectedDefinitionGraphDigest: definitionGraphDigest,
    binding,
    currentDefinitionGraph: graph,
    dispatch: { dispatch: async () => { throw new Error('must never dispatch'); } },
    sha256,
  }),
  (error) => error instanceof ex.UxToolRequestError && error.code === 'UX_OPERATION_NOT_EXPOSED',
);
// R6: floating identity refuses typed (exact identities only, never normalized).
await assert.rejects(
  ex.queryUxTool({
    uxSessionId: 'ux.t010a.session',
    toolComponentId: 'tool.t010a',
    operationId: 'op.t010a.read@latest',
    input: { note: 'x' },
    expectedDefinitionGraphDigest: definitionGraphDigest,
    binding,
    currentDefinitionGraph: graph,
    dispatch: { dispatch: async () => { throw new Error('must never dispatch'); } },
    sha256,
  }),
  (error) => error instanceof ex.UxToolRequestError && error.code === 'INVALID_UX_REQUEST_INPUT',
);
// R1 (Agent plane): the projection over the frozen graph projects zero
// operations, so the Agent query seam refuses AGENT_OPERATION_NOT_PROJECTED.
const projection = await ex.projectAgentToolSurface({
  agentId: 'agent.t010a',
  currentDefinitionGraph: graph,
  sha256,
});
assert.equal(projection.status, 'PROJECTED');
assert.equal(projection.tools.length, 1);
assert.equal(projection.tools[0].toolComponentId, 'tool.t010a');
assert.equal(projection.tools[0].operations.length, 0);
await assert.rejects(
  ex.queryAgentTool({
    agentId: 'agent.t010a',
    toolComponentId: 'tool.t010a',
    operationId: OP_READ,
    proposal: { note: 'x' },
    projection,
    binding,
    currentDefinitionGraph: graph,
    dispatch: { dispatch: async () => { throw new Error('must never dispatch'); } },
    sha256,
  }),
  (error) =>
    error instanceof ex.AgentToolProjectionError &&
    error.code === 'AGENT_OPERATION_NOT_PROJECTED',
);
// R2: a UX intent claiming the frozen digest against a MOVED current graph
// (same operation, now ux-exposed so the phase-1 membership gate passes)
// refuses UX_REQUEST_STALE at the authoritative currentness re-proof.
const movedGraph = definitionGraph();
for (const operation of movedGraph.components[1].semanticBody.operations) {
  operation.declaredExposure = { audiences: ['ux'] };
}
movedGraph.components[0].semanticBody.states.push({ stateKey: 'ARCHIVED', kind: 'active' });
await assert.rejects(
  ex.queryUxTool({
    uxSessionId: 'ux.t010a.session',
    toolComponentId: 'tool.t010a',
    operationId: OP_READ,
    input: { note: 'x' },
    expectedDefinitionGraphDigest: definitionGraphDigest,
    binding,
    currentDefinitionGraph: movedGraph,
    dispatch: { dispatch: async () => { throw new Error('must never dispatch'); } },
    sha256,
  }),
  (error) => error instanceof ex.UxToolRequestError && error.code === 'UX_REQUEST_STALE',
);
// R4: the generic T004B kernel seam refuses a mutation-capable operation.
const exposureRecord = await ex.admitToolExposure(
  {
    toolComponentId: 'tool.t010a',
    operationId: OP_RECORD,
    caller,
    assembly: binding.successorAssembly,
    currentDefinitionGraph: graph,
    policy: ADMIT_ALL,
  },
  sha256,
);
const recordRequest = await ex.admitToolInvocationRequest(
  {
    toolComponentId: 'tool.t010a',
    operationId: OP_RECORD,
    input: { note: 't010a-record' },
    caller,
    definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
    assemblyDigest: binding.successorAssembly.assemblyDigest,
    exposure: exposureRecord,
  },
  { assembly: binding.successorAssembly, currentDefinitionGraph: graph },
  sha256,
);
await assert.rejects(
  ex.invokeNonEffectfulTool({
    request: recordRequest,
    binding,
    currentDefinitionGraph: graph,
    dispatch: { dispatch: async () => { throw new Error('must never dispatch'); } },
    sha256,
  }),
  (error) =>
    error instanceof ex.NonEffectfulInvocationError &&
    error.code === 'EFFECTFUL_OPERATION_REJECTED',
);
// R3 (resource): a forged (non-content-digest) provider revision refuses
// typed at the T005C seam — provider claims are never trusted.
await assert.rejects(
  ex.resolveToolResources({
    assembly: binding.successorAssembly,
    componentId: 'tool.t010a',
    operationId: OP_RECORD,
    provider: {
      resolve: async () => ({
        status: 'resolved',
        handle: { sink: 'forged' },
        currentnessPin: {
          providerId: 'provider.t010a-test',
          resourceKey: RESOURCE_KEY,
          revisionDigest: 'latest',
        },
      }),
    },
  }),
  (error) =>
    error instanceof ex.ResourceResolutionError &&
    error.code === 'INVALID_RESOURCE_PROVIDER_RESPONSE',
);
// R6 (Assembly admission): an unbound exact Kind refuses typed.
await assert.rejects(
  ex.admitComponentWithAssembly(
    {
      ...workflowComponent(),
      kind: { kindId: 'test.t010a-unknown-kind', version: '9.9.9' },
    },
    binding.successorAssembly,
    { currentDefinitionGraph: graph, sha256 },
  ),
  (error) =>
    error instanceof ex.RuntimeAssemblyError &&
    error.code === 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND',
);

// ---- Proof 7: old private deep imports still refuse ----------------------
// Every previously-private owner path AND the raw dist path of the new
// facade itself refuse; only the declared ./v7/execution subpath resolves.
const DEEP_TARGETS = [
  '/dist/contracts/runtime-assembly.js',
  '/dist/contracts/tool-implementation-binding.js',
  '/dist/contracts/invocation-request.js',
  '/dist/contracts/non-effectful-invocation.js',
  '/dist/contracts/effectful-invocation.js',
  '/dist/contracts/resource-resolution.js',
  '/dist/adapters/ux-tool-request.js',
  '/dist/adapters/agent-tool-projection.js',
  '/dist/public-v7/execution.js',
  '/dist/index.js',
];
for (const target of DEEP_TARGETS) {
  await assert.rejects(
    import('@kaicreator/domain-harness' + target),
    (error) => error !== null && error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  );
}
// The declared subpath itself is importable (proven above); assert the
// require condition again for the record.
assert.equal(typeof require('@kaicreator/domain-harness/v7/execution').queryUxTool, 'function');

console.log('consumer journey: all rows green');
`);

    run(process.execPath, ['journey.mjs'], consumer);

    // ------------------------------------------------------------------
    // Consumer strict NodeNext typecheck of the minimum frozen journey.
    // ------------------------------------------------------------------
    mkdirSync(join(consumer, 'src'), { recursive: true });
    writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        types: ['node'],
      },
      include: ['src/types.ts'],
    }, null, 2));
    writeFileSync(join(consumer, 'src', 'types.ts'), `
// Minimum frozen journey typed through DECLARED package exports only:
// foundation/digests from ./v7, Tool-plane seams from ./v7/execution, and
// the governance/admission port types consumed by the effectful input from
// the existing ./v3 surface. Zero private deep imports.
import {
  computeDefinitionGraphDigest,
  validateToolComponent,
  type ComponentEnvelope,
  type ContentDigest,
  type DefinitionGraphEnvelope,
  type Sha256Port,
} from '@kaicreator/domain-harness/v7';
import {
  admitComponentWithAssembly,
  admitToolExposure,
  admitToolInvocationRequest,
  bindToolImplementation,
  invokeEffectfulTool,
  invokeNonEffectfulTool,
  isSealedRuntimeAssembly,
  projectAgentToolSurface,
  queryAgentTool,
  queryUxTool,
  resolveCurrentCapabilityProvider,
  resolveToolResources,
  sealRuntimeAssembly,
  verifyToolImplementationBinding,
  AgentToolProjectionError,
  EffectfulInvocationError,
  NonEffectfulInvocationError,
  ResourceResolutionError,
  RuntimeAssemblyError,
  ToolImplementationBindingError,
  UxToolRequestError,
  type AdmitToolInvocationRequestOptions,
  type AssemblyBoundComponentAdmission,
  type EffectfulToolDispatchPort,
  type InvokeEffectfulToolInput,
  type InvokeUxToolEffectfullyInput,
  type JsonValue,
  type KindImplementationBindingInput,
  type NonEffectfulToolDispatchPort,
  type QueryUxToolInput,
  type ResourceProvider,
  type SealedRuntimeAssembly,
  type SealRuntimeAssemblyInput,
  type SealedToolImplementationBinding,
  type ToolExposureAdmissionPolicy,
  type VerifiedToolImplementationBinding,
} from '@kaicreator/domain-harness/v7/execution';
import type {
  AdmissionDurableEffectJournal,
  AssemblyExecutionActivator,
  CentralAdmissionRequest,
  GovernanceBaselineStore,
  GovernanceExecutionCoordinator,
} from '@kaicreator/domain-harness/v3';

declare const sha256: Sha256Port;
declare const graph: DefinitionGraphEnvelope;
declare const digest: ContentDigest;
declare const envelope: ComponentEnvelope;
declare const validator: KindImplementationBindingInput['validateComponent'];
declare const policy: ToolExposureAdmissionPolicy;
declare const requestOptions: AdmitToolInvocationRequestOptions;
declare const nonEffectfulDispatch: NonEffectfulToolDispatchPort;
declare const effectfulDispatch: EffectfulToolDispatchPort;
declare const resourceProvider: ResourceProvider;
declare const activator: AssemblyExecutionActivator;
declare const admissionRequest: CentralAdmissionRequest;
declare const governance: GovernanceExecutionCoordinator;
declare const baselines: GovernanceBaselineStore;
declare const effectJournal: AdmissionDurableEffectJournal;

export async function frozenJourney(): Promise<{
  assembly: SealedRuntimeAssembly;
  verified: VerifiedToolImplementationBinding;
  admission: AssemblyBoundComponentAdmission;
}> {
  const definitionGraphDigest: ContentDigest = await computeDefinitionGraphDigest(graph, sha256);
  const sealInput: SealRuntimeAssemblyInput = {
    definitionGraph: graph,
    kindImplementations: [
      {
        pin: {
          kind: { kindId: 'k', version: '1.0.0' },
          implementation: {
            implementationId: 'i',
            implementationVersion: '1.0.0',
            implementationDigest: 'sha256:x' as ContentDigest,
          },
        },
        understoodSemanticContracts: [],
        understoodCapabilities: [],
        validateComponent: validator,
      },
    ],
  };
  const assembly: SealedRuntimeAssembly = await sealRuntimeAssembly(sealInput, sha256);
  const sealedProof: boolean = isSealedRuntimeAssembly(assembly);

  const selection = await resolveCurrentCapabilityProvider(
    graph,
    { capabilityId: 'cap', version: '1.0.0' },
    'consumer.wf',
    definitionGraphDigest,
    sha256,
  );
  const binding: SealedToolImplementationBinding = await bindToolImplementation({
    assembly,
    selection,
    currentDefinitionGraph: graph,
    implementations: [],
    sha256,
  });
  const verified: VerifiedToolImplementationBinding = await verifyToolImplementationBinding({
    binding,
    finalAssembly: binding.successorAssembly,
    sha256,
  });

  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool',
      operationId: 'op',
      caller: { callerId: 'c' },
      assembly: binding.successorAssembly,
      currentDefinitionGraph: graph,
      policy,
    },
    sha256,
  );
  const request = await admitToolInvocationRequest(
    {
      toolComponentId: 'tool',
      operationId: 'op',
      input: { note: 'x' } as JsonValue,
      caller: { callerId: 'c' },
      definitionGraphDigest: digest,
      assemblyDigest: digest,
      exposure,
    },
    requestOptions,
    sha256,
  );

  const observed = await invokeNonEffectfulTool({
    request,
    binding,
    currentDefinitionGraph: graph,
    dispatch: nonEffectfulDispatch,
    resourceProvider,
    sha256,
  });
  const observedOutput: JsonValue = observed.output;

  const resources = await resolveToolResources({
    assembly: binding.successorAssembly,
    componentId: 'tool',
    operationId: 'op',
    provider: resourceProvider,
  });

  const effectfulInput: InvokeEffectfulToolInput = {
    request,
    binding,
    currentDefinitionGraph: graph,
    activator,
    admissionRequest,
    admissionPorts: { governance, baselines, effectJournal },
    effectType: 'effect:x',
    dispatch: effectfulDispatch,
    resourceProvider,
    sha256,
  };
  void effectfulInput;

  const uxQuery: QueryUxToolInput = {
    uxSessionId: 'ux',
    toolComponentId: 'tool',
    operationId: 'op',
    input: null,
    expectedDefinitionGraphDigest: digest,
    binding,
    currentDefinitionGraph: graph,
    dispatch: nonEffectfulDispatch,
    sha256,
  };
  void uxQuery;
  const uxEffectful: InvokeUxToolEffectfullyInput = {
    uxSessionId: 'ux',
    toolComponentId: 'tool',
    operationId: 'op',
    input: null,
    expectedDefinitionGraphDigest: digest,
    binding,
    currentDefinitionGraph: graph,
    activator,
    admissionRequest,
    admissionPorts: { governance, baselines, effectJournal },
    effectType: 'effect:x',
    dispatch: effectfulDispatch,
    resourceProvider,
    sha256,
  };
  void uxEffectful;

  const projection = await projectAgentToolSurface({
    agentId: 'agent',
    currentDefinitionGraph: graph,
    sha256,
  });
  const agentResult = await queryAgentTool({
    agentId: 'agent',
    toolComponentId: 'tool',
    operationId: 'op',
    proposal: null,
    projection,
    binding,
    currentDefinitionGraph: graph,
    dispatch: nonEffectfulDispatch,
    sha256,
  });
  void agentResult;

  const admission: AssemblyBoundComponentAdmission = await admitComponentWithAssembly(
    envelope,
    assembly,
    { currentDefinitionGraph: graph, sha256 },
  );

  // Typed fail-closed handling is expressible through the declared classes.
  try {
    await queryUxTool(uxQuery);
  } catch (error) {
    if (error instanceof UxToolRequestError) {
      const code: import('@kaicreator/domain-harness/v7/execution').UxToolRequestErrorCode =
        error.code;
      void code;
    } else if (error instanceof NonEffectfulInvocationError) {
      void error.code;
    } else if (error instanceof EffectfulInvocationError) {
      void error.code;
    } else if (error instanceof ResourceResolutionError) {
      void error.code;
    } else if (error instanceof RuntimeAssemblyError) {
      void error.code;
    } else if (error instanceof ToolImplementationBindingError) {
      void error.code;
    } else if (error instanceof AgentToolProjectionError) {
      void error.code;
    }
  }

  void validateToolComponent;
  void sealedProof;
  void observedOutput;
  void resources;
  return { assembly, verified, admission };
}
`);
    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '-D', 'typescript@5.8.3', '@types/node@22'], consumer);
    run(
      process.execPath,
      [join('node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'],
      consumer,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
