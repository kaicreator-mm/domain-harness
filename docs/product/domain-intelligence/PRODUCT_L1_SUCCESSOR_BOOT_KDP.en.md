# DomainHarness Successor Product/L1 Amendment — Boot / KDP Primary Authority

Status: SUCCESSOR_PRODUCT_L1_CANDIDATE / NOT_FROZEN
Scope: post-v0.10.3 in-development successor architecture
Parent frozen Product/L1: #1477 @ b8135aa801eb38fcae2fa1fce3bada541178d5b9
Related candidate: #1480
Blocking reconciliation: #1484

## 1. Purpose and authority

This document is a successor Product/L1 amendment candidate. It resolves the proposed responsibility boundary between the minimal application bootstrap (Boot) and the post-bootstrap Kernel/Package authority (KDP Primary).

It does **not** rewrite, invalidate, or retroactively reinterpret the frozen v0.7 Product/L1 artifact at `b8135aa801eb38fcae2fa1fce3bada541178d5b9`. The historical v0.7 release artifacts remain immutable.

Until a formal successor Product/L1 checkpoint accepts this amendment, the frozen #1477 baseline remains the only frozen Product/L1 authority. #1480 is the recorded successor direction and input to this amendment, not by itself a frozen authority. Downstream standards MUST NOT silently substitute this candidate for the frozen baseline.

If accepted, this amendment governs the in-development successor architecture only. It does not assign a successor SDK version, define SDK ABI, authorize source implementation, or authorize release/deployment.

## 2. Product invariants preserved

The successor architecture preserves the product intent and externally meaningful invariants:

1. Domain Intelligence is the product objective and quality subject; Domain Package is its selected, versioned carrier/materialization, not intelligence itself.
2. Domain App remains the composition of DomainHarness, Domain Definition and UX.
3. Domain Definition remains an abstract domain behavior/component graph. Existing Semantic and Tool Component families and stable Capability contracts are not replaced by a third family.
4. The six Domain Data asset classes remain Authority; Executable Harness; Knowledge/Reference; Pattern/Recipe; Example/Counterexample; Validation/Evidence.
5. Domain-specific knowledge, rules, state models, guards, workflows and solving semantics belong to Business Domain Packages, not the generic Kernel.
6. Preserve the v0.3 resolver precedence: deterministic compiled Domain Intelligence → exact semantic-result reuse → applicable promoted reusable subworkflow → bounded HarnessMachine/LLM fallback.
7. Preserve one authoritative post-bootstrap Domain Runtime/Kernel for state transitions, durable outcomes and Effects. Agent/LLM/UX/Tool proposals do not acquire authority.
8. Preserve fail-closed behavior for unknown or incompatible required semantics, explicit Effect admission, durable outcomes, Journal, replay/recovery correctness and Host-controlled physical operations.

These are behavioral/product invariants. They do not require retaining the former Microkernel's source layout or internal module boundary.

## 3. Successor entry and authority model

The successor Domain App entry is **Boot + `domain-app.yaml`**.

### 3.1 Boot — minimal pre-KDP bootstrap only

Boot is a small bootstrap program outside the Domain Package Tree. Its responsibilities are limited to:

- initialize the minimum target/runtime environment needed to load KDP Primary;
- read only the bootstrap locator and exact KDP Primary identity/pin from `domain-app.yaml` or its generated bootstrap record;
- verify the minimum integrity and pin information required before executing KDP Primary;
- load KDP Primary and invoke its one fixed startup entry;
- hand over control and the complete application descriptor to KDP Primary.

Boot MUST NOT resolve the full Package DAG, load SDK/Business/Extension Packages, bind Package Hooks, run domain Workflows, own Domain state or Effects, or coordinate Package initialization/disposal.

### 3.2 KDP Primary — the single post-bootstrap Kernel and Package authority

