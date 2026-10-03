# DomainHarness v0.7 — L2 Architecture Repair R1

Status: **SUCCESSOR L2 REPAIR OVERLAY — NOT FROZEN**  
Repair issue: `#524`  
Prior Fresh Architecture Review: `#522` — `CHANGES_REQUESTED`  
Base L2 candidate: `docs/architecture/DomainHarness_v0.7_L2_ARCHITECTURE_EVIDENCE_REVIEW_CANDIDATE.md`  
Base candidate blob: `5bfdfaef999d24444b2c1d3fe2978477faf737e0`  
Product Freeze: `#517`  
Frozen PRD blob: `e72c789c9528b4c7fac005e4a415720ab88873ac`

## 0. Authority and precedence

This file is a bounded successor overlay for the exact findings in `#522`. It does not replace the reviewed L2 candidate wholesale.

The next review subject is:

```text
DomainHarness_v0.7_L2_ARCHITECTURE_EVIDENCE_REVIEW_CANDIDATE.md
+
DomainHarness_v0.7_L2_ARCHITECTURE_REPAIR_R1.md
```

For a conflict, this repair overlay has precedence **only** for the sections and rules it explicitly amends below. All unrelated A1–A12 decisions and `#513` H1–H15 dispositions remain unchanged.

```text
PRODUCT_SCOPE_CHANGED=NO
PRODUCT_CONTRADICTION=NO
NEW_RUNTIME_AUTHORITY=NO
L2_FREEZE=NO
TASK_DAG=BLOCKED
IMPLEMENTATION=BLOCKED
```

## 1. #522 finding closure map

| Finding | Repair section | Posture |
|---|---|---|
| P1-1 Product R1 / R1–R5 traceability missing | §8, §9, §11 | FIXED |
| P1-2 Definition provider resolution vs assembly binding conflated | §3 | FIXED |
| P1-3 Assembly Snapshot not connected to existing pin chain | §4 | FIXED |
| P1-4 generic Tool invocation lacks occurrence/admission anchor | §5 | FIXED |
| P1-5 Component digest / must-understand enforcement incomplete | §2 | FIXED |
| P2-1 L2 Freeze vs final SDK/L2 closure undefined | §10 | FIXED |
| P2-2 Product invariant traceability missing | §9 | FIXED |
| P2-3 migration public commitments / harness-config / promoted-subworkflow | §7 | FIXED |
| P2-4 v0.6 baseline not accounted for | §7.4 | FIXED |
| P2-5 outcome-unknown/reconciliation layer omitted | §5.4, §8 | FIXED |
| P2-6 KindRef compatibility rule unstated | §2.4, §4.4 | FIXED |
| P2-7 Standard Component reference identity undefined | §6 | FIXED |
| P2-8 simulation/production separation not enforced | §4.5, §8 | FIXED |
| P3-1 H8 per-item Microkernel answers missing | §5.5 | FIXED |
| P3-2 remaining H4/H5/H9/H11 subquestions not disposed | §11 | FIXED |
| P3-3 status/plane wording inconsistencies | §6, §12 | FIXED |

## 2. A1 amendment — Component identity, graph identity and must-understand semantics

This section amends base A1.

### 2.1 Component content digest coverage

v0.7 introduces a **new versioned/domain-separated Component identity domain**. It MUST NOT reuse the legacy `CompiledArtifactIdentity` canonicalization in a way that changes historical artifact identity.

The canonical Component content digest includes exactly the behaviorally material local Component fields:

```text
IN_COMPONENT_CONTENT_DIGEST
- ComponentFamily                 # SEMANTIC | TOOL
- exact KindRef                   # versioned semantic contract identity
- requiredSemanticContracts       # required Profile/Facet/extension semantics
- requiredCapabilities            # behaviorally required CapabilityIds
- semanticBody                    # complete material local semantic body
```

The canonical Component content digest excludes:

```text
OUTSIDE_COMPONENT_CONTENT_DIGEST_BY_DEFAULT
- graph relations
- explicitly non-material extensions
- provenance / audit metadata
- human lifecycle labels
- display labels
- concrete implementation/provider identity
- Runtime occurrence/state/effect identity
```

A field may move from the excluded class into required semantics only through an explicit versioned semantic contract change. A Runtime cannot decide after the fact that unknown material was non-material merely because it lacked a handler.

