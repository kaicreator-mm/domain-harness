# DIS 0.2.0 Simplification and Migration Ledger

**Status:** Initial decision baseline; pending Schema / Demo / Conformance validation  
**Controller:** #1493  
**Frozen predecessor:** DIS 0.1.0 @ `9504c78f4651f6c1ebc48c7858fca2d8b061544b`

This ledger records the disposition of each DIS 0.1.0 concept in 0.2.0. KEEP preserves semantics; MERGE combines overlapping concepts; REVISE retains the goal but changes the contract; DEFER moves a capability to an optional Profile or later version; REMOVE means it is no longer an independent normative concept. This ledger does not authorize deletion of DIS 0.1.0 history.

| DIS 0.1.0 concept/design | Decision | DIS 0.2.0 treatment | Rationale / migration impact |
|---|---|---|---|
| Domain Intelligence as product objective | KEEP | Central subject of the standard | Prevents drift back to Package-first thinking |
| Domain / Knowledge / Corpus | KEEP | Clarify scope, knowledge assets and candidate-material boundaries | Preserves the basis for domain understanding |
| Seven Intelligence Unit Roles | REVISE | Retain Roles with role-specific contracts | Avoids identical executable fields for every Role |
| Implicit one-Engine-per-Role implementation tendency | REMOVE | Roles are semantic profiles | Avoids seven engines and duplicated Runtime behavior |
| Common Unit identity | KEEP | Stable ID, revision, owner, scope, etc. | Preserves exact references and traceability |
| Mandatory Evidence / Failure fields on every Unit | REVISE | Require them according to Role and use | Data-only Knowledge must not pretend to be executable |
| Capability requires/provides | KEEP | Reuse existing Capability Contracts | Avoids a parallel Capability hierarchy |
| Workflow Unit | KEEP | Logical solving-capability contract | Retains reusable domain capability |
| Pipeline as an independent normative asset | REMOVE | Descriptive term only | Overlaps with Workflow/Graph |
| Composition Graph | KEEP | Structured composition of a Workflow | Supports deterministic execution and independent verification |
| Second Node Type taxonomy | REMOVE | Node references Unit; Role determines semantics | Avoids duplicate classification |
| Decision owns control transitions | REMOVE | Decision returns a judgment; Graph controls branches | Separates semantics from execution authority |
| control / data / evidence Edges | KEEP | Retain three mutually exclusive relations | Separates execution, data and evidence |
| Over-prescription of internal Graph validation algorithms | REVISE | Standard defines invariants; Conformance verifies them | Preserves cross-language implementation freedom |
| ECMAScript-specific comparison semantics | REVISE | Define language-independent normative semantics | Preserves cross-language consistency |
| Recognizer Output | MERGE | Unify as Structured Intent | Removes competing intent data models |
| Dynamic Form | REVISE | Optional interaction mapping to Intent Slots | Does not create a Form Runtime |
| Intent Slot / Structured Intent | ADD | Add canonical intent representation | Fills goals, entities, parameters and missing-information gap |
| DAG_ONLY | KEEP | Retain as base Graph Profile | Starts with simple, deterministic and verifiable execution |
| Loop Node / Loop Engine | REMOVE | Do not introduce | Avoids a new execution system |
| Bounded Subworkflow Invocation | DEFER / OPTIONAL PROFILE | Decide only after Demo and independent Conformance evidence | Allows bounded repetition without weakening DAG guarantees |
| Single Resource Closure | REVISE | Split Runtime / Build-Validation / Provenance | Avoids test fixtures polluting production Packages |
| Exact Digest / Lock | KEEP | Retain exact identity for required resources | Reproducibility and protection from resource drift |
| Mixed qualification/governance/selection/activation/execution enum | REVISE | Separate into five lifecycle dimensions | Prevents Package/Runtime events from polluting Unit-global state |
| EXECUTED as Qualification state | REMOVE | Execution occurrence only | Does not mutate immutable Units |
| Structural / Behavioral / Consumer Conformance | KEEP | Retain all three levels | Separates static structure, behavior and actual consumption |
| Demo PASS equals Runtime Adoption | REMOVE | Separate Reference Consumer from actual Runtime Adoption | Prevents overstating implementation capability |
| DomainForge internal production workflow | REMOVE | Define only artifact, identity and evidence interoperability | Avoids rebuilding Forge |
| Domain-Simulator internal simulation workflow | REMOVE | Define only validation evidence and governance boundaries | Avoids rebuilding Simulator |
| Database/graph/vector database selection | DEFER / OUT OF SCOPE | Handled by #1476 and implementation projects | Standard remains storage-technology neutral |
| Boot/KDP / Host / Effect authority | KEEP | Inherit successor Product/L1 under #1484 | No second Runtime or authority system |
| DIS 0.1.0 files and historical evidence | KEEP | Leave unchanged; migrate explicitly | Preserves frozen-version traceability |

## Migration rules

1. DIS 0.1.0 remains frozen; 0.2.0 uses new Schema Profiles and version identifiers.
2. Old Workflow/Pipeline/Graph structures map explicitly to Workflow + Composition Graph.
3. Mapping Dynamic Form fields to Intent Slots preserves provenance, confirmation status and uncertainty.
4. Inapplicable legacy Evidence/Failure fields are not blindly copied as mandatory 0.2.0 fields.
5. Lifecycle migration separates asset qualification, governance decisions, Package selection, Runtime activation and execution facts.
6. Resource Closure migration identifies actual Runtime dependencies, Build/Validation-only assets and Provenance-only references.
7. Lossy or ambiguous mappings are reported and require an explicit decision; no records may be fabricated.
8. Conflicts involving Product/L1, SDK ABI, KDP, Runtime or Host authority return to the corresponding superior authority.

## Validation questions

- Can a data-only Knowledge Unit pass Schema without fabricated execution fields?
- Can a Recognizer create/update Structured Intent while Dynamic Form only fills Intent Slots?
- Can Workflow + Graph express all current xDownload Demo paths without a separate Pipeline entity?
- Can independent Conformance reconstruct all three Edge kinds from actual Traces?
- Can Build-only fixtures remain outside the production Runtime Resource Closure?
- Can Lifecycle express Promotion, Selection, Activation and Execution without mutating a Unit?
- If Bounded Invocation is admitted, are invocation limits, exit conditions, failure policy and idempotency semantics clear?

Any failed question requires a standard revision or explicit deferral; it must not be bypassed by adding another Engine.