KDP Primary is the root Package of the Domain App's Kernel layer. It contains two internal responsibility groups. They are not peer Runtimes or independent authorities.

**A. Kernel Core**

Kernel Core owns the irreducible generic post-bootstrap runtime authority, including:

- Package/Runtime identity and integrity checks required for admission;
- execution admission and dispatch;
- the single authoritative Domain Runtime and generic state-transition mechanism;
- Effect authorization/admission and durable outcome recording;
- Journal, replay, interruption handling and recovery semantics;
- the trusted boundary through which Host adapters execute physical operations.

Kernel Core owns generic execution mechanisms. It does not own Business-specific state models, events, guards, rules, workflow semantics or domain decisions.

**B. Package System**

The KDP-owned Package System owns:

- reading the complete `domain-app.yaml` and generated exact Package lock;
- selecting and resolving the declared Package roots and typed dependency DAG;
- validating Package identity, version, target and artifact pins;
- loading the selected KDP Extensions, SDK Packages and Business Packages;
- resolving and binding declared Package Hooks;
- coordinating Package lifecycle initialization and disposal;
- producing the deterministic selected Package composition consumed by the one Domain Runtime.

The Package System is an internal subsystem of KDP Primary. It MUST NOT create a second Runtime, Scheduler, Journal, state-transition authority or Effect authority. Package selection/composition is not business Workflow execution.

### 3.3 KDP Primary independent bootstrap

KDP Primary MUST be independently bootstrappable. Its initial Kernel Core and Package System startup MUST NOT depend on SDK Primary, Business Primary, KDP Extension Packages or any Package that is not yet loaded. Optional KDP Extensions may contribute capabilities only after KDP Primary has established its core authority.

## 4. Package, Component, Hook and Host boundaries

- **SDK Packages** provide reusable standard Semantic/Tool Components and capabilities. They are loaded by KDP and are not required to bootstrap KDP Primary.
- **Business Packages** own domain-specific concepts, facts, rules, state models, guards, events, Procedures, Workflows, Pipelines and outcome semantics.
- **Components and Capability Contracts** retain their existing Product meaning. A Package can provide or bind an implementation, but Package membership does not itself grant invocation or Effect authority.
- **Package Hooks** remain optional extension contracts. KDP resolves compatibility and binds the selected implementation. The Hook Owner defines invocation, ordering/parallelism, aggregation, validation and result selection. No global Hook Dispatcher is introduced.
- **Host adapters** perform physical filesystem, network, database, process and device operations. KDP/Kernel Core retains admission, authorization and durable recording; a Host adapter does not grant itself permission or become a second Runtime.
- **LLM/Agent/UX** may interpret, propose or request bounded work. They cannot bypass KDP/Kernel admission, mutate authoritative state, authorize Effects, promote Intelligence or silently replace active Package pins.

## 5. Former Microkernel responsibility migration and compatibility

For the in-development successor, the former Microkernel is **not** retained as a separate architecture layer, Package, process, Runtime or independently managed subsystem. Its generic responsibilities are reorganized inside KDP Primary's Kernel Core and Package System according to the boundaries in §3.

Backward compatibility is **not required** for the former Microkernel's internal modules, source layout, Package layout, startup sequence, internal ABI or Runtime composition. This is an architecture-development decision, not permission to modify historical v0.7 release artifacts.

This amendment does not change a public SDK ABI or authorize an ABI migration. Any public ABI, Manifest/BUILD, Host, Hook, Runtime or SDK source change requires its own Product/L2 authority, exact write set, implementation authorization and validation. The successor SDK version remains UNASSIGNED until separately decided.

## 6. Lifecycle and authority flow

