import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  COMPONENT_FAMILIES,
  ComponentContractError,
  validateComponentEnvelope,
  type CapabilityContractRef,
  type ComponentEnvelope,
  type SemanticContractRef,
} from '../../src/contracts/component.js';
import type { JsonValue } from '../../src/contracts/json.js';
import {
  COMPILED_ARTIFACT_KINDS,
  compileCompiledArtifactIdentity,
} from '../../src/v2/index.js';
import { COMPILED_ARTIFACT_KINDS as PUBLIC_BARREL_KINDS } from '../../src/public-v2/index.js';
import type { Sha256Port } from '../../src/contracts/identity.js';

/** Structural mutable view used only to inject malformed runtime values. */
type MutableEnvelope = { -readonly [K in keyof ComponentEnvelope]: ComponentEnvelope[K] };

function semanticEnvelope(overrides?: {
  family?: ComponentEnvelope['family'];
  kind?: ComponentEnvelope['kind'];
  requiredSemanticContracts?: readonly SemanticContractRef[];
  requiredCapabilities?: readonly CapabilityContractRef[];
  semanticBody?: ComponentEnvelope['semanticBody'];
  nonMaterialExtensions?: ComponentEnvelope['nonMaterialExtensions'];
}): ComponentEnvelope {
  return {
    family: overrides?.family ?? 'semantic',
    componentId: 'quote.eligibility.rule',
    kind: overrides?.kind ?? { kindId: 'decision.rule.v1', version: '1.2.0' },
    requiredSemanticContracts: overrides?.requiredSemanticContracts ?? [
      { contractId: 'customer.tier.schema', version: '2.0.0' },
    ],
    requiredCapabilities: overrides?.requiredCapabilities ?? [
      { capabilityId: 'semantic-decision', version: '1.0.0' },
    ],
    semanticBody:
      overrides?.semanticBody ?? { threshold: 100, policy: { tier: 'gold', enabled: true } },
    ...(overrides?.nonMaterialExtensions !== undefined
      ? { nonMaterialExtensions: overrides.nonMaterialExtensions }
      : {}),
  };
}

function expectFailure(mutate: (envelope: MutableEnvelope) => void, code: string): void {
  const envelope = semanticEnvelope() as unknown as MutableEnvelope;
  mutate(envelope);
  assert.throws(
    () => validateComponentEnvelope(envelope as unknown as ComponentEnvelope),
    (error: unknown) => {
      assert.ok(error instanceof ComponentContractError, 'expected ComponentContractError');
      assert.equal(error.code, code);
      assert.equal(error.name, 'ComponentContractError');
      return true;
    },
  );
}

test('T001A-R1: valid SEMANTIC envelope represents every required dimension', () => {
  const envelope = semanticEnvelope();
  validateComponentEnvelope(envelope);
  assert.equal(envelope.family, 'semantic');
  assert.equal(envelope.componentId, 'quote.eligibility.rule');
  assert.deepEqual(envelope.kind, { kindId: 'decision.rule.v1', version: '1.2.0' });
  assert.deepEqual(envelope.requiredSemanticContracts, [
    { contractId: 'customer.tier.schema', version: '2.0.0' },
  ]);
  assert.deepEqual(envelope.requiredCapabilities, [
    { capabilityId: 'semantic-decision', version: '1.0.0' },
  ]);
  assert.deepEqual(envelope.semanticBody, {
    threshold: 100,
    policy: { tier: 'gold', enabled: true },
  });
});

test('T001A-R2: the same envelope type supports the TOOL family with an open Kind ref', () => {
  const toolEnvelope: ComponentEnvelope = semanticEnvelope({
    family: 'tool',
    kind: { kindId: 'tool.http-request.v1', version: '3.1.0' },
    requiredCapabilities: [
      { capabilityId: 'outbound-http', version: '1.4.0' },
      { capabilityId: 'retry-policy', version: '1.0.0' },
    ],
  });
  validateComponentEnvelope(toolEnvelope);
  assert.equal(toolEnvelope.family, 'tool');
});

test('T001A-R3: empty or invalid logical Component id is rejected', () => {
  expectFailure((envelope) => {
    envelope.componentId = '';
  }, 'INVALID_COMPONENT_ID');
  expectFailure((envelope) => {
    envelope.componentId = '   ';
  }, 'INVALID_COMPONENT_ID');
  expectFailure((envelope) => {
    envelope.componentId = 42 as unknown as string;
  }, 'INVALID_COMPONENT_ID');
});

