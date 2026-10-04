/**
 * T001B compile-time type fixtures (issue #541).
 *
 * Proof-only fixtures: they are typechecked by
 * `tsc -p tsconfig.test.json --noEmit` but are never executed. They pin the
 * digest surface to the exact T001A `ComponentEnvelope` input type and prove
 * that implementation/module/provider/assembly/activation/display identity is
 * unrepresentable on digest input, and that the digest material carries
 * exactly the six normative dimensions.
 */
import type {
  CapabilityContractRef,
  ComponentEnvelope,
  SemanticContractRef,
} from '../../src/contracts/component.js';
import {
  COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7,
  componentSemanticDigestMaterial,
  computeComponentSemanticDigest,
  type ComponentSemanticDigestMaterial,
} from '../../src/contracts/component-digest.js';
import type { ContentDigest, Sha256Port } from '../../src/contracts/identity.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

declare const envelopeFixture: ComponentEnvelope;
declare const sha256Fixture: Sha256Port;

// F1: the digest entry points accept exactly the T001A ComponentEnvelope type
// from src/contracts/component.js — no parallel digest-local envelope type.
const materialFixture: ComponentSemanticDigestMaterial =
  componentSemanticDigestMaterial(envelopeFixture);
async function digestEntryPointAcceptsComponentEnvelope(): Promise<ContentDigest> {
  return computeComponentSemanticDigest(envelopeFixture, sha256Fixture);
}

// F2: the digest input type exposes no implementation/module/provider/assembly/
// activation/display field — only the seven normative envelope dimensions.
export type DigestInputExposesNoImplementationField = Expect<
  Equal<
    Exclude<
      keyof ComponentEnvelope,
      | 'family'
      | 'componentId'
      | 'kind'
      | 'requiredSemanticContracts'
      | 'requiredCapabilities'
      | 'semanticBody'
      | 'nonMaterialExtensions'
    >,
    never
  >
>;

// F3: digest material carries exactly the six normative dimensions —
// componentId, nonMaterialExtensions, and every implementation dimension are
// excluded by construction.
export type MaterialIsExactlyNormativeDimensions = Expect<
  Equal<
    Exclude<
      keyof ComponentSemanticDigestMaterial,
      | 'digestDomain'
      | 'family'
      | 'kind'
      | 'requiredSemanticContracts'
      | 'requiredCapabilities'
      | 'semanticBody'
    >,
    never
  >
>;

// F4: the domain tag is the exact frozen v0.7 Component literal (never a
// borrowed graph-level or legacy artifact tag).
export type DomainTagIsFrozenV07ComponentLiteral = Expect<
  Equal<
    typeof COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7,
    'domain-harness.v0.7.component-semantic'
  >
>;

// F5: material refs stay exact two-key contract references (reconstructed,
// never embedded originals).
export type MaterialSemanticRefsAreExact = Expect<
  Equal<
    ComponentSemanticDigestMaterial['requiredSemanticContracts'][number],
    SemanticContractRef
  >
>;
export type MaterialCapabilityRefsAreExact = Expect<
  Equal<
    ComponentSemanticDigestMaterial['requiredCapabilities'][number],
    CapabilityContractRef
  >
>;
export type MaterialKindIsExactKindRef = Expect<
  Equal<ComponentSemanticDigestMaterial['kind']['kindId'], string>
>;

// F6: implementation identity stays unrepresentable on a digest input literal.
// @ts-expect-error assembly digest is not representable on the digest input
export const smuggledAssemblyDigestFixture: ComponentEnvelope = {
  family: 'semantic',
  componentId: 'quote.eligibility.rule',
  kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
  requiredSemanticContracts: [],
  requiredCapabilities: [],
  semanticBody: { ok: true },
  assemblyDigest: 'sha256:abc',
};
// @ts-expect-error implementation id is not representable on the digest input
export const smuggledImplementationFixture: ComponentEnvelope = {
  family: 'semantic',
  componentId: 'quote.eligibility.rule',
  kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
  requiredSemanticContracts: [],
  requiredCapabilities: [],
  semanticBody: { ok: true },
  implementationId: 'rule-engine-impl@9',
};

export { materialFixture };
