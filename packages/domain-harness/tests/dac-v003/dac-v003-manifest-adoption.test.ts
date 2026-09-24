// Issue #328 / DAC v0.0.3 V3-004 focused tests — manifest adoption
// (immutable composition metadata): 1..n selected entries with effective
// promotion evidence and total ApplicationSelection coverage, exactly-one
// primary runtime closure, exactly-one UX closure, digest-bound adoption,
// the explicit external-authority applicability decision, immutability and
// identity projection.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DAC_V003_BASELINE, adoptDacV003RegistryReference } from '../../src/dac-v003/index.js';
import { adoptDacV003LogicalOperationRef } from '../../src/dac-v003-external/index.js';
import {
  DAC_V003_MANIFEST_ADAPTER_VERSION,
  DAC_V003_MANIFEST_CONTRACT_VERSION,
  DacV003ManifestError,
  adoptDacV003ApplicationManifest,
  computeDacV003ApplicationManifestDigest,
  dacV003ManifestIdentityOf,
  isDacV003ApplicationManifest,
} from '../../src/dac-v003-manifest/index.js';
import {
  buildAdoptedManifest,
  buildExternalAuthority,
  buildManifestInput,
  buildValidationFor,
  withDeclaredDigest,
} from './manifest-fixture.js';
import { createSha256Fake } from '../package/fixture.js';

test('V3-004/#328: adoption freezes the four-role identity set with a verified content digest', async () => {
  const fixture = await buildManifestInput();
  const digest = await computeDacV003ApplicationManifestDigest(fixture.input, {
    sha256: createSha256Fake(),
  });
  const manifest = await adoptDacV003ApplicationManifest(
    { ...fixture.input, manifestContentDigest: digest },
    { sha256: createSha256Fake() },
  );
  assert.equal(manifest.adapter, DAC_V003_MANIFEST_ADAPTER_VERSION);
  assert.equal(manifest.contractVersion, DAC_V003_MANIFEST_CONTRACT_VERSION);
  assert.deepEqual(manifest.baseline, DAC_V003_BASELINE);
  assert.equal(manifest.manifestContentDigest, digest);
  assert.equal(manifest.applicationSemanticIdentity, 'app://acme/tally-ledger');
  assert.equal(manifest.applicationRevisionIdentity, 'app-rev-7');
  assert.equal(manifest.manifestIdentity, 'manifest://acme/tally-ledger/7');
  const identity = dacV003ManifestIdentityOf(manifest);
  assert.deepEqual(identity, {
    applicationSemanticIdentity: manifest.applicationSemanticIdentity,
    applicationRevisionIdentity: manifest.applicationRevisionIdentity,
    manifestIdentity: manifest.manifestIdentity,
    manifestContentDigest: manifest.manifestContentDigest,
  });
  assert.ok(isDacV003ApplicationManifest(manifest));
  assert.ok(!isDacV003ApplicationManifest({ ...manifest }));
});

test('V3-004/#328: selected Domain Data carries 1..n entries, each with effective promotion evidence and total ApplicationSelection coverage', async () => {
  const manifest = await buildAdoptedManifest();
  assert.ok(manifest.selectedDomainData.length >= 2, 'fixture carries n>1 entries');
  for (const entry of manifest.selectedDomainData) {
    assert.equal(entry.selected.role, 'selected-domain-data');
    assert.equal(entry.promotionEvidence.role, 'promotion-decision');
    assert.equal(entry.applicationSelection.role, 'application-selection');
    // Effective promotion: covers the exact selected semantic/revision/digest.
    assert.equal(entry.promotionEvidence.semanticIdentity, entry.selected.semanticIdentity);
    assert.equal(entry.promotionEvidence.revisionIdentity, entry.selected.revisionIdentity);
    assert.equal(entry.promotionEvidence.contentDigest, entry.selected.contentDigest);
    // Total selection coverage: same exact identity under selection authority.
    assert.equal(entry.applicationSelection.semanticIdentity, entry.selected.semanticIdentity);
    assert.equal(entry.applicationSelection.revisionIdentity, entry.selected.revisionIdentity);
    assert.equal(entry.applicationSelection.contentDigest, entry.selected.contentDigest);
    // The stated provenance is exactly the adopted P3 lifecycle closure.
    assert.ok(entry.selected.lifecycleAuthorityRefs.includes(entry.promotionEvidence));
    assert.ok(entry.selected.lifecycleAuthorityRefs.includes(entry.applicationSelection));
  }
  // Entries are distinct exact selections (no default/alias collapse).
  const identities = new Set(manifest.selectedDomainData.map((e) => e.selected.primaryIdentity));
  assert.equal(identities.size, manifest.selectedDomainData.length);
});

