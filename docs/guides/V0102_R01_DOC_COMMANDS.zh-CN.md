# v0.10.2 文档可执行验收清单 —— T08b → R01

> 语言：中文。英文对应文档：`V0102_R01_DOC_COMMANDS.md`。

**草稿回执：** T08b 负责写这份命令清单；在 R01 #1331 于一个冻结的最终 SHA 上执行之前（**T08b 与 T09 都已 merge 之后**），`DOC_COMMAND_EXECUTION=NOT_RUN`。永远不要从 docs-only 的 CI PASS 推断执行过。来源基准：`v0.10.2@51dadcbbd31baf612507703ad389a255a8704462`。

| 来源 | 命令或运行时检查 | 物理责任方 | 当前证据 |
| --- | --- | --- | --- |
| 根 `README.md` | Node 版本 + `npm ci && npm run build && npm run lint && npm run typecheck` | R01 | 此最终候选上 NOT_RUN |
| 根 `README.md` / SDK | `node --import tsx --test tests/compiler/v0102-tarball-inventory.test.ts` | R01 | T07b 更早的 exact-SHA 证明；最终候选 NOT_RUN |
| `docs/guides/V0102_TINY_RICH.md` | 真实的 packed Tiny/Rich producer/install/send/query/subscription，无私有深层 import | T09 及最终 R01 证据复用 | NOT_RUN |
| `examples/v010-clean-consumer/README.md` | 修复后的 `clean-consumers.test.ts`，含已安装包图与物理 SQLite | T09 | 对 T09 最终 NOT_RUN |
| `examples/v0102-external-producer/README.md` | 已安装外部 producer fixture，负例 import 闭包 | T09 | NOT_RUN |
| 迁移与 SDK 代码片段 | 类型检查真实的公开 `load`、`subscribe`、`buildV10App`、选定导出 | T09 / R01 | NOT_RUN |
| 发布门 | Full 回归、Hidden Validation、Critical Journeys、Packaging | R01 | NOT_RUN |

对每一条已执行行，R01 必须记录 `source_path`、字面 `command`、工作目录、Node/npm 版本、`expected_sha`、`actual_sha`、`exit_code` 与相关 packed 摘要。失败的强制命令必须 BLOCK，而不是从清单里消失。含应用提供占位符的 TypeScript 编译期示意**不是**可直接运行的；R01 执行的是一个演练同一公开 API 的完整真实 fixture。

**并行规则 A9**：T08b 独占 `examples/**/README.md`（含新的外部 producer README）。T09 独占 test/fixture 代码，不碰 README。R01 是唯一的最终文档命令执行责任方。T07b 之后 `T08b || T09 → R01`。`main` 保持 HOLD。
