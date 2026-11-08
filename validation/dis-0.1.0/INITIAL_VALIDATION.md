# DIS 0.1.0 — Initial Demo Validation

Status: PASS_WITH_FINDINGS
Validation date: 2026-11-05
Standard initial commit: 98e1e5066b6f6db8b850851655d007878e43f73b
Demo commit: ea3b01e94b35a9a3ad26f70e2e0c62de38cfa546

## 1. Scope

This is the first validation pass of the initial DIS 0.1.0 draft using the isolated xDownload Player Recognition demo. It validates the logical Unit and Workflow concepts, not the current DomainHarness SDK Runtime. No SDK source, ABI, KDP, Host, v0.10.3 tag or release asset was changed.

## 2. Environment and commands

- Runtime: Node.js v22.16.0
- npm: 10.9.2
- OS: Linux x86_64 container
- Schema validator: Python 3.13.5 + jsonschema 4.26.0
- Demo commands: npm test; npm run demo
- Schema checks: Draft 2020-12 schema self-validation; validate all demo Unit descriptors and the initial Composition Graph.

The demo is dependency-free. Node 22 was used for the isolated proof; the DomainHarness repository's existing Node >=24 requirement remains unchanged. This is not a Node 24 SDK/CI qualification.

## 3. Results

| Check | Result | Observation |
|---|---|---|
| DIS JSON Schemas are valid Draft 2020-12 schemas | PASS | Unit, Graph and Validation Report schemas load and pass schema self-validation |
| Demo Unit descriptors | PASS | Six Unit descriptors validate against the initial Unit schema |
| Demo Composition Graph | PASS | Initial graph validates structurally |
| Known player | PASS | jwplayer reaches READY via Recognizer → Decision → private Procedure → Validator |
| Ambiguous player | PASS | jwplayer + videojs returns NEEDS_INPUT; no silent guess |
| Unknown player | PASS | Unsupported marker returns NEEDS_REVIEW |
| Invalid input | PASS | file:// input is rejected before recognition |
| Evidence retention | PASS | Observation evidence reaches the terminal result |
| Private Procedure boundary | PASS | resolve-procedure remains private and is not a Tool |
| Initial test suite | PASS | 8 tests passed, 0 failed |
| Demo output | PASS | Known / ambiguous / unknown paths produced the expected terminal outcomes |

## 4. Findings

### DIS-F-001 — P1: Edge conflates control flow and data flow

**Evidence:** The initial Edge is {from, to, when?, map?}. The demo needs the Decision node to both select the next node and pass the Recognizer result onward. The Decision and Procedure therefore echo upstream recognition/evidence merely to keep it available to the Validator. The graph cannot declare a data/evidence dependency from Recognizer to Validator independently of the control predecessor without also creating a control transition.

**Impact:** The model creates unnecessary pass-through coupling, makes evidence lineage harder to inspect, and cannot cleanly express a node whose execution is controlled by one node but whose input data originates from another.

**Required correction:** Split Edge into explicit control, data and evidence relations. Control edges choose execution paths only. Data edges bind an exact source output pointer to an exact target input pointer and do not schedule execution. Evidence edges preserve provenance independently of payload and control flow. No implicit whole-output pass-through.

### DIS-F-002 — P2: schemaRef is not a verified resource dependency

**Evidence:** The initial Unit schema validates schemaRef as a non-empty string. The demo probe changes the Recognizer input reference to schemas/does-not-exist.schema.json; the Unit validator still accepts it. The standard does not yet define package-relative resolution, traversal protection, digest pinning or build-time closure validation for referenced schemas.

**Impact:** A Unit may be structurally valid while its required input/output contract cannot be resolved by a consumer.

**Required correction:** Define schemaRef as a package-relative resource reference; reject absolute/network references and path traversal; require BUILD/qualification to resolve every required schema and nested local reference within the selected Package closure and pin its digest.

## 5. Conclusion

The first draft is behaviorally useful for the narrow happy/unknown/ambiguous proof, but it is not ready to be treated as a stable composition standard. DIS-F-001 is a composition-model defect and DIS-F-002 is a resource-closure defect. Both are carried into the standard revision before the final verification pass.

Result: PASS_WITH_FINDINGS. No Product/L1 freeze, L2 freeze, ABI admission, SDK implementation, release or deployment is implied.
