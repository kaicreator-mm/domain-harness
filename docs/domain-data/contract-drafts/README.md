# 领域契约草案（Contract Drafts）/ Domain Contract Drafts

本目录存放按 [`../DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md`](../DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md) 定义的契约，为 [kaicreator-mm](https://github.com/kaicreator-mm) 组织下各项目生成的**领域契约草案**。

This directory holds per-project domain contract drafts generated against the contract defined in `DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md`, for the candidate domain apps under the kaicreator-mm GitHub organization.

## 状态 / Status

- 每份草案是 **CONTRACT DRAFT**：基于目标仓库浅克隆（2026-09-20）的只读分析生成，未经目标项目 owner 评审。
- 草案遵循 General Design v0.2 的 `[约定]`（R1–R5、W1–W6、S1–S3、B1–B5、M1–M5）与 v0.3 PRD 冻结语义；依赖尚未落地的平台增量处标注 **G1–G10 / PRD-CR-x / L2-x**（见分析文档 §5）。
- 目录名 = GitHub 仓库名。每份草案结构见 [`TEMPLATE.md`](TEMPLATE.md)。

## 项目筛选结果 / Screening result

**入选（13）**——均具备长期业务实体、可恢复流程、副作用操作与 AI 环节：

| 项目 | 语言/形态 | 领域 | 设计文档既有映射 |
|---|---|---|---|
| `tally` | Go | 编码代理的工程 Harness（TaskDAG、证据门控） | General Design v0.2 §17 |
| `formula` | TypeScript | AI-native 视觉生产（DesignDocumentV2） | General Design v0.2 §18 |
| `yishu` | TypeScript | 中缅翻译 Runtime（TM/Terminology/Hard Gates） | General Design v0.2 §19 |
| `triphub` | TypeScript (RN+API) | Journey 生命周期平台 | General Design v0.2 §19 |
| `xlearn` | TypeScript+Go | 自适应学习（Learner、Domain Packages） | General Design v0.2 §19 |
| `city-atlas` | Python+RN | 本地生活任务平台（POI/采集/证据） | v0.1 外部验证对象（T016） |
| `parts-system` | TypeScript | 汽配供应与维修事实收集（offline-first） | — |
| `xcrossify` | TypeScript | 外籍居民生活任务 Hub | — |
| `forge-saas` | TypeScript | 外贸内容与买家转化（Trade Content Harness） | DOMAIN_DATA_SPEC 示例 owner |
| `cairn` | TypeScript | 知识工程/可信知识核心（治理与晋升） | — |
| `restudio` | Python+React | 内容再生产工作站（X2T→T2T→T2X） | — |
| `audio-platform` | Python | 音乐/音频生产（自建 Domain Harness） | — |
| `citechain` | Rust+Tauri | 任务优先知识工作台（血缘追溯） | — |

**排除（2 + 基础设施）**：

- `fastdev` —— 本地开发环境代理/工具链，无长期业务实体与领域流程，是 dev-tooling 而非 Domain App；
- `domainforge` —— Open Domain Model Factory，定位是**生成**领域包的元工具（DomainHarness 生态的 authoring/compiler 侧），不是消费领域契约的 Domain App；
- 未纳入分析：`domain-harness`（SDK 本体）、`ux-harness`、`ai-runtime`（AI Runtime 边界，v0.3 PRD §7.2 中位于 SDK 之外）、`ai-dev-pilot`、`ai-development-standard`、`spotpick`、`hidden-validation`、`tally-hv153-*`（一次性验证仓库）。

## 使用方式 / How to use

1. 目标项目 owner 按草案 §0（十二问）核对事实准确性；
2. 按 §11（v0.3 增量依赖）确认哪些条目必须等待 PRD-CR / L2 决定，哪些可按临时约定先行；
3. 草案 §2–§10 可直接作为该项目 Raw Domain Package 与 Project Host Profile 的 authoring 起点（注意分析文档 G9：tools/projections 目前无磁盘 authoring 格式，需程序化传入 `compileDomainPackage`）。
4. **模拟数据与 SDK 验证**：每份草案配套一个验证数据包（`tests/contract-validation/packs/<project>/`），含模拟真实领域情况的业务快照、Compiled Domain Data、场景脚本；formula/tally/triphub/yishu 四包已对真实 compiler+runtime 端到端执行（`npm run test:contracts`），验证发现记录于 `tests/contract-validation/reports/` 并已提报 issue。

## 跨项目共性发现 / Cross-project findings

13 份草案汇总后，对 DomainHarness 平台侧（v0.3 L2）最重要的共性信号：

1. **G3（项目绑定 Tool）是 13/13 项目的共同依赖**——所有项目的业务写都落在本地 SQLite/PG/文件系统，remote 回环只是原型路径。这是 v0.3 Track A 的第一优先级。
2. **G4（rejected 处置）是 13/13 项目的共同依赖**——每个项目都已有"领域拒绝≠技术失败"的自建语义（forge 的 409/422 信封、parts 的逐事件 accept/reject、yishu 的 gate 阻断、xlearn 的 stale task 拒绝……），全部在等 Runtime 的一等 `rejected`。
3. **AI envelope（G8）的最佳样板已在生态内**：Cairn `AiExecutionPort`（四字段封闭+exactKeys 拒绝 provider/model/tier）、Tally AI Runtime 契约（budget+Idempotency-Key+UNCERTAIN 三态）、Audio Platform `AIExecutionPort`（canonical data+错误三态+opaque dialect）、YISHU direct/runtime 双模式互斥、xcrossify AIR-02（No Domain Authority）。v0.3 L2 设计 AI Operation envelope 时应直接归纳这五个既有契约，而非从零发明。
4. **宿主语言矩阵**：TS 项目（formula/yishu/triphub/parts-system/xcrossify/forge-saas/cairn/citechain/xlearn 设备侧）可进程内嵌入；Go（tally）、Python（city-atlas/restudio/audio-platform）需 Node sidecar + 回环绑定；Capacitor 设备宿主（parts-system）是 expo 适配器之外的平台缺口；PG RuntimeStore 适配器（xcrossify/forge-saas）与 sqlite-only 现状是第二个平台缺口。
5. **"effect 三值须含语义不明（unknown/RECOVERY_REQUIRED）"**被 Cairn（DirectExecutionLedger）、Forge（ExternalInvocation UNKNOWN+reconcile）、Audio Platform（paid_retry_policy fail-closed）、Tally（UNCERTAIN）四个项目独立实现——v0.3 的 Tool/journal 语义应把"未知结果"建为第一等公民，而非折叠进 failed。
6. **自建 Harness 词汇的收敛机会**：xlearn domain-packages（=Compiled Domain Data 参照实现）、audio-platform HarnessSnapshot（=Compiled Package 参照实现，含 resolve-once pin/alias CAS/replay diff）、forge Trade Content Harness（=projection-not-invention 参照）、triphub Travel Harness（=domain data 供给侧参照）。G1（domainData 进 manifest）的设计可直接归纳这四个既有格式。
7. **反框架/无第二权威条款普遍存在**（parts-system ADR 纪律、tally TaskDAG 唯一权威、xcrossify v0.2.0 禁令、audio-platform ADR-0005/0028、cairn 治理不建 workflow）：DomainHarness 的落地叙事必须是"提取/映射 + 补平台缺口"，而非"引入新引擎"——每份草案的 §12 都按此定位给出渐进路径。
