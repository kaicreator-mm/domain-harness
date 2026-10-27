# DomainHarness v0.10.3 — L2 Architecture/ABI Candidate R0 (not frozen)

[中文](L2_DESIGN_R0.zh-CN.md) · [Product Freeze](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.10.3/docs/product/v0.10.3/PRODUCT_FREEZE.md) · [Contract Freeze](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.10.3/docs/product/v0.10.3/CONTRACT_FREEZE.md) · [Parallel workfront overview](L2_R0_PREVIEW.en.md)

**Authority:** `version/v0.10.3` started at integrated `main@c6972db58b833940fabda25cac22c32f9cb1680e` with **ADS v4.18.0**; Product PR #1402 and contract PRs #1397/#1400 are merged to VERSION only with actual freeze records. This document is an **unreviewed L2 design candidate**, NOT L2 Freeze, public npm ABI, Task DAG approval or implementation authorization. Existing CV-01..12 are inherited unchanged.

## 1. Interface and authority inventory

Current tagged v0.10.2 already supports sealed external `buildV10App` and `projectSelectedComponents`, one `kernel-primary/v08-kernel-abi/1`, one `standard-primary/v08-standard-sdk-abi/1`, selected `standard-feature/dh.v10.standard-feature/1` exports, `business/v08-business-abi/1`, and `capability/v08-capability-abi/1` with `capabilityId`, explicit `handlers[{operationId,handler}]`, **module-wide** `externalEffect`; Microkernel `load/send/query/subscribe/stop`; trusted Node Host for CAS/credentials/resources. No runtime package discovery, general Hook event bus, implicit Provider gateway or automatic Tool registration is available. See [supported extension points](../../guides/SUPPORTED_EXTENSION_POINTS.md) and [Business+C authoring](../../guides/V0102_BUSINESS_CAPABILITY_TOOL.md).

| Concern | Source ownership & planned public binding | Required source evidence | Historical R0 question — concretely resolved in the R1 section below unless explicitly deferred |
| --- | --- | --- | --- |
| Shared LLM contract | One versioned **plain-data** `llm.generate` request/result/error schema for the verified common capabilities; explicit selected `B`/BUILD route maps to either concrete C. No third C alias | Both per-protocol fake endpoints accept same neutral fixture after explicit binding; no-model path uses zero provider | Concrete DTO shapes, requestId/idempotency semantics and exact business route rejection; which package exports types without introducing a runtime router |
| OpenAI-compatible | New independent optional `C` source + Host OpenAI Chat Completions client; proposed `llm.openai.generate` with one declared handler; module-wide `externalEffect:true` | Node24 clean selected **OpenAI-only** App and real wire shape; no Anthropic package/import | Feature capability matrix, error mapping and controlled endpoint configuration |
| Anthropic Messages | Different independent optional `C` source + Host Anthropic Messages client; proposed `llm.anthropic.generate`, module-wide `externalEffect:true` | Node24 clean **Anthropic-only**, native Messages content/tool blocks; no OpenAI import | Shared output projection without lying about provider-specific thinking/caching/Responses |
| Both/zero cases | BUILD selects 0, 1 or 2 C modules; explicit B binding rejects ambiguities | `0/one/either/both` installed App and unauthorized route negative | Exactly where the static binding is supplied using existing `handlers`/B declarations, not a new Kernel dispatch service |
| Prompt/Context/Response | Reuse selected `standard/features/context-assembly` and `semantic-decision` or private pure B/S helper. Optional new S Feature only after shared real need | Baseline existing S fixture reuse and typed malformed/unsupported response | Token-aware budgeting/streaming out of MVP until real two-consumer case (existing character budget != tokens) |
| Guided Journey | **BUILD-time approved assets** under Business/Domain Data: StepTemplate, FormSchema, ChoiceCatalog, branches/recovery; **runtime one StepSpec** chosen B/S; use exact frozen `guided-journey-v1.schema.json` with `LLMAdvisory`/Outcome; UI not part of SDK | No-model ai-rexform-style flows choose context-specific next step + unknown/UNKNOWN recovery; optional model suggestion schema rejected if outside approved template | Which optional S computation, if any, merits own selected Feature after two independent consumers (Tally-style approval and Android tablet) |
| Task/meta evolution | **Reuse** `standard/features/meta-feedback` and public `@kaicreator/domain-harness-host-node` root `runMetaFeedbackWorkflow` (proposal-only Host workflow); `experience-reuse` source-only, historic exact cache/promotion files legacy/internal, NOT asserted publicly reachable | One bounded recorded observation → Candidate → independent validation and explicit approval → next App pin; old instance unaffected; no new authority | Whether a small explicit `RunEvidenceRef` adapter to task-meta is needed; no cross-SHA reuse with caller-supplied compatibilityRef |
| #1393 executable closure | BUILD / trusted deployment + Node Host pre-evaluation seam; **default trusted-deployment** as prior v0.10.2 meaning, **optional verified-integrity** only where independently trusted expected App+Provider executable-closure digest exists | Legit good, Provider-only tamper and **Provider + seal embedded-hash joint tamper with old subjectDigest** refused before any Provider code eval/K effect | Choose package/archive closure format and actual files covered; trust-root origin / read-only deployment/TOCTOU assumptions; fail closed for purported strict profile that cannot verify. No invented general npm sandbox |
| #1393 error containment (P2) | Prefer trusted Host/selected C boundary constant typed sanitized error mapping, not K core change by default | Tally substituted throw/getter fixture returns no token in Journal/UNKNOWN, with no unreviewed silent error success | Only escalate to central Journal projection if another source-qualified current public consumer needs it |
| #1394 Store adapter (P2) | B/Host app reference maps K `V10DocStore kind:create/cas` to Host `CasDocumentStore mustBeAbsent/mustMatchRevision`; paired docs/executable example | ai-rexform normal/cas-conflict clean-consumer; reuse existing proof if same bytes | New shared factory only after repeated consumer confusion; **no Kernel/Host Store ABI rewrite** |

