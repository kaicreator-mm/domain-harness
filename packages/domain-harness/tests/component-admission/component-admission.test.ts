/**
 * T001D must-understand Component admission contract tests (issue #543).
 *
 * The admission seam is a pure, deterministic, fail-closed function over an
 * already-validated ComponentEnvelope and a caller-supplied complete
 * understood-Kind set (exact KindRef = kindId + exact version, exact semantic
 * contract refs, behaviorally material semanticBody top-level fields). There
 * is deliberately no Kind catalog/registry and no compatibility/range
 * selection (T002A) anywhere on this path.
 *
 * R1..R12 map to the twelve minimum requirements of the task pack.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admitComponent,
  ComponentAdmissionError,
  type ComponentAdmissionErrorCode,
  type ComponentAdmissionFailureClass,
  type ComponentAdmissionResult,
  type UnderstoodKindDeclaration,
  type UnderstoodKindSet,
} from '../../src/contracts/component-admission.js';
import type {
  CapabilityContractRef,
  ComponentEnvelope,
  KindRef,
  SemanticContractRef,
} from '../../src/contracts/component.js';
import type { JsonValue } from '../../src/contracts/json.js';

/**
 * The frozen failure taxonomy: each failure code maps to exactly one failure
 * class. Every failure assertion in this file is checked against this table,
 * so the 1:1 code-to-class mapping is enforced across the whole suite.
 */
const EXPECTED_FAILURE_CLASS_BY_CODE: Record<ComponentAdmissionErrorCode, ComponentAdmissionFailureClass> = {
  UNKNOWN_KIND: 'KIND',
  KIND_VERSION_MISMATCH: 'KIND',
  UNKNOWN_SEMANTIC_CONTRACT: 'CONTRACT',
  UNKNOWN_MATERIAL_FIELD: 'FIELD',
  INVALID_UNDERSTOOD_KIND_SET: 'INPUT',
  ADMISSION_INPUT_INVALID: 'INPUT',
};

const observedFailureCodes = new Set<ComponentAdmissionErrorCode>();

function semanticEnvelope(
  overrides?: {
    family?: ComponentEnvelope['family'];
    componentId?: string;
    kind?: KindRef;
    requiredSemanticContracts?: readonly SemanticContractRef[];
    requiredCapabilities?: readonly CapabilityContractRef[];
    semanticBody?: JsonValue;
    nonMaterialExtensions?: JsonValue;
  },
): ComponentEnvelope {
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
    // explicit undefined check: a `null` body is a meaningful opaque override
    semanticBody:
      overrides?.semanticBody !== undefined
        ? overrides.semanticBody
        : { threshold: 100, policy: { tier: 'gold', enabled: true } },
    ...(overrides?.nonMaterialExtensions !== undefined
      ? { nonMaterialExtensions: overrides.nonMaterialExtensions }
      : {}),
  };
}

