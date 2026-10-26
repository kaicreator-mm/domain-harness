# DomainHarness v0.10.2 · SDK issues and usage feedback

[Index](index.md) · [中文版](../zh-CN/feedback.md)

## When to open a DomainHarness Issue

Real SDK adoption should generate **both bug reports and useful feedback**, without SDK background telemetry.

| Observation | Route |
| --- | --- |
| Reproducible `load`, BUILD, K governance or Host CAS fault | [SDK Bug form](https://github.com/kaicreator-mm/domain-harness/issues/new/choose) |
| Confusing API, packaging, setup or documentation | SDK Usage Feedback → integration friction/docs |
| Needed Feature/Operation/Host capability | Feature need for a **future** Product/L2/Task DAG |
| Successful Tiny/Rich/producer integration | One milestone-level success story with sanitized evidence |
| OS/CI runner resource exhaustion without product counterexample | Local consumer/CI owner; not a DomainHarness product defect |

## High-signal evidence
Give the SDK release **and exact source SHA**, affected exported API, selected K/S/B/C identities, producer/Host mode and Node version. Distinguish expected from observed behavior, provide a **public-safe minimal repro**, actual command EXIT or **NOT_RUN**, and search existing Issues. Success feedback should explain what worked and a repeatable, privacy-safe use pattern.

## Consent gate for Agents
1. Search open and closed Issues; avoid duplicates.
2. Redact consumer proprietary source, credentials, production logs, customer/permit data and hidden oracle fixtures.
3. Show a **draft Issue**, obtain **explicit user consent** before posting any cross-project material. Do not infer consent from SDK use, and do not silently send telemetry.
4. Only report a new Issue number/link after GitHub confirms creation. With no permission, return a draft only.

Triage loop: **intake → classify → reproduce → prioritize → docs fix or prospective Product/L2/Task DAG → independent change review → Issue closure**. See [source workflow](../../feedback/SDK_USAGE_FEEDBACK.md) and [triage protocol](../../feedback/ISSUE_TRIAGE_PROTOCOL.md).

---

**Authority:** tagged source `cee14399d9d0af4e20e34b9111861b16a465b690`; v0.10.2 was qualified **CONDITIONALLY**. Post-release docs do not alter that SHA or authority.