## R1 — concrete neutral ABI, actual BUILD binding and ownership

These are **proposed v0.10.3 Contracts types**, not already-shipped v0.10.2 public exports. The sole neutral common intersection is bounded text/JSON-text generation; ToolCalls, streaming, Responses and Anthropic-only features remain explicitly separate. All request/response values are plain JSON. A owns Contracts and validation; OpenAI B and Anthropic C own separate capability modules and Host client directories; Integration R is the **sole writer** of shared export/manifest/Host composition-root files.

```ts
export type LlmProviderKindV1 = 'openai-compatible' | 'anthropic-messages';
export type LlmErrorCategoryV1 =
  | 'UNAVAILABLE' | 'UNSUPPORTED_FEATURE' | 'RATE_LIMITED' | 'AUTH_DENIED'
  | 'MALFORMED_RESPONSE' | 'DEADLINE' | 'OUTCOME_UNKNOWN';
export type LlmFinishReasonV1 =
  | 'stop' | 'length' | 'tool_proposal' | 'content_filtered' | 'other';
export type LlmTokenUsageV1 =
  | { readonly evidenceMode: 'unavailable' }
  | { readonly evidenceMode: 'provider-reported' | 'measured';
      readonly inputTokens: number; readonly outputTokens: number };
export interface LlmGenerateRequestV1 {
  readonly contractVersion: 'dh.llm.generate/1';
  readonly requestId: string; // nonempty <=128; correlation, NOT remote idempotency
  readonly modelId: string; // 1..128; B/BUILD selected, Host allowlist verified
  readonly deadlineUnixMs: number; // safe integer epoch ms; bounded by Host policy
  readonly messages: readonly {
    readonly role: 'system' | 'user' | 'assistant';
    readonly content: string; // 1..32768 characters
  }[]; // 1..32 messages; cumulative content <=65536
  readonly maxOutputTokens: number; // integer 1..8192
  readonly outputFormat: 'text' | 'json'; // JSON text request, no provider guarantee
  readonly temperature?: number; // finite 0..1; refuse if unsupported
  readonly outputSchemaRef?: string; // 1..256, optional, Host-admitted ref only
  readonly toolCatalogRef?: string; // 1..256, optional, Host-admitted ref only
}
export interface LlmToolProposalV1 {
  readonly name: string; // 1..128, from approved catalog
  readonly argumentsJson: string; // <=16384; data only, not Tool invocation
}
export type LlmGenerateResultV1 =
  | { readonly contractVersion: 'dh.llm.generate/1'; readonly requestId: string;
      readonly providerKind: LlmProviderKindV1; readonly modelId: string;
      readonly status: 'completed'; readonly text: string; // <=65536
      readonly finishReason: LlmFinishReasonV1;
      readonly providerRequestId?: string; // 1..256, only if actually observed
      readonly usage: LlmTokenUsageV1;
      readonly toolProposals?: readonly LlmToolProposalV1[]; // <=8, advisory only
      readonly receiptRef?: string } // <=256; opaque, no execution authority
  | { readonly contractVersion: 'dh.llm.generate/1'; readonly requestId: string;
      readonly providerKind: LlmProviderKindV1; readonly modelId: string;
      readonly status: 'refused' | 'failed' | 'unknown';
      readonly errorCategory: LlmErrorCategoryV1; readonly reasonCode: string;
      readonly providerRequestId?: string;
      readonly usage: LlmTokenUsageV1; readonly receiptRef?: string };
```

