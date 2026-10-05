/**
 * T003D tests-first matrix — Domain/host capability-plane collision
 * (issue #634; authority #589 PACK-A T003D; DAG #534).
 *
 * Covers the PACK-A test list for the provenance plane `DOMAIN | HOST`
 * distinction (not a Component family, no third Capability ontology, no
 * cross-plane DSL):
 *  1. one exact required CapabilityRef is routed by plane — Domain-only =>
 *     the normal T003B path (selection evidence unchanged); Host-only => a
 *     host-plane result carrying the exact frozen ref and no provider
 *     identity; both => `CAPABILITY_PLANE_COLLISION` fail-closed; neither =>
 *     the T003B missing-provider failure, unwrapped;
 *  2. order invariance — permuting Domain component order, Host declaration
 *     order, or their relative declaration order never changes any verdict
 *     (neither plane overrides the other by order/default);
 *  3. version mismatch — exact two-field ref equality means a Host (or
 *     Domain) declaration of another version is NOT provision of the
 *     required ref: no accidental collision, no nearest-version fallback;
 *  4. dual provision — the same exact capabilityId+version declared on both
 *     planes always fails closed with CAPABILITY_PLANE_COLLISION, including
 *     when the Domain plane itself is ambiguous (collision is plane-prior);
 *  5. the #579 0/1/>1 Domain rule keeps applying underneath: >1 Domain
 *     providers with no Host provision still fails AMBIGUOUS_CAPABILITY_PROVIDER.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapabilityContractRef, ComponentEnvelope } from '../../src/contracts/component.js';
import {
  DefinitionGraphContractError,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { JsonValue } from '../../src/contracts/json.js';
import {
  CapabilityPlaneContractError,
  resolveCapabilityPlane,
} from '../../src/contracts/capability-plane.js';
import {
  CapabilityProvisionContractError,
  selectCapabilityProvider,
} from '../../src/contracts/capability-provision.js';
import { ToolComponentContractError } from '../../src/contracts/tool-component.js';

const CREDIT_RATING: CapabilityContractRef = {
  capabilityId: 'credit-rating-lookup',
  version: '1.1.0',
};
const CREDIT_RATING_V2: CapabilityContractRef = {
  capabilityId: 'credit-rating-lookup',
  version: '2.0.0',
};
const AUDIT_TRAIL: CapabilityContractRef = {
  capabilityId: 'audit.trail.emit',
  version: '0.3.0',
};

function toolComponent(overrides?: {
  componentId?: string;
  provides?: readonly CapabilityContractRef[];
  requires?: readonly CapabilityContractRef[];
}): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: overrides?.componentId ?? 'catalog.credit-rating.tool',
    kind: { kindId: 'tool.credit-rating.v1', version: '2.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: overrides?.requires ?? [],
    semanticBody: {
      operations: [
        {
          operationId: 'lookup.credit-rating',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'idempotent',
        },
      ],
      providesCapabilities: overrides?.provides ?? [CREDIT_RATING],
    } as unknown as JsonValue,
  };
}

function semanticComponent(overrides?: {
  componentId?: string;
  requires?: readonly CapabilityContractRef[];
}): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: overrides?.componentId ?? 'quote.eligibility.rule',
    kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: overrides?.requires ?? [],
    semanticBody: { threshold: 100 },
  };
}

function graph(components: readonly ComponentEnvelope[]): DefinitionGraphEnvelope {
  return { graphId: 'graph.plane-matrix', components: [...components], relations: [] };
}

/** The Domain-only fixture: one consumer requires, one tool provides. */
function domainGraph(): DefinitionGraphEnvelope {
  return graph([
    semanticComponent({ requires: [CREDIT_RATING] }),
    toolComponent(),
  ]);
}

