---
name: domain-harness-sdk-v0103-candidate
description: Integrate or review a DomainHarness v0.10.3 candidate Domain App using selected K/S/B/C, external BUILD, Host/LLM/CAS and exact-source proof. Release-candidate only; do not claim npm publication or full live qualification.
---

# DomainHarness SDK v0.10.3 candidate skill

**Status:** candidate Skill for review, not the currently installed `domain-harness-sdk` discovery path. This file becomes installable **only after the consumer explicitly copies this complete file** to an Agent Skills discovery directory (for example `.agents/skills/domain-harness-sdk-v0103-candidate/SKILL.md`). Do not overwrite existing v0.10.2 Skill or claim Agent discovery was physically tested. Follow the canonical [English SDK guide](../SDK_GUIDE.en.md) or its [Chinese counterpart](../SDK_GUIDE.zh-CN.md); when copied externally use the upstream GitHub file URLs instead of relative paths.

## Intake and exact pins

1. Identify source vs downstream consumer repository; read its Product/ADS authority. Pin Git SHA/tree, intended SDK package bytes, selected K/S/B/C module hashes, Host identity/store, chosen Capability routes and one actual positive/negative Critical Journey.
2. Node >=24.0.0. Use declared Contracts, BUILD, Microkernel and Host public exports only; reject private `src/dist` deep imports. Keep BUILD separate from runtime. No implicit SDK upgrade or npm publish.
3. Map *explicit* Business Intent → selected C operation/handler, K Permit and Host transport. LLM Protocols are optional and independent, 0/1/2; use neutral `dh.llm.generate/1`, public Host `./llm/openai` or `./llm/anthropic`. SDK/model/credentials come only from trusted Host. Tool proposals are data, not permission.

## Execute one truthful proof

4. Start with bounded offline positive/negative and after-send UNKNOWN/replay tests. Check Host Cas/pins and authorized external Effects. Avoid automatic retries, prompt-based authority, unsafe logging, and routing fallback.
5. For Guided Journey, prove offline step selection, evidence binding, no-model fallback and optional static advisory without claiming live ambiguous LLM form generation. For Meta, prove public candidate/Shadow/approval boundary without asserting production promotion; static-ESM verified Provider profile must not be called arbitrary npm graph verification.
6. Report exact source/tool versions, tests and exit codes, any skipped or NOT_RUN checks. Distinguish independent review from Builder evidence. Historical real DeepSeek OpenAI PASS / Anthropic FAIL does not establish corrected live PASS; require new explicit paid budget, distinct attempt identity and sanitized enum-only receipt.

## Feedback and handoff

7. Classify `SDK_PRODUCT | BUILD_OR_PACKAGE | HOST_INTEGRATION | CONSUMER_MISUSE | DOCS | TEST_RUNNER_OR_OS | UNKNOWN`. Search existing GitHub Issues, prepare a sanitized minimal reproduction; ask user approval before posting downstream material. Never upload key, provider messages, thinking/signature, private Hidden cases or automatic telemetry.
8. Distinguish frozen Product/L2 from tested source, source review from release RQ, and untagged version branch from released SDK. Return P0/P1/P2, exact evidence, blockers and the next safe task.

**Release gate:** `version/v0.10.3` is not main/tag/npm publication. Traceability: https://github.com/kaicreator-mm/domain-harness/issues/1440 ; Q: https://github.com/kaicreator-mm/domain-harness/issues/1419 . This candidate Skill does not modify the already installed v0.10.2 Skill.
