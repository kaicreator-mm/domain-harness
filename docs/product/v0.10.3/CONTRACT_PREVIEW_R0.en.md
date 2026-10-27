# DomainHarness v0.10.3 — Contract-first Preview R0 (UNFROZEN)

[中文版](CONTRACT_PREVIEW_R0.zh-CN.md) · [Docs hub](../../README.md) · [master v0.10.3 #1392](https://github.com/kaicreator-mm/domain-harness/issues/1392)

> **PRODUCT / CONTRACT PREVIEW ONLY.** This is neither an implemented npm/TypeScript SDK ABI nor permission to implement without ADS gates. v0.10.2 tag and RQ CONDITIONAL remain unchanged. Consumers must pin exact preview revisions and Git SHA, and never imply the proposed APIs already ship.

## Contract-first intent

Define stable **plain data exchanges and observable semantics** early, let ai-rexform/Tally exercise them through temporary B/Host adapters, incorporate evidenced feedback, then freeze Product/L1 → L2 → Task DAG, implement and complete one fixed-candidate final alignment. This neither skips freeze/review nor makes dependent applications wait.

| Concern | Owner | Consumer may prototype | Not promised |
| --- | --- | --- | --- |
| [Two independently selectable LLM protocols](LLM_PROVIDER_SELECTION_R0.en.md) | [#1396](https://github.com/kaicreator-mm/domain-harness/issues/1396) | Declare selected protocol in B and use a real Host client | A shipped `llm.generate` npm API |
| [Progressive Guided Journey](https://github.com/kaicreator-mm/domain-harness/issues/1397) | [#1395](https://github.com/kaicreator-mm/domain-harness/issues/1395), #1397 DTO/schema R0 | Pre-generate templates → select next StepSpec → validate user/LLM proposals | A built-in UI renderer or unbounded dynamic executable Tools |
| [Task/meta evolution and provenance](TASK_META_EVOLUTION_R0.en.md) | [#1398](https://github.com/kaicreator-mm/domain-harness/issues/1398) | Export sanitized evidence refs; keep candidate promotion separate | Another metadata Kernel or automatic production promotion |
| Proven SDK deficiencies | [#1393](https://github.com/kaicreator-mm/domain-harness/issues/1393) P1 and [#1394](https://github.com/kaicreator-mm/domain-harness/issues/1394) P2 | Continue app-owned workaround and reproducible reporting | Confusing LLM provider protocol support with npm executable-provider integrity |

## Three lifecycle phases for dynamic forms (supplements #1397, no duplicate DTO)

1. **Pre-BUILD / producer:** pre-author question/step templates, choice catalogs, schemas, i18n keys, applicability, evidence needs, error/recovery paths and reusable subflows. Only validated version/digest-pinned assets are selected into an App/Domain Data; there is no BUILD on each displayed step. An optional LLM may propose *future* template candidates, but they require pre-deployment validation/review/selection.
2. **Runtime choice / B + S:** use goal, admitted business facts, real Host observation, effect ACK/FAIL/UNKNOWN, skip/back/pause state to compose **only the next** UI-agnostic StepSpec. Optional S assists bounded semantic ranking/schema; B owns business eligibility; K owns Admission, durable state, Replay and Effect Permit; the renderer displays and collects data only.
3. **Optional LLM advisory / C + S:** when approved templates cannot resolve a case, bound a provider call and receive a schema-bound **LLMAdvisory** (`messageType: "llm.advisory"`, the canonical #1397 candidate wire type). Validate its admitted template/option/evidence refs, version, provenance and current applicability before B/S can propose a `NextStepDecision` with status `STEP` and one `StepSpec`. If unavailable/invalid, B selects a #1397 canonical `NextStepDecision.status`: `NEED_EVIDENCE | WAIT | BLOCKED` as appropriate; user handoff is a Business-specific `reasonCode`, **not** a separate wire status. Model output cannot create Tools, authorize effects or self-promote policy.

The **three-file JSON Schema/DTO proposal under #1397** owns the concrete StepSpec, Outcome and Advisory wire shapes. Do not invent a second incompatible field schema in this umbrella preview.

## Contract responsibilities and acceptance

- Observe actual published v0.10.2 selected K/S/B/C, `buildV10App` and `load`. Proposed `llm.*` names are candidates, not shipped exports.
- Prove one consumer selecting ONLY OpenAI-compatible, another selecting ONLY Anthropic-compatible; a third with BOTH must explicitly bind each route, never choose by implicit latest/default/overwrite.
- One goal + distinct observed states leads to different next steps offline; failure → diagnosis/recovery; invalid LLM proposal refused; no-model common path works.
- Active tasks retain exact selected versions; reviewed newer solutions are available only to future instances or explicit migrations; task-to-meta shares sanitized provenance, never execution authority.
- Capability-specific protocol features beyond a declared common intersection (Responses API, provider cache/thinking, token streaming) require explicit support evidence.

## Contract evolution → final downstream alignment

`R0 PREVIEW` (this PR + #1397, usable experimentally) → `R1 REVIEWED CANDIDATE` (independent review and two actual downstream usage reports) → `PRODUCT/L1 FREEZE` → `L2 CONTRACT FREEZE` → parallel implementation lanes → `FINAL ALIGNMENT` at ONE pinned candidate SHA comparing public ABI, examples and downstream B/Host adapters → release qualification.

Every change records `previewRevision`, `exactSHA`, field/semantic delta, `ADDITIVE|MIGRATION_REQUIRED|BREAKING`, impacted consumers, migration example and literal tests/EXIT. Justified breaking refinements are possible **before** freeze but must be explicit; post-freeze semantic changes need scoped approved amendments. Consumers can bridge through private adapters but must not claim the v0.10.3 SDK implements preview contracts.

**Gates:** `PRODUCT_FREEZE=NO; L2_FREEZE=NO; TASK_DAG_AUTHORIZED=NO; SDK_IMPLEMENTED=NO; DOWNSTREAM_ALIGNMENT=PLANNED`.
