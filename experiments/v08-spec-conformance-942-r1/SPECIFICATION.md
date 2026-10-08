# v0.8 Package / Component / Graph / Operation Candidate Conformance Specification (Research Only)

Status: PROPOSED_DETAIL + BOUNDED_EXECUTABLE_CONFORMANCE. NOT NORMATIVE_FROZEN. No v0.8 implementation authority.
Authority: #942 and #932, user-selected final ontology B; reference PRs #940, #944, #945. These files must never silently supersede frozen v0.7 contracts.
Scope: Format/Schema/Identity/Graph/ABI test contract. Not an SDK loader, Runtime, Assembly Authority, Effect Journal, or Operation dispatcher.

## SPEC-PKG-01 — Package candidate

- Package and Component are separate identities. PackageId + PackageVersion identifies the delivery unit; semantic Component identity is qualified by PackageId / ComponentId and pinned material digest. Runtime Occurrence, target-compiled package and sealed Assembly have distinct identities.
- Candidate manifest fields: formatVersion=dhpkg/0.8-candidate-1; packageId; packageVersion; targetAbi; hostRequirements; dependencies[] exact {packageId,version,digest}; imports[] exact {fromPackage,componentId,digest}; exports[] component IDs; components[] definitions; implementations[] exact {implementationId,componentId,path,sha256}; integrity.
- All versions must be exact numeric x.y.z. Floating refs/latest/current/default/ranges fail. No arbitrary code or secret-bearing Host handles appear in a semantic Component or Package Manifest.
- Candidate digest domain is dh.package.candidate/1, SHA-256 over canonical JSON of the manifest without integrity and a code-unit-sorted list of {path,sha256(actual UTF-8 artifact bytes)}. The artifact SHA MUST match the declared implementation SHA. A checksum over attacker-supplied text alone provides integrity, not a trusted publisher identity or signature.
- A verifier MUST receive the actual bytes from a trust-anchored source and verify that each Implementation, manifest, and Component belongs to the same attested Package. Merely accepting caller-supplied package digests and JavaScript function references is invalid.
- Exact dependency closure MUST reject missing/duplicate dependencies, cycles, mismatched versions and digests; import/export authorization must bind exact source Component material. A Package cannot mint additional Runtime Authority.
- Format Version and Package content version are independent. A changed format is not inferred from package semver, and unknown format must fail closed. The current candidate supports only dh.node22/1 as a demonstrator target ABI; portability beyond this host is NOT_TESTED.
- Optional display metadata and nonMaterialExtensions cannot be a covert source of behavior. Any material extension changes the relevant domain digest and requires explicit must-understand declaration.

Decision needed: independent publisher/authenticity trust root and byte-to-executable-module resolution. Tests prove local byte binding, not a complete v0.7-compatible trusted loader.

## SPEC-COMP-01 — Unified Component B candidate

- One Component ontology, open versioned KindRef {kindId,version}. The Standard SDK seed contains Schema, Rule, Decision, Workflow, Operation at candidate 1.0.0. This is NOT a Microkernel enum and exact final IDs remain candidates.
- Required fields: schemaVersion=ucb/1, componentId, packageId, kindRef, semanticBody, requiredSemanticContracts, requiresCapabilities, providesCapabilities, relations, operations. Empty operations is valid for pure Schema or other non-callable Components.
- A Kind MUST be understood through its exact versioned Implementation/semantic validator. Unknown behavioral Kind or required Semantic Contract MUST fail before seal/invocation, following v0.7 component-admission.ts and kind-compatibility.ts, not a new global registry.
- The candidate semantic digest is dh.ucb.component-semantic.candidate/1 over KindRef, semanticBody, required semantics, capabilities, and operation ABI. ComponentId and PackageId are logical identity, relations move into Graph identity, and explicitly non-material metadata is excluded. v0.7 component semantic digest domain, byte content and historical hashes remain immutable.
- Input MUST reject unknown behavior-bearing fields, duplicate Operations, malformed version selectors, noncanonical records, and unsupported effect classifications. NonMaterialExtensions are retained as passive data and never passed as executable semantics.
- Legacy Semantic and Tool are read-only adapter views, not rewritten historic envelope/digest. Real old T002/T004 production ABI is not proven by the A demonstration.

