# DIS 0.1.0 bounded Runtime Consumer proof

Task #1486 follows the owner-authorized private `0.11.0-dev.0` lane. Integration base `afdb5d6a840e393d1bcef8c5c1ee89a6fe6c112b`, tree `f00982ca115be821fa9e22994165e3b6d09c35b8`. Frozen DIS authority `9504c78f4651f6c1ebc48c7858fca2d8b061544b`, tree `c8bab9f5931f0a8e2fa97b4e98c9a77f33962149`. The final source SHA, independent review and Woodpecker results belong to the external review receipt.

`buildDemo` checks independent descriptor/closure/lock pins, validates the bytes of all 25 manifest resources, and selects the frozen Definition, Units, Graph, provider contract and signature/strategy Knowledge. `buildConsumer` uses `tooling/build/src/build.ts:293` via the public BUILD export to seal existing kernel-primary and standard-primary modules together with the private Business policy and selected local capability. The selected capability contains the actual DIS operation implementation and selected data. Its BUILD module digest distinguishes it from the historical standalone provider artifact, which is an input to pin verification and is not executed.

`bootKdp` consumes the selected assembly through public `packages/microkernel/src/domain-app.ts` `load` and `send`. Existing internal activation owns module loading and sealed capability dispatch. The selected internal Kernel owns admission and durable receipts, while `openSqliteCasStore` implements physical CAS. There is one Kernel and no duplicate state or effect authority. The private boot composition does not replace the legacy activation loader. Independent general-purpose successor KDP distribution remains outside this vertical slice.

The actual receipt returned by `send` carries one `effect:dis-read` operation. The independent conformance verifier rebuilds input, evidence and control edges from selected Graph data, checks every emitted Unit input/output against frozen local schemas, binds Unit and selected provider identities, checks terminal state and Outcome and verifies the actual BUILD capability digest. SQLite readback uses the exact K Journal key derived from BUILD subject digest, tenant and the admitted effect ID. Its committed record output equals the original K receipt output. There is no permit document or external dispatch claim for that occurrence. Reopening SQLite and reusing the message ID produces the original admitted body with the Kernel's idempotent replay metadata.

| Capability | Status and evidence |
|---|---|
| Structured goal and recognition | SUPPORTED for the bounded Page observation. Caller supplies URL and signals, private capability trims URL edges. Candidate/unknown observation values retain provenance. Plain-language interpretation is CONSUMER_OWNED. |
| Knowledge and deterministic decision | SUPPORTED for two pinned local catalogs and declared resolver. The v2 strategy catalog changes the executed result while the original BUILD still yields its original strategy. External retrieval and indexing are NOT_REQUIRED. |
| Workflow and implementation | SUPPORTED for the selected frozen DAG and explicit local trusted registry mapping. Whole-app lifecycle, generalized external Tool integration and successor standalone KDP packaging remain PARTIAL. |
| Failure and clarification | SUPPORTED for known, unknown, ambiguous, conflict, out-of-scope, missing-input, invalid input, unauthorized input field and partial cases. Clarification is a structured question in the bounded Outcome, Dynamic Form rendering is CONSUMER_OWNED. |
| Result reuse, promoted subworkflow, LLM | NOT_REQUIRED for this deterministic proof. No fallback provider is selected. |
| Admission, Effect and replay | KERNEL_OWNED for original receipt, Journal, CAS and authority. The sealed local read-only effect is exercised. Physical external effects are NOT_REQUIRED and no permit or dispatch claim is minted. |
| Qualification and promotion | FORGE_OWNED. The separately pinned v2 test catalog is a synthetic reference fixture, not a claim of new production promotion. |
| Released v0.10.3 DIS Runtime | NOT_PROVEN. The proof is bound to this private development lane. |

`runtime-conformance.json` records the Windows-native conformance checks and selected BUILD/Kernel/graph identities for the actual observed cases. Exact-SHA CI and reviewer acceptance are separate from this local evidence.
