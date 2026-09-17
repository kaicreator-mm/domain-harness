# DomainHarness — Integration Model

> Chinese companion: `DOMAINHARNESS_INTEGRATION_MODEL.zh-CN.md`.
>
> This document defines the recommended integration boundary for domain products using DomainHarness v0.1. It is derived from the frozen PRD/L2/public SDK and does not create new Runtime primitives.

## 1. Integration objective

A domain product should use DomainHarness to remove duplicated execution infrastructure while keeping its domain authority intact.

The target decomposition is:

```text
Domain Product
├─ Domain Data / Domain Assets
├─ Domain Business Model + authoritative DB
├─ User UI / Admin UI
├─ Host Integration Layer
│  ├─ Harness Tools
│  ├─ AIOperationPort adapter
│  └─ DomainHarness lifecycle adapter
└─ DomainHarness Runtime
```

The integration is successful only if DomainHarness becomes the reusable execution engine **without becoming a second business system of record**.

## 2. Responsibility matrix

| Concern | Domain project | DomainHarness | AI Runtime |
|---|---:|---:|---:|
| business/domain truth | owns | no | no |
| domain schemas/knowledge/rules | owns | loads/executes selected assets | no |
| workflow definition | owns | validates/executes | no |
| transition mechanics | defines routes | owns deterministic execution | no |
| provider/model selection | no | no | owns |
| Skill AI request contract | owns domain content | constructs/validates operation | executes strategy |
| external side effects | owns through Tools | schedules/recovery semantics | no |
| credentials/secrets | owns | no | provider-specific only |
| persistence of Runtime progress | no | owns SQLite | no |
| authoritative domain persistence | owns | no | no |
| UI/admin | owns | no | no |
| crash recovery of workflow execution | integrates | owns | provider retry only inside AI operation |

## 3. The five integration boundaries

### 3.1 Domain Data boundary

Domain Data remains versioned with the domain project. DomainHarness may directly load the executable subset (Harness manifest, workflows, Skills, schemas, scripts and declared resources), while many domain assets remain supporting files used by Skills, Tools or authoring processes.

Do not move a domain concept into Runtime source merely because multiple workflows use it. Reuse inside one domain belongs in Domain Data/Domain code first.

### 3.2 Tool boundary

A Tool is the explicit host-owned side-effect boundary.

Use a Tool when work requires one or more of:

- authoritative domain database mutation;
- external API/network request;
- filesystem operation outside the Harness definition;
- credential use;
- queue/service invocation;
- domain service call;
- externally visible side effect.

The Tool implementation remains application code. The Harness references only the registered Tool name and mapped JSON input.

Every Tool must classify its recovery effect:

```text
none
idempotent
non-idempotent
```

This is not documentation decoration; it controls crash replay safety.

### 3.3 AI boundary

A Skill Step is one domain AI capability invocation.

```text
Skill package
→ DomainHarness AIOperationRequest
→ AIOperationPort
→ AI Runtime
→ structured result
→ DomainHarness schema validation
→ deterministic workflow routing
```

The domain project owns Skill instructions, resources and output schema. AI Runtime owns provider/model routing and orchestration strategy. DomainHarness owns the durable workflow boundary and output validation.

A Skill should not hide Tool execution, nested Workflow execution or arbitrary state transitions.

### 3.4 Business-state boundary

Runtime state and business state are different.

Runtime may persist:

```text
run status
current workflow frame
Step journal
Step outputs/errors
waiting event payload
definitionHash
logical time
```

The domain project persists authoritative entities such as:

```text
Task / TaskDAG
Knowledge Object
Creative Artifact
Trade Content Item
POI / Publication State
Order / Customer / Project
```

When a Workflow result must become domain truth, use a domain Tool to validate and commit it to the authoritative domain model.

### 3.5 UI boundary

UI should normally call domain application APIs/services, not manipulate Runtime internals.

Recommended pattern:

```text
UI action
→ Domain application service
→ Domain validation/authorization
→ DomainHarness start/send/cancel
→ map HarnessRun into domain-facing response
```

Do not expose raw SQLite rows, XState state or internal Runner objects to the UI.

## 4. Recommended host adapter

A downstream project should place DomainHarness integration behind a thin domain-owned service, for example:

```ts
class ContentHarnessService {
  async startDraft(input: DraftInput) { ... }
  async approve(runId: string, actor: Actor) { ... }
  async cancel(runId: string) { ... }
  async getStatus(runId: string) { ... }
}
```

This adapter is responsible for:

- domain authorization;
- mapping domain IDs to Harness JSON input;
- selecting the root Workflow;
- mapping `HarnessRun` to domain/API response;
- committing final domain truth through Tools where required;
- keeping Runtime IDs from becoming accidental business IDs.

## 5. Integration lifecycle

### Phase A — inventory

Identify an existing Critical Journey and classify each operation:

```text
pure mapping/calculation     → Expression
complex deterministic logic → Script
external side effect        → Tool
semantic AI capability      → Skill
reusable sequential flow    → Child Workflow
human/external decision     → Waiting Event
business authority          → keep in domain project
```

### Phase B — define Domain Data

Extract stable instructions, schemas, decision rules, references, examples, workflows and validation constraints into versioned Domain Data.

Do not start by rewriting all application code as Workflow YAML.

### Phase C — build host boundaries

Implement Tool Registry and AIOperationPort adapter first. These are the bridge to real application capabilities.

For each Tool record:

- name;
- input/output JSON contract;
- owner module/service;
- credentials used;
- external effect;
- `effect` classification;
- idempotency handling;
- timeout/cancellation behavior.

