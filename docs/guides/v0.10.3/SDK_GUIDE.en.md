# DomainHarness v0.10.3 — SDK integration guide (release candidate)

[中文版](SDK_GUIDE.zh-CN.md) · [English Agent Skill](agent-skill/SKILL.md) · [Product freeze](../../product/v0.10.3/PRODUCT_FREEZE.md) · [L2 freeze](../../architecture/v0.10.3/L2_FREEZE.en.md)

> **Not released.** This document describes the `version/v0.10.3` candidate, authored against `d3a4cdf5fc4fc1080ce885cabb6efa5020f5e6f3`; final RQ pins any successor SHA. Do not claim a main merge, v0.10.3 tag, or npm publication. Existing `docs/current` and installed Agent Skill properly remain at released v0.10.2. Package manifests still use `0.10.2-rc.0`; this is not an npm release claim.

## 1. Pin and consume public SDK boundaries

- Node.js **>=24.0.0**. Use only declared package roots: `@kaicreator/domain-harness-contracts` (ABI, LLM DTO/guards), `@kaicreator/domain-harness-build` (separate BUILD producer), `@kaicreator/domain-harness-microkernel` (`load/send/query/subscribe/stop`) and `@kaicreator/domain-harness-host-node` (trusted Host/CAS).
- BUILD is not imported into a running App. Selected K alone owns permission, effect Permit, Journal, replay and UNKNOWN. S interprets semantics; B owns intents/workflows; C provides selected operations; Host does not mint Kernel authorization.
- Record downstream commit SHA, **exact source/installed package SHA**, selected K/S/B/C identities and hashes, Host/store mode and one true Critical Journey. Files or directory names do not prove npm or platform qualification.

## 2. Optional selected LLM (0/1/2 independent Providers)

- Common `dh.llm.generate/1` DTO: `LlmGenerateRequestV1`, `LlmGenerateResultV1` and public guards from Contracts.
- Independently select `llm.openai.generate` and `llm.anthropic.generate` C modules. BUILD explicitly maps each Business intent to its own selected operation, capability and handler; never infer routes or fallback by model ID. Both are external effects and require K admission.
- Public trusted Host subpaths are `@kaicreator/domain-harness-host-node/llm/openai` and `@kaicreator/domain-harness-host-node/llm/anthropic`. Only the Host supplies SDK constructors, API keys, approved endpoint/model and guards; never use prompt text as trust material. Importing the Host root does not import both clients.
- Tool proposals are bounded data, **not** execution authority. Token usage distinguishes provider-reported from unavailable. After-send timeouts, cancellation, 408/504 may be UNKNOWN; never blindly retry.
- The Anthropic-compatible Host preserves well-formed `thinking` blocks, exports final text only, and excludes reasoning/signatures from returned DTO and K Journal. The bounded fix [PR #1442](https://github.com/kaicreator-mm/domain-harness/pull/1442) merged to the version candidate and passed offline tests. **Actual DeepSeek:** prior OpenAI-compatible call PASS, Anthropic-compatible call FAIL with unknown original category; no corrected live requalification yet. Do not claim two-protocol live PASS. See [#1438](https://github.com/kaicreator-mm/domain-harness/issues/1438).

## 3. Guided Journey, Meta and integrity boundaries

- [Offline Guided Journey](../../../examples/v0103-guided-journey/README.md) pre-approves StepTemplate/FormSchema/ChoiceCatalog and derives **one** next StepSpec from trusted Host observation and bounded StepOutcome validation. Optional static LLMAdvisory is non-authoritative. This is **not** a UI renderer or proof of an online model selecting between ambiguous form alternatives.
- [Public Meta consumer](../../../examples/v0103-meta-reuse/README.md) reuses existing selected S and Host `runMetaFeedbackWorkflow`; evidence/Candidate, validation and read-only Shadow precede synthetic operator approval and a new immutable future BUILD. It does **not** demonstrate production human promotion, cross-task real history or SQLite durability end to end.
- `VERIFIED_PROVIDER_BUNDLE_V1` is opt-in, independently trusted-root-anchored integrity checking for a constrained self-contained static ESM Provider artifact. It does **not** secure arbitrary transitive npm graphs; unsupported graphs fail closed.
- The [bilingual CAS adapter](HOST_CAS_ADAPTER_R0.en.md) is Host/app-owned; never grant CAS permissions from untrusted payloads.

## 4. Validation, safe feedback and release

Begin with scoped Node24 positive/negative tests; run a clean packed consumer when required. Record exact SHA, literal exit status and NOT_RUN separately. Cloud requests require separately approved bounded paid-call budgets and local Host-only secrets: no keys, raw messages, thinking blocks or private Hidden information in public GitHub receipts.

Triage feedback as `SDK_PRODUCT | BUILD_OR_PACKAGE | HOST_INTEGRATION | CONSUMER_MISUSE | DOCS | TEST_RUNNER_OR_OS | UNKNOWN`. After a sanitized minimal reproduction and duplicate search, file [domain-harness feedback](https://github.com/kaicreator-mm/domain-harness/issues) with user approval only; do not auto-upload telemetry. Read [#1440 G00–G07](https://github.com/kaicreator-mm/domain-harness/issues/1440) for acceptance gaps and [#1419](https://github.com/kaicreator-mm/domain-harness/issues/1419) for independent Release Qualification. A candidate becomes a release only after the appropriate independent RQ, main integration and Git tag.
