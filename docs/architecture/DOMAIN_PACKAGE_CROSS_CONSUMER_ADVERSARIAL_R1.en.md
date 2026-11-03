# DomainHarness Cross-Consumer Architecture Synthesis and Self-Adversarial Review R1

[中文](DOMAIN_PACKAGE_CROSS_CONSUMER_ADVERSARIAL_R1.zh-CN.md) · [Function/Tool boundary](DOMAIN_PACKAGE_FUNCTION_TOOL_BOUNDARIES_R0.en.md) · [Knowledge/Workflow boundary](DOMAIN_PACKAGE_KNOWLEDGE_AND_WORKFLOW_R0.en.md)

> **READ FIRST — document authority: NON-NORMATIVE IMPLEMENTATION REFERENCE**
>
> This document is optional architecture guidance for downstream Domain Apps. It is **not** a DomainHarness SDK/Kernel/Runtime/public-API/ABI specification, feature announcement, Product/L2 decision, freeze baseline, release plan, or implementation authorization.
>
> - **SDK capability authority:** for a consumer pinned to DomainHarness v0.10.3, use the exact released tag/source, actual public exports and ABI, and evidence from that consumer's selected BUILD/Host/clean-consumer path. This document cannot add an API, make an unimplemented feature available, or override the released contract. Verify again when using another SDK version.
> - **Downstream authority:** each project owns its Product/L1/L2 scope, architecture decisions, implementation plan and acceptance gates. This document is not a prerequisite, blocker, native dependency, Task requirement or acceptance gate for any downstream project.
> - **Optional adoption:** adopt, adapt or skip each recommendation according to the downstream project's needs. Do not wait for this PR to be reviewed, marked Ready, or merged. GitHub Draft describes only this document PR's review state; it says nothing about SDK capability or downstream readiness.
> - **Interpret MUST / MUST NOT:** when a statement describes an exact existing released contract, it means consumers must use that existing contract correctly; when it describes a proposed pattern, example or safety recommendation, it is guidance for adopters. Neither use creates a new SDK obligation or capability.
> - **SDK-gap threshold:** propose a missing SDK capability only after a minimal, reproducible failure against the exact released public package/ABI in a clean external consumer, with consumer logic, Host wiring and BUILD selection ruled out. Product/L2/DAG and release qualification remain separate decisions.
>
> `DOC_KIND=NON_NORMATIVE_DOWNSTREAM_REFERENCE` · `ADOPTION=OPTIONAL` · `DOWNSTREAM_PREREQUISITE=NO` · `SDK_CAPABILITY_DELTA=NONE` · `RELEASE_AUTHORITY=NONE`

