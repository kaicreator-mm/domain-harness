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
- KDP remains the single Runtime/State/Effect authority.
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