function understoodDeclaration(
  overrides?: {
    kind?: KindRef;
    understoodSemanticContracts?: readonly SemanticContractRef[];
    materialSemanticBodyFields?: readonly string[];
  },
): UnderstoodKindDeclaration {
  return {
    kind: overrides?.kind ?? { kindId: 'decision.rule.v1', version: '1.2.0' },
    understoodSemanticContracts: overrides?.understoodSemanticContracts ?? [
      { contractId: 'customer.tier.schema', version: '2.0.0' },
      { contractId: 'extra.audit.schema', version: '1.0.0' },
    ],
    materialSemanticBodyFields:
      overrides?.materialSemanticBodyFields ?? ['threshold', 'policy', 'retries'],
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.getOwnPropertyNames(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function expectAdmissionFailure(
  admit: () => ComponentAdmissionResult,
  code: ComponentAdmissionErrorCode,
): void {
  observedFailureCodes.add(code);
  assert.throws(
    admit,
    (error: unknown) => {
      if (!(error instanceof ComponentAdmissionError)) {
        return false;
      }
      assert.equal(error.name, 'ComponentAdmissionError');
      assert.equal(error.code, code);
      assert.equal(
        error.failureClass,
        EXPECTED_FAILURE_CLASS_BY_CODE[code],
        `failure code ${code} must carry exactly one deterministic failure class`,
      );
      return true;
    },
    `expected a typed ${code} admission failure`,
  );
}

// ---------------------------------------------------------------------------
// R1 — exact KindRef (kindId AND exact version) in the understood set admits
// with the full admitted result.
// ---------------------------------------------------------------------------

test('T001D-R1: an envelope whose exact KindRef is understood admits with the full admitted result', () => {
  const extensions: JsonValue = { display: { label: 'Quote Eligibility' }, traceId: 'abc-123' };
  const envelope = semanticEnvelope({ nonMaterialExtensions: extensions });
  const understood: UnderstoodKindSet = [understoodDeclaration()];

  const result = admitComponent(deepFreeze(envelope), deepFreeze(understood));

  assert.equal(result.status, 'ADMITTED');
  assert.equal(result.componentId, 'quote.eligibility.rule');
  assert.deepEqual(result.admittedKind, { kindId: 'decision.rule.v1', version: '1.2.0' });
  assert.deepEqual(result.admittedSemanticContracts, [
    { contractId: 'customer.tier.schema', version: '2.0.0' },
  ]);
  assert.deepEqual(result.admittedMaterialFields, ['policy', 'threshold']);
  assert.equal(result.nonMaterialExtensions, extensions);
  // required capabilities are not must-understand material and are not carried
  assert.equal('requiredCapabilities' in result, false);
  assert.equal('admittedCapabilities' in result, false);
  assert.deepEqual(Object.keys(result).sort(), [
    'admittedKind',
    'admittedMaterialFields',
    'admittedSemanticContracts',
    'componentId',
    'nonMaterialExtensions',
    'status',
  ]);
});

test('T001D-R1: an absent nonMaterialExtensions stays absent on the admitted result', () => {
  const result = admitComponent(semanticEnvelope(), [understoodDeclaration()]);
  assert.equal('nonMaterialExtensions' in result, false);
});

// ---------------------------------------------------------------------------
// R2 — kindId declared by no understood entry fails UNKNOWN_KIND (class KIND).
// ---------------------------------------------------------------------------

test('T001D-R2: a kindId declared by no understood entry fails UNKNOWN_KIND (class KIND)', () => {
  const envelope = semanticEnvelope({ kind: { kindId: 'decision.other.v1', version: '1.2.0' } });
  expectAdmissionFailure(
    () => admitComponent(envelope, [understoodDeclaration()]),
    'UNKNOWN_KIND',
  );
});

// ---------------------------------------------------------------------------
// R3 — kindId declared but at a different exact version fails
// KIND_VERSION_MISMATCH; no fallback to another version of a known kindId.
// ---------------------------------------------------------------------------

test('T001D-R3: kindId known at other exact versions fails KIND_VERSION_MISMATCH with no fallback', () => {
  // The understood set deliberately contains other exact versions of the same
  // kindId, so any fallback/resolution to a declared version would mask this.
  const understood: UnderstoodKindSet = [
    understoodDeclaration({ kind: { kindId: 'decision.rule.v1', version: '1.0.0' } }),
    understoodDeclaration({ kind: { kindId: 'decision.rule.v1', version: '2.0.0' } }),
  ];
  const envelope = semanticEnvelope({ kind: { kindId: 'decision.rule.v1', version: '1.5.0' } });
  expectAdmissionFailure(() => admitComponent(envelope, understood), 'KIND_VERSION_MISMATCH');

  // Resolution to a *later* declared version is equally forbidden.
  expectAdmissionFailure(
    () =>
      admitComponent(
        semanticEnvelope({ kind: { kindId: 'decision.rule.v1', version: '2.0.0' } }),
        [understoodDeclaration({ kind: { kindId: 'decision.rule.v1', version: '1.0.0' } })],
      ),
    'KIND_VERSION_MISMATCH',
  );
});

// ---------------------------------------------------------------------------
// R4 — no latest/current/range semantics anywhere on the admission path.
// ---------------------------------------------------------------------------

test('T001D-R4: floating/range understood versions are rejected and can never admit', () => {
  for (const floating of ['latest', 'current', '*', '^1.0.0', '1.x', '1.X', '~2.0.0', '>1.0.0', '1.2.*']) {
    const understood: UnderstoodKindSet = [
      understoodDeclaration({ kind: { kindId: 'decision.rule.v1', version: floating } }),
    ];
    expectAdmissionFailure(
      () =>
        admitComponent(
          semanticEnvelope({ kind: { kindId: 'decision.rule.v1', version: '1.2.0' } }),
          understood,
        ),
      'INVALID_UNDERSTOOD_KIND_SET',
    );
  }
  // Floating contract versions inside a declaration are equally rejected.
  expectAdmissionFailure(
    () =>
      admitComponent(
        semanticEnvelope(),
        [
          understoodDeclaration({
            understoodSemanticContracts: [
              { contractId: 'customer.tier.schema', version: '^2.0.0' },
            ],
          }),
        ],
      ),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
});

test('T001D-R4: admission performs no ordering, no nearest-version, no defaulting', () => {
  // Deliberately reversed declaration order: matching must be exact equality,
  // never "first declared wins" or "nearest/lowest/highest version wins".
  const reversed: UnderstoodKindSet = [
    understoodDeclaration({
      kind: { kindId: 'decision.rule.v1', version: '2.0.0' },
      materialSemanticBodyFields: ['threshold'],
    }),
    understoodDeclaration({
      kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
      materialSemanticBodyFields: ['threshold'],
    }),
  ];
  const exact = admitComponent(
    semanticEnvelope({
      kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
      requiredSemanticContracts: [],
      semanticBody: { threshold: 1 },
    }),
    reversed,
  );
  assert.deepEqual(exact.admittedKind, { kindId: 'decision.rule.v1', version: '1.2.0' });
});

// ---------------------------------------------------------------------------
// R5 — invalid understood-set inputs fail closed INVALID_UNDERSTOOD_KIND_SET.
// ---------------------------------------------------------------------------

test('T001D-R5: invalid understood-set inputs fail closed with INVALID_UNDERSTOOD_KIND_SET (class INPUT)', () => {
  const base = understoodDeclaration();

  // duplicate exact KindRef, even with identical content
  expectAdmissionFailure(
    () => admitComponent(semanticEnvelope(), [base, understoodDeclaration()]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  // duplicate `kindId@version` variant with different content
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        base,
        understoodDeclaration({ materialSemanticBodyFields: ['threshold'] }),
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  // malformed entries: non-object
  expectAdmissionFailure(
    () => admitComponent(semanticEnvelope(), [base, null as unknown as UnderstoodKindDeclaration]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  expectAdmissionFailure(
    () =>
      admitComponent(
        semanticEnvelope(),
        [base, 'decision.rule.v1@1.2.0' as unknown as UnderstoodKindDeclaration],
      ),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  // malformed set itself
  expectAdmissionFailure(
    () => admitComponent(semanticEnvelope(), null as unknown as UnderstoodKindSet),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  expectAdmissionFailure(
    () => admitComponent(semanticEnvelope(), {} as unknown as UnderstoodKindSet),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  // missing kind / non-exact kind
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        { understoodSemanticContracts: [], materialSemanticBodyFields: [] } as unknown as UnderstoodKindDeclaration,
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        understoodDeclaration({ kind: { kindId: 'decision.rule.v1' } as unknown as KindRef }),
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  // identity-smuggling keys on the understood kind ref
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        understoodDeclaration({
          kind: {
            kindId: 'decision.rule.v1',
            version: '1.2.0',
            implementationId: 'rule-engine-impl@9',
          } as unknown as KindRef,
        }),
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  // empty-string / '@' / floating identity strings in the kind ref
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        understoodDeclaration({ kind: { kindId: '', version: '1.2.0' } }),
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        understoodDeclaration({ kind: { kindId: 'decision.rule.v1', version: '' } }),
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        understoodDeclaration({ kind: { kindId: 'decision.rule.v1@1.2.0', version: '1.2.0' } }),
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        understoodDeclaration({ kind: { kindId: 'latest', version: '1.2.0' } }),
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  // duplicate material field names / empty-string / non-string entries
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        understoodDeclaration({ materialSemanticBodyFields: ['threshold', 'threshold'] }),
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        understoodDeclaration({ materialSemanticBodyFields: ['threshold', ''] }),
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        understoodDeclaration({ materialSemanticBodyFields: [42 as unknown as string] }),
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  // duplicate semantic contract refs inside one declaration (same contractId, any version)
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        understoodDeclaration({
          understoodSemanticContracts: [
            { contractId: 'customer.tier.schema', version: '2.0.0' },
            { contractId: 'customer.tier.schema', version: '3.0.0' },
          ],
        }),
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  // non-array collection fields on a declaration
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        {
          ...base,
          materialSemanticBodyFields: 'threshold' as unknown as readonly string[],
        },
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        {
          ...base,
          understoodSemanticContracts: 'customer.tier.schema' as unknown as readonly SemanticContractRef[],
        },
      ]),
    'INVALID_UNDERSTOOD_KIND_SET',
  );
});

// ---------------------------------------------------------------------------
// R6 — required semantic contract ref not understood for the matched Kind
// fails UNKNOWN_SEMANTIC_CONTRACT (exact contractId+version, no range).
// ---------------------------------------------------------------------------

test('T001D-R6: a required semantic contract not understood for the matched Kind fails UNKNOWN_SEMANTIC_CONTRACT', () => {
  // same contractId, different exact version — exact match only
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        understoodDeclaration({
          understoodSemanticContracts: [{ contractId: 'customer.tier.schema', version: '1.0.0' }],
        }),
      ]),
    'UNKNOWN_SEMANTIC_CONTRACT',
  );
  // contractId not understood at all
  expectAdmissionFailure(
    () =>
      admitComponent(semanticEnvelope(), [
        understoodDeclaration({
          understoodSemanticContracts: [{ contractId: 'other.schema', version: '2.0.0' }],
        }),
      ]),
    'UNKNOWN_SEMANTIC_CONTRACT',
  );
  // one of two required contracts not understood at the required exact version
  expectAdmissionFailure(
    () =>
      admitComponent(
        semanticEnvelope({
          requiredSemanticContracts: [
            { contractId: 'customer.tier.schema', version: '2.0.0' },
            { contractId: 'extra.audit.schema', version: '2.0.0' },
          ],
        }),
        [understoodDeclaration()],
      ),
    'UNKNOWN_SEMANTIC_CONTRACT',
  );
});

test('T001D-R6: all required contracts understood at their exact versions admit in envelope order', () => {
  const result = admitComponent(
    semanticEnvelope({
      requiredSemanticContracts: [
        { contractId: 'extra.audit.schema', version: '1.0.0' },
        { contractId: 'customer.tier.schema', version: '2.0.0' },
      ],
    }),
    [understoodDeclaration()],
  );
  assert.deepEqual(result.admittedSemanticContracts, [
    { contractId: 'extra.audit.schema', version: '1.0.0' },
    { contractId: 'customer.tier.schema', version: '2.0.0' },
  ]);
});

// ---------------------------------------------------------------------------
// R7 — a semanticBody top-level field outside the declared material-field set
// fails UNKNOWN_MATERIAL_FIELD; full coverage admits.
// ---------------------------------------------------------------------------

test('T001D-R7: a semanticBody field outside the declared material set fails UNKNOWN_MATERIAL_FIELD (class FIELD)', () => {
  expectAdmissionFailure(
    () =>
      admitComponent(
        semanticEnvelope({ semanticBody: { threshold: 100, mystery: true } }),
        [understoodDeclaration({ materialSemanticBodyFields: ['threshold'] })],
      ),
    'UNKNOWN_MATERIAL_FIELD',
  );
});

test('T001D-R7: a body whose fields are all covered by the declaration admits', () => {
  const result = admitComponent(
    semanticEnvelope({ semanticBody: { policy: { tier: 'gold' }, threshold: 100 } }),
    [understoodDeclaration({ materialSemanticBodyFields: ['threshold', 'policy'] })],
  );
  assert.equal(result.status, 'ADMITTED');
  assert.deepEqual(result.admittedMaterialFields, ['policy', 'threshold']);
});

// ---------------------------------------------------------------------------
// R8 — the material-field seam handles body shapes deterministically.
// ---------------------------------------------------------------------------

test('T001D-R8: a non-object semanticBody admits only against an empty declared material-field set', () => {
  for (const opaqueBody of [[1, 2, 3], 'opaque-text', 42, true, null]) {
    const admitted = admitComponent(
      semanticEnvelope({ semanticBody: opaqueBody }),
      [understoodDeclaration({ materialSemanticBodyFields: [] })],
    );
    assert.equal(admitted.status, 'ADMITTED');
    assert.deepEqual(admitted.admittedMaterialFields, []);
  }
  // non-object body against a non-empty declared set fails
  for (const opaqueBody of [[1, 2, 3], 'opaque-text', 42, true, null]) {
    expectAdmissionFailure(
      () =>
        admitComponent(
          semanticEnvelope({ semanticBody: opaqueBody }),
          [understoodDeclaration({ materialSemanticBodyFields: ['threshold'] })],
        ),
      'UNKNOWN_MATERIAL_FIELD',
    );
  }
});

test('T001D-R8: declarations are a comprehension set, not a presence requirement', () => {
  // empty-object body against a non-empty declared set admits
  const emptyObject = admitComponent(semanticEnvelope({ semanticBody: {} }), [understoodDeclaration()]);
  assert.equal(emptyObject.status, 'ADMITTED');
  assert.deepEqual(emptyObject.admittedMaterialFields, []);
  // declared-but-absent fields in a populated body are not failures
  const populated = admitComponent(
    semanticEnvelope({ semanticBody: { threshold: 100 } }),
    [understoodDeclaration()],
  );
  assert.equal(populated.status, 'ADMITTED');
  assert.deepEqual(populated.admittedMaterialFields, ['threshold']);
});

// ---------------------------------------------------------------------------
// R9 — nonMaterialExtensions pass through verbatim, never must-understand.
// ---------------------------------------------------------------------------

test('T001D-R9: nonMaterialExtensions pass through verbatim and are never must-understand material', () => {
  const extensions: JsonValue = {
    provenance: { authors: ['a', 'b'], revision: 7, flags: [true, false, null] },
    ui: { nested: { deep: { leaf: 'value' } } },
  };
  const envelope = semanticEnvelope({ nonMaterialExtensions: extensions });
  const result = admitComponent(envelope, [understoodDeclaration()]);
  // verbatim: same reference, never copied, transformed, dropped, or merged
  assert.equal(result.nonMaterialExtensions, extensions);
  assert.deepEqual(result.nonMaterialExtensions, extensions);
  // never merged into material fields nor promoted into required semantics
  assert.deepEqual(result.admittedMaterialFields, ['policy', 'threshold']);
  assert.deepEqual(result.admittedSemanticContracts, [
    { contractId: 'customer.tier.schema', version: '2.0.0' },
  ]);
  // never validated for comprehension: arbitrary opaque extensions impose no
  // material-field or contract requirements of their own
  const extensionOnly = admitComponent(
    semanticEnvelope({
      semanticBody: { threshold: 1 },
      nonMaterialExtensions: { arbitraryUnknownExtension: { totally: 'opaque' } },
    }),
    [understoodDeclaration({ materialSemanticBodyFields: ['threshold'] })],
  );
  assert.equal(extensionOnly.status, 'ADMITTED');
});

// ---------------------------------------------------------------------------
// R10 — the TOOL family flows through the same seam, no family-specific branch.
// ---------------------------------------------------------------------------

test('T001D-R10: the TOOL family is admitted through the same seam with no family-specific branch', () => {
  const toolEnvelope = semanticEnvelope({
    family: 'tool',
    componentId: 'http.request.tool',
    kind: { kindId: 'tool.http-request.v1', version: '3.1.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { effect: 'none' },
  });
  const understood: UnderstoodKindSet = [
    understoodDeclaration({
      kind: { kindId: 'tool.http-request.v1', version: '3.1.0' },
      understoodSemanticContracts: [],
      materialSemanticBodyFields: ['effect'],
    }),
  ];
  const result = admitComponent(toolEnvelope, understood);
  assert.equal(result.status, 'ADMITTED');
  assert.equal(result.componentId, 'http.request.tool');
  assert.deepEqual(result.admittedKind, { kindId: 'tool.http-request.v1', version: '3.1.0' });
  assert.deepEqual(result.admittedSemanticContracts, []);
  assert.deepEqual(result.admittedMaterialFields, ['effect']);
  assert.deepEqual(Object.keys(result).sort(), [
    'admittedKind',
    'admittedMaterialFields',
    'admittedSemanticContracts',
    'componentId',
    'status',
  ]);

  // an unknown tool kindId fails with the same UNKNOWN_KIND code and class
  expectAdmissionFailure(
    () =>
      admitComponent(
        semanticEnvelope({
          family: 'tool',
          kind: { kindId: 'tool.database.v1', version: '1.0.0' },
          requiredSemanticContracts: [],
          requiredCapabilities: [],
        }),
        understood,
      ),
    'UNKNOWN_KIND',
  );
});

// ---------------------------------------------------------------------------
// R11 — empty required-ref collections admit; empty understood set is valid
// input and admits nothing.
// ---------------------------------------------------------------------------

test('T001D-R11: empty required-ref collections admit (nothing to understand, nothing to fail)', () => {
  const emptyRefs = admitComponent(
    semanticEnvelope({ requiredSemanticContracts: [], requiredCapabilities: [] }),
    [understoodDeclaration({ understoodSemanticContracts: [] })],
  );
  assert.equal(emptyRefs.status, 'ADMITTED');
  assert.deepEqual(emptyRefs.admittedSemanticContracts, []);
});

test('T001D-R11: an empty understood-Kind set is structurally valid and deterministically admits nothing', () => {
  expectAdmissionFailure(() => admitComponent(semanticEnvelope(), []), 'UNKNOWN_KIND');
  expectAdmissionFailure(
    () => admitComponent(semanticEnvelope({ requiredSemanticContracts: [] }), []),
    'UNKNOWN_KIND',
  );
});

// ---------------------------------------------------------------------------
// R12 — deterministic taxonomy, typed (never TypeError) input failures, purity.
// ---------------------------------------------------------------------------

test('T001D-R12: a structurally unusable envelope fails ADMISSION_INPUT_INVALID, never a TypeError', () => {
  const unusableInputs: unknown[] = [null, undefined, 'envelope', 42, [], true, {}];
  for (const unusable of unusableInputs) {
    expectAdmissionFailure(
      () => admitComponent(unusable as unknown as ComponentEnvelope, [understoodDeclaration()]),
      'ADMISSION_INPUT_INVALID',
    );
  }
  // non-object kind
  expectAdmissionFailure(
    () =>
      admitComponent(
        { ...semanticEnvelope(), kind: 'decision.rule.v1@1.2.0' } as unknown as ComponentEnvelope,
        [understoodDeclaration()],
      ),
    'ADMISSION_INPUT_INVALID',
  );
  expectAdmissionFailure(
    () =>
      admitComponent(
        { ...semanticEnvelope(), kind: null } as unknown as ComponentEnvelope,
        [understoodDeclaration()],
      ),
    'ADMISSION_INPUT_INVALID',
  );
  // missing required dimensions
  const missingId: Record<string, unknown> = { ...semanticEnvelope() };
  delete missingId.componentId;
  expectAdmissionFailure(
    () => admitComponent(missingId as unknown as ComponentEnvelope, [understoodDeclaration()]),
    'ADMISSION_INPUT_INVALID',
  );
  const missingContracts: Record<string, unknown> = { ...semanticEnvelope() };
  delete missingContracts.requiredSemanticContracts;
  expectAdmissionFailure(
    () =>
      admitComponent(missingContracts as unknown as ComponentEnvelope, [understoodDeclaration()]),
    'ADMISSION_INPUT_INVALID',
  );
  const missingBody: Record<string, unknown> = { ...semanticEnvelope() };
  delete missingBody.semanticBody;
  expectAdmissionFailure(
    () => admitComponent(missingBody as unknown as ComponentEnvelope, [understoodDeclaration()]),
    'ADMISSION_INPUT_INVALID',
  );
  // malformed required contract refs (structurally unusable for exact matching)
  expectAdmissionFailure(
    () =>
      admitComponent(
        { ...semanticEnvelope(), requiredSemanticContracts: [{ contractId: 42, version: '1.0.0' }] } as unknown as ComponentEnvelope,
        [understoodDeclaration()],
      ),
    'ADMISSION_INPUT_INVALID',
  );
});

test('T001D-R12: the failure taxonomy is deterministic — every code maps to exactly one class', () => {
  // All six codes were exercised above through expectAdmissionFailure, which
  // asserts each thrown error's class against this frozen 1:1 table.
  assert.deepEqual(
    [...observedFailureCodes].sort(),
    [
      'ADMISSION_INPUT_INVALID',
      'INVALID_UNDERSTOOD_KIND_SET',
      'KIND_VERSION_MISMATCH',
      'UNKNOWN_KIND',
      'UNKNOWN_MATERIAL_FIELD',
      'UNKNOWN_SEMANTIC_CONTRACT',
    ],
  );
  assert.deepEqual([...new Set(Object.values(EXPECTED_FAILURE_CLASS_BY_CODE))].sort(), [
    'CONTRACT',
    'FIELD',
    'INPUT',
    'KIND',
  ]);
});

test('T001D-R12: admission never mutates its inputs on success or failure paths', () => {
  const extensions: JsonValue = { keep: { me: true } };
  const envelope = semanticEnvelope({ nonMaterialExtensions: extensions });
  const understood: UnderstoodKindSet = [understoodDeclaration()];

  const envelopeBefore = structuredClone(envelope);
  const understoodBefore = structuredClone(understood);
  admitComponent(deepFreeze(envelope), deepFreeze(understood));
  assert.deepEqual(envelope, envelopeBefore);
  assert.deepEqual(understood, understoodBefore);

  const failingEnvelope = semanticEnvelope({
    kind: { kindId: 'decision.other.v1', version: '9.9.9' },
  });
  const failingUnderstood: UnderstoodKindSet = [understoodDeclaration()];
  const failingEnvelopeBefore = structuredClone(failingEnvelope);
  const failingUnderstoodBefore = structuredClone(failingUnderstood);
  expectAdmissionFailure(
    () => admitComponent(deepFreeze(failingEnvelope), deepFreeze(failingUnderstood)),
    'UNKNOWN_KIND',
  );
  assert.deepEqual(failingEnvelope, failingEnvelopeBefore);
  assert.deepEqual(failingUnderstood, failingUnderstoodBefore);
});
