# full-core005-r0 — CORE-005 executable semantics on the real AOT selection

R211 lane C5 (kaicreator-mm/domain-harness#1546, DAG #1544), based on the
exact parent HEAD `ea12163301e2be629ccf4bb6914f19b33177913b`.

## What this closes (engineering scope only)

The CORE-005 matrix row is PARTIAL. This lane adds the missing
requirement-specific evidence on the **real AOT selected element set**
(original Tally/xDownload/Runx/orders sources via `native-fixture.mjs`):

1. **Static Element dependency subgraph** — independently extracted from the
   qualified artifact (9 elements / 4 static edges) and validated with an
   own topological check. It must be acyclic; a cycle is refused at AOT
   compile with `DIS_DEPENDENCY_CYCLE`.
2. **Semantic relations** — both registered source-linked `constrains`
   relations (`xdownload.policy.constrains.acquire` with the real Knowledge
   verifier, plus the lane's `core005.tally.tasks.constrains.release` with
   the real Rule verifier `tally.assessTaskEvidence`) stay `authority NONE`
   and `verifiedBusinessSemantics:false`; legal semantic cycles (metadata
   `cooperates` backlinks) are accepted while the static graph stays acyclic.
   Neither graph is a runtime data-flow authorization.
3. **Executable constraints/invariants** — `CORE005-INV-STATIC-ACYCLIC`,
   `CORE005-INV-RELATION-MIRROR`, `CORE005-INV-VERIFIER-BINDING` evaluated
   against the real qualified data, plus runtime collaboration invariants
   that reject with the violated invariant id named.
4. **Collaboration semantics** — one orchestrated call composing three real
   selected Functions of two Elements (`xdownload.describePolicy` ->
   `xdownload.interaction.inspect` -> `xdownload.interaction.confirm`),
   ending typed `PENDING_AUTHORIZATION` with `authority NONE`,
   `effectDispatched:false`, no KDP intent dispatched.

## Fail-closed negatives (each has a test)

- static dependency cycle in the collaboration subgraph -> AOT refusal
  (`DIS_DEPENDENCY_CYCLE`), while the semantic-only cycle variant compiles;
- unmirrored `depends-on` relation -> `DIS_RELATION_DEPENDENCY_MISMATCH`;
- collaboration plan skipping the observed-policy precondition -> rejected
  naming `CORE005-INV-COLLAB-PRECONDITION`;
- forged confirm output claiming `effectDispatched:true` -> rejected naming
  `CORE005-INV-COLLAB-NO-EFFECT`;
- declared SAP obligation with **no qualified independent semantic Oracle**
  -> explicit `BLOCKED` (`CORE005_MISSING_QUALIFIED_ORACLE`), never a silent
  pass, obligation record never mutated;
- forged SAP claims (self-declared "proven" without a versioned credential,
  malformed credentials, unregistered Oracle, wrong obligation binding) ->
  `CORE005_SAP_CLAIM_REJECTED`; an honest `proven:false` claim is a typed
  UNKNOWN, not an error;
- forged authority at the real AOT seams (`SAP_QUALIFIED` element validation,
  `INDEPENDENT_ACCEPTED` relation contract, forged verifier outcome) ->
  `DIS_ELEMENT_VALIDATION_INVALID` / `DIS_RELATION_CONTRACT_INVALID` /
  `DIS_OUTCOME_UNDECLARED`;
- missing/unrecognized SAP owner -> typed UNKNOWN
  (`CORE005_SAP_OWNER_UNRESOLVED`); absent/unknown relation owner at AOT ->
  `DIS_RELATION_INVALID`.

## Honest scope (read before reviewing)

- The SAP Oracle registry (`CORE005_SAP_ORACLE_REGISTRY`) is a frozen empty
  constant: **no qualified independent semantic Oracle exists**. Formal
  original qualification is blocked upstream in
  `kaicreator-mm/domain-intelligence-engineering#155` (F-A/F-B). This lane
  does not and must not mint one; the BLOCKED verdict is the truthful
  current authority state demonstrated by a fail-closed gate.
- Everything here is structural/engineering evidence. It does NOT promote
  `DIS020-CORE-005` from PARTIAL, does not mint qualification, Effect,
  Experience, L2 or Release, and is not the C2 owner-contract (that seam is
  integrated serially by the central Integrator).
- Files: `core005-semantics.mjs` (self-contained engineering layer, no
  imports from other lanes), `full-core005.test.mjs` (10 native node:test
  cases, positives + negatives), shared `native-fixture.mjs` reused
  unchanged.

## CI

`.woodpecker/dis-v020-full-core005-r0.yaml` runs the lane tests plus the
registered B07 R52/R53 static-dependency and semantic-relation regression
tests on the exact PR SHA.
