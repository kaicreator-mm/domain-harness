# DomainHarness v0.10.3 — Product/L1 Freeze Checkpoint

**Controller record date:** 2026-10-27. **Product status: FROZEN FOR L2 DESIGN ONLY**; L2/DAG/implementation/Release are not granted by this file.

## Identity and authority

- Version branch: `version/v0.10.3` originating from `main@c6972db58b833940fabda25cac22c32f9cb1680e` (ADS v4.18 manually adopted in [PR #1405](https://github.com/kaicreator-mm/domain-harness/pull/1405)).
- Actual Product integration: reviewed [PR #1402](https://github.com/kaicreator-mm/domain-harness/pull/1402) unchanged `HEAD=b1a93ae71cf457e8988d7c6a809e16845ca61b6e`, version-branch merge `2b5be1b273c33c7b0bf40c38f9f11f74885d8ceb`.
- Immutable reviewed Product blobs: [Chinese](PRODUCT_L1_R0.zh-CN.md) `3c8028312b9cbe6d47693432d7bb6e72c8a23051`, [English](PRODUCT_L1_R0.en.md) `63203150462a1d2363a9919f9c213d65f40a211d`. Reuse-matrix Chinese/English unchanged from #1402 review.
- Independent [R2 exact-SHA Product PASS](https://github.com/kaicreator-mm/domain-harness/pull/1402#issuecomment-6445485761): `P0=0/P1=0/P2=1`, `PRODUCT_FREEZE_READY=YES`, required Node24 Woodpecker verify SUCCESS (nonrequired min-node also SUCCESS). This **does not** imply the later L2 or SDK source are reviewed.
- Owner directions recorded [#1392](https://github.com/kaicreator-mm/domain-harness/issues/1392), [#1395](https://github.com/kaicreator-mm/domain-harness/issues/1395), [#1396](https://github.com/kaicreator-mm/domain-harness/issues/1396) and downstream [triage census](https://github.com/kaicreator-mm/domain-harness/issues/1392#issuecomment-6445685793). Controller accepted bounded scope, not wholesale unverified downstream feature requests.

## Frozen Product outcome / classifications

| Concern | Frozen scope | Owner / proof |
| --- | --- | --- |
| LLM Protocols | Two independently selected optional C components for OpenAI-compatible and Anthropic Messages-compatible; BUILD may select **0/1/2**; mandatory single neutral logical `llm.generate` common request/response shape with explicit B/BUILD route, never implicit fallback | [#1396](https://github.com/kaicreator-mm/domain-harness/issues/1396), candidate reviewed [#1400](https://github.com/kaicreator-mm/domain-harness/pull/1400) |
| Guided Journey | Approved pre-BUILD StepTemplate/FormSchema/catalog and restore routes; runtime state selects **one next StepSpec**; optional bounded model returns non-authoritative **LLMAdvisory** canonical Schema. Full generic UI renderer not part of SDK | [#1395](https://github.com/kaicreator-mm/domain-harness/issues/1395), reviewed schema [#1397](https://github.com/kaicreator-mm/domain-harness/pull/1397) |
| Task/meta multi-level evolution | Reconstruct v0.3 original rule → exact-result reuse → promoted subflow → bounded model decision priority and separately candidate → validation → explicit promotion → next-build pin. **Reuse existing selected v0.10.2 meta-feedback S+Host**, and historic internal/source-only modules only after public-reachability proof. No second K/Meta runtime | [#1398](https://github.com/kaicreator-mm/domain-harness/issues/1398) |
| Executable Provider / App integrity | **P1 required**: trusted deployment vs optional verified-integrity deployment, independently trusted root anchor; real Provider-only and coordinated Provider+mutable embedded-hash tamper negative before execution (scoped code closure and true TOCTOU limits); no arbitrary npm supply-chain platform | [#1393](https://github.com/kaicreator-mm/domain-harness/issues/1393), Tally #120 |
| CAS integration DX | **P2 nonblocking**: prefer ai-rexform verified B↔Host thin adapter, public ZH/EN example and optional clean consumer; no new Kernel/Store runtime change without repeated need | [#1394](https://github.com/kaicreator-mm/domain-harness/issues/1394) |
| Additional exception risk | **P2 diagnostic only within #1393:** Tally substituted Provider raw exception text could contain token in effect Journal; compare typed Host-normalized error handling, preserve original UNKNOWN and sanitize returned Provider exception. No separate blocking universal Journal rewrite without new authorized current-public-ABI reproduction | [Downstream triage](https://github.com/kaicreator-mm/domain-harness/issues/1392#issuecomment-6445685793) |

**Accepted nonblocking Product P2-01:** Chinese user-path row uses UX shorthand `ASK/WAIT/BLOCKED` that blends a `StepSpec.kind` with `NextStepDecision.status`. Authoritative schema distinguishes `StepSpec.kind=ASK` from `NextStepDecision.status=NEED_EVIDENCE|WAIT|BLOCKED`; follow-up docs editorial at L2/SDK guide if needed, **no semantic or public ABI waiver**, no needless new Product review over wording. v0.10.2 Tag immutability and historical RQ CONDITIONAL unchanged.

## New-stage gates and downstream alignment

1. **Product Frozen only.** The independently reviewed **contract source** (#1397 and #1400) can be incorporated into the same `version/v0.10.3` and source SHA pinned; **Contract Freeze must be recorded separately** before public L2 ABI and Schema choices are called frozen.
2. Produce L2 exact K/S/B/C/Host module ABI, reusable source/adapter decision, verified-deployment trust anchor and safe parallel write sets; compare alternatives and their cost. Require independent L2 review and explicit L2 Freeze before real Task DAG/source write permission.
3. ai-rexform, Tally and task-meta may continue using **released v0.10.2 public SDK** + app-owned adapters; v0.10.3 preview DTO != implemented npm API. Final alignment once at qualified v0.10.3 selected exact SDK package SHA, using real external Node24 consumers.
4. ADS effective in the new version branch is `v4.18.0@2c395c55569fe2edf3f4135f12d3d069e526d0b7`; earlier accepted v4.13.1 subjects retain their historical standard identity, not retroactively rewritten.
5. Native GitHub Issue Dependencies, Claim serialization, written file ownership and exact independent reviews remain required. No Full/Hidden rerun for this Product-only document.

```ini
VERSION=v0.10.3
PRODUCT_L1_FREEZE=YES
PRODUCT_REVIEW_HEAD=b1a93ae71cf457e8988d7c6a809e16845ca61b6e
PRODUCT_VERSION_INTEGRATION=2b5be1b273c33c7b0bf40c38f9f11f74885d8ceb
ADS_EFFECTIVE=4.18.0@2c395c55569fe2edf3f4135f12d3d069e526d0b7
P0=0
P1=0
P2_ACCEPTED_EDITORIAL=1
L2_FREEZE=NO
TASK_DAG_ADMITTED=NO
SOURCE_IMPLEMENTATION_AUTHORIZED=NO
MAIN_RELEASE_MERGE=NO
```