test('V3-004/#328: a single-entry manifest (n=1) is adoptable', async () => {
  const fixture = await buildManifestInput();
  const input = {
    ...fixture.input,
    manifestIdentity: 'manifest://acme/tally-ledger/7-n1',
    selectedDomainData: [fixture.entry],
  };
  const manifest = await adoptDacV003ApplicationManifest(await withDeclaredDigest(input), {
    sha256: createSha256Fake(),
  });
  assert.equal(manifest.selectedDomainData.length, 1);
});

test('V3-004/#328: exactly one primary runtime contract and one explicit compatibility target', async () => {
  const manifest = await buildAdoptedManifest();
  assert.equal(manifest.primaryRuntime.runtimeContract.role, 'runtime-contract');
  assert.equal(typeof manifest.primaryRuntime.runtimeContract.revisionIdentity, 'string');
  assert.equal(manifest.primaryRuntime.compatibilityTarget.role, 'compatibility-target');
  assert.equal(
    manifest.primaryRuntime.compatibilityTarget.contractProfileIdentity,
    'domain-harness',
  );
});

test('V3-004/#328: exactly one DomainUXDefinitionRef and one RuntimeInteractionContractRef, kept distinct', async () => {
  const manifest = await buildAdoptedManifest();
  assert.equal(manifest.ux.domainUxDefinition.role, 'domain-ux-definition');
  assert.equal(manifest.ux.runtimeInteractionContract.role, 'runtime-interaction-contract');
  assert.notEqual(
    manifest.ux.domainUxDefinition.semanticIdentity,
    manifest.ux.runtimeInteractionContract.semanticIdentity,
  );
});

test('V3-004/#328: requirement declarations carry their V3-002 satisfaction evidence references', async () => {
  const manifest = await buildAdoptedManifest();
  assert.equal(manifest.requirements.capability.length, 1);
  assert.equal(manifest.requirements.port.length, 1);
  assert.equal(manifest.requirements.hostBinding.length, 1);
  assert.equal(manifest.satisfactionEvidenceRefs.length, 3);
  const linked = new Set(manifest.satisfactionEvidenceRefs.map((e) => e.requirement.primaryIdentity));
  for (const requirement of [
    ...manifest.requirements.capability.map((r) => r.reference),
    ...manifest.requirements.port.map((r) => r.reference),
    ...manifest.requirements.hostBinding,
  ]) {
    assert.ok(linked.has(requirement.primaryIdentity));
  }
});

test('V3-004/#328: APPLICABLE external-authority path carries genuine #327 declarations', async () => {
  const manifest = await buildAdoptedManifest();
  assert.equal(manifest.externalAuthority.applicability, 'APPLICABLE');
  if (manifest.externalAuthority.applicability === 'APPLICABLE') {
    const [declaration] = manifest.externalAuthority.declarations;
    assert.ok(declaration);
    assert.equal(declaration.authority.reference.role, 'external-authority');
  }
});

test('V3-004/#328: NOT_APPLICABLE external-authority path records explicit applicability evidence', async () => {
  const fixture = await buildManifestInput();
  const input = {
    ...fixture.input,
    manifestIdentity: 'manifest://acme/tally-ledger/7-not-applicable',
    externalAuthority: {
      applicability: 'NOT_APPLICABLE' as const,
      applicabilityEvidence:
        'composition declares no external Business SoR effect authority; all effects are runtime-local',
    },
  };
  const manifest = await adoptDacV003ApplicationManifest(await withDeclaredDigest(input), {
    sha256: createSha256Fake(),
  });
  assert.equal(manifest.externalAuthority.applicability, 'NOT_APPLICABLE');
  if (manifest.externalAuthority.applicability === 'NOT_APPLICABLE') {
    assert.ok(manifest.externalAuthority.applicabilityEvidence.length > 0);
  }
  // The applicability decision is digest-covered content: switching the
  // decision changes the canonical digest.
  const applicableDigest = await computeDacV003ApplicationManifestDigest(fixture.input, {
    sha256: createSha256Fake(),
  });
  const notApplicableDigest = await computeDacV003ApplicationManifestDigest(input, {
    sha256: createSha256Fake(),
  });
  assert.notEqual(applicableDigest, notApplicableDigest);
});

