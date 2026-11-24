# T07 · 新领域生成记录与产品验收映射

基线 R60 train 26d83b2d481b6cbc9a1150f0e7f5361e6e1779c0；父任务 #1612，T07 #1718。生成者为本轮 Writer，不冒称独立盲生成/独立 reviewer。生成时实际读取 `.agents/skills/domain-harness-spec/SKILL.md`、`docs/specs/domain-harness/{core,typescript-profile,element-package,composition-trust}.md` 和 SDK 公开 README、根入口导出与 public declarations/TSDoc（Query/SQLite/Vector/Graph/Expression/Workflow）；只使用 SDK 根入口公开 API，Native TS 生成者负责正确性。对已有 T06 只静态复用已接受的业务 Host/Client，不使用其 SDK 私有实现。两份领域材料在生成前查询，采集日期 2026-11-24 UTC，规则 revision 是本示例快照标识而非原站发布版本或签名。

| 来源 | 明确生成的规则 | 适用/限制 |
|---|---|---|
| [International ISBN Agency: What is an ISBN?](https://www.isbn-international.org/content/what-isbn/10) | 13 digits; 978/979 prefix; alternating 1/3 modulo-10 check digit | 仅未加连字符的 13 位字符串，数学检验不证明真实分配、出版/库存。目录价格、尺寸、前版关系和库存是合成测试数据，不能当作真实出版关系。 |
| [USGS Water Science School: Hardness of Water](https://www.usgs.gov/water-science-school/science/hardness-water), Measures of water hardness | 0–60 soft; 61–120 moderately hard; 121–180 hard; 181+ very hard | 单位 mg/L as CaCO3，只接纳非负安全整数，不自行四舍五入小数；不是实际测量或饮水安全。样本、温度、网络关系、日期均为合成数据。 |

ISBN weights/prefix/source 与 hardness bands/source 深层冻结；动态业务数据独立 SQLite。SQL 固定参数化，租户/网络、知识 revision、样本日由业务确定；在 scoped 记录上找近邻/关系；特征尺度是演示明确选定的 pages/100、width(mm)/10 或 hardness/10、temperature(C)，不是科学相似度或出版身份的推理；关系故意含合成环以验证 bounded traversal，结果不能作为真实事实。Expression 分别计算真实计划数量×单价、整数硬度的区间判定。根预算 calls2/steps5/depth1 分别适用于每个独立读请求。确认后由可信 owner/调用者按新逻辑命令调用既有 T06；不是在同一逻辑根内创建另一满额度 Session，不假定两个库分布式事务。

| DI-L1 | 新组合验收 / 当前 CI 必须保留的前序验证 |
|---|---|
| 01 | 新领域不可变 source/weights/band 修改尝试；动态价格改动不改变规则。旧/新知识版本并存由 T05 intentCases 同一新 HEAD consumer 保留。 |
| 02 | 四个并发计划/分类，两个 tenant、两个 network 的输出与实际计数隔离；真实目录和权威 DB。 |
| 03 | 两领域 direct lookup + Workflow；错误修订/日期、限额、重复目录/样本 UNKNOWN，ISBN 校验拒绝。 |
| 04 | 实际文件关闭重开、参数化查询、更新回滚/提交；T02 SQLite lifecycle/CAS 与 T06 权威争用继续执行。 |
| 05 | 两领域实际使用 Vector/Graph/Expression，foreign nearest 排除、有向关系环及两跳、两种业务表达式；T03/T04 原维度/限额/非法输入/资源失败正反例继续执行。 |
| 06 | 两新领域同根 budget，拒绝后 Handling 计数零、Host effect0；真实 T06 无预算提交继续验证。 |
| 07 | 完整/ASK/REJECT/UNKNOWN/FAILED 组合断言，实际 source revision；T05 WAIT 与真实异常及六态传播保留。 |
| 08–10 | 组合计划绑定真实资源/数量，未确认 ASK、批准后 stock5→3/version1/effects1、RECOVER 同一 Receipt；T06 现有八组真实 Host 包括预授权、PER_CALL/SESSION、CAS、丢 ACK、权限和跨账本恢复继续执行。 |
| 11 | 本轮两份新领域源代码，外部 clean pack/strict TS/ESM、单 SDK 直接依赖、静态 public root。独立陌生作者生成能力与 Node22.12 Windows/Linux 执行需单列真实证据，不由本 Writer 代签。 |
| 12 | 当前 exact-head CI、原有与组合正反例、真实产物 SHA256/实际平台 runtime 输出、独立审核；此前仅冻结合同和模块验收被复用，不冒称当前 HEAD PASS。 |

本文件是 Oracle 与证据路径，不是自动 PASS。最终 R61 作者运行、后续有限双平台实际收据、独立陌生材料生成/源码复审、正式 R60+ 集成收尾由 GitHub Task #1718 记录。
