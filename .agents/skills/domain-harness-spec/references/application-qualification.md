# 需求驱动的 Domain App 架构资格实践

> 非规范性、供 LLM 生成与审查时按需读取。权威规范仍是 [core](../../../../docs/specs/domain-harness/core.md)、[TS Profile](../../../../docs/specs/domain-harness/typescript-profile.md)、[Element/Package](../../../../docs/specs/domain-harness/element-package.md)、[生命周期/Workflow](../../../../docs/specs/domain-harness/lifecycle-workflow.md)、[静态组合](../../../../docs/specs/domain-harness/composition-trust.md)、[工程质量](../../../../docs/specs/domain-harness/engineering-quality.md)。冲突时以当前权威规范及任务需求为准。此文总结已发生的验证，不授予新 Runtime、功能或交付资格。

## 0. 来源、适用范围与使用方式

来源：0.11.2 #1720 / PR #1721，R68 6P1/4P2、R70 剩余2P1/1P2、R72 ACCEPT_SCOPED (0/0/0)、R73 合并。两领域为数字媒体档案与维修工序排程。原 SDK 未修改。实际验证基线为 Linux 留存依赖，Node22.16.0，Sharp/libvips、FFmpeg/ffprobe、SciPy MILP、SQLite、独立 HTTP Host；不是所有工具、知识类别或平台的通用证明。按任务读相应章节，不强制机械复现本例的阈值、领域模型、进程管理算法或测试数量。

## 1. 需求驱动设计与缺陷归因（QUAL-01）

**适用**：新领域、复杂应用、版本架构资格、已有抽象的演进。
- 先独立分析真实业务目标、输入输出、领域约束、异常、资源、权限与维护变化。冻结业务验收 Oracle，明确权威来源与自定义政策；选择能自然覆盖不同能力的领域，不按 SDK API 倒推需求。
- 再将设计映射到公开 SDK、普通 TS Package/Element/Function，先记录现有 SDK 实现结果，不为避免失败降低需求，也不预先扩展 SDK。
- 对照实际失败、绕行、耦合、重复实现、不可维护的结构。归因到领域知识/业务、共享应用 Element、SDK Standard/Kernel、规范、Skill 或 QA/环境。只有确证 SDK 公共合同不足才提出 SDK 变更；多个用途证明稳定复用价值后才评估 Standard。
- 覆盖矩阵：Q01 Library，Q02 CLI，Q03 Composition，Q04 Knowledge，Q05 Workflow，Q06 Tool/Effect，Q07 Fault/Evolution，Q08 Engineering。按任务适用性选择，明确未覆盖项，不以数量凑覆盖。
**Oracle**：业务冻结在实现之前；正常、临界、错误、真实副作用及后续维护任务均有可观察结果，独立 Reviewer 能构造反例。R68/R70 的真实缺陷均归应用/共享 Element 或工程组织，非 SDK 缺陷。

## 2. Library、CLI 与专业计算的结果合同（QUAL-02）

**适用**：封装第三方库、FFI、外部可执行程序、专业计算服务。
- 一个内聚 Element 可以直接组合普通库、原生 Node API、其它 Element 或外部进程。无需强制每个 helper 都是 Element，不增加多语言 DH Runtime。异语言工具通过进程/FFI/网络边界；实际 TS App 执行闭包仍遵循 CORE-11。
- 输入验证与输出验证分开。不要仅凭扩展名、元数据、退出码0、返回 JSON 或工具自称成功证明结果正确。对源输入、输出完整性、业务约束、适用范围及必要的质量/最优性分别核对。
- 真实库调用验证初始化、资源、参数、结果和错误；真实 CLI 验证 argv、输入输出、文件、退出码、超限/超时、路径和清理。固定可执行路径/参数合同，避免无谓 shell 插值；按需要定义 stdin、输出限额及工具版本。不能用 mock 的成功替代实际计算证据。
**真实反例**：MOV 改名 MP4 仍被共享 demuxer 格式名接受；65% 截断 MP4 探测成功且普通转换 exit0，但访问件缩短至0.5s。修正为明确容器准入、严格源解码/转换、严格输出检查。正常640×478 MP4 缩放后出现 SAR 240:239，被自身检查拒绝；修正为声明支持的方形像素输出及合理取整。源视频轨1s/音轨11s/容器11s不能用视频轨时长偷换完整媒体10s准入。此处媒体细节是本领域政策，不是其它媒体系统的通用规则。
**证据**：R68-P1-01、R70-P1-01；media-archive/media.ts、archive.ts、verify.ts；R71/R72。Library 正例为实际 Sharp 解码、生成、再次解码，不能扩张为所有 native library/平台均合格。

