# DomainHarness v0.7 — L1 Product Evidence

Status: **PRD candidate evidence — NOT Product Freeze**  
Parent: `#510`  
Integration branch: `version/v0.7`  
Planning branch base: `94e42351e73c830921df9e3d375255940a15bd6c`

## 1. Product problem

The Domain Application ecosystem needs one coherent model for constructing an executable Domain App without making each ecosystem project invent its own runtime nouns, private compiler shapes, capability/provider hierarchy, or UX/runtime authority model.

The target product equation is:

```text
Domain App
=
DomainHarness
+ Domain Definition
+ UX
```

Where:

- `DomainHarness` is an embedded SDK/runtime;
- `Domain Definition` is the abstract definition of the Domain App;
- `UX` is the user-interaction expression of that Domain App.

The ecosystem construction path is coordinated, not owned, by DAC:

```text
domain-ai-creator = creation/orchestration facade
domain-forge      = Domain Definition generation/evolution
domain-simulator  = Domain Definition simulation/validation/evolution
domain-ux         = UX generation/integration
domain-harness    = embedded runtime SDK
domain-application-contract = minimal cross-project coordination contract
```

## 2. Why the old v0.7 framing is superseded

`#500` and `#501` framed v0.7 primarily as a `DomainDataComponent` meta-model research exercise. That work usefully identified source facts and open taxonomy questions, but the product model has since converged further:

1. `Domain Definition` is an abstraction, not a package/file/serialization format.
2. A complete Domain Definition must describe both domain semantics and executable functional modules.
3. `Tool` should not be restricted to an Agent tool; it is a general executable functional component.
4. `Capability` is useful as a stable `requires/provides` contract identity, but does not need to become a second root component/provider hierarchy.
5. DomainHarness self-bootstrap is an SDK architecture property: standard Harness functionality should progressively use the same Component abstraction it exposes to Domain Definitions, while DomainHarness remains embedded and non-self-running.

The old issues are therefore historical evidence only.

## 3. Current source evidence

### 3.1 Current artifact taxonomy is closed

The current core still defines a closed compiled-artifact kind list containing:

```text
rule
knowledge
skill
tool
output-schema
workflow
promoted-subworkflow
harness-config
```

This is workable for the current implementation but is direct evidence that new semantic nouns currently tend to require central SDK/compiler edits. v0.7 should remove this as a Product-level assumption without prematurely freezing the replacement SPI.

### 3.2 Raw compiler shapes are compiler-specific

The compiler currently has `Raw*` authoring shapes such as `LoadedRawDomainPackage`, `RawWorkflow`, `RawSkill`, `RawToolDefinition`, and `RawProjectionDefinition`. The source already documents these as compiler-specific build-time shapes rather than the portable semantic authority.

This supports a v0.7 requirement that ecosystem consumers depend on the public Domain Definition / Component model, not accidental `Raw*` internals.

### 3.3 Capability identity already exists as a contract concept

Current v2 contracts define capability identities in the form:

```text
${string}@${number}
```

and distinguish target-host capability availability/bindings from the semantic packages consuming them.

This is sufficient evidence to retain `Capability` as a stable contract identity. It is not evidence that Capability must become a parallel `Capability Component -> Provider -> Binding` hierarchy.

### 3.4 Runtime authority is already separate from model/tool proposal

Current v3 runtime assembly reuses one portable Runtime and composes governance, exact activation/binding, central admission, durable effect authority and evidence around that same Runtime. This supports an important v0.7 constraint:

```text
Generic Component/Tool abstraction
MUST NOT create a second Runtime or second mutation/effect authority.
```

### 3.5 Workflow engine is already an implementation detail rather than Product identity

Historical v0.1/v0.2 work progressively separated public Workflow semantics from engine internals. Shipped v0.2 explicitly reconciled the runtime implementation around `CompiledWorkflowRuntime` rather than treating XState as the public product contract.

Therefore v0.7 does not need to replace Workflow semantics to achieve a microkernel; it needs to stop treating Workflow as the ontology root of the entire SDK.