Open: admitted Kind validators are mandatory, but this candidate local validator currently checks the understood Kind/ref set and not the full closed-world Kind-specific semanticBody validator: this is a documented incomplete integration with v0.7. Do not call it full MUST-understand conformance.

## SPEC-GRAPH-01 — Definition + derived Capability bindings

- Definition Graph owns relations; Runtime owns execution and occurrence facts. Do not create a second authoritative mutable Capability Graph.
- Relations carry exact target {packageId,componentId,digest}; qualified Component IDs and source Package pins remove accidental cross-Package collision. Cross-Package references MUST be permitted by a declared dependency and import/export with exact Component digest.
- Capability Contract identity (capabilityId+version) differs from Provider Component, selected Kind Implementation, Package artifact digest, and live Host resource.
- Provider selection: 0 matches => missing; 1 => unique; N => ambiguity unless explicit exact provider selection. A selected Provider MUST declare the requested operation. No late provider hot swap inside a sealed Assembly.
- Package DAG and material dependency edges MUST be cycle checked. Diamond paths are allowed with one identical exact pin. Relation kind governs whether an edge is topological; not every semantic relation is an execution dependency.
- Graph Digest domain dh.ucb.graph.candidate/1 binds exact Components, relations and derived selected capabilities, independent of map iteration order. Graph identity is distinct from Package digest or Runtime Occurrence identity.
- Before runtime activation, selected bindings and implementation identities MUST be snapshotted and sealed by the established v0.7 Authority; a passive JSON Graph hash alone cannot guarantee immutability.

Open: no native verified B Package -> authentic T002 sealed Assembly -> T004 invocation chain. In particular provider currentness and actual handler pin remain BLOCKED_BY_P1.

## SPEC-OP-01 — Operation / implementation ABI

- Operation ID is scoped to Component. InputSchema, OutputSchema, failures[], effect (none/idempotent/non-idempotent), callers[], exposure are versioned material data. Duplicate operation IDs and references to undeclared operations reject.
- Operation-only Components and Rule/Workflow Kind operations use the same invocation contract; no second Tool ontology. A pure Schema with no operations has no callable endpoint.
- Invalid input/output and undeclared failure codes reject with distinct typed failure classes; no unknown failure rewritten into a generic success.
- An invocation must carry trusted sealed Assembly, Occurrence, Caller, exact capability+operation, exposure, and admitted resource pins. Caller-supplied fields are claims, not authority. Effects cannot bypass centralized v0.7 Admission/State Writer/Effect Journal and their failure/UNKNOWN/recovery semantics.
- Executable implementation identity is not equal to an arbitrary string named implementationDigest. Exact artifact bytes and trusted load resolution must bind the callable handler; seal must prevent mutation or substitution. Closing over caller-owned mutable handlers is forbidden.
- The local ABI validator checks schema and fail-closed preconditions only. It DOES NOT issue tokens, implement Admission, commit State, invoke business code, own a Journal or claim forged context could be distinguished from a true Runtime token.

## Known review P1 and real test interpretation