test('V3-004/#328: adoption is deterministic and content-bound (same content, same digest)', async () => {
  const fixture = await buildManifestInput();
  const first = await computeDacV003ApplicationManifestDigest(fixture.input, {
    sha256: createSha256Fake(),
  });
  const second = await computeDacV003ApplicationManifestDigest(
    { ...fixture.input, opaque: { ...fixture.input.opaque, extra: 'ignored-by-nothing' } },
    { sha256: createSha256Fake() },
  );
  assert.notEqual(first, second, 'opaque content participates in the content digest');
  const third = await computeDacV003ApplicationManifestDigest(
    {
      ...fixture.input,
      externalAuthority: {
        applicability: 'APPLICABLE',
        declarations: [
          {
            authority: buildExternalAuthority('sor://billing/acme-2'),
            capabilityRequirements: { reconciliation: true },
          },
        ],
      },
    },
    { sha256: createSha256Fake() },
  );
  assert.notEqual(first, third, 'a distinct authority declaration identity changes the digest');
});

test('V3-004/#328: adopted records are deeply frozen', async () => {
  const manifest = await buildAdoptedManifest();
  assert.ok(Object.isFrozen(manifest));
  assert.ok(Object.isFrozen(manifest.selectedDomainData));
  assert.ok(Object.isFrozen(manifest.requirements));
  assert.ok(Object.isFrozen(manifest.primaryRuntime));
  assert.ok(Object.isFrozen(manifest.ux));
  assert.throws(() => {
    (manifest as { applicationSemanticIdentity: string }).applicationSemanticIdentity = 'x';
  });
  assert.throws(() => {
    (manifest.selectedDomainData as unknown as unknown[]).push({});
  });
});

test('V3-004/#328: adoption rejects a foreign/forged manifest object and identity projection fails closed', async () => {
  const manifest = await buildAdoptedManifest();
  assert.ok(!isDacV003ApplicationManifest('not-an-object'));
  assert.throws(
    () => dacV003ManifestIdentityOf({ ...manifest } as never),
    (error: unknown) => error instanceof DacV003ManifestError && error.code === 'NOT_AN_ADOPTED_V003_MANIFEST',
  );
});

