# DomainHarness v0.10.3 — L2 Architecture/ABI Candidate R0 (not frozen)

[中文](L2_DESIGN_R0.zh-CN.md) · [Product Freeze](../../product/v0.10.3/PRODUCT_FREEZE.md) · [Contract Freeze](../../product/v0.10.3/CONTRACT_FREEZE.md) · [Parallel workfront overview](L2_R0_PREVIEW.en.md)

**Authority:** `version/v0.10.3` started at integrated `main@c6972db58b833940fabda25cac22c32f9cb1680e` with **ADS v4.18.0**; Product PR #1402 and contract PRs #1397/#1400 are merged to VERSION only with actual freeze records. This document is an **unreviewed L2 design candidate**, NOT L2 Freeze, public npm ABI, Task DAG approval or implementation authorization. Existing CV-01..12 are inherited unchanged.

## 1. Interface and authority inventory

Current tagged v0.10.2 already supports sealed external `buildV10App` and `projectSelectedComponents`, one `kernel-primary/v08-kernel-abi/1`, one `standard-primary/v08-standard-sdk-abi/1`, selected `standard-feature/dh.v10.standard-feature/1` exports, `business/v08-business-abi/1`, and `capability/v08-capability-abi/1` with `capabilityId`, explicit `handlers[{operationId,handler}]`, **module-wide** `externalEffect`; Microkernel `load/send/query/subscribe/stop`; trusted Node Host for CAS/credentials/resources. No runtime package discovery, general Hook event bus, implicit Provider gateway or automatic Tool registration is available. See [supported extension points](../../guides/SUPPORTED_EXTENSION_POINTS.md) and [Business+C authoring](../../guides/V0102_BUSINESS_CAPABILITY_TOOL.md).

| Concern | Source ownership & planned public binding | Required source evidence | L2 unresolved decisions (freeze must settle) |
| --- | --- | --- | --- |
| Shared LLM contract | One versioned **plain-data** `llm.generate` request/result/error schema for the verified common capabilities; explicit selected `B`/BUILD route maps to either concrete C. No third C alias | Both per-protocol fake endpoints accept same neutral fixture after explicit binding; no-model path uses zero provider | Concrete DTO shapes, requestId/idempotency semantics and exact business route rejection; which package exports types without introducing a runtime router |
| OpenAI-compatible | New independent optional `C` source + Host OpenAI Chat Completions client; proposed `llm.openai.generate` with one declared handler; module-wide `externalEffect:true` | Node24 clean selected **OpenAI-only** App and real wire shape; no Anthropic package/import | Feature capability matrix, error mapping and controlled endpoint configuration |
| Anthropic Messages | Different independent optional `C` source + Host Anthropic Messages client; proposed `llm.anthropic.generate`, module-wide `externalEffect:true` | Node24 clean **Anthropic-only**, native Messages content/tool blocks; no OpenAI import | Shared output projection without lying about provider-specific thinking/caching/Responses |
| Both/zero cases | BUILD selects 0, 1 or 2 C modules; explicit B binding rejects ambiguities | `0/one/either/both` installed App and unauthorized route negative | Exactly where the static binding is supplied using existing `handlers`/B declarations, not a new Kernel dispatch service |
| Prompt/Context/Response | Reuse selected `standard/features/context-assembly` and `semantic-decision` or private pure B/S helper. Optional new S Feature only after shared real need | Baseline existing S fixture reuse and typed malformed/unsupported response | Token-aware budgeting/streaming out of MVP until real two-consumer case (existing character budget != tokens) |
| Guided Journey | **BUILD-time approved assets** under Business/Domain Data: StepTemplate, FormSchema, ChoiceCatalog, branches/recovery; **runtime one StepSpec** chosen B/S; use exact frozen `guided-journey-v1.schema.json` with `LLMAdvisory`/Outcome; UI not part of SDK | No-model ai-rexform-style flows choose context-specific next step + unknown/UNKNOWN recovery; optional model suggestion schema rejected if outside approved template | Which optional S computation, if any, merits own selected Feature after two independent consumers (Tally-style approval and Android tablet) |
| Task/meta evolution | **Reuse** `standard/features/meta-feedback` and `packages/host-node/src/meta-feedback-workflow.ts` (proposal-only current selected path); `experience-reuse` source-only, historic exact cache/promotion files legacy/internal, NOT asserted publicly reachable | One bounded recorded observation → Candidate → independent validation and explicit approval → next App pin; old instance unaffected; no new authority | Whether a small explicit `RunEvidenceRef` adapter to task-meta is needed; no cross-SHA reuse with caller-supplied compatibilityRef |
| #1393 executable closure | BUILD / trusted deployment + Node Host pre-evaluation seam; **default trusted-deployment** as prior v0.10.2 meaning, **optional verified-integrity** only where independently trusted expected App+Provider executable-closure digest exists | Legit good, Provider-only tamper and **Provider + seal embedded-hash joint tamper with old subjectDigest** refused before any Provider code eval/K effect | Choose package/archive closure format and actual files covered; trust-root origin / read-only deployment/TOCTOU assumptions; fail closed for purported strict profile that cannot verify. No invented general npm sandbox |
| #1393 error containment (P2) | Prefer trusted Host/selected C boundary constant typed sanitized error mapping, not K core change by default | Tally substituted throw/getter fixture returns no token in Journal/UNKNOWN, with no unreviewed silent error success | Only escalate to central Journal projection if another source-qualified current public consumer needs it |
| #1394 Store adapter (P2) | B/Host app reference maps K `V10DocStore kind:create/cas` to Host `CasDocumentStore mustBeAbsent/mustMatchRevision`; paired docs/executable example | ai-rexform normal/cas-conflict clean-consumer; reuse existing proof if same bytes | New shared factory only after repeated consumer confusion; **no Kernel/Host Store ABI rewrite** |