> **Status:** `SELF_ADVERSARIAL / DESIGN_INTAKE / INDEPENDENT_REVIEW_NOT_RUN`. A synthesis of Tally v2 implementation lessons, [DH #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465), [#1467](https://github.com/kaicreator-mm/domain-harness/issues/1467), and [#1468](https://github.com/kaicreator-mm/domain-harness/issues/1468). Not a v0.10.3 runtime ABI change, frozen L2, independent review PASS or release authorization. The historical downstream experience register is [#1392](https://github.com/kaicreator-mm/domain-harness/issues/1392).

## 0. Pinned evidence and scope

- Immutable Git source: [DomainHarness v0.10.3 `061376f4a023070f215f9feffad5c24d96d503cb`](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.3). Public-ABI claims require exact exported tarballs and a clean external consumer, not merely a repository filename.
- Tally baseline: [`version/v2@7ebb1cdd0a79fc82cc938e35f852a80dd8e15332`](https://github.com/kaicreator-mm/tally/tree/7ebb1cdd0a79fc82cc938e35f852a80dd8e15332). Its Business module declares `PACKAGE_KIND=business` and `ABI_VERSION=v08-business-abi/1`. This is not proof that its full installed K/Host runtime is v0.10.3.
- Tally's final integration candidate is still Draft [#258](https://github.com/kaicreator-mm/tally/pull/258); Domain Data/workflow refactor is Task [#276](https://github.com/kaicreator-mm/tally/issues/276).
- Distinguish `HISTORICAL_DIRECTION`, `SOURCE_ONLY`, `PUBLIC_SUPPORTED`, `CLEAN_CONSUMER_VERIFIED` and `FUTURE_CANDIDATE`; a design issue or version-named path is not automatically a released feature.

## 1. Three orthogonal architectural dimensions

| Dimension | Concepts | Non-negotiable boundary |
|---|---|---|
| Domain ownership | Domain Data / Business (B) | Business vocabulary, schema, rules, knowledge, pattern, recipe, skill, workflow, intent and policy remain domain-owned |
| Runtime role | One K Primary, selected S Primary/Features, B, C, trusted Host | K uniquely owns Admission, state, CAS, journal, permits, replay and UNKNOWN; S is bounded semantics; C is declared operations; Host is physical integration |
| Defined component family | `semantic` / `tool` | Released `packages/domain-harness/src/contracts/component.ts` contains `COMPONENT_FAMILIES=['semantic','tool']`; this is a specific contract, not the whole design taxonomy |
| Proposed extension taxonomy | Semantic / Hook / Tool | Historical [#1361](https://github.com/kaicreator-mm/domain-harness/issues/1361) proposes three concepts; generic business hooks are not automatically a shipped third public component family |
| Kernel extension | K advisory hook | Bounded non-authoritative advice/observation. PRs [#1269](https://github.com/kaicreator-mm/domain-harness/pull/1269) and [#1271](https://github.com/kaicreator-mm/domain-harness/pull/1271) remain unmerged |
| Business event | Proposed Domain Event/Business Extension | Prefer B Intent/K Workflow/C unless proven independent consumers require a new public ABI |
| Initialization | V8 Qualified Package vs V10 selected S Feature/K extension | Distinct lifecycle contracts; no basis to add a generic `init()` to arbitrary V10 B modules |

Semantic knowledge assets, a selected S runtime feature, a Tool Component, a C Capability Operation and an external MCP/Agent tool all have different identities and ownership. Specify the exact ABI and selected runtime route before using the generic term “tool”.

## 2. Calls across Domain/Kernel/Capability/Host

```text
Domain rule / schema / workflow definition (non-Tool)
  -> authenticated Business Intent -> selected K (Admission/Journal/Permit)
  -> BUILD-selected typed C Operation -> trusted Host/provider adapter
  -> GitHub API / MCP / HTTP / Agent / CI / local capability
  -> authoritative readback -> K evidence -> B projection
```

- Private deterministic helpers, schema validation, domain data and K-owned queries/subscriptions are **not automatically Tools**.
- A C Operation is explicitly declared, BUILD-selected and K-routed. It is not automatically an Agent-facing Tool. Its handler may invoke local or remote services through a trusted adapter. Location and effect classification are **independent**: remote GET can be read-only, local write can be effectful.
- In the v0.10.3 contract, `externalEffect` is module-scoped, not an available per-handler override; split read and effectful C modules.
- An Agent-facing Tool requires an additional authenticated allowlisted adapter to a Business Intent; it must not expose arbitrary C/Host authority or credentials.
- An incoming GitHub Webhook is an authenticated Host ingress, then a Business Intent subject to K. It is **not** a K advisory lifecycle hook.
- Provider ACK without source-qualified authoritative readback does not establish a committed effect; handle idempotency, lost ACK, stale source and UNKNOWN.

## 3. Workflow and Domain Data boundaries

Separate five meanings of “workflow”: Domain Process (semantics), versioned Workflow Definition (states/guards/transitions/waits/evidence/recovery), K-owned durable execution, UI Journey (form/page projection), and Agent/Skill/Tool flow (candidate/request).

A file in `domain/workflows/**`, a `kind:'workflow'`, or an S feature export does **not** by itself prove that the v0.10.3 runtime executes arbitrary YAML. Evidence must establish selected Feature Export, BUILD closure, actual B Intent/transition bindings, K behavior and installed clean-consumer success. Without this proof keep the definition as domain-owned data, mapped through the currently supported B/K contract.

Use files-first domain knowledge; do not force every Pattern, Recipe, Rule, Example or Skill into an exported Tool or a runtime primitive. Domain Data assets have separate authority/provenance and behavior qualification.

## 4. Two conceptual layers; two independent evolution axes

Sources: [frozen v0.3 Product](../product/DomainHarness_v0.3_PRD_FROZEN.md), [v0.10.3 evolution reconstruction](../product/v0.10.3/TASK_META_EVOLUTION_R0.en.md), [#1398](https://github.com/kaicreator-mm/domain-harness/issues/1398).

- **Two responsibilities, not two Kernels:** A task/business instance uses pinned B/S/C under one K; a meta/evolution producer evaluates sanitized, authorized cross-task evidence and proposes future assets.
- **Axis A: historical decision source precedence:** `Compiled Rule → Exact Semantic Reuse → Applicable Promoted Subworkflow → Bounded LLM`. It is a historical policy baseline, **not an automatically proven reachable v0.10.3 mechanism**; any decision still goes through B/K admission.
- **Axis B: maturity/provenance:** `OBSERVED → CANDIDATE → VALIDATED/SHADOW → EXPLICIT PROMOTION → QUALIFIED BUILD → ACTIVATION → USAGE FEEDBACK`.
- Exact semantic reuse is not journal replay; promotion is not BUILD selection; activation is not execution; running occurrences must retain their original package pin.
- Do not grant a meta producer implicit access to private task-meta traces or raw private telemetry.

## 5. Self-adversarial review ledger

The following P1/P2 tags indicate **design risk priority**, not independent findings, proven SDK defects or production incidents.

| ID | Risk | Counterexample / falsifier | Disposition |
|---|---|---|---|
| DH-AR01 P1 | Treating Semantic/Tool/Hook as three equivalent released Component families | Current family contract is semantic/tool; #1361 is a proposal and K extensions use distinct ABI | Distinguish contract layers; prove selected routes |
| DH-AR02 P1 | Equating C with an external MCP tool | Remote read, in-process handler and local effect have different transport/effect attributes | Separate C Operation, external adapter and effect class |
| DH-AR03 P1 | Exported helper automatically becomes a Tool | No BUILD-selected C route or handler binding | Keep pure helpers private; typed-refuse missing routes |
| DH-AR04 P1 | Workflow YAML auto-executes | No proven selected Feature/BUILD/consumer route | `NOT_PROVEN`; avoid claiming a generic engine |
| DH-AR05 P1 | V8 package init is generic V10 B init | Separate V10 S Feature/K Extension lifecycle; B uses `getPolicy()` | Do not invent B init ABI |
| DH-AR06 P1 | Generalized business callbacks are safer/easier than K Workflow | Hidden writes, replay inconsistency and duplicate scheduler | Defer; need two independent consumers and fail-closed proof |
| DH-AR07 P1 | Meta evolution automatically patches production packages | Candidate can bypass review and hot-swap active instance | Explicit promotion, BUILD and new activation only |
| DH-AR08 P1 | Published Git tag implies consumer runtime migration | Tally B still v08 ABI and Guided Intake differentiates contract-only consumption | Installed exact tarball/Host/BUILD evidence required |
| DH-AR09 P2 | Version-suffixed API names are automatically bugs | Historical compatibility ABIs may require explicit version names | Investigate [#1467](https://github.com/kaicreator-mm/domain-harness/issues/1467), no mass rename |
| DH-AR10 P1 | One downstream pain point proves an SDK defect | Consumer misuse or Host wiring may be responsible | Independent reproduction / cross-consumer proof |
| DH-AR11 P2 | Docs-only review means feature is verified | No Node24 consumer, live Host or CI result | Explicit `NOT_RUN` |
| DH-AR12 P1 | Business events should be unrestricted K hooks | Callback can bypass permits and deterministic replay | Default B Intent/K; proposed contract only after L2 negatives |

### Future falsification tests (not executed here)

1. Missing or unselected S/C/Host route must refuse.
2. Permitless external Effect must dispatch zero provider calls.
3. Remote read and local write must obey their correct independent effect classifications.
4. Lost ACK/duplicate/stale source remains reconcilable through authoritative readback.
5. Unapproved replan, promotion or business event must not mutate K authority.
6. Lifecycle init failure and teardown must conform to the **exact applicable ABI** without protected Port injection.
7. Semantic cache mismatch and Journal replay must remain distinct.
8. Running instances cannot silently swap a new BUILD.
9. A real clean consumer beyond Tally (e.g. Shun Assistant's documented downstream work) must show that the proposed gap is genuinely reusable.
10. Run syntax preflight before Woodpecker; record actual Node24 execution/EXIT and independent exact-SHA review.

## 6. DomainHarness improvement disposition

| Concern | Current owner / tracking | Next action | Threshold for generic SDK code |
|---|---|---|---|
| Domain Knowledge / Workflow | Downstream B; #1465/PR #1466 | Improve reference and exact source→asset→BUILD map | Verified public BUILD/Feature gap |
| C ↔ external MCP/HTTP/CLI | C/Host; #1468 | Prove current typed adapter using a clean consumer | Reused missing public seam across consumers |
| K advisory hooks | K Extension; #1361 | Preserve bounded advisory-only behavior | Real K consult scenario preserving authority |
| Business Event Contract | Product candidate #1468 | Try B Intent/K first; collect two independent cases | Reviewed L1/L2 plus replay/security negatives |
| Lifecycle | V8/V10 respective ABIs | Better docs, failure tests and examples | A reproduced missing public B/Host lifecycle |
| Versioned names | #1467 | Public-vs-private API compatibility matrix | Evidence-based additive migration |
| Two-axis evolution | #1398/#1465 | Guidance and qualification examples | Verified missing generic mechanism |
| Downstream evidence | #1392 summary / #1465 detailed | Record source/expected/actual/EXIT/disposition | Reproduced generic SDK issue only |

Tally [#276](https://github.com/kaicreator-mm/tally/issues/276) owns Engineering Domain Data and bounded Workflows, and #273/#274/#275 own governed Replan/Feedback/Attempt. Those are **not** changes to DomainHarness's core implementation.

### 6.1 Adversarial finding: lesson ID collision

[DH #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465) contains Tally lessons labeled `DPB-011..DPB-018` and a separate xDownload comment also labeled `DPB-011..DPB-014`. The previously asserted “stable Lesson ID” was therefore not globally unique. This is a feedback-governance gap, **not** a Kernel defect. Preserve original comment provenance; going forward use consumer namespaces such as `DPB-TALLY-###`, `DPB-XDOWNLOAD-###` and `DPB-SHUN-###`. Link old comment URLs and namespaced IDs in #1392. Recorded experience is not automatically a uniquely addressable production asset.

## 7. Gate and provenance
### 6.2 V8 Business ABI naming versus V10 BUILD/Runtime

The Tally consumer made one version-coordinate ambiguity concrete; it is not yet a proven ABI defect:

- DomainHarness v0.10.3 source `packages/domain-harness/src/public-v8/contracts.ts` lists `v08-business-abi/1` in `V8_QUALIFIED_ABI`.
- Tally's selected producer imports `V10_TARGET_PROFILE` and `buildV10App()` while selecting a Business module whose `ABI_VERSION` remains `v08-business-abi/1`. The ABI generation and BUILD/Runtime profile are separate coordinates.
- Tally v2 is the app version; DomainHarness v0.10.3 is the immutable Git source tag; neither should be inferred from the ABI prefix. Do not mechanically rename the ABI to `v010-business-abi/1`.
- A focused naming/compatibility investigation is tracked in [DH #1469](https://github.com/kaicreator-mm/domain-harness/issues/1469), under the broader [#1467](https://github.com/kaicreator-mm/domain-harness/issues/1467). The outcome may be clearer documentation, an additive semantic alias, or a future migration; retain the current ABI until evidence and Product/L2 decide otherwise.

### 6.3 Tally Business source inventory — what is and is not proven

At Tally `version/v2@7ebb1cdd0a79fc82cc938e35f852a80dd8e15332`:

- `packages/tally-engineering-business/src/` contains 12 MJS files / about 2,654 lines. The root `index.mjs` is 1,646 lines with zero imports; 11 sibling modules total 1,008 lines.
- The package export map exposes only `.` → `./src/index.mjs`. Thirteen sibling test files exist, but direct unit tests for helpers do not prove that the selected sealed B imports or executes those modules.
- The README still describes a single advisory Task-readiness Intent, while `index.mjs` declares 10 Intents / 10 Effects and exports multiple assess/project functions. This is documentation drift, not proof that every path is wired.
- Before splitting files, build a source-to-call-site / BUILD-closure map across B, C, Host, UI and the selected producer. Classify each helper by actual owner and selected route; do not split by line count or assume arbitrary sibling-file discovery.

These are downstream Package-authoring observations, not generic DomainHarness defects. Detailed provenance and next steps are in [#1465](https://github.com/kaicreator-mm/domain-harness/issues/1465) and [Tally PR #277](https://github.com/kaicreator-mm/tally/pull/277).


`SCOPE=DOCS_ONLY` · `SOURCE_STATIC_CROSSCHECK=DONE` · `SELF_ADVERSARIAL=DONE` · `INDEPENDENT_REVIEW=NOT_RUN` · `CLEAN_CONSUMER=NOT_RUN` · `NODE24_TEST=NOT_RUN` · `WOODPECKER=NOT_RUN` · `PRODUCT_L2_ADMISSION=NO` · `NEXT_RELEASE=UNASSIGNED`.

Any generic SDK change requires a separately admitted Product/L2/Task DAG, accepted exact write set, clean consumer tests, independent review and release gate. This document does not modify v0.10.3, close existing tracking issues, or authorize source changes.