### Phase D — author one Harness journey

Create one root Workflow covering one real Critical Journey. Keep domain writes behind Tools and AI behind Skills.

Validate the journey before migrating adjacent flows.

### Phase E — integrate lifecycle

Map application actions to:

```text
start
wait/get
send
cancel
resume on process recovery only
```

Store the relationship between domain entity IDs and Runtime `runId` in the domain project if the product needs to reopen/inspect Runs later.

### Phase F — validate authority

A successful migration must prove:

- no duplicate domain state authority exists;
- Tool side effects retain their domain validation/authorization;
- provider/model details did not leak into Skills/Workflow;
- Runtime restart recovers without corrupting domain state;
- waiting events cannot bypass domain authorization;
- negative domain outcomes remain distinct from Runtime failures.

## 6. Domain-state commit patterns

### Pattern 1 — proposal then commit

```text
Skill/Script produces proposal
→ deterministic validation/routing
→ waiting human approval
→ Tool commits approved value to domain DB
→ Workflow completes
```

This is preferred when AI produces content that must not become authoritative automatically.

### Pattern 2 — read/compute/write

```text
Tool reads authoritative snapshot
→ Expression/Script computes deterministic result
→ Tool writes validated result
```

Use this when the calculation is deterministic but data access must stay host-owned.

### Pattern 3 — AI recommendation without mutation

```text
Skill
→ schema validation
→ completed Workflow output
```

The calling domain service decides whether/how to use the recommendation. No Tool is required when no side effect occurs.

### Pattern 4 — reusable child capability

```text
Parent Workflow
→ Child Workflow(input = explicit mapped data)
→ child output
→ parent deterministic route
```

Use this for same-Harness sequential composition, not cross-service orchestration.

## 7. Anti-patterns

### 7.1 Runtime as domain database

Do not treat `steps.output_json` as the canonical business record.

### 7.2 Tool as hidden workflow

A Tool should perform one host capability/transactional side-effect boundary, not implement a large opaque orchestration that duplicates the Harness.

### 7.3 Skill as autonomous agent

A Skill must not secretly call other Skills/Tools or decide durable transitions outside the declared Workflow.

### 7.4 Provider configuration in Domain Data

Do not put `gpt-*`, `claude-*`, retry strategy or model-selection logic in domain Workflow/Skill contracts. Use the opaque execution profile and AI Runtime.

### 7.5 Direct Runtime access from every module

Centralize integration behind a domain-owned adapter/service instead of distributing `createDomainHarness` and raw lifecycle calls across the application.

### 7.6 Duplicate workflow authority

Do not maintain one mutable workflow state in the domain DB and a different competing state machine in DomainHarness unless one is explicitly a projection. Decide which layer owns which state.

## 8. Mapping examples

### Tally-like engineering product

```text
TaskDAG truth / CompletionContract / evidence authority → Tally
Workflow execution/recovery                           → DomainHarness
LLM operation strategy                               → AI Runtime
GitHub/local build actions                            → Tally Tools
```

DomainHarness may execute a projected task workflow, but it must not redefine TaskDAG semantics.

### Cairn-like knowledge system

```text
knowledge schema/evidence/governance/promotion truth → Cairn
repeatable extraction/validation workflow mechanics   → DomainHarness
complex reasoning                                    → dx-service
model/provider strategy                              → AI Runtime
```

### Formula-like creative system

```text
creative direction/layer/artifact/quality semantics → Formula
repeatable generation/review flow mechanics          → DomainHarness
image/render APIs                                    → Formula Tools/services
model orchestration                                  → AI Runtime
```

### Forge-like trade-content system

```text
buyer/trade/content/RFQ semantics → Forge
content production workflow       → DomainHarness
site/media/distribution systems   → Forge Tools
AI strategy                       → AI Runtime
```

### City Atlas-like local-life system

```text
canonical POI/publishing governance → City Atlas
review/enrichment workflow mechanics → DomainHarness
map/data-provider side effects       → City Atlas Tools
```

## 9. Version pinning and rollout

Until a formal package release is authorized, downstream projects should pin an exact DomainHarness commit/tarball.

Recommended downstream record:

```text
DomainHarness source SHA
package tarball checksum/identity
Harness definitionHash for active deployments
downstream integration commit
validation evidence
```

When changing the Runtime version or Harness definition, active-run compatibility must be considered. DomainHarness intentionally rejects continuation on definition/engine mismatch rather than guessing a migration.

## 10. Integration acceptance checklist

A downstream integration is ready when all are true:

- one real Critical Journey runs end-to-end;
- Domain authority remains in the downstream project;
- all external side effects are explicit Tools;
- every Tool has correct effect classification;
- Skills are provider-neutral and schema-bounded;
- deterministic logic prefers Expression/Script over AI;
- waiting events pass through domain authorization before `send()`;
- Runtime IDs do not replace business IDs;
- crash/restart behavior is tested;
- package and Harness definition are pinned/versioned;
- no XState/Store/Runner internal import exists downstream;
- no v0.1 excluded feature was emulated by corrupting existing contracts.

## 11. Related documentation

- `DomainHarness_ARCHITECTURE.md`
- `../domain-data/DOMAIN_DATA_SPEC.md`
- `../domain-data/DOMAIN_DATA_AUTHORING_GUIDE.md`
- `../harness/HARNESS_TECHNICAL_SPEC.md`
- `../harness/HARNESS_AUTHORING_GUIDE.md`
- `../sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md`