test('T001A-R3: floating Component id selectors are rejected, never normalized', () => {
  for (const floating of ['latest', 'current', 'active', 'default', '*', 'LATEST', ' latest ']) {
    expectFailure((envelope) => {
      envelope.componentId = floating;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  }
});

test('T001A-R4: floating Kind/semantic-contract/capability refs are rejected', () => {
  for (const floating of ['latest', 'current', 'active', 'default', '*', '1.*', '^1.0.0', '~2']) {
    expectFailure((envelope) => {
      (envelope.kind as { version: string }).version = floating;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
    expectFailure((envelope) => {
      (envelope.requiredSemanticContracts[0] as { version: string }).version = floating;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
    expectFailure((envelope) => {
      (envelope.requiredCapabilities[0] as { version: string }).version = floating;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  }
  expectFailure((envelope) => {
    (envelope.kind as { kindId: string }).kindId = 'default';
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  expectFailure((envelope) => {
    (envelope.requiredCapabilities[0] as { capabilityId: string }).capabilityId = 'current';
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
});

test('T001A-R4: malformed/unversioned authority refs are rejected with typed failures', () => {
  expectFailure((envelope) => {
    (envelope.kind as { version: string }).version = '';
  }, 'INVALID_KIND_REF');
  expectFailure((envelope) => {
    (envelope.kind as { version: string }).version = '   ';
  }, 'INVALID_KIND_REF');
  expectFailure((envelope) => {
    envelope.kind = { kindId: 'decision.rule.v1' } as unknown as ComponentEnvelope['kind'];
  }, 'INVALID_KIND_REF');
  expectFailure((envelope) => {
    (envelope.requiredSemanticContracts[0] as { version: string }).version = '';
  }, 'INVALID_SEMANTIC_CONTRACT_REF');
  expectFailure((envelope) => {
    (envelope.requiredCapabilities[0] as { version: string }).version = '';
  }, 'INVALID_CAPABILITY_REF');
  expectFailure((envelope) => {
    (envelope.requiredCapabilities[0] as { capabilityId: string }).capabilityId =
      'outbound-http@latest';
  }, 'INVALID_CAPABILITY_REF');
});

test('T001A-R4: refs carrying identity-smuggling keys are rejected', () => {
  expectFailure((envelope) => {
    envelope.kind = {
      kindId: 'decision.rule.v1',
      version: '1.2.0',
      implementationId: 'rule-engine-impl@9',
    } as unknown as ComponentEnvelope['kind'];
  }, 'INVALID_KIND_REF');
});

test('T001A-R5: Kind ref is semantic contract identity only — no implementation identity required', () => {
  const minimalKind: ComponentEnvelope['kind'] = { kindId: 'decision.rule.v1', version: '1.2.0' };
  const envelope = semanticEnvelope({ kind: minimalKind });
  validateComponentEnvelope(envelope);
  assert.deepEqual(Object.keys(envelope.kind).sort(), ['kindId', 'version']);
});

test('T001A-R5: an open novel Kind id validates without any closed catalog', () => {
  const envelope = semanticEnvelope({
    kind: { kindId: 'com.kaicreator.example.brand-new-kind', version: '0.1.0' },
  });
  validateComponentEnvelope(envelope);
});

test('T001A-R6: required ref collections cannot contain malformed refs or duplicates', () => {
  expectFailure((envelope) => {
    (envelope.requiredSemanticContracts[0] as { contractId: string }).contractId = '';
  }, 'INVALID_SEMANTIC_CONTRACT_REF');
  expectFailure((envelope) => {
    envelope.requiredSemanticContracts = [
      { contractId: 'customer.tier.schema', version: '2.0.0' },
      { contractId: '', version: '1.0.0' },
    ];
  }, 'INVALID_SEMANTIC_CONTRACT_REF');
  expectFailure((envelope) => {
    envelope.requiredSemanticContracts = [
      { contractId: 'customer.tier.schema', version: '2.0.0' },
      { contractId: 'customer.tier.schema', version: '2.0.0' },
    ];
  }, 'INVALID_SEMANTIC_CONTRACT_REF');
  expectFailure((envelope) => {
    envelope.requiredCapabilities = [
      { capabilityId: 'outbound-http', version: '1.4.0' },
      { capabilityId: 'outbound-http', version: '1.4.0' },
    ];
  }, 'INVALID_CAPABILITY_REF');
  expectFailure((envelope) => {
    envelope.requiredCapabilities = [
      { capabilityId: 'outbound-http', version: '1.4.0' },
      { capabilityId: 'outbound-http', version: '2.0.0' },
    ];
  }, 'INVALID_CAPABILITY_REF');
  expectFailure((envelope) => {
    envelope.requiredSemanticContracts =
      null as unknown as ComponentEnvelope['requiredSemanticContracts'];
  }, 'INVALID_SEMANTIC_CONTRACT_REF');

  const noRequiredRefs = semanticEnvelope({
    requiredSemanticContracts: [],
    requiredCapabilities: [],
  });
  validateComponentEnvelope(noRequiredRefs);
});

test('T001A-R7: semanticBody must remain portable JSON material', () => {
  const portable = semanticEnvelope({
    semanticBody: { nested: [1, 2.5, true, null, 'text', { deep: { ok: true } }] },
  });
  validateComponentEnvelope(portable);

  expectFailure((envelope) => {
    envelope.semanticBody = Number.NaN;
  }, 'INVALID_SEMANTIC_BODY');
  expectFailure((envelope) => {
    envelope.semanticBody = Number.POSITIVE_INFINITY;
  }, 'INVALID_SEMANTIC_BODY');
  expectFailure((envelope) => {
    envelope.semanticBody = [1, undefined, 3] as unknown as ComponentEnvelope['semanticBody'];
  }, 'INVALID_SEMANTIC_BODY');
  expectFailure((envelope) => {
    envelope.semanticBody = (() => 'not material') as unknown as ComponentEnvelope['semanticBody'];
  }, 'INVALID_SEMANTIC_BODY');
  expectFailure((envelope) => {
    envelope.semanticBody = Symbol('not material') as unknown as ComponentEnvelope['semanticBody'];
  }, 'INVALID_SEMANTIC_BODY');
  expectFailure((envelope) => {
    envelope.semanticBody = new Date(
      '2024-01-01T00:00:00Z',
    ) as unknown as ComponentEnvelope['semanticBody'];
  }, 'INVALID_SEMANTIC_BODY');
  expectFailure((envelope) => {
    const circular: unknown[] = [];
    circular.push(circular);
    envelope.semanticBody = circular as unknown as ComponentEnvelope['semanticBody'];
  }, 'INVALID_SEMANTIC_BODY');
});

test('T001A-R8: non-material extensions are represented separately from semanticBody', () => {
  const withExtensions = semanticEnvelope({
    semanticBody: { threshold: 100 },
    nonMaterialExtensions: {
      display: { label: 'Quote Eligibility', icon: 'shield' },
      provenance: { authoredBy: 'team-credit', traceId: 'abc-123' },
    },
  });
  validateComponentEnvelope(withExtensions);
  assert.deepEqual(withExtensions.semanticBody, { threshold: 100 });

  expectFailure((envelope) => {
    envelope.nonMaterialExtensions = new Map([
      ['key', 'value'],
    ]) as unknown as JsonValue;
  }, 'INVALID_NON_MATERIAL_EXTENSIONS');

  expectFailure((envelope) => {
    envelope.nonMaterialExtensions = (() => 'meta') as unknown as JsonValue;
  }, 'INVALID_NON_MATERIAL_EXTENSIONS');

  const withoutExtensions = semanticEnvelope();
  validateComponentEnvelope(withoutExtensions);
  assert.equal('nonMaterialExtensions' in withoutExtensions, false);
});

test('T001A-R8: envelope rejects unknown top-level identity-smuggling fields', () => {
  expectFailure((envelope) => {
    Object.assign(envelope, { implementationId: 'rule-engine-impl@9' });
  }, 'INVALID_COMPONENT_ENVELOPE');
  expectFailure((envelope) => {
    Object.assign(envelope, { assemblyDigest: 'sha256:abc' });
  }, 'INVALID_COMPONENT_ENVELOPE');
});

test('T001A-R9: legacy CompiledArtifactKind surface remains unchanged', async () => {
  const expectedKinds = [
    'rule',
    'knowledge',
    'skill',
    'tool',
    'output-schema',
    'workflow',
    'promoted-subworkflow',
    'harness-config',
  ];
  assert.deepEqual([...COMPILED_ARTIFACT_KINDS], expectedKinds);
  assert.deepEqual([...PUBLIC_BARREL_KINDS], expectedKinds);
  assert.equal(PUBLIC_BARREL_KINDS, COMPILED_ARTIFACT_KINDS);

  const sha256: Sha256Port = {
    async digestUtf8(value: string): Promise<string> {
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };
  const identity = await compileCompiledArtifactIdentity(
    {
      kind: 'rule',
      artifactId: 'quote.eligibility',
      semanticMaterial: { threshold: 100 },
    },
    sha256,
  );
  assert.equal(identity.kind, 'rule');
  assert.match(identity.contentDigest, /^[0-9a-f]{64}$/);
});

test('T001A-R10: the new Component core adds no closed Workflow/Rule/Skill/Tool catalog', async () => {
  assert.deepEqual([...COMPONENT_FAMILIES], ['semantic', 'tool']);
  assert.equal(Object.isFrozen(COMPONENT_FAMILIES), true);

  const componentContract = await import('../../src/contracts/component.js');
  assert.deepEqual(Object.keys(componentContract).sort(), [
    'COMPONENT_FAMILIES',
    'ComponentContractError',
    'validateComponentEnvelope',
  ]);
});

test('T001A: invalid family values are rejected without silent normalization', () => {
  expectFailure((envelope) => {
    envelope.family = 'SEMANTIC' as unknown as ComponentEnvelope['family'];
  }, 'INVALID_COMPONENT_FAMILY');
  expectFailure((envelope) => {
    envelope.family = 'workflow' as unknown as ComponentEnvelope['family'];
  }, 'INVALID_COMPONENT_FAMILY');
  expectFailure((envelope) => {
    envelope.family = undefined as unknown as ComponentEnvelope['family'];
  }, 'INVALID_COMPONENT_FAMILY');
});
