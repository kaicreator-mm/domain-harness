# Domain Intelligence Standard (DIS) v0.2.0 — Element-first R1 with Evolution R2 addendum

**Status: new Product/L1 architecture candidate, NOT FROZEN.** Authority: [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496). This proposal replaces—not amends—the old #1494 / PR #1493 Intelligence Unit (Data/Processing/Composite) draft. DIS 0.1.0 stays frozen.

The **current evolution architecture elaboration** is the Chinese R2 document [LLM_HARNESS_EVOLUTION_R2.zh-CN.md](LLM_HARNESS_EVOLUTION_R2.zh-CN.md) plus [self-adversarial review](ADVERSARIAL_REVIEW_R2.zh-CN.md) and [conformance cases](EVOLUTION_CONFORMANCE_R2.zh-CN.md). R2 supersedes the R1 evolution design, without claiming bilingual clause parity or independently validated implementation. This document mirrors the **architectural decisions** of the Chinese candidate. Focused R1 contract drafts currently have Chinese working text; a complete bilingual clause-level parity review and schemas are required before L2 freeze.

## 1. Purpose and boundaries

DIS standardizes the **consumption and operationalization of domain intelligence**: express intelligence as Elements and Functions, declare dependencies, bind through AOT to a selected target-specific Domain Package, execute under KDP authority, and exchange evidence for future evolution. Knowledge-graph production, knowledge asset governance and server-side learning algorithms belong to Domain-Forge / approved producers, not DIS Core.

## 2. Domain and Elements

**Domain = Element dependency DAG**. Edges are *static* compile-time Element/Function dependencies, not runtime execution, state or data-flow graphs. Elements are cohesive semantic/service micro-libraries and may offer multiple public Functions, private implementations, optional internal state, knowledge query requirements and cross-Element dependencies.

No mandatory exclusive `Entity/Relationship/Knowledge/Rule/Operation/Process` type. Optional tags are descriptive only. A relation, invariant or collaboration concern may itself be represented by an Element; a fact or file does not automatically become one. A declarative-only Element may expose zero callable Functions.

A **Function Contract** defines stable identity, description, inputs/outputs, applicability, preconditions, typed outcomes, evidence obligations, failures and compatibility. **Capability Contract** is the stable public view of these semantics, never a conflicting parallel handwritten specification.

## 3. Functions, dependencies and state

Different Functions of the *same* Element may bind to different Code, Rule, Query, Workflow, LLM or Harness implementations. A Workflow is an implementation strategy, not a mandatory engine. Static `dependencies` may reference multiple public Functions within one target Element. AOT rejects missing bindings, incompatible versions and static dependency cycles.

Runtime loops, retries, multi-step reasoning, event-driven tasks and interactive workflows are allowed as business execution strategies, not encoded by the Element DAG. Event bindings must be declared and sealed.

Each Domain owns its **business state semantics**, possibly by app-specific State Elements. SDK Elements supply business-neutral functions such as SQLite, JSON, schema validation and optional CAS primitives; `sdk.state` is not a mandated global business-state authority.

## 4. Package and AOT

Boot starts KDP independently. KDP governs the Package system, technical initialization, execution admission and Effects. SDK Domain Packages (SDP) provide shared Elements; Business Packages supply domain semantics. Each Package is built for its own selected runtime target (e.g. Windows or Android), not for a universal Host abstraction. DIS does not define universal file/network/process/device APIs.

AOT locks exact Element/Function/implementation/resource identities, selected versions, provider catalog, target and ingress bindings; runtime cannot silently replace active executable assets or run unselected tools.

## 5. Two-stage initialization

After KDP starts and required SDK/Business **Package-level technical initialization** completes, exactly one declared **App Init Element.init(context)** runs as the *business-level* initialization. Only after an admissible READY result may the App expose AOT-sealed ingress. Public ingress can call ordinary Element.Function directly; a Main Workflow, global Router and runtime Task DAG are not required. App-specific task resume belongs to Business Elements, not mandatory App Init lifecycle APIs.

## 6. Intent Interaction

A normal Interaction Element may progressively clarify a goal using forms, chat, wizard, diagrams, CLI or other user experiences. UI-neutral interaction requests/answers carry version, evidence, missing slots, ambiguity and the resulting structured intent. Clarification does not grant permission for an external Effect.

## 7. Optional Harness / LLM

`sdk.llm` provides bounded model-invocation contracts; `sdk.harness` provides an optional *bounded domain-reasoning episode* with context, AOT-selected callable functions, proposals, admission, observations, verification and termination. The Harness does not form a peer Kernel or force every Function through model reasoning.

Historic v0.3 preferred resolution order: compiled deterministic intelligence → exact semantic reuse → qualified promoted subflow → bounded Harness/LLM fallback. A business policy can explicitly override this with documented, validated applicability.

## 8. Optional two-layer evolution

Task/App layer: simple, immediate reuse of qualified facts/experience, optional bounded model assistance, real outcome/evidence/feedback; **no modification of active AOT pins**.

Server/Meta layer: analyze authorized redacted cross-task evidence; propose, verify and qualify improved Functions, Rules, Workflows, Interaction and knowledge usage. Domain-Forge governs knowledge assets and production. Explicit promotion, new AOT build and activation are required for future instances. No automatic live self-promotion or mandatory Meta server.

DIS defines minimal shared exchange semantics for execution/usage/evidence, candidate/qualification, and new activation identity, not an evolution algorithm or server database.

## 9. Conformance and delivery status

Future gates: complete bilingual parity, machine schemas, two+ materially different consumer demos (including Tally, xDownload, Shun, ai-rexform), valid and invalid provider/tool/unknown tests, restart and two-stage init, task/meta evolution, independent exact-SHA review, Node24/CI and explicit L2 freeze.

**R1 is NOT production code, a runtime adoption receipt, SDK ABI authorization, a release, or a migration of frozen DIS 0.1.0.**

## 10. Evolution R2 design addendum (not yet frozen)

The optional AOT-selected Function Resolution profile predeclares bounded deterministic, exact-experience, promoted subflow and Harness/LLM paths, plus any admissible local **interpreted-rule-data** Evolution Slot. There is no generic self-modifying runtime. Each Function may choose DETERMINIZABLE, HYBRID, GENERATIVE or NONE; intrinsically generative work evolves prompts, context and verification rather than replacing model output with cached text.

Experience is derived from trusted runtime observations with domain-independent verification evidence and applicability/currentness limits. Cache hits are not independent training cases. Domain-specific Problem/Method signatures retrieve candidate patterns; LLM synthesis is only a hypothesis; independently held-out cohort-based and negative-case verification determines local qualification. Runtime rule selection is limited to AOT-sealed interpreters, schemas, budgets, scopes, task-snapshot pins and rollback; absent safe support, only candidate/shadow and server feedback are permitted. A Function Candidate cannot add executable dependencies or effects through a local Slot. Server qualification, governed promotion and new AOT Package activation remain separate steps, and previous active instances do not silently change.

The R2 single-author self-adversarial design review found 3 P0, 7 P1 and 2 P2 **design risks** and documented mitigations and 25 planned tests; it is NOT an independent source review or executed conformance receipt. English clause-level parity and machine schema are OPEN.
