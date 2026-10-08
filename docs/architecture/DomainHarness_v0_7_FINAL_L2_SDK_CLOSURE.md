# DomainHarness v0.7 — FINAL L2/SDK Architecture Closure

Status: **FINAL L2/SDK CLOSURE ARTIFACT — binds the frozen #732 readiness contract to the proven evidence chain**  
Gate issue: `#939` (PACK-E T015)  
Readiness contract: `#732` (CLOSED=approved)  
Controller: `#537` — Frozen Plan `#589` (PACK-E)  
Provisional L2 authority: `#526` freeze = union of base candidate (`#520`) + Repair R1 (`#524`) + Repair R2 (`#530`, parallel refactor)

```text
CLOSURE_HEAD=b9d3df4e7a59dbe845b7bd03fd29b9d442a15f8b
CLOSURE_TREE=(worktree dh-t015-939, rev-parse verified)
LIVE_VERSION_V0_7_TIP=b9d3df4e7a59dbe845b7bd03fd29b9d442a15f8b (gh api verified 2026-10-08T11:40Z)
PACKED_BYTE_IDENTITY=PROVEN (clean-room re-pack at b9d3df4e: all 4 workspace tarball
  sha256 values EXACTLY the accepted T012r/T013s/T014 bytes; see §1.4; no rebind required)
PREREQUISITE=T014 Stage1 Version Closure PASS (#936 closed, terminal #936@6057895202)
WRITE_SET=docs/architecture/DomainHarness_v0_7_FINAL_L2_SDK_CLOSURE.md + packages/domain-harness/tests/t015/
MICROKERNEL_SOURCE_DIFF=0
```

This document records the final v0.7 L2/SDK architecture closure **exactly as proven** by the accepted
evidence chain. It promotes nothing for convenience: every normative claim below is either (a) a frozen
L2/Product rule from the #526 authority union that accepted evidence left untouched, or (b) a claim bound
by the companion contract-assertion test at `packages/domain-harness/tests/t015/` to the landed modules
and package surface, so any drift goes red. Where the evidence chain carried an explicit, accepted limit,
the limit is carried forward by reference, never silently repaired.

---

## 1. Authority consumed and evidence chain

### 1.1 Frozen architecture authority (unchanged by this closure)

The L2 authority union consumed by T015:

| Layer | Artifact | Blob | Disposition |
|---|---|---|---|
| Base L2 candidate | `docs/architecture/DomainHarness_v0.7_L2_ARCHITECTURE_EVIDENCE_REVIEW_CANDIDATE.md` | `5bfdfaef999d24444b2c1d3fe2978477faf737e0` | reviewed `#522`/`#525` |
| Repair R1 | `docs/architecture/DomainHarness_v0.7_L2_ARCHITECTURE_REPAIR_R1.md` | `8362a65a99cfc99c7235c817ce8b88dc8093be4c` | precedence only for the #522 findings it repairs |
| Repair R2 | `docs/architecture/DomainHarness_v0.7_L2_ARCHITECTURE_REPAIR_R2_PARALLEL_REFACTOR.md` | (accepted via #533 re-review) | scheduling-only correction; zero Product/architecture change |
| Freeze record | `docs/architecture/DomainHarness_v0.7_L2_ARCHITECTURE_FREEZE.md` | (this file) | `L2_ARCHITECTURE_FREEZE=PROVISIONAL_WITH_REFERENCE_GATES` |

All E1–E11 rows returned `SUPPORTED` with `PRODUCT_IMPACT=NONE`, `L2_IMPACT=NONE`, `SDK_IMPACT=NONE`
(accepted t009r manifest, `packages/domain-harness/tests/t009r/t009r-e1-e10-evidence-manifest.json`,
consumed by the T011 disposition module by import — T009R remains the completeness/currentness authority).
No experiment returned `REFUTED` or a material `PARTIAL`; therefore no L2 section reopened and no
convenience repair exists to record.

### 1.2 E1–E11 accepted evidence (live citations)

| Gate | Issue | PR | Verdict | Terminal chain (builder / validation / fresh review / merge) |
|---|---|---|---|---|
| E1 | #895 | #900 | SUPPORTED (SUCCESSOR_RERUN_ACCEPTED) | 6038951284 / 6039802398 / 6039832435 / 6040107198 |
| E2 | #887 | #891 | SUPPORTED (CURRENT) | 6036039917 / 6036402906 / 6036722458 / 6036770347 |
| E3 | #875 | #882 | SUPPORTED (CURRENT) | 6028552352 / 6028813157 / 6028839277 / 6028857609 |
| E4 | #896 | #901 | SUPPORTED (CURRENT) | 6039511391 / 6040097575 / 6039929599 / 6040149859 |
| E5 | #876 | #883 | SUPPORTED (CURRENT_REBIND_RECORDED) | 6028622834 / 6028810525 / 6028962852 / 6028977938 |
| E6 | #897 | #902 | SUPPORTED (CURRENT) | 6039236493 / 6039907518 / 6039655290 / 6039730247 |
| E7 | #913 | #916 | SUPPORTED (SUCCESSOR_RERUN_ACCEPTED) | 6044280062 / 6044639949 / 6044792324 / 6044823037 |
| E8a | #877 | #884 | SUPPORTED (CURRENT_REBIND_RECORDED) | 6029349438 / 6029734136 / 6029656782 / 6029677228 |
| E8b | #873 | #893 | SUPPORTED (CURRENT) | 6036391742 / 6036992409 / 6036756515 / 6036799726 |
| E9 | #878 | #885 | SUPPORTED (CURRENT) | 6029449239 / 6029775510 / 6029602994 / 6029636002 |
| E10 | #899 | #904 | SUPPORTED (CURRENT) | 6040759939 / 6041634546 / 6041633204 / 6041674174 |
| E11 | #921 | #922 | SUPPORTED (CURRENT) | 6047764502 / 6048043527 / 6047975173 / 6048065030 |

E7 is satisfied **only** by the accepted #913 successor chain; the superseded #898 row remains
disposition `SUPERSEDED` (recorded, never averaged, can never satisfy its gate) — re-verified
fail-closed by the t009r aggregator at the candidate.

### 1.3 Post-evidence chain (architecture gate → real hosts → version closure)

| Link | Citation | Outcome |
|---|---|---|
| T011 architecture-gate disposition | #924 merge record `6049387303` | E1–E11 complete, `T012_T013_AUTHORIZED=YES`; 32/32 disposition checks green at the candidate |
| T012-D1 bounded facade repair | #930 terminal `6054426102` | `BOUNDED REPAIR ACCEPTED; NEW_CANDIDATE=29dba90b`; declares `./v7/execution` the public home of the accepted T010 Tool-plane seams |
| T012r Node real-host successor rerun | #926 validation `6055952342` CONFIRMED; fresh review `6056299928` PASS; PR #935 merged `83f26aca` | packed-byte clean install, 38-row journeys, tool-effect recovery, SQLite crash/recovery/replay, resource currentness, Lane A full matrix |
| T013s Expo/Hermes successor rerun | #933 validation `6056300003` CONFIRMED; fresh review `6055582709` PASS; PR #934 merged `3493fe3d` | on-device Hermes Android 16/API 36, 36/36 vectors on Hermes + Node twin, zero node-import leaks across all 7 entries, N/A matrix evolution repair-justified |
| T014 Stage1 Version Closure | #936 terminal `6057895202` (CLOSED) | candidate identity, full regression parity (core 2913, compiler 172, node 175, root 62+9), clean consumer, carried-limits register |

Currentness rule honored throughout: all live reads via `gh api` / direct GitHub only; the local-mirror
origin is stale-by-design and was never used. Live ADS `kaicreator-mm/ai-development-standard`
`main@7929012f36a2202dcc2edc7a414b8163adc7afbd` — identical to the ADS audited at #731 (no drift).

### 1.4 Candidate identity and packed-byte proof at this closure

- Closure head `b9d3df4e` = T014 closure candidate `3493fe3d` + merge of the tests-only T014 evidence
  PR #937 (`7d04721`, 5 files under `tests/t014/`). `git diff 3493fe3d..b9d3df4e` outside
  `packages/domain-harness/tests/` is EMPTY; `src/`, `dist/`, every `package.json` and lockfile are
  byte-identical.
- Clean-room re-pack at `b9d3df4e` (`C:\xDev\kAiCreator\_tmp\dh-t015-939\cleanroom`, git-archive
  extract, own `npm ci --ignore-scripts`, disclosed same-host better-sqlite3 prebuilt
  `e75b8c024a85179d8e0e51203a8b8867916e9a51327ce3953db5f8483cc9a91e`, own build, committed-dist check
  green, `npm pack --workspaces`) reproduces EXACTLY the four accepted tarball digests:

```text
kaicreator-domain-harness-0.2.0.tgz           f9400728bc99f8516c2f7f69db55cf8589d29e79127a77a36c2fb44f08a2d332  MATCH
kaicreator-domain-harness-node-0.2.0.tgz      549262618bc3bc7961f325271d7cd000bc2a6fea9e337d2f1e3fd1222ad83c78  MATCH
kaicreator-domain-harness-compiler-0.2.0.tgz  3a254c6288736553afe2a7294172cb41a9aa4563e9345995613bdb816a030480  MATCH
kaicreator-domain-harness-expo-0.2.0.tgz      d4c6ef8ae7b9d19b447e3b859607e464814c338553327136e53a9dd72c40bde1  MATCH
packedTarballSetSha256                        0b5772fc7aaf57373759bf9c11b3f9294d60fbfcb22aa56c991fa7924fd3d98e  MATCH
```

The T015 write set (this doc + `tests/t015/`) is outside every workspace package `files` list, so packed
bytes are unaffected: **no rebind required**; the real-host evidence transfers verbatim to this closure.

---

## 2. FINAL Microkernel responsibilities and proven generic ports

The final Microkernel boundary is the R1 §5.5 H8 classification, restricted to responsibilities with
**landed modules and accepted executable proof**. Nothing outside this list is claimed; nothing in this
list is speculative.

### 2.1 Final irreducible Microkernel responsibilities (each mapped to landed module + proof)

| # | Final responsibility | Landed module(s) (`packages/domain-harness/src/`) | Proving evidence |
|---|---|---|---|
| MK-1 | Definition/Component canonical identity + integrity foundation | `contracts/component.ts` (T001A #535), `contracts/component-digest.ts` (T001B #541), `contracts/definition-graph.ts` (T001C #542, repaired #555) | E1, E11 (T010A freeze-record deep match: `definitionGraphDigest 030402bf…`) |
| MK-2 | required-semantics compatibility + must-understand admission gate | `contracts/kind-compatibility.ts` (T002A #552), `contracts/component-admission.ts` (T001D #556) | E1 (unknown/incompatible KindRef fails closed before affected execution) |
| MK-3 | sealed Runtime Assembly construction + currentness validation | `contracts/runtime-assembly.ts` (T002B #587; closes #568/#575) | E3, E10; sealed-assembly anti-forgery registry; torn-snapshot discipline |
| MK-4 | Kind/Component dispatch foundation (no Kind-specific semantics in kernel) | assembly-bound admission `admitComponentWithAssembly` + `contracts/component-admission.ts` validator port (`ComponentKindValidator`) | E1 (neutral Kind dispatch), E6 (Workflow behind the generic port, no special-case branch) |
| MK-5 | relation/dependency/capability resolution foundation (deterministic mechanics only) | `contracts/capability-provision.ts` (T003B #553), `contracts/capability-plane.ts` (T003D #634), `contracts/capability-dependency-closure.ts` (T003E #630/#651) | E5 (zero/ambiguous/cross-plane/incompatible all fail closed) |
| MK-6 | runtime occurrence identity + authoritative transition/admission boundary | `admission/` (`admission.ts`, `contracts.ts`) Central Admission; `governance/` (`assembly-activation.ts`, `execution-binding.ts`, `identity.ts`, `registry.ts`) exact execution pins | E6, E11 (UX/Agent intent never holds transition/effect authority) |
| MK-7 | durable effect/outcome authority + journal contract + replay/recovery invariants | `admission/effect-journal.ts`; recovery proven through the existing Runtime spine | E6 (non-idempotent outcome-unknown recovery; no duplicate committed effect; one Runtime), T012r n03-sqlite SIGKILL pre/post-commit rows |
| MK-8 | exact implementation/binding pins (activation plane) | `contracts/tool-implementation-binding.ts` (T003C #607; consumer verifier #640) | E2, E10 (pin mismatch fails closed; no alias/latest resolution) |
| MK-9 | authority/currentness evidence + resource currentness pins | `contracts/resource-resolution.ts` (T005B #608 + T005C currentness #656); governance baseline body/pin mint + verification | E9, E10; T012r resource-currentness lane |
| MK-10 | observation/evidence boundary required to prove authority/currentness | evidence records produced by the seams above (assembly evidence, binding evidence, resource currentness evidence, governance pins) | E10, E11; T013s on-device re-execution byte-identical to Node twin |

Explicitly **outside** the final Microkernel (frozen A7 list, unchanged and now evidence-backed):
Workflow/Rule/Policy/Skill/Projection/XState/AI/HTTP/search/document/domain-specific semantics,
Agent orchestration behavior, UX renderer behavior — each is a Standard/application semantic
implementation or host/provider implementation behind the generic ports (E6/E4/E11 prove the boundary).

### 2.2 Proven generic ports ONLY (host-injected; no inferred host parity)

The complete set of generic ports the proven seams require hosts to inject — exactly as exercised by
E1–E11, the T012r clean consumer, and the T013s on-device run:

| Port | Owner seam | Proof |
|---|---|---|
| `Sha256Port` (content hashing) | `contracts/identity.ts` | T013s pure-js FIPS 180-4 adapter (`t013-pure-js-sha256-fips180-4/1.0.0`) — the only injected host code on the Hermes run |
| `ComponentKindValidator` (closed-world per-Kind validation) | `contracts/component-admission.ts` | E1 |
| `NonEffectfulToolDispatchPort` | `contracts/non-effectful-invocation.ts` (T004B #632) | E2, T013s 9/9 on-device vectors |
| `EffectfulToolDispatchPort` + Central Admission ports | `contracts/effectful-invocation.ts` (T004C #874); admission/governance port types remain reachable via `./v3` (deliberately not re-promoted by the facade) | E6, T012r real-host journey |
| `ResourceProvider` | `contracts/resource-resolution.ts` (T005B) | E9 |
| Neutral host behavior ports exercised in-memory (executor dispatch, resource provider, admission policy) + in-memory governance seams (`MemoryGovernanceBaselineStore`, `createGovernanceBaselineBody`, `createGovernanceExecutionPin`, `VolatileAdmissionEffectJournal`) | root public adapter seams | T013s `APPLICABLE_AND_EXECUTED_ON_HOST`, byte-identical Hermes/Node |

No dynamic discovery/loading, no hot-swappable registry, no second Runtime: the frozen A2/A7 posture
stands exactly as proven.

---

## 3. Finalized contracts — exactly as proven

Each contract is recorded with the landed module(s) and the accepted evidence that proves it. The
contract text is the frozen L2/R1 rule; the proof column is what makes it final rather than provisional.

| Contract | Final form (as proven) | Landed module(s) | Proving evidence |
|---|---|---|---|
| **Component** | one envelope, `SEMANTIC \| TOOL` families; identity = versioned/domain-separated content digest over `ComponentFamily + exact KindRef + requiredSemanticContracts + requiredCapabilities + semanticBody`; relations once at graph level; provenance/labels outside identity; no mutable aliases at authority boundaries | `contracts/component.ts` (T001A), `contracts/component-digest.ts` (T001B), `contracts/definition-graph.ts` (T001C) | E1, E11; T010A freeze-record deep match (graph digest `030402bf…` recomputed through the packed public surface) |
| **Kind** | open, versioned `KindRef`; `KindRef != KindImplementation`; deterministic explicit compatibility decision; no latest/default/order winner; exact chosen implementation pin recorded in the assembly pin | `contracts/kind-compatibility.ts` (T002A), `contracts/component-admission.ts` (T001D) | E1 (compatibility negatives), E6 (Workflow as ordinary Kind) |
| **Tool** | three distinct roles — Tool Component (Definition contract) / Tool Implementation (assembly executable) / Runtime Resource (environment value); minimal effect enum `none \| idempotent \| non-idempotent` with existing outcome-unknown/external-authority/reconciliation semantics; effectful invocation anchored to an admitted authoritative Domain occurrence through Central Admission | `contracts/tool-component.ts` (T003A), `contracts/invocation-request.ts` (T004A), `contracts/non-effectful-invocation.ts` (T004B), `contracts/effectful-invocation.ts` (T004C) | E2, E3 (simulation substitution under `SIMULATION` class), E6 (outcome-unknown recovery), T014-L8 recorded observation (AUTHORITY_CLASS_MISMATCH enforcement is T004C-owned, executed green) |
| **Capability** | one stable versioned `requires/provides` contract identity; three separate operations — Definition-plane provider selection (Definition authority only), assembly implementation binding (exactly one per activation), Domain/host plane collision fail-closed; Tool-to-Tool closure validated | `contracts/capability-provision.ts` (T003B), `contracts/tool-implementation-binding.ts` (T003C), `contracts/capability-plane.ts` (T003D), `contracts/capability-dependency-closure.ts` (T003E) | E5 (all negative classes), E10 |
| **Assembly** | content-addressed sealed `RuntimeAssemblyRecord` (KindRef→implementation pins, capability bindings, Standard descriptors, compatibility material, `authorityClass = PRODUCTION \| SIMULATION`); anti-forgery mint registry; extends — never competes with — the existing atomic pin chain | `contracts/runtime-assembly.ts` (T002B) | E3, E10; T010B authorized journey pins ONE production occurrence to assembly digest `400d668f…`; cross-class publication/use fails closed |
| **Resource** | logical requirement declaration on the contract (T005A); resolution to live values at activation/run (T005B); secret/live values never enter Definition identity; stable non-secret instance/currentness pin (T005C); missing required resource fails closed | `contracts/resource-requirements.ts` (T005A), `contracts/resource-resolution.ts` (T005B/#656) | E9; T013s resource-resolution vector with exact currentness pin + `INCOMPATIBLE_RESOURCE` fail-closed probe |
| **authority** | exactly one authoritative Runtime/admission/effect authority; `WorkflowAddress + workflowInstanceId/GovernanceExecutionPin + durable control turn/effect ordinal` remains the shipped effectful invocation anchor (v0.7 mints no generic new journal key); `ApplicationSelectionRef != RuntimeBindingRef != RuntimeActivationRef` + `assemblyDigest` in the atomic per-occurrence pin; Agent/UX callers hold no mutation authority | `admission/`, `governance/`; effectful path `contracts/effectful-invocation.ts` | E6, E11; T012r n03 recovery rows; T010B refusal matrix all classes typed zero-counter |
| **currentness** | verification by authoritative recomputation, never blind trust: `verifyToolImplementationBinding` (T003C consumer verification), `verifyStandardSetCurrentness` (T006A), resource currentness pins (T005C), governance baseline body/pin verification; replay reuses pinned resolution, never re-runs selection against live `latest` | `contracts/tool-implementation-binding.ts`, `contracts/standard.ts` (T006A #618), `contracts/resource-resolution.ts`, `governance/identity.ts` | E10 (exact pin-chain replay), T012r resource-currentness lane |

---

## 4. Boundaries and the public `/v7` SDK surface

### 4.1 Concern boundaries (each with landed, evidence-backed ownership)

| Boundary | Final ownership (landed) | Proof |
|---|---|---|
| **Standard** | `contracts/standard.ts` (T006A: descriptor = Definition-plane material through its own versioned digest domains `kaicreator.standard-descriptor.digest.v1` / `kaicreator.standard-set.digest.v1`; `StandardSet` = assembly-plane curated pins reusing the generic T002B pin shape; sealed-set anti-forgery + currentness verification). Production candidates in the reserved `kaicreator.standard.*` namespace (T006B/T006C, #906): definition plane `standard/bootstrap-definition.ts` — Semantic Component `kaicreator.standard.component.approval-workflow`, Kind `kaicreator.standard.kind.canonical-digest`, Tool Component `kaicreator.standard.component.canonical-digest` (+ `kaicreator.standard.capability.canonical-digest`); assembly plane `standard/bootstrap-runtime.ts` — implementations `kaicreator.standard.implementation.{approval-workflow,canonical-digest-kind,canonical-digest}`, `createStandardCanonicalDigestDispatchPort`, `STANDARD_OPEN_EXPOSURE_POLICY`, `invokeStandardCanonicalDigest`, `admitStandardApprovalWorkflow`. Standard receives **no privileged bypass** around contract identity/currentness/admission | E7 (successor chain #913); T012r journey re-runs from packed bytes |
| **Workflow** | T007 lane as ordinary Semantic Kind: `adapters/workflow-kind.ts` (T007A #610, descriptor/dispatch adapter), `adapters/workflow-runtime-bridge.ts` (T007B #620, the ONE private bridge into the existing shipped workflow runtime), T007C workflow authority/recovery evidence (`tests/fixtures/evidence/t007c-workflow-authority-recovery.test.ts`). XState remains implementation-private | E6; T010B authorized journey |
| **Agent** | `adapters/agent-tool-projection.ts` (T004D #886): `projectAgentToolSurface` / `queryAgentTool` / `admitAgentMutationIntent`; Harness `query`/`mutation` mapping preserved — mutation never exposed through the model-query seam | E4; T010C 58-row matrix (E11 representative subset R1–R6 re-derived) |
| **UX** | `adapters/ux-tool-request.ts` (T004E #907): `queryUxTool` / `invokeUxToolEffectfully`; renderer-neutral; UX intent re-enters through admitted Domain request → Central Admission | E11; T010B authorized journey |
| **legacy (retained surfaces)** | Root `.` (518 exports), `./v2` (66), `./workflow` (11), `./v3` (436, remains the sole public home of Central Admission port types), `./v4` (23) — all UNCHANGED vs the accepted portable-surface manifest; T008 Raw/compiler strangler + additive open Kind surface; historical identities never rehashed or reinterpreted | E8a, E8b; T013s portable-surface manifest (`UNCHANGED` rows); n02-resolution consumer rows + 8 deep-import `ERR_PACKAGE_PATH_NOT_EXPORTED` negatives |

### 4.2 Public `/v7` SDK surface — the 7-key export map (normative)

The package boundary is the declared export map; exactly 7 keys, zero wildcards, every condition
(`types`/`import`/`require`) present. Deep imports of owner leaf paths remain
`ERR_PACKAGE_PATH_NOT_EXPORTED` (accepted T008C boundary).

```text
NORMATIVE_EXPORT_MAP_KEYS
.
./v2
./workflow
./v3
./v4
./v7
./v7/execution
```

| Key | Role | Runtime export count |
|---|---|---:|
| `.` | retained legacy/root surface | 518 |
| `./v2` | retained legacy surface | 66 |
| `./workflow` | retained legacy surface | 11 |
| `./v3` | retained legacy surface; sole public home of Central Admission port types | 436 |
| `./v4` | retained legacy surface | 23 |
| `./v7` | declared host-portable v0.7 public SDK contract (composition-only barrel over the T001 contract modules) | 15 runtime (40-name surface incl. 25 compile-time type exports) |
| `./v7/execution` | adjudicated public facade of the accepted T010 Tool-plane seams (T012-D1 bounded repair, #930@6054426102) | 25 runtime (16 functions + 9 typed error classes) |

The `./v7` runtime surface (normative, composition-only — every name comes from an already-reviewed
leaf module):

```text
NORMATIVE_V7_RUNTIME_EXPORTS
COMPONENT_FAMILIES
COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7
DEFINITION_GRAPH_DIGEST_DOMAIN
validateComponentEnvelope
componentSemanticDigestMaterial
computeComponentSemanticDigest
validateDefinitionGraphEnvelope
computeDefinitionGraphDigest
admitComponent
validateToolComponent
ComponentContractError
ComponentDigestError
DefinitionGraphContractError
ComponentAdmissionError
ToolComponentContractError
```

The `./v7/execution` runtime surface (normative; explicit named exports only, no `export *`; the
minimal transitive public type closure is TypeScript-erasable and correctly absent at runtime):

```text
NORMATIVE_V7_EXECUTION_FUNCTIONS
sealRuntimeAssembly
isSealedRuntimeAssembly
admitComponentWithAssembly
resolveCurrentCapabilityProvider
bindToolImplementation
verifyToolImplementationBinding
admitToolExposure
admitToolInvocationRequest
invokeNonEffectfulTool
invokeEffectfulTool
resolveToolResources
queryUxTool
invokeUxToolEffectfully
projectAgentToolSurface
queryAgentTool
admitAgentMutationIntent
```

```text
NORMATIVE_V7_EXECUTION_ERROR_CLASSES
RuntimeAssemblyError
CapabilityProvisionContractError
ToolImplementationBindingError
InvocationRequestError
NonEffectfulInvocationError
EffectfulInvocationError
ResourceResolutionError
UxToolRequestError
AgentToolProjectionError
```

Facade scope (accepted with the repair, unchanged): composition-only re-export from owner leaf modules;
governance/admission port types used by the effectful journey deliberately remain reachable through
`./v3` only and are NOT re-promoted; owner deep paths stay package-closed.

### 4.3 Landed seam modules cited by this closure (normative existence set)

Every architecture claim above cites landed modules; the companion test asserts this exact set exists
on disk so a doc/seam mismatch goes red:

```text
NORMATIVE_SEAM_MODULES
contracts/component.ts
contracts/component-digest.ts
contracts/definition-graph.ts
contracts/component-admission.ts
contracts/kind-compatibility.ts
contracts/tool-component.ts
contracts/runtime-assembly.ts
contracts/capability-provision.ts
contracts/tool-implementation-binding.ts
contracts/capability-plane.ts
contracts/capability-dependency-closure.ts
contracts/invocation-request.ts
contracts/non-effectful-invocation.ts
contracts/effectful-invocation.ts
contracts/resource-requirements.ts
contracts/resource-resolution.ts
contracts/standard.ts
adapters/workflow-kind.ts
adapters/workflow-runtime-bridge.ts
adapters/agent-tool-projection.ts
adapters/ux-tool-request.ts
standard/bootstrap-definition.ts
standard/bootstrap-runtime.ts
admission/admission.ts
admission/effect-journal.ts
admission/contracts.ts
governance/assembly-activation.ts
governance/execution-binding.ts
governance/identity.ts
governance/registry.ts
governance/contracts.ts
public-v7/index.ts
public-v7/execution.ts
```

---

## 5. Host support and NOT_APPLICABLE boundaries (evidence-backed)

Host evidence = T012r (Node real host, packed bytes) + T013s (Expo/Hermes on-device AVD Android
16/API 36, Hermes bytecode `cf2fd5de…`) + the T013s N/A matrix
(`packages/domain-harness/tests/t013s/t013s-na-matrix.json`). **No inferred parity anywhere.**
Node-side storage/effect authority lives in the separate `@kaicreator/domain-harness-node` package
(own `better-sqlite3` dependency); Expo host bindings ship as `@kaicreator/domain-harness-expo`.

| Facility | Status | Boundary evidence |
|---|---|---|
| `dist/persistence/sqlite-store.js` (better-sqlite3 durable store) | NOT_APPLICABLE (portable core) | static top-level better-sqlite3 import; unreachable from all 7 entries; absent from Hermes hbc bundle; ownership = `@kaicreator/domain-harness-node` |
| `dist/script/script-executor.js` (node:worker_threads) | NOT_APPLICABLE (portable core) | lazy `node:worker_threads` import; unreachable from all 7 entries; absent from hbc bundle; no Expo equivalent claimed |
| sealed Assembly authoring + assembly-bound admission + Tool-plane seams + UX/Agent adapters | APPLICABLE_AND_EXECUTED_ON_HOST | 9/9 execution vectors PASS under on-device Hermes, byte-identical Node twin (was NOT_EXPORTED pre-repair; now declared via `./v7/execution`) |
| effectful invocation (`invokeEffectfulTool`) + Central Admission durable-effect journeys | NOT_EXERCISED_ON_HOST (Expo scope) | facade deliberately keeps Central Admission port types on `./v3`; #729 portable-journey scope permits only neutral non-effectful journeys; genuine durable-effect host evidence = T012r Node (real SQLite crash/recovery/replay); Expo durable-store parity is T000/E8b-owned, out of this gate |
| in-memory governance seams (baseline store/pin mint, volatile effect journal) | APPLICABLE_AND_EXECUTED_ON_HOST | re-executed under Hermes in the base suite, byte-identical to Node twin |

Import-graph integrity: zero `node:*` / `better-sqlite3` / `worker_threads` externals reachable from ANY
of the 7 declared entries (`t013s-import-graph.json`, including the post-repair `./v7/execution`);
`./v7/execution` reaches 24 dist files and NOT sqlite-store/script-executor. Polyfill disclosure:
NONE — no shim, polyfill, deep import or route downgrade anywhere in the validation consumer.

---

## 6. Accepted limitations (carried verbatim-by-reference)

### 6.1 The 12-entry T014 carried-limits register

Accepted as-is, never locally repaired, none blocking:

- Register: `packages/domain-harness/tests/t014/t014-carried-limits-register.json` (schema
  `v0.7/t014-carried-limits-register`), entries **T014-L1 … T014-L12** (1× P2 evidence-label
  bookkeeping; P3 evidence-citation-precision ×2, host-load-flake, scan-evadability, carried
  observation, bookkeeping, environment-naming, toolchain-skew, infra-disclosure classes).
- Register rule (verbatim semantics): every entry is a bounded, explicitly-carried-forward P2/P3 (or
  recorded observation); NONE is a P0/P1; NONE blocks closure; closure never repairs source.
- Register tail: `zeroRule: Visible P0=0 and P1=0 at the candidate`; `MICROKERNEL_SOURCE_DIFF: 0`.
- Accepted E11 limits (from `t011-e11-terminal-binding.json`, all NON_MATERIAL):
  `L-E11-REPRESENTATIVE_SUBSET`, `L-E11-DERIVED_VARIANT`, `L-E11-STABLE_SQLITE_BINARY`.

### 6.2 Successor-version work (explicit, not silently absorbed)

| Item | Lane |
|---|---|
| T014-L1 label fix + L3/L4 citation-precision fixes | ride the next tests-only PR (bounded, tests/docs only) |
| T014-L6 scan hardening (dynamic-import coverage, token-list extension, v2/tool scan) | bounded hardening backlog, non-blocking |
| Open bounded repair lanes of the #923 class (e.g. #923 T004E successor repair) | external lanes outside this closure's write set; any merge moves the candidate and forces successor closure per the live ADS immutability rule |
| T000 / E8b Expo durable-store parity | owned by the late compatibility pack; non-overlapping with T013s scope |
| H5 approval/human-confirmed semantics, H9 full Standard catalog, H11 per-export lifetime | `VALIDATE_BY_REFERENCE_IMPLEMENTATION` / `DEFERRED_POST_V0_7` per R1 §11 |
| Post-closure release gates | Candidate Freeze → Hidden Validation → Final Closeout → T016 Release Qualification → repository integration (controller-owned, per #589 PACK-E and the ADS release standard) |

---

## 7. No-convenience-promotion declaration

The executor consumed the full accepted chain (§1) before writing this closure and found **no material
requirement that is not already proven by accepted evidence**. In particular:

- The Microkernel list (§2) contains only responsibilities with landed modules AND accepted executable
  proof; the H8 "PARTIAL" resolution-foundation entry is recorded exactly as classified (kernel owns
  deterministic graph/admission mechanics only; domain selection policy lives in Definition/Components).
- Host boundaries (§5) are stated strictly at the proven status per facility; the Expo effectful
  journey remains NOT_EXERCISED_ON_HOST — no parity is inferred from the Node evidence.
- The 82-vs-81 facade type-count bookkeeping item (T014-L9) is carried as recorded; this closure cites
  the normative RUNTIME export sets (16 functions + 9 error classes = 25 for `./v7/execution`; 15 for
  `./v7`), which are the accepted import-surface vectors, and does not mint a new type-count claim.
- Anything newly discovered as material would route back to Product/L2 per #732; nothing did.

## 8. Companion contract-assertion binding

`packages/domain-harness/tests/t015/t015-closure-contract.test.ts` binds this document's normative
surface claims to landed reality:

1. parses the `NORMATIVE_EXPORT_MAP_KEYS` block from this file and asserts it equals the live
   `packages/domain-harness/package.json` `exports` key set exactly (7 keys, zero wildcards);
2. imports the landed `./v7` and `./v7/execution` runtime surfaces and asserts they equal the
   `NORMATIVE_V7_RUNTIME_EXPORTS` / `NORMATIVE_V7_EXECUTION_*` blocks in this file (doc drift or
   surface drift both go red);
3. asserts every `NORMATIVE_SEAM_MODULES` path exists under `packages/domain-harness/src/`;
4. asserts the T014 carried-limits register still carries exactly 12 entries with
   `MICROKERNEL_SOURCE_DIFF: 0`;
5. asserts the T013s N/A matrix statuses remain exactly the accepted set (no silent parity upgrade).

Falsification executed by the builder (scratch copy, then restored): dropping one export-map key from
the doc block → red; injecting a nonexistent seam module into the doc set → red. Both bit as designed.

---

## 9. Terminal

```text
V0_7_T015_FINAL_L2_SDK_CLOSURE
GATE_ISSUE=939
READINESS=#732_APPROVED
CONTROLLER=#537
PLANNING=#589_PACK_E
CLOSURE_HEAD=b9d3df4e7a59dbe845b7bd03fd29b9d442a15f8b
LIVE_VERSION_V0_7_TIP_MATCH=YES
PACKED_BYTE_IDENTITY=PROVEN_4_OF_4_TARBALL_DIGESTS_MATCH_ACCEPTED
EVIDENCE_CHAIN=E1_E11_ALL_SUPPORTED_IMPACT_NONE / T011 #924@6049387303 /
  T012-D1 #930@6054426102 / T012r #926 (val 6055952342, rev 6056299928) /
  T013s #933 (val 6056300003, rev 6055582709) / T014 #936@6057895202
FINAL_MICROKERNEL_RESPONSIBILITIES=MK-1..MK-10 (landed modules + evidence mapped)
PROVEN_GENERIC_PORTS=Sha256Port / ComponentKindValidator / NonEffectful+EffectfulToolDispatchPort /
  ResourceProvider / Central Admission ports / in-memory governance seams (ONLY)
CONTRACTS_AS_PROVEN=Component / Kind / Tool / Capability / Assembly / Resource / authority / currentness
BOUNDARIES=Standard (kaicreator.standard.* production candidates + T006A set contract) /
  Workflow (T007A/B/C) / Agent (T004D) / UX (T004E) / legacy (root,v2,workflow,v3,v4 + T008 strangler)
PUBLIC_V7_SDK=7-key export map / ./v7 15-runtime / ./v7/execution 25-runtime (16 fns + 9 error classes)
HOST_SUPPORT=Node real-host PROVEN (T012r) + Hermes on-device PROVEN (T013s) /
  N/A matrix evidence-backed / NO_INFERRED_PARITY
LIMITATIONS=T014-L1..L12 carried verbatim-by-reference + E11 accepted limits (3, NON_MATERIAL)
SUCCESSOR_WORK=T016 RQ chain / T000+E8b Expo store parity / #923-class external lanes /
  H5+H9+H11 deferred / L6 scan hardening / L1+L3+L4 tests-only fixes
NO_CONVENIENCE_PROMOTION=DECLARED (no material unproven requirement found; else STOP-and-route)
COMPANION_BINDING=tests/t015 (export map + facade surfaces + seam existence + register shape + N/A set)
MICROKERNEL_SOURCE_DIFF=0
NEXT=exact-head CI -> independent Validation -> genuinely Fresh Independent Architecture/SDK Review
  (author cannot self-review; controller dispatches) -> expected-head merge -> T016
```
