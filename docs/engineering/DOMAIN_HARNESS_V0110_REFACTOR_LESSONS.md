# DomainHarness 0.11.0 — 从零重构过程与工程经验

> 范围：仅限已确定的 0.11.0 Foundation 实现；记录当前重构的已证实结果与尚未通过的验证。对应 [Issue #1602](https://github.com/kaicreator-mm/domain-harness/issues/1602)、[PR #1603](https://github.com/kaicreator-mm/domain-harness/pull/1603)，由 [主 Issue #1563](https://github.com/kaicreator-mm/domain-harness/issues/1563) 统一管理。本文是工程经验：版本分支的重构代码已获 ACCEPT_SCOPED 并完成合并；main、Release、正式 Full Conformance 不包含在此限定验收中。

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
| 当前（R15+Merge） | PR #1603 已合并至 `version/v0.11.x`，普通 merge commit `bc37d1ee00fcc364a277b7c1c6913d33d56e52ae` | 审核源码 `668eb7e6ed2ae5abe1d6bd0427a92c4548b499fe`；Woodpecker #2787 SUCCESS；R15 ACCEPT_SCOPED（P0=0/P1=0/P2=5）；merge Git tree 与审核 Git tree 完全一致；main 未变，Release 未创建 |

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

## 重构完成门（版本分支重构代码已完成）

- [x] 已建立单一重构 Issue 和 PR，并实际清除历史源码与兼容入口
- [x] 已加入 TypeScript Skill、中文源码注释约束与源码命名检查
- [x] 已集中定位和提交已知的 Contracts/build/lint/test/Demo 修复
- [x] 最终审核 Exact HEAD 干净安装、四包 BUILD、生产及四包测试 Typecheck 全通过
- [x] 最终审核 Exact HEAD 的 ESLint、单元/集成测试与唯一四包独立 Demo 全通过（167 PASS、0 FAIL、1 Windows symlink SKIP）
- [x] R12 完整独立审核发现 4 项 P1，经 R13/R14 修复、R15 独立增量审核 FIX_VERIFIED，当前 P0=0/P1=0
- [x] 经 Exact SHA/CI/Review/mergeability 检查合入 `version/v0.11.x`；仍保持 `main` 与正式 Release 未发布


## R12–R15 质量审核与最终集成：可复用案例

- **R12 完整独立审查**（旧源码 SHA `610b223deb6cde1ae19a14dc62a2f396da022e8e`）发现 P0=0、P1=4、P2=5。P1 分别涉及 Hook interfaceSchemaRef 缺少 BUILD 校验、Business App Init 获得全闭包资源、重复 ingress ID 的静默覆盖、仅一包执行测试类型检查。绿色 CI 本身未覆盖上述四项源码缺陷。
- **R13 批量修复**（SHA `f40e983fa43d0de5c8032df220ba18fbc7be8972`）在同一 PR 中增加 Hook inline/ref Schema 校验及负例、App Init 资源声明白名单、ingress ID 前置去重、四包测试 Typecheck。#2786 CI 失败因新编译门发现旧测试 Fixture 直接写入 readonly 类型，不是四项产品功能回退。
- **R14 一次性本地 Agent 有界交付**（最终 SHA `668eb7e6ed2ae5abe1d6bd0427a92c4548b499fe`）仅改 BUILD 两份测试文件：可变 Fixture 限于测试，JsonValue 不递归展开；修复 TS 收窄及局部数组类型，不放宽公共 readonly ABI。源码/测试类型检查、Lint、真实四 tarball Demo AC01–AC10 通过；167 PASS、0 FAIL、1 Windows symlink SKIP；Woodpecker [#2787](https://ci.kaicreator.com/repos/18/pipeline/2787/1) SUCCESS。
- **R15 独立增量复审**：[PR Review #6001053778](https://github.com/kaicreator-mm/domain-harness/pull/1603#pullrequestreview-6001053778) 在同 SHA 逐项确认 RV-1～RV-4 `FIX_VERIFIED`；P0=0、P1=0、P2=5 沿用原非阻断发现。复用已通过的同 SHA CI，不重复审查历史上未变化模块。
- **版本分支集成**：普通 Merge PR #1603 的 merge commit `bc37d1ee00fcc364a277b7c1c6913d33d56e52ae` 以已审核 HEAD 为第二父节点，合并后 Git tree 等于已审核源码 Git tree；main 未改，未创建 Release。

### 仍未解决但非阻断的五项 P2（由 #1563 按需求取舍）

RV-5：Domain semanticRelations / Element 定义尚未完全与选定闭包交叉核对；RV-6：组合 exports 同时含 Element/Function 时可能遗漏 Function 存在性验证；RV-7：非 JSON document 的 inline/ref 摘要归一规则不完全等价；RV-8：BUILD 中部分非规范 JSON 摘要异常未全部转为固定 BuildResult 拒绝；RV-9：descriptorDigest 的 BUILD canonical 与 KDP 原始字节比较存在语义差异。这些问题不能宣称已修复，但 R15 明确认定本轮为非阻断。

### 减少重复交接的实践规则

1. 当错误取证必须本地执行时，一次有限 Task 授权本地 Agent 完成日志诊断、必要修复、本地等价验证、Git 提交及少量 CI，不拆成连续诊断/修复往返。
2. Writer 负责直接审查真实增量；独立 Reviewer 与 Writer 不同会话，只复核受影响的安全边界及原 P1；不对每个测试类型报错重新审计。
3. 合并前核对 Exact HEAD、GitHub CI、独立结论、基分支与 mergeability。Git 树比对可证明合并没有改变受审源文件；文档后续更新须明确为 docs-only，不得把合并 SHA 误称为 CI 执行 SHA。
4. 过程记录保留错误阶段原始失败事实，但当前状态与验收结论必须根据后续审核及时更新。

**更新规则：** 新证据只追加事实、对应 SHA、失败与修复机制；不复制旧日志全文、不为微小问题另建 Issue、不提前把任何 NOT_RUN 改写为 PASS。

<!-- DH_V0110_REFACTOR_ENGINEERING_LESSONS_R1 -->
