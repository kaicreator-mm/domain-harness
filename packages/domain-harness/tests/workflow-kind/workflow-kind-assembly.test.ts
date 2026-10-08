/**
 * T007A Assembly seam integration matrix (issue #610, fine-grained DAG T007A,
 * authority #589 PACK-A).
 *
 * Pins the adapter-to-Microkernel binding half of the PACK-A T007A checklist:
 *
 * - a neutral test Kind and the Workflow Kind bind through the SAME generic
 *   sealed Assembly KindImplementation seam (T002B) — no Workflow-specific
 *   kernel path exists;
 * - Kind version mismatch fails closed through the same seam;
 * - Assembly-bound validator provenance: the sealed binding carries the
 *   adapter's validator handle and admission evidence binds the exact
 *   KindImplementation pin;
 * - replacing the Workflow engine/implementation changes Assembly identity
 *   only — Definition graph identity is untouched and zero Microkernel
 *   source edits are involved (MICROKERNEL_SOURCE_DIFF=0 by construction);
 * - no XState/compiler/runtime import exists in the generic Microkernel
 *   contract files, and the adapter itself mints no execution authority
 *   (T007A does not execute; T007B owns the bridge).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  RuntimeAssemblyError,
  admitComponentWithAssembly,
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
} from '../../src/contracts/runtime-assembly.js';
import {
  WORKFLOW_KIND_REF,
  createWorkflowKindImplementation,
  validateWorkflowComponent,
} from '../../src/adapters/workflow-kind.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const NEUTRAL_KIND = { kindId: 'test.semantic.neutral', version: '1.0.0' } as const;

function neutralComponent(componentId: string): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId,
    kind: { ...NEUTRAL_KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { note: 'neutral test Kind' },
  };
}

function workflowComponent(componentId: string): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId,
    kind: { kindId: WORKFLOW_KIND_REF.kindId, version: WORKFLOW_KIND_REF.version },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      initial: 'start',
      states: [{ stateId: 'start' }, { stateId: 'done' }],
      transitions: [{ transitionId: 't1', from: 'start', to: 'done', event: 'finish' }],
    },
  };
}

function graph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.t007a',
    components: [neutralComponent('component.neutral'), workflowComponent('component.workflow')],
    relations: [],
  };
}

function neutralBinding(counter: { calls: number }): KindImplementationBindingInput {
  return {
    pin: {
      kind: { ...NEUTRAL_KIND },
      implementation: {
        implementationId: 'impl.test.semantic.neutral',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:neutral-v1',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {
      counter.calls += 1;
    },
  };
}

function workflowBinding(implementationVersion: string, implementationDigest: string) {
  return createWorkflowKindImplementation({
    implementation: {
      implementationId: 'impl.workflow.engine',
      implementationVersion,
      implementationDigest,
    },
  });
}

test('PACK-A T007A: neutral Kind and Workflow share the same generic sealed Assembly seam', async () => {
  const neutralCounter = { calls: 0 };
  const sealed = await sealRuntimeAssembly(
    {
      definitionGraph: graph(),
      kindImplementations: [
        neutralBinding(neutralCounter),
        workflowBinding('1.0.0', 'sha256:workflow-engine-v1'),
      ],
    },
    realSha256,
  );

  // Both Kinds admit through the one Assembly-bound path — no Workflow branch.
  const neutralEvidence = await admitComponentWithAssembly(
    neutralComponent('component.neutral'),
    sealed,
    { currentDefinitionGraph: graph(), sha256: realSha256 },
  );
  const workflowEvidence = await admitComponentWithAssembly(
    workflowComponent('component.workflow'),
    sealed,
    { currentDefinitionGraph: graph(), sha256: realSha256 },
  );

  assert.equal(neutralEvidence.status, 'ADMITTED');
  assert.equal(workflowEvidence.status, 'ADMITTED');
  assert.equal(neutralCounter.calls, 1);

  // Dispatch evidence carries each Kind's exact pin through the same fields.
  assert.deepEqual(neutralEvidence.admittedKind, { ...NEUTRAL_KIND });
  assert.deepEqual(workflowEvidence.admittedKind, {
    kindId: WORKFLOW_KIND_REF.kindId,
    version: WORKFLOW_KIND_REF.version,
  });
  assert.equal(
    workflowEvidence.admittedKindImplementation.implementation.implementationId,
    'impl.workflow.engine',
  );
  assert.equal(
    workflowEvidence.admittedKindImplementation.implementation.implementationDigest,
    'sha256:workflow-engine-v1',
  );

  // Assembly-bound validator provenance: the sealed binding carries the
  // adapter validator handle itself, and the evidence binds its exact pin.
  const workflowSealedBinding = sealed.bindings.find(
    (binding) => binding.pin.kind.kindId === WORKFLOW_KIND_REF.kindId,
  );
  assert.ok(workflowSealedBinding);
  assert.equal(workflowSealedBinding.validateComponent, validateWorkflowComponent);

  // The same adapter validator also dispatches through the low-level T001D
  // must-understand seam — one validator, two generic seams, zero kernel
  // edits. (The low-level seam consumes a `kind` declaration, not the
  // Assembly `pin` binding, so the understood entry is derived from the pin.)
  const { admitComponent } = await import('../../src/contracts/component-admission.js');
  const binding = workflowBinding('1.0.0', 'sha256:workflow-engine-v1');
  const lowLevel = admitComponent(workflowComponent('component.workflow'), [
    {
      kind: binding.pin.kind,
      understoodSemanticContracts: binding.understoodSemanticContracts,
      understoodCapabilities: binding.understoodCapabilities,
      validateComponent: binding.validateComponent,
    },
  ]);
  assert.equal(lowLevel.status, 'ADMITTED');
  assert.deepEqual(lowLevel.admittedKind, {
    kindId: WORKFLOW_KIND_REF.kindId,
    version: WORKFLOW_KIND_REF.version,
  });
});

test('PACK-A T007A: Workflow Kind version mismatch fails closed through the same seam', async () => {
  const sealed = await sealRuntimeAssembly(
    {
      definitionGraph: graph(),
      kindImplementations: [
        neutralBinding({ calls: 0 }),
        workflowBinding('1.0.0', 'sha256:workflow-engine-v1'),
      ],
    },
    realSha256,
  );

  // Exact-version discipline: a component claiming kaicreator.workflow@2.0.0
  // is never admitted against a 1.0.0 binding — no fallback to another version.
  const futureVersion = workflowComponent('component.workflow');
  (futureVersion as { kind: { version: string } }).kind.version = '2.0.0';
  await assert.rejects(
    admitComponentWithAssembly(futureVersion, sealed, {
      currentDefinitionGraph: graph(),
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND');
      return true;
    },
  );
});

test('PACK-A T007A: replacing the Workflow engine changes Assembly identity only, not Definition identity', async () => {
  const g = graph();
  const definitionDigest = await computeDefinitionGraphDigest(g, realSha256);

  const sealedV1 = await sealRuntimeAssembly(
    {
      definitionGraph: g,
      kindImplementations: [
        neutralBinding({ calls: 0 }),
        workflowBinding('1.0.0', 'sha256:workflow-engine-v1'),
      ],
    },
    realSha256,
  );
  const sealedV1Repeat = await sealRuntimeAssembly(
    {
      definitionGraph: g,
      kindImplementations: [
        neutralBinding({ calls: 0 }),
        workflowBinding('1.0.0', 'sha256:workflow-engine-v1'),
      ],
    },
    realSha256,
  );
  const sealedV2 = await sealRuntimeAssembly(
    {
      definitionGraph: g,
      kindImplementations: [
        neutralBinding({ calls: 0 }),
        workflowBinding('1.0.0', 'sha256:workflow-engine-v2'),
      ],
    },
    realSha256,
  );
  const sealedOtherVersion = await sealRuntimeAssembly(
    {
      definitionGraph: g,
      kindImplementations: [
        neutralBinding({ calls: 0 }),
        workflowBinding('2.0.0', 'sha256:workflow-engine-v1'),
      ],
    },
    realSha256,
  );

  // Deterministic identity + implementation replacement semantics: the
  // Assembly digest changes with the implementation pin while the Definition
  // graph digest is untouched (MICROKERNEL_SOURCE_DIFF=0 — the same generic
  // seam consumed the replacement descriptor with no kernel edit).
  assert.equal(sealedV1.assemblyDigest, sealedV1Repeat.assemblyDigest);
  assert.notEqual(sealedV1.assemblyDigest, sealedV2.assemblyDigest);
  assert.notEqual(sealedV1.assemblyDigest, sealedOtherVersion.assemblyDigest);
  assert.equal(sealedV1.record.definitionGraphDigest, definitionDigest);
  assert.equal(sealedV2.record.definitionGraphDigest, definitionDigest);
  assert.equal(sealedOtherVersion.record.definitionGraphDigest, definitionDigest);
});

test('PACK-A T007A: the sealed Assembly gains no execution authority from the Workflow binding', async () => {
  const sealed = await sealRuntimeAssembly(
    {
      definitionGraph: graph(),
      kindImplementations: [
        neutralBinding({ calls: 0 }),
        workflowBinding('1.0.0', 'sha256:workflow-engine-v1'),
      ],
    },
    realSha256,
  );

  // T007A does not execute: no dispatch/run/interpret surface anywhere.
  assert.deepEqual(Object.keys(sealed).sort(), ['assemblyDigest', 'bindings', 'record']);
  for (const forbidden of ['execute', 'run', 'interpret', 'dispatch', 'transition', 'send']) {
    assert.equal(
      (sealed as unknown as Record<string, unknown>)[forbidden],
      undefined,
      `sealed Assembly must not carry ${forbidden}`,
    );
  }
  for (const binding of sealed.bindings) {
    assert.equal(typeof binding.validateComponent, 'function');
    assert.equal((binding as unknown as Record<string, unknown>).execute, undefined);
  }
});

test('PACK-A T007A: no XState/compiler/runtime import exists in the generic Microkernel contract files', () => {
  const contractsDir = fileURLToPath(new URL('../../src/contracts/', import.meta.url));
  const files = readdirSync(contractsDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(contractsDir, name))
    .filter((path) => statSync(path).isFile());

  const FORBIDDEN_PATTERNS = [/xstate/i, /compiler/i, /engine/i, /\bnode:/];
  for (const path of files) {
    const source = readFileSync(path, 'utf8');
    const importStatements = [...source.matchAll(/import\s[^;]*?from\s+'([^']+)'/gs)].map(
      (match) => match[0],
    );
    for (const statement of importStatements) {
      for (const pattern of FORBIDDEN_PATTERNS) {
        assert.doesNotMatch(
          statement,
          pattern,
          `${path}: generic Microkernel contract must not import an engine-private dependency: ${statement}`,
        );
      }
    }
  }
});

test('PACK-A T007A: the Workflow adapter itself keeps engine types private and non-executable', () => {
  const adapterPath = fileURLToPath(
    new URL('../../src/adapters/workflow-kind.ts', import.meta.url),
  );
  const source = readFileSync(adapterPath, 'utf8');

  // T007A imports no concrete engine at all — XState/compiler/runtime types
  // can never leak into the generic authority contracts through this adapter.
  const importStatements = [...source.matchAll(/import\s[^;]*?from\s+'([^']+)'/gs)].map(
    (match) => match[0],
  );
  for (const statement of importStatements) {
    assert.doesNotMatch(statement, /xstate/i, `adapter must not import xstate: ${statement}`);
    assert.doesNotMatch(statement, /\bnode:/, `adapter must stay host-portable: ${statement}`);
  }

  // Adapter inward imports stay inside the generic contract/helper family.
  const allowedImports = [
    '../contracts/component.js',
    '../contracts/identity.js',
    '../contracts/json.js',
    '../contracts/record-safety.js',
    '../contracts/runtime-assembly.js',
  ];
  const imported = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  assert.ok(imported.length > 0, 'sanity: imports were detected');
  for (const specifier of imported) {
    assert.ok(
      allowedImports.includes(specifier),
      `unexpected inward dependency of the Workflow adapter: ${specifier}`,
    );
  }
});
