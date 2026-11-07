# DIS 0.2.0 Simplification and Migration Ledger — Unified Production Model

**Status:** successor Product/L1 proposal, NOT_FROZEN; schemas/demo/conformance pending.  
**Authority review:** #1494; **candidate PR:** #1493; **frozen predecessor:** DIS 0.1.0 @ 9504c78f4651f6c1ebc48c7858fca2d8b061544b.

Use KEEP / MERGE / REVISE / ADD / REMOVE / DEFER to record explicit v0.1.0-to-v0.2.0 concept decisions. Never overwrite frozen 0.1.0 files.

| Original / earlier candidate concept | Decision | 0.2.0 target and migration |
|---|---|---|
| Domain Intelligence as product goal | KEEP | Package is carrier, not the goal |
| Domain Scope and Consumer Profile | KEEP | Set boundaries, applicability and production qualification |
| Corpus and source materials | KEEP | Inputs, not automatically trusted/runtime resources |
| First-class Structured Knowledge abstraction | REMOVE | Structure is a knowledge quality/consumption requirement |
| Knowledge Structuring | ADD | Produces Candidate Intelligence Unit(s) and cited resources |
| One Unit per fact, file or helper | REMOVE | Plain data/helpers remain internal resources |
| Seven Intelligence Unit role classes | REVISE | Optional semantic profiles, no separate engines |
| Separate Knowledge Unit family | MERGE | Knowledge-access capability is ordinary Unit; data-only is Resource |
| Stable Unit identity | KEEP | id/revision/digest/owner/provenance/applicability |
| Unit description without executable capability | REVISE | Deployable Unit provides >=1 Capability and qualified processing |
| Capability requires/provides | KEEP | Versioned independent contract; Unit provides qualified implementation |
| Capability Runtime object / engine | REMOVE | No additional Dispatcher, Scheduler or authority |
| Implementation strategies | REVISE | Atomic/Composite profiles, trusted Function/Rule/Parser/Tool/Workflow bindings |
| Workflow parallel to Unit object family | MERGE | Workflow implements a Composite Unit |
| Pipeline as independently versioned asset | REMOVE | Descriptive term only |
| Composition Graph | KEEP/REVISE | Verifiable Workflow representation, not separate intelligence entity |
| Explicit authored Unit DAG | REMOVE | Main + Public/Subworkflows instead; BUILD derives safe closure |
| Unit dependency and Package DAG verification | KEEP | Exact provider dependencies and acyclic package loading |
| Package domain entry | REVISE | Business Primary with entry duty SHOULD expose Domain Main Workflow |
| App fixed entry | ADD | Exactly one pinned App Entry/Main Workflow |
| Recognizer outputs | MERGE | One canonical Structured Intent |
| Intent Router Engine | REMOVE | Intent Routing is a Capability implemented by Unit |
| Intent-to-Capability routing | ADD | Typed RouteDecision restricted to sealed eligible catalog |
| Dynamic Form | KEEP/REVISE | Optional clarification metadata, no authority |
| Control/Data/Evidence edges | KEEP | Three distinct independently verified flows |
| DAG_ONLY / nested invocation | REVISE/DEFER | Safe Core; optional separately proven bounded Subworkflow; 0.1 unchanged |
| Monolithic resource closure | REVISE | Runtime resources, build/test resources, provenance refs |
| Mandatory knowledge database/query engine | DEFER | #1476 handles optional storage / access |
| Production template and provenance receipts | ADD | Source, producer, transformation, profile, digest and reproducible verification |
| Composite qualification inherited from child PASS | REMOVE | Independent Composite qualification is mandatory |
| Qualification/promotion/selection/activation/execution | KEEP/REVISE | Distinct dimensions, exact-subject append-only governance evidence |
| Structural/Behavioral/Consumer Conformance | KEEP | Independent verdicts plus producer evidence profile |
| Boot/KDP/SDK/Business/Host | KEEP | #1484 authority; no second Runtime/Effect manager |
| Frozen DIS 0.1.0 | KEEP | New schema version and explicit loss-aware migration |
| Actual Runtime adoption | DEFER | Independent #1486 proof; demo pass is insufficient |

## Loss-aware migration

1. Reclassify data-only legacy Knowledge Units as typed Resources or genuine callable Knowledge-access Units; never invent a provides Capability.
2. Map Workflow Unit/Graph to Composite Unit processing; preserve exact graph refs, data/control/evidence semantics, branch/failure outcomes.
3. Merge Recognizer/Dynamic Form into canonical Intent Slots without losing value provenance or epistemic status.
4. Retain Capability contract identities/digests/versions, exact selected providers and qualifications; incompatible changes require new identity/version or explicit migration.
5. Keep qualification, governance disposition, package selection, activation and execution occurrence distinct.
6. Separate runtime, test-only and source/provenance resources; report missing/unsafe/unpinned resources and fail closed.
7. Explicitly flag missing source, RouteDecision, App Entry or behavior semantics for human adjudication; never fabricate evidence.
8. Never silently rewrite the 0.1.0 freeze or #1484 Product/L1 authority; resolve conflicts via #1494.

## Minimum independent conformance

- Generate Atomic Units from domain sources and reproduce validation/materialization of exact captured candidates.
- Show two providers of the same Capability with explicit AOT selection, and failures for missing/ambiguous/incompatible providers.
- Build and validate Composite Unit independently, including child-PASS/composite-FAIL counterexample.
- Execute Intent Recognition + Intent Routing Units across known/unknown/ambiguous/conflict/out-of-scope/no-match cases.
- Prove fixed App Entry has no router-bootstrap recursion, and exact cross-Package Public Capability is invocable.
- Repeat production and composition in a materially different non-media Domain.
- Reject wrong digests, unauthorized Tool/Host effects, forged promotion, bounded-invocation overflow and Package dependency cycles.

These are proposed migration decisions pending #1494 Product/L1 disposition, executable schemas, demo and independent Exact-SHA L2 Freeze.