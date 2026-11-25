# 语义交互

API: InteractionElement resolveEvidence invalidateEvidence selectNextDecision prepareCandidates ClarificationElement runInteractiveRecognitionHandling
`InteractionElement.constructor` 接受同步 onPrompt(prompt, interaction)，第二参为实际实例；`InteractionElement#run` 一个逻辑意图、一个根；`InteractionElement#current` 实际 pending；`InteractionElement#submit` 捕获实际合法响应（ACK 非业务成功/授权）；`InteractionElement#cancel` 撤销等待、协作取消；`InteractionScope#root`、`InteractionScope#signal` 借用，`InteractionScope#resolve` 同根逐轮分析、`InteractionScope#step` 同根处理。直接提供通知，若确需包装必须原样 return，禁止吞 Promise，不 await 通知。跨意图、旧 revision、非法响应拒绝。普通 promptSpec 可直接发布。
`resolveEvidence` 组织已取得的来源/当前修订、accepts、同步 equal/rank；complete 非 READY；default/recommendation 非真实用户授权。 `invalidateEvidence` 根据依赖失效，缺少声明保守处理。 `selectNextDecision` 接收域的四态、依赖和优先级，ready 非业务完成。 `prepareCandidates` 复用 BoundedQuery，领域判断资格/投影/来源版本，不完整不推荐，未知非排除。
`ClarificationElement.prepare` 从 B/C/D 与当前模板、`ClarificationField#projectPrefill` 可选同步预填及证据键组织必要字段；不自动确认。仅工厂取得实例，不可 new。status=prompt 时返回 clarify/clarification，不能同时提供 raw prompt。A 独占实际发布、等待、记录与关联；客户端只从 onPrompt/current 取得真实表单。下一次分析用 `InteractionEvent#clarification` 读取实际映射：submit/revise-values→values，revise-text/text/no-fit→other；普通响应无映射，绑定消费者遇到缺失应拒绝，不能手工从 raw values 重建配对。显式 E 泛型贯通 resolve、F 与事件。reject/cancel 终止识别，通知失败或下一分析预算不足亦不交付映射；这些路径均不调用下一次领域 decide 或进入后续 Handling；域负责 reducer、修订后的重新取证、当前合法性与实际授权。例：[绑定澄清](../examples/bound-clarification.mts)。
`runInteractiveRecognitionHandling` 同根 resolve→step；0/1/2 轮澄清的最小 2/3、4/5、6/7 calls/steps；复杂业务直接在 scope 明确 checkpoint，不重跑已提交效果。取消不覆盖已进入实际效果结果；保持并读回原 receipt。无全局会话、LLM 或 durable 恢复。例：[实际普通交互](../examples/interaction.mts)。

## 从证据到合法操作

- authority、user、derived、default 是可显式接受的来源，并非默认有固定优先级；来源类别、可信 source id/revision 和 scope 由业务确定，不能信任客户端自签。只有 scope、当前 source revision、有效区间 [from,until) 匹配的证据才适用；有有效区间却没有 asOf 则不适用。
- recommendation 永远只是 proposal；default 只有被对应 requirement 的 accepts 明确允许时才可确定值，仍保留来源。不得用默认或推荐替代必须的用户表达或真实授权。未指定 rank 时同级；同级冲突、unknown、不适用、missing 都不是已知事实。
- equal 必须是同步等价比较并返回 boolean；可选 rank 必须同步且返回有限数值。声明 async 的策略不启动，意外真实 Promise 的拒绝被观察而非等待；非法返回或异常导致 complete=false/POLICY_FAILED，不消费部分结果。complete=true 仅代表输入遍历完整，外部事实的真实性、覆盖、当前性仍由域负责。
- 先辨别 transport ACK、记录有效性、值确认、领域意图确定和真实授权。ACK 不是领域成功，合法 no-fit/text/revise 不授予权限，终止动作不交付域映射。实际 Effect 之前独立验证权限与当前条件。

例：[查询及证据边界](../examples/query-evidence-boundaries.mts)；[宿主响应适配](../examples/host-response-boundary.mts)。

## 宿主适配与身份边界

宿主需先区分完整 wire response 与不含身份的本地动作输入。完整 wire response 保留实际 intentId/revision/decisionKey，交给 SDK 检查；不能重绑定到当前 prompt 来“修复”旧响应。裸动作输入仅绑定**该动作实际针对的已发布表单**，拒绝混入 identity、未知字段和非法 action 形状，显式构造 action-specific 数据。禁止 `{...identity,...command}` 或任意对象展开覆盖选定身份；构造时保留选定身份，不重新取 current 后替换旧表单。不同来源、会话或主体的认证、原始网络输入长度和领域授权仍由宿主及域负责。SDK 不能判断调用者是否在提交前人为换掉身份，也不需要新增通用宿主运行机制。

[完整能力及成员目录](../capabilities.md)。