test('V3-004/#328 review repair R2 P1 regression: post-adoption mutation of the caller input cannot change adopted content or its verified digest', async () => {
  const fixture = await buildManifestInput();
  // Caller-owned nested content in every digest-covered opaque-preserved area.
  const nestedOpaque: Record<string, unknown> = {
    nested: { note: 'original', deep: { tool: 'composer' } },
  };
  const nestedProvenance: Record<string, unknown> = {
    layer: { tool: 'composer', options: ['a', 'b'] },
  };
  const nestedCapability: Record<string, unknown> = {
    retry: { policy: 'none', backoff: { baseMs: 10 } },
  };
  const nestedDeclarationOpaque: Record<string, unknown> = { notes: { source: 'sor-docs' } };
  const input = {
    ...fixture.input,
    manifestIdentity: 'manifest://acme/tally-ledger/7-r2p1-detach',
    opaque: nestedOpaque,
    compositionProvenance: nestedProvenance,
    externalAuthority: {
      applicability: 'APPLICABLE' as const,
      declarations: [
        {
          authority: buildExternalAuthority('sor://billing/acme-r2p1'),
          capabilityRequirements: nestedCapability,
          opaque: nestedDeclarationOpaque,
        },
      ],
    },
  };
  const manifest = await adoptDacV003ApplicationManifest(await withDeclaredDigest(input), {
    sha256: createSha256Fake(),
  });
  const digestBefore = manifest.manifestContentDigest;
  const materializedBefore = JSON.stringify(manifest);
  const opaqueBefore = structuredClone(manifest.opaque);
  const provenanceBefore = structuredClone(manifest.compositionProvenance);
  const externalAuthorityBefore = structuredClone(manifest.externalAuthority);

  // The caller mutates every adopted area at depth AFTER the one-time screen.
  (nestedOpaque.nested as Record<string, unknown>).note = 'changed-by-caller';
  ((nestedOpaque.nested as Record<string, unknown>).deep as Record<string, unknown>).tool =
    'attacker';
  ((nestedProvenance.layer as Record<string, unknown>).options as string[])[0] = 'tampered';
  ((nestedCapability.retry as Record<string, unknown>).backoff as Record<string, unknown>).baseMs =
    999;
  (nestedDeclarationOpaque.notes as Record<string, unknown>).source = 'attacker';

  // Returned adopted content and its verified digest are unchanged.
  assert.equal(manifest.manifestContentDigest, digestBefore);
  assert.equal(JSON.stringify(manifest), materializedBefore);
  assert.deepEqual(manifest.opaque, opaqueBefore);
  assert.deepEqual(manifest.compositionProvenance, provenanceBefore);
  assert.deepEqual(manifest.externalAuthority, externalAuthorityBefore);

  // The adopted areas are detached deep copies of the caller input...
  assert.notEqual(manifest.opaque, nestedOpaque);
  assert.notEqual(manifest.opaque, input.opaque);
  assert.notEqual((manifest.opaque as Record<string, unknown>).nested, nestedOpaque.nested);
  if (manifest.externalAuthority.applicability === 'APPLICABLE') {
    const [declaration] = manifest.externalAuthority.declarations;
    assert.ok(declaration);
    assert.notEqual(declaration.capabilityRequirements, nestedCapability);
  }
  // ...recursively frozen: direct mutation of the adopted nested content fails.
  assert.ok(Object.isFrozen(manifest.opaque));
  assert.ok(Object.isFrozen((manifest.opaque as Record<string, unknown>).nested));
  assert.ok(Object.isFrozen(manifest.compositionProvenance));
  assert.ok(
    Object.isFrozen((manifest.compositionProvenance as Record<string, unknown>).layer),
  );
  assert.ok(
    Object.isFrozen(
      ((manifest.compositionProvenance as Record<string, unknown>).layer as Record<string, unknown>)
        .options,
    ),
  );
  assert.throws(() => {
    ((manifest.opaque as Record<string, unknown>).nested as Record<string, unknown>).note = 'x';
  });
  assert.throws(() => {
    (
      (manifest.compositionProvenance as Record<string, unknown>).layer as Record<string, unknown>
    ).tool = 'x';
  });
});

test('V3-004/#328 review repair R2 P1 regression: forbidden records inserted into the caller input after adoption are not absorbed', async () => {
  const fixture = await buildManifestInput();
  const nested: Record<string, unknown> = { note: 'v0.0.3 opaque content' };
  const input = {
    ...fixture.input,
    manifestIdentity: 'manifest://acme/tally-ledger/7-r2p1-inject',
    opaque: { nested },
  };
  const manifest = await adoptDacV003ApplicationManifest(await withDeclaredDigest(input), {
    sha256: createSha256Fake(),
  });
  const digestBefore = manifest.manifestContentDigest;
  const materializedBefore = JSON.stringify(manifest);

  // Late insertion of every forbidden family into the ORIGINAL caller object.
  const validation = await buildValidationFor();
  const bindingRef = adoptDacV003RegistryReference('runtime-binding', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'domain-harness://runtime-binding',
    primaryIdentity: 'binding/instance-r2p1',
  });
  const logicalOperation = adoptDacV003LogicalOperationRef({
    baseline: { ...DAC_V003_BASELINE },
    runtimeAuthorityScope: 'domain-harness://runtime',
    logicalOperationIdentity: 'op://tally/commit-r2p1',
    externalAuthority: buildExternalAuthority('sor://billing/acme-r2p1-inject'),
    operationSemanticIdentity: 'tally/commit',
  });
  nested.validation = validation;
  nested.binding = bindingRef;
  nested.pendingOperation = logicalOperation;
  nested.currentWorkflowStep = 'step-9';

  // The adopted manifest is byte-identical: none of the late inserts reached
  // the returned content, and its verified digest did not move.
  assert.equal(JSON.stringify(manifest), materializedBefore);
  assert.equal(manifest.manifestContentDigest, digestBefore);
  assert.deepEqual(manifest.opaque, { nested: { note: 'v0.0.3 opaque content' } });

  // Re-presenting the mutated input cannot smuggle any of the forbidden
  // inserts past the one-time screen either: screening is part of
  // canonicalization, so the late-inserted records fail closed (whichever
  // screening class fires first by key order) before any digest logic.
  await assert.rejects(
    adoptDacV003ApplicationManifest(
      { ...input, manifestContentDigest: digestBefore },
      { sha256: createSha256Fake() },
    ),
    (error: unknown) =>
      error instanceof DacV003ManifestError &&
      [
        'MANIFEST_EVIDENCE_ABSORPTION',
        'INSTANCE_STATE_LEAKAGE',
        'LIVE_EXTERNAL_STATE_ABSORPTION',
      ].includes(error.code),
  );
});

