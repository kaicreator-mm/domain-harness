# DomainHarness v0.7 — Task DAG R2 Microkernel Boundary Overlay

```text
STATUS=SUCCESSOR_EXECUTION_DAG_OVERLAY
PARENT_WORKSTREAM_DAG=#527
FINE_GRAINED_DAG_R1=#534
OVERLAY_ISSUE=#580
CONTROLLER=#537
BASE=version/v0.7@cc0a6dd2e42a02d48f6cd1cf9bbb5ce5f6f0ce04
BASE_TREE=a72eaf32bf93a979af32bed0a57cfc422136fa2e
PRODUCT_CHANGE=NO
L2_CHANGE=NO
R1_DEPENDENCY_EDGE_CHANGE=NO
```

## 1. Purpose and precedence

This file is a successor execution-planning overlay for the frozen R1 fine-grained DAG. It does **not** replace or renumber R1 nodes and does not reopen Product or L2. It makes the already-frozen L2 Microkernel boundary explicit so Wave 3+ implementation cannot accidentally turn implementation concerns, adapters or bundled Standard Components into irreducible kernel code.

Execution authority is:

```text
Product Freeze #517
  > L2 Freeze #526 + accepted R1/R2 architecture overlays
  > R1 fine-grained DAG #534
  > this R2 Microkernel-boundary overlay
  > task-local L3 / Task Pack
  > implementation convenience
```

If this overlay and R1 appear to conflict, R1 dependency ordering remains unchanged while this overlay controls **module ownership, dependency direction and pluggability constraints**.

## 2. Classification vocabulary

Every T001–T008 executable node receives one implementation-boundary class:

```text
MICROKERNEL
  irreducible authority/integrity/currentness mechanism that cannot be expressed
  as a replaceable Component/Kind/Tool/host adapter without creating a second
  authority or weakening fail-closed semantics.

KERNEL_PORT
  public/internal contract or injection seam consumed by the Microkernel and by
  external implementations. Defines shape/identity, not concrete implementation
  semantics.

STANDARD_COMPONENT
  bundled SDK semantic/tool implementation or descriptor that MUST use the same
  public Component/Kind/Tool path as application Components. Never privileged
  Microkernel code.

ADAPTER
  Workflow/Agent/UX/engine integration translating an external or specialized
  surface into kernel ports/authority. May depend inward; kernel never depends
  outward on it.

HOST_INTEGRATION
  environment/resource/provider materialization outside semantic Definition
  authority. Secrets/live handles stay here.

COMPATIBILITY
  legacy/compiler/migration/strangler behavior. May map into successor ports but
  cannot become a new kernel authority.

VALIDATION_ONLY
  fixtures, regressions, reference experiments and aggregate evidence. Production
  authority must not depend on validation-only modules.
```

Classification is about implementation ownership and dependency direction, not importance. A concept can be Product-critical while remaining outside the Microkernel.

## 3. Normative dependency direction

```text
STANDARD_COMPONENT / ADAPTER / HOST_INTEGRATION / COMPATIBILITY
                              |
                              v
                         KERNEL_PORT
                              |
                              v
                         MICROKERNEL
```

Allowed direction is inward only.

The Microkernel production graph MUST NOT import, instantiate or special-case concrete:

```text
Workflow or XState implementation
Rule / Skill / Projection implementation
Agent behavior/framework
UX renderer or UX-specific request implementation
AI/model/provider implementation
HTTP/search/document/storage implementation
Standard Component implementation
legacy/compiler adapter
```

A kernel module MAY know stable port/contract identities needed to validate or bind these things. It MUST NOT know their concrete behavior merely because the SDK bundles a default implementation.

## 4. Irreducible Microkernel boundary

Consistent with frozen L2 H8, the irreducible kernel is limited to the minimum authority/integrity mechanics required for one authoritative Runtime:

```text
- Definition/Component identity integrity needed before trust/admission
- must-understand admission and fail-closed required-semantics gate
- sealed Runtime Assembly/currentness validation
- minimal Kind/Component dispatch indirection
- deterministic graph/admission/capability mechanics only
- runtime occurrence identity / authoritative occurrence pin
- transition/Central Admission authority
- durable effect/outcome authority
- replay/recovery/currentness invariants
- exact implementation/binding pin validation
- authority/currentness evidence required to prove those decisions
```

The following are explicitly **not** reasons to enlarge the Microkernel:

