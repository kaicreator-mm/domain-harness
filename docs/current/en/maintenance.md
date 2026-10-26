# DomainHarness — bilingual documentation maintenance contract

[English index](index.md) · [中文版本](../zh-CN/maintenance.md)

## 1. Two canonical current trees

* **For human users:** `docs/current/zh-CN/<topic>.md`, reached from root `README.md` by default.
* **For coding/review Agents:** `docs/current/en/<topic>.md`, reached from machine-facing `AGENTS.md`, `llms.txt` and the canonical `SKILL.md`.
* **Paired topics are mandatory:** the same Markdown basenames must exist in both trees, cover the same supported API, commands, limitations and release facts, and link to the reciprocal language version.
* Keep typed identifiers, Git SHAs, literal EXIT codes, package specifiers, TypeScript snippets and public ABI unchanged; translate the explanatory text and diagram labels. A stub saying "see the other language" **does not qualify as a translation**.

## 2. Historical evidence remains immutable

Frozen Product/L2, Task DAG, validation and release evidence stay at their original paths. Do not move hundreds of historical technical records, rewrite their candidate-era `NOT_RUN` results, or break issue/blob references merely to rebrand a doc directory. New current user/Agent topics belong **only** to the language-paired `docs/current/` tree.

## 3. Review checklist

1. Update both `zh-CN/<topic>.md` and `en/<topic>.md` in the **same PR**. For a new topic update both `index.md` pages.
2. From repository root, with Node24, run:

```sh
node docs/current/validate.mjs
```

   The existing `npm run lint` lane also invokes this bilingual validator to catch future pairing/navigation regressions.
3. Independently review **semantic equivalence**, including public API, failed/NOT_RUN evidence, installer/permissions, and source/version pins. The static validator **cannot translate or validate meaning**.
4. For docs-only PRs, scoped link/format/source checks suffice; do **not** relaunch mandatory Full/Hidden release tests without a source-risk reason. Never invent an execution receipt.

If a user discovers a language mismatch, broken link or misleading example, use [feedback workflow](feedback.md) with a privacy-safe Issue draft and obtain approval before public cross-project disclosure.

**Pinned release reality:** v0.10.2 RQ is CONDITIONAL; actual Full EXIT1 and `test:root NOT_RUN` remain true.
