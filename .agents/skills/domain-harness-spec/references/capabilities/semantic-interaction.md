# 语义交互

API: InteractionElement resolveEvidence invalidateEvidence selectNextDecision prepareCandidates ClarificationElement runInteractiveRecognitionHandling
`InteractionElement.constructor` 接受同步 onPrompt(prompt, interaction)，第二参为实际实例；`InteractionElement#run` 一个逻辑意图、一个根；`InteractionElement#current` 实际 pending；`InteractionElement#submit` 捕获实际合法响应（ACK 非业务成功/授权）；`InteractionElement#cancel` 撤销等待、协作取消；`InteractionScope#root`、`InteractionScope#signal` 借用，`InteractionScope#resolve` 同根逐轮分析、`InteractionScope#step` 同根处理。直接提供通知，若确需包装必须原样 return，禁止吞 Promise，不 await 通知。跨意图、旧 revision、非法响应拒绝。普通 promptSpec 可直接发布。
`resolveEvidence` 组织已取得的来源/当前修订、accepts、同步 equal/rank；complete 非 READY；default/recommendation 非真实用户授权。 `invalidateEvidence` 根据依赖失效，缺少声明保守处理。 `selectNextDecision` 接收域的四态、依赖和优先级，ready 非业务完成。 `prepareCandidates` 复用 BoundedQuery，领域判断资格/投影/来源版本，不完整不推荐，未知非排除。
`ClarificationElement.prepare` 从 B/C/D 与当前模板、`ClarificationField#projectPrefill` 可选同步预填及证据键组织必要字段；不自动确认。仅工厂取得实例，不可 new。status=prompt 时返回 clarify/clarification，不能同时提供 raw prompt。A 独占实际发布、等待、记录与关联；客户端只从 onPrompt/current 取得真实表单。下一次分析用 `InteractionEvent#clarification` 读取实际映射：submit/revise-values→values，其他文本/动作→other；普通响应无映射，绑定消费者遇到缺失应拒绝，不能手工从 raw values 重建配对。显式 E 泛型贯通 resolve、F 与事件。通知失败/取消/预算不足不交付映射；域负责 reducer、修订后的重新取证、当前合法性与实际授权。例：[绑定澄清](../examples/bound-clarification.mts)。
`runInteractiveRecognitionHandling` 同根 resolve→step；0/1/2 轮澄清的最小 2/3、4/5、6/7 calls/steps；复杂业务直接在 scope 明确 checkpoint，不重跑已提交效果。取消不覆盖已进入实际效果结果；保持并读回原 receipt。无全局会话、LLM 或 durable 恢复。例：[实际普通交互](../examples/interaction.mts)。

[完整能力及成员目录](../capabilities.md)。