## 3. CLI 生命周期、错误和资源边界（QUAL-03）

**适用**：进程型 Tool、外部计算、有状态 Library/连接。
- 明确所有权、信任前提、平台、直接进程与后代、管道及临时资源。覆盖启动失败、非零、signal、超时、输出超限、正常退出、并发/重复使用；有界结算与实际释放分别取证。
- 反例1：只 kill 直接进程并等待 close，后代持有管道，150ms 超时实际等待约1496ms；修正 Linux 同组终止、关闭 pipe、有界 reap。
- 反例2：非零退出直接 finish 清 timer，stdio ignore 的同组后代仍写 marker。修正所有出口清理，正常成功同样处理前台工具的后台子进程；仅在持有组身份的有效时点 signal，不延迟重复向已回收 PID 发信号。区分清理失败/未 reap 与成功，不宣称通用进程沙箱。
- 反例验证用真实子进程、直接 PID 退出、迟到 marker 不存在、实际 elapsed；fixture 必须真的制造目标故障。R72 独立执行6个 Linux case；不等于所有后代逐个 wait/reap、escaped group、PID reuse 竞态或 Windows 资格。
- 预期业务异常由 Element 处理，保留安全稳定 code 与业务 stage，不打印原始 stderr、秘密或路径。普通 invoke 只适合普通值/通用兜底；已是 WorkflowOutcome 用 invokeOutcome 或 leaf。测试具体 status/reason 及无泄漏，不能只断言非 COMPLETE。真实截断源 SOURCE_DECODE: CLI_EXIT_183；真实转换失败 MEDIA_CONVERSION: CLI_EXIT_7（退出码依实际工具而定）。
**证据**：R68-P1-05/P2-01、R70-P1-02/P2-01；shared/cli.ts 与 media-archive/verify.ts；R71/R72。CORE-10、LIFE-06/13、QA-06；不把应用进程监管和领域诊断强制移入 SDK。

## 4. Knowledge、约束与独立 Oracle（QUAL-04）

**适用**：事实、分类、规则、图关系、推导、过程、计算、约束、优化与版本化知识。
- 表达业务含义，不只表达通用技术模型。区分缺失/未知事实与明确矛盾，检查 scope、来源、政策修订及适用域。显式检查必须存在的实体、阶段和依赖，不以图无环或数学可解代替业务合法。
- 排程反例：原任务只含 id/machine/duration/after，合法拓扑并不保证每订单检查→维修→质检；删除必要边仍可求解。修正为明确 order/stage、阶段映射、必需前序及停机政策合法域，测试缺必要边、未知阶段、非法政策、重复、环与输入排列。
- 独立 Oracle 不依赖被测结果自报。重新核对求解返回的完整工序、资源冲突、前序、时间窗及目标值；求解器证明不可行、超时、未证最优、非法回包不能混为同一结论。最优声明依可信求解器合同与验证范围；小规模用独立算法对照，不能宣称所有输入都已独立证明最优。
- 实际例：SciPy MILP 与独立 TS 穷举分别得到7/10时段；独立审核以 Python 笛卡尔穷举核验；停机导致不可行的样本单独验证。Graph 首道工序下游影响不代表全部政策影响。政策修订后重算且原冻结输入不变。
**证据**：R68-P1-03/P2-02、R70 CLOSED_SCOPED；workshop/plan.ts、solver.py、verify.ts。只在确有领域知识义务时应用，不硬造 Knowledge 类别、强制某种优化器或修改通用 Graph。

## 5. Workflow 组合、全业务预算与状态（QUAL-05）

