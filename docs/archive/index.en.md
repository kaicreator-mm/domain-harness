# DomainHarness — Historical archive and provenance map

[Documentation hub](../README.md) · [中文版](index.zh-CN.md) · [Current English handbook](../current/en/index.md) · [Governing references](../reference/index.en.md)

> **This archive is for provenance, not current API usage.** Records are grouped for discovery only; original files and old links remain untouched, and historic failures are not silently reclassified as PASS. See the separate [governing reference index](../reference/index.en.md) for frozen decisions that are still binding.

## Browse by concern

| Historical material | Original location | Interpretation |
| --- | --- | --- |
| Product/PRD/amendments | [product/](../product/) | Version-specific freeze, not an SDK tutorial |
| L2 designs, reviews, candidates and freezes | [architecture/](../architecture/) | Keep `CANDIDATE` distinct from `FREEZE` |
| Task DAG, L3 implementation records | [implementation/](../implementation/) · [tasks/](../tasks/) | As-of planning and execution history |
| Real validation, failures and Hidden/CI receipts | [validation/](../validation/) | Preserve literal `PASS`, `FAIL`, `NOT_RUN` |
| Legacy API, SDK and user manuals | [sdk/](../sdk/) · [manual/](../manual/) | Do not adopt v0.1 or candidate APIs as current |
| Original Package/Host/Tiny/Rich engineering drafts | [guides/](../guides/) · [agents/](../agents/) | Historical implementation context, not the current entry |
| Older migrations and Host integrations | [migration/](../migration/) · [integration/](../integration/) | Use only for their specified version pair |
| Research, experiments, domain data | [research/](../research/) · [experiments/](../experiments/) · [domain-data/](../domain-data/) | Experimental, not necessarily shipped |
| Harness, roadmap, technical memoranda | [harness/](../harness/) · [roadmap/](../roadmap/) · [technical/](../technical/) | Verify scope, version and authority |
| Release candidates and closeouts | [release/](../release/) · [v0.10.2/](../v0.10.2/) | Final authority is the reviewed issue and immutable SHA |

## Browse by era

- **v0.1–v0.4:** [legacy SDK](../sdk/), [implementation](../implementation/), [architecture](../architecture/) and [earliest index](../DomainHarness_v0.1_INDEX.md).
- **v0.7–v0.9:** versioned [Product](../product/), [implementation](../implementation/) and [validation](../validation/).
- **v0.10–v0.10.2:** confirm [Release Issue #1331](https://github.com/kaicreator-mm/domain-harness/issues/1331) and the [v0.10.2 source tag](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2) before inspecting frozen evidence.

**Future instructions** belong only in matching `docs/current/zh-CN/` and `docs/current/en/` topic pages. Do not mass-copy, silently translate or relocate hundreds of frozen source records merely to tidy a folder tree.
