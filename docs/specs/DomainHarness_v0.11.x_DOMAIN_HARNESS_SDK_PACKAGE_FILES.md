# DomainHarness v0.11.x — Domain、Harness、SDK、Package 实例驱动规范（R37）

> **Owner R36 修正 R34/R35 的工具化假设**：Domain Package 只是符合 DIS 适用 Package 规范与当前 Element-First 合同的一组文件，完全可以由 ChatGPT 在仓库中直接编写。**Seed Builder 不再是需要开发的工具，Package Assembly 也不是创建 Package 的必要环节**。细节见 [R36 产品与 Package 权威规范](DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md)。

```ini
OUTPUT_LABEL=DH_V011X_R36_THREE_NAMES_DIRECT_AUTHORED_PACKAGE
PRODUCT=DOMAIN_HARNESS_SDK
DOMAIN=BOUNDED_DOMAIN_SEMANTICS
HARNESS=BOUNDED_EXECUTION_CONTROL
SDK=REUSABLE_PACKAGE_BOOT_AND_EXECUTION_API
PACKAGE=MANIFEST_ELEMENTS_IMPLEMENTATIONS_AND_RESOURCES_FILES
WRITER=HUMAN_OR_CHATGPT_OR_AGENT_OR_FUTURE_FORGE
GENERATOR_REQUIRED=FALSE
SEED_BUILDER_REQUIRED=FALSE
ASSEMBLY_REQUIRED_FOR_PACKAGE_CREATION=FALSE
VALIDATION_REQUIRED=TRUE
DOMAINFORGE=DEFERRED_NOT_BLOCKING
```

## 1. 三个名字及最终产品

**Domain** 表示业务领域的知识、事实、规则、约束与适用范围；**Harness** 是使用所选 Domain 完成 Task、Workflow/状态/授权/反馈的执行支架；**SDK** 是使用相同 Boot、Domain Packages、Function/Element/Package Contract 和公开 API 来搭建不同领域应用的可复用开发工具包。

**DomainHarness SDK** 本身不是独立的 Package 生成器。它可由 Boot + 若干基础/标准/领域 Domain Packages 组成，其余应用也复用这个相同模式。0.11.0–0.11.9 是交付这一个 SDK 的内部阶段，不是生产多个不同产品。

## 2. Domain Package 的文件构成

最简形式是 **一份规范 Manifest + 必要的 Element Definitions + 被引用的内容/函数实现/资源文件**。根据实际 Package 合同决定文件数量与类型，不规定必须有多少文件、必须使用某个模板目录、必须是工具产物。当前的 `packages/contracts/src/package-manifest.ts::DomainPackageManifest` 已含：
- Package 的 `kind/schemaVersion/id/version/layer/role`、Elements、显式 `dependsOn/imports/exports`、Target 绑定，以及所拥有的 Init 和可选 Exit Element；
- `ElementDefinition` 和 Function/Content/Schema 的合法引用、`ResourceRef` 所属 Package、相对路径、内容摘要；Target Function 的真实文件/静态导出与引用吻合；
- Core.Order 唯一且 KDP 为 0；跨 Package 访问遵守已声明直接 Extension；实际必须满足 Package 合同及目标运行环境。

**Manifest 可以由 ChatGPT 手工填写，ESM 和各类 Element/资源文件也可以由 ChatGPT 手工编写。** 将这些文件提交仓库之后，该 Package 就作为现成 Package 候选存在，无需另一套生成/重新“组包”的处理。真正的质量验收要看文件、引用、静态权限与真实 Boot/Consumer，不看生成者是谁。

**当前 DIS/Package/SDK 规范尚不够完整和明确**。DIS 适用的已有条款与 v0.11.x 当前已明确且受审的 Element-First 合同是每次实现的起点；未被具体定义、存在冲突或未覆盖的情形，要通过 0.11.x 的真实 Package/SDK Consumer 与反例识别、补充并审查，**不能将推测的细节说成已冻结强制标准，也不能因此无限期停工**。结构/静态检查合格不等于 DIS Full Conformance 或外部业务知识资格。

## 3. 构建 SDK/Domain App，不等于“生成 Package”

```text
[直接编写的 Package A 多个文件] ─┐
[直接编写的 Package B 多个文件] ─┤
[已有标准 Package 文件] ────────┤
                                ↓
          确定需要的 Package / 依赖 / Target
                  （验证真实引用与权限）
                                ↓
            Boot → KDP → 已选 Packages
                                ↓
               DomainHarness SDK / Domain App
```

**确定选用的多个 Packages 是应用组合行为**，它可以由已有 manifest/配置和 SDK 代码完成。它不是“生成一个新的单 Package”的必要条件，更不要求开发专用 Assembly Service、Compiler 或 Build Pipeline。没有需要组合的新包时，也没有理由安排多余的 Assembly 工作。

若现有运行/安装形式要求 Lock/Pin、完整性、直接 Extension 静态校验，依旧沿用受审的必要验证和启动代码；**取消生成器的要求不等于取消安全门**。

## 4. DH 自身的启动与持续演化

