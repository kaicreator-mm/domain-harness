# DIS v0.2.0 — 全范围自对抗审核 R3 / Full-Scope Adversarial Product/L1 Review

**范围**：截至 R2 的整个候选 DIS v0.2.0，不仅是 LLM/进化：Product 边界、Domain/Element/Function、Semantic、Knowledge、AOT/Target、Package DAG、App Init、业务状态、Intent Interaction、Harness/LLM、Experience/两层进化、迁移及参考 Demo。权威 #1496，Draft PR #1497。

**方法**：单作者自对抗架构审查 + Node 独立参考模型对抗用例。**不是**与 Builder 独立的审核，也不是生产 SDK/KDP/Forge 的 Exact-SHA 源码审查。以下 24 项是在整个架构范围按风险聚合后的问题；F05/F06/F19/F20 和前轮 A01–A12 重叠，不能把两个版本的 P 数相加。

## 1. 审核总体结论

- **P0=6 / P1=14 / P2=4，共 24 项完整范围设计问题。** 各项已有 R3 设计处置与相应的拒绝/验证期望。
- **DESIGN_MITIGATION_DOCUMENTED**：24 项均已给出设计修复。不是生产实现的 `VERIFIED_CLOSED`；其中 Native/Host Side-Effect 隔离、AOT 资源签名、Local Slot 原子持久化及真实 SDK ABI 仍是正式 L2 Freeze 的硬门禁。
- Demo 以 **Tally-like Task/Review/Exact-SHA** 和 **media-player parsing** 两个实质不同 Domain 展示 2 层初始化、公开 Function、受控 Effect、Interaction 与旧进化示例组合，未接真实 GitHub、浏览器或设备。
- **重大修订**：原稿“Domain = Element Dependency DAG”不足以表达语义图与循环关系。R3 改为 “Domain = Elements + 语义关系/约束/协作 + 独立可编译的 Element Dependency DAG”。只有静态依赖图必须 DAG；语义关系可以成环。

## 2. 全范围对抗矩阵

