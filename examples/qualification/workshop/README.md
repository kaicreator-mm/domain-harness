> R69 current: follow [suite README](../README.md) and [R69 evidence](../R69-EVIDENCE.md); below is historical R67 scope/implementation. R69 corrects R68 findings.

# 小型维修车间工序排程（R67B）
需求来源及冻结：[Issue #1720 R67A](https://github.com/kaicreator-mm/domain-harness/issues/1720#issuecomment-7142166448)。[Google OR-Tools job shop](https://developers.google.com/optimization/scheduling/job_shop) 为工序先后、机器不重叠与 makespan 问题参考；[SciPy milp](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.milp.html) 为求解技术。两个订单、各三道工序、机器容量1与停机政策为合成数据；不是实际维修业务操作指引。
- TS 验证工序必备事实、唯一性、依赖、循环；Graph 计算首道工序的下游影响路径；静态 WorkshopElement 两级子 Workflow，根 calls4/steps8/depth2。
- SolverElement 通过同一个 shared/cli.ts 调实际 Python SciPy MILP（时间索引二元变量 + makespan 整数变量；时间窗、机器互斥、工序先后），仅在求解状态0接受候选最优计划，状态2为求解器判定不可行，其它 UNKNOWN。TS 重新检查每道工序的完整开始时间、所有前序及资源冲突和目标值，不能仅信任 exit0。测试的独立 TS 穷举 oracle 验证两个最优值与不可行。
- 实际基线 makespan7，停机政策v2 makespan10，原冻结数据不变。预算、深度不足与缺事实、重复、循环、缺前序在 solver 之前结束；伪造最优空计划、命令不存在 UNKNOWN。该测试仅对<=6工序、12离散时段的可信受限模型，不声称任意规模求解或求解器安全沙箱；未验证多人员技能、多目标、实际车间数据、长时间取消、生产执行。
