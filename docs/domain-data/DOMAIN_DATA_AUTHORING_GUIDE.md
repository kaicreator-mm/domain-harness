# Domain Data Authoring Guide

> Chinese companion: `DOMAIN_DATA_AUTHORING_GUIDE.zh-CN.md`.
>
> This guide explains how a human or coding Agent can transform existing project knowledge, rules and workflow behavior into maintainable Domain Data without moving business authority into DomainHarness.

## 1. Goal

The goal is **not** “convert the project to YAML.”

The goal is:

```text
existing domain behavior
→ identify authority and stable knowledge
→ make rules/constraints explicit
→ separate deterministic logic from AI judgment
→ isolate external side effects
→ represent reusable execution as Harness assets where appropriate
→ validate against real Critical Journeys
```

A successful extraction makes the domain easier to understand, review and evolve even if some assets never become executable Harness files.

## 2. Inputs required before authoring

An Agent should collect, at minimum:

- current PRD/product authority;
- architecture and important decision records;
- domain schemas/types;
- representative service/business code;
- existing prompts/Skills;
- validation/test cases;
- real Critical Journeys;
- external integration list;
- domain glossary or terminology if one exists;
- known examples and failure cases.

Do not infer missing domain policy from implementation accidents without marking it as inference for review.

## 3. Stage 0 — Pin authority

Before extracting anything, identify which artifacts are authoritative.

Create an authority table:

| Area | Authority | Status | May Agent change? |
|---|---|---|---|
| product scope | PRD | FROZEN | no |
| domain schema | schema/type docs | CONTROLLED | review only |
| workflow behavior | current production + tests | CONTROLLED | proposal |
| examples | fixtures/docs | EXAMPLE | yes, with review |
| generated reports | build/output | DERIVED | regenerate |

This prevents a common failure: an Agent reads an example or stale implementation and promotes it to a new domain rule.

## 4. Stage 1 — Build a domain inventory

Scan the project for domain concepts and record them before choosing Runtime primitives.

Recommended inventory columns:

```text
concept
meaning
owner
source files/docs
authority level
inputs
outputs
side effects
decisions/constraints
AI involvement
current validation
candidate Domain Data class
```

Typical sources include:

- TypeScript interfaces/types;
- database models/migrations;
- API schemas;
- business services;
- validation functions;
- prompts;
- workflow code;
- admin configuration;
- tests;
- documentation;
- historical incidents/issues.

The inventory is a discovery artifact, not yet the final Domain Data model.

## 5. Stage 2 — Separate six kinds of information

For every discovered item, ask which class it belongs to:

1. **Authority** — defines domain truth/invariant.
2. **Executable** — should participate directly in Harness execution.
3. **Reference** — factual/context material.
4. **Pattern/Recipe** — reusable domain approach.
5. **Example** — illustration/counterexample.
6. **Validation/Evidence** — proves behavior.

One source file may contain several classes. Split semantically when that improves ownership and reviewability.

## 6. Stage 3 — Normalize vocabulary

Before writing Workflows or Skills, build/clean the domain glossary.

For each important term record:

```text
canonical id/name
human label(s)
definition
not-the-same-as
owner
examples
```

Avoid using multiple terms for the same domain concept across Workflow IDs, Skill names and Tool names.

Identifiers used by executable assets should be stable, lowercase and semantic. Display/localized names belong outside IDs.

## 7. Stage 4 — Extract rules and constraints

Read code/tests/docs for statements equivalent to:

```text
must
must not
only when
required
invalid if
before
after
at least
at most
if ... then ...
```

For each rule capture:

```text
Rule ID
Statement
Authority/source
Inputs
Expected outcome
Failure meaning
Deterministic? yes/no
Current implementation
Target representation
Examples/counterexamples
```

Do not immediately encode the rule in a prompt. First choose the strongest deterministic representation available.

## 8. Stage 5 — Choose the correct representation

Use this decision model:

### 8.1 Is it structural validity?

Use JSON Schema.

Examples:

- required field;
- number/string constraints;
- enum/discriminator;
- payload shape.

### 8.2 Is it a simple deterministic mapping or predicate?

Use JSONata Expression.

Examples:

- derive a field;
- select/filter JSON;
- threshold check;
- deterministic route condition.

### 8.3 Is it complex deterministic logic with no external I/O?

Use Script.

Examples:

- graph traversal;
- scoring algorithm;
- complex parsing;
- deterministic normalization.

### 8.4 Does it touch an external system or authoritative domain state?

Use Tool/domain code.

Examples:

- database mutation;
- API request;
- file/object storage;
- GitHub action;
- queue publish.

### 8.5 Does it require semantic judgment/generation?

Use Skill.

Examples:

- classify ambiguous text;
- generate a proposal;
- semantic review;
- summarize evidence.

The Skill output should still be schema-bounded.

### 8.6 Is it multi-step sequencing?

Use Workflow, optionally Child Workflow for reusable same-Harness subflows.

### 8.7 Is it domain truth but not execution?

Keep it as authority/reference/rule documentation. Do not force it into Runtime.

## 9. Stage 6 — Design Tool boundaries first

Before writing a Workflow, list all side effects in the Critical Journey.

For each side effect define:

```text
Tool name
purpose
input schema/shape
output schema/shape
authority touched
external system
credentials
transaction behavior
effect classification
idempotency mechanism
retry responsibility
timeout/cancel expectation
```

Effect classification:

- `none`: no externally visible side effect;
- `idempotent`: replay with the same identity is safe/controlled;
- `non-idempotent`: uncertain interruption must not auto-replay.

If the team cannot confidently classify a Tool, do not proceed as though crash recovery is solved.

## 10. Stage 7 — Design Skills as bounded domain capabilities

A Skill should be small enough that one invocation represents one semantic AI operation.

Author in this order:

1. define output schema;
2. define task intent;
3. gather minimum necessary references;
4. add decision rules/instructions;
5. add positive and negative examples where useful;
6. define input schema if needed;
7. assign an opaque execution profile only if AI Runtime strategy needs one.

Avoid giant Skills that contain an entire business process.

A Skill should answer a question such as:

> Given this structured input and these domain references, produce this structured domain assessment/proposal.

It should not answer:

> Decide what the application should do next, call whatever services you need and mutate the business record.

## 11. Stage 8 — Author Workflow from domain process, not UI flow

Write the process first as a plain text sequence:

```text
load authoritative context
→ create proposal
→ deterministic validation
→ domain review
→ wait for approval
→ commit authoritative change
```

Then map each operation to a primitive.

Do not include UI rendering steps, provider selection or arbitrary sleeps.

A good Workflow state name describes domain/execution meaning:

```text
build_proposal
validate
await_approval
commit
completed
failed
```

A poor state name mirrors implementation/UI detail:

```text
show_modal
call_gpt4
sleep_3s
controller_step_7
```

## 12. Stage 9 — Build references, patterns and recipes

Not everything belongs inside Skills or Workflow YAML.

Move reusable explanatory material into references/patterns/recipes.

A useful Pattern document should contain:

- problem/context;
- when to use;
- invariant/constraints;
- recommended structure;
- failure modes;
- examples/counterexamples;
- related Skills/Workflows/Tools.

A useful Recipe should contain:

- prerequisites;
- ordered domain steps;
- selected patterns;
- expected artifacts;
- review points;
- optional executable Workflow reference.

## 13. Stage 10 — Build validation assets before broad migration

For each migrated Critical Journey prepare:

- representative normal input;
- boundary input;
- invalid input;
- counterexample;
- expected Tool call count/effects;
- expected waiting points;
- expected domain outcome;
- expected Runtime status;
- crash/recovery case for important side effects.

Separate domain outcome from Runtime success/failure.

Example:

```text
Domain outcome: rejected
Runtime status: completed
```

This is different from:

```text
Runtime status: failed
error: tool_error
```

## 14. Stage 11 — Promote only after review

Newly extracted Domain Data should normally begin as draft/proposed material.

Promotion checklist:

- domain owner reviewed meaning;
- authority conflicts resolved;
- deterministic vs AI representation reviewed;
- Tool effects classified;
- schemas compile;
- executable references resolve;
- examples/counterexamples exist for important rules;
- one Critical Journey validates end-to-end;
- no duplicate business authority introduced.

Only then should the project mark the asset CONTROLLED/FROZEN according to its own governance.

## 15. Code-to-Domain-Data extraction patterns

### Existing validation function

Before:

```text
validateRequest(x)
```

Ask:

- shape constraint? → JSON Schema;
- deterministic cross-field rule? → Expression/Script;
- authoritative business lookup? → Tool/domain service;
- semantic ambiguity? → Skill.

