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