### 2.2 Definition graph digest

Relations are behaviorally relevant but are included **once** at the Domain Definition graph level rather than recursively inside every Component digest.

Conceptually:

```text
DefinitionGraphDigest = digest(
  definition identity/version domain,
  sorted exact Component content digests,
  normalized typed exact relations
)
```

The exact serialization/canonicalization API remains L3, but the architecture rule is fixed:

- changing a behaviorally material Component body changes that Component digest and the Definition graph digest;
- changing a typed relation changes the Definition graph digest;
- changing provenance/non-material extension material does not change semantic identity unless that material is promoted into a required semantic contract;
- no mutable alias such as `latest/current/active` is allowed in an authority-bearing relation.

### 2.3 Must-understand enforcement point

Must-understand enforcement happens at **Definition admission**, before affected execution/effect authority.

For every required Component:

1. resolve the exact `KindRef` compatibility decision deterministically;
2. resolve every `requiredSemanticContract` and required Capability contract;
3. invoke the exact admitted Kind implementation's closed-world validator for that KindRef version over the complete behaviorally material `semanticBody`;
4. reject unknown/unsupported material unless it is explicitly carried in the non-material extension channel and is structurally incapable of changing Product §3.1 meaning, legality, authority, transition selection, Tool admission, effect semantics, durability or recovery;
5. only after the whole affected graph slice passes may runtime/effect admission proceed.

This does not freeze a TypeScript SPI, parser implementation or error enum. It freezes the authority location and fail-closed behavior.

### 2.4 KindRef compatibility rule

L2 does not freeze whether a compatible KindRef relation uses exact-version or bounded major-compatible matching internally. It does freeze these constraints:

```text
KIND_COMPATIBILITY
- deterministic
- no implicit latest/default/order winner
- no mutable range resolution at an active authority boundary
- explicit compatibility decision
- exact chosen KindImplementation pin recorded in the assembly/activation authority
- incompatible or unknown required KindRef fails closed
```

The reference suite must include a compatible case and a version mismatch case that fails before affected execution.

## 3. A4 amendment — Capability resolution is three separate operations

Base A4 is narrowed. `CapabilityId` remains one stable contract identity mechanism, but semantic provider choice and implementation binding are different authority decisions.

### 3.1 Definition-provider resolution

Definition-provider resolution answers:

> Which Domain Tool Component semantically satisfies a Domain Component's required capability?

Rules:

- zero compatible Domain providers for a required Domain capability -> fail closed;
- exactly one compatible Domain provider -> select that exact Tool Component identity;
- multiple compatible Domain providers -> **only the admitted Domain Definition itself** may supply deterministic selection/fallback semantics;
- assembly order, registry order, host preference, provider convenience or `latest/default` MUST NOT choose among Domain providers;
- if the Definition does not disambiguate multiple Domain providers, admission fails closed.

The selected Domain provider is part of admitted Definition/composition semantics and therefore participates in Definition graph identity through exact relations/selection semantics.

### 3.2 Assembly implementation binding

After the Domain provider is semantically selected, assembly binding answers:

> Which exact implementation satisfies this already-selected Tool Component or host capability?

Rules:

- each selected Tool Component executable contract binds to exactly one admitted compatible Tool implementation for an activation;
- each required host capability binds to exactly one admitted compatible host implementation/binding for an activation;
- assembly binding MUST NOT change which Domain Tool Component was selected by Definition semantics;
- implementation/binding identity is pinned on the assembly/activation plane, not silently injected into Domain semantic identity;
- incompatible or ambiguous implementation binding fails closed.

### 3.3 Domain capability vs host capability plane

A `CapabilityId` may name a contract on either the Domain provider plane or the host/runtime capability plane, but one admitted assembly cannot resolve the same required use ambiguously across both planes.

```text
SAME_CAPABILITY_ID_DOMAIN_AND_HOST_PROVISION
= FAIL_CLOSED
```

unless explicit admitted Definition semantics identify the cross-plane relation and make the meaning deterministic. There is no implicit preference for Domain, host, local, remote or first-registered provider.

### 3.4 Capability pinning

The activation authority records:

- exact capability contract identities used;
- exact selected Domain Tool Component identity where applicable;
- exact implementation/binding pins used to satisfy the selected Tool/host contract;
- the compatibility decision basis required for replay/currentness.

