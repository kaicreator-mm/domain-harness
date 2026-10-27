# DomainHarness v0.10.3 — L2 Architecture Preview R0 (UNFROZEN)

[中文](L2_R0_PREVIEW.zh-CN.md) · [Product R0 PR #1402](https://github.com/kaicreator-mm/domain-harness/pull/1402) · [Journey schema PR #1397](https://github.com/kaicreator-mm/domain-harness/pull/1397) · [provider/evolution PR #1400](https://github.com/kaicreator-mm/domain-harness/pull/1400) · [master #1392](https://github.com/kaicreator-mm/domain-harness/issues/1392)

> **PRE-L2 DESIGN ONLY.** NOT an L2 Freeze, admitted native Task DAG, implementation grant or deployed SDK. Three R0 independent reviews each returned **BLOCK** (#1397 P1×1/P2×2, #1400 P1×2, #1402 P1×1/P2×1); focused R1 source repairs are pending new exact-SHA independent review and Product disposition. ADS pin #1405 remains under review; current main effective ADS is 4.13.1, NOT 4.18. CV-01..12 INHERITED_UNCHANGED.

## 1. One selected closed-world composition

```text
External BUILD Producer: seal explicitly selected versioned K/S/B/C + dependencies
  K Primary: single Admission / State / CAS / Journal / Effect Permit / Replay / UNKNOWN authority
  S Primary + optional S Features: existing Context / SemanticDecision / Workflow;
      pure Prompt / Response / Guided Journey ONLY where real reuse gaps justify them
  B Business: goal, privacy/model policy, exact permitted provider binding, next-step eligibility
  C Capability: independently selected 0/1/2 remote model modules
      capability-llm-openai-compatible
      capability-llm-anthropic-messages
Microkernel.load(selected built App) + trusted Host(DocStore / real SDK / secrets)
  K-approved selected C operation → remote model → candidate output
  S schema/candidate validation → B choice → K final admission
  UX renders ONLY the current StepSpec DATA, not a Tool or permit.
```

Preserve v0.10.2 external `@kaicreator/domain-harness-build` `buildV10App/projectSelectedComponents` selected source closure and `@kaicreator/domain-harness-microkernel` `load/send/query/subscribe/stop` public ABI. Host owns physical sockets/secrets; K maintains the existing authority. The MVP introduces no new Kernel ABI or provider runtime gateway.

## 2. Ownership and single authoritative wire shapes

| Concern | Candidate owner / package seam (subject to L2) | Data, trust and authority | No extra Tool because |
| --- | --- | --- | --- |
| Shared neutral **`llm.generate` logical contract** | One provider-neutral typed request/response **contract**, each B/BUILD call explicitly bound to selected concrete C operation | Both adapters accept supported common intersection; unbound call refused. **NOT a third C Package** | A pure shared wire interface has no independent physical I/O |
| OpenAI-compatible | One selected OpenAI C module + trusted Host SDK, optional `llm.openai.generate` | Real Chat Completions wire + capability declaration | Actual external invocation **is a Tool**, module `externalEffect:true` |
| Anthropic Messages | One selected Anthropic C module + trusted Host SDK, optional `llm.anthropic.generate` | Messages native content/tool-use; explicit capability differences | Independent Tool; no implicit cross-provider import |
| Prompt / Context / Response | Reuse current `standard/features/context-assembly`, `semantic-decision`; private helper or optional pure S Feature only as needed | Prompt preparation, bounded scoped context, parse/validate response; model output non-authoritative | Pure semantic processing and helpers are not automatically C Tools |
| Pre-generated guided forms and runtime choice | Producer-owned pinned StepTemplate/FormSchema/catalog; B + optional S reuse **only #1397** `StepSpec/LLMAdvisory/NextStepDecision` wire | Current step from approved eligible candidates, UI render-only | Rendering and composition cannot issue physical effects |
| Task/meta evolution | Audit selected S Evidence/Candidate/Experience reachability; B producer and optional task-meta observations | **Decision sources:** rule → exact semantic reuse → promoted workflow → bounded model. **Maturity:** Candidate → validation → explicit promotion → future pinned BUILD | No second Kernel, autonomous promotion or metadata control runtime |
| External npm executable integrity #1393 | Small **cross-BUILD/deploy/Host** trust-closure decision | Separate default trusted-deployment and optional verified-integrity profile; independently trusted publisher/deployment anchor covers **actually executable code/dependency closure** before evaluation. A hash stored only inside mutable local sealed App is **not** a trust root | Distinct from LLM wire protocols; no new supply-chain platform |
| CAS wiring docs #1394 | Standalone docs/examples | Public K `kind:create/cas` vs Host CAS `mustBeAbsent/mustMatchRevision` narrow adapter | No alternative store or permission authority |

Remote LLM requests may charge and transmit user data. Under v0.10.2 selected C **module-wide** `externalEffect`, use existing K Permit/Journal/UNKNOWN; never treat a model-generated tool-use block as direct authority. **Required neutral logical contract** does not claim a third publicly exported `operationId` or alias table exists today: L2 must specify the smallest explicit B/BUILD binding example and refusal semantics.

## 3. Capability-first, maximum SAFE parallelism (NOT an admitted DAG)

These concern ownership boundaries are a planning preview only. Exact file write sets, Native GitHub `blocked_by`, Task Claims and actual integration SHA must be approved later.

| Lane | Scope | Genuine predecessor | Disjoint tentative write ownership |
| --- | --- | --- | --- |
| G | Independently reviewed ADS pin PR #1405 | Independent from Product work; existing review continues | `.dev-standard/VERSION` + exact current-pin note |
| I | Reproduced npm executable integrity P1 #1393 | Accepted Product/L2 | BUILD/Contracts trusted pre-import boundary |
| A | Neutral model Request/Response contract #1396 | Minimal approved Product/L2 static ABI | One contract owner and reusable DTO/projection |
| B | OpenAI C/Host adapter | Approved A's minimal type/semantic boundary only; **not** waiting for C | OpenAI-only C/Host implementation |
| C | Anthropic C/Host adapter | Same A boundary, runs **in parallel** with B | Anthropic-only C/Host implementation |
| S | Prompt/Response/context reuse | Evaluate actual common gap without blocking B/C | Bounded selected S/private helpers |
| J | Guided Journey #1395 | Reviewed #1397 wire contract; offline/no-model consumer independent of B/C | B Step/reference implementation; optional selected S only if justified |
| M | v0.3/v0.10.2 reachability + task/meta reuse #1398 | No unconditional Provider dependency | Scoped evidence projection, no second meta runtime |
| D | CAS↔DocStore practical docs #1394 | Independent of B/C and other Lanes | Bilingual narrow docs and example |
| R | One integrated version candidate + RQ | All **actually mandatory** accepted source lanes | Exact Node24 installed clean consumer, applied E2E positive/negative, docs alignment |

If I and B/C share a real Host composition-root path, **I owns the shared admission seam** and B/C own provider-specific files; R wires them once. Never issue simultaneous overlapping writer Claims. A text table cannot replace the canonical Native GitHub Issue Dependency graph.

## 4. Proportionate evidence before freeze / final qualification

1. New exact SHA R1 independent reviews for #1397/#1400/#1402. A real Draft 2020-12 validator executes bounded schema positive/negative fixtures; merely parsing JSON and passing generic PR CI does NOT prove formal schema conformance.
2. A Node24 packed external App with 0 / OpenAI-only / Anthropic-only / both; same neutral input/output with explicit eligible binding; unselected provider zero imports and calls; controlled wire-conformant fake endpoints instead of mandatory paid live API keys.
3. Prebuilt versioned Journey templates → context-specific StepSpec; LLMAdvisory has no forbidden Tool/effect/template authority; old StepOutcome / Effect UNKNOWN never fake success; offline path still works. Require two actual consumer needs before new generic S package.
4. Real sanitized task Evidence → Candidate → qualified authorized promotion → newly pinned future App; active prior instance replay unchanged. First distinguish selected current source from historical v0.3 prototypes.
5. #1393 integrity acceptance has **three real Node24 cases**: legitimate Provider, installed-provider replacement, and **provider + mutable sealed-App matching embedded-hash joint tamper with stale subjectDigest**. Anchor must be independently trusted outside the shared mutable surface, and denial precedes Provider evaluation / K Effects with no credentials in logs. State attacker model, transitive executable coverage, Node ESM/TOCTOU limits; narrow verified profile if it cannot prove all dependency closure, rather than pretend sandbox isolation. #1394 P2 prefers real ai-rexform adapter plus paired runnable docs; no runtime store rewrite unless another proven consumer need exists.
6. One final exact-candidate Full/Hidden/Host scope as actually required. Existing v0.10.2 historic Full EXIT1/root NOT_RUN facts stay immutable; PR CI PENDING is not FAIL, terminal failures trigger specific impacted checks.

**Gates:** `PRE_L2_R0=DOCUMENTED; PRODUCT_L1_FREEZE=NO; L2_FREEZE=NO; DAG_ADMITTED=NO; SOURCE_CHANGE_AUTHORIZED=NO; ADS_V418_ADOPTION=UNDER_REVIEW`.