// R3 P1 (review repair): JSON.parse produces an own ENUMERABLE DATA property
// named "__proto__" (CreateDataProperty semantics). Copying that key by
// ordinary {} assignment routes it through the legacy Object.prototype
// "__proto__" accessor — mutating the copy's prototype and silently dropping
// the key from adopted content and digest material — so the copy must define
// every key with data-property semantics instead.
function ownProtoKeyOf(holder: object): PropertyDescriptor {
  const descriptor = Object.getOwnPropertyDescriptor(holder, '__proto__');
  assert.ok(descriptor, 'the own enumerable "__proto__" key must survive adoption');
  assert.equal(descriptor.enumerable, true);
  assert.equal(
    'get' in descriptor || 'set' in descriptor,
    false,
    'the preserved "__proto__" key is an own data property, not the inherited accessor',
  );
  assert.equal(Object.getPrototypeOf(holder), Object.prototype, 'the copy prototype is not mutated');
  return descriptor;
}

test('V3-004/#328 review repair R3 P1 regression: an own enumerable __proto__ key from JSON.parse is preserved exactly at every opaque position', async () => {
  const fixture = await buildManifestInput();
  // Own "__proto__" data keys exactly as JSON.parse produces them, at every
  // adoption position: area root, nested object, array element, external
  // declaration areas, with object and scalar payloads.
  const opaqueArea = JSON.parse(
    '{"__proto__": {"note": "root-payload"}, "deep": {"__proto__": {"kind": "nested-payload"}, "value": 1}, "list": [{"__proto__": {"kind": "element-payload"}, "flag": true}]}',
  ) as Record<string, unknown>;
  const provenanceArea = JSON.parse(
    '{"__proto__": "v0.0.3-scalar-payload", "composedBy": "dac://app-composition/acme"}',
  ) as Record<string, unknown>;
  const capabilityArea = JSON.parse(
    '{"__proto__": {"retry": true}, "limit": 5}',
  ) as Record<string, unknown>;
  const declarationOpaqueArea = JSON.parse(
    '{"items": [{"__proto__": {"source": "sor-docs"}, "note": "external"}]}',
  ) as Record<string, unknown>;
  const input = {
    ...fixture.input,
    manifestIdentity: 'manifest://acme/tally-ledger/7-r3p1-proto-key',
    opaque: opaqueArea,
    compositionProvenance: provenanceArea,
    externalAuthority: {
      applicability: 'APPLICABLE' as const,
      declarations: [
        {
          authority: buildExternalAuthority('sor://billing/acme-r3p1'),
          capabilityRequirements: capabilityArea,
          opaque: declarationOpaqueArea,
        },
      ],
    },
  };
  const manifest = await adoptDacV003ApplicationManifest(await withDeclaredDigest(input), {
    sha256: createSha256Fake(),
  });

  // Every carrying position keeps the key: own, enumerable, a data property,
  // on an unmutated plain-object prototype.
  const adoptedOpaque = manifest.opaque as Record<string, unknown>;
  const adoptedDeep = adoptedOpaque.deep as Record<string, unknown>;
  const adoptedElement = (adoptedOpaque.list as Record<string, unknown>[])[0];
  assert.ok(adoptedElement, 'array element position is adopted');
  const adoptedProvenance = manifest.compositionProvenance as Record<string, unknown>;
  ownProtoKeyOf(adoptedOpaque);
  ownProtoKeyOf(adoptedDeep);
  ownProtoKeyOf(adoptedElement);
  ownProtoKeyOf(adoptedProvenance);
  assert.equal(ownProtoKeyOf(adoptedProvenance).value, 'v0.0.3-scalar-payload');
  // The payload stays an own key: it is NOT reachable through the prototype
  // chain of the adopted copy.
  assert.equal(adoptedOpaque.note, undefined);
  assert.equal(adoptedDeep.kind, undefined);
  // Content is preserved verbatim and the adopted copy's canonical JSON view
  // is identical to the screened input's.
  assert.deepEqual(manifest.opaque, opaqueArea);
  assert.deepEqual(manifest.compositionProvenance, provenanceArea);
  assert.equal(JSON.stringify(manifest.opaque), JSON.stringify(opaqueArea));
  assert.equal(JSON.stringify(manifest.compositionProvenance), JSON.stringify(provenanceArea));
  if (manifest.externalAuthority.applicability === 'APPLICABLE') {
    const [declaration] = manifest.externalAuthority.declarations;
    assert.ok(declaration);
    ownProtoKeyOf(declaration.capabilityRequirements as Record<string, unknown>);
    const declarationElement = (
      (declaration.opaque as Record<string, unknown>).items as Record<string, unknown>[]
    )[0];
    assert.ok(declarationElement, 'external declaration array position is adopted');
    ownProtoKeyOf(declarationElement);
    assert.deepEqual(declaration.capabilityRequirements, capabilityArea);
    assert.deepEqual(declaration.opaque, declarationOpaqueArea);
  }

  // Detached + deep-frozen: mutating the caller input's payloads after the
  // one-time screen changes nothing, and direct mutation of the adopted
  // payloads throws.
  const materializedBefore = JSON.stringify(manifest);
  const rootPayload = ownProtoKeyOf(opaqueArea).value as Record<string, unknown>;
  rootPayload.note = 'changed-by-caller';
  const nestedPayload = ownProtoKeyOf(opaqueArea.deep as Record<string, unknown>)
    .value as Record<string, unknown>;
  nestedPayload.kind = 'attacker';
  assert.equal(JSON.stringify(manifest), materializedBefore);
  const adoptedRootPayload = ownProtoKeyOf(adoptedOpaque).value as Record<string, unknown>;
  assert.ok(Object.isFrozen(adoptedRootPayload), 'the adopted "__proto__" payload is deep-frozen');
  assert.throws(() => {
    adoptedRootPayload.note = 'x';
  });
  assert.ok(Object.isFrozen(adoptedElement));
  // The global prototype is untouched as well.
  assert.equal(({} as Record<string, unknown>).note, undefined);
  assert.equal(Object.getPrototypeOf(Object.prototype), null);
});