```text
Domain App descriptor + bootstrap pin
  -> Boot initializes minimum environment
  -> Boot verifies and loads KDP Primary
  -> Boot invokes fixed KDP entry and hands over descriptor
  -> KDP Kernel Core establishes the single Runtime/Kernel authority
  -> KDP Package System resolves exact Package DAG and binds Hooks
  -> selected SDK and Business Packages become available to the Runtime
  -> Business Workflow/Graph executes through the one Runtime
  -> Kernel Core admits/records Effects; Host adapters perform physical operations
  -> terminal outcome, Journal and evidence remain inspectable/recoverable
```

The Package System selects and composes Packages; the Kernel Core authorizes and executes the generic runtime transitions; Business Packages define domain semantics; Host adapters perform physical operations. No layer duplicates another layer's authority.

## 7. Reviewable successor consistency checklist and adoption gates

Before this amendment is accepted as successor Product/L1 authority:

1. English/Chinese amendment text must be materially equivalent.
2. A fresh independent Exact-SHA Product/L1 review must bind the exact commit/tree and report P0=0/P1=0.
3. A formal successor Product/L1 checkpoint must record the exact source commit/tree, its relationship to frozen #1477, and the precise successor scope.
4. DIS #1481 must bind its normative authority statements to that accepted checkpoint before replacing its current frozen-v0.7 wording.
5. Every row in the following reviewable checklist must PASS. The reviewer must also reject the stated prohibited interpretation, not merely confirm that the preferred term appears.
6. The checkpoint must continue to prohibit unapproved SDK ABI/source changes, release, tag and deployment.

| Check | Required successor interpretation | Prohibited interpretation |
|---|---|---|
| Authority lineage | Frozen #1477/v0.7 remains immutable; this amendment applies only after its own successor checkpoint | Silently rewriting v0.7 or treating #1480 / this candidate as already frozen |
| Boot boundary | Boot initializes the minimum environment, verifies the exact KDP Primary pin, invokes one fixed entry and hands over the descriptor | Boot resolves the Package DAG, loads SDK/Business Packages, binds Hooks, runs Workflows, or owns state/Effects |
| Kernel Core | One post-bootstrap Kernel Core owns the single Runtime, admission/dispatch, generic state transitions, Effect authority, durable outcomes, Journal and replay/recovery | A second Runtime, state authority, Journal or Effect authority |
| Package System | KDP-owned Package System resolves exact Package roots/DAG, validates pins/targets, loads Packages, binds Hooks and coordinates Package lifecycle | Package Manager acting as a second Runtime/Scheduler or executing business Workflow semantics |
| KDP self-bootstrap | KDP Primary can initialize Kernel Core and Package System without SDK, Business or KDP Extension Packages | KDP bootstrap depending on Packages that have not yet been loaded |
| Host boundary | Trusted Host adapters perform physical operations after KDP/Kernel admission and authorization | Host self-authorizing Effects or a Business/LLM path bypassing KDP |
| Business boundary | Business Packages own domain-specific state models, rules, guards, events, Workflows and outcomes | Moving domain-specific semantics into generic Kernel Core |
| Hook boundary | KDP resolves and binds declared Hooks; Hook Owner invokes and selects results | A global Hook Dispatcher or ambient Hook execution authority |
| Agent/LLM/UX boundary | Agent/LLM/UX may interpret or propose bounded work only | Bypassing admission, mutating authoritative state, authorizing Effects or promoting/re-pinning intelligence |
| Microkernel successor status | Former Microkernel responsibilities are reorganized inside KDP; old internal implementation compatibility is not required | Retaining the former Microkernel as a separate required successor layer, Package, process or Runtime |

The reviewer must confirm the same ten checks against both language versions. A terminology match without matching authority semantics is a failure.

Until the checkpoint exists, this file remains a candidate and does not supersede #1477.

## 8. Explicit non-goals

This amendment does not define concrete ABI shapes, file formats, startup API signatures, Package Manifest/Lock schemas, BUILD implementation, Host adapter implementation, migration code, SDK version assignment, Runtime adoption proof, or release plan. Those belong to subsequent L2/implementation work after the relevant authority and write sets are established.