## 4. Converged Domain Definition hypothesis

The smallest useful Product abstraction is now:

```text
Domain Definition
=
Domain Component Graph

Domain Component
├── Semantic Component
└── Tool Component
```

### Semantic Component

A Semantic Component defines domain meaning, constraints and behavior — what exists, what is valid, what should happen, and under which authority.

Examples may include Workflow, Rule, Policy, Schema, Skill, Knowledge, Projection and Decision, but Product should not freeze the complete taxonomy before implementation evidence.

### Tool Component

A Tool Component is a bounded executable functional module with defined input/output/effect semantics.

Examples include AI reasoning, external API access, search, persistence helpers, document operations, notification, calculation or domain-specific executable functions.

An Agent Tool is only one possible controlled exposure of a Tool Component. Tool is not Agent-specific.

## 5. Capability hypothesis

Capability should remain a stable contract identity used by component relations:

```text
Semantic Component
  requires <capability>

Tool Component
  provides <capability>
```

A Tool may also require lower-level capabilities.

Product should prefer this simple `requires/provides` model and reject a separate capability-component hierarchy unless reference implementation proves a material missing requirement.

## 6. SDK self-bootstrap hypothesis

DomainHarness is an embedded SDK and cannot self-run. Self-bootstrap therefore means:

```text
DomainHarness SDK
≈ Minimal Microkernel
 + Standard Components using the same public Component abstraction
```

The microkernel retains only irreducible cross-component/runtime constitutional mechanics. Standard semantic/tool concerns should progressively move behind the same Component model used by application Domain Definitions.

This should be testable by moving at least one currently hard-coded standard concern through the public Component mechanism without adding a second Runtime or expanding the Kernel with domain-specific nouns.

## 7. UX and runtime authority evidence

The Domain App formula keeps UX outside Domain Definition runtime authority:

```text
UX affordance / intent
!= Runtime transition authority
!= effect commit authority
```

UX may invoke exposed Tool/semantic operations through DomainHarness, but DomainHarness remains the authoritative admission/runtime boundary.

## 8. Product risks to validate in v0.7

The following are material and require implementation feedback rather than document-only confidence:

1. Whether `Semantic Component + Tool Component + relations` is sufficient for a real Domain App.
2. Whether current Workflow/Skill/Projection/Tool code can sit behind the generic Component model without semantic regression.
3. Whether Tool substitution is sufficient for simulator-friendly fake/deterministic implementations.
4. Whether Agent Tool exposure can be represented as Tool exposure rather than a separate Tool ontology.
5. Whether the microkernel can remain genuinely small while preserving current admission/effect/recovery invariants.
6. Whether current `Raw*` authoring/compiler contracts can migrate behind a compatibility adapter without forcing ecosystem consumers onto private types.

## 9. Product evidence conclusion

```text
PRODUCT_PROBLEM=VALID
DOMAIN_APP_MODEL=VALID_FOR_PRD_CANDIDATE
DOMAIN_DEFINITION_AS_ABSTRACTION=YES
COMPONENT_GRAPH_DIRECTION=VALID_FOR_PRD_CANDIDATE
SEMANTIC_COMPONENT=REQUIRED
TOOL_COMPONENT=REQUIRED
TOOL_AGENT_ONLY=NO
CAPABILITY_ROLE=REQUIRES_PROVIDES_CONTRACT_IDENTITY
PARALLEL_CAPABILITY_COMPONENT_HIERARCHY=NOT_JUSTIFIED_AT_PRODUCT_LEVEL
DOMAIN_HARNESS_ROLE=EMBEDDED_SDK_RUNTIME
SDK_SELF_BOOTSTRAP_DIRECTION=VALID_FOR_PRD_CANDIDATE
DAC_ROLE=MINIMAL_CROSS_PROJECT_COORDINATION
REFERENCE_IMPLEMENTATION_REQUIRED=YES
PRODUCT_FREEZE=NO
L2=BLOCKED
TASK_DAG=BLOCKED
NEXT=PRD_CANDIDATE_AND_FRESH_PRODUCT_REVIEW
```
