# v0.10.3 — Task / Metadata Evolution Contract R0 Reconstructed from v0.3

[中文版](TASK_META_EVOLUTION_R0.zh-CN.md) · [contract hub](CONTRACT_PREVIEW_R0.en.md) · [historical audit #1398](https://github.com/kaicreator-mm/domain-harness/issues/1398)

> **Critical correction:** “task/business execution layer + metadata/experience evolution producer layer” is a **new responsibility view for downstream integration**; v0.3 did NOT freeze two independent peer runtimes/Kernels. Frozen v0.3 Product explicitly rejects a second authority-bearing Harness workflow runtime.

## Two orthogonal axes actually present in v0.3

**Axis A: decision source precedence WITHIN an execution.**

```text
deterministic / compiled domain intelligence
  → exact semantic result cache
  → applicable promoted reusable subworkflow
  → bounded HarnessMachine / LLM fallback
  → structured proposal → current B/K eligibility/admission
```

From [v0.3 frozen PRD §8](../DomainHarness_v0.3_PRD_FROZEN.md) and [architecture A5](../../architecture/DomainHarness_v0.3_ARCHITECTURE_BASELINE_FROZEN.md). This is **not** the “rule → promoted subflow → exact cache → LLM” sequence currently written in #1395 as an illustrative L0–L3. A domain-specific variant may be proposed only with an explicit policy, not misrepresented as the original v0.3 contract.

**Axis B: knowledge maturity / progressive determinization ACROSS executions.**

```text
actual observed result
  → Candidate (model/human proposal)
  → independent Validation / Evaluation
  → explicitly authorized Promotion
  → future BUILD selects exact version/digest
  → new App instances reuse rule, experience or subflow
```

Historical direction: unresolved problem → bounded LLM solution → exact result reuse → validated solving pattern → stable deterministic domain rule when justified. **Automatic self-promotion into production was expressly out of scope in v0.3.** The execution Journal's idempotent replay is NOT cross-task semantic caching.

## Suggested two responsibilities, NOT two runtimes

| Layer | Owns | Must not own |
| --- | --- | --- |
| **Task / Business execution instance** | Run B Workflow with selected K/S/B/C; consume pinned rules/cache/promoted workflow; bounded LLM only on misses; emit genuine decision/outcome evidence | Automatically rewrite live Packages or permit effects from model text; change in-flight pins |
| **Meta / Metadata evolution producer** | Aggregate **authorized redacted** cross-task evidence; curate Candidates; validate/simulate/compare improvements to rules, prompts, forms and subflows; request explicit review/promotion | A second K Primary, auto deploy, shadow verdict as production truth, hot-swap running instances |

The metadata layer may reuse **task-meta** for actual token/cost/run/tool traces. DomainHarness should not duplicate task-meta's telemetry database. Business domain truth stays with its owner; a reusable **optional provenance exchange contract** is appropriate if actual public ABI evidence supports the need. Apps are not obligated to implement a meta producer.

## Candidate information units (**not a shipped TypeScript ABI**)

- `RunEvidenceRef`: `sourceRepo`, `sourceVersion`, `sourceDigest`, `executionRef`, `businessScope`, `redactionClass`, `observedAt`, `outcomeStatus`. Verifiable provenance, not a self-attested “model succeeded.”
- `DecisionEvidence`: `rule|exact-cache|promoted-workflow|model` source, relevant rule/knowledge digests, current references, actual model call count with `measured|provider-reported|unavailable` evidence. Duration/cost may be forwarded to task-meta, not independently re-attested from user fields.
- `CandidateArtifact`: `kind=rule|step-template|prompt|subworkflow`, content digest, compatibility scope, applicability, validation cases, provenance refs; **no execution authority**.
- `ValidationReceipt`: exact source/SHA, test and negative-evidence references; does not approve production promotion.
- `PromotionDecision`: authorized operator, approved digest and compatibility scope; `ActivationPin`: selected exact Package/Domain Data version for the *next* admitted deployment/instance. Promoted ≠ Activated ≠ Executed.

These names are provisional R0 conceptual data units. First map historical v0.3 semantics to **actually selected public v0.10.2 ABI** and task-meta real trace shapes. Add no second Evidence engine or independent S/C Package until two real consumers demonstrate the gap.

## Consumer proof

- ai-rexform: same GMS goal chooses different prebuilt steps under different observed device facts; no model required. After review/promotion, a future version can reuse the improved route as rule/cache.
- Tally: reuse independently reviewed approval cases across Tasks while rechecking current Task/Claim scope.
- task-meta: emit real cross-task traces, not DomainHarness K permits, release PASS or production Promotion.
- Negatives: shadow/candidate/LLM output never becomes production effect; old in-flight replay retains original digest; stale evidence cannot become exact-cache hit; failure/UNKNOWN cannot be mislearned as success.

**Research gate:** classify each historic rule/cache/promotion/shadow capability as `REACHED|SOURCE_ONLY|LEGACY_ONLY|OUT` against physically selected public v0.10.2; demand actual two-consumer reusable need before a large new subsystem.

**Status:** `RESEARCH_R0=RECORDED; METADATA_LAYER_AS_SEPARATE_RUNTIME=NO; PRODUCT_FREEZE=NO; L2_FREEZE=NO; PROMOTION_IMPLEMENTED_BY_THIS_DRAFT=NO`.