```text
SDK bundles it by default
it is used by most applications
it is needed by Workflow
it is convenient to import directly
it participates in a common happy path
```

## 5. Node classification

| Node | Boundary class | Boundary note |
|---|---|---|
| T001A | KERNEL_PORT | Component/Kind/semantic/capability envelope consumed by kernel; no concrete Kind semantics. |
| T001B | MICROKERNEL | Canonical semantic identity/integrity primitive. |
| T001C | MICROKERNEL | Definition graph identity/structural integrity primitive; relation meaning beyond exact graph mechanics stays in Definition/Kind semantics. |
| T001D | MICROKERNEL | Must-understand admission gate; concrete Kind validator semantics are supplied through a trusted port/binding. |
| T001E | KERNEL_PORT | Additive public exposure/compatibility of successor contracts; not new runtime authority. |
| T002A | MICROKERNEL | Deterministic Kind compatibility decision primitive. |
| T002B | MICROKERNEL | Sealed Runtime Assembly/currentness and exact implementation/binding pins. |
| T002C | MICROKERNEL | Atomic attachment of assembly identity to existing authoritative activation/occurrence authority. |
| T002D | MICROKERNEL | Production/simulation authority-class fail-closed boundary. |
| T003A | KERNEL_PORT | Tool Component operation/capability contract; implementation remains external. |
| T003B | MICROKERNEL | Only deterministic provider-resolution/admission mechanics; domain-specific selection policy remains admitted Definition semantics. |
| T003C | MICROKERNEL | Generic exact binding mechanism only; concrete Tool implementations stay outside kernel. |
| T003D | MICROKERNEL | Generic Domain/host plane ambiguity guard; concrete host providers stay outside. |
| T003E | MICROKERNEL | Bounded dependency-closure/cycle mechanics only; no Tool implementation semantics. |
| T004A | KERNEL_PORT | Caller-neutral invocation/exposure request contract. |
| T004B | MICROKERNEL | Generic admitted non-effectful dispatch path only; implementation executes through a port. |
| T004C | MICROKERNEL | Authoritative occurrence/Central Admission/durable-effect seam. |
| T004D | ADAPTER | Agent/Harness projection and mutation refusal mapping. |
| T004E | ADAPTER | UX intent/request mapping into admitted Domain authority. |
| T005A | KERNEL_PORT | Logical resource requirement contract; no live values. |
| T005B | HOST_INTEGRATION | Host/runtime resource materialization behind a resource-provider/resolver port. |
| T005C | MICROKERNEL | Non-secret behaviorally relevant resource/currentness evidence only where required by assembly/runtime authority. |
| T006A | STANDARD_COMPONENT | Standard descriptor/Standard Set boundary; assembly may select it, kernel must not special-case it. |
| T006B | STANDARD_COMPONENT | Standard Semantic Component bootstrap slice. |
| T006C | STANDARD_COMPONENT | Standard Tool Component bootstrap slice. |
| T007A | ADAPTER | Workflow Kind descriptor/dispatch adapter; registers through generic Kind port. |
| T007B | ADAPTER | Existing Workflow compiler/runtime engine bridge; XState/private engine remains outside kernel. |
| T007C | VALIDATION_ONLY | Workflow authority/recovery regression evidence. |
| T008A | COMPATIBILITY | Raw authoring -> Component Graph adapter. |
| T008B | COMPATIBILITY | Historical/new identity correspondence evidence. |
| T008C | COMPATIBILITY | Compiler/public compatibility lane. |
| T008D | COMPATIBILITY | Historical harness-config/promoted-subworkflow mapping. |
| T008E | COMPATIBILITY | Final-v0.6 behavioral reconciliation adapter/evidence. |
| E1–E11 | VALIDATION_ONLY | Reference/falsification gates; never production authority modules. |
| T009 | VALIDATION_ONLY | Evidence aggregator. |
| T010A–D | VALIDATION_ONLY | Neutral Domain App fixture/journeys/terminal. |

Top-level workstream names such as `T003 — Tool and Capability core` are scheduling/traceability labels only. They MUST NOT be interpreted as saying every child node belongs inside the Microkernel.

## 6. Kernel port / implementation rule

A concrete implementation is pluggable only if replacing it does not require changing Microkernel source.

Required implementation shape is conceptually:

```text
Microkernel
  -> stable port / exact contract
  -> assembly-selected exact implementation identity
  -> external implementation
```

