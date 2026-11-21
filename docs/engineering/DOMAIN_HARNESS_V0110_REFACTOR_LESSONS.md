# DomainHarness 0.11.0 — 从零重构过程与工程经验

> 范围：仅限已确定的 0.11.0 Foundation 实现；记录当前重构的已证实结果与尚未通过的验证。对应 [Issue #1602](https://github.com/kaicreator-mm/domain-harness/issues/1602)、[PR #1603](https://github.com/kaicreator-mm/domain-harness/pull/1603)，由 [主 Issue #1563](https://github.com/kaicreator-mm/domain-harness/issues/1563) 统一管理。本文是工程经验，不代表源码验收已完成。

## 目标与决策

原有 Demo [#1597](https://github.com/kaicreator-mm/domain-harness/issues/1597) 的 AC01–AC10 Scoped PASS 仅证明当时所选路径的运行行为，**不证明旧源码已被清理、代码规范合格、公共 API 无历史版本语义**。Owner 源码审核否定“版本代码质量合格”结论，进入 REWORK。

- **重构是单一模块交付**：四个职责清晰的 Workspace：Contracts、BUILD、Microkernel、DomainHarness SDK。使用一个真实四包外部安装 Demo；不增加第二 Runtime 或另一套构建器。
- **旧代码只作为历史参考**：不用“打包时排除旧文件”冒充源码清理；不为旧接口保留桥接、兼容出口或迁移层。Git 历史自然提供追溯。
- **公共 TS 标识符使用语义命名**：`buildApp`、`BuildInput`、`DomainHarnessError`；源代码路径和包导出不携带 `v011` 等阶段名称。npm SemVer 与机器契约 `schemaVersion` 等序列化字段可以保留版本含义。
- **代码注释/JSDoc 用中文**：解释职责、不变量与错误处理，不复述旧版本背景。类型感知 lint 与静态类型检查是可执行要求，不应只靠文档约束。
- **一次完整重构、一次最终模块级独立审核**：局部修复先以实际编译和测试闭环，不对每个 TS 错误建立独立审核门。禁止未通过新代码的 CI 却复用旧 SHA 的 Demo PASS。

## 已执行的过程与结果（按证据，不作成功推断）

| 阶段 | 实际发现／处置 | 证明与局限 |
|---|---|---|
| 初始源码审核 | 约 2,342 个被跟踪文件，多批旧 Runtime、Host、Compiler、旧测试/文档仍在源树，且有 `V10*`、`V011*`、`src/v011`、版本子路径导出 | 新建 Issue #1602 并撤回源码质量合格认定 |
| Git Tree 重置 | 单一隔离 PR #1603 将源码树重置为约 88 个当前文件；只保留四个 Workspace、必要测试、单 Demo 与少量现行文档；新增 TypeScript Skill | **只证明源树被清理，不证明自动重排后的代码可运行** |
| CI #2767（失败） | `npm ci` 锁文件 AJV 精确依赖 8.17.1 与 hoisted 8.20.0 不一致 | 真实失败是依赖图同步，不是 SDK 编译缺陷 |
| CI #2774/#2775（失败） | npm ci 安装 109 packages 成功；Contracts 出现 `class Error extends Error` 自继承 TS2506/TS2339 | 机械去版本前缀把具有语义的类型名错误改成原生 `Error`；改为 `DomainHarnessError extends globalThis.Error`，补继承/cause/code/name 测试 |
| CI #2776/#2777（失败）与隔离批量检查 | 四 Workspace build 和生产源码 typecheck 已 PASS；7 项 ESLint 错误、9 项 Contracts 测试 TypeScript 错误、Demo 的旧入口拒绝码错误 | 源码构建通过**不等于** test:typecheck、lint、runtime tests 或外部 Demo 全部通过 |
| R5 批量修复 | 逐项修 Ajv NodeNext 导入 `.js`、测试 `JsonValue` 边界、Schema registry 类型、Fixture 相对路径、未使用绑定、`globalThis.structuredClone`、`inspect()` Promise 返回、回滚 catch 注释、Unicode 码点计数、旧入口拒绝码 | 保留真实构建/拒绝行为，不通过弱化断言“修复” |
| CI #2778/#2779（失败） | 批量修复后的两条 CI 仍失败，但 GitHub 状态仅显示 FAILURE，未取得真实首个失败步骤 | **不能宣称所有 R5 修复后的构建/测试/Demo 已通过** |
| CI 去重 | 将临时推送分支的 Push 与 PR 两套完整验证改回单 PR 路径 | 只保留必要 CI，不因每次提交双倍 checkout/安装/执行测试 |
| 当前 | PR #1603 仍为 Draft，版本主分支 `version/v0.11.x` 与 `main` 均未接收重构 | 整体源码质量 **REWORK / NOT_ACCEPTED** |

## 可复用的成功经验

1. **把产品验收、源码质量验收和发行资格分开**。Demo 绿灯证明当时固定功能的运行路径，不代替公开 API 清洁度、软件架构、测试类型完整性或产物检查。
2. **旧代码引用，不等于旧代码继承**。新架构可研究历史代码的算法和反例，却必须重新核对入口、类型、权限边界与当前 PRD。源树真正删除旧代码，避免靠打包白名单隐藏。
3. **先确定权威职责，再调整源码**。Contracts 定义机器契约、BUILD 固化闭包与 Lock、Microkernel 唯一可信装载和生命周期、SDK 只组合公共出口。不能为了迁移方便复制 Runtime。
4. **测试代码属于测试，不属于 SDK 出口**。合法/非法 Fixture 和 `@ts-expect-error` 静态负例放测试目录；专门编译测试验证类型拒绝，不能把非法值出口发布给消费者。
5. **构建验证遵循先后依赖**：干净 npm ci → 四个 Workspace BUILD → 生产 typecheck → 类型感知 lint → 静态测试类型检查 → 运行测试 → 四包外部安装 Demo。前置失败造成的后续 NOT_RUN 不应误记为又一个运行时失败。
6. **不可达路径应按实际 Node.js 语义拒绝**。拥有 exports map 的包，未导出子路径会返回 `ERR_PACKAGE_PATH_NOT_EXPORTED`，不能只认 `ERR_MODULE_NOT_FOUND`，也不能改 SDK exports 来迎合错误测试。
7. **不重复执行同一套 CI**。每次提交尽可能只做一次 checkout/依赖安装；先复用一次本地等价检查，真正需要 Provider 或干净外部环境时才跑必要 CI。
8. **错误恢复不掩盖原始异常**。启动部分成功后的清理属于 best effort；清理失败不应覆盖最初初始化失败，也不能虚报成功。对应 catch 分支应写中文说明其约束。

## 失败机制与明确禁止项

- **禁止全仓机械删注释、批量替换标识符后直接声称“规范完成”**。自继承 `Error extends Error` 就是反例；先做语义影响分析、AST/TypeScript 编译及导出对比，再使用自动化批量迁移。
- **禁止把版本号剥离出所有字符串**。合法的协议版本、锁定 Schema、数据兼容标记和序列化字段必须按 PRD 保留；禁令只针对无业务价值的版本目录、类型与函数名。
- **禁止对 JSON/unknown 无验证地写成已验证**。测试中只有已知可信 Fixture/JSON 往返结果可以解释性断言，公共运行时对外部 `unknown` 必须做真正 Schema 校验。
- **禁止只跑生产源码 typecheck，却宣称 TypeScript 整体通过**。测试类型、动态入口、打包元数据、独立消费者实际运行都要在最终验收中有独立证据。
- **禁止把失败状态没有原始日志时的猜测变成改码依据**。优先一次性收集相同 HEAD 的第一失败步骤、原始输出和可独立检查的批量错误；在同一个 PR 中最小修复。
- **禁止凭“删除了 2,000 多文件”认定架构更好**。还必须核查每层职责、命名、注释的真实性、正确公共出口及唯一 Demo 的完整闭环。

## 重构完成门（目前未满足）

- [x] 已建立单一重构 Issue 和 PR，并实际清除历史源码与兼容入口
- [x] 已加入 TypeScript Skill、中文源码注释约束与源码命名检查
- [x] 已集中定位和提交已知的 Contracts/build/lint/test/Demo 修复
- [ ] 当前最终 Exact HEAD 干净安装、四包 BUILD、生产及测试 typecheck 全通过
- [ ] 当前最终 Exact HEAD 的 ESLint、单元/集成测试与唯一四包独立 Demo 全通过
- [ ] 结合当前真实源码做一次完整架构、质量、注释、公开出口、可维护性独立审核并解决其必要问题
- [ ] 严格按验收边界合入 `version/v0.11.x`，保持 `main` 与正式 Release 未发布

**更新规则：** 新证据只追加事实、对应 SHA、失败与修复机制；不复制旧日志全文、不为微小问题另建 Issue、不提前把任何 NOT_RUN 改写为 PASS。

<!-- DH_V0110_REFACTOR_ENGINEERING_LESSONS_R1 -->
