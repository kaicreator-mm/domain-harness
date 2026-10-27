# DomainHarness v0.10.3 — Guided Journey shared contract R0 (English)

[中文版](GUIDED_JOURNEY_SHARED_CONTRACT_R0.zh-CN.md) · [Intake #1395](https://github.com/kaicreator-mm/domain-harness/issues/1395) · [Parent #1392](https://github.com/kaicreator-mm/domain-harness/issues/1392) · [JSON Schema candidate](contracts/guided-journey-v1.schema.json)

**CONTRACT_DRAFT / AUTHOR_ONLY / NOT_FROZEN / NOT_SDK_EXPORT / NOT_TESTED.** This is a cross-project planning protocol, not a released DomainHarness API. Formal Product/L1, L2, Task DAG, independent exact-SHA review and contract freeze remain separate gates. The present v0.10.2 public ABI is unchanged. CV-01..12: INHERITED_UNCHANGED. Governance: repository pinned ADS, not inferred from this document.

## 1. Product decision and scope

One user goal does **not** create one full dynamic form or a fixed wizard. On every user input, authorized observation, actual operation result, skipped step or resume, a selected Business/semantic planner chooses **one next relevant StepSpec** from an approved versioned catalog. It may branch, repeat, ask for evidence, wait, stop or explain a block. The UI renders only the current step. The common path is deterministic and **does not call an LLM**.

Two distinct improvement layers:
- **Current instance / Business Harness**: fast, state- and evidence-driven composition of pre-generated step templates, rules and previously qualified subflows/experience; optional bounded model advisory only when deterministic options are inadequate.
- **Cross-task / Meta Harness**: offline or separately authorized producer workflow may use redacted outcomes and an LLM to propose templates/rules; candidates require review, validation, simulation and explicit promotion into a new pinned baseline. A candidate is never live authority. Historical multilevel features require actual v0.10.2 exported-ABI verification; no automatic promotion API is asserted by this draft.

This contract defines **plain data between App Business, optional selected S/Semantic, a chosen renderer and an optional LLM adapter**. It does not prescribe an LLM provider transport, HTTP API, GUI framework, generic scheduler, persistence engine, new Microkernel facade method or Agent autonomy loop.

## 2. Fixed roles and trust boundaries

| Owner | Responsibility | MUST NOT |
| --- | --- | --- |
| Selected App BUILD/producer | Seal selected executable K/S/B/C modules and required dependencies; bind a qualified template/policy baseline where authoritative | Compile/load newly generated executable Packages on every user step |
| Business Package | Own real domain goals, current facts, applicability/eligibility, next action policy and localization assets | Treat model text as a new permission |
| Optional selected S standard-feature | Reusable bounded next-step request/decision semantics and plain-data composition; may return advisory candidate | Claim independent K Effect/Journal/State ownership |
| UI/Host | Render one StepSpec; collect user events, own real transport and any actual consent UI | Convert a displayed preview or checked goal into a durable Effect permit |
| Model adapter, if selected | Optional advisory on already admitted template/option IDs and evidence refs | Mint templates/tools/permits, claim physical success, send private facts without approval |
| K Primary / actual selected effectful C | Admission, Journal/Effect/UNKNOWN/Replay and physically verified operation receipts | Delegate production authority to a StepSpec or LLM output |

Selected/closed-world BUILD is unchanged. Dynamic composition creates **StepSpec data**, not a new selected Tool or Package. A private helper need not be registered as a Tool. Only genuine independent callable C operations cross Capability boundaries; a remote LLM request must use an appropriate selected effect boundary if it has external effects. Do not infer an existing generic provider gateway from this contract.

## 3. Shared wire data contract v1 (candidate)

Canonical discriminator: contractVersion = "dh.guided-journey/1". The companion JSON Schema defines the **candidate wire shape**. These names are NOT current SDK public TypeScript exports.

- **TemplateRef**: artifactId, version, digest (exact 64-character SHA-256 in hex). A reference names a previously authored and qualified template, not runtime-created code. Catalog closure/version is fixed for an active journey unless separately admitted migration.
- **CaseRef**: snapshotId and digest for current domain facts; evidenceRefs are opaque, source-resolvable identifiers. Exact device/credentials remain private Host/domain facts, not raw model prompts.
- **NextStepRequest**: journeyId, goals, CaseRef, template catalog ref, and eligibleTemplateRefs computed by authoritative Business rules, plus optional previous StepOutcome. This is the only candidate pool for selected S or model advice; unresolved applicability requires more evidence rather than a guess.
- **StepSpec**: unique stepId, selected exact TemplateRef, CaseRef, a bounded kind, titleKey, small relevant field list, allowedEvents, evidenceRefs, optional actionPreviewRef (opaque and non-authorizing). It is render-only; especially REVIEW_EFFECT is not itself approval.
- **StepOutcome**: current stepId, event USER_SUBMIT / SKIP / BACK / PAUSE / RESUME / OBSERVATION_RECEIPT / EFFECT_RECEIPT; optional selectedOptionIds, evidenceRefs, receiptRef. Business validates choices against the issued StepSpec. A receiptRef is not a claimed successful mutation until K/Host verifies it.
- **NextStepDecision**: status STEP / NEED_EVIDENCE / WAIT / BLOCKED / DONE with reasonCode and evidenceRefs; STEP includes exactly one StepSpec. DONE/WAIT/BLOCKED never imply all requested goals were achieved.
- **LLMAdvisory**: suggestedTemplateRef, reasonCode and evidenceRefs from the candidate pool; optionally a short sanitized explanation. It is not a NextStepDecision, permission, action or implementation. Reject invented template IDs, invented evidence references, out-of-scope option IDs and arbitrary shell/APK URLs.

Finite candidate StepKinds: DEVICE_IDENTIFY, CHOOSE_GOAL, ASK, INSPECT, CHOOSE_ROUTE, REFINE_ACTION, REVIEW_EFFECT, VERIFY_OUTCOME, SUMMARY. Renderer Field kinds: CHOICE, MULTI, TEXT, CONFIRM. Additional kinds require a versioned contract amendment; app-specific options and localized text remain application data.

## 4. Protocol lifecycle and invariants

1. Read an authorized CaseRef and actual last outcome; Business evaluates requirements/currentness and supplies **only eligible** approved TemplateRefs.
2. Reuse the highest qualified deterministic rule, exact version-pinned subflow or applicability-verified experience. The S Feature, if selected, produces one bounded next-step decision. If no eligible route exists, emit NEED_EVIDENCE, WAIT or BLOCKED; do not invoke LLM automatically.
3. Optional LLM may be requested **only** for an explicitly configured novel/ambiguous case, within token/time/cost/privacy limits. Validate an LLMAdvisory against the exact candidate pool and the current CaseRef before it can influence a subsequent Business/S decision. No-model fallback must remain fully functional.
4. UI presents the selected StepSpec. User input returns StepOutcome. Any observation/effect action has an **independent** authorized Host/Capability route, literal actual receipt and updated domain CaseRef.
5. Recheck current CaseRef before generating the next step. On stale state, revise or require inspection; BACK never automatically rolls back or replays an already-effected action, and PAUSE/RESUME never reuses prior mutation consent.
6. On real action FAIL/PARTIAL/UNKNOWN, route to explicit evidence/diagnostic/recovery choices; never synthesize ACK or certify Google/Play Integrity from a model answer.
7. When a reviewed template, business policy or selected executable changes, new deployment/BUILD or an explicitly supported migration boundary changes pins. Display-only copy may evolve outside SDK if its contract and authority remain unchanged.

**Contract compatibility:** same major /1 retains field meaning and enum values. Fields not recognized by a v1 consumer are refused until optional-extension semantics are independently approved; no silent reinterpretation of permissions. No SDK version, executable ABI, schema package publication or auto migration is promised by this R0.

## 5. Concrete two-path demonstration to implement later

With a goal "make Google-dependent apps work":
- Case shows GMS component **present but disabled**: emit a focused OEM-route applicability/consent preview step only if the Business policy qualifies it; no APK installation page.
- Case shows GMS **absent**: ask for certified compatibility and lawful user-provided installation rights, or produce a BLOCKED/alternative step. Unknown state asks for consented READ-ONLY inventory.
- The same selected template catalog should yield different next screens without any model calls. Actual installation/disable/restore requires its own verified Host effect boundary and separate owner authorization.

For a debloat route, a protected package generates a block/explanation step; a qualified reversible package can reach REVIEW_EFFECT; actual success leads to VERIFY_OUTCOME, real failure leads to recovery; no default mutation is preselected.

## 6. Contract-first collaboration checkpoints (two repositories)

**Gate A — DomainHarness contract design only:** this draft PR, minimal schema, bilingual semantics, reuse evidence against v0.10.2 selected standard-feature/Business. Independent exact-HEAD Product/contract review reports P0/P1/P2, SHARED_CONTRACT_READY and CONTRACT_FREEZE_READY. No implementer/self-review substitution, no secret or device inventory posted. Controller records the accepted exact SHA/schema digest; until that point all names are DRAFT.

**Gate B — parallel work after CONTRACT_FREEZE_READY=YES:** DomainHarness may implement an optional S Domain Package or a smaller reference adapter if existing v0.10.2 is sufficient. ai-rexform can implement Android Business rules, pre-generated template catalog, minimal state-aware planner, renderer and one opt-in model adapter against the approved DTO, using its current v0.10.2 installed public ABI. The upstream new package is NOT a prerequisite for M01/G01 functional work.

**Gate C — downstream alignment:** install exact vetted DomainHarness v0.10.3 public tarballs, selected BUILD, load a real clean consumer (Node24); run the same contract fixtures, optional package-selection/absence, deterministic vs advisory outcomes, unknown/failed effect negative, no-model path, and real app E2E. Compare exact Source/Schema/ABI hashes, use a narrow adapter if there is a version difference; no silent hot-rebind or main merge without RQ. If v0.10.3 does not deliver a new package, maintain the app-owned compatible implementation.

## 7. Acceptance and non-goals

Pass criteria after actual tests: (a) one small current step, not a whole fixed wizard; (b) device/fact changes produce different *successor step kinds*; (c) offline/no-LLM path; (d) valid optional advisory never expands allowed templates/actions; (e) stale CaseRef/forged evidence refused; (f) pause/resume/back cannot replay an effected command; (g) Node24 public clean consumer selected/unselected path; (h) Chinese user-facing and English agent-facing messages are semantically paired; (i) valid example in ai-rexform and at least one distinct downstream journey before declaring shared ROI proven.

No general-purpose visual builder, schema compiler, UI engine, dynamic Package loading, mandatory cloud model, raw trace upload, universal Agent scheduler, duplicate Kernel authority or required v0.10.3 dependency for ai-rexform's existing M01/G01 lanes.

**Evidence at authoring:** contract source only. Node24 NOT_RUN; independent review NOT_RUN; v0.10.3 code NOT_RUN; real device effect NOT_RUN; CONTRACT_FREEZE_READY=NO.