`modelId` and `deadlineUnixMs` are required **request data**, but model identity is selected from an immutable B/BUILD-approved model profile and checked against Host's trusted endpoint/model allowlist before dispatch; returned `providerKind/modelId` come from that verified selected route/model, not from untrusted prompt text. `deadlineUnixMs` is an epoch-millisecond safe integer bounded by Host policy (future and within configured maximum window). Physical cancellation uses a **Host-only AbortSignal/AbortController keyed by `requestId`**; it is NEVER serialized into JSON or injected by a model. Pre-dispatch deadline/cancel = `refused/DEADLINE` with evidence no external call; a sent call whose cancellation/timeout leaves remote outcome uncertain = `unknown/OUTCOME_UNKNOWN`, not a false unexecuted refusal; a confirmed terminal remote failure = `failed`. **No blind re-dispatch or exactly-once charging guarantee.** The `errorCategory` enum is a bounded **semantic classification** (not SDK exception-code parity); sanitized `reasonCode` is a finite allowlisted value, 1..128 characters, never raw SDK/Host exception text. `providerRequestId` only when actually observed, <=256. `usage.evidenceMode='unavailable'` has no token counts; `provider-reported|measured` requires two nonnegative safe integer counts (not invented zero); no cross-provider equivalence claim. `finishReason` records the mapped observed terminal disposition, including `length` truncation and `tool_proposal` where applicable; unknown private reasons map to `other`, not fabricated stop. `outputSchemaRef` and `toolCatalogRef` require an explicitly approved Host binding; otherwise typed **pre-dispatch `UNSUPPORTED_FEATURE`**. When an approved tool proposal is supported, `toolProposals` are **bounded plain-data suggestions only** and require B/S allowlist, arguments and evidence checks plus separate K Permit to act. If provider emits unrequested/unsupported tool calls, **do not** return them as plain text success: `failed/UNSUPPORTED_FEATURE` if terminal outcome confirmed, otherwise `unknown/OUTCOME_UNKNOWN`; no automatic Tool invocation. A future consumer may map validated text/JSON to the **already frozen #1397 `LLMAdvisory` Schema**. `receiptRef` is opaque, not execution authority.

The neutral `llm.generate` is a **logical typed B contract**, NOT a third capability/operation/auto-router. Actual `buildV10App` has routes `{intentId,operationId,capabilityId,handlerId}` and selected C `handlers[{operationId,handler}]`. The L2-defined C package identities and bindings are:

```ts
// OpenAI C (only if chosen); module-wide externalEffect:true:
{ packageId:'capability-llm-openai-compatible',role:'capability',
  abiVersion:'v08-capability-abi/1',capabilityId:'llm.openai',
  externalEffect:true,handlers:[{operationId:'llm.openai.generate',handler:'generate'}] }
// Anthropic C (only if chosen); independent module-wide externalEffect:true:
{ packageId:'capability-llm-anthropic-messages',role:'capability',
  abiVersion:'v08-capability-abi/1',capabilityId:'llm.anthropic',
  externalEffect:true,handlers:[{operationId:'llm.anthropic.generate',handler:'generate'}] }
// Two independent B-declared intents in BUILD routes; no implicit choice:
{ intentId:'llmViaOpenAI',operationId:'llm.openai.generate',
  capabilityId:'llm.openai',handlerId:'generate' }
{ intentId:'llmViaAnthropic',operationId:'llm.anthropic.generate',
  capabilityId:'llm.anthropic',handlerId:'generate' }
```

