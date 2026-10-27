# DomainHarness v0.10.3 — Reviewed Contract Freeze Checkpoint

**Controller record:** 2026-10-27. Scope: **DATA/PRODUCT SEMANTIC CONTRACT FROZEN FOR L2 DESIGN**, not public runtime TypeScript ABI, npm package export, Module contract freeze, or permission to implement SDK L3 source.

## Exact qualified source

| Concern | Independently reviewed source | Version-branch integration | Review/evidence |
| --- | --- | --- | --- |
| Guided Journey five-message Draft-2020-12 data contract, paired ZH/EN | PR [#1397](https://github.com/kaicreator-mm/domain-harness/pull/1397), HEAD `1834f864e74a6af643270b50be1401194ab62756` | `45a4c06c0dc8fb3f51be72196cd3521a7a369502` | [Independent R2 PASS / CONTRACT_FREEZE_READY=YES](https://github.com/kaicreator-mm/domain-harness/pull/1397#issuecomment-6445478029); 13 cases 5 positive/8 negative run at predecessor `51509be8` (sole later change equivalent ESLint one-liner), latest required and nonrequired Woodpecker 2/2 SUCCESS |
| OpenAI-compatible + Anthropic Messages independently selectable, 0/1/2 + **mandatory neutral logical `llm.generate`** explicitly bound to chosen C, task/meta historical separation | PR [#1400](https://github.com/kaicreator-mm/domain-harness/pull/1400), HEAD `d130c7fda7dcf15924ea6ae4b35c13f7087102e3` | `e6306e3c3530fdb309dc82d1e53e4dbb2d0cdf25` | [Independent R2 PASS / CONTRACT_PREVIEW_READY=YES](https://github.com/kaicreator-mm/domain-harness/pull/1400#issuecomment-6445481933); required `ci/woodpecker/pr/verify` SUCCESS; legacy nonselected `verify-min-node` actually FAIL at npm ci native dependency Python, not source contract |
| Product/L1 Scope | PR [#1402](https://github.com/kaicreator-mm/domain-harness/pull/1402), HEAD `b1a93ae71cf457e8988d7c6a809e16845ca61b6e` | `2b5be1b273c33c7b0bf40c38f9f11f74885d8ceb` | [Independent R2 Product PASS](https://github.com/kaicreator-mm/domain-harness/pull/1402#issuecomment-6445485761), [Product Freeze](PRODUCT_FREEZE.md). Accepted nonblocking P2 UX wording only; Schema enums authoritative. |

**Merged-code/source identity check (controller)**: the exact version-branch blobs for reviewed `guided-journey-v1.schema.json`, guided journey ZH/EN pair, contract-preview ZH/EN pair and LLM-provider-selection ZH/EN pair each **match their PR reviewed HEAD blobs byte-for-byte (7/7)**. The version-branch Product bilingual blobs likewise match the reviewed Product PR. No historical v0.10.2 release or approved active Business instance was altered.

## What is frozen versus unfrozen

- **Frozen**: canonical UI-agnostic wire kinds `step.spec / step.outcome / next-step.request / next-step.decision / llm.advisory`; approved static StepTemplate -> runtime choose ONE next step -> optional bounded `LLMAdvisory` that has no Kernel/Tool authority; finite schema sizes. There is only one canonical machine Schema #1397; no second invented DTO. The data contract remains compatible with zero model calls.
- **Frozen**: two independent provider protocol families in separately selected C packages; a provider-neutral logical Operation/request/response semantic common intersection with explicit B/BUILD binding to one selected concrete C. No implied third Provider/Gateway C, implicit model name routing, unconditional fallback, or auto-loaded runtime source. Provider capabilities only if verified. Full concrete TS interfaces, actual C module IDs, per-feature capability matrix and optional streaming are **L2 decisions**, not already shipped.
- **Frozen**: v0.3 original source priority rule → exact semantic result reuse → promoted applicable workflow → bounded model, separately the metadata-knowledge maturity Candidate → independent validation → explicit promotion → next build version pin. Two conceptual responsibility layers **not** two primary Kernels. Reuse v0.10.2 selected S `meta-feedback` + Host where applicable, no new Meta engine by default.
- **Frozen Product-boundary**: #1393 independent trusted root/verified deploy profile and three real good/tamper cases required; #1394 CAS thin adapter/docs first; provider raw exception secret journal is a **P2 diagnostic under #1393**, not a universal new Kernel rewrite without evidence.

## Change control and next steps

1. Changes to **canonical machine schema semantics, neutral Operation common contract, effect authority, explicit selection rules or frozen Product scope** require a proposed L2/Product amendment, explicit affected downstream crosswalk and source-qualified review; do not silently edit through a low-impact fix or Hot Reload.
2. New concrete ABI, C/Host packaging, Feature export, validator behavior and exact manifest/BUILD packaging MUST be defined and independently reviewed in **L2 Freeze**, with native GitHub Task DAG/write sets after that. No executable source Task admission yet.
3. Downstream ai-rexform/Tally may consume this exact **preview data identity** experimentally with thin adapters and v0.10.2 selected public APIs, but may not claim the v0.10.3 npm SDK already implements it. Final downstream contract alignment will compare actual packaged SDK + latest consumer at a single version-candidate SHA.
4. `version/v0.10.3` only. **Do not merge version branch into main or claim Release qualification** from these scoped source reviews. Historical earlier-review ADS v4.13.1 identity remains bound; new version branch runs qualified effective ADS v4.18.0.

```ini
VERSION=v0.10.3
CONTRACT_DATA_FREEZE=YES
PRODUCT_L1_FREEZE=YES
INTEGRATION_ANCHOR=e6306e3c3530fdb309dc82d1e53e4dbb2d0cdf25
SCHEMA_REVIEW_HEAD=1834f864e74a6af643270b50be1401194ab62756
PROTOCOL_REVIEW_HEAD=d130c7fda7dcf15924ea6ae4b35c13f7087102e3
ADS_EFFECTIVE=4.18.0@2c395c55569fe2edf3f4135f12d3d069e526d0b7
L2_CONCRETE_SDK_ABI_FREEZE=NO
L2_FREEZE=NO
NATIVE_TASK_DAG_ADMITTED=NO
IMPLEMENTATION_AUTHORIZED=NO
RELEASE_READY=NO
```
