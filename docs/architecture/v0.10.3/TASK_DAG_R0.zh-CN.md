# v0.10.3 — ADS v4.18 最大安全并行 Task DAG R0（候选，未准入）

[English](TASK_DAG_R0.en.md) · [L2 Freeze](L2_FREEZE.zh-CN.md) · [DAG 总控 #1411](https://github.com/kaicreator-mm/domain-harness/issues/1411)

**事实源：** `version/v0.10.3` 已合入审核通过的 L2 #1407，已记录正式 [L2 Freeze](L2_FREEZE.zh-CN.md)。当前建立了 **8 个真实 Task Issue、9 条拟定依赖、4 层拓扑、首层 4 个独立可并行任务**，静态检查无环。但**GitHub Native blocked_by 还没写入**，这不是已准入可领源码任务的 DAG。

## 一、Concern、Agent 与独占写集

| Lane | Issue | 建议独占代码与证据范围 | 前置 |
|---|---|---|---|
| A 公共 DTO | [#1412](https://github.com/kaicreator-mm/domain-harness/issues/1412) | 新增 `packages/contracts/src/llm-generate-v1*.ts` 和独立 Contracts 测试；不可修改共享 index | 无 |
| I 可信部署 P1 | [#1413](https://github.com/kaicreator-mm/domain-harness/issues/1413) | 现有 `packages/host-node/src/deployment.ts`、新增私有安全校验 helper、独立 Host 负例；不可修改 Host 根 index | 无 |
| J 离线动态表单 | [#1414](https://github.com/kaicreator-mm/domain-harness/issues/1414) | 新的 `examples/v0103-guided-journey/**` 和独立 B/Schema 测试；冻结 Schema 只读 | 无 |
| M Meta 复用 | [#1415](https://github.com/kaicreator-mm/domain-harness/issues/1415) | 新 `examples/v0103-meta-reuse/**` 和 Host Consumer 证据；现有 S/Host 公共导出只读 | 无 |
| B OpenAI C | [#1416](https://github.com/kaicreator-mm/domain-harness/issues/1416) | 新 `domain-packages/capabilities/llm-openai-compatible/**`、独立 OpenAI Host client 目录与测试 | **只等待 A** |
| C Anthropic C | [#1417](https://github.com/kaicreator-mm/domain-harness/issues/1417) | 新 `domain-packages/capabilities/llm-anthropic-messages/**`、独立 Anthropic Host client 目录与测试 | **只等待 A，不等待 B** |
| R 单写者集成 | [#1418](https://github.com/kaicreator-mm/domain-harness/issues/1418) | 独占公共 Contracts/Host index、package/BUILD Manifest、集成与 npm pack 0/1/2 消费者 | 等 A/I/J/M/B/C |
| Q 独立版级合格审核 | [#1419](https://github.com/kaicreator-mm/domain-harness/issues/1419) | 新 `docs/release/v0.10.3/**`，证据核验/RQ，不改实施源码 | 等 R |

**Agent 配合：** Web/controller 负责精确版本调度和文档，A/B/C/J/M/I 各自适用的本地或 CI Builder 在**独占路径**上执行，独立 Reviewer 只读审核；R 一个 Writer 负责共享导出文件，Q 由独立审核者裁定。没有第二套 Kernel/Meta Runtime，也没有无依据新增 S Feature。#1394 CAS D 已完成，ADS G 已完成，不新建假前置。

## 二、必须落到 GitHub 的 9 条原生 blocked_by

左边 **被阻塞 Issue**，右边是 **前置 Issue**。写入接口 `POST /repos/kaicreator-mm/domain-harness/issues/{blockedNumber}/dependencies/blocked_by`，JSON 必须给**前置 Issue 数据库 id**，不能错用 issue 编号；同路径 GET 读回。

| 被阻塞 | 前置 |
|---|---|
| #1416 B OpenAI | #1412 A neutral DTO |
| #1417 C Anthropic | #1412 A neutral DTO |
| #1418 R integration | #1412 A neutral DTO |
| #1418 R integration | #1413 I trust |
| #1418 R integration | #1414 J offline journey |
| #1418 R integration | #1415 M meta proof |
| #1418 R integration | #1416 B OpenAI |
| #1418 R integration | #1417 C Anthropic |
| #1419 Q RQ | #1418 R integration |

**最大安全并行拓扑：** `[A,I,J,M] → [B,C] → [R] → [Q]`。这是拓扑层级，不意味着四个独立根任务要串行；只在真实依赖上设置 blocked_by。安全 I 与 Provider 不互相阻塞，B/C 不互相阻塞，R 必须等真实完成所有必需输入。

## 三、准入与负例要求

1. 当前只建立了源码 Issue，所有 `CLAIM=NOT_ISSUED`。**文字链接、标签、评论不是 GitHub 原生依赖证据**；9 条必须真实写入并精确 GET 复核后，再提交独立 DAG 审核裁定 `DAG_ADMITTED`。
2. 当前工具可读取 Native Issue Dependencies，但**无 POST 写入操作**。需要一次小范围授权 GitHub CLI 执行；不可因为工具不支持就说已写入。
3. Source Builder 在获得具体 Task、当前源 SHA、独占写集与合法 Claim 前不得动源码。公共 A 合同最小面通过后 B/C 可并行；I/J/M 可独立；R 不和任何 Task 抢公共根。
4. 真实 Node24 packed 0/1/2 C App、Provider 负例、Host 严格部署字节核验、UNKNOWN、安全日志以及下游集成 **尚未执行**。L2 文档 CI 不可替代。
5. 实施发现会改变冻结 Product/K/公共数据协议的缺陷，须先提真实 Amendment 而不是循环最小补丁；旧 v0.10.2 发布保持不可变。

```ini
VERSION=v0.10.3
PRODUCT_L1_FREEZE=YES
CONTRACT_DATA_FREEZE=YES
L2_FREEZE=YES
TASKS_CREATED=8
TASK_EDGE_SPEC=9
NATIVE_EDGES_ACTUALLY_CREATED=0
DAG_REVIEW=NOT_RUN
TASK_DAG_ADMITTED=NO
SOURCE_IMPLEMENTATION_CLAIMS=NO
```
