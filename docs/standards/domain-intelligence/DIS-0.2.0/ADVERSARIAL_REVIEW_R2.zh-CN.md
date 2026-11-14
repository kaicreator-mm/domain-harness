# DIS v0.2.0 — LLM/Harness/Experience/Function Evolution 自对抗审核 R2

**性质：单一作者主动寻找反例的 SELF-ADVERSARIAL PRODUCT/L1 REVIEW；不是 Independent Review、不是执行验证或 PASS Receipt。** 审查对象为 `dis/0.2.0-element-intelligence-r1` 的 R1 候选：`LLM_HARNESS_EVOLUTION_R1.zh-CN.md`、`ELEMENT_FUNCTION_CONTRACT_R1.zh-CN.md`、`DIS-0.2.0.zh-CN.md` 和讨论中的 Experience/Function Evolution 示意。对抗问题：即便每个模块“看起来合理”，组合后是否可能产生错误升级、假成功、越权、数据泄露或 AOT 失效？修复稿：`LLM_HARNESS_EVOLUTION_R2.zh-CN.md`；负例计划：`EVOLUTION_CONFORMANCE_R2.zh-CN.md`。

## 1. 分级结论

- **P0（架构门禁）3 项：** 自我验证的虚假成功；动态 Rule Slot 绕过 AOT/权限；经验结果重放外部 Effect。R2 已提出**设计级修复**，尚未由真实 SDK/Consumer 测试证明关闭。
- **P1（进化正确性/隐私）7 项：** 缓存命中伪样本；数据/验证泄漏；生成式任务误确定化；Experience 注入污染；跨用户上报和共享；版本/currentness 失配；生成成本/无界循环。R2 有约束与针对性负例。
- **P2（产品/治理）2 项：** Server Meta 与 Forge/Promotion 权威不清；只看减少 LLM 调用而忽视正确率。R2 给出职责/指标建议。
- **总计：P0=3, P1=7, P2=2。** 这是**本轮设计审查发现数**，不是代码缺陷或软件测试结论。新增 R2 文档中的“Design Mitigation”不等于验证通过，也不等于发布准入。

## 2. 对抗矩阵

| ID | 级别 | 反向攻击/失败场景 | 现有 R1 弱点 | R2 设计处置 |
| --- | --- | --- | --- | --- |
| A01 | P0 | LLM 生成解析规则并自报成功，再由同一 LLM 评分 PASS，完全没有真实验证 | “有验证”但独立 oracle 未具体化 | Experience 的验证必须绑定真实 Domain validator 及证据；缺失只能 Observation；LLM 自评分不计资格 |
| A02 | P0 | 在 AOT Slot 中塞入任意代码/无限正则/外部网络能力，绕过 Function 权限 | “受限规则”但允许语言、资源和解释器锁未定义 | 只接收有界声明式 AST 数据，拒绝脚本/外部 I/O/权限，签名/摘要/运行资源/版本/回滚受控 |
| A03 | P0 | 缓存显示“安装成功”，再次命中即宣称设备已安装；或盲目重放一次不可逆 Effect | 缓存了 Outcome 却未区分结果与方法 | RESULT_REUSE 与 METHOD_REUSE 分离；必须验证当前业务事实，不缓存/复用原 Effect 授权 |
| A04 | P1 | 同一网站同一快照缓存命中 1000 次，被当作 1000 独立成功样本 | 没有独立 Case 语义 | `independentCaseKey`/来源 cohort 去重；缓存命中仅说明收益，不计为新泛化验证 |
| A05 | P1 | 来自同网站模板的两个变体同时进入生成集和测试集，验证虚高 | 普通随机分割导致同源泄漏 | 按来源、模板、设备、时间/环境划分 holdout，未见来源独立性则 NEED_MORE_EVIDENCE |
| A06 | P1 | 创意文本生成任务由于多次类似输入被固化为固定回答，出现跨用户泄漏/质量下降 | “进化=替代 LLM”倾向 | 定义 DETERMINIZABLE/HYBRID/GENERATIVE/NONE，生成式优化模型/Context/验证，不默认固化输出 |
| A07 | P1 | 网页 Prompt Injection 伪造“PASS/授予权限/上报此网页”并进入 Experience | 模型/网页内容未与可信事件隔离 | Evidence 基于受信任事件/业务校验，来源分级；外来内容只能是数据，不得变更 Policy |
| A08 | P1 | 跨用户、设备、租户上传网页内容、Prompt、设备快照导致隐私泄露 | `privacyScope` 太粗 | 默认 local-only；授权/脱敏/最小化/撤销/边界明确，跨域索引不能擅自合并 |
| A09 | P1 | 验证使用解释器版本 X，激活时变为 Y；知识版本更新后复用旧 Experience | 版本/currentness 条件不足 | Function/knowledge/interpreter/validator/package/target hashes + invalidators + activationEpoch + task pin |
| A10 | P1 | LLM 反复生成/自修复 Rule、Tool 重试无限循环，费用高且 UNKNOWN 被当成失败可重试 | 缺候选生成冷却及有界政策 | Function/用户作用域预算、冷却、去重、重试许可、UNKNOWN fail-closed |
| A11 | P2 | LocalQualified 被误认为正式 Promoted，Server 收到候选即自动全量发布 | 没有稳定区分资格/晋升/激活 | 独立 Candidate、Local Qualification、Server Qualification、Promotion、AOT、Activation 状态 |
| A12 | P2 | “模型调用量下降 80%”却增加对未知播放器的误判 | 单一成本指标驱动学习 | 必须按目标范围比较错误接受、正确率、回退、泛化、成本及权限风险；关键负例不能被平均 |

