# DomainHarness v0.10.3 — Product/L1 R0 Candidate (UNFROZEN)

[中文](PRODUCT_L1_R0.zh-CN.md) · [reusability matrix](SOURCE_REUSE_R0.en.md) · [master intake #1392](https://github.com/kaicreator-mm/domain-harness/issues/1392)

> **PRODUCT R0 CANDIDATE only; independent review, Product/L1 Freeze, L2 Freeze, Task DAG admission and implementation authorization are all NOT DONE.** Released v0.10.2 stays pinned at `cee14399d9d0af4e20e34b9111861b16a465b690`; its historical RQ CONDITIONAL and Full EXIT1/root NOT_RUN evidence are not rewritten.

## 1. Problem and narrowly bounded outcomes

Two reusable real-consumer needs: (a) choose **independently packaged** LLM protocol endpoints only when a selected Domain App needs one; (b) prepare validated/versioned interactive steps **before BUILD**, compose one next step from live authorized state **during runtime**, use bounded LLM proposal only for unresolved cases and learn across tasks through explicit qualified new versions. Close already reproduced common SDK issues. Implement via selected K/S/B/C and Host, **not** a new Microkernel LLM/UX/Meta service.

Scope owners:
- **Reproduced P1** [#1393 npm executable Provider integrity](https://github.com/kaicreator-mm/domain-harness/issues/1393): selected BUILD / Host pre-import assurance, separate from LLM wire protocols; do not rebuild npm or claim process isolation.
- **Optional feature** [#1396 LLM protocols](https://github.com/kaicreator-mm/domain-harness/issues/1396): two distinct C packages for **OpenAI-compatible Chat Completions** and **Anthropic Messages**; choose **zero / either / both**. Prefer pure selected S Prompt/Response/Context or private helpers; actual model SDKs/credentials/network in Host. Advertise protocol extension support accurately.
- **Conditional optional feature** [#1395 Guided Journey](https://github.com/kaicreator-mm/domain-harness/issues/1395): pre-BUILD approved StepTemplate/FormSchema/catalog/branch/recovery assets → runtime **one** StepSpec selected by current business/effect facts → optional schema-checked model NextStepCandidate. The only DTO/schema draft is [PR #1397](https://github.com/kaicreator-mm/domain-harness/pull/1397). Reuse v0.10.2 S/B; do not create a generic form engine or new S Package without at least two independent actual consumer journeys and a material shared ABI/semantic gap.
- **Historical source verification** [#1398 task/meta multi-level evolution](https://github.com/kaicreator-mm/domain-harness/issues/1398): reconstruct original v0.3 **rules → exact semantic result cache → promoted subflow → bounded model** precedence; separately model knowledge maturity through Candidate → validation → explicit promotion → next pinned version. Task execution and meta evidence production are *responsibilities*, **not two Kernel authorities**. Only add reusable public exchange semantics when source-to-selected-public-ABI and real consumers prove need.
- **Reproduced P2** [#1394 public Host CAS↔K DocStore adaptation](https://github.com/kaicreator-mm/domain-harness/issues/1394): docs-first tested 15–30-line adapter and clean consumer; no store redesign.

No second business Runtime, general UI renderer/survey builder, Agent platform, vector DB, LLM gateway, automatic production self-promotion or in-flight Package hot replacement. Frozen cross-version CV-01..12 unchanged.

## 2. Selection/ownership requirements

| Selected owner | Required behavior | Omitted path |
| --- | --- | --- |
| K Primary | Sole Admission, State, Journal, Effect Permit, Replay, UNKNOWN | A normal Domain App cannot omit K |
| S Primary / optional S Features | Reuse semantics, decision and context; only add Prompt/Response/Guided Journey S functions where necessary | No imports/init/dependencies for unselected options |
| OpenAI-compatible C | Independently selected proposed `llm.openai.generate` C operation and trusted Host client | Must not invoke/load Anthropic when absent |
| Anthropic Messages C | Independently selected proposed `llm.anthropic.generate` C operation and trusted Host client | Must not invoke/load OpenAI when absent |
| B Business | Which permitted provider/model to use, live next-step applicability, business action rules | No-model, rule-only Domain App still useful |
| BUILD / Host | Seal selected module identities, routes and Host resource/secret/config; apply #1393 integrity when chosen | No dynamic missing-Provider import or authority from model response |

Treat externally charged/data-egress model calls via explicit selected effectful C module under v0.10.2's **module-wide** `externalEffect`; retain actual K Permit/Journal/UNKNOWN semantics. Returned tool-use content is **proposal-only** until B/K authorize a separate declared Tool action. Common interoperability equals only **verified protocol intersection**, not blanket vendor feature parity.

## 3. Real consumer acceptance

- **A — Selection:** Node24 packed external clean consumers for 0, OpenAI-only, Anthropic-only and both. Exactly declared operations; unused Provider zero import/dispatch; both credentials isolated.
- **B — Model semantics:** controlled protocol-conformant fake endpoints prove real request/response mapping, bounded tool proposals, honest usage, failure/timeout/ambiguous outcome handling and no unapproved Effect/charged retry. Paid live credentials absent → `LIVE_PROVIDER_SMOKE=NOT_RUN`.
- **C — Progressive Journey:** same user GMS goal, different verified `PRESENT_DISABLED | ABSENT | UNKNOWN` observations → genuinely different next step; zero-LLM normal path, BACK/RESUME/FAIL/PARTIAL/UNKNOWN recovery, displaying StepSpec zero physical mutations; unknown template never becomes executable.
- **D — Evolution:** genuine sanitized task result → non-authoritative Candidate → independently validated/approved new pinned version for future instances; existing active instance keeps original replay/pin. Audit v0.3-to-0.10.2 public selected reachability before creating a new meta platform.
- **E — Existing P1/P2:** selected strict #1393 rejects substituted actual npm executable bytes **before import** and without journal secret leakage; #1394 supplies real K DocStore vs Host CAS adaptation and negative wiring fixture.

Use established provider client libraries. Reuse the bounded Context Feature **without calling character limits token accounting**. Generic streaming, Prompt registry, long-term vector memory and large router are outside the minimum unless two actual consumers demonstrate need. Reuse existing regression/CI and run Full/Hidden only when genuinely qualifying final release.

## 4. Contract-first governance and parallel implementation

1. Draft, not frozen: [PR #1397 Step DTO/schema](https://github.com/kaicreator-mm/domain-harness/pull/1397), [PR #1400 LLM selection/evolution bilingual preview](https://github.com/kaicreator-mm/domain-harness/pull/1400). Downstream B/Host may trial version-pinned private adapters with released v0.10.2; no pretend `llm.*` public API.
2. Independent exact-SHA review and downstream source/fixture feedback; checkpoint reviewed R1 **data contract** with precise schema digest and `ADDITIVE|MIGRATION_REQUIRED|BREAKING` delta. No automatic Product/L2 Freeze through a successful docs review.
3. Independent Product/L1 → L2 → parallel Task DAG admission; SDK source changes only after these gates. Real DAG depends on shared ABI definitions, not serializing unrelated provider/UX/integrity lanes.
4. Parallel concern lanes: executable npm integrity; OpenAI C+Host; Anthropic C+Host; reused S semantics/response; optional Guided Journey; v0.3 historical map and scoped meta evidence; CAS docs. One real Node24 external consumer and bounded failure cases per actual impacted surface.
5. One pinned final SDK/Schema/downstream alignment, then version-level RQ. Downstream app PASS is useful evidence, not a substitute for DomainHarness release approval.

## 5. Governance truth

Current `.dev-standard/VERSION` is **ADS 4.13.1 @ f35fcdb**, although the owner plans v4.18 / #1241. v4.18 is **not yet the repo's effective pinned standard**. A separate, smallest reviewed pin-adoption PR must address compatibility before claiming v4.18 execution/freeze. This R0 may adopt the intended lane principles as a *proposal*; it cannot assert the pin already changed. CV-01..12 `INHERITED_UNCHANGED`.

```ini
TARGET_VERSION=v0.10.3
BASE_RELEASE=v0.10.2@cee14399d9d0af4e20e34b9111861b16a465b690
PRODUCT_L1_STAGE=R0_CANDIDATE
CURRENT_ADS_PIN=4.13.1
TARGET_GOVERNANCE_REVIEW=4.18_PROPOSED_NOT_ADOPTED
PRODUCT_FREEZE=NO
L2_FREEZE=NO
TASK_DAG_ADMITTED=NO
CODE_IMPLEMENTATION_AUTHORIZED=NO
FULL_HIDDEN=NOT_RUN_FOR_THIS_CANDIDATE
```
