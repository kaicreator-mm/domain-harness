# v0.10.3 — Independently Selected LLM Protocol Packages R0

[中文](LLM_PROVIDER_SELECTION_R0.zh-CN.md) · [contract hub](CONTRACT_PREVIEW_R0.en.md) · [LLM intake #1396](https://github.com/kaicreator-mm/domain-harness/issues/1396)

> **Product contract preview. Operation identifiers are proposals, not public shipped ABI.**

## Separate deliverables and selection

| Proposed separate C Package | Proposed operation | Protocol family |
| --- | --- | --- |
| `capability-llm-openai-compatible` | `llm.openai.generate` | OpenAI-compatible Chat Completions |
| `capability-llm-anthropic-messages` | `llm.anthropic.generate` | Anthropic Messages |

BUILD must support **0, 1, or 2** selected Provider C packages (zero = offline/rule-only). Each has independent source/package/ABI identity, config and credentials, no cross-provider import. With both selected, B routes by exact operation and selected provider, **never** by last writer, default, runtime surprise or unpinned model-name inference. The shared **provider-neutral `llm.generate` logical operation/data contract is mandatory** for the verified common intersection (#1396); it is not a third C Package or automatic dispatch gateway. A Business using the neutral contract must **explicitly bind** the call at B/BUILD to one selected concrete C operation (`llm.openai.generate` or `llm.anthropic.generate`) under approved model/endpoint policy. With both providers selected, binding is still explicit per route; provider-specific operations remain available for provider-specific capabilities. With zero selected providers, `llm.generate` is unavailable and no-model paths remain valid; **no default, inferred route or fallback**.

## Candidate common data projection (mutable until freeze)

- Request: `requestId` (correlation/dedup identity, not a claim of remote idempotency), `messages`, deployment-bound `model`, `maxOutputTokens`, optional `outputSchemaRef`, `toolCatalogRef` and `deadline`. Host binds trusted endpoint and secrets; arbitrary user input cannot select new baseURLs, credentials or unauthorized models.
- Response: `providerKind`, `model`, `output` (text and bounded tool-use proposals), `finishReason`, `providerRequestId` if available, `usage` with an explicit evidence mode `provider-reported|measured|unavailable`. Mark, do not fake, unsupported provider-specific fields.
- Error: candidate safe **semantic categories** `UNAVAILABLE | UNSUPPORTED_FEATURE | RATE_LIMITED | AUTH_DENIED | MALFORMED_RESPONSE | DEADLINE | OUTCOME_UNKNOWN`, not frozen exception codes. A sent-but-unconfirmed request is not necessarily unexecuted and must not trigger a blind duplicate charged retry.
- Capabilities: endpoint-by-endpoint verified/configured `chat`, `structured_output`, `tool_use`, `streaming`, `vision`, `responses_api`, `cache_tokens`. Compatible transports do not guarantee all optional feature semantics.

## Authority and reuse

- **S/Feature:** pure Prompt rendering, Context selection, token budgeting policy, Response validation and model recommendation. **No Tool wrappers for internal pure helpers.**
- **C/Capability:** two externally callable Provider operations. Remote paid/data-egress attempts use an independent C module with v0.10.2 **module-wide `externalEffect:true`**; existing K Admission/Permit/Journal/Replay/UNKNOWN applies.
- **Host:** physical provider SDK clients (reuse mature libraries), credentials, endpoint deployment config, cancellation/transport. Not a Microkernel AI provider subsystem or a new generic HTTP/SSE stack.
- **B/Business:** when to call, which allowed protocol/model, missing-provider offline fallback, validation of any proposed Tool Call.
- **BUILD:** selected source/route closure before load; no dynamic import of unselected provider at runtime. External npm executable integrity is the independent [#1393](https://github.com/kaicreator-mm/domain-harness/issues/1393) concern.

**Mandatory shared-contract acceptance:** Using the exact same provider-neutral request/response data shape, an explicitly B/BUILD-bound OpenAI-only App and an independently bound Anthropic-only App must each produce the documented normalized result; a dual-selected App must prove both explicit bindings without provider leakage. No auto-router, alias-only C module or new Kernel ABI is implied.

## Minimal independent clean consumers

A: OpenAI C selected only; Anthropic never loads. B: Anthropic only, reverse selection. C: both selected with correct exact B route and secret/config isolation. D: no provider selected, deterministic task completes. E: malformed proposal, rate-limit/timeout, ambiguous result, missing optional capability are typed and never grant effects or silently switch providers. Node24 packed clean consumers with controlled fake endpoints can test contracts; if no actual paid API request was made, record it as NOT_RUN.

**Gates:** `R0_PREVIEW=YES; ABI_FROZEN=NO; SDK_IMPLEMENTED=NO; PRODUCT_FREEZE=NO`.
