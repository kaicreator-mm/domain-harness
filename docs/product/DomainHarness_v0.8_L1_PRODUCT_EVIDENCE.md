# DomainHarness v0.8 — L1 Product Evidence (Draft R0)

**Authority:** #949 (formal Product/L1 authorized), execution #950. **Posture:** PRODUCT_EVIDENCE_DRAFT; no Product Freeze, no L2/implementation authority.  
**Pinned ADS:** `kaicreator-mm/ai-development-standard@1edaee9291e25b6dd99303493bed75132cb54881` (`prompts/L1_PRODUCT_EVIDENCE.md`); project `.dev-standard/VERSION` and `PROJECT_OVERRIDES.md`.  
**Historical reference:** v0.7 Product Freeze #517, L2 Freeze #526, accepted version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521. v0.8 research #932, decision register #942, #938/#940 and #944/#945/#947/#948.  
**Evidence labels:** OBSERVED_REPOSITORY = checked commit/demo/Issue, EXTERNAL_PRIMARY = documentation of another product (not independent usage measurement), DESIGN_INFERENCE = plausible developer need, NOT_COLLECTED = missing user research. The representative journeys below are **synthetic product-design journeys grounded in repo demonstrations**; they are **not claimed as interviews, customers or production deployments**.

## 1. Product thesis / problem evidence

DomainHarness is an embedded Domain App runtime SDK, not an IDE/standalone service, broad agent framework or generalized distributed workflow engine. v0.7 already owns Component/Definition, authoritative Runtime State/Effect/Replay/Admission, versioned KindRef and scoped invocation. v0.8's incremental problem is **composition and evolution**: domain consumers should be able to compose verified Kernel, Standard SDK and narrowly scoped Business Domain Packages, interpret Component Kinds and optional operations through one coherent model, and replace/extend app packages without granting arbitrary runtime authority.