test('PACK-A T003D plane routing: Domain-only => normal T003B path (selection evidence unchanged)', () => {
  const g = domainGraph();
  const resolution = resolveCapabilityPlane(g, [], CREDIT_RATING);

  assert.equal(resolution.plane, 'domain');
  if (resolution.plane !== 'domain') return;
  const direct = selectCapabilityProvider(g, CREDIT_RATING);
  assert.deepEqual(resolution.selection, direct);
  assert.equal(resolution.selection.provider.componentId, 'catalog.credit-rating.tool');
  assert.equal(resolution.selection.provider.family, 'tool');
  assert.ok(Object.isFrozen(resolution));
  assert.ok(Object.isFrozen(resolution.selection));
  assert.ok(Object.isFrozen(resolution.selection.requiredCapability));
});

test('PACK-A T003D plane routing: Host-only => host path with exact frozen ref and no provider identity', () => {
  const resolution = resolveCapabilityPlane(
    graph([semanticComponent({ requires: [CREDIT_RATING] })]),
    [AUDIT_TRAIL, CREDIT_RATING],
    CREDIT_RATING,
  );

  assert.equal(resolution.plane, 'host');
  if (resolution.plane !== 'host') return;
  assert.equal(resolution.graphId, 'graph.plane-matrix');
  assert.deepEqual(resolution.requiredCapability, CREDIT_RATING);
  assert.deepEqual(resolution.hostProvidedCapability, CREDIT_RATING);
  assert.ok(Object.isFrozen(resolution));
  assert.ok(Object.isFrozen(resolution.requiredCapability));
  assert.ok(Object.isFrozen(resolution.hostProvidedCapability));
});

test('PACK-A T003D plane routing: Host-only result is non-aliasing — later caller mutation cannot rewrite it', () => {
  const hostDeclaration: { capabilityId: string; version: string } = { ...CREDIT_RATING };
  const hostCapabilities: CapabilityContractRef[] = [hostDeclaration];
  const resolution = resolveCapabilityPlane(
    graph([semanticComponent({ requires: [CREDIT_RATING] })]),
    hostCapabilities,
    CREDIT_RATING,
  );

  hostDeclaration.version = '9.9.9';
  hostCapabilities.length = 0;

  assert.equal(resolution.plane, 'host');
  if (resolution.plane !== 'host') return;
  assert.deepEqual(resolution.hostProvidedCapability, CREDIT_RATING);
  assert.deepEqual(resolution.requiredCapability, CREDIT_RATING);
});

test('PACK-A T003D dual provision: same exact capabilityId+version on both planes => CAPABILITY_PLANE_COLLISION fail-closed', () => {
  assert.throws(
    () => resolveCapabilityPlane(domainGraph(), [CREDIT_RATING], CREDIT_RATING),
    (error: unknown) => {
      assert.ok(error instanceof CapabilityPlaneContractError);
      assert.equal(error.code, 'CAPABILITY_PLANE_COLLISION');
      assert.deepEqual(error.domainProviderComponentIds, ['catalog.credit-rating.tool']);
      assert.match(error.message, /credit-rating-lookup/);
      assert.match(error.message, /1\.1\.0/);
      assert.match(error.message, /domain/i);
      assert.match(error.message, /host/i);
      return true;
    },
  );
});

test('PACK-A T003D dual provision: ambiguous Domain plane + Host provision is still COLLISION (plane-prior, never AMBIGUOUS-wins)', () => {
  const g = graph([
    semanticComponent({ requires: [CREDIT_RATING] }),
    toolComponent({ componentId: 'catalog.credit-rating.tool' }),
    toolComponent({ componentId: 'alt.credit-rating.tool' }),
  ]);
  assert.throws(
    () => resolveCapabilityPlane(g, [CREDIT_RATING], CREDIT_RATING),
    (error: unknown) => {
      assert.ok(error instanceof CapabilityPlaneContractError);
      assert.equal(error.code, 'CAPABILITY_PLANE_COLLISION');
      assert.deepEqual(error.domainProviderComponentIds, [
        'alt.credit-rating.tool',
        'catalog.credit-rating.tool',
      ]);
      return true;
    },
  );
});