### Existing service orchestration

Before:

```text
service A → prompt → API → if/else → DB update
```

Possible decomposition:

```text
Tool(read domain state)
→ Skill
→ Expression/Script validation
→ waiting/review if needed
→ Tool(commit)
```

### Existing prompt file

Split:

```text
stable task intent/instructions → SKILL.md
input/output structure          → JSON Schema
reference facts                 → references/
workflow branching              → Workflow
external action                 → Tool
```

### Existing rules spreadsheet

Split rows by semantics:

- controlled enum/threshold → schema/expression;
- complex rule → Script/domain rule file;
- human interpretation → reference/pattern;
- semantic judgment → Skill instruction + examples.

## 16. Agent operating procedure

When using a coding Agent, give it a constrained task.

Recommended sequence:

1. read frozen project authority;
2. read Domain Data Spec;
3. produce inventory only;
4. produce a proposed classification/migration map;
5. identify conflicts/unknowns;
6. get review or use existing authority to resolve them;
7. implement one asset class/one Critical Journey;
8. validate;
9. only then continue.

Do not ask an Agent:

> Convert the entire project to DomainHarness.

Prefer:

> Analyze Critical Journey X. Produce a mapping of each step to domain authority/reference/schema/Expression/Script/Skill/Tool/Workflow. Do not change code yet. Identify all side effects and classify Tool effects. Preserve the frozen PRD and current domain authority.

## 17. Agent handoff template

```text
Task: Extract Domain Data and prepare one DomainHarness migration slice.

Authority:
- Product/PRD: <path/ref>
- Architecture: <path/ref>
- Development standard: <path/ref>
- Domain Data Spec: docs/domain-data/DOMAIN_DATA_SPEC.md
- DomainHarness SDK/technical docs: <exact SHA + paths>

Target Critical Journey:
<journey>

Required outputs before implementation:
1. domain concept inventory;
2. authority/reference/example/derived classification;
3. rule/constraint table;
4. primitive mapping (Schema/Expr/Script/Skill/Tool/Workflow/keep-in-domain);
5. Tool side-effect/effect classification;
6. proposed directory/assets;
7. validation cases;
8. unresolved contradictions.

Rules:
- do not reopen frozen scope;
- do not move domain authority into DomainHarness;
- deterministic before AI;
- external side effects must remain Tools/domain code;
- do not introduce provider-specific model logic into Skills/Workflows;
- implement only after the mapping is internally consistent.
```

## 18. Review questions

A reviewer should challenge the extraction with questions such as:

- Is this really a domain rule or only an implementation detail?
- Why is this AI instead of deterministic logic?
- Why is this Script instead of domain code/Tool?
- Is this Tool truly idempotent?
- Where is the authoritative data written?
- What happens after a crash at this exact boundary?
- Is the example being treated as a rule?
- Does this reference have provenance?
- Can the Child Workflow operate with explicit input instead of reaching into parent state?
- Is the Workflow expressing domain process or UI/provider mechanics?

## 19. Quality indicators

Good Domain Data tends to have:

- stable semantic vocabulary;
- small bounded Skills;
- explicit side-effect Tools;
- strong schemas;
- many deterministic checks;
- examples plus counterexamples;
- traceable provenance;
- clear owner/authority;
- reusable patterns/recipes;
- thin Workflows whose states are understandable to a domain expert;
- validation tied to Critical Journeys.

Poor Domain Data tends to have:

- giant prompts;
- giant opaque Scripts;
- provider names embedded everywhere;
- undocumented Tool effects;
- duplicated domain state;
- workflows mirroring UI/controller code;
- examples with no rationale;
- no distinction between source fact and project interpretation.

## 20. Maintenance loop

Domain Data is expected to evolve continuously:

```text
real usage / incident / new evidence
→ identify knowledge/rule gap
→ update authority/reference/pattern/example
→ update executable asset only when needed
→ rerun affected validation/Critical Journey
→ record behavior/version impact
```

The objective is gradual accumulation of explicit domain capability, not continuous growth of Runtime complexity.

## 21. Related documents

- `DOMAIN_DATA_SPEC.md`
- `../harness/HARNESS_AUTHORING_GUIDE.md`
- `../harness/HARNESS_TECHNICAL_SPEC.md`
- `../architecture/DOMAINHARNESS_INTEGRATION_MODEL.md`
- `../sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md`
