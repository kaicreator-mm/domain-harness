# DomainHarness v0.10.2 用户手册（中文）

**适用版本：** [Git Tag v0.10.2](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2)（`cee14399d9d0af4e20e34b9111861b16a465b690`）。本手册针对实际已实现的 Node24 Profile；不是尚未实现的图形化产品，也不代表包已上传 npm。

## 1. DomainHarness 用来做什么？

DomainHarness 为可信、已经 BUILD 选定的 **Domain Package** 提供最小装载、交互和生命周期环境。构建者先把 K/S/B/C 模块与 ABI、依赖、路由封闭为 **Domain App**；运行时装载预构建 App，经由 `send/query/subscribe/stop` 提供接口。

- **K（Kernel）**：状态提交、Admission、Journal、幂等/Replay、Effect Permit、UNKNOWN 的权威。
- **S（Standard）**：语义、规则和流程解释；可选 S Feature 必须显式选定。
- **B（Business）**：领域意图、业务规则和流程。
- **C（Capability）**：有声明的 Tool/Operation，外部副作用受 K 授权。
- **Microkernel**：装载、连接、初始化/释放，不自行实现 K/S 业务。
- **Host**：数据持久化与真实外部资源；Node Host 可选 SQLite，不能代替 K 决策。

详见 [可直接渲染的 Mermaid 架构图](../architecture/V0102_RUNTIME_DIAGRAMS.md)。

## 2. 安装前确认

1. 使用 **Node 24**（实际验收版本线），不需要专门的 Ubuntu、128GB 服务器或多操作系统矩阵。
2. `package.json` 中公开的四个工作区是 `@kaicreator/domain-harness-{contracts,build,microkernel,host-node}`；**构建阶段** 与 **运行阶段** 分开。
3. 标签已经发布，但工作区 `package.json` 版本仍写作 `0.10.2-rc.0`。不要直接运行 `npm install @kaicreator/domain-harness-microkernel` 并假定 npm registry 已发布该包。先从固定 Git SHA 获取仓库并构建本地制品。
4. 不要在消费者中依赖旧的私有 `domain-harness-compiler` 或 `src/`、`dist/` 深路径。

## 3. 在项目仓库中运行可验证示例

在从 `v0.10.2` Tag 检出的仓库根目录执行：

~~~sh
node --version
npm ci
npm run build
node examples/v0102-package-authoring/projection-smoke.mjs
node --import tsx --test tests/compiler/v0102-tarball-inventory.test.ts
node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts
~~~

这些命令分别用于构建、静态选型、产物清单、真实生产者与独立消费者验收。**执行示例不等于自动完成发布验收，也不是本手册作者重新执行过这些命令的声明。** 需要一个完整的自定义 App 时，从 [Package Authoring](../guides/V0102_PACKAGE_AUTHORING.md) 的 `examples/v0102-package-authoring/` 复制结构。

## 4. 构建和运行时的代码形状

**生产者进程（仅 BUILD）：**

~~~ts
import { buildV10App } from '@kaicreator/domain-harness-build';
const prebuiltApp = buildV10App(buildOptions);
~~~

**消费者进程（只运行已构建 App）：**

~~~ts
import { load } from '@kaicreator/domain-harness-microkernel';
const runtime = await load(prebuiltApp, { store, queryAuthority });
try {
  const receipt = await runtime.send(intent);
  const answer = await runtime.query(selector);
  const subscription = await runtime.subscribe(selector, event => observe(event));
  subscription.unsubscribe();
} finally {
  runtime.stop();
}
~~~

上述变量 **由应用开发者真实提供**，不是 SDK 内置变量；这是 API 用法示意，不是可直接运行的完整程序。`store` 必须符合 `V10DocStore`，`queryAuthority` 来自可信 Host 身份/授权绑定，`selector` 指明实际目标。完整运行代码与制品布局请阅读 [Tiny/Rich 示例](../guides/V0102_TINY_RICH.md) 和 [公共 API 速查](V0102_API_CHEATSHEET.md)。

## 5. 选择 Tiny / Rich

| 场景 | 推荐 |
| --- | --- |
| 单进程、最小闭环或概念验证 | Tiny：不安装运行时 BUILD，不安装未选 Feature；示例 PlainFileDocStore 仅单写者 |
| 多进程共享存储、持久化并发 CAS、重启恢复 | Rich：Node Host + 实际 SQLite 事务/WAL |
| 不使用 SQLite 的业务 | 由 Host 提供可验证的合约化持久化存储；不要默认 SQLite 是内核依赖 |
| 使用 LLM/Agent/Memory | 通过已选 Domain Package / Host Capability 组合，不把模型路由写死在 Microkernel |

## 6. 使用过程中的原则

- 发送 Intent：保持 `messageId`、目标和输入的一致性；相同消息重试由 K 管理 Replay，变化的 Intent/输入应 typed refusal。
- 查询与订阅：始终提供明确的业务目标及可信授权；订阅回调只接收裁剪后的事件 `{kind, occurrenceId, target, snapshot?}`。
- 外部副作用：必须通过已声明的 C Operation 和 K Effect Permit；UNKNOWN 要保留不确定事实，不能编造成功。
- 停止：`unsubscribe()` 取消订阅，`stop()` 同步且幂等；不要把旧 Facade 在 stop 后继续使用。
- BUILD 完成后不在 runtime 动态下载/编译/发现新包。

## 7. 当前发布资格与限制

v0.10.2 **已经发布 Tag、合并 main 并关闭 R01**。发布裁定是 **CONDITIONAL**：产品 8/8 P0 与 2/2 必需 P1 验收合格、Hidden 7/7 PASS，但一次 Full 因操作系统测试子进程资源失败留下 `EXIT1` 和 `test:root NOT_RUN`；仅当前冻结 SHA 经独立审核与 Owner 授权接受替代证据。**不能把 Full 写成 PASS，也不能把该例外直接沿用下个版本。** 详情见 [发布记录](../release/V0102_RELEASE_STATUS.md)。

遇到问题查看 [故障排查](V0102_TROUBLESHOOTING.md)，Agent 集成参照 [操作手册](../agents/V0102_PLAYBOOK.md)。
## 8. 发现 SDK 问题或使用心得，如何反馈？

在实际项目使用时，如发现可复现的 SDK Bug、文档不准确、Package/Host 集成复杂或能复用的成功实践，优先阅读 [SDK 反馈与 GitHub Issue 提交指南](../feedback/SDK_USAGE_FEEDBACK.md)。先搜索现有 Issue，标明实际 SDK Tag/精确 SHA、公开 API、预期与实际行为、脱敏最小复现和真实测试结果；操作系统自身内存/测试进程故障不应当误报为 SDK 产品问题。Agent 可以帮助分类和生成 Issue，但**发布任何消费项目的代码/日志/信息前必须获得用户同意**，SDK 本身不做自动上报。

使用 Codex/Claude Code 等 Agent 时可先安装 [DomainHarness SDK Skill](../agents/V0102_SDK_SKILL_INSTALL.md)，其使用说明和故障归因与本手册保持一致。