With both selected, B's authorized policy chooses **one** declared intent before existing K Permit/dispatch; one selected omits the other module and route; zero selected omits all model intents/modules while keeping existing non-LLM routes (BUILD routes must remain nonempty). An attempt to reference an unselected capability is existing `V10_ROUTE_INVALID` at BUILD. No model-text-selected arbitrary endpoint/model, cross-credential leaks, implicit fallback or unselected import. Real Host uses mature OpenAI/Anthropic SDKs and independently maps their actual Chat Completions/Messages wire.

## R1 — #1393 concrete verified deployment profile / existing Host activation

**Keep** default `TRUSTED_DEPLOYMENT` (Host controls installed code, no cryptographic npm-integrity claim). **Add only an opt-in bounded** `VERIFIED_PROVIDER_BUNDLE_V1` profile for a **single self-contained static ESM provider bundle** with all third-party executable dependencies bundled into the same immutable artifact. In strict mode only enumerated Node builtin imports are allowed; remote/external import, dynamic import, require, native addons, runtime eval or executable downloads and sidecar dependencies are **UNSUPPORTED and refused before evaluation**. Official provider SDKs resident in trusted Host are Host/operator dependencies, not untrusted bundle proof. No generic npm graph scanner or sandbox.

Host trusted `V10DeploymentAuthorizationAuthority.verify` / independently protected deploy policy supplies expected `subjectDigest`, `packageClosureDigest`, and exact provider `artifactPath + artifactSha256` **out of band**, inaccessible to adversary who can mutate `sealed-app.json` and installed untrusted Provider artifact. `v10BuildPackageClosureDigest` only digests **declared module descriptors**, NOT actual bytes. Before `activateV10App` / first Provider evaluation / any Kernel Effect, use existing **`activateGovernedV10Build` pre-evaluation seam** to (a) verify canonical BUILD subject and each sealed `sha256(moduleSource)` against independently authorized identity, (b) measure actual immutable provider-bundle bytes resolved inside Host-controlled read-only content-addressed staging root, and (c) match those bytes to independently trusted bundle digest, importing **that same verified immutable snapshot**. If import cannot preserve identity between verification and execution, fail closed `VERIFIED_PROVIDER_ARTIFACT_UNSUPPORTED`; a post-verification arbitrary Host-root writer/TOCTOU adversary is outside the declared assurance. Preserve `CURRENT|PINNED_ONLY` and no new Kernel authority.

Typed non-secret denials: `VERIFIED_PROVIDER_TRUST_ANCHOR_MISSING`, `VERIFIED_PROVIDER_DIGEST_MISMATCH`, `VERIFIED_PROVIDER_ARTIFACT_UNSUPPORTED`. Required real Node24: normal bundle PASS; Provider-only byte tamper DENY; coordinated Provider plus mutable sealed embedded hash tamper with stale approved subjectDigest DENY; before any Provider evaluation/Kernel Effect, including unsupported import graphs. As bounded P2 test, Tally malicious thrown/getter Error must map to sanitized typed UNKNOWN with **zero token strings in Journal**; do not overhaul K error system without a second repro.

**Evidence/parallel controls:** New type owner A → separate OpenAI B ∥ Anthropic C. Independent I security, S Context pure helper, J offline Guided Journey, M **public** `@kaicreator/domain-harness-host-node` root `runMetaFeedbackWorkflow` with selected S (never deep-import source-only), and D CAS docs can proceed in parallel after L2 Freeze. G ADS v4.18 upgrade is HISTORICAL/DONE, not a new Task. R holds all shared root/manifest writes, external Node24 clean consumers and final Q. No second Meta Kernel and no fake v0.10.2 ABI claim.

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
