# DomainHarness 0.11.x — 增量交付质量防回归手册

> **来源**：0.11.0 [R12 完整独立审核 → R13/R14 集中修复 → R15 增量通过](https://github.com/kaicreator-mm/domain-harness/issues/1602)、[完整工程经验](DOMAIN_HARNESS_V0110_REFACTOR_LESSONS.md)、[源码与调用流程](../architecture/DOMAIN_HARNESS_V0110_CODE_AND_CALL_FLOW.md)。本手册是 **0.11.1+ 开发时必须应用的方法**，不重新授予 0.11.0 Full Conformance，也不增加第二条 Runtime/CI。
>
> **目标**：把真实失败机制变成「改动前先识别风险 → 同时交付正例/反例 → 本地首检 → 唯一 CI → Exact HEAD 独立增量审核」的同一条闭环。**降低再次犯错的概率，不能承诺软件永不出错。**

## 1. 动手编码前：先绘制最小的变更风险切面

在现有 Task Issue / PR 上用简短文字明确以下五点，**不要为每点建新 Issue**：

1. **权威及所有者**：哪个 Workspace 对合同、决策、执行或观察负责？现有 Contracts → BUILD → Microkernel/KDP → SDK 的边界是否被突破？
2. **信任与权限**：新输入来自用户、Package、Lock、安装器、Host、LLM 还是已验证数据？谁有权限改变它？是否会让某个业务函数访问其他 Package 资源？
3. **状态与副作用**：何时允许 ESM 模块求值、创建状态、执行 Function/Effect？失败是否已经发生部分初始化？必须先拒绝还是逆序清理？
4. **必测反例**：不仅写 HAPPY_PATH；至少覆盖该变更最危险的缺失/重复/不匹配/篡改/不受权/UNKNOWN 或异常路径。只选**本次实际新增或修改**的风险边界。
5. **可复用的验收**：哪些现有单元、Contract、Package clean-install Demo 或 CI 已验证且源码未变？增量只补真正新路径，不复制整个旧验收。

**未触碰信任、权限或生命周期的纯文档改动**只做链接、内容和 Diff 检查；不强迫完整 Demo 或独立模块审核。**新增安全/权威边界**先制定 NEG/ERR，再实现 POS。默认独立审查属于高风险边界、完整新增模块或已有 P1 的必要复审，而不是每一个小提交的强制仪式。

## 2. 0.11.0 真实问题 → 可执行的预防动作

| 真实失败 / R12 发现 | 造成问题的机制 | 下个版本必须执行的预防动作 | 已有或应补的可复验证据 |
|---|---|---|---|
| 旧 Runtime 混入 / 版本化 TS 接口 | 只改构建排除名单，源码树仍有多个权威入口 | 新能力先确认唯一所有者和包根公开出口；不引入旧 ABI/平行 Kernel | `scripts/check-source-quality.mjs` AST/路径与导出检查 |
| 机械改名生成 `Error extends Error` | 字符替换不等于语义等价 | 先查标识符冲突，再编译所有受影响源文件和测试；错误类型使用不混淆名称 | `npm run typecheck` + `npm test` |
| AJV hoist/`package-lock.json` 偏差 | lockfile 与 package.json 依赖图不一致 | 修改依赖后在干净工位运行 `npm ci`；不得用安装缓存成功替代 | 单次 PR CI 的 clean install |
| NodeNext/AJV 导入与 `dist/current` 旧 Fixture | 测试调用的不是 package.json 实际 `exports` 与 `dist/index.js` | 使用真实 `exports` / NodeNext 解析；随导出变化更新所有 Fixture，包含 Demo | 四包构建 + 测试 Typecheck + 实际 tarball Consumer |
| TypeScript 源码 PASS、测试 TS 错误未查 | 静态检查只编译一个 Workspace | **所有 TS Workspace 必须有 `tsconfig.test.json` 和 `test:typecheck`，根 `npm test` 必须先运行全 Workspace 测试检查**；违规在 lint 直接拒绝 | 本仓库 `scripts/check-source-quality.mjs` 的结构检查 + `npm test` |
| 34 项运行测试级联失败 | 共同 Fixture 路径不匹配，却当作 34 个独立源码缺陷 | 聚合失败按公共根因，先修唯一入口；别为每个从属失败创建任务/Reviewer | 首失败步骤、受影响测试族、修复后一次集中验证 |
| Hook interfaceSchemaRef 漏校验（RV-1） | 仅检查 Function 合同而遗漏新增 Hook 接口 | 所有从引用解析出的 Schema（inline/ref）须在 BUILD 做选定闭包、字节摘要和编译验证 | 非法 inline、错误 digest、未选择包引用等 NEG |
| App Init 拿到整个资源闭包（RV-2） | 直接以 Lock 全资源生成业务句柄 | 权限**从具体 SelectedFunction.resources 推导**，默认无其他资源；不把密钥/可执行产物/未声明资源暴露给 App Init | 合法声明可读 + 未声明/其他 Package 不可读 |
| 重复 ingress ID 被 Map 覆盖（RV-3） | 后出现的映射静默替换前者 | 面向外部名称的 ID 在进入 Map 前唯一性校验；引用必须绑定实际 Element/Function 身份 | 相同 ID 指向不同合法 Function 的 NEG |
| 新测试被 `readonly` 阻塞（RV-4/R14） | 非法测试值直接改写正式类型，导致全工作区类型检查失败 | 构造非法值只在 tests 用局部 Mutable Fixture / `unknown`，不放宽正式 `readonly` ABI | `npm run test:typecheck --workspaces` |
| `1e999` 及 digest 非规范 JSON | `JSON.parse` 允许指数溢出为 Infinity；摘要函数抛错逃出 Boot | 外部不可信数据的 Canonical/Digest 操作应受控拒绝；不能静默放行或未捕获异常 | 非规范数字/坏摘要 → REFUSED/FAILED + 无业务副作用 |
| `inspect()` 共享内部 Lock 引用 | TS `readonly` 无法禁止 JS 消费者修改数组与嵌套对象 | 对公共 Snapshot 复制可变嵌套引用，禁止暴露内部运行时集合 | 修改 inspect 返回值后再次 inspect/调用不变 |
| App Init / 技术初始化异常 | ESM 已求值或部分 Package 初始化，后续失败需要撤销 | 未验字节不导入；初始化按依赖排序、失败逆序清理，清理异常不覆盖首要原因 | 实际安装 tamper、Init throw、Dispose 逆序/单次 |
| 两套 Woodpecker 流水线 + 旧 SHA 绿灯 | 每轮重复 clone/安装，CI 当前性与 Reviewer SHA 失配 | 仅一次必要 PR CI；通过后锁定 Exact SHA，合并时比较 Git tree；不拿历史 SUCCESS 或 NOT_RUN 冒充 | GitHub Status + Review SHA + Merge ancestry/tree |
| 只做 Demo，不做源码架构检查 | 一条端到端路径可绿但权限/Hook/ID 根本没覆盖 | 新模块或新信任边界审查设计的反例覆盖和职责，不以 Demo PASS 替代代码质量审核 | 受影响范围的独立增量 Review；不重复旧模块全审 |

### 尚未解决的 P2 如何处理

0.11.0 R15 保留的 **RV-5** Domain 关系与已选闭包、**RV-6** 组合 export 的 Function 存在性、**RV-7** 非 JSON 文档 inline/ref 归一、**RV-8** BUILD 非规范 JSON 拒绝、**RV-9** BUILD/KDP descriptorDigest 语义差异，均**不是已修复**。

下一版本改动恰好触及某一边界时，必须先将相应 P2 纳入本次 Issue 的风险清单并构造 NEG/ERR；不触及的 P2 不无端升级为所有开发任务的阻断或另开大治理任务。

## 3. Builder 的单次工作方式（避免“诊断—修复”反复往返）

**开始**：读本 Task Issue、当前分支和关联 PR，记录 `EXPECTED_HEAD` 与唯一 Writer 写集。允许多个子智能体做只读源码/日志分析；**生产源码修改保持一个 Writer**，合并和版本推进由 Integrator 负责。

**编写**：先根据本次影响范围写 POS/NEG/ERR；实现与测试一起修改，保持当前公共 ABI 的权威与 Node >=22.12.0。仅修改当前必要文件；不通过弱化断言/关闭 lint/跳过测试让绿灯出现。

**提交前**：按依赖顺序验证，不先推送明显不可编译的代码：

```text
npm ci                       # 仅依赖变更/干净工位需要；一次即可
npm run build                # 四 Workspace
npm run typecheck            # 生产 TypeScript
npm run lint                 # 源码命名/导出/注释及 typed ESLint
npm run test:typecheck --workspaces
npm test                     # 已包含 test:typecheck；不在同一验证轮内重复上一行
npm run test:demo            # 触及发布入口/安装/Lock/Boot/KDP/跨包行为时
```

上面列的是可选择的**验证覆盖范围，不是七次必须连续重复跑的命令**。当改动已经足够完整且需要全链验证时，可使用 **一次** `npm run verify`（build→typecheck→lint→test→Demo），避免重复单独执行 `test:typecheck`。触及少量单一业务代码先运行受影响测试，必要时再全量。PR 的 Woodpecker 已负责单次独立干净环境验证，不需要另起第二份完整 CI。

**CI 失败时**：先读 GitHub Exact SHA 的失败状态，再从 Google Drive `Logs/woodpecker/domain-harness/<pipeline>/failure.log` 取第一失败命令；同一批失败按根因去重。仅当本对话无法读取需要的 Host/Windows/Runner 证据时，将**定位→必要改码→本地验收→推送→有限 CI 复验**作为一个有界本地 Agent 任务，允许本地 Agent 直接修复，不再先交诊断回来请求第二次授权。禁止无限循环或持续后台工作。

**审核与合并**：只对新增模块或变更的权威/权限边界作必要独立审核（与 Writer 不同会话；同账号不同会话可以）；已有审核通过的未变化代码可复用。合并前确认 PR HEAD == 审核 SHA == CI SHA、base 未漂移、无必要 P0/P1，合并后比较 Git tree 是否与已审源码一致。Docs-only 的合并后修改单独标记，不能冒称有新的源码 CI 证据。

## 4. 增量任务的简要收据（写回原 Task Issue）

**无需额外 OWNER 授权、无需新审批 Issue。** 仅在已有任务上保留下面的信息，便于另一独立会话准确复审和后续版本复用：

```text
OUTPUT_LABEL=DH_V011X_INCREMENT_DELIVERY
REPO=kaicreator-mm/domain-harness
MASTER_ISSUE=#1563
TASK_ISSUE=#<native task issue>
PR=#<one implementation PR>
EXPECTED_HEAD=<GitHub SHA at start>
FINAL_EXACT_HEAD=<actual head>
SCOPE=<current new or affected functionality>
BOUNDARIES=<trust/capability/state/contract seams touched>
POS_NEG_ERR=<new and reused test refs + result>
LOCAL_VALIDATION=<commands and PASS/FAIL/NOT_RUN>
WOODPECKER=<pipeline, exact SHA, actual status>
REVIEW=<independent delta result or NOT_RUN>
P0_P1_P2=<open findings with owners>
BLOCKER=<none or actual external reason>
```

**完成标准**：新增的需求能力与已选边界有真实正例和必要反例、当前源码和测试均可编译、所有运行时受信/权限约束没有默默扩大、真实 CI 和独立审核没有引用旧 SHA。若未触及高风险边界，不要创建新的 Reviewer 负担。

## 5. 下一版本如何直接使用

在每个 0.11.1+ 原生 Task DAG 的 **第一个实施任务** 引用本手册的 `1` 风险切面；后续 Task 仅补新增边界及测试。例：Task/Workflow/State Loop 不创建平行 Kernel；其运行状态、超时/中断、UNKNOWN 语义及权限保持在唯一 KDP/SDK 授权路径内，按“合法进入 → 无权限/未知/重复 → 中途失败 → 清理/观察”组织增量测试。该示例是**设计检查方式**，不表示 0.11.1 已实现、冻结或获得审核资格。

已有 [0.11.0 详细调用链](../architecture/DOMAIN_HARNESS_V0110_CODE_AND_CALL_FLOW.md) 是新增功能判断所属层的源码依据，优先复用已验证的 BUILD、Trust、Package、App 和 clean-install 测试。后续任何新的真实失败，按“现象→机制→预防关口→反例/脚本→验收”增量更新本手册；**不要添加单纯重复的口号性规范**。