test('V3-004/#328 review repair R3 P1 regression: the __proto__ key participates identically in canonical digest/material', async () => {
  const fixture = await buildManifestInput();
  const identity = 'manifest://acme/tally-ledger/7-r3p1-proto-digest';
  const withKey = {
    ...fixture.input,
    manifestIdentity: identity,
    opaque: JSON.parse('{"__proto__": {"note": "covered"}, "surface": "x"}'),
  };
  const withoutKey = {
    ...fixture.input,
    manifestIdentity: identity,
    opaque: JSON.parse('{"surface": "x"}'),
  };
  const digest = async (input: unknown): Promise<string> =>
    computeDacV003ApplicationManifestDigest(
      input as Parameters<typeof computeDacV003ApplicationManifestDigest>[0],
      { sha256: createSha256Fake() },
    );
  const digestWith = await digest(withKey);
  // The key and its payload are digest-covered content: dropping the key or
  // changing content under it moves the canonical digest, deterministically.
  assert.notEqual(digestWith, await digest(withoutKey), 'the own key is digest-covered');
  assert.notEqual(
    digestWith,
    await digest({
      ...withKey,
      opaque: JSON.parse('{"__proto__": {"note": "changed"}, "surface": "x"}'),
    }),
    'payload content under the own key is digest-covered',
  );
  assert.equal(digestWith, await digest(withKey), 'digest over the key is deterministic');
  // The adoption-verified digest is exactly the digest over the caller input,
  // and the adopted copy's canonical JSON view equals the input's.
  const manifest = await adoptDacV003ApplicationManifest(
    { ...withKey, manifestContentDigest: digestWith },
    { sha256: createSha256Fake() },
  );
  assert.equal(manifest.manifestContentDigest, digestWith);
  assert.equal(JSON.stringify(manifest.opaque), JSON.stringify(withKey.opaque));
});
