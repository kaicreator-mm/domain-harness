# A8a source crosswalk — 10 S Feature modules and supported bindings

Status: **RESEARCH / NO_RUNTIME_PASS**. Version source: `v0.10.2@5010348204f0191c8389384704789278ce5b9eb3`. Related A8 Product #1361, proposed task #1363. Source descriptors were inspected directly; no new runtime implementation or tests were run in this note.

The following existing sealed modules declare `FEATURE_ABI='dh.v10.standard-feature/1'` and are selected as `standard-feature` through `featureExport`. **None is an existing exposed C Tool, nor a generic lifecycle Hook.** Proposed `semantic` kinds are *authoring metadata*, not current BUILD-supported new `class` fields.

| Existing module source | Existing exported behavior | Proposed public class/kind | Notes |
| --- | --- | --- | --- |
| `agent-diagnostics/modules/sfeature-agent-diagnostics-v1.mjs` | `analyzeAgentRun` | semantic / diagnostics | pure, no Tool or causal proof |
| `bounded-experiment/modules/sfeature-bounded-experiment-v1.mjs` | `planBoundedExperiment` | semantic / workflow | planner, not actual execution |
| `candidate-evaluation/modules/sfeature-candidate-evaluation-v1.mjs` | `evaluateCandidateEvidence` | semantic / validator | advisory, not independent oracle |
| `candidate-validation/modules/sfeature-candidate-validation-v1.mjs` | `validateCandidateReport` | semantic / validator | no actual Shadow isolation |
| `context-assembly/modules/sfeature-context-assembly-v1.mjs` | `assembleBoundedContext` | semantic / context | data-only, no Memory/Tool call |
| `decision-evidence/modules/sfeature-decision-evidence-v1.mjs` | `recordDecisionEvidence` | semantic / evidence | function, not registered Hook; may become Hook adapter if event trigger actually exists |
| `experience-reuse/modules/sfeature-experience-reuse-v1.mjs` | `assessExperienceApplicability` | semantic / knowledge | evidence applicability, not Memory database |
| `meta-feedback/modules/sfeature-meta-feedback-v1.mjs` | `proposeMetaFeedback` | semantic / decision | function, not registered Hook; may be event-bound later |
| `semantic-decision/modules/sfeature-semantic-decision-v1.mjs` | `resolveSemanticDecision` | semantic / decision | may use optional resolver; cannot issue K permit |
| `workflow-control/modules/sfeature-workflow-control-v1.mjs` | `planWorkflowControl` | semantic / workflow | control proposals, not separate durable runtime |

Existing other roles and honest adapter mappings:
- Existing `kernel-extension` with `hookExport` → **hook / kernel-advisory** only if an actual selected compatible K extension module exists. Does NOT represent arbitrary Business events, workflow observer subscriptions or Host lifecycle callbacks.
- Existing `capability` `handlers` → **tool / package-operation** when separately exposed as selected named Operation (read/effectful controlled by **module-level** `externalEffect`).
- `tool / system-operation` or `tool / remote-operation` are proposed provider-location labels requiring an actual named selected C/Host adapter. A direct `node:fs` import or IPC library inside a Package does not automatically become a Tool. A remote read-only and a local effectful operation must both be representable WITHOUT inferring effect from location.
- Existing `standard-primary` `STANDARD_KINDS=['schema','rule','decision','workflow','operation']` describes **semantic interpreters**. The Kind `operation` is not automatically an independently callable C Tool. `schema` and `knowledge` may remain private assets rather than callable components.
- Existing Business `getPolicy` and privately imported modules remain in B; an exposed semantic decision may map to a selected Semantic component only with an actual reviewed provider binding.

**A8a boundary decision:** The first producer adapter maps only cases already expressible by current public BUILD roles and fails closed otherwise. No pre-approval for a universal Component `components[]` ABI, independent selection of two exports in one module, per-handler effect field, generic Event Hook or new system/remote runtime.

**A8b sequencing:** Proposed late issue #1364 after T11 #1327, before T07b #1328, then T08b/T09/R01. Preserve Tiny no-unselected-import and real clean installed Node24 evidence when integrating; one actual selected module has its own immutable hash/identity, logical Package grouping may contain multiple independently selected sealed modules.


## A8 R2 physical boundary clarification

The 10 existing `standard-feature` source modules remain in their already accepted distinct sealed source directories. A8b **does not edit or merge any of those source files**, nor Kernel/Standard/Business/Capability payload, Host or Contracts; it only exposes an optional BUILD-only typed Component view from `tooling/build/src/component-view.ts` and current `tooling/build/src/index.ts` with Node24 generated dist and a scoped test. Kind metadata never changes the actual module role/ABI or effect classification. `semantic/hook/tool` examples that current selected ABI cannot represent get a typed refusal; no new Tool or Hook runtime. A8a earlier docs/new `tooling/component-bridge` source-only two paths (no `package.json`) do not become shipped runtime files.