Replay never re-runs provider choice against a changed registry/environment.

## 4. A2/A6/A9/A11 amendment — Assembly identity must extend the existing atomic pin chain, not compete with it

### 4.1 Existing authority remains primary

Current source already has exact package/binding and activation authorities. In particular:

- target compiled Tool execution binding material and binding digests participate in target package identity;
- `DomainActivationBinding` / `GovernanceExecutionPin` are atomic exact execution authority tuples and explicitly prohibit field-wise torn authority;
- `ApplicationSelectionRef != RuntimeBindingRef != RuntimeActivationRef` remains the composition/binding/technical-activation evidence separation.

v0.7 MUST reuse/generalize these authorities. `Assembly Snapshot` is not a new parallel execution authority.

### 4.2 Content-addressed Runtime Assembly record

The conceptual v0.7 Runtime Assembly is a content-addressed immutable record whose digest covers the exact behaviorally relevant assembly choices not already contained in target package identity, including at least:

```text
RuntimeAssemblyRecord
- exact KindRef -> KindImplementation pins
- exact capability implementation/binding resolution not already represented by packageId
- exact Standard Component implementation/descriptors required by the activation
- target/runtime compatibility decision material
- authorityClass = PRODUCTION | SIMULATION
```

Tool binding material already covered by the exact target compiled `packageId` is not redundantly allowed to become an independent competing authority. The Runtime Assembly may reference such package-contained pins; it does not create a second truth for them.

### 4.3 Atomic activation rule

The exact `RuntimeAssemblyRecord` digest MUST be referenced atomically by the existing activation/execution authority tuple, either by an exact successor extension of `DomainActivationBinding` / `GovernanceExecutionPin` or by an exact content-addressed reference that is itself a field of that same atomic tuple.

Normative rule:

```text
AuthoritativeOccurrencePin
= exact packageId
+ exact assemblyDigest
+ exact governance/currentness authority
+ exact occurrence identity
```

No side record may independently update package or assembly authority for an already active occurrence. Any mismatch is terminal and fail-closed.

### 4.4 Relation to RuntimeImplementationRef / RuntimeBindingRef / RuntimeActivationRef

These roles remain distinct:

```text
RuntimeImplementationRef
  identifies the concrete runtime implementation environment used by compatibility validation

RuntimeBindingRef
  identifies evidence that an already-selected compatible composition was bound

RuntimeActivationRef
  identifies a concrete technical activation under that binding

assemblyDigest in the atomic execution pin
  identifies the exact admitted Kind/Tool/capability implementation set used by authoritative execution/replay
```

They correlate but are not aliases. Runtime binding/activation evidence MUST resolve to the same package + assembly authority consumed by the per-occurrence execution pin. A future L3 representation may thread `assemblyDigest` through existing validation/binding evidence, but MUST NOT mint a second independently mutable pin hierarchy.

### 4.5 Simulation vs production authority class

The Runtime Assembly authority class is mandatory:

```text
PRODUCTION
SIMULATION
```

A simulation assembly may share the semantic Definition graph digest with production while using compatible fake implementations. It MUST NOT:

- be published into production activation authority;
- satisfy a production occurrence pin;
- write to production durable effect/journal authority;
- be accepted as production binding/currentness evidence.

Any cross-class attempt fails closed before effect execution.

## 5. A5/A7 amendment — Tool invocation must have an admitted occurrence anchor

### 5.1 Bounded v0.7 occurrence rule

v0.7 does **not** introduce a generic new durable journal key solely to make Tool calling look uniform.

Every effectful Tool invocation must be anchored to an admitted authoritative Domain occurrence and execute through the existing Central Admission/durable effect authority.

Current shipped anchor:

```text
WorkflowAddress
+ workflowInstanceId / GovernanceExecutionPin
+ Durable Control Turn / effect ordinal
```

A future non-Workflow Semantic Kind may motivate a generalized occurrence key, but that is not assumed by v0.7 L2. It would require reference evidence and a bounded L2 amendment rather than an ad-hoc second admission path.

### 5.2 UX and Agent requests

UX or Agent intent does not directly invoke mutation/effect authority.

```text
UX / Agent intent
  -> admitted Domain request/message/semantic operation
  -> authoritative Semantic occurrence
  -> Central Admission
  -> durable effect journal / Tool implementation
```

