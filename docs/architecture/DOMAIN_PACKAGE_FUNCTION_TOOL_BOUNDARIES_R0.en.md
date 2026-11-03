# Domain Package Function Visibility and Tool Invocation Boundaries (R0 Reference)

[中文版本](DOMAIN_PACKAGE_FUNCTION_TOOL_BOUNDARIES_R0.zh-CN.md) · [Tracking Issue #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465)

> **Status:** Post-v0.10.3 architecture implementation reference, R0 / pending review. This is not a frozen L2, a new public ABI, or source implementation authorization. This documentation proposal changes no Runtime, Kernel, SDK, or v0.10.3 release artifact. The next version target remains **UNASSIGNED** pending a separate Product/L2 decision.

## 1. Purpose and governing principle

This document separates function visibility, ownership, invocation path, Tool identity, and side-effect authority inside a Domain Package. It prevents ordinary JavaScript exports, Business Intents, Capability Operations, Host Ports, and Agent-facing Tools from being treated as interchangeable concepts.

**Tool identity comes from an explicit Capability Operation declaration, BUILD selection, and governed route—not from function complexity, naming, or a JavaScript export.**

DomainHarness provides reusable mechanisms. Business semantics remain owned by the relevant Domain Package. Tally Replan, ADS Feedback, and Task Attempt are downstream examples, not built-in DomainHarness business features.

## 2. Terminology: function, operation, and Tool are different

| Concept | Meaning | Automatically a Tool? |
|---|---|---|
| JavaScript function/export | Language-level function or module export | No |
| Private helper | Module-internal implementation function | No |
| Package ABI export | Entry explicitly defined by a Package ABI | No |
| S Standard Feature entry | Selected standard semantic/workflow feature entry | No; non-Tool by default |
| Business Intent | Business operation submitted to K | No; it is a business command boundary |
| K Query / Subscription | Snapshot or event observation through the Microkernel Facade | No |
| C Capability Operation | Explicit `operationId → handler` declaration | A selected Domain App capability operation; not automatically an Agent-facing Tool |
| Host Port / Host function | Trusted infrastructure or Provider adapter seam | No; not an Agent Tool |
| Agent-facing Tool | Optional outer tool protocol for an Agent/model | Yes, as an outer interface; it must map to bounded Business Intents |

“Public” must also be qualified. Prefer **module-private, package-ABI-public, selected-capability-operation, host-only, and agent-facing** over the ambiguous phrase “public function”.

## 3. Function visibility and ownership classes

| Class | Owner | Visibility | Allowed caller | Typical content |
|---|---|---|---|---|
| Private Function | S/B/C module | Module-private; not exported | Same module | Validation, sorting, diff, normalization, redaction, digest |
| Package ABI Entry | K/S/B/C Package | Only contract-declared entry points | BUILD/Runtime/explicit Package consumer | `getPolicy()`, module identity and declaration entry |
| S Feature Entry | S Feature | Selected Feature export | Domain App through selected Feature mechanism | Semantic decision, rule interpretation, Context composition |
| Business Intent | B + K | Business command contract | UI/Host/Agent Adapter through Host | `proposeReplan`, `approveFeedback` |
| K Facade | Microkernel | Public SDK Facade | Application Host/trusted caller | `send`, `query`, `subscribe`, `stop` |
| Capability Operation | C | BUILD-selected and routed Operation | K through Capability Resource Port | `github.issue.read`, `ads.feedback.publish` |
| Host Port | Host | Trusted Host-internal interface | Host composition, K/controlled C adapter | CAS, credentials, Provider client, physical storage |
| Agent-facing Tool Adapter | Application/Agent Adapter | Separate allowlisted Agent Tool schema | Agent Runtime | Map `replan.propose` to a Business Intent |

### 3.1 Private Function

Examples:

```js
function validateSourceSha(sha) {}
function calculateTaskDiff(previous, proposed) {}
function detectDagCycle(nodes, edges) {}
function redactPrivateData(payload) {}
function calculateEvidenceDigest(evidence) {}
```

Rules:

- Do not export, declare as an Operation, or include in a BUILD route by default.
- No K Permit is required.
- Do not access Providers, Host credentials, or physical stores.
- Prefer deterministic, testable, side-effect-free behavior.
- Do not promote a helper to a Tool merely because an Agent might use it.

### 3.2 Package ABI Entry

A Package exposes only the entry points and data types defined by its ABI. In the v0.10.3 Business Authoring example, `getPolicy()` is a Business ABI entry; it is not an Agent Tool and does not make arbitrary functions inside the module externally callable.

A Package ABI should specify version, entry point, export path, input/output schema, module identity, dependencies, and compatibility. Do not treat all of `src/**` as an implicit public API.

### 3.3 S Standard Feature (non-Tool by default)

An S Feature is an explicitly selected standard semantic capability, such as a Rule, Workflow, Context, or Decision Feature. It may have a Feature Entry invoked by BUILD/Runtime, but an export does not automatically make it an external Tool.

If an S capability must be exposed to an Agent, define a separate Agent-facing Adapter and permission contract. Do not treat an S Feature export as an unrestricted Tool.

### 3.4 Business Intent (business command, not a Tool)

A Business Intent describes what the business actor wants to happen, for example:

- `proposeReplan`
- `approveReplan`
- `approveFeedback`


The request enters the selected Domain App/K Workflow, where K owns Admission, identity, idempotency, state, and Effect governance. An Intent name is not a Capability Operation and grants no Provider authority.

### 3.5 K Query / Subscription (governed observation)

Use the public Microkernel Facade `query()` for authorized snapshots and `subscribe()` for governed events. These are not generic GitHub/SQL Tools and do not authorize arbitrary Journal scans, direct SQLite table access, or bypassing K visibility rules.

If historical observation is needed, first verify whether the existing public Query/Subscription/Host seam is sufficient. Propose a minimal read-only public API only after a real consumer demonstrates a reusable gap.

**Exact v0.10.3 invocation-boundary clarification (from the Shun Assistant consumer):**

- K Facade send() follows the sealed intent route, preflightIntentRouting(), and K submitOccurrence(). queryAuthority participates in query()/subscribe() snapshot/event authorization only; it is not consulted by send(). Never use queryAuthority as an access-control mechanism for Business Intents or send().
- A Host-global / cross-Case Business Intent must use an explicit BUILD-selected Intent route. The Host validates its own one-time requestRef and the trusted Gateway constrains the entry point. K continues to own Admission, Journal, Effect Permit, and UNKNOWN semantics. Do not use the currently selected Guided Case as the authority source for a global Provider operation.
- K Query / Subscription remains limited to K-managed snapshots and events. A domain-owned query over cross-Case Host data may be represented as a read-only Business read intent through send() → B → externalEffect:false read-only C → Host read port. This is not a K Snapshot Query and not an arbitrary SQL Tool.


### 3.6 C Capability Operation (Domain App capability operation)

A C Operation must satisfy all of the following:

1. The C Module is explicitly selected by BUILD.
2. The module declares its Capability identity and explicit `operationId → handler`.
3. The Business/Workflow route matches the Operation/Handler.
4. Input and output use bounded schemas.
5. Runtime reaches the handler only through the K-managed Capability Resource Port.
6. External effects pass the K Effect Permit and corresponding governance checks.

Illustration:

```js
// C module: declared operation handler
export function readIssue(input) {
  // bounded read-only provider adapter
}
```

An export alone does not create a Tool. Tool identity comes from Capability declaration + BUILD selection + route + K-controlled invocation.

### 3.7 Host Port / Host Function

Host owns physical CAS/DocStore, credentials, Provider clients, runtime resources, and trusted composition. Host functions are not Tools by default and must not be exposed to B, the browser, or an Agent.

- Credentials stay inside trusted Host.
- B must not import arbitrary Provider SDKs or read Host secrets.
- C uses Providers through controlled injected Resource/Host seams.
- UI must not directly access physical stores, Journal, or Provider credentials.
- Host supplies physical capabilities; it does not independently decide business approval, Task Admission, or Release qualification.

### 3.8 Agent-facing Tool Adapter

If an Agent needs a Tool interface, add a separate outer Adapter:

```text
Agent Tool request
  -> validate tool schema and actor scope
  -> map to allowlisted Business Intent
  -> trusted Host boundary
  -> selected K Facade.send(intent)
  -> K Admission / Workflow / Effect governance
```

An Agent Tool must not expose arbitrary C Operations or Host Ports. Model output can form a proposal/input; it cannot mint a K Permit, grant permissions, or activate business state by itself.

## 4. Invocation matrix

| Invocation | Applies to | Typical entry | Through K? | Tool? |
|---|---|---|---|---|
| Direct local call | Private helper / pure calculation | Ordinary function call | No | No |
| Selected Feature invocation | S Feature | Selected Feature Entry | Per Feature runtime contract | No |
| Business Intent | Business command | Facade `send(intent)` | Yes | No |
| Snapshot Query | K-managed state read | Facade `query()` | Yes | No |
| Event Subscription | K-managed event observation | Facade `subscribe()` | Yes | No |
| Capability Operation | External capability | K effect handler uses `resources.call(capabilityId, operationId, payload)` | Yes | Yes |
| Host Port invocation | Physical facility/Provider adapter | Trusted injected Host Port | Depends on the governed call path; must not bypass K | No |
| Agent-facing Tool | External Agent protocol | Separate Tool Adapter | Must map into K/Intent governance | Yes, outer Tool |

## 5. Separate read-only and external-effect modules

In the v0.10.3 ABI, `externalEffect` is a **C Module-level** classification, not an overridable per-handler property. Therefore:

| C Module | Example | Classification | Invocation requirement |
|---|---|---|---|
| GitHub Read | Issue/PR/Review readback | `externalEffect: false` | K-managed read-only Resource Call |
| GitHub Effect | Issue/comment/dependency write | `externalEffect: true` | K Effect Permit |
| ADS Read | Read published reports | `externalEffect: false` | Read-only |
| ADS Publisher | Publish Feedback | `externalEffect: true` | K Effect Permit |
| Agent Status | Read Runtime/Attempt status | `externalEffect: false` | Read-only |
| Agent Dispatch | Start/cancel execution | `externalEffect: true` | K Effect Permit |
| CI Status | Read Build status | `externalEffect: false` | Read-only |
| CI Trigger | Trigger Build | `externalEffect: true` | K Effect Permit |

**Do not combine read-only and write handlers in one C Module while expecting per-handler Permit overrides.** If the ABI changes in a future release, rely on that version's public contract and real tests.

External writes must also define Scope, idempotency key, timeout/UNKNOWN behavior, lost-ACK recovery, authoritative readback, and evidence Receipt. An HTTP ACK, Agent self-report, or schema-valid payload alone does not prove that an external fact was committed.

## 6. Functions that should usually remain non-Tools

The following are normally ordinary functions or K Facade calls:

- Input validation, JSON Schema validation, type normalization.
- DAG topological sorting, cycle detection, Task Diff, Replan Candidate calculation.
- Evidence/Feedback projection, redaction, digest.
- Attempt timeline normalization and telemetry coverage calculation.
- UI form dependencies, view formatting, and derived frontend state.
- Business policy decisions (owned by B; authorization remains owned by K).
- K Snapshot Query and Event Subscription.

The deciding factor is not complexity. Ask whether the function crosses a module/trust boundary, accesses an external Provider, needs independent permission, or creates a governed side effect.

Do not introduce ambient-authority Tools for convenience, such as:

```text
github.api(method, url, body)
shell.execute(command)
sql.query(sql)
agent.run(arbitraryPrompt)
woodpecker.execute(anything)
```

Prefer narrow, auditable Operations such as `github.issue.read`, `ads.feedback.publish`, `agent.task.dispatch`, and `woodpecker.build.read`, with explicit read/write module and permission boundaries.

## 7. Minimum Function / Tool contract inventory

For each Package ABI Entry, Business Intent, Capability Operation, Host Port, and Agent-facing Tool, record the applicable fields:

| Field | Requirement |
|---|---|
| Stable ID | Unique, stable Function/Intent/Operation ID |
| Owner | K / S / B / C / Host / UI / Agent Adapter |
| Visibility | Module-private / Package ABI / Selected Capability / Host-only / Agent-facing |
| Invocation | Direct / Feature / Intent / Query / Subscribe / Resource Call / Host Port |
| Input / Output | Bounded schema, version, and refusal semantics |
| Side Effect | None / Read / External Write |
| Authorization | None / K Admission / K Effect Permit / Host policy |
| Scope | Repository / Project / Version / Task / Attempt / resource |
| Idempotency | Key, duplicate-request and replay semantics |
| Timeout / Recovery | Deadline, UNKNOWN, lost ACK, readback |
| Evidence | Receipt, source identity, exact SHA, authoritative readback |
| Privacy | Prohibited forwarding of secrets, private traces, prompts, customer data |

Private helpers need not each be registered as public API, but should be covered by module tests. Every public boundary needs an explicit inventory and positive/negative proof.

## 8. Downstream case studies (not built-in DomainHarness business features)

These examples are for validating architecture boundaries only:

| Downstream task | Ordinary functions / B | K | C / Host |
|---|---|---|---|
| Tally #273 Governed Replan | Validation, Diff, cycle detection, candidate generation, accepted-work preservation | Admission/CAS/append-only revision after approval | Read native Task/DAG; authorized write and readback |
| Tally #274 ADS Feedback | Projection, redaction, schema/eligibility validation, identity | Human decision, Effect Permit, replay/UNKNOWN | Separate ADS Read and Feedback Publisher |
| Tally #275 Attempt Read Model | Attempt projection, state normalization, coverage calculation | Public Query/Subscription and existing governed persistence | Read-only ADS/CI/Agent status adapters; no direct SQLite read |

### 8.1 Questions to verify, not presumed SDK gaps

- Replan Candidate calculation is business computation; candidate activation and external writes are separate boundaries.
- Feedback generation/redaction is local business logic; Publisher and Readback are separate C Operations.
- Attempt Read Model should first compose public K Query/Subscription with already-published external evidence.
- Do not scan SQLite or private Journal directly just because historical Attempt data is needed.
- Whether the public API lacks a particular read-only historical observation capability must be proven using the exact v0.10.3 installed package, public exports, and a minimal clean-consumer reproduction.
- Tally's ADS schema, Replan rules, Attempt lifecycle, and telemetry definitions remain Tally Engineering Domain Package concerns.


### 8.2 Shun Assistant v0.3.0 R03C (real downstream implementation)

Baseline: immutable DomainHarness v0.10.3 tag / source SHA `061376f4a023070f215f9feffad5c24d96d503cb`; Shun integration baseline `be2e81722a70ee3d0bd5634bc83d97d733c20b78`.

The following downstream Host tasks completed and passed their corresponding exact-SHA Woodpecker pipelines:

| Shun task | Exact delivery SHA | CI | Proven behavior |
|---|---|---|---|
| #285 Meta Consent / SQLite | `542066dbe3330f716f2fa466b21cadf3c8dc0808` | Push #219 / PR #220 SUCCESS | Durable declaration_seq; opt-out/re-opt-in does not resurrect old experience; snapshot-consistent cross-Case query |
| #287 Provider Host-global | `2f4ca411e21f62e1cb9df0659cb8d4c137256825` | Push #221 / PR #222 SUCCESS | requestRef-only Host ledger; raw stdout/stderr excluded from returned envelope and SQLite; closed-world Preview/Receipt schemas |
| #289 Signed privilege contract | `593140928caf5a797abb89d799799fc54796a3aa` | Push #201 / PR #203 SUCCESS | requiredPrivilege is part of the signed descriptor; omission defaults to USER; ELEVATED is allowed only for signed CLI |

These are downstream implementation/CI facts. They are not real Windows UAC/Provider installation validation, do not mean Shun R03C production integration is complete, and do not establish a DomainHarness SDK defect.

#### Reusable implementation lessons

1. **Separate send from queryAuthority:** v0.10.3 queryAuthority governs K Query/Subscription, not send(). Shun #288 initially proposed using queryAuthority as the send() Business-route ACL for Provider-global; the Owner amendment corrected this to Host requestRef plus a BUILD-selected Business Intent route.
2. **Host-global Provider:** Host prepare/confirm issues and consumes a one-time requestRef; the K payload contains only requestRef. Provider privilege must come from curator-signed requiredPrivilege and cannot be overridden by Host configuration.
3. **Separate Meta reads from writes:** Feedback writes and shared-experience queries use different C Modules; the query C must be externalEffect:false. A cross-Case domain query enters the same K through an explicit read-only Business read intent and then a read-only Host port; it is not a generic K Query, direct SQLite access, or SQL Tool.
4. **Match the actual Store contract:** #285 currently accepts targetCaseRef, capabilityId, optional taskClass, and bounded limit. The original tags filter in #288 had no corresponding Store API; remove it or explicitly extend and verify the Store contract rather than guessing in the Integrator.
5. **Consent currentness:** revision is an opaque identifier, not an ordering primitive. #285 exposed a lexical-order bug where consent-rev-2 opt-in could outrank a later consent-rev-10 opt-out. The repair uses a durable transactional declaration_seq shared by every write/authorization/query path.
6. **Host output privacy:** Provider-controlled stdout/stderr must not be returned or persisted. Retain only a strictly parsed version token and bounded canary enum. Preview, elevatedAction, and durable receipts use exact-key/allowlist schemas, with equivalent validation on SQLite decode.
7. **Converge the Package ABI:** Shun's public @shun/domain-app root exported both the trusted gateway and legacy composeDomainBuild. The latter contains old structural mirrors and placeholder K/S bytes; it is not the production path. Shun #303 is restricting it to internal/test-preview use. Production uses composeTrustedRuntimeBuild plus the real public v0.10.3 buildV10App/activateV10App path.
8. **Prove package provenance:** Shun's clean consumer uses local SDK tarballs and SHA256SUMS. Record the source tag/SHA separately from each package's package.json version. Do not judge the v0.10.3 Git source solely by its embedded 0.10.2-rc.0 package version. A packed consumer test is not equivalent to real Windows Host/UAC validation.

Shun tracking: [#280](https://github.com/kaicreator-mm/shun-assistant/issues/280), [#285](https://github.com/kaicreator-mm/shun-assistant/issues/285), [#287](https://github.com/kaicreator-mm/shun-assistant/issues/287), [#288](https://github.com/kaicreator-mm/shun-assistant/issues/288), [#289](https://github.com/kaicreator-mm/shun-assistant/issues/289), [#303](https://github.com/kaicreator-mm/shun-assistant/issues/303); PRs [#300](https://github.com/kaicreator-mm/shun-assistant/pull/300), [#301](https://github.com/kaicreator-mm/shun-assistant/pull/301), [#302](https://github.com/kaicreator-mm/shun-assistant/pull/302).

## 9. Implementation verification requirements

Before adding or changing public mechanisms, complete at least:

1. **Contract inventory:** list Package ABI, S Feature, Business Intent, K Query/Subscription, C Operation, Host Port, and Agent Tool Adapter.
2. **BUILD proof:** prove that only selected modules, operations, and routes execute; invalid/missing routes typed-refuse.
3. **Private-boundary proof:** ordinary helpers are not automatically registered or exposed.
4. **Read/effect separation:** read-only C does not need an external Effect Permit; missing/expired Permit on effect C produces zero Provider dispatches.
5. **Positive/negative consumer proof:** validate published package artifacts in a clean external Consumer, not only monorepo source imports.
6. **Recovery proof:** lost ACK, duplicate request, STALE source, and UNKNOWN outcome have verifiable readback/reconciliation.
7. **Security proof:** Browser/Agent/B cannot directly obtain Host secrets, arbitrary Provider, SQL, or Shell authority.
8. **Evidence:** record exact tag/SHA, Node/Host mode, command, actual EXIT, CI URL, failure ID, and independent Review.

The reusable v0.10.3 reference is the [Package Authoring Example](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.3/examples/v0102-package-authoring). It demonstrates a private B helper, Business `getPolicy()`, separate read-only/effect C Modules, explicit Operation routing, permitted dispatch, and a permitless zero-dispatch negative. The example does not replace exact-SHA external-consumer acceptance for a future release.

## 10. Continuous implementation lessons

This document defines design boundaries. The active experience register is [Issue #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465). Add a concise comment with a stable Lesson ID for each material implementation lesson, or create one linked child Issue for an independently reusable concern.

Each lesson should record: date, downstream repo/Issue/PR, exact DomainHarness tag/SHA, Node/Host, selected K/S/B/C and BUILD routes, minimal reproduction, Expected/Actual, real command and EXIT (write `NOT_RUN` if not run), classification, confirmed root cause or `UNKNOWN`, temporary workaround, disposition, repaired Exact SHA, and verification evidence.

Classify separately: Consumer misuse, documentation/integration friction, Host wiring, BUILD/ABI contract gap, SDK defect, reusable Product feature, CI/OS environment issue, and positive success pattern. **One downstream example does not automatically prove a general SDK defect.**

Never upload credentials, private task-meta data, raw traces, hidden tests, customer data, or unauthorized private-project content. Do not add automatic telemetry or background reporting. Every real SDK change still requires separate Product/L2/Task DAG, write set, CAS admission, Review, CI, and Release gates.

---

## References

- [DomainHarness v0.10.3 immutable tag](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.3) — `061376f4a023070f215f9feffad5c24d96d503cb`
- [v0.10.3 Package Authoring Example](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.3/examples/v0102-package-authoring)
- [Business Capability Tool guide](../guides/V0102_BUSINESS_CAPABILITY_TOOL.md)
- [Package Authoring guide](../guides/V0102_PACKAGE_AUTHORING.md)
- [SDK feedback process](../feedback/SDK_USAGE_FEEDBACK.md)
- [Issue triage and continuous improvement](../feedback/ISSUE_TRIAGE_PROTOCOL.md)
- [Tally #273](https://github.com/kaicreator-mm/tally/issues/273) · [#274](https://github.com/kaicreator-mm/tally/issues/274) · [#275](https://github.com/kaicreator-mm/tally/issues/275)
- [Tracking Issue #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465)
