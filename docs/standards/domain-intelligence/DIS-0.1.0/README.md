# Domain Intelligence Standard (DIS) 0.1.0

Status: L2_ARCHITECTURE_CANDIDATE_R6_INTEGRATED / NOT_FROZEN
Branch: dis/0.1.0-l2-candidate
L2 Issue: https://github.com/kaicreator-mm/domain-harness/issues/1481
Frozen Product/L1: https://github.com/kaicreator-mm/domain-harness/issues/1477

## L2 architecture candidate
- L2_ARCHITECTURE.zh-CN.md
- L2_ARCHITECTURE.en.md

## Current normative candidate
- DIS-0.1.0-REVISED.zh-CN.md
- DIS-0.1.0-REVISED.en.md

## Historical initial draft
- DIS-0.1.0.zh-CN.md
- DIS-0.1.0.en.md

## Schemas
- schemas/intelligence-unit.schema.json
- schemas/composition-graph.schema.json
- schemas/domain-definition.schema.json
- schemas/resource-closure.schema.json
- schemas/validation-report.schema.json

## Proof and traceability
- Demo: examples/dis-0.1.0-player-recognition/
- Initial validation: validation/dis-0.1.0/INITIAL_VALIDATION.md
- Revision log: validation/dis-0.1.0/REVISION_LOG.md
- Historical Demo validation (tested commit d8c516e): validation/dis-0.1.0/FINAL_VALIDATION.md

Active L2 candidate PR: #1482 (Draft). The integrated R6 batch combines #1484 Boot/KDP successor-authority synchronization, #1485 Capability/Recognizer/Pipeline contract closure and #1487 governed lifecycle closure in the existing 46-path write set. R4/R5 reviews and validation receipts remain historical, exact-snapshot evidence only; final integrated exact-HEAD validation and Fresh Independent Exact-SHA review are pending. The historical Demo validation report applies only to its recorded d8c516e artifact.

This branch carries the original experiment as historical evidence and the current integrated L2 candidate. Product/L1 is frozen by #1477; Harness capability Product/L1 is frozen by #1478; the Boot → KDP Primary successor authority is checkpointed by #1484. DIS L2 remains NOT_FROZEN. No v0.10.3 ABI/runtime implementation, successor SDK version, Task DAG, release, tag or deployment is authorized.