An effectful Tool request with no admitted authoritative occurrence is rejected before any external effect.

### 5.3 Non-effectful Tool execution

`effect='none'` Tool execution may avoid durable effect journaling, but only inside an admitted invocation/exposure context with input/output/schema/capability checks. Its returned value remains data/proposal/query result; it does not become transition or business truth by itself.

### 5.4 Existing Harness Agent seam mapping

Current `HarnessCapabilityBinding.kind` already distinguishes:

```text
query
mutation
```

and Harness execution refuses mutation capability use.

v0.7 mapping:

- `query` -> Agent-visible non-effectful/read-query Tool exposure (`effect='none'` or an equivalently non-mutating admitted Tool contract);
- `mutation` -> MUST NOT be exposed/executed through the Harness model-query seam;
- mutation-capable/effectful Agent Tool intent must be converted into an admitted Domain operation and travel through Central Admission/durable effect authority.

This reuses the existing fail-closed Agent boundary rather than creating a second Agent Tool authority vocabulary.

### 5.5 H8 Microkernel admission-test answers

| Candidate concern | Can be expressed as Component/Tool? | Kernel disposition / reason |
|---|---:|---|
| Definition/Component canonical identity + integrity | NO | IN KERNEL: needed before any Component can be trusted/admitted. |
| required-semantics compatibility/admission | NO | IN KERNEL: constitutional gate that decides whether Component semantics may execute. |
| sealed assembly/currentness validation | NO | IN KERNEL foundation: prevents implementation drift/torn activation; specific Kind semantics stay outside. |
| Kind/Component dispatch foundation | NO | IN KERNEL minimal indirection only; Kind interpretation remains outside. |
| dependency/relation/capability resolution foundation | PARTIAL | IN KERNEL only for deterministic graph/admission mechanics; domain-specific selection policy stays in Definition/Components. |
| runtime occurrence identity | NO | IN KERNEL: authority/replay anchor. |
| transition/admission authority | NO | IN KERNEL authority boundary. |
| durable effect/outcome authority | NO | IN KERNEL authority/durability boundary. |
| replay/recovery invariants | NO | IN KERNEL constitutional behavior. |
| exact implementation/binding pins | NO | IN KERNEL validation/authority reference; implementation semantics remain outside. |
| observation/evidence for authority/currentness | NO | IN KERNEL only for evidence needed to prove authoritative decisions/currentness; optional general observation stream remains outside. |
| Workflow/Rule/Skill/Projection semantics | YES | OUTSIDE KERNEL as Standard/application semantic implementations. |
| XState / AI / HTTP / search / document / storage adapters | YES | OUTSIDE KERNEL as private/provider/Tool implementation. |
| domain-specific operations / Agent behavior / UX rendering | YES | OUTSIDE KERNEL. |

## 6. A8 amendment — Standard Component identity and plane wording

Standard Component **descriptors are Definition-plane Component material**. The DomainHarness **Standard Component Set** is the SDK's assembly-time selection/composition of those descriptors plus their exact implementations.

Default application reference rule:

- application Definitions refer to standard semantic contracts through exact `KindRef`, Capability contract and other required semantic contract identities;
- they do **not** implicitly embed the bundled Standard Component descriptor digest merely because the SDK provides it;
- the exact Standard Component descriptor/implementation selected by the SDK is pinned on the Runtime Assembly/activation plane;
- if an application explicitly embeds or exact-references a Standard Component as part of its own Domain semantic graph, then that exact Component reference participates in application Definition identity.

Therefore an SDK Standard Set upgrade normally changes assembly/activation identity, not application Definition identity, unless the application made the upgraded descriptor itself semantic content.

`SDK_SELF_BOOTSTRAP` posture remains:

```text
RESOLVED_AT_ARCHITECTURE_REFERENCE_PROOF_REQUIRED
```

not unqualified `RESOLVED`.

## 7. A10 amendment — legacy/public migration and v0.6 currentness

### 7.1 Additive open Kind surface

The public legacy closed artifact union is not replaced in place.

```text
COMPILED_ARTIFACT_KINDS / CompiledArtifactKind
= retained legacy public compatibility surface

v0.7 open KindRef Component model
= additive/versioned public surface
```

Historical exhaustive consumers keep their historical meaning. New authoring/Component APIs must not retroactively widen a legacy union in a way that changes old compile-time/runtime contracts.