## 2. Concrete graph & write-set gate (proposed, NOT admitted)

- **I Security**: trusted envelope/profile design owns common selected BUILD/Contracts/Host pre-load seam. Prepare as parallel L2 source design; source implementation only after L2 Freeze. Risk P1, not contingent on LLM feature work.
- **A Neutral protocol** owns one request/response/capability/error DTO. **B OpenAI** and **C Anthropic** may implement independently after only the shared A static ABI is qualified; disjoint C module and Host client files. Neither blocks the other.
- **S Pure semantics** and **J Guided Journey offline reference** can proceed in parallel with B and C after reviewed wire Schema; LLM proposal integration waits only on the concrete bound provider and guarded C. Do **not** require J to have model to test offline flow.
- **M Meta reuse proof** and **D CAS docs** proceed in parallel, no forced broad LLM or security predecessor. M can justify **KEEP_EXISTING/ADAPTER/OPTIONAL_S/DEFER** by clean consumer, never demand a second K.
- **R Integration/qualification** is a short final shared ownership lane: serialized common package exports/import maps, Node24 clean `npm pack` and installed 0/1/2 apps, failure/UNKNOWN/security negative, downstream exact-package alignment, one scoped version-level RQ. Avoid source file write conflicts with I/B/C.
- Scaffold/agent ownership: reviewer independent of builder at exact SHA; remote Web for docs, GitHub dispatch & contract; CI for Node24/pack; local agent only for actual host native/published API/E2E/secure fixtures. Use **GitHub native Issue Dependencies** for actual DAG, not prose edges. Different Tasks cannot concurrently write the same Host composition root.

## 3. Qualification and scope control

Minimum L2 choices are **operation DTO/explicit binding, real provider Host seam, trusted closure threat model, S/J selected-vs-private scope, error/UNKNOWN and Store adapter**, not a new LLM Agent engine. Use mature OpenAI/Anthropic clients and built-in Node crypto, established Ajv v2020; do not recreate SSE/HTTP, storage or schema engines. No paid live keys required for contract proof; mark live calls `NOT_RUN` if absent, but the final Model API capability may later need one specifically provisioned smoke. Existing tests reused unless actual source changes invalidate them. Product and data-contract changes post freeze need explicit amendment and review; no silent definition drift.

```ini
VERSION=v0.10.3
ADS_EFFECTIVE=4.18.0@2c395c55569fe2edf3f4135f12d3d069e526d0b7
PRODUCT_L1_FREEZE=YES
DATA_CONTRACT_FREEZE=YES
L2_DESIGN_R0=REVIEW_CANDIDATE
L2_FREEZE=NO
NATIVE_TASK_DAG_ADMITTED=NO
CODE_IMPLEMENTATION_AUTHORIZED=NO
RELEASE_READY=NO
```
