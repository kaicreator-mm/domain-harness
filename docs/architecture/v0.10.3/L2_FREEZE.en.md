# DomainHarness v0.10.3 — L2 Freeze (version branch only)

[中文](L2_FREEZE.zh-CN.md) · [Design EN](L2_DESIGN_R0.en.md) · [Product Freeze](../../product/v0.10.3/PRODUCT_FREEZE.md) · [Contract Freeze](../../product/v0.10.3/CONTRACT_FREEZE.md)

**Decision:** `L2_FREEZE=YES` for reviewed architecture/ABI and safe work ownership on `version/v0.10.3`. **NOT** a source-implementation PASS, Task-DAG admission, external consumer qualification, v0.10.3 main merge or Release RQ. ADS v4.18.0 effective at `2c395c55569fe2edf3f4135f12d3d069e526d0b7`.

## Independent source and currentness

- Independent [PR #1407 R3 exact-SHA](https://github.com/kaicreator-mm/domain-harness/pull/1407#issuecomment-6447932588) **PASS P0=0/P1=0/P2=0, L2_FREEZE_READY=YES**, corroborated by a separate review on the same SHA. Reviewed **HEAD `854e0807280c1438e2f141e66636c4f53d9d9106`**, Git tree `cc92bb5bd64fd36657e063038fb20e55a540ea20`.
- Actual integration [PR #1407](https://github.com/kaicreator-mm/domain-harness/pull/1407) to **version branch only**, merge SHA `62c003251ff7ff699f4249500a5ca5988af23b8e`. The four reviewed L2 Markdown source blobs match exact reviewed PR source: design EN `be6c1e346d4eb6a0b7ade9960da37f30204d0661`, ZH `93124eb578644cc0d298e01fe567ec770a0bc121`, overview EN `77040e8da1db5c79db9e802f4183a82a2d74aee9`, ZH `34754438b5b87370a8f502196fcdf2c6fef72386`; **4/4 byte-identical** after merge.
- Frozen Product blob `d5c524588accd2a79a6781b28fce310fa91ab389` and frozen data contract blob `b9ec0df6886cb71c6a74296cb61d459f9309f94c` remain present unchanged.
- Required Woodpecker `ci/woodpecker/pr/verify` **SUCCESS [2047/2](https://ci.kaicreator.com/repos/18/pipeline/2047/2)** and supplementary min-node SUCCESS [2047/1](https://ci.kaicreator.com/repos/18/pipeline/2047/1) at the exact independent R3 HEAD. Tests validate project-required PR checks, **not** future real C Provider selected npm consumer, K effects, trusted bundle tamper or paid model call.

## Frozen implementable choices

1. **One logical neutral** `llm.generate` DTO in Contracts, approved `modelId`, Host-policy `deadlineUnixMs` / non-serialized cancellation, honest Provider+model and request ID provenance, typed finish/error/UNKNOWN, discriminated token usage evidence, bounded non-authoritative tool proposals; no fallback or third C alias. Existing K permission and actual BUILD four-field route/selected C handler ABI is not rewritten.
2. **Two independently selected** optional OpenAI-compatible Chat Completions and Anthropic Messages C + Host adapters; `0/1/2` physically selected; both C have **module-wide** `externalEffect:true`. **A** common types before B/C; **B and C implement in parallel** in disjoint directories, shared exports reserved for R integration.
3. **Guided Journey** pre-BUILD approved templates/catalog, runtime ONE next `StepSpec`, optional schema-bound `LLMAdvisory`, no general UI framework, no model-led Tool permit; existing schema #1397 is sole wire identity.
4. **Two-axis v0.3 task/meta evolution** reuses selected v0.10.2 `meta-feedback` and public Host `runMetaFeedbackWorkflow`; no second Kernel, automatic promotion, invented current public exact cache or new database.
5. **#1393 verified executable trust**: reuse existing `activateGovernedV10Build` and independent out-of-band Host authorization. Keep ordinary trusted deployment; opt-in bounded `VERIFIED_PROVIDER_BUNDLE_V1` only for a single self-contained static ESM executable closure with supported built-ins, byte-exact trusted immutable staging, typed fail-closed unsupported graph. Required good, Provider-only tamper, and Provider+mutable embedded-hash tamper with stale protected subjectDigest. Node ESM/TOCTOU limits explicitly bounded. Trusted Host/provider error redaction as scoped P2; preserve K UNKNOWN.
6. **#1394** Host CAS DX docs-first is already completed in version-only PR #1409, not a new Store runtime Task.
7. **ADS v4.18 topology**: separate I security, A shared DTO → B OpenAI and C Anthropic simultaneously, J offline Guided Journey, M evidence/proposals reuse, S pure helper/reuse only on proven gap, R **single shared-root integration writer**, Q independent qualification. Native GitHub task dependency/write-set admission is a **subsequent** governance step, not implied by this Freeze.

## Admission and falsification

- Independent source **Task** creation may proceed with scope, write sets, agent roles, explicit predecessor and negative tests; each actual implementation Claim requires the current repo standard's GitHub-native issue/dependency readback. **Do not use prose links as if they were accepted native blocked_by edges.** No source modification on unclaimed Tasks.
- Proposed minimal Node24 installed/packed 0/1/2 Provider Apps and independently trusted-bundle tamper tests are **NOT_RUN**. These are mandatory future source Task/RQ evidence, never inherited from documentation CI.
- A material change to frozen Product/wire/K authority requires explicit amendment/review; narrow implementation bug fixes should not silently mutate ABI. Preserve v0.10.2 historical release and exact SHA evidence.

```ini
VERSION=v0.10.3
ADS_EFFECTIVE=4.18.0@2c395c55569fe2edf3f4135f12d3d069e526d0b7
REVIEWED_L2_HEAD=854e0807280c1438e2f141e66636c4f53d9d9106
L2_VERSION_INTEGRATION=62c003251ff7ff699f4249500a5ca5988af23b8e
PRODUCT_L1_FREEZE=YES
CONTRACT_DATA_FREEZE=YES
L2_FREEZE=YES
NATIVE_TASK_DAG_ADMITTED=NO
IMPLEMENTATION_CLAIMS_AUTHORIZED=NO_PENDING_DAG
SDK_IMPL_QUALIFIED=NO
RELEASE_READY=NO
MAIN_MERGE=NO
```