### 7.2 Compiler-root public commitments requiring compatibility lanes

At minimum the migration plan treats these as real public commitments, not accidental private structs:

- `LoadedRawDomainPackage` including `schemaVersion: '0.1'`;
- `RawToolDefinition`;
- `RawProjectionDefinition` / `RawProjectionDependency`;
- `LogicalToolBindingConfig`;
- existing `compileDomainPackage` public input/output path;
- `TargetHostProfile.bindings` 1:1 capability-to-binding semantics;
- existing public script translation/bundling compatibility paths.

Each receives one of `RETAIN`, `DEPRECATE_WITH_VERSIONED_ADAPTER`, or `HISTORICAL_PROFILE_ONLY` during implementation planning. No export silently disappears.

### 7.3 Legacy-to-Component correspondence evidence

A lossless adapter produces an evidence-visible correspondence record conceptually equivalent to:

```text
LegacyComponentCorrespondence
- historical source/profile identity
- exact historical package/artifact identity where applicable
- exact resulting v0.7 Component identity / Definition graph identity
- adapter/version identity
- result = LOSSLESS | NOT_TRANSLATABLE
```

This record is correlation evidence only. It never rewrites or aliases the historical identity into the new identity.

Migration default corrections:

```text
harness-config
  -> behaviorally material / semantic-or-authority material by default
     until reference evidence proves an explicit subset non-material

promoted-subworkflow
  -> Workflow semantic relation + promotion/provenance
     AND preserve DecisionResolver-source authority role
```

### 7.4 v0.6 baseline/currentness rule

At `#522` review time, `version/v0.7` did **not** descend from the separate `v0.6` integration branch. Therefore this L2 MUST NOT claim absent v0.6 implementation bytes are already present on the v0.7 base.

Before any v0.7 production implementation begins, the controller must establish one exact baseline posture:

```text
V07_IMPLEMENTATION_BASELINE
= released/final v0.6 integrated into v0.7
OR
= explicit v0.6 rebind/replay of the frozen v0.6 contracts onto the chosen successor baseline
```

The current v0.6 frozen invariants to preserve include at minimum:

- semantic-decision declaration/capability material fails closed when unsupported;
- accepted-message logical identity collision hardening;
- processed-command normal state revision progression `N -> N+1` with defensive persistence validation;
- one Runtime/admission/effect authority and optional-model boundaries already frozen by v0.6.

Any actual v0.6 implementation/release SHA used for v0.7 must be pinned by the controller at Task-DAG/implementation baseline time from live GitHub. This overlay does not invent a release SHA before v0.6 is durably closed.

`RAW_MIGRATION` posture remains:

```text
RESOLVED_AT_ARCHITECTURE_REFERENCE_PROOF_REQUIRED
```

## 8. A12 amendment — mandatory reference experiment set and R1–R5 traceability

All experiments continue to use the evidence schema from base A12. This overlay amends E1–E10 and adds E11.

### 8.1 PRD R1–R5 -> experiment traceability

| PRD reference requirement | Experiment(s) | Mandatory negative/rejection | Mandatory limit/output |
|---|---|---|---|
| R1 neutral executable Domain App + UX entry | **E11**, plus E1/E2/E6 | invalid/unauthorized UX request rejected before state/effect authority | does not define complete UX renderer/interaction taxonomy |
| R2 effectful Tool substitution | E3 | incompatible substitute rejected; real external effect absent; simulation cannot enter production authority | does not alone freeze substitution representation |
| R3 Agent Tool projection | E4 | out-of-scope/unauthorized operation rejected; effectful no-occurrence invocation rejected | does not define generic Agent framework |
| R4 existing Workflow path/recovery | E6 | failure/recovery proves no duplicate committed effect; include outcome-unknown case | does not require replacing workflow engine |
| R5 SDK self-bootstrap slice | E7 | unsupported/invalid Standard Component fails common gates | MUST state which Microkernel responsibilities remain irreducible after the slice |

### 8.2 E1 — Generic Semantic Component dispatch / Kind compatibility

Amend E1 negatives:

- unknown KindRef fails closed;
- incompatible required KindRef version fails closed;
- mutable/latest/default compatibility resolution is rejected;
- exact chosen Kind implementation and compatibility decision are visible in the atomic assembly/activation pin.

