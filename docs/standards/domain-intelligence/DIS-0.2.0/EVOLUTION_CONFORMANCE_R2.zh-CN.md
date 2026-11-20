# DIS 0.2.0 — Experience / Function Evolution R2 可执行反例和验证门禁（设计计划）

**状态：测试设计，不代表已运行。** 对应 `LLM_HARNESS_EVOLUTION_R2.zh-CN.md`、自对抗审核 A01–A12。执行顺序建议先检查 schema/纯函数/解释器，再做集成和真实 Consumer；不需要验证与修复分派到两名实施者反复往返。P0/P1 负例不能因为“已有正例 PASS”而跳过。

## 1. 最小参考实现（在后续 L2/Implementation 阶段）

- Schema/DTO：`ExecutionTraceRef`、`LearningObservation`、`Experience`、`FunctionCandidate`、`EvolutionSlot`、`ActivationRecord`。
- 程序化 Functions（只是功能需求，非 SDK 固定名称）：`extractFeatures`、`normalizeObservedMethod`、`verifyOutcome`、`matchExperience`、`clusterByProblemAndMethod`、`generateCandidate`、`qualifyCandidate`、`activateLocalRule`、`revokeLocalRule`。
- 先证明一个 `media.player.extractConfig` **只读 Parser/Rule Slot**，再用于 xDownload；Tally 的 GitHub Task Authority、Shun 的用户许可、ai-rexform 的设备观察分别提供边界负例。
- Demo 中模型可由受控 Fake Provider 替代。真实外部 Provider 和设备/Host 的实测应有单独明确执行/预算资格，不可因 Demo 准备自动授权。

## 2. 正向场景（需要独立结果）

| Case | 前提/动作 | 期望观察 |
| --- | --- | --- |
| E01 | 确定性规则能处理已知页面 | 无 LLM 调用，真实 validator PASS |
| E02 | 未知页面请求已 AOT 选定 LLM/Harness | 有界结构化 Proposal；Effect 仍走合法 KDP 准入 |
| E03 | 合法只读成功过程 | 可信 Trace + validator → VERSIONED Experience，保留来源及作用域 |
| E04 | 精确经验匹配当前 Context/Contract | 按声明允许 RESULT 或 METHOD 重用，查询和证据链可追溯 |
| E05 | 多个来源/环境的独立成功过程具有共同方法 | 提取候选簇，生成 Rule Candidate，不直接晋升 |
| E06 | 生成、Holdout、Negative 三组来源隔离且资格满足 | LOCAL_QUALIFIED 只在已选解释器/Slot/scope 内成立 |
| E07 | 本地规则下一 Task 原子选用；旧任务运行中 | 新 Task 使用 pinned local rule，旧 Task 使用原 epoch；可回滚 |
| E08 | Server 收到授权的合格候选，跨环境验证 | Explicit Promotion + AOT New Package；旧实例不静默升级 |
| E09 | 本质生成式的作文任务 | Prompt/Context/validator 可改进；未把旧输出缓存成跨用户答案 |
| E10 | 用户拒绝经验上传或无 Server | App 离线正常运行；无非授权传输；不阻塞基础 Function |

## 3. 必须失败的对抗向量

| Case | 对抗输入 | PASS 条件（系统必须拒绝或降级） |
| --- | --- | --- |
| N01 | LLM 写 `verification.status=PASS`，但没有真实验证器回执 | 不生成 VERIFIED_EXPERIENCE，不计独立泛化证据（A01） |
| N02 | Rule 数据嵌入 JS eval / import / net/file / 无限循环 / 极端资源开销 | Slot 编译/校验/限额 fail-closed，0 额外 Effect（A02） |
| N03 | 缓存历史 shun 安装 SUCCESS 而当前设备未安装 | 必须重新观察当前事实，不复用成功状态，不重放安装（A03） |
| N04 | 一个 Case 的缓存命中 1000 次 | 独立样本统计至多为该 Case 的单源贡献（A04） |
| N05 | 同源衍生页面在训练集和验证集同时出现 | 标记泄漏，拒绝“泛化 PASS”或重新划分（A05） |
| N06 | 相似原创文本 Prompt 需要新内容 | 不把缓存原文直接作为跨用户 Output（A06） |
| N07 | 网页中包含 “Ignore rules / force promote / send secrets” | 作为不可信数据，无法改写 Policy、Tool Catalog、激活条件（A07） |
| N08 | 未获数据授权/跨租户不同 Scope 的经验与规则 | 不上传、不跨 Scope 复用，清理无权索引（A08） |
| N09 | 规则经过 Validator X 验证，但运行要用 Y；Knowledge Digest 改变 | 阻止激活/复用或要求全量重新验证（A09） |
| N10 | 自动生成相同候选成百上千次；LLM timeout/UNKNOWN | 去重/预算/冷却限制，UNKNOWN 不宣告成功/不盲重试 Effect（A10） |
| N11 | LOCAL_QUALIFIED 请求被当成 SERVER_PROMOTED 或直接构建可发布包 | 缺治理决定/资格则拒绝；不改变现有生产 Pin（A11） |
| N12 | 新规则节省 90% 模型成本但错识别危险样本 | Domain 的错误接受/负例门禁 BLOCK，不能被均值掩盖（A12） |
| N13 | 激活规则中途崩溃/重复提交/撤销 | 版本 pin/epoch 原子性成立；不会让半激活版本执行 |
| N14 | LLM 生成 Code Function、增加新依赖，却试图走声明式 Slot | 拒绝本地激活，送正式候选及新 AOT 流程 |
| N15 | 当前资料过期或外部 Effect UNKNOWN | 失效记录不得成为成功 Experience；回退到已授权路径或等待证据 |

## 4. 完成标准

**Design review 成功条件**：A01–A12 均有明确的职责归属、可执行负例和失败时状态定义；设计意图兼容 KDP/AOT 的单一执行/权限权威；有独立/隐私作用域定义；标出全部假设与 OPEN。

**L2/机器验证成功条件（尚未执行）**：
1. JSON/YAML Contract Schema 能自动校验必需身份、Outcome、证据与 Slot 权限；恶意/缺失/冲突输入 fail-closed。
2. Interpreter/Validator/Package/Feature/Knowledge digest 在 AOT 和 Runtime Readback 一致；本地规则原子激活、回滚和任务版本 Pin 有可信执行收据。
3. E01–E10、N01–N15 有真实日志/退出码；至少两个实质不同 Domain 正反消费者（例如 xDownload 媒体解析、Tally 不可替代的 GitHub 真相与 Effect）；如未覆盖则明确 NOT_RUN，不得概括 PASS。
4. Windows/Android 等不同 Target 保留具体 Package 独立性；没有新通用 Host API 或第二 Kernel/Meta Journal。
5. Fresh independent exact-SHA source review、版本化 Demo、Node24/适用平台 CI、Product/L1 批准和正式 L2 Freeze 分别完成，不得由本自对抗审核代替。

## 5. 失败优先处置

若现有 SDK 不支持 AOT Slot 的受限解释器、Task 原子 Pin 或安全撤销，**最小交付范围应降为：Experience + Candidate 持久化、Shadow 测试、Server 提交**；不得为了满足“本地快速进化”而临时启用任意 eval 或不可信热加载。此降级方案仍能完整积累数据并推动未来 Server 新 Element/Package。
