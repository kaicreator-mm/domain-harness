# V3-005 / #329 — DAC v0.0.3 C39–C77 conformance closure coverage

Status: executable closure over `v0.3` task branch
`v0.3_t329_v3005_c39_c77_conformance` (base `v0.3@f4d67300e375281e1218369171e143a41ac10dd7`
/ tree `dead62168ec9e751e98a85defab723eee708eeb9`), consuming the merged
surfaces of #323 (V3-001 `src/dac-v003/**`), #325/#339 (V3-002
`src/dac-v003-compatibility/**`), #327 (V3-003 `src/dac-v003-external/**`),
#328 (V3-004 `src/dac-v003-manifest/**`) and the A2 lanes they consume
(#306 composition intake, #307 runtime binding, #308 UX bridge, #309
external authority evidence).

Semantic authority: DAC v0.0.3 semantic freeze commit
`3322b2152253b3c60f254c23a4f9ab1a14e063d1` / tree
`163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06`, case definitions from
`spec/v0.0.3/CONFORMANCE_MATRIX.md` §1.2 (additive cross-lane coverage from
#44 §7; C01–C38 historical, unchanged, out of scope here).

This directory is **additive conformance evidence only** — no product
source, dist, or frozen doc was changed.

## Classification vocabulary (frozen by the #329 dispatch)

- `PASS` — the Harness owns the applicable obligation and executable
  evidence in this directory proves the required contract result.
- `NOT_APPLICABLE` — the obligation applies to no Harness surface.
- `NOT_OWNED` — the obligation belongs to an upstream/external lane
  (producer/evolution, promotion/selection authority, external Business SoR
  truth, Domain UX semantics); the row records executable Harness-side
  boundary evidence (fail-closed at every Harness authority position) and
  never claims the non-owned authority.

## Final classification: 31 PASS / 0 NOT_APPLICABLE / 8 NOT_OWNED (39 cases)

R1 correction (review 5813257460 P1-2): C50 is reclassified PASS -> NOT_OWNED.
Frozen C50 fails closed when the exact parent/root OR the owning evolution
operation is missing. The generic Harness-owned P4 primitive enforces the
parent/provenance half (kept as bounded boundary evidence), but the
owning-evolution-operation half is enforced by no merged Harness-owned
authoritative consumer — P4 requires only `parentRefs`+`provenanceRefs`,
`derivationOperationRef` is optional and only structurally validated when
present, and an operation-missing probe with valid parent/provenance passes
every Harness surface (proven in the C50 test). That judgment belongs to the
upstream evolution/producer lane. The old `32 PASS / 7 NOT_OWNED` number is
not preserved by broadening generic P4.

R1 repair (review 5813257460 P1-1): `c77-positive-boundary-path.test.ts` is
now ONE CONNECTED executable journey. The authored/evolved lineage is linked
to the promoted/selected subject by an ASSERTED exact transformation
relation (subject semantic+revision continuity; the digest axis is the
declared compiled artifact — no false evolved-digest==package-digest
requirement); the DAC v0.0.3 compatibility validation and its external
manifest association consume the SAME #306 verdict instance the Runtime
binding/activation gates on (object-identity asserted, historical v0.0.2
binding API unchanged); the Harness-owned Runtime consequence/outcome step
is actually executed (commit-claim predicates + runtime-logical outcome
correlation under the activated package pin) and read; the UX consequence
evidence is correlated to that resulting Runtime outcome with Domain UX
semantics NOT_OWNED. Three journey negatives prove foreign/unlinked
lineage, unrelated/incompatible compatibility evidence, and
acceptance-only/ambiguous external evidence each cannot reach the success
path.

R1 repair (review 5813257460 P2-1): the adversarial suite now attacks the
real executable axes — the retry attack changes the logical-operation
IDENTITY while holding effect semantics valid (the safe-retry surface
refuses foreign prior-attempt correlation with CORRELATION_CONFLICT, with a
same-operation positive control; the materially-changed-effect-semantics
check is separately and correctly labeled); idempotency independently
exercises effect-equivalence, issuer, promised-deduplication-scope and
foreign-authority mismatches with a genuine-reuse positive control;
adversarial 21 actually attempts renderer identity in the UX
semantic-definition role (mint layer + manifest slot + role vocabulary);
adversarial 22 exercises the strongest executable boundary (UX intent can
never mint/substitute/resolve Runtime command authority — command
correlation is minted only from a genuine Runtime message) and explicitly
maps the non-owned workflow-transition surface as outside this conformance
module. Matrix closure now verifies per-ref decisive semantic assertions,
not title inventory, and documents the 25-axes/24-declarations mapping
(5+6) exactly.

| Case | Group | Classification | Evidence (suite → test) |
| --- | --- | --- | --- |
| C39 | Shared Reference | PASS | `c39-c44…` alias rejection at every identity slot; `adversarial 1` manifest identity fields |
| C40 | Shared Reference | PASS | `c39-c44…` revision/digest contradiction (symmetric); `adversarial 2` same-scope foreign digest |
| C41 | Shared Reference | PASS | `c39-c44…` same digest / different scope never merges; `adversarial 4` foreign-scoped closure cannot associate |
| C42 | Shared Reference | PASS | `c39-c44…` evidence-for-A never reused for B (revision/digest/semantic axes) |
| C43 | Shared Reference | PASS | `c39-c44…` missing target ⇒ FAIL_CLOSED (rule + real validator) |
| C44 | Shared Reference | PASS | `c39-c44…` explicit unsupported target ⇒ INCOMPATIBLE, never collapsed with missing |
| C45 | Authoring/Evolution | NOT_OWNED | `c45-c52…` authored candidate fails P4 + every production authority position (producer lane owns the evolution check) |
| C46 | Authoring/Evolution | NOT_OWNED | `c45-c52…` Simulator PASS rejected as promotion evidence (promotion authority upstream) |
| C47 | Authoring/Evolution | NOT_OWNED | `c45-c52…` producer identity never substitutes evolution-operation authority (Simulator lane) |
| C48 | Authoring/Evolution | NOT_OWNED | `c45-c52…` ambiguity never fabricated into a produced candidate (capability exchange upstream) |
| C49 | Authoring/Evolution | NOT_OWNED | `c45-c52…` accepted-for-evaluation ≠ produced (exchange outcome ceilings) |
| C50 | Authoring/Evolution | NOT_OWNED | `c45-c52…` generic P4 parent/provenance closure fails closed (bounded evidence); owning-evolution-operation half proven not Harness-enforced (operation-missing probe passes) — upstream evolution lane |
| C51 | Authoring/Evolution | NOT_OWNED | `c45-c52…` qualitative improvement claim is not P6 evidence (evolution lane owns the judgment) |
| C52 | Authoring/Evolution | NOT_OWNED | `c45-c52…` authored patch stays substitutable producer provenance, never evolution authority |
| C53 | Composition | PASS | `c53-c61…` both promotion and selection authorities separately required; `adversarial 5+6` |
| C54 | Composition | PASS | `c53-c61…` validation stops before binding/activation; `adversarial 11` |
| C55 | Composition | PASS | `c53-c61…` contract/target/implementation identities separately referrable; `adversarial 3` |
| C56 | Composition | PASS | `c53-c61…` requirement ≠ host binding ≠ lifecycle binding (unsafe-alias group + provider role gate) |
| C57 | Composition | PASS | `c53-c61…` unsatisfied required requirement ⇒ INCOMPATIBLE, never COMPATIBLE (incl. foreign-profile evidence) |
| C58 | Composition | PASS | `c53-c61…` missing required UX semantic-role coverage ⇒ INCOMPATIBLE |
| C59 | Composition | PASS | `c53-c61…` renderer identity has no UX semantic authority slot; `adversarial 21` |
| C60 | Composition | PASS | `c53-c61…` runtime identity refuted as external SoR identity; `adversarial 20` |
| C61 | Composition | PASS | `c53-c61…` live external state absorption fails closed; `adversarial 10` instance-state vocabulary |
| C62 | External Operation | PASS | `c62-c70…` dispatch proves dispatch only |
| C63 | External Operation | PASS | `c62-c70…` acceptance/provider-scope success never commit; `adversarial 12` |
| C64 | External Operation | PASS | `c62-c70…` timeout/unknown stays UNKNOWN_AMBIGUOUS; `adversarial 13` local-cause refutation |
| C65 | External Operation | PASS | `c62-c70…` duplicating retry denied without proof (unproven idempotency key authorizes nothing) |
| C66 | External Operation | PASS | `c62-c70…` idempotency reuse forbidden on effect and scope axes; `adversarial 16` |
| C67 | External Operation | PASS | `c62-c70…` attempt ≠ logical operation, replay denied; `adversarial 15+25` |
| C68 | External Operation | PASS | `c62-c70…` provider job ≠ authoritative effect record; `adversarial 23` |
| C69 | External Operation | PASS | `c62-c70…` currentness by provider semantics, never arrival order; `adversarial 17+18` |
| C70 | External Operation | PASS | `c62-c70…` preserved exact identities reconcile to RECONCILED_COMMITTED |
| C71 | Cross-lane E2E | PASS | `c71-c77…` authored/evolved candidate cannot enter production selection/manifest |
| C72 | Cross-lane E2E | PASS | `c71-c77…` Simulator PASS rejected in promotion AND selection positions |
| C73 | Cross-lane E2E | PASS | `c71-c77…` promotion-only or foreign-revision selection coverage fails closed |
| C74 | Cross-lane E2E | PASS | `c71-c77…` compatibility PASS never binds/activates; `adversarial 11` |
| C75 | Cross-lane E2E | PASS | `c71-c77…` acceptance never becomes Runtime success or UX claim (UX semantics NOT_OWNED) |
| C76 | Cross-lane E2E | PASS | `c71-c77…` no renderer slot on UX closure + external identity refutation; `adversarial 20+21` |
| C77 | Cross-lane E2E | PASS | `c77-positive-boundary-path…` ONE CONNECTED journey (asserted lineage→subject identity continuity, same-verdict-instance correlation into binding/activation, executed Runtime consequence/outcome, UX correlation) + foreign-lineage / unrelated-validation / acceptance-only negatives; `adversarial 8+9` |

## Files

- `conformance-matrix.ts` — the machine-readable C39–C77 matrix (one row per
  case: obligation, frozen source, applicable surface, owner/boundary,
  expected result, executable evidence refs with decisive semantic
  assertions, adversarial refs, classification, reason, identity linkage
  where identity-sensitive).
- `matrix-closure.test.ts` — self-verification: exact C39..C77 ids; no
  blank rows; every evidence file exists, every quoted test name is really
  declared in it AND its decisive semantic assertions (error codes /
  dispositions / frozen outcomes, carried per evidence ref as `asserts`)
  literally occur in the source — semantic verification, never a
  title/source-string inventory; classification vocabulary; counts 31/0/8;
  the consumed freeze equals the dispatched freeze; the dispatch's
  adversarial list (25 attack axes in 24 declarations — axes 5 and 6 share
  one declaration that executably carries both attacks, documented exactly
  in the closure test) and the C77 lane list + three journey negatives are
  fully materialized.
- `c39-c44-shared-reference.test.ts` — Shared Reference group + foundation
  role-inequality freeze.
- `c45-c52-authoring-evolution-boundary.test.ts` — producer/evolution lane
  boundary (all eight cases NOT_OWNED; C50 keeps the generic P4
  parent/provenance closure as bounded Harness-side evidence).
- `c53-c61-composition.test.ts` — Composition group.
- `c62-c70-external-operation.test.ts` — External Operation group.
- `c71-c77-cross-lane.test.ts` — Cross-lane E2E negatives.
- `c77-positive-boundary-path.test.ts` — the reviewed complete positive
  boundary path as ONE CONNECTED exact identity/provenance story (asserted
  lineage→subject continuity, same-verdict-instance correlation through
  compatibility validation into binding/activation, executed Runtime
  consequence/outcome step, UX correlation to that outcome) with mandatory
  ownership marking plus the three journey negatives (foreign lineage,
  unrelated/incompatible validation, acceptance-only evidence).
- `adversarial-shortcuts.test.ts` — the dispatch-mandated adversarial list:
  25 executable attack axes in 24 test declarations (axes 5+6 share one
  declaration carrying both attacks), each failing closed or producing the
  frozen non-success disposition, with positive controls on the axes the
  R1 repair made independently meaningful (foreign-operation retry,
  idempotency issuer/scope/effect), renderer identity actually attempted in
  the UX semantic-definition role, and the UX-intent claim narrowed to the
  executable command-authority boundary.

## Recorded observations (not defects, no product change made)

1. **P3 — manifest `applicationSemanticIdentity` has no mutable-alias
   check** (only `applicationRevisionIdentity` and `manifestIdentity` are
   alias-checked at manifest adoption, per the reviewed #328 surface and its
   own closure tests). The application semantic identity is a stable
   application name rather than a revision/locator-sensitive identity, and
   every reference-level semantic slot that feeds composition is
   alias-checked by V3-001; recorded here for traceability, deferred to the
   authority that owns the manifest adapter if ever promoted.
2. The manifest association checks bind the exact target profile, UX
   closure tuples and requirement identities — the validator-environment
   support set is intentionally part of the validation identity (different
   support set ⇒ different validation), not of the association gate; this
   matches the reviewed #328/#325 semantics and is pinned by
   `adversarial 7` at the target axis.

No P0/P1 product defect was discovered by this closure.

## Fixture provenance

All fixtures build genuine objects through the real public surfaces (the
#323/#325/#327/#328 fixtures under `tests/dac-v003/`, `createCompiledPackage`
and `createSha256Fake` from the package suites, and the #309 evidence
builders consumed read-only). Portable in-memory conformance only — never
host-durability evidence. No product source was changed by this closure.