### 8.3 E2 — Generic Tool invocation with occurrence anchor

Positive:
- admitted Tool call executes through the existing compatible executor/effect seam under an authoritative occurrence.

Negatives:
- missing binding/effect mismatch/unauthorized operation fail closed;
- an effectful Tool invocation from UX/Agent/internal caller with no admitted occurrence is rejected before external effect;
- non-effectful Tool result is not accepted as transition/business truth without normal Domain admission.

### 8.4 E3 — Simulator substitution + authority-class isolation

Positive:
- same semantic Definition graph digest;
- deterministic fake Tool implementation under a different `SIMULATION` assembly digest;
- expected controlled result;
- evidence proves real external effect did not occur.

Negatives:
- incompatible substitute fails;
- simulation activation cannot publish into production activation authority;
- simulation execution cannot write production durable effect/journal authority.

### 8.5 E4 — Agent Tool projection through existing Harness boundary

Positive:
- Agent catalog derives only admitted non-effectful/query operations and uses the generic Tool contract path.

Negatives:
- out-of-scope operation rejected;
- current Harness `mutation` capability remains unadvertised/rejected;
- an effectful Agent Tool intent with no admitted authoritative occurrence fails before effect execution.

### 8.6 E5 — Capability planes

Positive:
- one Definition-selected Domain provider resolves deterministically;
- the selected Tool then binds to one exact compatible implementation.

Negatives:
- zero Domain provider fails;
- multiple Domain providers without Definition selection fail;
- assembly-only attempt to pick among Domain semantic providers fails;
- same CapabilityId ambiguously provided by Domain and host planes fails;
- incompatible major/unknown required capability fails;
- no latest/default/order fallback.

### 8.7 E6 — Workflow + recovery + outcome-unknown

In addition to the base E6 recovery case, exercise a non-idempotent external operation with outcome initially unknown/ambiguous.

Evidence must preserve existing external-authority semantics:

```text
dispatch != commit
local timeout/abandonment != remote non-commit
reconciliation evidence != new effect attempt
a retry is permitted only by admitted idempotency/recovery evidence
```

Recovery must prove no duplicate committed external effect and no second Runtime/effect authority.

### 8.8 E7 — Standard Component self-bootstrap and upgrade identity

E7 additionally records:

- exact application Definition graph digest before/after a Standard Set implementation upgrade;
- exact Runtime Assembly digest before/after that upgrade;
- whether the application explicitly embeds a Standard Component descriptor;
- the list of Microkernel responsibilities that remain irreducible after the slice.

Expected default: Standard Set implementation/descriptor upgrade changes assembly identity, not ordinary application Definition identity, unless the application explicitly made that Standard Component descriptor part of its semantic graph.

### 8.9 E8 — migration compatibility includes v0.6 currentness

E8 must cover:

- representative legacy v0.1/v0.2 Raw/package path;
- current public Raw compiler commitments and versioned correspondence evidence;
- the v0.6 semantic-decision/capability profile and its fail-closed behavior;
- accepted-message identity and revision-hardening preservation where the integrated/rebound v0.6 baseline contains them.

A construct that cannot translate losslessly stays on the exact historical profile path or fails explicitly. It is never silently reinterpreted.

### 8.10 E10 — exact pin-chain replay

E10 verifies replay against the exact authoritative tuple:

```text
packageId
+ assemblyDigest
+ governance/currentness authority
+ occurrence identity
```

and confirms corresponding Runtime binding/activation evidence resolves to the same package + assembly authority. A changed Kind implementation, capability binding or Tool implementation cannot satisfy an existing occurrence pin by alias/current/latest resolution.

### 8.11 E11 — Neutral composed Domain App + UX authoritative journey

**Question:** is `Semantic Components + Tool Components + relations/capability contracts` sufficient for a neutral non-self-referential Domain App whose UX enters through the admitted Domain surface and reaches one authoritative Runtime outcome?

**Positive:**

1. construct a neutral Definition containing at least two semantic relations and one Tool capability relation;
2. admit/activate through one exact package + assembly authority;
3. a small UX request/intent resolves to an admitted Domain request/semantic operation;
4. the authoritative Runtime produces the resulting Domain outcome;
5. UX does not acquire transition/effect authority.

**Negative:** an invalid or unauthorized UX request is rejected before unauthorized state transition or Tool effect execution.