**适用**：多级子 Workflow、并行分支、条件路由、外部副作用、固定或动态阶段预算。
- 按自然业务划分 Class、Function、子流程；共享同一逻辑请求的根预算，不通过重建根绕过；明确先后/并行/汇聚和失败保留。普通函数不强制包装 Outcome，已有 WorkflowOutcome 则避免被 invoke 包成外层 COMPLETE。
- SDK 逐次 reserve，不会预测未来调用。若固定业务合同规定总体额度不足就不得启动 solver/产生副作用，业务在入口前置检查完整最小额度，或采用能证明阶段边界的业务预留策略；不是要求 SDK 自动分析未来 Workflow。
- 真实反例：排程所需4 calls/8 steps/depth2，仅给3calls或7steps时，逐次预算能让 solver 启动，最后校验失败。修正业务前置检查；断言 solver.calls 无增量；等额正例仍成功。媒体19/24/2仅为本实现预算，不可复制成其他业务默认值。
- 失败不能因外层流程结束而变 COMPLETE；不可行、ASK、WAIT、UNKNOWN 与技术 FAILED 根据业务合同区分；不将 ASK/WAIT 宣称为持久恢复。并行/嵌套需真实执行并核对预算、输出及副作用。
**证据**：R68-P1-04、R70 CLOSED_SCOPED；workshop/plan.ts、verify.ts；LIFE-09/12/13。不要为一个固定业务需求增加全局预算预测器或第二 Executor。

## 6. Tool、授权、真实持久状态和失败隔离（QUAL-06）

**适用**：实际外部动作、文件发布、数据库、授权及结果确认。
- 确认业务授权绑定实际操作的范围/内容/必要版本与摘要；验证未批准或越权无可见效果。实际独立 Host 执行副作用，不仅 mock HTTP。
- 独立只读 readback 应读取已持久化记录并核对归属、标识、内容与关系；重复 POST 或仍须拥有写批准的请求不是独立读回。跨 scope 拒绝、同内容两个合法租户隔离、重开/删除 staging 后读回为独立 Oracle。
- 反例：只返回哈希而提前删除真实访问件；批准漏绑 derivative；先复制第一文件、第二文件失败可能留下未登记文件。修正明确 staging 所有权、绑定内容，使用独占暂存成对核验后发布，验证预期失败不产生可见记录/半对文件，不删除其他所有者资源。
- DB 与文件系统不因此成为原子事务，明确允许的残留、UNKNOWN 与可恢复路径；丢失 ACK 不凭猜测确认成功或重复副作用。例子是可信单 Owner/loopback 范围，不冒充生产多租户鉴权、分布式 ACID、全崩溃恢复或全局 exactly-once。
**证据**：R67B/R68-P1-02、R70 CLOSED_SCOPED；media-archive/catalog.ts、host.ts、client.ts、verify.ts。属于业务和资源所有者职责，不新增 KDP 鉴权/Journal。

## 7. Package 组织、真实复用与工程演进（QUAL-07）

**适用**：多模块/多领域、第三方依赖、共享 Element、替换工具或知识修订。
- Package 是静态 ESM 模块集合。一个内聚组合 Class 本身可以是 Element；普通函数或私有 helper 无须 Class 化。优先已有 Standard，若不足再自定义；两个真实用途后抽取共享应用 Element，尚无证据不要升级 SDK Standard。
- 反例：两个领域虽然只共享 CLI 源模块，但唯一 npm manifest 和 verify 强制维修安装 Sharp、启动媒体工具。修正为独立 manifest/tsconfig、shared ESM 边界、根可选聚合。初次拆分共享模块被解释为 CJS，补 ESM 声明后严格 TS 和实际运行通过。
- 验证直接依赖、独立消费闭包和工具路径，不仅 grep import；在无无关依赖、无环境隐式提升的环境实测。R69/R71 维修独立目录、无 Sharp，PATH 无媒体工具仍通过，非新 npm clean install。
- 演进任务针对真实变更（领域政策/设备/工具接口/知识修订），比较是否影响无关模块，回归原冻结需求和旧数据。不因一个示例的抽象位置合适就认为所有应用同样合适。
**证据**：R68-P1-06、R70 CLOSED_SCOPED；两个领域 manifest、shared/cli.ts、R69/R71 真实隔离收据；EL-01/06/08、GEN-03/04、TS-03/06。

