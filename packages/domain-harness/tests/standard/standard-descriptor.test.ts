/**
 * T006A invariant matrix — Definition-plane Standard Component descriptor
 * (issue #618, fine-grained DAG #534 T006A; authority #589 PACK-C).
 *
 * Standard is a publishing/support/compatibility classification, NOT a
 * privileged Kind/Component family or runtime authority path. These tests pin
 * the Definition-plane half of the frozen boundary:
 *  1. a published Standard Component descriptor refers to an ordinary exact
 *     Component contract/version (family + componentId + exact KindRef);
 *  2. the descriptor carries its own semantic `descriptorVersion`, which is
 *     Definition-plane identity material — bumping it changes the descriptor
 *     digest exactly as an app Component version bump changes Component
 *     identity, while the referenced Component graph digest stays untouched;
 *  3. descriptor validation is descriptor-safe (accessor/proxy material is a
 *     typed rejection), fail-closed on floating/range/x-range selectors and
 *     embedded `id@version` forms, and never normalizes or freezes the caller
 *     input;
 *  4. no implementation/module/provider identity is representable on the
 *     descriptor (unknown fields fail closed);
 *  5. classification is a closed publishing/support vocabulary, never an
 *     authority flag: it changes descriptor identity like any other
 *     descriptor material, and it confers NO admission/activation/effect
 *     privilege (the boundary half is proven in standard-boundary.test.ts).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  STANDARD_CLASSIFICATIONS,
  StandardContractError,
  computeStandardDescriptorDigest,
  standardDescriptorIdentityMaterial,
  validateStandardComponentDescriptor,
  type ExactComponentRef,
  type StandardComponentDescriptor,
} from '../../src/contracts/standard.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function componentRef(overrides: Partial<ExactComponentRef> = {}): ExactComponentRef {
  return {
    family: 'semantic',
    componentId: 'component.standard-example',
    kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
    ...overrides,
  };
}

function descriptor(
  overrides: Partial<StandardComponentDescriptor> = {},
): StandardComponentDescriptor {
  return {
    standardId: 'standard.example',
    classification: 'published',
    descriptorVersion: '1.0.0',
    component: componentRef(),
    ...overrides,
  };
}

function referencedComponent(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'component.standard-example',
    kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { note: 'ordinary referenced Component' },
  };
}

function graphWithReferenced(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.standard-descriptor',
    components: [referencedComponent()],
    relations: [],
  };
}

test('#618 descriptor 1: a valid published descriptor validates and snapshots deterministically', async () => {
  const candidate = descriptor();
  assert.doesNotThrow(() => validateStandardComponentDescriptor(candidate));

  const first = await computeStandardDescriptorDigest(candidate, realSha256);
  const second = await computeStandardDescriptorDigest(descriptor(), realSha256);
  assert.equal(first, second);
  assert.ok(first.length > 0);

  // The caller input is never frozen or mutated by validation or digestion.
  assert.ok(!Object.isFrozen(candidate));
  assert.deepEqual(candidate, descriptor());
});

test('#618 descriptor 2: descriptor semantic version is Definition-plane identity; the referenced graph digest is untouched', async () => {
  const base = descriptor();
  const bumped = descriptor({ descriptorVersion: '1.1.0' });

  const baseDigest = await computeStandardDescriptorDigest(base, realSha256);
  const bumpedDigest = await computeStandardDescriptorDigest(bumped, realSha256);
  assert.notEqual(baseDigest, bumpedDigest);

  // The referenced Component is ordinary: a descriptor version bump does NOT
  // change the Definition graph digest of the graph binding the referenced
  // Component — descriptor identity participates as its own Definition-plane
  // material, never by privileged coupling into graph identity.
  const graphDigestBefore = await computeDefinitionGraphDigest(graphWithReferenced(), realSha256);
  const graphDigestAfter = await computeDefinitionGraphDigest(graphWithReferenced(), realSha256);
  assert.equal(graphDigestBefore, graphDigestAfter);
});

test('#618 descriptor 2b: the identity material carries standardId/classification/descriptorVersion/exact component ref only', () => {
  const material = standardDescriptorIdentityMaterial(descriptor()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(material).sort(), [
    'classification',
    'component',
    'descriptorVersion',
    'domain',
    'standardId',
  ]);
  const component = material.component as Record<string, unknown>;
  assert.deepEqual(Object.keys(component).sort(), ['componentId', 'family', 'kind']);
  const kind = component.kind as Record<string, unknown>;
  assert.deepEqual(Object.keys(kind).sort(), ['kindId', 'version']);
});

test('#618 descriptor 3: floating/range/x-range/embedded selectors fail closed with typed codes', async () => {
  // Direct identity/version strings carry the unified floating-selector code.
  const floatingCases: Array<[string, Partial<StandardComponentDescriptor>]> = [
    ['standardId', { standardId: 'latest' }],
    ['descriptorVersion', { descriptorVersion: '^1.0.0' }],
    ['descriptorVersion x-range', { descriptorVersion: '1.x' }],
    ['componentId', { component: componentRef({ componentId: 'component.a@1.0.0' }) }],
  ];
  for (const [label, overrides] of floatingCases) {
    await assert.rejects(
      computeStandardDescriptorDigest(descriptor(overrides), realSha256),
      (error: unknown) => {
        assert.ok(error instanceof StandardContractError, `${label}: ${String(error)}`);
        assert.equal(
          error.code,
          'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
          `${label} must fail closed as a floating/range selector`,
        );
        return true;
      },
    );
  }

  // Kind-contained floating selectors stay typed failures through the #573
  // frozen Kind decision (consumed, never reimplemented) — the same mapping
  // T002B uses for pin-side Kind exactness.
  const floatingKindCases: Array<[string, Partial<ExactComponentRef>]> = [
    ['kindId', { kind: { kindId: '*', version: '1.0.0' } }],
    ['kind version', { kind: { kindId: 'k', version: 'current' } }],
  ];
  for (const [label, refOverrides] of floatingKindCases) {
    await assert.rejects(
      computeStandardDescriptorDigest(
        descriptor({ component: componentRef(refOverrides) }),
        realSha256,
      ),
      (error: unknown) => {
        assert.ok(error instanceof StandardContractError, `${label}: ${String(error)}`);
        assert.equal(error.code, 'INVALID_COMPONENT_REF');
        return true;
      },
    );
  }
});

test('#618 descriptor 3b: classification outside the closed publishing/support vocabulary fails closed', () => {
  const invalid = descriptor({ classification: 'privileged' as never });
  assert.throws(
    () => validateStandardComponentDescriptor(invalid),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'INVALID_STANDARD_CLASSIFICATION');
      return true;
    },
  );
  // Sanity: exactly the frozen two-classification vocabulary exists.
  assert.deepEqual([...STANDARD_CLASSIFICATIONS].sort(), ['published', 'supported']);
});

test('#618 descriptor 3c: descriptor-safety — accessor-backed and exotic material is a typed rejection', () => {
  const accessorBacked = descriptor();
  Object.defineProperty(accessorBacked, 'descriptorVersion', {
    enumerable: true,
    get() {
      return '1.0.0';
    },
  });
  assert.throws(
    () => validateStandardComponentDescriptor(accessorBacked),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'INVALID_STANDARD_DESCRIPTOR');
      return true;
    },
  );

  // Exotic (class) prototypes are not contract input, unlike null-prototype
  // records which the shared record-safety primitive explicitly accepts.
  class ExoticDescriptor {
    standardId = 'standard.example';
    classification = 'published';
    descriptorVersion = '1.0.0';
    component = componentRef();
  }
  assert.throws(
    () => validateStandardComponentDescriptor(new ExoticDescriptor() as never),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'INVALID_STANDARD_DESCRIPTOR');
      return true;
    },
  );
});

test('#618 descriptor 4: implementation/module/provider identity is unrepresentable on the descriptor', () => {
  const withImplementation = {
    ...descriptor(),
    implementation: { implementationId: 'impl.privileged', version: '1.0.0' },
  } as unknown as StandardComponentDescriptor;
  assert.throws(
    () => validateStandardComponentDescriptor(withImplementation),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'INVALID_STANDARD_DESCRIPTOR');
      assert.match(error.message, /unknown field "implementation"/);
      return true;
    },
  );
});

test('#618 descriptor 5: classification change is an ordinary descriptor identity change, not an authority grant', async () => {
  const published = await computeStandardDescriptorDigest(descriptor(), realSha256);
  const supported = await computeStandardDescriptorDigest(
    descriptor({ classification: 'supported' }),
    realSha256,
  );
  assert.notEqual(published, supported);

  // A descriptor is a plain serializable record: it carries no validator,
  // handle, pin or capability closure of any kind.
  const candidate = descriptor();
  for (const forbidden of ['validateComponent', 'pin', 'implementation', 'activate', 'effect']) {
    assert.equal(
      (candidate as unknown as Record<string, unknown>)[forbidden],
      undefined,
      `descriptor must never carry ${forbidden}`,
    );
  }
});
