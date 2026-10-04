import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  ComponentContractError,
  validateComponentEnvelope,
  type CapabilityContractRef,
  type ComponentEnvelope,
  type SemanticContractRef,
} from '../../src/contracts/component.js';
import {
  COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7,
  ComponentDigestError,
  componentSemanticDigestMaterial,
  computeComponentSemanticDigest,
} from '../../src/contracts/component-digest.js';
import {
  computeCanonicalJsonDigest,
  IdentityContractError,
  type Sha256Port,
} from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import { compileCompiledArtifactIdentity } from '../../src/v2/index.js';

/** Structural mutable view used only to inject malformed runtime values. */
type MutableEnvelope = { -readonly [K in keyof ComponentEnvelope]: ComponentEnvelope[K] };

function sha256(): Sha256Port {
  return {
    async digestUtf8(value: string): Promise<string> {
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };
}

function semanticEnvelope(overrides?: {
  family?: ComponentEnvelope['family'];
  componentId?: ComponentEnvelope['componentId'];
  kind?: ComponentEnvelope['kind'];
  requiredSemanticContracts?: readonly SemanticContractRef[];
  requiredCapabilities?: readonly CapabilityContractRef[];
  semanticBody?: ComponentEnvelope['semanticBody'];
  nonMaterialExtensions?: ComponentEnvelope['nonMaterialExtensions'];
}): ComponentEnvelope {
  return {
    family: overrides?.family ?? 'semantic',
    componentId: overrides?.componentId ?? 'quote.eligibility.rule',
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

function captureDigestError(throwing: () => unknown): ComponentDigestError {
  try {
    throwing();
  } catch (error) {
    assert.ok(error instanceof ComponentDigestError, 'expected a ComponentDigestError');
    return error;
  }
  throw new Error('expected a ComponentDigestError to be thrown');
}

async function captureGateError(envelope: ComponentEnvelope): Promise<unknown> {
  try {
    await computeComponentSemanticDigest(envelope, sha256());
  } catch (error) {
    return error;
  }
  throw new Error('expected computeComponentSemanticDigest to reject');
}

async function expectGateCode(envelope: unknown, code: string): Promise<void> {
  await assert.rejects(
    () => computeComponentSemanticDigest(envelope as ComponentEnvelope, sha256()),
    (error: unknown) => {
      assert.ok(
        error instanceof ComponentContractError,
        `expected ComponentContractError, got ${String(error)}`,
      );
      assert.equal((error as ComponentContractError).code, code);
      assert.equal(error instanceof ComponentDigestError, false);
      return true;
    },
  );
}

test('T001B-R1: digest is deterministic across repeated invocations and distinct Sha256Port instances', async () => {
  const envelope = semanticEnvelope();
  const first = await computeComponentSemanticDigest(envelope, sha256());
  const second = await computeComponentSemanticDigest(envelope, sha256());
  const third = await computeComponentSemanticDigest(envelope, sha256());
  assert.equal(typeof first, 'string');
  assert.ok(first.length > 0);
  assert.equal(first, second);
  assert.equal(second, third);
});

test('T001B-R1: digest computation is read-only over its input envelope', async () => {
  const envelope = semanticEnvelope({
    nonMaterialExtensions: { provenance: { traceId: 'trace-1' } },
  });
  const snapshot = structuredClone(envelope);
  await computeComponentSemanticDigest(envelope, sha256());
  assert.deepEqual(envelope, snapshot);
  componentSemanticDigestMaterial(envelope);
  assert.deepEqual(envelope, snapshot);
});

test('T001B-R2: every behaviorally material change alters the digest', async () => {
  const baseline = await computeComponentSemanticDigest(semanticEnvelope(), sha256());
  const mutations: Array<[string, (envelope: MutableEnvelope) => void]> = [
    ['family flip semantic -> tool', (envelope) => {
      envelope.family = 'tool';
    }],
    ['kind.kindId change', (envelope) => {
      (envelope.kind as { kindId: string }).kindId = 'decision.rule.v2';
    }],
    ['kind.version change', (envelope) => {
      (envelope.kind as { version: string }).version = '1.2.1';
    }],
    ['requiredSemanticContracts contractId change', (envelope) => {
      (envelope.requiredSemanticContracts[0] as { contractId: string }).contractId =
        'customer.tier.schema.v2';
    }],
    ['requiredSemanticContracts version change', (envelope) => {
      (envelope.requiredSemanticContracts[0] as { version: string }).version = '2.0.1';
    }],
    ['requiredCapabilities capabilityId change', (envelope) => {
      (envelope.requiredCapabilities[0] as { capabilityId: string }).capabilityId =
        'semantic-decision-v2';
    }],
    ['requiredCapabilities version change', (envelope) => {
      (envelope.requiredCapabilities[0] as { version: string }).version = '1.0.1';
    }],
    ['deep semanticBody value change', (envelope) => {
      envelope.semanticBody = { threshold: 100, policy: { tier: 'gold', enabled: false } };
    }],
    ['added required semantic ref', (envelope) => {
      envelope.requiredSemanticContracts = [
        { contractId: 'customer.tier.schema', version: '2.0.0' },
        { contractId: 'pricing.policy.schema', version: '1.0.0' },
      ];
    }],
  ];
  for (const [label, mutate] of mutations) {
    const mutated = semanticEnvelope() as unknown as MutableEnvelope;
    mutate(mutated);
    const digest = await computeComponentSemanticDigest(
      mutated as unknown as ComponentEnvelope,
      sha256(),
    );
    assert.notEqual(digest, baseline, label);
  }
});

test('T001B-R2: array order inside semanticBody is material; object key order is not', async () => {
  const body = { steps: ['parse', 'validate', 'commit'], flags: { a: 1, b: 2 } };
  const baseline = await computeComponentSemanticDigest(
    semanticEnvelope({ semanticBody: body }),
    sha256(),
  );
  const keyReordered = await computeComponentSemanticDigest(
    semanticEnvelope({ semanticBody: { flags: { b: 2, a: 1 }, steps: ['parse', 'validate', 'commit'] } }),
    sha256(),
  );
  assert.equal(keyReordered, baseline);
  const arrayReordered = await computeComponentSemanticDigest(
    semanticEnvelope({ semanticBody: { flags: { a: 1, b: 2 }, steps: ['parse', 'commit', 'validate'] } }),
    sha256(),
  );
  assert.notEqual(arrayReordered, baseline);
  const arraySwapped = await computeComponentSemanticDigest(
    semanticEnvelope({ semanticBody: { steps: ['validate', 'parse', 'commit'], flags: { a: 1, b: 2 } } }),
    sha256(),
  );
  assert.notEqual(arraySwapped, baseline);
  assert.notEqual(arraySwapped, arrayReordered);
});

test('T001B-R2: componentId is excluded from digest material (T001C pairs id with digest)', async () => {
  const one = await computeComponentSemanticDigest(
    semanticEnvelope({ componentId: 'quote.eligibility.rule' }),
    sha256(),
  );
  const other = await computeComponentSemanticDigest(
    semanticEnvelope({ componentId: 'quote.eligibility.rule.backup' }),
    sha256(),
  );
  assert.equal(one, other);
});

test('T001B-R2: promotion into semanticBody is an authoring act, never automatic', async () => {
  const provenance = { authoredBy: 'team-credit', traceId: 'abc-123' };
  const bare = await computeComponentSemanticDigest(semanticEnvelope(), sha256());
  const excluded = await computeComponentSemanticDigest(
    semanticEnvelope({ nonMaterialExtensions: { provenance } }),
    sha256(),
  );
  assert.equal(excluded, bare);
  const promoted = await computeComponentSemanticDigest(
    semanticEnvelope({ semanticBody: { provenance } }),
    sha256(),
  );
  assert.notEqual(promoted, bare);
});

test('T001B-R3: required-ref collections are order-insensitive in the digest', async () => {
  const contracts = [
    { contractId: 'customer.tier.schema', version: '2.0.0' },
    { contractId: 'pricing.policy.schema', version: '1.0.0' },
    { contractId: 'fx.rate.feed', version: '3.2.1' },
  ];
  const capabilities = [
    { capabilityId: 'semantic-decision', version: '1.0.0' },
    { capabilityId: 'outbound-http', version: '1.4.0' },
  ];
  const forward = semanticEnvelope({
    requiredSemanticContracts: contracts,
    requiredCapabilities: capabilities,
  });
  const reversed = semanticEnvelope({
    requiredSemanticContracts: [...contracts].reverse(),
    requiredCapabilities: [...capabilities].reverse(),
  });
  const rotated = semanticEnvelope({
    requiredSemanticContracts: [
      { contractId: 'pricing.policy.schema', version: '1.0.0' },
      { contractId: 'fx.rate.feed', version: '3.2.1' },
      { contractId: 'customer.tier.schema', version: '2.0.0' },
    ],
    requiredCapabilities: [
      { capabilityId: 'outbound-http', version: '1.4.0' },
      { capabilityId: 'semantic-decision', version: '1.0.0' },
    ],
  });
  const forwardDigest = await computeComponentSemanticDigest(forward, sha256());
  assert.equal(await computeComponentSemanticDigest(reversed, sha256()), forwardDigest);
  assert.equal(await computeComponentSemanticDigest(rotated, sha256()), forwardDigest);
  assert.deepEqual(
    componentSemanticDigestMaterial(reversed),
    componentSemanticDigestMaterial(forward),
  );
});

test('T001B-R4: duplicate required refs propagate the envelope-level codes through the digest gate', async () => {
  const duplicateContract = semanticEnvelope({
    requiredSemanticContracts: [
      { contractId: 'customer.tier.schema', version: '2.0.0' },
      { contractId: 'customer.tier.schema', version: '2.0.0' },
    ],
  });
  await expectGateCode(duplicateContract, 'INVALID_SEMANTIC_CONTRACT_REF');
  const duplicateContractDifferentVersion = semanticEnvelope({
    requiredSemanticContracts: [
      { contractId: 'customer.tier.schema', version: '2.0.0' },
      { contractId: 'customer.tier.schema', version: '3.0.0' },
    ],
  });
  await expectGateCode(duplicateContractDifferentVersion, 'INVALID_SEMANTIC_CONTRACT_REF');
  const duplicateCapability = semanticEnvelope({
    requiredCapabilities: [
      { capabilityId: 'outbound-http', version: '1.4.0' },
      { capabilityId: 'outbound-http', version: '1.4.0' },
    ],
  });
  await expectGateCode(duplicateCapability, 'INVALID_CAPABILITY_REF');
  const duplicateCapabilityDifferentVersion = semanticEnvelope({
    requiredCapabilities: [
      { capabilityId: 'outbound-http', version: '1.4.0' },
      { capabilityId: 'outbound-http', version: '2.0.0' },
    ],
  });
  await expectGateCode(duplicateCapabilityDifferentVersion, 'INVALID_CAPABILITY_REF');
});

test('T001B-R4: the standalone material normalizer fails duplicates with the digest-level code', () => {
  const duplicateContract = semanticEnvelope({
    requiredSemanticContracts: [
      { contractId: 'customer.tier.schema', version: '2.0.0' },
      { contractId: 'customer.tier.schema', version: '2.0.0' },
    ],
  });
  const contractError = captureDigestError(() => componentSemanticDigestMaterial(duplicateContract));
  assert.equal(contractError.code, 'UNNORMALIZABLE_REQUIRED_REFS');
  const duplicateCapability = semanticEnvelope({
    requiredCapabilities: [
      { capabilityId: 'outbound-http', version: '1.4.0' },
      { capabilityId: 'outbound-http', version: '1.4.0' },
    ],
  });
  const capabilityError = captureDigestError(() =>
    componentSemanticDigestMaterial(duplicateCapability),
  );
  assert.equal(capabilityError.code, 'UNNORMALIZABLE_REQUIRED_REFS');
});

test('T001B-R5: nonMaterialExtensions never reaches digest material', async () => {
  const body = { threshold: 100 };
  const bare = await computeComponentSemanticDigest(
    semanticEnvelope({ semanticBody: body }),
    sha256(),
  );
  const variants = [
    semanticEnvelope({ semanticBody: body }),
    semanticEnvelope({ semanticBody: body, nonMaterialExtensions: {} }),
    semanticEnvelope({
      semanticBody: body,
      nonMaterialExtensions: {
        display: { label: 'Quote Eligibility', icon: 'shield' },
        provenance: { authoredBy: 'team-credit', traceId: 'trace-1' },
      },
    }),
    semanticEnvelope({
      semanticBody: body,
      nonMaterialExtensions: {
        audit: { reviewers: ['alice', 'bob'], emittedAt: '2026-01-01T00:00:00Z' },
        deep: { nested: { blob: { payload: [1, 2, 3] } } },
      },
    }),
  ];
  const digests: string[] = [];
  for (const variant of variants) {
    digests.push(await computeComponentSemanticDigest(variant, sha256()));
  }
  assert.equal(new Set(digests).size, 1);
  assert.equal(digests[0], bare);

  const mutable = semanticEnvelope({ semanticBody: body }) as unknown as MutableEnvelope;
  const beforeMutation = await computeComponentSemanticDigest(
    mutable as unknown as ComponentEnvelope,
    sha256(),
  );
  mutable.nonMaterialExtensions = { mutatedAfterFirstDigest: true } as JsonValue;
  const afterMutation = await computeComponentSemanticDigest(
    mutable as unknown as ComponentEnvelope,
    sha256(),
  );
  assert.equal(afterMutation, beforeMutation);
  assert.equal(beforeMutation, bare);
});

test('T001B-R6: implementation identity is unrepresentable on the validated digest input', async () => {
  for (const smuggled of ['assemblyDigest', 'implementation', 'moduleId', 'providerId']) {
    const envelope = Object.assign(semanticEnvelope(), { [smuggled]: 'sha256:abc' });
    await expectGateCode(envelope, 'INVALID_COMPONENT_ENVELOPE');
    assert.throws(
      () => validateComponentEnvelope(envelope),
      (error: unknown) =>
        error instanceof ComponentContractError &&
        error.code === 'INVALID_COMPONENT_ENVELOPE',
      smuggled,
    );
  }
});

test('T001B-R6: provenance/display/lifecycle metadata inside nonMaterialExtensions never changes the digest', async () => {
  const bare = await computeComponentSemanticDigest(semanticEnvelope(), sha256());
  const payloads: JsonValue[] = [
    { provenance: { authoredBy: 'team-credit', traceId: 'abc-123' } },
    { display: { label: 'Quote Eligibility', icon: 'shield', locale: 'en-US' } },
    { lifecycle: { stage: 'deprecated', retiredBy: 'ops-team' } },
  ];
  for (const payload of payloads) {
    const digest = await computeComponentSemanticDigest(
      semanticEnvelope({ nonMaterialExtensions: payload }),
      sha256(),
    );
    assert.equal(digest, bare, JSON.stringify(payload));
  }
});

test('T001B-R7: material ref normalization is canonical and reconstructs fresh plain two-key objects', () => {
  const zetContract: SemanticContractRef = { contractId: 'zet.core', version: '9.0.0' };
  const alphaContract: SemanticContractRef = { contractId: 'alpha.core', version: '1.0.0' };
  const zetaCapability: CapabilityContractRef = {
    capabilityId: 'zeta.capability',
    version: '2.0.0',
  };
  const alphaCapability: CapabilityContractRef = {
    capabilityId: 'alpha.capability',
    version: '1.0.0',
  };
  const envelope = semanticEnvelope({
    requiredSemanticContracts: [zetContract, alphaContract],
    requiredCapabilities: [zetaCapability, alphaCapability],
  });
  const material = componentSemanticDigestMaterial(envelope);
  assert.equal(Object.keys(material)[0], 'digestDomain');
  assert.deepEqual(Object.keys(material).sort(), [
    'digestDomain',
    'family',
    'kind',
    'requiredCapabilities',
    'requiredSemanticContracts',
    'semanticBody',
  ]);
  assert.equal(material.digestDomain, COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7);
  assert.deepEqual(material.kind, { kindId: 'decision.rule.v1', version: '1.2.0' });
  assert.deepEqual(material.requiredSemanticContracts, [
    { contractId: 'alpha.core', version: '1.0.0' },
    { contractId: 'zet.core', version: '9.0.0' },
  ]);
  assert.deepEqual(material.requiredCapabilities, [
    { capabilityId: 'alpha.capability', version: '1.0.0' },
    { capabilityId: 'zeta.capability', version: '2.0.0' },
  ]);

  const [contractRef] = material.requiredSemanticContracts;
  assert.ok(contractRef, 'material must carry the normalized semantic contract ref');
  assert.notEqual(contractRef, alphaContract);
  assert.equal(Object.getPrototypeOf(contractRef), Object.prototype);
  assert.deepEqual(Object.keys(contractRef).sort(), ['contractId', 'version']);
  const [capabilityRef] = material.requiredCapabilities;
  assert.ok(capabilityRef, 'material must carry the normalized capability ref');
  assert.notEqual(capabilityRef, alphaCapability);
  assert.equal(Object.getPrototypeOf(capabilityRef), Object.prototype);
  assert.deepEqual(Object.keys(capabilityRef).sort(), ['capabilityId', 'version']);
});

test('T001B-R7: refs accepted despite exotic prototypes digest identically to plain-object twins', async () => {
  class ExoticContractRef {
    contractId = 'customer.tier.schema';
    version = '2.0.0';
  }
  class ExoticCapabilityRef {
    capabilityId = 'semantic-decision';
    version = '1.0.0';
  }
  const plainTwin = semanticEnvelope();
  const exotic = semanticEnvelope({
    requiredSemanticContracts: [new ExoticContractRef() as unknown as SemanticContractRef],
    requiredCapabilities: [new ExoticCapabilityRef() as unknown as CapabilityContractRef],
  });
  validateComponentEnvelope(exotic);
  const exoticMaterial = componentSemanticDigestMaterial(exotic);
  const plainMaterial = componentSemanticDigestMaterial(plainTwin);
  assert.deepEqual(exoticMaterial, plainMaterial);
  const [exoticContractRef] = exoticMaterial.requiredSemanticContracts;
  assert.ok(exoticContractRef, 'material must carry the normalized semantic contract ref');
  assert.equal(Object.getPrototypeOf(exoticContractRef), Object.prototype);
  assert.equal(
    await computeComponentSemanticDigest(exotic, sha256()),
    await computeComponentSemanticDigest(plainTwin, sha256()),
  );

  const nullPrototypeRef = Object.assign(Object.create(null), {
    contractId: 'customer.tier.schema',
    version: '2.0.0',
  }) as unknown as SemanticContractRef;
  const nullProtoEnvelope = semanticEnvelope({ requiredSemanticContracts: [nullPrototypeRef] });
  validateComponentEnvelope(nullProtoEnvelope);
  assert.deepEqual(componentSemanticDigestMaterial(nullProtoEnvelope), plainMaterial);
});

test('T001B-R8: the v0.7 Component digest domain is frozen, versioned, and separated from legacy artifact identity', async () => {
  assert.equal(COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7, 'domain-harness.v0.7.component-semantic');
  assert.ok(COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7.length > 0);
  assert.ok(COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7.includes('v0.7'));
  assert.equal(Object.isFrozen(COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7), true);

  const body = { threshold: 100, policy: { tier: 'gold', enabled: true } };
  const legacy = await compileCompiledArtifactIdentity(
    { kind: 'rule', artifactId: 'quote.eligibility', semanticMaterial: body },
    sha256(),
  );
  const componentDigest = await computeComponentSemanticDigest(
    semanticEnvelope({ semanticBody: body }),
    sha256(),
  );
  assert.match(legacy.contentDigest, /^[0-9a-f]{64}$/);
  assert.match(componentDigest, /^[0-9a-f]{64}$/);
  assert.notEqual(componentDigest, legacy.contentDigest);
});

test('T001B-R8: identical material under any other domain tag yields a different digest', async () => {
  const envelope = semanticEnvelope();
  const material = componentSemanticDigestMaterial(envelope);
  const componentDigest = await computeComponentSemanticDigest(envelope, sha256());
  const definitionGraphSimulacrum = {
    ...material,
    digestDomain: 'domain-harness.v0.7.definition-graph.placeholder',
  };
  const otherDomainDigest = await computeCanonicalJsonDigest(definitionGraphSimulacrum, sha256());
  assert.notEqual(componentDigest, otherDomainDigest);
  assert.match(otherDomainDigest, /^[0-9a-f]{64}$/);
});

test('T001B-R9: canonical-JSON hostility inside semanticBody fails the material normalizer deterministically', () => {
  const circularObject: Record<string, unknown> = { ok: true };
  circularObject['self'] = circularObject;
  const circularArray: unknown[] = ['a'];
  circularArray.push(circularArray);
  // Built with delete (not a literal with an elision) to keep no-sparse-arrays
  // lint-clean while still producing a real hole at index 1.
  const sparseArray: unknown[] = [1, 2, 3];
  delete sparseArray[1];
  const symbolKeyed = Object.assign({ ok: true }, { [Symbol('extra')]: 'value' });
  class LocalValueHolder {
    hidden = 'value';
  }
  const nonEnumerableOnly = Object.defineProperties(
    {},
    {
      visible: { value: 1, enumerable: true },
      shadow: { value: 2, enumerable: false },
    },
  );
  const hostileBodies: Array<[string, unknown]> = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['undefined', undefined],
    ['function', () => 'not material'],
    ['Symbol value', Symbol('not material')],
    ['Symbol-keyed property', symbolKeyed],
    ['Date instance', new Date('2026-01-01T00:00:00Z')],
    ['class instance', new LocalValueHolder()],
    ['circular object', circularObject],
    ['circular array', circularArray],
    ['sparse array', sparseArray],
    ['non-enumerable property', nonEnumerableOnly],
  ];
  for (const [label, value] of hostileBodies) {
    // Spread-override instead of the builder: an explicit undefined must stay
    // present as the semanticBody value (the builder's ?? would substitute a
    // valid default body for it).
    const envelope: ComponentEnvelope = {
      ...semanticEnvelope(),
      semanticBody: value as ComponentEnvelope['semanticBody'],
    };
    const first = captureDigestError(() => componentSemanticDigestMaterial(envelope));
    assert.equal(first.code, 'NON_CANONICAL_JSON', label);
    assert.equal(first.name, 'ComponentDigestError', label);
    const second = captureDigestError(() => componentSemanticDigestMaterial(envelope));
    assert.equal(second.code, first.code, label);
    assert.equal(second.message, first.message, label);
  }
});

test('T001B-R9: canonical-JSON hostility inside a required-ref entry fails the material normalizer deterministically', () => {
  class LocalEmptyRef {}
  const circularRef: Record<string, unknown> = { contractId: 'x.core', version: '1.0.0' };
  circularRef['self'] = circularRef;
  const sparseArray: unknown[] = [1, 2, 3];
  delete sparseArray[1];
  const hostileRefs: Array<[string, unknown, string]> = [
    ['NaN entry', Number.NaN, 'UNNORMALIZABLE_REQUIRED_REFS'],
    ['Infinity entry', Number.POSITIVE_INFINITY, 'UNNORMALIZABLE_REQUIRED_REFS'],
    ['undefined entry', undefined, 'UNNORMALIZABLE_REQUIRED_REFS'],
    ['function entry', () => 'not a ref', 'UNNORMALIZABLE_REQUIRED_REFS'],
    ['Symbol entry', Symbol('nope'), 'UNNORMALIZABLE_REQUIRED_REFS'],
    ['Date entry', new Date('2026-01-01T00:00:00Z'), 'UNNORMALIZABLE_REQUIRED_REFS'],
    ['empty class instance entry', new LocalEmptyRef(), 'UNNORMALIZABLE_REQUIRED_REFS'],
    ['circular object entry', circularRef, 'UNNORMALIZABLE_REQUIRED_REFS'],
    ['sparse array entry', sparseArray, 'UNNORMALIZABLE_REQUIRED_REFS'],
    [
      'Symbol-keyed ref entry',
      Object.assign({ contractId: 'x.core', version: '1.0.0' }, { [Symbol('extra')]: 'value' }),
      'NON_CANONICAL_JSON',
    ],
  ];
  for (const [label, entry, code] of hostileRefs) {
    const envelope = semanticEnvelope({
      requiredSemanticContracts: [entry as SemanticContractRef],
    });
    const first = captureDigestError(() => componentSemanticDigestMaterial(envelope));
    assert.equal(first.code, code, label);
    assert.equal(first.name, 'ComponentDigestError', label);
    const second = captureDigestError(() => componentSemanticDigestMaterial(envelope));
    assert.equal(second.code, first.code, label);
    assert.equal(second.message, first.message, label);
  }
});

test('T001B-R10: the digest gate applies validateComponentEnvelope first and propagates its exact typed codes', async () => {
  await expectGateCode(
    Object.assign(semanticEnvelope(), { assemblyDigest: 'sha256:abc' }),
    'INVALID_COMPONENT_ENVELOPE',
  );
  await expectGateCode(semanticEnvelope({ componentId: '' }), 'INVALID_COMPONENT_ID');
  await expectGateCode(
    semanticEnvelope({ kind: { kindId: 'decision.rule.v1' } as ComponentEnvelope['kind'] }),
    'INVALID_KIND_REF',
  );
  await expectGateCode(
    semanticEnvelope({
      kind: {
        kindId: 'decision.rule.v1',
        version: '1.2.0',
        implementationId: 'rule-engine-impl@9',
      } as ComponentEnvelope['kind'],
    }),
    'INVALID_KIND_REF',
  );
  await expectGateCode(
    semanticEnvelope({
      requiredSemanticContracts: [{ contractId: '', version: '1.0.0' }],
    }),
    'INVALID_SEMANTIC_CONTRACT_REF',
  );
  await expectGateCode(
    semanticEnvelope({ requiredCapabilities: [{ capabilityId: 'cap', version: '' }] }),
    'INVALID_CAPABILITY_REF',
  );
  await expectGateCode(
    semanticEnvelope({ semanticBody: Number.NaN as unknown as JsonValue }),
    'INVALID_SEMANTIC_BODY',
  );
  await expectGateCode(
    semanticEnvelope({ nonMaterialExtensions: new Map([['key', 'value']]) as unknown as JsonValue }),
    'INVALID_NON_MATERIAL_EXTENSIONS',
  );
});

test('T001B-R10: floating selectors are forbidden in digest input, never normalized', async () => {
  const selectorTokens = [
    'latest',
    'current',
    'active',
    'default',
    '*',
    '^1.0.0',
    '~2.0.0',
    '<1.0.0',
    '>1.0.0',
    '1.0.0|2.0.0',
  ];
  for (const token of selectorTokens) {
    await expectGateCode(
      semanticEnvelope({ kind: { kindId: 'decision.rule.v1', version: token } }),
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
    );
    await expectGateCode(
      semanticEnvelope({
        requiredSemanticContracts: [{ contractId: 'customer.tier.schema', version: token }],
      }),
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
    );
    await expectGateCode(
      semanticEnvelope({
        requiredCapabilities: [{ capabilityId: 'outbound-http', version: token }],
      }),
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
    );
    await expectGateCode(semanticEnvelope({ componentId: token }), 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
    await expectGateCode(
      semanticEnvelope({ kind: { kindId: token, version: '1.2.0' } }),
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
    );
  }
});

test('T001B-R10: a non-plain-object digest input fails with INVALID_ENVELOPE_INPUT; Sha256Port failure propagates unchanged', async () => {
  for (const bad of [null, undefined, 42, 'envelope', [], true]) {
    await assert.rejects(
      () => computeComponentSemanticDigest(bad as unknown as ComponentEnvelope, sha256()),
      (error: unknown) => {
        assert.ok(error instanceof ComponentDigestError);
        assert.equal((error as ComponentDigestError).code, 'INVALID_ENVELOPE_INPUT');
        assert.equal(error.name, 'ComponentDigestError');
        return true;
      },
    );
  }
  const emptyPort: Sha256Port = {
    async digestUtf8(): Promise<string> {
      return '';
    },
  };
  await assert.rejects(
    () => computeComponentSemanticDigest(semanticEnvelope(), emptyPort),
    (error: unknown) => {
      assert.ok(error instanceof IdentityContractError);
      assert.equal((error as IdentityContractError).code, 'INVALID_CONTENT_DIGEST');
      assert.equal(error.name, 'IdentityContractError');
      return true;
    },
  );
});

test('T001B-R11: empty required collections are valid digest input with no admission assumption', async () => {
  const emptyBoth = semanticEnvelope({ requiredSemanticContracts: [], requiredCapabilities: [] });
  validateComponentEnvelope(emptyBoth);
  const digest = await computeComponentSemanticDigest(emptyBoth, sha256());
  assert.match(digest, /^[0-9a-f]{64}$/);
  const material = componentSemanticDigestMaterial(emptyBoth);
  assert.deepEqual(material.requiredSemanticContracts, []);
  assert.deepEqual(material.requiredCapabilities, []);
  assert.deepEqual(Object.keys(material).sort(), [
    'digestDomain',
    'family',
    'kind',
    'requiredCapabilities',
    'requiredSemanticContracts',
    'semanticBody',
  ]);
  const emptyContractsOnly = semanticEnvelope({ requiredSemanticContracts: [] });
  const emptyContractsOnlyDigest = await computeComponentSemanticDigest(emptyContractsOnly, sha256());
  assert.match(emptyContractsOnlyDigest, /^[0-9a-f]{64}$/);
  assert.notEqual(emptyContractsOnlyDigest, digest);
  const emptyCapabilitiesOnly = semanticEnvelope({ requiredCapabilities: [] });
  const emptyCapabilitiesOnlyDigest = await computeComponentSemanticDigest(
    emptyCapabilitiesOnly,
    sha256(),
  );
  assert.match(emptyCapabilitiesOnlyDigest, /^[0-9a-f]{64}$/);
  assert.notEqual(emptyCapabilitiesOnlyDigest, digest);
  assert.notEqual(emptyCapabilitiesOnlyDigest, emptyContractsOnlyDigest);
});

test('T001B-R12: material ordering follows code-unit comparison and is stable across computations', async () => {
  const envelope = semanticEnvelope({
    requiredSemanticContracts: [
      { contractId: 'apple', version: '1.0.0' },
      { contractId: 'ab', version: '1.0.0' },
      { contractId: 'Zebra', version: '1.0.0' },
      { contractId: 'a.b', version: '1.0.0' },
    ],
  });
  const material = componentSemanticDigestMaterial(envelope);
  assert.deepEqual(
    material.requiredSemanticContracts.map((ref) => ref.contractId),
    ['Zebra', 'a.b', 'ab', 'apple'],
  );
  const first = await computeComponentSemanticDigest(envelope, sha256());
  const second = await computeComponentSemanticDigest(envelope, sha256());
  assert.equal(first, second);
  assert.deepEqual(componentSemanticDigestMaterial(envelope), material);
  const permutedReader = semanticEnvelope({
    requiredSemanticContracts: [
      { contractId: 'a.b', version: '1.0.0' },
      { contractId: 'Zebra', version: '1.0.0' },
      { contractId: 'apple', version: '1.0.0' },
      { contractId: 'ab', version: '1.0.0' },
    ],
  });
  assert.deepEqual(
    componentSemanticDigestMaterial(permutedReader).requiredSemanticContracts.map((ref) => ref.contractId),
    ['Zebra', 'a.b', 'ab', 'apple'],
  );
  assert.equal(await computeComponentSemanticDigest(permutedReader, sha256()), first);
});

test('T001B-R13: digest failures are deterministic, message-stable, and always typed', async () => {
  const duplicateRefs = semanticEnvelope({
    requiredSemanticContracts: [
      { contractId: 'customer.tier.schema', version: '2.0.0' },
      { contractId: 'customer.tier.schema', version: '3.0.0' },
    ],
  });
  const first = captureDigestError(() => componentSemanticDigestMaterial(duplicateRefs));
  const second = captureDigestError(() => componentSemanticDigestMaterial(duplicateRefs));
  assert.equal(first.code, second.code);
  assert.equal(first.message, second.message);
  assert.equal(first.name, 'ComponentDigestError');
  assert.ok(first instanceof Error);

  const hostileBody = semanticEnvelope({ semanticBody: Number.NaN as unknown as JsonValue });
  const gateFirst = await captureGateError(hostileBody);
  const gateSecond = await captureGateError(hostileBody);
  assert.ok(gateFirst instanceof ComponentContractError);
  assert.ok(gateSecond instanceof ComponentContractError);
  assert.equal((gateFirst as ComponentContractError).code, (gateSecond as ComponentContractError).code);
  assert.equal((gateFirst as ComponentContractError).message, (gateSecond as ComponentContractError).message);
  assert.equal((gateFirst as ComponentContractError).name, 'ComponentContractError');
});
