# DIS 0.2.0 Simplification and Migration Ledger — Unified Unit and Package Lifecycle

**Status: successor Product/L1 candidate / L2 DRAFT / NOT_FROZEN.**
**Authority:** #1494; **candidate PR:** #1493; **frozen predecessor:** 0.1.0 at `9504c78f4651f6c1ebc48c7858fca2d8b061544b`.
**Unchanged architecture:** Boot/KDP #1484, KDP/SDK/Business #1480. Candidate decisions do not rewrite frozen 0.1.0.

| Previous concept | Decision | Target and rationale |
|---|---|---|
| Domain Intelligence is product objective | KEEP | Package is a materialized carrier |
| Domain Scope / Consumer Profile | KEEP | Production, applicability and target qualification |
| Knowledge Corpus / source materials | KEEP | Inputs, not automatically trusted runtime assets |
| Independent Structured Knowledge ontology | REMOVE | Knowledge Structuring is a production process; structured semantics are Data Unit obligations |
| Knowledge Structuring / Unit Production | ADD | Candidate Units plus source/tool/validation receipts |
| Knowledge vs processing as parallel object families | MERGE | Data / Processing / Composite are profiles of one Unit |
| Facts/config/rule files | REVISE | Group into semantically governed Data Units; physical files are payload; not one Unit per fact |
| Mandatory callable Capability on every Unit | REVISE | Data Units may lack provides; Processing/Composite Units expose real callable Capabilities |
| Seven role types/engines | REVISE | Optional semantic labels, not distinct Unit classes or engines |
| Unit common identity | KEEP | Stable ID, revision, digest, owner, scope, authority, provenance, qualification |
| Capability requires/provides | KEEP | Stable independent callable contracts and compatibility |
| Unit implementation strategy | REVISE | Processing Function/Parser/Rule/Tool, Composite optional Workflow |
| Data Unit representation | ADD | Format/media type/typed schema/semantic revision/resourceRef/digest |
| Data Unit Reader/Access | ADD | AOT-bound SDK/Business codec, readonly operations/bounds/error handling |
| Separate knowledge Runtime/universal DB | REMOVE | Optional physical storage under Unit, cross-Package access via Capability/Tool |
| Mandatory hand-authored empty init on every Unit | REMOVE | Uniform lifecycle; initialize:none means KDP normative no-op default |
| Unit initialize/invoke/read/dispose | ADD | Shared lifecycle/entry semantics with profile-specific required fields |
| Package init/dispose | KEEP/REVISE | Existing lifecycle entry; may delegate to optional Init Unit, no second Init Engine |
| Mandatory Main + N Workflows | REMOVE | Package owns topology, optional Main/Public Workflows/direct Units |
| Unique App Entry/Main Workflow | REVISE | App pins one or more ingress bindings, not necessarily Workflow |
| Authored Unit DAG | REMOVE | BUILD derives safe reference closure; Package DAG persists |
| Workflow/Pipeline/Graph | MERGE | Workflow is optional Composite processing, Graph verifiable representation |
| Control/data/evidence edges | KEEP | For Workflow-using Units; preserve independent integrity |
| Recognizer output | MERGE | Canonical Structured Intent, Slots and provenance |
| Separate Intent Router Engine | REMOVE | Intent Routing is a Unit-provided Capability |
| SDK Domain Package | KEEP | Normal middle Package layer with shared qualified Parser/Rule/Validator/Workflow Units |
| Boot + KDP Primary | KEEP | Frozen layer split and single Runtime authority; only internal KDP Unit assembly/init changes |
| Business Primary + Extensions | KEEP | Own domain intelligence, compose through Package dependencies |
| Runtime/Build/Provenance closures | KEEP/REVISE | Separate; exact pins for Data payload/Reader/Implementation |
| Unit production/composition verification | ADD | Producer receipts and independent Composite behavior, child PASS ≠ composite PASS |
| Five lifecycle/governance dimensions | KEEP | Qualification/Disposition/Selection/Activation/Execution separate |
| Structural/Behavioral/Consumer Conformance | KEEP | Add producer/lifecycle evidence profiles |
| Unbounded loops/unproven retries | DEFER | Independently proven bounded optional profiles only |
| Frozen 0.1 + actual Runtime adoption | KEEP/SEPARATE | No old standard mutation; #1486 proves actual Runtime consumption |

## Explicit migration rules

1. Map Knowledge Role/Fact/Rule Set/domain configuration to Data Unit at meaningful granularity or as Unit payload; retain source, schema, digests and evidence. Never invent a callable Data Capability.
2. Each Data Unit declares Format/Schema/Reader/Access. Missing Reader must be an explicit conformance issue, never guessed by runtime dynamic import.
3. Preserve Processing/Composite Capability, Implementation and Graph identities. Composite Unit requalification is independent of child PASS.
4. Preserve Package init/dispose entry, allow pinned Init Unit delegation but no parallel lifecycle manager. initialize:none requires no authored empty function.
5. Replace mandatory App Main with one or more exact ingress bindings; unavailable historical entry mapping requires explicit disposition.
6. Preserve KDP/SDK/Business layers and Package DAG. Do not move public parser logic into KDP Kernel or all business rules into SDK.
7. New 0.2.0 Profiles require explicit migration; never fabricate historical qualification, Promotion or Runtime adoption.

## Minimum negative and positive conformance

- Typed Data Units backed by JSON/YAML, selected SDK codec/Parser, bounded read and structural/semantic tests; wrong digest/schema/reader rejected.
- Data Unit grouping of many records, Processing Unit consumption, explicit cross-Package Capability/Host constraints.
- Multiple Processing/Composite providers and AOT unique selection; child-PASS/composite-FAIL counterexample detected.
- Package init:none and optional Init Unit both reach READY safely; failure, cleanup, reverse disposal and repeated init verified.
- SDK Primary + Business Primary + Extension selected in valid Package DAG; KDP bootstraps independently; package with no Main Workflow can still serve selected ingress.
- Multiple ingress / Intent Router never require routing to locate Router; direct public API ingress may bypass Intent.
- xDownload and a non-media Domain demonstrate common Unit/Lifecycle/Conformance semantics, not artificially shared domain knowledge.
- Unauthorized effects, fabricated Promotion, missing source, illegal recursion, unpinned provider all fail closed.

All are candidates pending #1494 Product/L1 disposition, real schemas/demo/conformance and L2 Freeze.