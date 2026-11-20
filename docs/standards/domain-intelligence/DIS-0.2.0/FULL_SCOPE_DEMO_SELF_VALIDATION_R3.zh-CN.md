# DIS v0.2.0 — 全范围 R3 自验证结果及反例修复日志

**状态：SELF_VERIFIED_STANDALONE_DESIGN_DEMO；不是已发布 SDK/KDP、真实 Provider 或 Independent Review。**

## 测试对象和结果

- 受测参考程序：模块化 `dis-v020-full-audit-demo/`（本对话交付完整 ZIP，源文件与 SHA 列于收据），Node.js ESM、只使用 Node 内置 `assert/node:test/crypto/child_process`。
- 环境：Linux container, Node **v22.16.0**，未达到项目 Node>=24 发布/CI 资格；**Node24、Woodpecker 都没有执行**。
- 命令：`npm run verify`（`node --check` → `node --test` → `node run.mjs`）。
- **74/74 Node 测试 PASS（27 正向、47 负面）**。其中一个 Node 测试启动原先的独立 25-case 模拟进化脚本，该脚本内部 **25/25 PASS**；因此 74 是 Node 直接报告的测试数，25 是其内嵌断言，不能称为 99 项真实生产独立验收。
- 两个明确不同的 Domain：`tally`（任务资格、GitHub SHA/效果许可）和 `media`（播放器解析、Element 多 Function 依赖）。完整故事：编译 Element/Package DAG → KDP/SDK/Business 技术 Init → Business App Init → 直接 ingress → FakeHarness/LLM/Experience/受限 Rule → 模拟 Server 包升级。
- 参考 Demo 根文件 SHA256：`src/core.mjs=762af6e6768f364a873f52d50c3b3067ce066aa975c47a72fc96e9bec40de488`；`test/full.test.mjs=453880e5b6bab9b776b7188d71283aae81ac18213b069253c91c2951631a83f1`；旧进化脚本 `src/evolution.mjs=db74ae5a779e6e0c04e82339391e57180f5fa872aed93fc2ff9059a102e94564`。
- 本地打包成 `dis-v020-full-audit-demo.zip`（SHA256 `d8e5740d478cbd38fae7b6d928d70d9ec2452668d4c0e81715bb2be1cd078c71`）；另有无日志 `tar.xz`（SHA256 `e547a46a159c1107cb9b2a75f41b45069b7f25e023786878c667b256fe566aa1`）。**这些是对话附件，不是假装 GitHub CI artifact。**

## 真实发生的测试失败和连续修复

| 发现阶段 | 失败/缺陷 | 原因 | 修复及回归 |
| --- | --- | --- | --- |
| 首轮 57-case | 3 FAIL | 两项夹具调用未给 `planFor` 默认参数；一项 NEG 预期的错误码与真实拒绝的代码不一致 | 修复样例参数/断言后 **57/57 PASS** |
| 后续边界审核 | 锁摘要不随 Element/Package 元数据改变 | 参考编译器只含 Function lock，不足以完整防漂移 | 锁纳入 Element、Package、Semantic、App、Resources；补入 Digest Change 正反测试 |
| 后续边界审核 | 仅声明资源 SHA，未核验其实际内容 | 任意恶意发布者可自报“正确 digest” | 对 Demo 提供的资源 Payload 重新计算 SHA；缺失/不匹配全部拒绝 |
| 后续边界审核 | Required extension/Provider 未选可潜入 | 缺声明闭包检查 | 加入 Required/Optional Extension、Provider AOT 白名单与拒绝测试 |
| 后续边界审核 | 模拟纯 Function 取得可变业务 State 引用 | 查询 Function 可直接改变状态 | 纯 Function 只能获得快照；有治理效果的 Function 才可在受控准入下访问权威态；负例通过 |
| 后续边界审核 | 一次 Effect permit 可复用造成重复执行 | Mock permit 仅验证 membership，未消费 | 加单次 Activation 内 Replay 拒绝、负例通过；生产幂等仍 OPEN |

## R3 全范围测试覆盖的主要拒绝边界

- 合法双向语义关系但静态依赖 DAG 必须无环；跨 Package Public Function/导出/Owner/Target/版本/资源/Provider/Effect 权限完整性。
- Package Init 失败逆序清理、App Init 单一性与 DEGRADED optional ingress、未 READY 禁止调用。
- Tally-Like GitHub stale SHA、没有 Effect permit、错误 Effect permit、许可重复执行、伪造成功结果的拒绝；业务 State 受 Domain 管理。
- 用户意图已澄清也没有 Effect 权限；未绑定的 Handler 或未声明的 Outcome 拒绝。
- 演进模块原有 25 条模拟 LLM/Experience/Rule 演进测试覆盖缓存、Holdout、局部 Slot、Server 模拟晋升、Prompt Injection 等。

## 不得宣称已关闭的生产门禁

**Mock 代码隔离不等于任意 Node/Native 包的真实 OS 沙箱或 KDP 的物理准入。** 各种 Receipt 中的 fixture trust 不等于跨进程真实签名/身份。Demo 没有真正生产一个可启动的 DIS Domain Package、没有使用 DomainForge 生产知识图谱、没执行实际 LLM API 或真实 GitHub/浏览器/设备调用，也没有证明跨消费者 ABI 可迁移。

R3 自审核风险归类 P0=6/P1=14/P2=4 均属 **设计修复/参考模型自测**，不是生产 P0/P1 已全部独立关闭。**Product/L1 REVIEW_PENDING、Schema NOT_DONE、Node24/CI NOT_RUN、Independent exact-SHA NOT_RUN、L2 NOT_FROZEN、Runtime adoption NOT_PROVEN、Release NO**。