not:

```text
Microkernel
  -> import concrete Workflow/Tool/host implementation
```

Exact TypeScript interface names, registry layout and package paths remain L3 details. This overlay freezes the direction and authority boundary, not a premature SPI syntax.

## 7. Wave 3 mandatory boundary constraints

Every materialized/rebound Wave 3 Task Pack MUST include:

```text
MICROKERNEL_BOUNDARY_CLASS=<class>
ALLOWED_INWARD_DEPENDENCIES=<exact modules/symbols>
FORBIDDEN_OUTWARD_DEPENDENCIES=<implementation families/modules>
PLUGIN_SEAM_CONSUMED_OR_PRODUCED=<seam/evidence>
CORE_SOURCE_CHANGE_EXPECTED=YES|NO
```

### T002B — sealed Runtime Assembly

```text
MICROKERNEL_BOUNDARY_CLASS=MICROKERNEL
CORE_SOURCE_CHANGE_EXPECTED=YES
```

Requirements:
- consume exact Kind/Tool/capability/resource implementation **descriptors/evidence through ports/data**;
- do not import Workflow/XState, Standard Component implementations, concrete Tool implementations or host resource providers;
- assembly identity may pin exact external implementation identities without absorbing their semantics;
- consume #568 logical-resource identity disposition and #575 trusted Kind-validator provenance closure.

### T003C — Tool implementation binding

```text
MICROKERNEL_BOUNDARY_CLASS=MICROKERNEL
CORE_SOURCE_CHANGE_EXPECTED=YES
```

Requirements:
- bind an already Definition-selected Tool Component to one exact compatible implementation;
- implementation candidates are injected/registered through a generic port or assembly input;
- no concrete Tool implementation imports or provider-specific branches;
- cannot change semantic provider choice;
- consume #567/#572 accepted provider-selection evidence.

### T003D — Domain/host capability plane collision

```text
MICROKERNEL_BOUNDARY_CLASS=MICROKERNEL
CORE_SOURCE_CHANGE_EXPECTED=YES
```

Requirements:
- operate on exact plane/evidence identities only;
- do not import concrete host providers or Domain Tool implementations;
- intentional crossing requires admitted Definition semantics, never host preference/order.

### T005B — Runtime Resource injection/resolution

```text
MICROKERNEL_BOUNDARY_CLASS=HOST_INTEGRATION
CORE_SOURCE_CHANGE_EXPECTED=NO
```

Requirements:
- materialize live values through a host ResourceProvider/Resolver seam;
- secrets/live handles never become Component/Definition semantic material;
- if a missing generic kernel port is discovered, STOP and create a bounded KERNEL_PORT concern rather than putting provider logic in the kernel;
- consume #578 descriptor-safe input boundary.

### T008A — Raw -> Component Graph adapter

```text
MICROKERNEL_BOUNDARY_CLASS=COMPATIBILITY
CORE_SOURCE_CHANGE_EXPECTED=NO
```

Requirements:
- depend only on stable successor contracts/ports;
- no Microkernel source edits to accommodate legacy shape;
- inability to translate is `NOT_TRANSLATABLE`, not a reason to weaken kernel contracts.

### T007A — Workflow adapter (still pending from Wave 2)

```text
MICROKERNEL_BOUNDARY_CLASS=ADAPTER
CORE_SOURCE_CHANGE_EXPECTED=NO
```

Requirements:
- Workflow registers/supplies an exact Kind implementation/validator through the generic seam;
- XState/private engine types remain adapter-private;
- no Workflow branch in generic Component admission/Assembly code;
- consume #556/#575 trusted admission provenance.

## 8. Standard Component self-bootstrap constraint

T006 is a falsification of the Microkernel boundary, not permission to add privileged standard paths.

Required direction:

```text
irreducible Microkernel
  -> generic ports
  -> seal exact Assembly
  -> admit/bootstrap Standard Component descriptors through the same Component path
  -> admit application Definitions through that same path
```

Forbidden:

```text
if standardComponent then bypass admission
hard-coded Workflow/Rule/Tool standard registry inside kernel
standard provider wins by default/order
```

## 9. Pluggability invariants — reuse existing gates, no gate explosion

No new mandatory execution-node family is created. Existing task validation/reference gates must collect these proofs when prerequisites become available.

### MB1 — new Semantic Kind