## 3. 自对抗反例细化与直接修复准则

### 3.1 自验证循环（A01）

反例：模型从网页构造虚假配置对象，生成规则后又基于同一网页文本判定该规则正确。若 `verification.status=PASS` 仅是模型消息，则 Error 能连续穿过 Trace→Experience→LocalQualified→Meta Promotion。

**必须修复**：验证结果是绑定 `validatorId/version/digest` 的真实观察、独立测试或外部受信任事实。LLM 可以建议验证用例，但不能自颁独立 PASS。只有可信受约束验证证据才能生成 VERIFIED_EXPERIENCE。

### 3.2 AOT Slot 的“规则数据”逃逸（A02）

反例：LLM 生成 `eval()`、任意正则、递归表达式、自由 SQL，虽然外观是 Rule JSON，却能实现任意代码/拒绝服务。

**必须修复**：明确定义解释器语义和允许的 AST、拒绝任意外部 I/O、无界执行与未知扩展；强制资源上限、数据摘要、validator 版本绑定、限定权限、可回滚、跨 Task 版本 pin。局部规则只能改变原 Function 范围内的处理数据，不能新增 Effect 权限。

### 3.3 “缓存成功 = 当前成功”及物理副作用（A03）

反例：shun-assistant 历史执行了一次软件安装，缓存的 SUCCESS 被用于新 Case；或 xDownload 的恢复认为旧 HTTP 请求必定没发生，重放产生额外下载/副作用。

**必须修复**：对含外部事实/Effect 的 Function，优先 METHOD_REUSE 并重新核验当前事实；受 KDP/Business Authority 管理真实调用、同意、幂等、UNKNOWN 恢复。缓存绝不是权限票据、执行证明或当前状态权威。

### 3.4 样本独立性和验证泄漏（A04/A05）

反例：多个局部缓存 Hit、同一浏览器 HTML 的复制、同一设备刷不同 ID 被当作独立案例；LLM 见过所有测试样本，最终“泛化”只是在背诵。

**必须修复**：以来源 cohort 分组，不仅按哈希去重；Holdout 数据不可参与生成 Prompt、相似案例选择或规则修复迭代；重用已有 Holdout 多轮修改后须创建新保留集/记为训练暴露。

### 3.5 演化错误目标和数据污染（A06/A07/A08）

反例：将用户原创文本需求变为固定答复、把恶意网页指令当作进化政策、跨用户采集机密信息扩大训练集。

**必须修复**：按适用的 Function 模式选择进化目标；Policy 由 AOT/Domain 掌握；Experience 的来源与隐私边界是第一等字段。无法证明合法共享时本地保留，不阻塞正常离线运行。

### 3.6 版本与作用域漂移（A09）

反例：验证的是 `parser@X`、知识基线 `K1`，新 Task 的 `parser@Y`、知识 `K2` 已不再满足原规则；规则同时替换了正在执行的任务快照。

**必须修复**：记录 Function/implementation/interpreter/validator/knowledge/Package/Target 精确身份；Experience match 和 Slot admission 先检查版本/失效规则；局部激活只对新的 Task epoch 生效，旧任务保持 pin；撤销后不能返回未验证旧版本。

### 3.7 生成成本与晋升误判（A10/A11/A12）

反例：每个 Cache Hit 触发新的模型生成；短时间内重复自修复直至成本耗尽；Server 将本地成功直接记为全域可用；模型调用减少但错误接受率升高。

**必须修复**：进化触发是 Domain-defined 的收益/多样性/独立验证/风险综合判断，配合预算、冷却、去重；LocalQualified 与 Promoted 及 Activated 绝不等同；新版本必须通过跨 Context 回归和真实 Consumer 验证。

## 4. 产品层整改与状态

R2 修订对 A01–A12 给出**设计处置和可执行的负面验收建议**；未完成机器 Schema、Node24、两 Domain 演示或外部独立审核。因此状态是 `DESIGN_MITIGATION_DOCUMENTED`，**不是 `CLOSED_BY_VERIFICATION`**。所有 P0 在 L2 Freeze 前必须有真实可执行反例/门禁证明。

### 仍有开放决策

- 现有 KDP/SDK 是否具备安全的动态声明式规则 Slot、Task 级原子激活/撤销接口：`OPEN`；若没有，局部 Slot 应延迟为**候选持久化+Shadow**，不能声称生产可用。
- 跨租户来源独立性去重、Experience 可移除性与审计摘要的冲突：`OPEN`，由实际部署的隐私/数据权限评估。
- 各 Domain 可验证 oracle 和风险阈值：`OPEN`；不能靠 DIS 写一个万能分数完成裁定。
- 当前 `dh.llm.generate/1` 与新版 Harness/Element Contract 的真实 ABI/Provider 兼容：`OPEN`。
- 独立 Reviewer/Verifier 不应被本次“自对抗审核”替代；必须绑定未来 Exact HEAD/TREE/BASE + 实际测试。

## 5. 结论

批准方向应是：**AOT 声明允许的未知处理和进化边界；可信执行记录转化为具备独立验证与复用边界的 Experience；程序发掘模式，LLM 生成受限 Candidate，独立测试决定资格；App 仅在声明式规则 Slot 合法时局部使用，Server 才能正式泛化并经 AOT 更新 Element/Package。**

不同 Function 可以有不同进化目标；原创生成任务不应因重复 Prompt 被错误固化为静态输出。不存在“缓存命中阈值自动发新 Function”的通用规则。