- **E01 OBSERVED_REPOSITORY:** [#517 v0.7 Product Freeze](https://github.com/kaicreator-mm/domain-harness/issues/517) explicitly commits to embedded SDK, Definition graph, separated UX, single authoritative Runtime and fail-closed required semantics. [#526 L2 Freeze](https://github.com/kaicreator-mm/domain-harness/issues/526) identifies existing Component admission, KindRef/implementation and Central Admission/effect authority rather than a blank-slate runtime.
- **E02 OBSERVED_REPOSITORY:** [#938 package-first Demo](https://github.com/kaicreator-mm/domain-harness/issues/938) and [repaired independent review](https://github.com/kaicreator-mm/domain-harness/issues/938#issuecomment-6062292846) establish a **bounded** verified bootstrap, three/four package closure, two business demo executions and deterministic scoped invocations; not a production parity proof.
- **E03 OBSERVED_REPOSITORY:** [#942 A→B](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6061397665) shows feasible one-Component successor candidate and five seed Kinds, yet its independent [P1 review](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6062395360) rejects sealed executable binding, Package provenance and required-semantic admission.
- **E04 OBSERVED_REPOSITORY:** [#945 independent review](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6063295915) reports 69/69 tests including green failure witnesses; Kernel still contains Business Workflow/Action branches. [#947 independent review](https://github.com/kaicreator-mm/domain-harness/issues/947#issuecomment-6063756020) finds further Graph identity collision and array descriptor safety gaps in the proposed validator. [#942 R31](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6063721034) concludes Tech Gate 1 FAIL, native B→actual v0.7 T002/T004 NOT_PROVEN.
- **E05 DESIGN_INFERENCE:** Domain App teams repeatedly need deterministic rules, conditional workflows and business-specific package evolution without cloning a runtime or manually wiring competing authorities. Repo toy fixtures show the shape of the intended developer work; external customer adoption and willingness to migrate have **not** been measured.

## 2. Users / Jobs / triggers / workflows / pain / workarounds

**Primary user A: SDK consumer / application integrator.** Trigger: deploy or upgrade a narrow-domain app. Job: select exact verified package closure, resolve needed capabilities/Kind handlers and start an authorized runtime. Existing workaround: custom glue and runtime-private adapter logic. Pain hypothesis: compatibility drift and changes not independently replayable. Observable acceptance: same pinned assembly yields the same admitted behavior; invalid dependency and handler drift are refused before effects.

**Primary user B: Domain Package author.** Trigger: add a Rule/Decision/Workflow/Operation to one domain app. Job: express schema, relations, required capabilities and optional callable operations without modifying Kernel. Workaround: hard-coded runtime dispatch or per-domain plugin glue. Pain hypothesis: every new semantic Kind forces risky Kernel changes. Acceptance: one new versioned declared KindImplementation can be accepted via a verified Standard/Business Package; unsupported material Kind is rejected.

**Primary user C: Domain App / UX integrator.** Trigger: end-user intent, resume after a WAIT or replace an app version. Job: relay typed requests and receive attributable outcomes, without UX or a model owning state/effect authority. Workaround: direct service mutation with ad hoc authorization. Pain hypothesis: unsafe effect duplication/unknown results when interrupted. Acceptance: denial of unauthorized transition and recovery pins maintained; runtime results—not UI state—are authoritative.

These are **developer/consumer archetypes**, not empirically sampled customer cohorts. L1 must record this limitation explicitly.

## 3. Representative narrow Domain App journeys (synthetic, falsifiable)

### J1 — Deterministic purchasing/approval policy (no LLM)
- **Actor/trigger:** internal app integrator packages a bounded spend-approval app; user submits an amount and role, later requests a permitted approval.
- **Input:** a versioned Business Package with Schema + Rule + Operation, exact SDK closure and a typed input.
- **Flow:** verify sealed package bytes + graph/capabilities → admit required semantics → Rule evaluates limit/role → authorized Operation records an outcome through the existing Runtime.
- **Output:** completed/denied typed receipt with pinned Assembly, no new model call required.
- **Negatives:** unauthorized caller, unknown required semantic Kind, ambiguous provider or tampered implementation fail closed **before effect**; a pure Schema cannot be invoked.
- **Success measures:** 1 deterministic legal outcome on repeated same pinned inputs; 0 unauthorized effects in rejection tests; 100% tested refusal cases return a typed error. These are acceptance thresholds, **not measured project performance**.
- **Reuse:** v0.7 Component admission, T002 Assembly/activation, T004 scoped invocation, single authoritative commit path; #938 Approval is only toy supporting evidence.

### J2 — Conditional learning progression (Rule/Decision/Workflow, WAIT/Handoff)
- **Actor/trigger:** training Domain App receives an exam result; unresolved prerequisite requires human approval.
- **Input:** learner facts, bounded candidate transitions, Versioned Workflow/Decision definitions and admitted operation scopes.
- **Flow:** Rule evaluates eligibility → Decision resolves 0/1/N eligible steps with recorded choice → Workflow may WAIT for authorized handoff → resume from the original pinned decision evidence.
- **Output:** next module / WAIT with reason / explicit rejected transition; no silent loop or re-selection drift.
- **Negatives:** missing candidate and unrecognized required semantic contract fail closed; replay must not choose a newly added provider inside an old occurrence.
- **Success measures:** expected 0/1/N selection; a WAIT is explicit and resumable in specified cases; loop/no-progress bounded; replay outcome pinned. **Durable crash recovery is a later Gate B obligation, not proven now**.
- **Reuse:** v0.7 existing Workflow Kind adapter, DecisionResolver/Admission, journal/replay; #938 Learning smoke proves toy scoped routing only.

### J3 — Domain Package substitution, verified support dependency and new Kind
- **Actor/trigger:** vertical app operator updates a procurement scoring Business Package, or introduces a narrow feature-gate Kind from a verified SDK/support Package.
- **Input:** existing sealed app version, new exactly versioned Business/Support Package graph (three/four packages/diamond), declared import/export and KindImplementation.
- **Flow:** verify actual module bytes and exact dependencies → build *new* sealed Assembly without altering old occurrence → bind authorized new Kind/Operation → run one new domain journey.
- **Output:** old app stays pinned; new app shows deliberately different outcome; mismatch is rejected.
- **Negatives:** forged digest, slash-ambiguous qualified IDs, mutable post-seal handler, unknown material Kind and import/export bypass cannot succeed.
- **Success measures:** no Kernel-source edit for a valid new Kind, new Assembly digest on behavioral change, old occurrence unchanged when re-invoked, all listed negatives refused. Native production upgrade, concurrency and persistent migration require later evidence.
- **Reuse:** #938 deterministic package closure and v0.7 identity/selection/effect authority; #944/#945 candidates **do not yet demonstrate these invariants as a combined native path**.

## 4. Alternatives and counter-evidence (externally verifiable, not exhaustive)

| Alternative / source | What exists today (source claim) | Consequence for v0.8 |
| --- | --- | --- |
| [Temporal TS SDK](https://docs.temporal.io/develop/typescript) | Workflow/Activity/Worker, cancellation, durable workflow service design | For service-centric durable orchestration Temporal may be sufficient. DomainHarness must justify its **embedded domain-definition + authority + package composition** niche rather than rebuild Temporal. |
| [Dapr Docs](https://docs.dapr.io/) | Distributed application runtime with durable workflows and other building blocks | If a host already adopts Dapr, new platform services may be redundant. Prefer Host adapter over new sidecar/deployment requirements. |
| [LangGraph persistence](https://langchain-ai.github.io/langgraph/concepts/durable_execution/) | Checkpointers/threads/interruption/persistence for graph-based agents | Agent-centric apps may need only LangGraph. DomainHarness v0.8 should not turn into another generic Agent graph/loop product. |
| [Open Policy Agent integration](https://www.openpolicyagent.org/docs/integration) and [Wasm policies](https://www.openpolicyagent.org/docs/wasm) | Rego policies can be embedded/evaluated; Wasm compilation exists | Rule-specific customers might use OPA; do not create a proprietary universal policy language without a domain product need. |
| [WebAssembly Component Model WIT](https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md) | Typed import/export interfaces and versioned packages | Package/interface formats may be borrowed or interoperated with. WIT alone does not establish DomainHarness State/Effect authority, and adopting full Wasm Component runtime is not an L1 requirement. |
| Existing [v0.7 DomainHarness](https://github.com/kaicreator-mm/domain-harness/issues/517) | Existing Component model, API and authoritative runtime already work | **Strongest counter-evidence:** A thin wrapper may be enough. Do not rewrite existing authority or claim packageization delivers measured cost/latency improvements without real integration evidence. |

**Coverage:** official vendor docs are capability claims, not unbiased head-to-head evaluations. Search vocabulary covered durable workflow/agent frameworks, embedded policy engine, component packaging and current internal SDK; **no systematic GitHub competitor census, buyer interviews or production benchmarking performed**. An independent Product reviewer must challenge missing close analogues and product necessity before freeze.

## 5. Product-shape conclusions / IN vs OUT candidates

- **IN candidate:** embedded SDK; minimal irreducible trust/bootstrap + Runtime authority; verified Kernel/Standard SDK/Business Package composition; one successor Component model (B) with optional callable operations; five initial versioned seed Kinds Schema/Rule/Decision/Workflow/Operation, open KindRef; fixed graph/capability import-export; deterministic refusal; bounded conditional WAIT/Handoff; versioned new Assembly and legacy compatibility bridge.
- **OUT:** standalone service/UI, full Domain App generator, generic LLM/Agent loop, network plugin marketplace, arbitrary untrusted remote code and hot-swapping an active occurrence, second mutable capability registry, second State/Effect Journal, universal business-Kind catalog, changing frozen v0.7 hashes, implementing UX renderers/Forge behavior inside DomainHarness.
- **Cross-project boundary:** domain-ai-creator orchestrates creation/UX entry; domain-forge generates/evolves definitions; domain-simulator tests; domain-ux owns UX rendering; domain-application-contract owns minimum cross-project exchange; DomainHarness only owns embedded runtime admission, execution and records. Adoption/rewrites in sibling repos are separate authority.
- **Counter-shape:** If native verified composition cannot satisfy single authority/currentness, prefer narrower v0.7-compatible composition façade over an unverified generalized package platform. Product choice B is a **direction**, not justification to ignore counterexamples.

## 6. Unresolved assumptions / validation gates

| ID | Assumption | Current evidence / gap | Gate owner |
| --- | --- | --- | --- |
| A01 | Unified B retains correct sealed behavior | PR #944 P1-F1 and #947 source gaps | **Pre-freeze technical Gate 1; P1 closure + fresh reviewer** |
| A02 | Package provenance/import/export maps to executable B handler | PR #944 P1-F2; #938 separate verified bytes but no native bridge | **Pre-freeze Gate 1 + targeted Gate 2** |
| A03 | Open Kinds remain fail-closed for required unknown semantics | PR #944 P1-F3; #947 new known gaps | **Pre-freeze Gate 1** |
| A04 | Minimal Kernel has no business-specific Workflow/Action branches | PR #945 P1-K1 | **Pre-freeze Gate 1** |
| A05 | One trusted State/Effect authority and safe canonical graph/records | #947 identity/array P1, effect-port gap | **Pre-freeze Gate 1; later Gate B fault/replay** |
| A06 | v0.7 accepted public API/identity/replay history continues to work | v0.7 oracle exists, successor native parity NOT RUN | Product promise + explicit later Gate B |
| A07 | These composition jobs justify v0.8 instead of custom v0.7 glue | toy demos and design inference only; user validation missing | Independent Product Review; seek real consumer evidence before external adoption commitment |

## 7. L1 recommendation

**NARROW / PROCEED_WITH_GATES**: Write a **bounded PRD Draft now**, focused on three verifiable consumer journeys and inherited v0.7 authority. Do not freeze or claim native architecture feasibility until open pre-PRD P1 concerns have acceptable actual evidence and a genuinely fresh adversarial Product review accepts the scope and counter-evidence. Do not convert Gate B release testing into a pre-PRD checkbox, but do not hide it.

**Truth markers:** USER_INTERVIEWS=NOT_COLLECTED; REAL_CUSTOMER_ADOPTION=NOT_COLLECTED; QUANTITATIVE_LATENCY_COST=NOT_MEASURED; NATIVE_B_TO_V07_INTEGRATION=NOT_PROVEN; TECH_GATE_1=FAIL; PRODUCT_EVIDENCE=REVIEWABLE_DRAFT; PRODUCT_FREEZE=NO.
