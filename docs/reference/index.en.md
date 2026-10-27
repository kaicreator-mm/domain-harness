# DomainHarness — Governing references and frozen evidence

[Documentation hub](../README.md) · [中文版](index.zh-CN.md) · [Current English Agent handbook](../current/en/index.md)

This curated map points to **still-applicable, version-pinned contracts and their authoritative evidence**. Their older physical directories do not make frozen rules obsolete. Current explanatory docs are never a replacement for Product/L2 freeze authority.

| Need to verify | Authoritative material |
| --- | --- |
| Cross-version architecture CV constraints | [DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md](../architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md) |
| v0.10.2 Product scope | [Product Freeze](../product/DomainHarness_v0.10.2_PRODUCT_FREEZE.md) |
| v0.10.2 L2 contract | [L2 Freeze](../architecture/DomainHarness_v0.10.2_L2_FREEZE.md) |
| Parallel Task and write-set restrictions | [A6 parallel execution](../architecture/V0102_A6_PARALLEL_TASK_EXECUTION.md) (candidate-era heading retained; [Issue #1356 accepted](https://github.com/kaicreator-mm/domain-harness/issues/1356), [PR #1357 merged](https://github.com/kaicreator-mm/domain-harness/pull/1357)) · [historical Task documents](../tasks/) |
| Verification and source provenance | [Validation](../validation/) · [v0.10.2 source inventory](../validation/v0.10.2/L2_SOURCE_INVENTORY.md) |
| Release qualification and limited exception | [Release Issue #1331](https://github.com/kaicreator-mm/domain-harness/issues/1331) · [as-of release file](../release/V0102_RELEASE_STATUS.md) |
| Immutable release source | [v0.10.2 Git Tag](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2) |

## Apply the correct authority

1. **SDK integration:** begin with the [current Agent handbook](../current/en/index.md), or the [Chinese user handbook](../current/zh-CN/index.md) when explaining to users.
2. **Product/L2/code review:** pin exact version, issue and SHA. Distinguish frozen sources and approved amendments from candidates; never promote a candidate merely because it shares a folder with a freeze.
3. **Superseded drafts or research:** use the [archive map](../archive/index.en.md). Historical `main HOLD`, `NOT_RUN` and incomplete-run claims are time-bound evidence, not current status.

**Pinned reality:** v0.10.2 Tag is `cee14399d9d0af4e20e34b9111861b16a465b690`, RQ **CONDITIONAL**, historical Full `EXIT1` and root `NOT_RUN` unchanged.
