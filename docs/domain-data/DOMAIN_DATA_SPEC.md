# Domain Data Specification

> Chinese companion: `DOMAIN_DATA_SPEC.zh-CN.md`.
>
> Status: cross-project authoring/governance specification derived from the DomainHarness frozen PRD. It defines how domain projects should structure and govern Domain Data. It is **not** a new DomainHarness v0.1 Runtime schema. Only the executable Harness subset is parsed by DomainHarness.

## 1. Definition

**Domain Data** is the long-lived, versioned representation of domain knowledge, execution definitions, constraints, schemas, patterns and evidence owned by a domain project.

It is broader than a database and broader than a Harness definition.

Conceptually:

```text
Domain Data
├─ Domain authority definitions
├─ Executable Harness assets
├─ Decision / routing rules
├─ Constraints / validation rules
├─ Domain schemas
├─ Skills
├─ Workflows
├─ Facts / references
├─ Technical patterns
├─ Recipes / templates
├─ Examples / counterexamples
├─ Tool usage policies
└─ Validation / evidence assets
```

Domain Data is an asset of the **domain project**, not of DomainHarness Runtime.

## 2. Core principles

### DD-P1 — Domain ownership

Every Domain Data asset MUST have a clear domain owner. DomainHarness may load or execute an asset but does not become its semantic authority.

### DD-P2 — Files first, primitives only when execution requires them

Most domain knowledge SHOULD remain ordinary versioned files. Do not invent a Runtime primitive for every rule, pattern or knowledge object.

### DD-P3 — Separate truth from execution projection

An executable Workflow may project or coordinate domain state, but it MUST NOT silently become the authoritative business model unless the domain project explicitly defines that authority.

### DD-P4 — Deterministic knowledge before AI

If a decision can be represented as schema, constraint, expression, deterministic Script or explicit Tool policy, prefer that over implicit LLM judgment.

### DD-P5 — Explicit provenance

Facts, rules and examples that affect important decisions SHOULD identify their source, owner or rationale so that future Agents can distinguish evidence from convention.

### DD-P6 — Versionable and reviewable

Domain Data MUST be representable in source control or another auditable versioned authority. Changes that alter behavior must be reviewable like code.

### DD-P7 — No secret material

Domain Data MUST NOT contain production credentials, provider secrets or private tokens. Tools/AI Runtime own credentials through host configuration.

## 3. Asset classes

Domain Data is organized into six logical classes. A project may choose different physical directories, but SHOULD preserve these semantic distinctions.

### 3.1 Authority assets

Authority assets define domain truth and invariants.

Examples:

- domain entity/schema definitions;
- state meanings;
- TaskDAG semantics;
- publishing governance;
- knowledge promotion rules;
- creative-quality definitions;
- trade-claim policy;
- CompletionContract;
- permission/ownership rules.

Authority assets are normally consumed by domain code, administrators and authoring Agents. DomainHarness does not automatically interpret them.

### 3.2 Executable Harness assets

These are directly consumed by DomainHarness v0.1:

```text
harness.yaml
workflows/*.yaml
skills/<id>/SKILL.md
skills/<id>/skill.harness.yaml
referenced JSON Schemas
referenced Skill resources/assets
referenced executable Script source
```

They must follow the separate Harness Technical Specification.

### 3.3 Knowledge/reference assets

These provide factual or explanatory context without becoming Runtime control primitives.

Examples:

```text
references/
  regulations.md
  product-evidence.md
  domain-glossary.md
  terminology.md
  case-studies.md
  source-notes.md
```

Skills may declare selected reference files as resources. Tools and authoring Agents may also use them.

### 3.4 Pattern and recipe assets

Patterns describe reusable domain approaches; recipes describe repeatable application of those patterns.

Examples:

```text
patterns/
  high-confidence-extraction.md
  buyer-question-coverage.md

recipes/
  create-b2b-product-page.md
  resolve-knowledge-conflict.md
```

A Pattern is usually explanatory and constraint-oriented. A Recipe may later map to a Workflow, but it is not automatically executable.

### 3.5 Example assets

Examples and counterexamples make domain quality concrete.

Recommended split:

```text
examples/
  positive/
  negative/
  edge-cases/
```

Each important example SHOULD explain why it is correct/incorrect. Example labels without rationale are weak training/authoring assets.

### 3.6 Validation/evidence assets

These prove that Domain Data and its executable projection behave as intended.