- P1-F1 (#944): mutable caller handler after seal changes behavior while Assembly digest remains unchanged. MUST be fixed in owner-approved implementation work and independently re-reviewed. Current expected-gap witness is green when the defect reproduces.
- P1-F2 (#944): attacker-forged Package pin plus separately supplied Component/handlers bypass original Package byte provenance and cross-Package import/export checks. A local contract validator does not close the native bridge.
- P1-F3 (#944): unknown required Semantic Contract or unknown material Kind admitted. Candidate validation adds an understood-ref rejection, but full v0.7 admission/semantic validator integration is missing.
- #945 additionally established an injectable toy effectAuthority seam, not proof of a production v0.7 effect bypass.
- PR #940 Kernel's business.workflow/action special branches and lifecycle gaps remain outside this spec test's write scope.

## Conformance levels and rules

- CONFORMANCE_PASS: assertion on the defined contract is satisfied on a real host at an exact SHA. Local schema-only PASS is scoped to format, NOT a claim the existing #944 B runtime implements it.
- CONFORMANCE_FAIL: candidate runtime accepts prohibited behavior, returns inconsistent identity, or fails a required negative. The separate expected-gap test can itself return success while its associated architectural rule stays FAIL.
- EXPECTED_GAP_REPRODUCED: deliberate demonstration of existing #944/#945 defects. Must NEVER contribute to passed conformance rule totals.
- NOT_TESTED: no executable evidence on the requested subject. BLOCKED_BY_P1: native B linked runtime execution while P1-F1/F2/F3 remain unresolved.
- One test may include multiple valid/invalid variants. The rule-matrix JSON identifies each test ID and test command, rather than inventing unrelated Demo projects.
- Gate B (v0.7 production State/Effect/Replay, fault recovery, Windows/ECF and clean consumer) remains separate.

## Compatibility and re-use decisions

- v0.7 semantic digest: packages/domain-harness/src/contracts/component-digest.ts. Domain separator remains domain-harness.v0.7.component-semantic, immutable.
- v0.7 canonical/record safety: contracts/identity.ts and contracts/record-safety.ts. Candidate validator is a standalone *specification proof only*, NOT a production replacement. Future implementation should call existing accepted primitives.
- Must-understand: contracts/component-admission.ts, kind-compatibility.ts. Closed-world understood Kind validators are required.
- Graph: contracts/definition-graph.ts, capability-provision.ts, capability-dependency-closure.ts.
- Sealed binding: contracts/runtime-assembly.ts and tool-implementation-binding.ts.
- Central effect authority: admission/admission.ts, admission/effect-journal.ts and effectful invocation. Never replace with toy State/Receipt path.
- Present candidate only proves a subset of versioned Contract parsing, object identity, byte checks, 0/1/N provider selection, Graph refs, and Operation schema validation. Production-equivalence = NOT_TESTED.

## Minimum remaining corrections (without SDK redesign)

GAP-SPEC-01 / P1: seal verified artifact bytes and selected executable handler identity, snapshot ownership, no caller mutable post-seal handle; native B Package linker path. Requires native integration test after #944 repair, NOT another loader.
GAP-SPEC-02 / P1: bridge actual verified Package contents/imports/exports to B Component admission and exact implementation pins. Needs one bounded native B integration test, not one per format.
GAP-SPEC-03 / P1: bind exact Kind validator and all required Semantic Contracts from existing v0.7 Admission; absent or unknown required behavior rejects.
GAP-SPEC-04 / P1: actual v0.7 Central Admission and Scoped Invocation context required for effectful B path; do not accept arbitrary toy effectAuthority as production assurance.
GAP-SPEC-05 / P2: stable treatment of unordered Manifest collection ordering vs material arrays must be frozen with cross-agent canonical golden fixtures; this current candidate canonicalizer verifies key order but does not yet normalize all set-like Manifest arrays.
GAP-SPEC-06 / P2: complete JSON Schema semantics, caller/exposure and failure mapping, malformed JSON duplicate-member acceptance and resource target portability; current validator is intentionally bounded.
GAP-SPEC-07 / P2: dependency cycle / diamond and lifecycle provider-before-consumer/reverse cleanup on attested Package closure, including realistic signing/pin propagation. No separate toy kernel.
GAP-SPEC-08 / P2: old Semantic/Tool -> B adapter parity against actual T002/T004 and Gate B State/Effect/Replay differential, clean Host consumer.

## Commands

node --test experiments/v08-spec-conformance-942-r1/tests/conformance.test.mjs
node --test experiments/v08-spec-conformance-942-r1/tests/known-gaps.test.mjs

Run at exact source SHA on isolated Ubuntu Actions, with tests counted separately from expected-gap witnesses. Docs and code are not approval to merge or to freeze v0.8.
