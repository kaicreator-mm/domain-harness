# DIS 0.1.0 Revision Log

## Traceable history

| Stage | Commit | Artifact |
|---|---|---|
| Initial standard | 98e1e5066b6f6db8b850851655d007878e43f73b | Initial Unit and single-Edge draft, initial schemas |
| Initial demo | ea3b01e94b35a9a3ad26f70e2e0c62de38cfa546 | xDownload Player Recognition proof against initial draft |
| Initial validation | eb8b4d3836d6c8ef318d2b3af7e46e04fa57eba4 | 8/8 behavioral tests plus two design findings |
| Demo revision | This branch revision commit | Typed edges, schema resource closure, updated proof and negative tests |

## Findings and changes

### DIS-F-001 (P1) — control/data coupling

Initial Edge combined from, to, when and map. Decision and Procedure had to echo recognition data so downstream nodes could use it. Revised to three disjoint edge kinds: control selects execution paths only; data binds source output to target input without scheduling; evidence carries provenance into a declared Unit evidence slot without scheduling.

Implicit whole-output pass-through is prohibited. The revised demo proves that Decision output contains only its route and Procedure output contains only its resolution, while Validator independently receives Recognizer evidence.

### DIS-F-002 (P2) — unresolved Schema resources

Initial schemaRef was validated only as a string. Revised to safe Package-root-relative local references, nested local $ref closure resolution, path traversal/network reference rejection, SHA-256 Resource Closure Manifest and exact digest comparison. Missing resources and digest tampering are negative-tested.

## Scope and compatibility

- Existing Semantic/Tool Component families remain unchanged.
- Private Procedure remains private; no new Tool or Hook semantics are introduced.
- The frozen v0.7 Kernel/Microkernel, Domain Runtime and Host/Effect contracts remain the only execution authority. #1480 KDP is a non-frozen Product/L1 candidate and is non-normative for DIS 0.1.0.
- No SDK source, public ABI, Manifest/BUILD ABI, v0.10.3 tag, release, deployment or main branch was modified.
- This remains a standards experiment and does not claim the current DomainHarness Runtime consumes DIS.


## Final conformance refinement

The demo-revised candidate was further checked against its own machine-readable contracts. The final pass found and corrected four additional gaps:

### DIS-F-003 (P1) — Unit I/O Schema mismatch

The no-pass-through Decision emitted only `route`, but its output Schema required `recognition`; the private Procedure emitted a resolution without evidence, but the Resolution Schema required evidence. Updated both output Schemas to match the actual separated data/evidence model. Added validation of every executed Node input and output against the declared Unit Schema.

### DIS-F-004 (P1) — malformed Validation Report Schema

The Validation Report Schema was not valid JSON. Corrected the syntax and included it in the five-schema Draft 2020-12 self-validation suite.

### DIS-F-005 (P2) — unsafe path regex edge cases

The initial safe-path regex rejected traversal but accepted empty and dot path segments. Aligned Unit schemaRef, Graph schema refs, Definition workflowRef and Resource Closure path validation; added negative checks.

### DIS-F-006 (P2) — evidence fixture was not the runtime source

Unit evidence referenced player signature and strategy fixtures while the demo had duplicated hard-coded values. The runner now loads and consumes both fixture catalogs; a fixture-backed HLS path proves the source reference is operational.

The 0.1.0 Graph Pointer Profile is explicitly limited to root output or one top-level property pointers. Nested pointers are rejected, not partially supported. This is a deliberate version boundary and a candidate for a future revision.

Final verification is recorded separately in `FINAL_VALIDATION.md` and `final-validation.json`.


## Final verification evidence

- Demo/standard conformance commit: `d8c516e7b564db8572631d2d2d435491b8f43b33`.
- Final validation result: PASS.
- Node tests: 15/15; demo paths: known, ambiguous, unknown, fixture-backed HLS all passed.
- Standard schemas: 5/5 self-validated; six Units, Graph, Definition and Resource Closure validated.
- Per-node contract checks: 16 executed Node inputs and 16 outputs validated against their Unit Schemas.
- Final machine report: `validation/dis-0.1.0/final-validation.json`.
- Human-readable report: `validation/dis-0.1.0/FINAL_VALIDATION.md`.
- Validation commit: this commit, immediately following the tested demo/standard conformance commit above.


## DIS 0.1.0 L2 candidate refinement R1

The L2 review identified F001–F007 plus six additional clarifications. The candidate refinement records:

- **F001 (P1):** Design-time production/qualification and runtime consumption are separate, connected lifecycle planes; DomainForge internals are not prescribed.
- **F002 (P1):** #1480 KDP is explicitly non-frozen; DIS inherits the frozen v0.7 Kernel/Microkernel, Domain Runtime and Host/Effect contracts.
- **F003 (P1):** Reference Consumer emits actual per-Node input/evidence/output traces; Python Conformance validates those exact payloads instead of reconstructing inputs by Demo node names.
- **F004 (P1):** Definition pins Workflow Unit and Graph identities; every Graph Node Unit must be declared exactly once in the Definition.
- **F005 (P1):** Complete Resource Closure includes Units, Graph, Definition, Schemas, fixtures, implementation artifacts and conformance assets. Package descriptor pins the exact manifest SHA-256.
- **F006 (P1):** Typed registry/graph/tool implementation references are explicit; arbitrary dynamic imports are rejected.
- **F007 (P1):** Required input bindings are checked path-sensitively for exactly one source on every path; output/evidence sources must be required properties.
- **F008 (P2):** Realpath containment and a symlink-escape negative test supplement lexical path checks.
- **F009 (P2):** DIS 0.1.0 is strictly DAG-only; loops/retries are deferred.
- **F010 (P2):** Recognizer values preserve source provenance separately from status and uncertainty; Dynamic Form remains optional and grants no authority.
- **F011 (P2):** EXECUTED is an occurrence/evidence fact, not Unit qualification mutation.
- **F012 (P2):** A second materially different Domain Profile remains a pre-release-qualification gate; xDownload alone is not a generality proof.

This revision is a candidate refinement, not a final validation claim. Exact-HEAD Node/Python execution, Woodpecker status, bilingual review and independent Exact-SHA review are required before an L2 Freeze Checkpoint.