```text
Add/register one test Semantic Kind implementation.
MICROKERNEL_SOURCE_DIFF=0
ADMISSION_THROUGH_GENERIC_KIND_SEAM=PASS
```

Evidence home: T007A/T006B local validation and E1/E7 as applicable.

### MB2 — new/replaced Tool implementation

```text
Add or replace one compatible Tool implementation.
MICROKERNEL_SOURCE_DIFF=0
ASSEMBLY_BINDING_CHANGES=YES
DEFINITION_SEMANTIC_PROVIDER_UNCHANGED=YES
```

Evidence home: T003C local validation + E2/E3/E10.

### MB3 — Workflow engine replacement

```text
Replace/mock the Workflow engine behind its adapter.
MICROKERNEL_SOURCE_DIFF=0
WORKFLOW_ADAPTER_OR_BINDING_DIFF=YES
ONE_RUNTIME_AUTHORITY_PRESERVED=YES
```

Evidence home: T007B/C + E6.

### MB4 — dependency direction

Static/source inspection must prove Microkernel production modules have no imports from concrete:

```text
Workflow/XState
Agent/UX
AI/provider
HTTP/search/document/storage
Standard Component implementations
legacy/compiler adapters
```

Evidence home: task-local validation for T002B/T003C/T005B/T007A, aggregated at E7/E10/final SDK closure.

## 10. Failure handling

If an external/pluggable task appears to require Microkernel source edits:

1. do not make the edit for convenience;
2. classify the missing need as either an actually missing generic `KERNEL_PORT` or a concrete implementation concern;
3. if a generic port is truly required by frozen L2, materialize one bounded port concern and rebind the dependent task;
4. if the need is implementation-specific, keep it outside the kernel;
5. reopen L2 only if reference evidence proves the existing H8 boundary cannot express required authority safely.

```text
DEFAULT_ON_BOUNDARY_AMBIGUITY=FAIL_CLOSED_AND_ESCALATE
PRODUCT_REOPEN=NO_BY_DEFAULT
L2_REOPEN=ONLY_ON_ACTUAL_ARCHITECTURE_CONTRADICTION
```

## 11. Controller / Task Context integration

For #537 scheduling after this overlay is accepted:

```text
EXECUTION_DAG=R1 #534 + R2 #580
WAVE3_TASK_CONTEXT_PACK=R1 context pack + MICROKERNEL_BOUNDARY fields
R1_DEPENDENCIES_PRESERVED=YES
JIT_MATERIALIZATION=YES
```

Every new L3/Task Pack from Wave 3 onward must state its boundary class before Builder dispatch. Existing in-flight repair lanes are not restarted merely to add classification; successor/rebound tasks consume it when they next materialize.

## 12. Acceptance

```text
MICROKERNEL_BOUNDARY_EXPLICIT=YES
KERNEL_PORTS_DISTINCT_FROM_IMPLEMENTATIONS=YES
STANDARD_COMPONENTS_OUTSIDE_KERNEL=YES
WORKFLOW_AGENT_UX_OUTSIDE_KERNEL=YES
HOST_RESOURCE_IMPLEMENTATION_OUTSIDE_KERNEL=YES
LEGACY_COMPATIBILITY_OUTSIDE_KERNEL=YES
R1_DEPENDENCY_EDGES_CHANGED=NO
PRODUCT_CHANGE=NO
L2_CHANGE=NO
NEW_MANDATORY_GATE_COUNT=0
PLUGGABILITY_PROOFS_REUSE_EXISTING_GATES=YES
WAVE3_CONTEXT_FIELDS_REQUIRED=YES
```

## Terminal

```text
V0_7_TASK_DAG_R2_MICROKERNEL_BOUNDARY
PARENT_R1=#534
OVERLAY_ISSUE=#580
CONTROLLER=#537
BASE=cc0a6dd2e42a02d48f6cd1cf9bbb5ce5f6f0ce04
CLASSIFICATION=T001A-T008E+E1-E11
MICROKERNEL_IMPORT_DIRECTION=INWARD_ONLY
STANDARD_COMPONENT_PRIVILEGED_PATH=FORBIDDEN
EXTERNAL_PLUGIN_CORE_EDIT_DEFAULT=FORBIDDEN
MB1_MB4=REUSE_EXISTING_VALIDATION_GATES
PRODUCT_CHANGE=NO
L2_CHANGE=NO
NEXT=FRESH_PLANNING_REVIEW_AND_CONTROLLER_REBIND
```
