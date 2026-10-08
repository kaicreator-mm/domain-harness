# DomainHarness v0.7 — Product Direction Checkpoint

**Status:** `L1_DIRECTION / NOT_PRODUCT_FREEZE`  
**Integration branch:** `version/v0.7`  
**Branch base:** `main@040c3ff244da28f6253fb9c179c66b730caae4cd`  
**Base tree:** `fb25352f3fe9d009d4757f2601d980d18b1d64bb`

## Direction

`domain-harness` is the core SDK / compiler / Runtime of the Domain Application ecosystem. v0.7 owns the Product/L1 research and definition of the internal `DomainDataComponent` model and the abstractions needed by Domain Apps to compose executable domain behavior.

This direction supersedes the earlier assumption that `domain-application-contract` should own a canonical internal Domain Data component taxonomy.

## Ownership

DomainHarness owns the internal SDK model, including the eventual validated form of:

- `DomainDataComponent`;
- component kinds / profiles / facets;
- capability identity and capability composition;
- Workflow / Skill / Tool / Schema / Policy / Rule / Projection / Resource / Memory-or-context abstractions where justified;
- Agent/profile/composition abstractions where justified;
- compiler/IR/runtime mapping;
- executable package/runtime semantics;
- extension/adopter mechanisms;
- reference implementation used to validate the abstractions.

`domain-application-contract` remains a minimized cross-project coordination contract and may later consume only the exact references, lifecycle handoffs, authority boundaries, compatibility and exchange envelopes materially required between ecosystem services.

## v0.7 product question

> What is the smallest stable and extensible DomainDataComponent + Capability/Profile/Extension model that can serve as the core DomainHarness SDK, be implemented and executed by DomainHarness itself, and then allow Forge, Simulator, UX and domain-ai-creator to bootstrap onto the same SDK without coupling them to accidental Raw/compiler internals?

## Evidence-first sequence

```text
L1 / research
  -> provisional component/meta-model
  -> Harness reference implementation / executable validation
  -> implementation findings
  -> Product/L2 refinement
  -> frozen Harness SDK contract
  -> Forge / Simulator / UX / domain-ai-creator adoption and bootstrap
```

The component model MUST NOT be frozen before a real DomainHarness reference implementation has challenged the abstraction.

## Research inputs

Use accepted evidence from `kaicreator-mm/harness-research`, current DomainHarness source, and bounded current-source studies of mature agent/harness systems including Claude Code Mods/Skills/subagents where relevant.

Historical DAC work (#147/#149/#150/#151/#153/#154/#155/#156) is research input only. It is not v0.7 Product or architecture authority.

## Non-goals at this checkpoint

- no Product Freeze;
- no L2 Freeze;
- no canonical ten-kind taxonomy freeze;
- no premature `AgentDefinition` or `MemoryDefinition` commitment;
- no provider/model routing migration into DomainHarness;
- no replacement of Runtime/domain transition authority with an Agent model;
- no Forge/Simulator/UX implementation yet;
- no claim that the current Raw package model is the final public component model.

## Expected L1 outputs

1. current source/domain-package capability inventory;
2. mature-agent/harness evidence synthesis;
3. stable-core vs extension boundary;
4. `Kind` vs `Profile` vs `Facet` vs `Capability` decision evidence;
5. version/evolution model for component definitions;
6. Agent / Skill / Tool / Workflow / Memory/Context placement analysis;
7. provisional meta-model candidate;
8. executable reference-implementation experiment plan;
9. ecosystem bootstrap impact for Forge / Simulator / UX / domain-ai-creator;
10. PRD candidate authorization decision.

This file records direction only. GitHub Issues are the durable execution authority for L1/research work.