## 8. 证据、反例和审查输出（QUAL-08）

**适用**：任何生成、修改、交付或独立复审任务。
- 根据任务选择正常、异常、临界（恰好/差一）、并发、权限、隔离、资源、真实副作用、版本修改与独立对照。真实工具优先；Mock 只证明它覆盖的合同。不要把测试标签数等同于独立覆盖数。
- 记录 Exact SHA、实际源码 Blob、工具/环境版本、命令、退出码、原始 stdout/hash、失败尝试及纠正。区分本次实际执行、历史证据复用、作者全量回归、Reviewer 独立切面/完整重放、CI 及未测范围。日志 hash 相同只能证明字节相等，不能单独证明新运行。
- 严格 TS（含声明）和适用 lint/测试按 QA-02 执行；当前环境能做则先做，缺环境如实记录。留存依赖恢复不等于 fresh lock/npm ci；R69 ENOTCACHED、新锁/clean install UNKNOWN、Windows/根 CI NOT_RUN。R72 仅在冻结 Q08 明确允许留存依赖的本任务裁定非单独阻断；不能将该裁定用于取消其他任务的真实安装、跨平台或 CI 门槛。
- 独立审查从需求反证实现，给最小可复现反例、影响、根因、责任位置、P0/P1/P2；逐项关闭及限定复审，不重复无关历史模块。记录 PASS_SCOPED / FAIL / PARTIAL / UNKNOWN / NOT_RUN；只有已证据覆盖且无阻断的问题才能获得限定资格。合并前检查 exact review/head/base，合并后核对实际 Tree；写回 Issue/PR。不为补文档虚称运行代码。
**建议 LLM 输出字段**（按任务裁剪）：
```text
REPO / TASK_ISSUE / PR / EXACT_HEAD / SPEC_FILES_READ
FROZEN_REQUIREMENTS / COVERAGE_ORACLE / IMPLEMENTATION_MAPPING
ACTUAL_RUNS / EVIDENCE_HASHES / AUTHOR_VS_INDEPENDENT
FINDINGS / ROOT_CAUSE_OWNER / P0_P1_P2
UNVERIFIED_SCOPE / RESULT / NEXT_FINITE_ACTION
```

## 9. 原始证据索引（固定版本）

- [冻结任务 #1720](https://github.com/kaicreator-mm/domain-harness/issues/1720)
- [R68 第一轮独立审核](https://github.com/kaicreator-mm/domain-harness/issues/1720#issuecomment-7142394342)
- [R70 增量独立审核](https://github.com/kaicreator-mm/domain-harness/issues/1720#issuecomment-7142835802)
- [R72 最终独立审核](https://github.com/kaicreator-mm/domain-harness/issues/1720#issuecomment-7143284440)
- [R72 正式 PR review](https://github.com/kaicreator-mm/domain-harness/pull/1721#pullrequestreview-6046657689)
- [R73 合并归档](https://github.com/kaicreator-mm/domain-harness/issues/1720#issuecomment-7143329514)
- [R69 修正与证据](https://github.com/kaicreator-mm/domain-harness/blob/5e53be890cb52a3ce10963c56659e9705a362a84/examples/qualification/R69-EVIDENCE.md)
- [R71 修正与证据](https://github.com/kaicreator-mm/domain-harness/blob/5e53be890cb52a3ce10963c56659e9705a362a84/examples/qualification/R71-EVIDENCE.md)
- [已验收示例代码](https://github.com/kaicreator-mm/domain-harness/tree/5e53be890cb52a3ce10963c56659e9705a362a84/examples/qualification)

后续经验更新应保留真实来源、适用条件和未证范围。若经验与权威规范冲突，提出独立规范修正任务而不是在 Skill 中悄悄改变合同；若仅是应用技巧，更新实践参考而不改变 SDK。不要将本例推断为后续交互/LLM/持久执行/进化版本已经实现。