Examples:

- fixture inputs;
- expected outputs;
- Critical Journeys;
- counterexample cases;
- schema-validation cases;
- domain review checklists;
- held-out validation definitions kept outside public tuning paths where appropriate.

## 4. Recommended repository layout

This is a recommended convention, not a DomainHarness parser requirement:

```text
domain/
├─ README.md
├─ glossary/
├─ authority/
├─ schemas/
├─ rules/
├─ constraints/
├─ references/
├─ patterns/
├─ recipes/
├─ templates/
├─ examples/
│  ├─ positive/
│  ├─ negative/
│  └─ edge-cases/
├─ validation/
└─ harness/
   ├─ harness.yaml
   ├─ workflows/
   ├─ skills/
   └─ scripts/
```

A project may keep `harness/` at repository root or under another project-specific directory. The key rule is semantic ownership, not the exact folder name.

## 5. Asset metadata convention

DomainHarness v0.1 does not require a global Domain Data manifest. Projects MAY add repository-level metadata for governance.

Recommended metadata fields when an asset needs explicit governance:

```yaml
id: buyer-question-coverage
kind: pattern
owner: forge-content
status: active
version: 1
source:
  - type: project-evidence
    ref: docs/research/...
related:
  - recipes/create-product-page.md
  - harness/skills/plan-page/SKILL.md
```

This metadata is a project convention unless a specific domain project defines a stronger schema. DomainHarness must not begin parsing it implicitly.

## 6. Authority levels

A domain project SHOULD classify important assets by authority so Agents know what they may change.

Recommended levels:

```text
FROZEN       approved authority; changes require formal re-opening/version process
CONTROLLED   active normative rule; change through review
REFERENCE    informative source/context; not a rule by itself
EXAMPLE      illustrative; never treated as universal truth
DERIVED      generated projection; regenerate from upstream authority
```

Do not allow an `EXAMPLE` or `DERIVED` artifact to silently override a `FROZEN` or `CONTROLLED` authority.

## 7. Domain schemas

Schemas describe stable data contracts and should be independent of AI provider/model details.

Use JSON Schema where Runtime validation is required. Domain projects may use additional schema technologies for domain modeling, but the Harness-executable boundary must provide portable JSON-compatible contracts.

Schema guidance:

- make required fields explicit;
- avoid ambiguous unions when a discriminated structure is possible;
- define enums only when the domain set is genuinely controlled;
- distinguish missing from `null` intentionally;
- include constraints that can be checked deterministically;
- do not encode business workflow transitions inside schema descriptions.

Schemas used directly by DomainHarness are compiled with Ajv Draft 2020-12 behavior.

## 8. Rules and constraints

Rules SHOULD be categorized before implementation:

| Rule type | Preferred representation |
|---|---|
| structural validity | JSON Schema |
| simple deterministic mapping/check | JSONata Expression |
| complex deterministic algorithm | Script |
| authoritative external/domain decision | Tool/domain code |
| semantic assessment/recommendation | Skill |
| multi-step execution ordering | Workflow |
| reusable sequential subflow | Child Workflow |

This prevents a common failure mode where every rule becomes either opaque code or an LLM prompt.

## 9. Skills as Domain Data

A Skill is an AI-oriented domain capability package, not an autonomous workflow.

A high-quality Skill package SHOULD contain:

- clear task intent;
- domain instructions;
- declared references/resources;
- examples/counterexamples when they improve quality;
- input schema when useful;
- required output schema;
- optional opaque execution profile.

A Skill MUST NOT:

- own durable Workflow transitions;
- call other Harness Skills behind the Runtime;
- hide Tool side effects;
- contain provider/model-specific routing logic;
- mutate authoritative domain state directly.

## 10. Workflow as Domain Data

Workflow YAML is domain-owned executable policy.

It describes **when** generic primitives are executed and how validated results are routed.

Workflow SHOULD express stable domain process structure, not UI implementation details or provider strategy.

Good Workflow content:

```text
collect → validate → review → approve → commit
```

Poor Workflow content:

```text
click button X → render modal Y → call GPT-5.6 → sleep 3 seconds
```

The first is domain process. The second leaks UI/provider/implementation behavior into Domain Data.

## 11. Tool policy as Domain Data

Although Tool implementation code is host-owned, its intended domain policy SHOULD be documented in Domain Data.

Recommended Tool policy record:

```text
Tool name
Domain purpose
Input/output contract
Authority touched
Credentials/system used
Effect class: none | idempotent | non-idempotent
Idempotency mechanism
Expected failure classes
Timeout/cancellation expectation
Authorization requirement
```

This makes side effects understandable to both humans and Agents without moving credentials or implementation code into the Harness.

## 12. References and facts

A factual reference SHOULD distinguish:

- fact/source statement;
- project interpretation;
- derived rule;
- unresolved uncertainty.

Recommended pattern:

```markdown
## Claim
...

## Source
...

## Interpretation
...

## Operational consequence
...

## Confidence / unresolved questions
...
```

Do not convert uncertain evidence into a hard constraint without recording that decision.

## 13. Patterns, recipes and templates

Use these terms consistently:

**Pattern** — reusable solution principle or structure.

**Recipe** — concrete sequence for applying one or more patterns to a recurring domain task.

**Template** — reusable output/input skeleton with placeholders.

**Workflow** — executable state/Step definition interpreted by DomainHarness.

A Recipe may reference a Workflow, but they are not synonyms.

## 14. Examples and counterexamples

Examples SHOULD cover:

- normal case;
- boundary case;
- negative/counterexample;
- ambiguous case when the domain contains genuine uncertainty.

Counterexamples are especially valuable for Skills and review rules because they define what must not be accepted.

Do not let examples become hidden normative rules. If an example reveals a true rule, promote that rule into a CONTROLLED/FROZEN rule asset.

## 15. Change management

Domain Data changes fall into three categories:

### Editorial

Text/organization change with no intended behavioral effect.

### Behavioral-compatible

Clarifies or extends data while preserving existing executable contracts and active-run compatibility.

### Behavioral-breaking

Changes Workflow routing, schemas, Skill semantics, Script bytes, declared resources or other content that may alter `definitionHash` or domain outcomes.

Behavioral-breaking changes SHOULD:

- receive domain-owner review;
- update validation fixtures/Critical Journeys;
- consider active Runs;
- create a new Harness definition hash when executable assets change;
- record downstream migration implications.

## 16. Localization

When Domain Data is multilingual:

- choose one canonical semantic identifier independent of display language;
- do not translate IDs used by executable contracts;
- separate display copy from rule identity;
- ensure translated references preserve the same authority level;
- record when a translation is derived and which source language/version it follows.

Translation must not silently change rule meaning.

## 17. Generated/derived assets

Generated assets MUST declare their upstream source and regeneration path when they can be reproduced.

Examples:

```text
compiled lookup table
search index
generated prompt bundle
derived examples
materialized workflow projection
```

Do not manually edit a generated derivative if the authoritative source exists elsewhere; regenerate it.

## 18. Domain Data quality gates

A mature domain should be able to answer YES to:

- Is each important rule owned by a domain team/project?
- Can we distinguish authority, reference, example and derived data?
- Are executable assets separated from supporting knowledge?
- Are external side effects described by explicit Tool policy?
- Are deterministic constraints encoded deterministically where practical?
- Are Skills schema-bounded and provider-neutral?
- Are facts/provenance distinguishable from project interpretation?
- Are examples accompanied by rationale?
- Are breaking Domain Data changes reviewable/versioned?
- Can an Agent determine what it may edit and what it must not reinterpret?

## 19. What DomainHarness v0.1 actually parses

To avoid ambiguity, v0.1 Runtime directly parses only the executable Harness contract and referenced assets:

```text
harness.yaml
workflows/*.yaml
skills/*/SKILL.md
skills/*/skill.harness.yaml
referenced JSON Schema
referenced Skill resource/asset files
referenced Script source
```

Patterns, recipes, facts, templates, domain authority docs and many examples remain normal files unless explicitly declared as Skill resources or consumed by host/domain tooling.

This is intentional. DomainHarness is an execution runtime, not a universal domain knowledge database.

## 20. Relationship to other specifications

- Runtime architecture: `../architecture/DomainHarness_ARCHITECTURE.md`
- Integration boundary: `../architecture/DOMAINHARNESS_INTEGRATION_MODEL.md`
- Domain Data authoring: `DOMAIN_DATA_AUTHORING_GUIDE.md`
- Harness execution contract: `../harness/HARNESS_TECHNICAL_SPEC.md`
- Harness authoring guidance: `../harness/HARNESS_AUTHORING_GUIDE.md`