test('PACK-A T003D: neither plane => T003B missing-provider failure unwrapped (identical error/message)', () => {
  const g = graph([semanticComponent({ requires: [CREDIT_RATING] })]);
  let directMessage = '';
  try {
    selectCapabilityProvider(g, CREDIT_RATING);
  } catch (error) {
    directMessage = (error as Error).message;
  }
  assert.throws(
    () => resolveCapabilityPlane(g, [], CREDIT_RATING),
    (error: unknown) => {
      assert.ok(error instanceof CapabilityProvisionContractError);
      assert.equal(error.code, 'CAPABILITY_PROVIDER_NOT_FOUND');
      assert.equal(error.message, directMessage);
      return true;
    },
  );
});

test('PACK-A T003D #579 disposition still applies underneath: >1 Domain providers, no Host provision => AMBIGUOUS unwrapped', () => {
  const g = graph([
    semanticComponent({ requires: [CREDIT_RATING] }),
    toolComponent({ componentId: 'catalog.credit-rating.tool' }),
    toolComponent({ componentId: 'alt.credit-rating.tool' }),
  ]);
  assert.throws(
    () => resolveCapabilityPlane(g, [], CREDIT_RATING),
    (error: unknown) => {
      assert.ok(error instanceof CapabilityProvisionContractError);
      assert.equal(error.code, 'CAPABILITY_PROVIDER_AMBIGUOUS');
      assert.deepEqual(error.conflictingProviderComponentIds, [
        'alt.credit-rating.tool',
        'catalog.credit-rating.tool',
      ]);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Order invariance — neither plane may override the other by order/default.
// ---------------------------------------------------------------------------

const COMPONENT_PERMUTATIONS: Array<(components: ComponentEnvelope[]) => ComponentEnvelope[]> = [
  (components) => components,
  (components) => [...components].reverse(),
];

test('PACK-A T003D order invariance: Domain component order permutation never changes any verdict', () => {
  const base = [
    semanticComponent({ requires: [CREDIT_RATING] }),
    toolComponent({ componentId: 'catalog.credit-rating.tool' }),
    toolComponent({ componentId: 'alt.audit-trail.tool', provides: [AUDIT_TRAIL] }),
  ];
  const collisionMessages: string[] = [];
  const auditResolutions: unknown[] = [];
  for (const permute of COMPONENT_PERMUTATIONS) {
    const g = graph(permute([...base]));

    assert.throws(
      () => resolveCapabilityPlane(g, [CREDIT_RATING], CREDIT_RATING),
      (error: unknown) => {
        assert.ok(error instanceof CapabilityPlaneContractError);
        assert.equal(error.code, 'CAPABILITY_PLANE_COLLISION');
        assert.deepEqual(error.domainProviderComponentIds, ['catalog.credit-rating.tool']);
        collisionMessages.push(error.message);
        return true;
      },
    );
    auditResolutions.push(resolveCapabilityPlane(g, [], AUDIT_TRAIL));
  }
  assert.equal(new Set(collisionMessages).size, 1, 'collision diagnostics must be order-invariant');
  assert.deepEqual(auditResolutions[1], auditResolutions[0]);
});

test('PACK-A T003D order invariance: ambiguous Domain candidacy diagnostics stay sorted under component permutation', () => {
  const base = [
    semanticComponent({ requires: [CREDIT_RATING] }),
    toolComponent({ componentId: 'catalog.credit-rating.tool' }),
    toolComponent({ componentId: 'alt.credit-rating.tool' }),
  ];
  const messages: string[] = [];
  for (const permute of COMPONENT_PERMUTATIONS) {
    assert.throws(
      () => resolveCapabilityPlane(graph(permute([...base])), [CREDIT_RATING], CREDIT_RATING),
      (error: unknown) => {
        assert.ok(error instanceof CapabilityPlaneContractError);
        assert.equal(error.code, 'CAPABILITY_PLANE_COLLISION');
        assert.deepEqual(error.domainProviderComponentIds, [
          'alt.credit-rating.tool',
          'catalog.credit-rating.tool',
        ]);
        messages.push(error.message);
        return true;
      },
    );
  }
  assert.equal(new Set(messages).size, 1, 'collision diagnostics must be order-invariant');
});

test('PACK-A T003D order invariance: Host declaration order permutation never changes the verdict or the evidence', () => {
  const g = graph([semanticComponent({ requires: [CREDIT_RATING] })]);
  const forward = resolveCapabilityPlane(g, [AUDIT_TRAIL, CREDIT_RATING], CREDIT_RATING);
  const reversed = resolveCapabilityPlane(g, [CREDIT_RATING, AUDIT_TRAIL], CREDIT_RATING);
  assert.deepEqual(reversed, forward);

  assert.throws(
    () => resolveCapabilityPlane(domainGraph(), [AUDIT_TRAIL, CREDIT_RATING], CREDIT_RATING),
    (error: unknown) =>
      error instanceof CapabilityPlaneContractError &&
      error.code === 'CAPABILITY_PLANE_COLLISION',
  );
  assert.throws(
    () => resolveCapabilityPlane(domainGraph(), [CREDIT_RATING, AUDIT_TRAIL], CREDIT_RATING),
    (error: unknown) =>
      error instanceof CapabilityPlaneContractError &&
      error.code === 'CAPABILITY_PLANE_COLLISION',
  );
});

test('PACK-A T003D order invariance: dual provision fails COLLISION regardless of relative declaration order or consumer pass-through', () => {
  const g = graph([
    semanticComponent({ componentId: 'consumer.a', requires: [CREDIT_RATING] }),
    toolComponent({ componentId: 'self.provider.tool', requires: [CREDIT_RATING] }),
  ]);
  // Consumer excluded from Domain candidacy (T003B pass-through): Host-only.
  const hostOnly = resolveCapabilityPlane(
    g,
    [CREDIT_RATING],
    CREDIT_RATING,
    'self.provider.tool',
  );
  assert.equal(hostOnly.plane, 'host');
  // Without consumer exclusion the Domain plane also provisions => COLLISION.
  assert.throws(
    () => resolveCapabilityPlane(g, [CREDIT_RATING], CREDIT_RATING),
    (error: unknown) =>
      error instanceof CapabilityPlaneContractError &&
      error.code === 'CAPABILITY_PLANE_COLLISION',
  );
});

// ---------------------------------------------------------------------------
// Version mismatch — exact two-field ref equality, never normalized.
// ---------------------------------------------------------------------------

test('PACK-A T003D version mismatch: Host declaration of another version is NOT provision (exact equality, no nearest-version)', () => {
  const g = graph([semanticComponent({ requires: [CREDIT_RATING] })]);
  assert.throws(
    () => resolveCapabilityPlane(g, [CREDIT_RATING_V2], CREDIT_RATING),
    (error: unknown) =>
      error instanceof CapabilityProvisionContractError &&
      error.code === 'CAPABILITY_PROVIDER_NOT_FOUND',
  );
});

test('PACK-A T003D version mismatch: Domain declaration of another version is NOT provision — required v1 routes Host-only, NOT a collision', () => {
  const resolution = resolveCapabilityPlane(
    graph([
      semanticComponent({ requires: [CREDIT_RATING] }),
      toolComponent({ provides: [CREDIT_RATING_V2] }),
    ]),
    [CREDIT_RATING],
    CREDIT_RATING,
  );
  assert.equal(resolution.plane, 'host');
  if (resolution.plane === 'host') {
    assert.deepEqual(resolution.hostProvidedCapability, CREDIT_RATING);
  }
});

// ---------------------------------------------------------------------------
// Host declaration input validation — descriptor-safe, exact refs only.
// ---------------------------------------------------------------------------

test('PACK-A T003D host declaration validation: floating selectors in a Host declaration fail typed INVALID_PLANE_INPUT', () => {
  const g = graph([semanticComponent({ requires: [CREDIT_RATING] })]);
  for (const bad of ['latest', 'current', 'active', 'default', '*', 'x', '^1.1.0', '~1.1.0', '1.x', '1.']) {
    assert.throws(
      () =>
        resolveCapabilityPlane(g, [{ capabilityId: 'credit-rating-lookup', version: bad }], CREDIT_RATING),
      (error: unknown) => {
        assert.ok(error instanceof CapabilityPlaneContractError);
        assert.equal(error.code, 'INVALID_PLANE_INPUT');
        return true;
      },
      `host declaration version "${bad}" must fail closed`,
    );
  }
  for (const bad of ['latest', 'credit-rating-lookup@1.1.0', '^prefix', '*']) {
    assert.throws(
      () => resolveCapabilityPlane(g, [{ capabilityId: bad, version: '1.1.0' }], CREDIT_RATING),
      (error: unknown) =>
        error instanceof CapabilityPlaneContractError &&
        error.code === 'INVALID_PLANE_INPUT',
      `host declaration capabilityId "${bad}" must fail closed`,
    );
  }
});

test('PACK-A T003D host declaration validation: non-array, sparse, accessor-backed or extra-key declarations fail typed with zero getter executions', () => {
  const g = graph([semanticComponent({ requires: [CREDIT_RATING] })]);
  let getterRuns = 0;
  const accessorBacked = Object.defineProperty({}, 'capabilityId', {
    enumerable: true,
    get() {
      getterRuns += 1;
      return 'credit-rating-lookup';
    },
  });
  Object.defineProperty(accessorBacked, 'version', {
    enumerable: true,
    get() {
      getterRuns += 1;
      return '1.1.0';
    },
  });

  for (const badHost of [
    'not-an-array',
    [null],
    [accessorBacked],
    [{ capabilityId: 'credit-rating-lookup', version: '1.1.0', extra: 'nope' }],
    [{ capabilityId: 'credit-rating-lookup' }],
  ]) {
    assert.throws(
      () => resolveCapabilityPlane(g, badHost as unknown as readonly CapabilityContractRef[], CREDIT_RATING),
      (error: unknown) =>
        error instanceof CapabilityPlaneContractError &&
        error.code === 'INVALID_PLANE_INPUT',
    );
  }
  assert.equal(getterRuns, 0, 'descriptor validation must never execute a hidden getter');
});

// ---------------------------------------------------------------------------
// Unwrapped propagation — the Domain plane remains the T003B authority.
// ---------------------------------------------------------------------------

test('PACK-A T003D: invalid graph envelope propagates DefinitionGraphContractError unwrapped', () => {
  assert.throws(
    () =>
      resolveCapabilityPlane(
        { graphId: '', components: [], relations: [] } as unknown as DefinitionGraphEnvelope,
        [CREDIT_RATING],
        CREDIT_RATING,
      ),
    (error: unknown) => error instanceof DefinitionGraphContractError,
  );
});

test('PACK-A T003D: broken Domain tool body propagates ToolComponentContractError unwrapped (never silently "provides nothing")', () => {
  const brokenTool: ComponentEnvelope = {
    ...toolComponent(),
    semanticBody: { operations: 'not-an-array' } as unknown as JsonValue,
  };
  assert.throws(
    () => resolveCapabilityPlane(graph([semanticComponent(), brokenTool]), [CREDIT_RATING], CREDIT_RATING),
    (error: unknown) => error instanceof ToolComponentContractError,
  );
});

test('PACK-A T003D: floating required ref propagates the T003B selection-input failure unwrapped (Domain plane validates the ref first)', () => {
  assert.throws(
    () =>
      resolveCapabilityPlane(
        domainGraph(),
        [],
        { capabilityId: 'credit-rating-lookup', version: 'latest' },
      ),
    (error: unknown) => {
      assert.ok(error instanceof CapabilityProvisionContractError);
      assert.equal(error.code, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
      return true;
    },
  );
});

test('PACK-A T003D: the resolver exposes exactly four parameters — no priority/default/order escape hatch exists', () => {
  assert.equal(resolveCapabilityPlane.length, 4);
});
