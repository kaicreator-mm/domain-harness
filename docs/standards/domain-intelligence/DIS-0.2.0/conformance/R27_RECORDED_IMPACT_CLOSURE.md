# R27 — Source record → CQ → proposed SAP → BUILD-selected Function/Package

**Authority:** [Product/L1 #1496](https://github.com/kaicreator-mm/domain-harness/issues/1496), [DIS v0.2.0 Demo Master #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499), [Draft PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497).

## Actual source inputs and provenance

- Original full `kaicreator-mm/tally` 793-node `graph.jsonld` at `ab5c8231e871fb3df18df05176943d2a97c997f5` (Git Blob `2d4498dfa5f90bcf57cc81e9c155fb9ede31bf00`) → original 807-node graph at `a8f4986b099aba27cd86ce6a78e1c19159d1de55` (Blob `b6dc804d3ccc3aac7ce818533c2948f54b34644a`). GitHub full-file audit previously verified **14 added, 0 removed, 0 prior records changed**.
- The DIS R25 bounded fixture contains **exactly the 14 new original records**, *not the entire knowledge graph*; R27 checks original source Git identity and the already AOT-bound exact fixture Git Blob.
- DKE's original R26 research [impact catalog](https://github.com/kaicreator-mm/domain-forge/blob/bddfaa5d035a0a241e2de263be7dfb56034ba800/docs/standards/dke/DKE-0.0.1/demos/formal-pipeline-r0/r26-impact-closure/impact-catalog.json) is copied unchanged into the DIS Git demo, retaining **identical Git Blob `e710997c3b4a1abbe33287f7b79596385c8382d3`**. This preserves the DKE owner/proposal semantics rather than rewriting SAP ownership in the consumer.
- R26 prior native loader source anchor and [CI #2262/1–3](https://ci.kaicreator.com/repos/18/pipeline/2262/1) were exact-SHA successful at `25f13b1df9ff4e0ab53957903627b0029c1d4293`.

## Executable bounded closure

The [checker](../../../../../examples/dis-v020-native-sdk/dke-r27-impact.mjs) consumes **two independently qualified actual old/new AOTs**, real R25 read-only Function binders, the DKE immutable catalog and both real original-source projections. In one fail-closed pass it requires:

1. Source version/pin pair matches the two actual immutable Tally Git objects; 793→807 and all 14 new source records, without duplicate/missing/orphan Case, Evidence, Locator, or Source.
2. Both CQs `CQ-09F-CF` and `CQ-09F-GH` own a new Case with the Evidence→SourceLocator→Source chain; each maps to its **existing DKE-authored SAP *proposal*** `R26-PROPOSAL-CF/GH`.
3. Each proposal is explicitly `qualified:false`, `sourceAuthority:NONE`, `oracle:NOT_VERIFIED`, `status:PROPOSAL_ONLY`. No synthetic SAP "acceptance" is accepted.
4. For each CQ, both actually selected original R25 Business Function IDs `dke.r25.ed06.inspect` / `dke.r25.crossview.inspect` have matching Package owners, local read-only binding and the shared AOT source dependency. The AOT's actual `sourceConsumers` set must exactly match the bounded registered two; a missing reader must **not** yield an "unaffected" verdict.
5. The original source-fixed 19-node `CQ-T-CROSSCUT` relationship and its original two selected R24 Function readers retain their pins and unchanged semantic source view. Yet the whole installed App AOT digest **must** differ; R26 native installer `expectedSourcePins` refuses the old installed AOT against the new source checkpoint.

Expected output: 14 changed source records → 2 CQs → 2 unqualified SAP proposals → 2 explicitly selected Business Function IDs and 2 selected Packages. Output includes `registeredSelectedClosure=BOUNDED_ONLY`, `authority=NONE`, `qualifiedSAPs=[]`, `independentOracle=NOT_VERIFIED`, `effectsAllowed=false`, `activeProcessRevoked=false`. It represents **potentially stale dependencies**, not independent acceptance of source facts or any safety decision.

## Native tests and adversarial cases

The R27 tests are appended to the already Woodpecker-executed `examples/dis-v020-native-sdk/dke-two-business.test.mjs`. Negative tests tamper: missing second reader, wrong Business owner, fabricated SAP acceptance/Oracle, forged prior Git Blob, falsely qualified unchanged CQ, missing referenced Evidence, duplicate record IDs, invented old Case and false accepted lifecycle. No arbitrary Node major gate.

**Hard boundary:** This is a declared bounded graph on one selected Domain App; **not** a normative complete Source→Element→CQ→approved SAP→Function/ECP dependency model, a full 807-node native graph, externally verified incident veracity, automatic dynamic invalidation or live Effect eligibility. Any unregistered consumer or unreviewed SAP remains UNKNOWN; no release/Frozen authority.

**Status:** R27 candidate — no exact-SHA CI result until checked. Version totals remain Core **9 VERIFIED / 7 PARTIAL**, Optional **4 NOT_RUN**, Governance **1 NOT_RUN**. 