| ID | 风险 | 刻意构造的反例/根因 | R3 处置 | 参考验证 |
| --- | --- | --- | --- | --- |
| F01 P0 | Domain 语义丢失 | 把 Domain 全部关系视为 DAG，禁止父子/互相描述等合法语义环 | Domain 语义图和静态依赖 DAG 双图；约束有明确版本/适用性 | 语义双向环 POS、静态依赖环 NEG |
| F02 P0 | Target Native Effect 绕过 KDP | Business package 直接调用文件/设备/网络/原生 API，逃逸 Effect Catalog | 物理 API 可 Target-specific；**实际 Effect 必须经过受信任的准入/执行边界**。任意不可信 JS Native API 无法靠 Metadata 阻断：要求可信源/封闭执行环境或沙箱 | Mock Effect Gate / 重放拒绝；真实 OS/SDK OPEN |
| F03 P0 | 不完整 AOT Lock | 只对 Function 实现求摘要，Element/Package/知识或资源/Provider 偷换但 digest 不变 | AOT 锁闭包含 Element+Function+Package+App+Semantic+ResourceBytes+Target+Provider+Policy，并可读回验证 | 元数据变更影响锁；伪造资源摘要、Target 和 Provider NEG |
| F04 P0 | Init 竞态/错误 READY | Package 尚未 READY 先开放 ingress；App Init 失败无回滚，或 DEGRADED 隐藏必需入口 | KDP 技术初始化 → 唯一 Business App Init → READY/明确 optional DEGRADED → ingress，失败逆序回滚 | Init 顺序、早调用/失败清理/DEGRADED NEG |
| F05 P0 | LLM 自我认证/运行时热执行 | LLM 填 PASS 或产生 eval/Tool 后直接作为资格与代码 | 可信 Domain oracle；AOT 封闭规则数据解释器；资格与激活独立；无生产 Slot 则 Shadow-only | 旧 R2 E/N01–15 + 受限 DSL |
| F06 P0 | 历史 SUCCESS 与 Effect 重放 | 旧下载/安装/合并成功结果被当前任务当作事实或可重播许可 | RESULT_REUSE 和 METHOD_REUSE 分离；真实 Context/Effect 每次重新准入、UNKNOWN 保留 | stale SHA、无授权、单次许可重放 NEG |
| F07 P1 | Capability 和 Function 双写 | Public ABI/Description 在两份 Contract 漂移 | Function 唯一公开语义真相；Capability 视图由引用/投影生成 | 公共 Function contract hash |
| F08 P1 | 静态 Element 暗藏执行权限 | functions:[] 的知识/数据 Element 被当成可直接调用的 API | 声明式 Element 允许零 Functions，但读取必须通过公开 Reader/Query Function，ResourceRef 无效应权限 | 零 Function 编译 POS、未公开 Function NEG |
| F09 P1 | Semver 动态漂移 | `^1.0` 在 Runtime 自选不同实现；target version 与已选不一致 | 范围可在 Build 解算，Runtime 只看 Exact Version/Digest/Target Lock | 声明依赖版本不匹配 NEG |
| F10 P1 | 隐式跨 Package Function | Business 直接调用 SDK 未导出的函数/漏写 Package 边 | Element 声明多 Function 依赖、Package closure/exports/target 均由 AOT 验证 | 多 Function POS，export/closure NEG |
| F11 P1 | 静态/动态 DAG 混淆 | Runtime Event 互回误被当成 static cycle，或 runtime 动态绕过依赖声明 | 静态依赖无环；事件/流程动态往返需已选 Catalog、预算/终止语义 | 静态 cycle NEG、语义 cycle POS；动态生产 OPEN |
| F12 P1 | App Init 多实例 | 多 App Init 或 SDK-owned Init 与 Business Init 双权威 | 每个 runnable Domain App 唯一 Business App Init `init(context)`，每激活身份限一次 | 非业务 Init/重复 Boot NEG |
| F13 P1 | Partial readiness 无定义 | DEGRADED 下仍公布不可用/强制 ingress | 仅预先声明 optional ingress 可以 DEGRADED 隐藏；必须路径失败则 BLOCK | optional POS、mandatory NEG |
| F14 P1 | Domain State 被 SDK/KDP 吞并 | Generic State 服务可直接变更 Tally/GitHub 事实或无副作用 Function 改写业务账本 | 业务事实归 Domain；KDP 管运行与 Effect，纯 Function 不获取可写权威状态；修改需显式治理 | 模拟纯函数 state snapshot NEG |
| F15 P1 | 澄清 Intent 等于授权 | Form/LLM 得到完整任务信息即发生敏感 Effect | Intent Interaction 只输出结构化意图/缺失项，不生成 Effect permit | NEEDS_INPUT/RESOLVED POS，越权 NEG |
| F16 P1 | Knowledge 消费不确定 | Forge 生成的事实引用缺 Schema、Reader、版本/来源/适用性，运行时任意抓取 | DIS 锁 Knowledge/Reader Query Function+Provenance+Snapshot/Currentness，Forge 生产不进入 DIS Core | Resource closure 模拟；真实 Reader OPEN |
| F17 P1 | Ref/资源逃逸或签名伪造 | `../`、远程 URL、声明 digest 与实际资源字节不一致 | 资源受封闭 URI/path 及真实内容摘要验证，禁止 Runtime 任意解析 | 三个 NEG + 正向资源 pin |
| F18 P1 | 未知 Extension/Provider 自动启用 | 未知 required 扩展或未选模型 Provider 被忽略 | required unknown fail-closed；optional unknown 不获权限；LLM/Target Provider 必须 AOT 已选 | required Ext/Provider NEG |
| F19 P1 | Experience 假泛化/隐私 | Cache Hit=独立样本，LLM 看过 Holdout，跨租户上传私有 Prompt | 来源 Cohort 分组，独立 Domain oracle，Consent/Scope/TTL，生成集/持出集隔离 | 旧 R2 N04–N09，真实隐私审计 OPEN |
| F20 P1 | 生成式任务误确定化/无限预算 | 创作文本被缓存成固定输出；超时重试无限调用 | DETERMINIZABLE/HYBRID/GENERATIVE/NONE；预算/冷却/UNKNOWN | 旧 R2 N06/N10，实际 Provider OPEN |
| F21 P2 | 通用 Harness 侵占业务 | 平台强制 Main Workflow 或统一 UI/State/Agent 系统 | 可选 Harness/LLM/Interaction SDK Elements；不增加第二 Kernel/Journal | 两 Domain 无 Main Workflow POS |
| F22 P2 | 中文/英文/旧版双重权威 | R1 “Domain=Dependency DAG”、英文 R2 addendum 与 R3 冲突 | R3 修复稿明确 precedence，双语摘要统一且旧文件历史保留 | 文档审阅，完整逐条双语一致性 OPEN |
| F23 P2 | 旧 Unit 静默迁移 | 0.1/旧 0.2 Unit 无证据改名 Element，虚构新函数/资格 | 显式 Migration Ledger，不能静默改写冻结 DIS 0.1 | 需真实迁移 Demo，OPEN |
| F24 P2 | “Demo PASS”冒充交付 | Fake LLM/Fixture Oracle/模拟 AOT 获得生产 PASS | 收据强制标识 SELF_SIMULATED；Node24、CI、真实 SDK、独立审查保留 OPEN | R3 自验证报告与源 hash |

## 3. R3 设计修复与仍未关闭的工程边界

权威 Product/L1 细化规范：[FULL_SCOPE_REPAIRS_R3.zh-CN.md](FULL_SCOPE_REPAIRS_R3.zh-CN.md)。R2 关于 Experience/Slot/LLM 的详细数据契约继续适用，但与 R3 冲突时以 R3 的更严格拒绝规则为准。

### 3.1 不能只靠架构文本解决的事项

1. 任意 Target Package 的原生 API 能否绕过 KDP；**模型本身不能证明“物理权限隔离”**。必须结合真实受信任代码基线/沙箱/受控执行者和系统/设备测试；Demo 的 Set permit 不是生产安全证明。
2. 动态本地规则 Slot 在多线程/多进程崩溃、旧 Task Pin、撤销与事件 Effect 中的真正原子性，需 SDK 测试。
3. 可信 Evidence 的跨进程签名、来源复核、资源真实字节与知识版本在生产 Forge/AOT 工具链中的绑定，需具体接口与实现。
4. SDK ABI 兼容、Node>=24 与 Woodpecker、两个真实而非 Fixture 的不同领域消费、完整中英条款一致性及独立 Exact-SHA Reviewer，均未运行。

**审查门禁结论**：R3 文档整改和双领域模拟 Demo 可以判定为 `PRODUCT_L1_DESIGN_MITIGATED / SELF_TESTED`，**不能判定** `L2_FROZEN`、`PRODUCTION_P0_CLOSED`、`RELEASE_ELIGIBLE` 或真实 Runtime 已适配。
