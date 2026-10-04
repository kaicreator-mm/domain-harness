/**
 * T002B invariant matrix — #568 logical Runtime Resource identity group
 * (issues #587, #601).
 *
 * Covers invariants 16-21 of the #587 tests-first matrix:
 * 16. required false -> true changes the Assembly digest;
 * 17. a resource contract exact version change changes the digest;
 * 18. an operationId change changes the digest;
 * 19. a resourceKey change changes the digest;
 * 20. declaration-order permutation (within and across declarations) does
 *     not change the digest;
 * 21. no live secret/value/handle can be represented in T002B Assembly
 *     resource identity material (structural whitelist, fail closed).
 *
 * Also pins the canonical material shape: exactly componentId, resourceKey,
 * optional contract exact ref, optional operationId, required — nothing else
 * is representable in the serialized record.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  RuntimeAssemblyError,
  sealRuntimeAssembly,
  type RuntimeAssemblyRecord,
  type RuntimeAssemblyResourceRequirementBinding,
  type SealRuntimeAssemblyInput,
} from '../../src/contracts/runtime-assembly.js';
import type {
  ToolResourceRequirement,
  ToolResourceRequirementsDeclaration,
} from '../../src/contracts/resource-requirements.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function toolComponent(componentId: string): ComponentEnvelope {
  return {
    family: 'tool',
    componentId,
    kind: { kindId: 'tool.standard', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'op.read',
          inputSchema: {},
          outputSchema: {},
          effect: 'none',
        },
        {
          operationId: 'op.write',
          inputSchema: {},
          outputSchema: {},
          effect: 'idempotent',
        },
      ],
      providesCapabilities: [],
    },
  };
}

function requirement(overrides: Partial<ToolResourceRequirement> = {}): ToolResourceRequirement {
  return {
    resourceKey: 'resource.alpha',
    contract: { contractId: 'resource.alpha.contract', version: '1.0.0' },
    operationId: 'op.read',
    required: false,
    ...overrides,
  };
}

function declaration(
  componentId: string,
  requirements: ToolResourceRequirement[],
): ToolResourceRequirementsDeclaration {
  return { componentId, requirements };
}

function resourceGraph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.resource-identity',
    components: [toolComponent('tool.alpha'), toolComponent('tool.beta')],
    relations: [],
  };
}

function resourceBindings(
  overrides: Array<{
    owner?: ComponentEnvelope;
    declaration?: ToolResourceRequirementsDeclaration;
  }> = [],
): readonly RuntimeAssemblyResourceRequirementBinding[] {
  const owners = [toolComponent('tool.alpha'), toolComponent('tool.beta')];
  const declarations = [
    declaration('tool.alpha', [requirement()]),
    declaration('tool.beta', [
      requirement({
        resourceKey: 'resource.beta',
        contract: { contractId: 'resource.beta.contract', version: '2.0.0' },
        operationId: 'op.write',
        required: true,
      }),
    ]),
  ];
  const bindings = owners.map((owner, index) => ({
    owner,
    declaration: declarations[index]!,
  }));
  overrides.forEach((override, index) => {
    bindings[index] = { ...bindings[index]!, ...override };
  });
  return bindings;
}

function kindImplementations() {
  return [
    {
      pin: {
        kind: { kindId: 'tool.standard', version: '1.0.0' },
        implementation: {
          implementationId: 'impl.tool.standard',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:tool-standard-content',
        },
      },
      understoodSemanticContracts: [],
      understoodCapabilities: [],
      validateComponent: () => {},
    },
  ];
}

function sealInput(
  overrides: Partial<Pick<SealRuntimeAssemblyInput, 'resourceRequirements'>> = {},
): SealRuntimeAssemblyInput {
  return {
    definitionGraph: resourceGraph(),
    kindImplementations: kindImplementations(),
    resourceRequirements: resourceBindings(),
    ...(overrides.resourceRequirements !== undefined
      ? { resourceRequirements: overrides.resourceRequirements }
      : {}),
  };
}

async function digestOf(
  overrides: Partial<Pick<SealRuntimeAssemblyInput, 'resourceRequirements'>> = {},
): Promise<string> {
  const sealed = await sealRuntimeAssembly(sealInput(overrides), realSha256);
  return sealed.assemblyDigest;
}

test('#587 invariant 16: required false -> true changes the Assembly digest', async () => {
  const base = await digestOf();
  const required = await digestOf({
    resourceRequirements: resourceBindings([
      {},
      {},
    ]).map((binding, index) =>
      index === 0
        ? {
            owner: binding.owner,
            declaration: declaration('tool.alpha', [requirement({ required: true })]),
          }
        : binding,
    ),
  });
  assert.notEqual(base, required);
});

test('#587 invariant 17: a resource contract exact version change changes the digest', async () => {
  const base = await digestOf();
  const changed = await digestOf({
    resourceRequirements: [
      {
        owner: toolComponent('tool.alpha'),
        declaration: declaration('tool.alpha', [
          requirement({ contract: { contractId: 'resource.alpha.contract', version: '1.0.1' } }),
        ]),
      },
      resourceBindings()![1]!,
    ],
  });
  assert.notEqual(base, changed);
});

test('#587 invariant 18: an operationId change changes the digest', async () => {
  const base = await digestOf();
  const changed = await digestOf({
    resourceRequirements: [
      {
        owner: toolComponent('tool.alpha'),
        declaration: declaration('tool.alpha', [requirement({ operationId: 'op.write' })]),
      },
      resourceBindings()![1]!,
    ],
  });
  assert.notEqual(base, changed);
});

test('#587 invariant 19: a resourceKey change changes the digest', async () => {
  const base = await digestOf();
  const changed = await digestOf({
    resourceRequirements: [
      {
        owner: toolComponent('tool.alpha'),
        declaration: declaration('tool.alpha', [
          requirement({ resourceKey: 'resource.alpha.renamed' }),
        ]),
      },
      resourceBindings()![1]!,
    ],
  });
  assert.notEqual(base, changed);
});

test('#587 invariant 20: declaration-order permutation does not change the digest', async () => {
  const base = await digestOf();

  // Permute requirement order within one declaration.
  const permutedRequirements = await digestOf({
    resourceRequirements: [
      {
        owner: toolComponent('tool.alpha'),
        declaration: declaration('tool.alpha', [
          requirement({ resourceKey: 'resource.alpha.second', required: true }),
          requirement(),
        ]),
      },
      resourceBindings()![1]!,
    ],
  });
  const swappedRequirements = await digestOf({
    resourceRequirements: [
      {
        owner: toolComponent('tool.alpha'),
        declaration: declaration('tool.alpha', [
          requirement(),
          requirement({ resourceKey: 'resource.alpha.second', required: true }),
        ]),
      },
      resourceBindings()![1]!,
    ],
  });
  assert.equal(permutedRequirements, swappedRequirements);

  // Permute declaration (binding) order across components.
  const reversed = await digestOf({
    resourceRequirements: [resourceBindings()![1]!, resourceBindings()![0]!],
  });
  assert.equal(base, reversed);
});

test('#587 invariant 21: no live secret/value/handle is representable in Assembly resource identity material', async () => {
  // A secret field inside a requirement is rejected by the T005A whitelist,
  // propagated unchanged through the sealing path.
  const withSecret = requirement() as unknown as Record<string, unknown>;
  withSecret.secret = 'hunter2';
  await assert.rejects(
    sealRuntimeAssembly(
      sealInput({
        resourceRequirements: [
          { owner: toolComponent('tool.alpha'), declaration: declaration('tool.alpha', [withSecret as unknown as ToolResourceRequirement]) },
          resourceBindings()![1]!,
        ],
      }),
      realSha256,
    ),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INVALID_RESOURCE_REQUIREMENT');
      return true;
    },
  );

  // A live-handle-shaped field on the binding entry itself is a T002B-level
  // structural rejection.
  await assert.rejects(
    sealRuntimeAssembly(
      {
        ...sealInput(),
        resourceRequirements: [
          {
            owner: toolComponent('tool.alpha'),
            declaration: declaration('tool.alpha', [requirement()]),
            connection: { host: 'localhost', port: 5432 },
          } as unknown as { owner: ComponentEnvelope; declaration: ToolResourceRequirementsDeclaration },
        ],
      },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
      return true;
    },
  );
});

test('#568: duplicate declarations for one component fail closed; canonical material is exactly the 5 normative fields', async () => {
  await assert.rejects(
    sealRuntimeAssembly(
      sealInput({
        resourceRequirements: [
          resourceBindings()![0]!,
          {
            owner: toolComponent('tool.alpha'),
            declaration: declaration('tool.alpha', [
              requirement({ resourceKey: 'resource.alpha.extra' }),
            ]),
          },
        ],
      }),
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
      return true;
    },
  );

  const sealed = await sealRuntimeAssembly(sealInput(), realSha256);
  const record: RuntimeAssemblyRecord = sealed.record;
  assert.equal(record.resourceRequirements.length, 2);
  assert.deepEqual(Object.keys(record.resourceRequirements[0]!), ['componentId', 'requirements']);
  const material = record.resourceRequirements[0]!.requirements[0]!;
  assert.deepEqual(Object.keys(material).sort(), [
    'contract',
    'operationId',
    'required',
    'resourceKey',
  ]);
  assert.deepEqual(material.contract, { contractId: 'resource.alpha.contract', version: '1.0.0' });
  // The serialized record is portable JSON: no functions, handles or secrets.
  assert.doesNotThrow(() => JSON.stringify(record));
});
