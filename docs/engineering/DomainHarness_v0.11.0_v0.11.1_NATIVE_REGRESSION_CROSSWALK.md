# R163 · v0.11.0 / v0.11.1 原生重构后功能留存与回归台账

- Owner/Task: [#1696](https://github.com/kaicreator-mm/domain-harness/issues/1696)
- 基线: `version/v0.11.x@0dc8c0f888bcfd46beeeb4c93606f74dae78f2eb`；R160 被审源 `0477edf9070c05ec3c89c46fb1aaa43cf2f850a3` / Woodpecker #3151 SUCCESS。
- **R165 已完成验收与集成**：R164 [独立审核](https://github.com/kaicreator-mm/domain-harness/pull/1697#pullrequestreview-6026833143) 对源码 `409aa64f89cf7b6f6e075ad6a1778775249bab6a` 为 `ACCEPT_SCOPED P0/P1/P2=0`，同 HEAD Woodpecker #3153 SUCCESS，PR #1697 合并至版本列车 `35d58b209f19ab9f8108f89b1244c53a3420453e`，合并树与受审树均为 `a08ed8d3777aca28d5fa29dbb36e07d9b4db08c0`。不改变旧审核的历史限定含义。
- 权威：[Core](../specs/domain-harness/core.md)、[TypeScript Profile](../specs/domain-harness/typescript-profile.md)、[生命周期](../specs/domain-harness/lifecycle-workflow.md)。旧 API 技术名仅作历史审计，不得恢复。

状态：`NATIVE_RETAINED` 已有原生行为/测试，`NATIVE_R163_TEST` 本轮新增正反例已按 R164 限定验收，`SUPERSEDED` 原自定义执行技术已明确被新规范替换，`AUTHOR_OWNED` 正确性/状态归生成/业务作者而非 SDK Runtime。**没有旧实现等价性的默认推定。**

## 0.11.0：AC01–AC10

| AC | 裁决 | 现行证据 / 适用边界 |
|---|---|---|
| AC01 0-Function 知识及 2-Function Element | `SUPERSEDED + NATIVE_R163_TEST` | 静态内容由业务文件/模块管理；零公开方法的 `OrderPolicyKnowledgeElement` 保存规则，`OrderPolicyElement.evaluate/finalize` 两方法真实使用它，不再强制 JSON ElementDefinition |
| AC02 Content Schema/ref/语义环/依赖环区分 | `SUPERSEDED + AUTHOR_OWNED` | 业务结构化数据经 JSON/YAML Reader；生成者检查适用 Schema/静态依赖，SDK 不维护自定义领域语义图/动态 Loader |
| AC03 一个 Package 多 Element/公开 Function/Owner | `NATIVE_RETAINED` | `business.mjs` 导出 OrderService、OrderPolicyElement、sumAmounts；ESM exports 和 npm 直接依赖，而非自有 Owner Registry |
| AC04 固定 K/S/B Primary 和 Init plan | `SUPERSEDED + NATIVE_RETAINED` | 单 SDK + Order=0 KDP + ESM 静态 Core；`kernel-lifecycle.ts` 按 Order，生成期 Order 验证器 |
| AC05 Boot 仅启动 KDP | `SUPERSEDED + NATIVE_RETAINED` | 不再有 boot(pin)；App 静态 import + `new KernelLifecycle([...])`，唯一 KDP Order=0 |
| AC06 规则/知识真实改变 Function 结果 | `NATIVE_R163_TEST` | 两份真实 JSON 规则 minTotal=10/11、同一 OrderPolicyElement，分别 COMPLETE/REJECT，失败分支不运行 finalize |
| AC07 Target/Lock/Hook 静态拒绝 | `SUPERSEDED + AUTHOR_OWNED` | Node/npm lock、TS/ESM 和 `validate-native-generation.mjs` 限定 Order/直接 import；旧 Target/Pin/自建 Lock 不再是验收对象 |
| AC08 独立安装/启动 SDK Consumer | `NATIVE_RETAINED + NATIVE_R163_TEST` | `verify-native-sdk-clean-install.mjs` pack→npm ci→真实 App；新补测试随仓外消费运行 |
| AC09 不宣称 Effect/LLM/Provider 通过 | `NATIVE_RETAINED` | 公开 Root 固定 12 个运行时值，没有旧 Capability ABI |
| AC10 源码/TS 类型/文档可用 | `NATIVE_RETAINED + NATIVE_R163_TEST` | `facade-surface.test.ts` / TypeScript 仓外消费；本轮修正 PRD 路径和规范头部旧状态 |

## 0.11.1：AC11–AC20

| AC | 裁决 | 现行证据 |
|---|---|---|
| AC11 | `NATIVE_R163_TEST` | `workflow-init.mjs::Init.start` 真正启动子 Workflow、两业务 Node、单节点 |
| AC12 | `NATIVE_RETAINED + NATIVE_R163_TEST` | `routeWorkflowOutcome` 六具名出口；真实 COMPLETE→finalize、REJECT 不进入下个 Node |
| AC13 | `NATIVE_RETAINED` | XState / WorkflowOutcome ASK/WAIT；无持久 Resume |
| AC14 | `NATIVE_RETAINED + NATIVE_R163_TEST` | 终态与拒绝/未知分离，异常不成为成功 |
| AC15 | `SUPERSEDED + AUTHOR_OWNED` | 作者侧验证 Order/直接 npm 依赖/非法 import 的适用子集；不强加旧 FunctionRef 和 Lock |
| AC16 | `NATIVE_RETAINED` | `native-workflow-composition.ts` 预算共享、祖先深度、Reader/Hook 副作用前拒绝 |
| AC17 | `NATIVE_RETAINED + NATIVE_R163_TEST` | 可选 Init/Exit 及 Hook 分离；Package 自行记录 InitFrom 可选调用者，SDK 不做强制去重 |
| AC18 | `NATIVE_RETAINED` | KernelLifecycle 一轮 Init、Order、逆序退出；旧 boot(pin) SUPERSEDED |
| AC19 | `NATIVE_RETAINED + NATIVE_R163_TEST` | 同一 PolicyElement 两次选定不同规则独立执行，KDP 故障处理负例 |
| AC20 | `NATIVE_RETAINED + NATIVE_R163_TEST` | 实际仓外 SDK-only npm E2E 两份 JSON + 两份 YAML，追加 Init、知识规则与第二领域验证 |

## v0.11.1 AC60-01–10 的新架构裁决

| AC60 | 裁决 | 现行证据 / 替代理由 |
|---|---|---|
| 01 同 Runtime/语言闭包 | `NATIVE_RETAINED` | TypeScript Profile Node ESM + 生成期直接 import 检查；跨语言仅独立边界 |
| 02 JSON/YAML Reader + 第二领域 | `NATIVE_R163_TEST` | Order + Inventory 两业务领域原生 Class 复用 SDK Reader |
| 03 Reader 安全语义/拒绝 | `NATIVE_RETAINED` | `language-native-standard-files.test.ts` 对别名、污染、长度、Getter 等 |
| 04 单一类型来源 | `NATIVE_RETAINED` | 唯一 SDK TS 源码及 `dist/index.d.ts`，外部消费者真实 typecheck |
| 05 根入口体积优化 | `SUPERSEDED` | 旧 /runtime、/composition 子路径已删除；单根 12 个允许值，只有 xstate/yaml 必要依赖；旧冷导入数值不转移 |
| 06 SDK-only 真实安装 | `NATIVE_RETAINED + NATIVE_R163_TEST` | `verify-native-sdk-clean-install.mjs` 只声明 SDK 直接依赖、npm pack/ci |
| 07 普通第三方业务依赖 | `SUPERSEDED + AUTHOR_OWNED` | 新版使用正常 npm dependencies/lock、工具验证直接依赖；旧 Target/SRI 子系统不恢复，不能声称旧负例已在新结构逐一重演 |
| 08 第二代 SDK 组合 | `SUPERSEDED` | 旧 BUILD/Lock/Pin 自举接口已删除；标准 npm/ESM 管理 SDK 升级，不声称仍有旧 `buildApp` API |
| 09 文档现状 | `NATIVE_R163_TEST` | 同 PR 修正旧 PRD 实施矩阵、TS Profile 与 Canonical 迁移状态 |
| 10 整体验证与独审 | `R164_ACCEPT_SCOPED` | PR #1697 受审 HEAD `409aa64f...`、Woodpecker #3153 SUCCESS、合并代码树一致；仍不包含 Windows 实机及精确 Node22.12 验证 |

## 关键不变量与剩余门禁

1. 两份规则 JSON **同一个业务 Element** 产生不同 Outcome；不可把“parse JSON 成功”当作知识真的影响 Function。
2. `Package.Init` 内实际运行子 Workflow 和多 Node，且该能力是允许的使用方式，不强制所有业务都经 Init 触发。
3. 预算在下一次 Reader/Hook 前拒绝；start/end 不等于 Package.Exit；拒绝分支不得执行成功 Node。
4. 非 Core 插件无强制空 Init；记录 InitFrom 与业务状态由 Package/Domain App 自己负责。
5. Windows 实机 E2E 与最低 Node 22.12 精确消费者验证仍 **NOT_RUN/NOT_VERIFIED**。不得通过 Linux CI 冒充。
6. R164 已完成独立审核，R165 完成源码合并，可标记 `FULL_FUNCTIONAL_ACCEPTED_SCOPED_ON_NEW_CANONICAL`；不能把旧 #2917 或 R160 当作新增回归的审核。R166 的激活状态归属优化单独按新 HEAD 验证，不追改 R164 的合法历史结论。