**Limit:** this proves composition sufficiency and one UX entry/admission journey only. It does not freeze renderer technology, complete Domain UX interaction taxonomy or cross-project DAC serialization.

## 9. Frozen Product invariant -> L2 architecture traceability

| Frozen invariant | Architecture disposition |
|---|---|
| I1 Domain App = DomainHarness + Domain Definition + UX | A3/A5/A6/A12; E11 proves neutral composition + UX entry. |
| I2 DomainHarness embedded SDK/runtime | A7/A8; no daemon/service authority added. |
| I3 Domain Definition abstract definition | A1/A9; package/assembly remain representations/execution pins. |
| I4 Domain Definition = Domain Component Graph | A1 + DefinitionGraphDigest rule. |
| I5 Semantic + Tool primary families | A1/A3. |
| I6 Tool general executable module | A3/A5. |
| I7 Agent Tool controlled projection | A5 + Harness query/mutation mapping + E4. |
| I8 Capability requires/provides contract identity | A4 three-plane split; no Capability Component hierarchy. |
| I9 Definition != runtime occurrence/state/effects | A11 + atomic occurrence pin. |
| I10 UX intent is not transition/effect authority | A5 + E11 rejection. |
| I11 one authoritative Runtime/effect authority | A5/A7 + existing Central Admission/effect journal + E6. |
| I12 self-bootstrap = Standard Components through public abstraction | A8 + E7. |
| I13 DAC minimal coordination, not internal ontology owner | Component/Kind/Tool/assembly contracts remain DomainHarness-owned; DAC refs may correlate cross-project lifecycle/compatibility but cannot define or override internal Kind/Component/runtime semantics. |
| I14 freeze ontology, not final taxonomy/SPI/serialization | A1/A2 non-decisions preserved; no final TS SPI/package syntax frozen. |
| I15 reference implementation before final SDK/L2 closure | two-stage gate in §10 + E1–E11. |
| I16 unknown/incompatible required semantics/capability fail closed | A1 must-understand + A4 + E1/E5. |

## 10. Two-stage Stage-2 gate

The term `L2 Freeze` is split into two durable stages so reference evidence cannot become a post-freeze optionality loophole.

### 10.1 L2 Architecture Freeze

After a Fresh Independent Architecture Review passes the exact candidate + repair overlay, the controller may create:

```text
L2_ARCHITECTURE_FREEZE=YES
STATUS=PROVISIONAL_WITH_REFERENCE_GATES
TASK_DAG=AUTHORIZED
FINAL_L2_SDK_CONTRACT_CLOSURE=NO
```

This freezes the architecture decisions strongly enough to plan/build the mandatory reference work. It does **not** claim E1–E11 have proven those assumptions.

`REFERENCE_BEFORE_L2_FREEZE=0` because the experiments are intentionally part of the post-architecture-freeze Task DAG, but their results remain mandatory before final contract closure.

### 10.2 Reference implementation disposition

Every E1–E11 terminal records `SUPPORTED|REFUTED|PARTIAL` and `L2_IMPACT`.

If any experiment returns:

```text
RESULT=REFUTED
OR
RESULT=PARTIAL with L2_IMPACT=L2_REPAIR_REQUIRED
```

then the named architecture sections reopen immediately. A bounded successor L2 repair + Fresh Independent Review is required before affected implementation may be treated as conformant and before final SDK/L2 contract closure.

### 10.3 E -> invalidatable L2 section map

| Experiment | May invalidate/reopen |
|---|---|
| E1 | A1, A2, Kind compatibility/currentness |
| E2 | A3, A5, Tool invocation/effect boundary |
| E3 | A3, A6, A11, simulation/production authority class |
| E4 | A5, Agent exposure/authority mapping |
| E5 | A4, capability plane/resolution rules |
| E6 | A5, A7, recovery/durable effect/external-authority assumptions |
| E7 | A7, A8, Standard Component identity/self-bootstrap |
| E8 | A9, A10, compatibility/currentness baseline |
| E9 | A3, A6, resource/secret identity boundary |
| E10 | A2, A9, A11, atomic assembly/execution pin chain |
| E11 | A1, A5, A6, Domain App composition sufficiency / UX entry path |

### 10.4 Final L2/SDK contract closure

Only after all mandatory experiments have accepted dispositions and every required repair has passed successor review may the controller create:

```text
FINAL_L2_SDK_CONTRACT_CLOSURE=YES
REFERENCE_GATES=CLOSED
```

PR/Task PASS, L2 Architecture Freeze and final SDK/L2 contract closure are different gates.

## 11. #513 remaining subquestion dispositions

These entries supplement the existing H1–H15 disposition matrix; they do not create new Product authority.

### H4 — Running Domain App resources

`RuntimeHostBindings` executable ports/bindings and `RuntimeResources` environment values remain **two architecture concepts**, both under the broader Running Domain App environment/assembly boundary. Do not collapse them into one untyped Resource bag.

Disposition: `ADOPTED_IN_L2`.

### H5 — approval/human-confirmed Tool invocation

Approval/human confirmation is higher-level semantic policy unless durable authority proves a new kernel effect semantic is required. v0.7 core effect enum remains unchanged.

Disposition: `VALIDATE_BY_REFERENCE_IMPLEMENTATION` for any case selected into the v0.7 conformance journeys; otherwise `DEFERRED_POST_V0_7`.

### H9 — mandatory/optional Standard Components and platform variation

The exact mandatory Standard Component catalog is not frozen by L2. The Standard Set is target/assembly-specific under the same semantic contracts, and platform variation changes assembly/implementation pins rather than semantic Kind identity unless Product semantics explicitly require platform behavior.

Disposition: `VALIDATE_BY_REFERENCE_IMPLEMENTATION` for the E7 slice; broader catalog `DEFERRED_POST_V0_7`.

### H11 — adapter lifetime and export disposition

Each legacy public export receives an explicit implementation-time status:

```text
RETAIN
DEPRECATE_WITH_VERSIONED_ADAPTER
HISTORICAL_PROFILE_ONLY
```

No universal removal date is frozen in L2. Removal requires a later compatibility/version decision with consumer evidence.

Disposition: `ADOPTED_IN_L2` for the status mechanism; exact per-export lifetime `VALIDATE_BY_REFERENCE_IMPLEMENTATION` / later version planning.

## 12. Updated material unknown register and posture

Add:

### U7 — neutral Domain App composition sufficiency + UX entry

```text
DISPOSITION=REFERENCE_IMPLEMENTATION_REQUIRED
EXPERIMENTS=E11
```

Static architecture does not prove that the two-family Component model plus relations/capabilities is sufficient for a neutral executable Domain App or that the UX request path can enter the current authority chain without a hidden second admission mechanism.

Updated counts:

```text
MATERIAL_UNKNOWNS=7
REFERENCE_IMPLEMENTATION_REQUIRED=7
REFERENCE_BEFORE_L2_FREEZE=0
FOCUSED_HARNESS_RESEARCH_REQUIRED=0
PRODUCT_CONTRADICTION=NO
```

Status labels:

```text
COMPONENT_MODEL=RESOLVED_AT_ARCHITECTURE_REFERENCE_PROOF_REQUIRED
TOOL_MODEL=RESOLVED_AT_ARCHITECTURE_REFERENCE_PROOF_REQUIRED
CAPABILITY_RESOLUTION=RESOLVED_AT_ARCHITECTURE_REFERENCE_PROOF_REQUIRED
MICROKERNEL_BOUNDARY=RESOLVED_AT_ARCHITECTURE_REFERENCE_PROOF_REQUIRED
SDK_SELF_BOOTSTRAP=RESOLVED_AT_ARCHITECTURE_REFERENCE_PROOF_REQUIRED
RAW_MIGRATION=RESOLVED_AT_ARCHITECTURE_REFERENCE_PROOF_REQUIRED
HYPOTHESIS_DISPOSITIONS=15/15_PLUS_SUBQUESTION_DISPOSITIONS
L2_FREEZE=NO
TASK_DAG=BLOCKED
NEXT=SUCCESSOR_FRESH_INDEPENDENT_ARCHITECTURE_REREVIEW
```

## 13. Repair conclusion

This overlay closes the architecture ambiguity identified by `#522` without reopening Product or inventing a second Runtime/plugin/provider authority.

The successor reviewer must review the **union** of base candidate blob `5bfdfaef999d24444b2c1d3fe2978477faf737e0` plus this exact repair-overlay blob/HEAD. Prior `#522` verdict remains historical evidence for the prior exact HEAD only.