第一代基础 Packages 可以直接由 ChatGPT 在 DomainHarness 仓库中编写；在必要的验证与 Boot 过程后得到 SDK。后续需要修改或新增 DomainHarness Package 时，也直接编辑其真实文件，经相同的 Package 合同验证并在 SDK 上运行。这样就能以一套 Package/Boot 模型持续构成下一代 SDK，不需要证明“生成工具能够生成自己”。

既有 [#1647](https://github.com/kaicreator-mm/domain-harness/issues/1647) 已调整为**直接编写基础 Domain Package 文件**的有限任务，撤销研发 `tooling/bootstrap-seed/` 或 `scripts/bootstrap/` 工具的要求。

**Forge** 当前不可用，不参与 DomainHarness v0.11.x 开发或验收。未来基于完成的 SDK 开发后，它可能大规模创作 Package，但不会改变“Package 的身份只取决于实际文件及规范”的规则。唯一说明 Issue 为 [Forge #218](https://github.com/kaicreator-mm/domain-forge/issues/218)。

## 5. 在真实实现中逐步形成 Package / SDK 规范

**这是一套随着 0.11.x 演进的活规范（living specification），不是要求先把全部 DIS/SDK 形式细节编好才允许实现**。每版按一个有限闭环推进：

1. **取真实实例**：选当前版本真正需要的 Domain Package 文件、已有标准 Element 或一个独立 SDK Consumer；优先复用已合格的文件和 ABI，不造为了证明理论而存在的假例。
2. **列出实际适用要求及缺口**：标记 `CONFIRMED`（现有受审且当前适用）、`PROPOSED`（由这次实例发现并准备补全）、`UNKNOWN`（尚缺 DIS/SDK 决策或证据）和 `NOT_APPLICABLE`（有理由不适用）；必须引用对应文件/行为/反例。未决项不冒充通过；仅当它是当前交付的必要安全或接口缺口时才阻塞该项交付。
3. **实现与试验**：直接编写或修改真实多文件 Package；使用真实 SDK API/Boot/Consumer 验证正例，并给出影响边界的负例（如未声明 Extension、错误 Target、错摘要、Init/Exit 失序）。失败、设计冲突、DIS 模糊点优先形成具体可复现的契约补充，而非追加抽象平台。
4. **规范固化**：只把真实证明过且对以后复用有价值的身份、文件形状、引用/权限、错误语义、Package 选择、SDK 公共行为写入相应 0.11.x Product/L2/Contracts 与测试。注明适用范围/目标环境、版本、Exact HEAD、正反例；需要改变既有受审契约时按受影响范围独立审查并迁移实际代码，禁止悄然覆写旧证据。
5. **逐版增量复用**：下一个版本先沿用已经审查通过且未改变的规范和验证样例，只处理新实例揭示的缺口；不会每版从零证明全部规范或为了“完善全套 DIS”无界扩张。

**规范应可使用而非完美先行**：一个具体 Package 的必要合同可以先被验证并应用，同时明确记录未定义的其它 Target/未来 Forge 格式；不能把局部通过拔高为“所有 Domain Packages 的 DIS Full Conformance”。同时安全与运行必需的不变量（身份、直接 Extension、Target、摘要、权限、Boot）不能以“规范尚在完善”为由被跳过。

## 6. 验证工具可以建设，但独立于 Package 的作者和生成过程

**验证器（Validator）检查现成 Package 是否满足适用规范；生成器（Generator）创建或修改 Package 文件。二者是不同职责，互不作为存在前提。**

- **可以直接人工/ChatGPT 编写文件**，然后用已有校验 API、测试或一个小型 CLI 检查 Manifest/Element Schema、引用闭包、Owner、Direct Extension、Function 导出、资源 digest、Target 与 Boot。**验证工具可以按真实问题增量编写**，尤其能复用相同错误拒绝时；工具不负责把文件“生成出来”，也不得强制使用指定作者方式。
- **验证工具可以先是 DomainHarness 自己的轻量测试/辅助程序**，也可以后续作为 DomainForge 的一个验证能力复用或迁入 Forge；**“可能属于未来 Forge”不是当前依赖要求，不需要现在开发 Forge**。对外是否开放/如何封装，只依据后续真实使用场景确定。
- **工具本身也需用已知正反例验证**；其 `PASS` 仅对实际覆盖的规范、输入、Target 和版本有效，**不代替**缺失的专业权威、DIS 形式化资格或真实 Boot/运行验收。必要运行期安全约束仍由 SDK/Boot 保证，不能因为有离线检查工具就全部撤除。
- **不强制引入额外生产阶段、第二 Build/Assembly/Kernel、全域抽象验证平台或通用语言编译器**。选择脚本、库、测试还是人工审核取决于实际成本和风险。

## 7. 每个 0.11.x 版本共用的检查

新增 Package 时以**实际文件与当前已明确且适用的 DIS/0.11.x 合同**为基础验证；未清楚的 Package/SDK 语义通过实例、反例和受影响审核补全。新增 SDK 行为时检查能否通过 Boot+Packages 复用；有新的应用组合时检查 Target/依赖/权限及真实运行。**可按需建立验证工具，但不得把生成器、Validator、Seed Builder 或独立 Assembly 工具作为 Package 创建的前置条件**。

所有完成结论仍以实际源码文件、有效测试、Exact HEAD 和必要独审为准；文档修正不是源码完成收据。
